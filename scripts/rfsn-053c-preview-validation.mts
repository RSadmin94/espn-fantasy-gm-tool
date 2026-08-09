/**
 * RFSN-053C — Preview founder validation: Historical Matchup Gallery.
 * ESPN 457622 only. Defaults to Preview. Does not touch Production.
 *
 *   npx tsx scripts/rfsn-053c-preview-validation.mts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const PREVIEW_HOST =
  process.env.RFSN_053C_HOST?.trim() || "sprint-8-preview.fantasyfootballrivals.com";
const BASE = `https://${PREVIEW_HOST}`;
const ESPN_LEAGUE = "457622";
const LABEL = /www\.fantasyfootballrivals\.com/i.test(PREVIEW_HOST) ? "production" : "preview";
const OUT_DIR = path.resolve("audit-artifacts/rfsn-053");
const OUT_MD = path.join(OUT_DIR, `RFSN-053C-${LABEL}-validation.md`);
const OUT_JSON = path.join(OUT_DIR, `RFSN-053C-${LABEL}-validation.json`);
const SHOT_DIR = path.join(OUT_DIR, `screenshots-053c-${LABEL}`);
const VIEWPORTS = [
  { name: "1920", width: 1920, height: 1080 },
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;

type GalleryRow = {
  matchupId: number;
  season: number;
  week: number;
  phase: string;
  isChampionshipGame?: boolean;
  homeDisplayName?: string;
  awayDisplayName?: string;
  homeScore?: number;
  awayScore?: number;
  margin?: number;
  viewerHref?: string;
};

type GalleryPayload = {
  matchups?: GalleryRow[];
  total?: number;
  empty?: boolean;
  emptyReason?: string | null;
  summary?: string;
  coverage?: { seasonFrom?: number | null; seasonTo?: number | null; recordedGames?: number };
};

type Probe = {
  name: string;
  filter: Record<string, unknown>;
  verdict: "PASS" | "FAIL";
  failures: string[];
  total?: number;
  emptyReason?: string | null;
  sample?: string;
};

async function mintUrl(base: string): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error("CLERK_SECRET_KEY required");
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: process.env.SMOKE_CLERK_USER_ID ?? "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo",
      expires_in_seconds: 300,
    }),
  });
  if (!res.ok) throw new Error(`Clerk mint failed ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { url?: string; token?: string };
  let token = data.token;
  if (!token && data.url) {
    try {
      token = new URL(data.url).searchParams.get("__clerk_ticket") ?? undefined;
    } catch {
      token = undefined;
    }
  }
  if (!token) throw new Error("Clerk mint missing ticket token");
  return `${base}/sign-in?__clerk_ticket=${encodeURIComponent(token)}`;
}

function unwrap(data: unknown): unknown {
  if (data && typeof data === "object" && "result" in data) {
    const r = (data as { result?: { data?: { json?: unknown } } }).result?.data;
    return r && typeof r === "object" && "json" in r ? (r as { json: unknown }).json : r;
  }
  return data;
}

async function trpcGet(page: { evaluate: Function }, path: string, input: unknown) {
  return page.evaluate(
    async ({ path, input }: { path: string; input: unknown }) => {
      const res = await fetch(`/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, {
        credentials: "include",
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { path, input },
  );
}

async function trpcMutate(page: { evaluate: Function }, path: string, input: unknown) {
  return page.evaluate(
    async ({ path, input }: { path: string; input: unknown }) => {
      const res = await fetch(`/api/trpc/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { path, input },
  );
}

function names(row: GalleryRow): string {
  return `${row.homeDisplayName ?? "?"} vs ${row.awayDisplayName ?? "?"} ${row.season} W${row.week} (${row.homeScore}-${row.awayScore}, m${row.margin})`;
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null) as
    | { buildTime?: string; gitSha?: string }
    | null;

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const probes: Probe[] = [];
  try {
    await page.goto(await mintUrl(BASE), { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(2500);
    const leaguesRes = await trpcGet(page, "league.getMyLeagues", null);
    const leagues = (unwrap(leaguesRes.body) as Array<{ leagueId?: string; provider?: string; id?: number }>) ?? [];
    const aff = leagues.find((l) => String(l.leagueId) === ESPN_LEAGUE);
    if (!aff?.id) throw new Error(`ESPN ${ESPN_LEAGUE} not in founder leagues`);
    await trpcMutate(page, "league.setActive", { id: aff.id });
    await page.waitForTimeout(800);

    const run = async (name: string, filter: Record<string, unknown>, assert: (g: GalleryPayload) => string[]) => {
      const res = await trpcGet(page, "matchupGallery.query", filter);
      const g = (unwrap(res.body) as GalleryPayload) ?? {};
      const failures = res.status !== 200 ? [`http ${res.status}`] : assert(g);
      probes.push({
        name,
        filter,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        total: g.total,
        emptyReason: g.emptyReason ?? null,
        sample: g.matchups?.[0] ? names(g.matchups[0]) : g.summary,
      });
      return g;
    };

    await run("default gallery", { phase: "all", limit: 25 }, (g) => {
      const f: string[] = [];
      if (!g.total || g.total < 10) f.push(`too few games (${g.total})`);
      if (g.empty) f.push(`empty ${g.emptyReason}`);
      if (!g.coverage?.seasonFrom || !g.coverage.seasonTo) f.push("missing coverage years");
      return f;
    });

    await run("owner Rod", { ownerName: "Rod", phase: "all", limit: 40 }, (g) => {
      const f: string[] = [];
      if (!g.total || g.total < 5) f.push(`too few Rod games (${g.total})`);
      if (g.emptyReason === "unresolved_owner") f.push("unresolved_owner");
      return f;
    });

    const rodBruce = await run(
      "Rod vs Bruce",
      { ownerName: "Rod", opponentName: "Bruce", phase: "all", limit: 80 },
      (g) => {
        const f: string[] = [];
        if (!g.total || g.total < 1) f.push("no Rod vs Bruce meetings");
        if (g.emptyReason === "unresolved_opponent") f.push("unresolved_opponent");
        return f;
      },
    );

    await run("season 2014", { seasonFrom: 2014, seasonTo: 2014, phase: "all", limit: 40 }, (g) => {
      const f: string[] = [];
      if (!g.total || g.total < 1) f.push("no 2014 games");
      if (g.matchups?.some((m) => m.season !== 2014)) f.push("non-2014 row leaked");
      return f;
    });

    await run(
      "No Mercy",
      { ownerName: "Rod", marginMin: 50, result: "win", noMercy: true, phase: "all", limit: 40 },
      (g) => {
        const f: string[] = [];
        if (!g.total || g.total < 1) f.push("no No Mercy wins");
        if (g.matchups?.some((m) => (m.margin ?? 0) < 50 - 1e-9)) f.push("margin < 50 leaked");
        return f;
      },
    );

    await run("one-point", { onePoint: true, phase: "all", limit: 40 }, (g) => {
      const f: string[] = [];
      if (!g.total || g.total < 1) f.push("no one-point games");
      if (g.matchups?.some((m) => (m.margin ?? 0) > 1.49 + 1e-9)) f.push("margin outside one-point band");
      return f;
    });

    await run("closest", { sort: "closest", phase: "all", limit: 20 }, (g) => {
      const f: string[] = [];
      if (!g.matchups || g.matchups.length < 2) f.push("need 2+ closest games");
      const margins = (g.matchups ?? []).map((m) => m.margin ?? 99);
      for (let i = 1; i < margins.length; i++) {
        if (margins[i]! + 1e-9 < margins[i - 1]!) f.push("closest sort not non-decreasing");
        break;
      }
      return f;
    });

    await run("championship", { championshipGames: true, limit: 40 }, (g) => {
      const f: string[] = [];
      if (g.emptyReason === "insufficient_playoff_tier") return f;
      if (!g.total || g.total < 1) f.push("no championship games and not insufficient_playoff_tier");
      if (g.matchups?.some((m) => m.isChampionshipGame !== true)) f.push("non-championship row leaked");
      return f;
    });

    await run("playoffs", { phase: "playoffs", limit: 40 }, (g) => {
      const f: string[] = [];
      if (!g.total || g.total < 1) f.push("no playoff games");
      if (g.matchups?.some((m) => m.phase !== "playoffs")) f.push("regular-season row in playoff filter");
      return f;
    });

    await run("blowouts sort", { sort: "margin_desc", limit: 10 }, (g) => {
      const f: string[] = [];
      const margins = (g.matchups ?? []).map((m) => m.margin ?? 0);
      for (let i = 1; i < margins.length; i++) {
        if (margins[i]! > margins[i - 1]! + 1e-9) f.push("margin_desc not sorted");
        break;
      }
      return f;
    });

    await run("unresolved owner empty", { ownerName: "Nobody McFake", phase: "all" }, (g) => {
      const f: string[] = [];
      if (g.emptyReason !== "unresolved_owner") f.push(`expected unresolved_owner got ${g.emptyReason}`);
      return f;
    });

    const first = rodBruce.matchups?.[0];
    if (first?.matchupId) {
      const viewerRes = await trpcGet(page, "matchupGallery.get", { matchupId: first.matchupId });
      const viewer = unwrap(viewerRes.body) as {
        matchup?: GalleryRow | null;
        home?: { starters?: unknown[]; bench?: unknown[]; roster?: unknown[] } | null;
        away?: { starters?: unknown[]; bench?: unknown[]; roster?: unknown[] } | null;
        lineupNote?: string | null;
      };
      const failures: string[] = [];
      if (viewerRes.status !== 200) failures.push(`viewer http ${viewerRes.status}`);
      if (!viewer?.matchup) failures.push("viewer missing matchup");
      probes.push({
        name: "viewer get",
        filter: { matchupId: first.matchupId },
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        sample: viewer?.lineupNote || names(viewer?.matchup ?? first),
      });
    }

    const shotRoutes = [
      { key: "matchups", path: "/league/history/matchups" },
      { key: "no-mercy", path: "/league/history/matchups/no-mercy" },
      { key: "one-point", path: "/league/history/matchups?onePoint=1" },
      { key: "closest", path: "/league/history/matchups?sort=closest" },
      { key: "championship", path: "/league/history/matchups?championship=1" },
      { key: "rod-bruce", path: "/league/history/matchups?ownerName=Rod&opponentName=Bruce" },
    ];
    if (first?.matchupId) {
      shotRoutes.push({
        key: "viewer",
        path: `/league/history/matchups/${first.matchupId}?season=${first.season}&week=${first.week}`,
      });
    }

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of shotRoutes) {
        await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForTimeout(1800);
        await page.screenshot({
          path: path.join(SHOT_DIR, `${route.key}__${vp.name}.png`),
          fullPage: true,
        });
      }
    }
  } finally {
    await browser.close();
  }

  const pass = probes.filter((p) => p.verdict === "PASS").length;
  const fail = probes.filter((p) => p.verdict === "FAIL").length;
  const report = {
    host: PREVIEW_HOST,
    league: ESPN_LEAGUE,
    buildTime: health?.buildTime ?? null,
    gitSha: health?.gitSha ?? null,
    pass,
    fail,
    probes,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  const md = [
    `# RFSN-053C ${LABEL} validation`,
    "",
    `- Host: \`${PREVIEW_HOST}\``,
    `- League: ESPN \`${ESPN_LEAGUE}\``,
    `- buildTime: \`${health?.buildTime ?? "unknown"}\``,
    `- Probes: ${pass} PASS / ${fail} FAIL`,
    "",
    "| Probe | Verdict | Total | Notes |",
    "| --- | --- | --- | --- |",
    ...probes.map(
      (p) =>
        `| ${p.name} | **${p.verdict}** | ${p.total ?? "—"} | ${p.failures.join("; ") || p.sample || p.emptyReason || "ok"} |`,
    ),
    "",
    `Screenshots: \`${path.relative(process.cwd(), SHOT_DIR)}\` (1920 / 1440 / 390).`,
    "",
  ].join("\n");
  fs.writeFileSync(OUT_MD, md);
  console.log(md);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
