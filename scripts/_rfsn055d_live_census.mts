/**
 * RFSN-055D live endpoint census — Draft Board (espn.draftPicks) + Draft Grades reach rows.
 *
 *   npx tsx scripts/_rfsn055d_live_census.mts
 *   BASE=https://sprint-8-preview.fantasyfootballrivals.com npx tsx scripts/_rfsn055d_live_census.mts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  draftBoardPickDisplayName,
  draftPickNameIsBlank,
  espnPlayerIdKey,
  isUnassignedDraftPick,
} from "../shared/draftPickIdentity";

const BASE = (process.env.BASE ?? "https://www.fantasyfootballrivals.com").replace(/\/$/, "");
const ESPN = "457622";
const CLERK_USER = "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo";
const OUT_DIR = path.resolve("audit-artifacts/rfsn-055");
const TAG = path.basename(BASE).includes("preview") ? "preview" : "production";

type DraftPick = {
  overallPick: number;
  roundId: number;
  roundPick: number;
  playerId?: number | null;
  playerName: string | null;
  position: string | null;
};

type SeasonCensus = {
  season: number;
  totalPicks: number;
  resolvedIdentity: number;
  unassignedSlots: number;
  unknownHistorical: number;
  resolutionPct: number;
  firstRoundSample: Array<{
    overallPick: number;
    playerId: number | null;
    playerName: string;
    position: string | null;
    displayLabel: string;
  }>;
};

async function mintTicket(page: import("playwright").Page): Promise<void> {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error("CLERK_SECRET_KEY missing");
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: CLERK_USER, expires_in_seconds: 300 }),
  });
  const data = (await res.json()) as { token?: string; url?: string };
  const token = data.token ?? new URL(String(data.url)).searchParams.get("__clerk_ticket");
  if (!token) throw new Error("Clerk ticket mint failed");
  await page.goto(`${BASE}/sign-in?__clerk_ticket=${encodeURIComponent(token)}`);
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 90_000 });
}

async function trpcJson<T>(page: import("playwright").Page, proc: string, input: unknown): Promise<T> {
  return page.evaluate(
    async ({ proc, input }) => {
      const res = await fetch(
        `/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`,
        { credentials: "include" },
      );
      const body = await res.json();
      return body?.result?.data?.json as T;
    },
    { proc, input },
  );
}

function classifyPick(p: DraftPick) {
  const hasName = !draftPickNameIsBlank(p.playerName);
  if (hasName) return "resolved" as const;
  if (isUnassignedDraftPick(p.playerId)) return "unassigned" as const;
  return "unknownHistorical" as const;
}

function censusSeason(season: number, picks: DraftPick[]): SeasonCensus {
  let resolvedIdentity = 0;
  let unassignedSlots = 0;
  let unknownHistorical = 0;
  for (const p of picks) {
    const kind = classifyPick(p);
    if (kind === "resolved") resolvedIdentity += 1;
    else if (kind === "unassigned") unassignedSlots += 1;
    else unknownHistorical += 1;
  }
  const totalPicks = picks.length;
  const resolutionPct =
    totalPicks > 0 ? Math.round((resolvedIdentity / totalPicks) * 1000) / 10 : 100;
  const firstRound = [...picks]
    .filter((p) => p.roundId === 1)
    .sort((a, b) => a.overallPick - b.overallPick)
    .slice(0, 14);
  return {
    season,
    totalPicks,
    resolvedIdentity,
    unassignedSlots,
    unknownHistorical,
    resolutionPct,
    firstRoundSample: firstRound.map((p) => ({
      overallPick: p.overallPick,
      playerId: espnPlayerIdKey(p.playerId) != null ? Number(p.playerId) : null,
      playerName: String(p.playerName ?? ""),
      position: p.position,
      displayLabel: draftBoardPickDisplayName(p),
    })),
  };
}

async function main() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await mintTicket(page);

  const health = await page.evaluate(async () => {
    const res = await fetch("/api/health");
    return res.json();
  });

  const seasons =
    (await trpcJson<number[]>(page, "espn.allSeasons", {}))?.filter(Number.isFinite) ?? [];
  const cached =
    (await trpcJson<number[]>(page, "espn.cachedSeasons", null))?.filter(Number.isFinite) ?? [];
  const probeSeasons = [...new Set([...seasons, ...cached])].sort((a, b) => a - b);

  const board: SeasonCensus[] = [];
  for (const season of probeSeasons) {
    const picks = (await trpcJson<DraftPick[]>(page, "espn.draftPicks", { season })) ?? [];
    if (picks.length === 0) continue;
    board.push(censusSeason(season, picks));
  }

  const defaultSeason = cached.length > 0 ? Math.max(...cached) : board.at(-1)?.season ?? null;
  const defaultBoard = board.find((b) => b.season === defaultSeason) ?? null;

  const eval2026 = await trpcJson<{ owners?: Array<{ ownerName: string; draftNight: { biggestReach: { playerName: string } | null; biggestSteal: { playerName: string } | null } }> }>(
    page,
    "espn.historicalDraftEvaluation",
    { season: 2026 },
  );
  const eval2025 = await trpcJson<{ owners?: Array<{ ownerName: string; draftNight: { biggestReach: { playerName: string } | null } }> }>(
    page,
    "espn.historicalDraftEvaluation",
    { season: 2025 },
  );

  const report = {
    base: BASE,
    tag: TAG,
    buildTime: health?.buildTime ?? null,
    gitSha: health?.gitSha ?? null,
    defaultSeason,
    defaultBoardFirstRound: defaultBoard?.firstRoundSample ?? [],
    board,
    draftGradesSample: {
      2026: {
        ownerCount: eval2026?.owners?.length ?? 0,
        reachNames: (eval2026?.owners ?? [])
          .map((o) => o.draftNight.biggestReach?.playerName)
          .filter(Boolean)
          .slice(0, 5),
        stealNames: (eval2026?.owners ?? [])
          .map((o) => o.draftNight.biggestSteal?.playerName)
          .filter(Boolean)
          .slice(0, 5),
      },
      2025: {
        ownerCount: eval2025?.owners?.length ?? 0,
        reachNames: (eval2025?.owners ?? [])
          .map((o) => o.draftNight.biggestReach?.playerName)
          .filter(Boolean)
          .slice(0, 3),
      },
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, `RFSN-055D-${TAG}-live-census.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ ...report, jsonPath }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
