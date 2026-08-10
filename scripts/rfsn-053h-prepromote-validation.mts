/**
 * RFSN-053H — Pre-promote / Production gates. ESPN 457622.
 *
 *   npx tsx scripts/rfsn-053h-prepromote-validation.mts
 *   $env:RFSN_053H_HOST="www.fantasyfootballrivals.com"; $env:RFSN_053H_LABEL="production"; npx tsx scripts/rfsn-053h-prepromote-validation.mts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  matchupToStoryPackage,
  narrationDoesNotAlterPackageFacts,
  narrationUsesOnlyPackageFacts,
} from "../shared/historicalStoryPackage";
import { narrationCorpus, type HistoricalNarration } from "../shared/historicalNarration";

const PREVIEW_HOST =
  process.env.RFSN_053H_HOST?.trim() || "sprint-8-preview.fantasyfootballrivals.com";
const BASE = `https://${PREVIEW_HOST}`;
const ESPN_LEAGUE = "457622";
const OUT_DIR = path.resolve("audit-artifacts/rfsn-053");
const LABEL = process.env.RFSN_053H_LABEL?.trim() || "prepromote";
const OUT_MD = path.join(OUT_DIR, `RFSN-053H-${LABEL}-validation.md`);
const OUT_JSON = path.join(OUT_DIR, `RFSN-053H-${LABEL}-validation.json`);
const GAP_MS = 8000;
const VOICES = ["historian", "cashier", "coach"] as const;
const DETERMINISTIC_ASKS = [
  "Who has the most championships?",
  "Who reaches the most?",
  "Best career record?",
  "Biggest blowout?",
];

type Probe = { name: string; verdict: "PASS" | "FAIL"; failures: string[]; sample?: string };
type ChatOut = { message?: string; visual?: { type?: string }; tool?: string; llmInvoked?: boolean };

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

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof import("playwright")["chromium"]["launch"]>>["newPage"]>>;

async function trpcGet(page: Page, pathName: string, input: unknown) {
  return page.evaluate(
    async ({ pathName, input }) => {
      const res = await fetch(`/api/trpc/${pathName}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, {
        credentials: "include",
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { pathName, input },
  );
}

async function trpcMutate(page: Page, pathName: string, input: unknown) {
  return page.evaluate(
    async ({ pathName, input }) => {
      const res = await fetch(`/api/trpc/${pathName}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { pathName, input },
  );
}

async function advisorChat(page: Page, leagueId: string, message: string): Promise<ChatOut> {
  return page.evaluate(
    async ({ leagueId, message }) => {
      const res = await fetch(`/api/trpc/advisor.chat`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { message, activeLeagueKey: leagueId } }),
      });
      const body = await res.json();
      return (body?.result?.data?.json ?? body?.result?.data ?? body) as ChatOut;
    },
    { leagueId, message },
  );
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY?.trim()) throw new Error("CLERK_SECRET_KEY required");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const probes: Probe[] = [];
  let health: Record<string, unknown> | null = null;

  const push = (row: Probe) => {
    probes.push(row);
    console.log(`${row.verdict} | ${row.name}${row.sample ? `\n  ${row.sample}` : ""}${row.failures.length ? `\n  !! ${row.failures.join("; ")}` : ""}`);
  };

  try {
    await page.goto(await mintUrl(BASE), { waitUntil: "domcontentloaded", timeout: 90_000 });
    const expectedHost = new URL(BASE).hostname;
    await page.waitForURL((url) => url.hostname === expectedHost && !url.pathname.includes("sign-in"), { timeout: 90_000 });
    await page.waitForTimeout(2000);
    health = (await page.evaluate(async () => (await fetch("/api/health", { credentials: "include" })).json())) as Record<
      string,
      unknown
    >;
    console.log(`host=${new URL(page.url()).hostname} health buildTime=${String(health?.buildTime ?? "?")}`);

    type LiveLeague = { id: number; provider: string; leagueId: string; selectedOwnerName?: string | null };
    const connections = unwrap((await trpcGet(page, "league.getMyLeagues", null)).body) as LiveLeague[];
    const espn = (connections ?? []).find((l) => l.provider === "espn" && l.leagueId === ESPN_LEAGUE);
    if (!espn) throw new Error("ESPN 457622 not connected on Preview founder account");
    const ownerName = espn.selectedOwnerName?.trim() || "Rod Sellers";
    await trpcMutate(page, "league.setActive", { leagueConnectionId: espn.id });
    await page.waitForTimeout(800);

    const gallery = unwrap(
      (
        await trpcGet(page, "matchupGallery.query", {
          activeLeagueKey: ESPN_LEAGUE,
          ownerName,
          noMercy: true,
          result: "win",
          limit: 5,
        })
      ).body,
    ) as { matchups?: Array<Record<string, unknown>>; coverage?: { seasonFrom?: number | null; seasonTo?: number | null }; summary?: string };
    const game = (gallery?.matchups ?? [])[0] as
      | {
          matchupId: number;
          season: number;
          week: number;
          phase: "regular" | "playoffs";
          isChampionshipGame?: boolean;
          homeDisplayName: string;
          awayDisplayName: string;
          homeScore: number;
          awayScore: number;
          margin: number;
          winnerPersonId: string | null;
          homePersonId: string | null;
          awayPersonId: string | null;
          winnerDisplayName: string | null;
        }
      | undefined;
    if (!game) throw new Error("No No Mercy game to narrate");
    const pkg = matchupToStoryPackage({
      ...game,
      leagueName: "ATLANTAS FINEST FF",
      collectionId: "no-mercy",
      coverageYears: { from: gallery.coverage?.seasonFrom ?? game.season, to: gallery.coverage?.seasonTo ?? game.season },
      coverageNote: gallery.summary ?? null,
      provenance: ["053h-prepromote"],
    });
    const factLine = `${game.season} W${game.week} margin ${game.margin} ${game.homeDisplayName}/${game.awayDisplayName} ${game.homeScore}–${game.awayScore}`;

    const byVoice: Record<string, { narration: HistoricalNarration; cacheHit: boolean; corpus: string }> = {};
    for (const voice of VOICES) {
      const failures: string[] = [];
      const raw = unwrap((await trpcMutate(page, "historicalNarration.narrate", { package: pkg, voice })).body) as {
        ok?: boolean;
        error?: string | null;
        narration?: HistoricalNarration | null;
        cacheHit?: boolean;
      } | null;
      if (!raw?.ok || !raw.narration) failures.push(raw?.error || "narrate failed");
      else {
        const corpus = narrationCorpus(raw.narration);
        const invented = narrationUsesOnlyPackageFacts(pkg, corpus);
        const altered = narrationDoesNotAlterPackageFacts(pkg, corpus);
        if (!invented.ok) failures.push(`invented ${invented.invented.join(", ")}`);
        if (!altered.ok) failures.push(`altered ${altered.altered.join(", ")}`);
        byVoice[voice] = { narration: raw.narration, cacheHit: Boolean(raw.cacheHit), corpus };
      }
      push({
        name: `Facts unchanged (${voice})`,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        sample: raw?.narration?.intro || factLine,
      });
    }

    const styleFail: string[] = [];
    const intros = VOICES.map((v) => byVoice[v]?.narration.intro ?? "").filter(Boolean);
    if (intros.length < 3) styleFail.push("missing voice intros");
    else if (new Set(intros).size < 3) styleFail.push("voices produced identical intros");
    push({
      name: "Voices differ only in style",
      verdict: styleFail.length ? "FAIL" : "PASS",
      failures: styleFail,
      sample: intros.map((t, i) => `${VOICES[i]}: ${t}`).join(" | ").slice(0, 220),
    });

    const first = unwrap((await trpcMutate(page, "historicalNarration.narrate", { package: pkg, voice: "historian" })).body) as {
      cacheHit?: boolean;
      ok?: boolean;
    } | null;
    const second = unwrap((await trpcMutate(page, "historicalNarration.narrate", { package: pkg, voice: "historian" })).body) as {
      cacheHit?: boolean;
      ok?: boolean;
    } | null;
    const cacheFail: string[] = [];
    if (!first?.ok || !second?.ok) cacheFail.push("historian narrate failed");
    if (!second?.cacheHit) cacheFail.push(`second call cacheHit=${String(second?.cacheHit)}`);
    push({
      name: "Cache same package + historian",
      verdict: cacheFail.length ? "FAIL" : "PASS",
      failures: cacheFail,
      sample: `firstHit=${String(first?.cacheHit)} secondHit=${String(second?.cacheHit)}`,
    });

    await page.evaluate(async ({ leagueId }) => {
      await fetch(`/api/trpc/advisor.clearHistory`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { activeLeagueKey: leagueId } }),
      });
    }, { leagueId: ESPN_LEAGUE });
    await page.waitForTimeout(GAP_MS);

    for (const ask of DETERMINISTIC_ASKS) {
      const out = await advisorChat(page, ESPN_LEAGUE, ask);
      const failures: string[] = [];
      if (out.visual?.type === "historical_narration") failures.push("returned narration visual");
      if (/\bUnable to generate narration\b/i.test(out.message ?? "")) failures.push("narration export error");
      if (!String(out.message ?? "").trim()) failures.push("empty deterministic answer");
      push({
        name: `No narration: ${ask}`,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        sample: `${out.visual?.type ?? "no-visual"} · ${(out.message ?? "").replace(/\s+/g, " ").slice(0, 140)}`,
      });
      await page.waitForTimeout(GAP_MS);
    }
  } finally {
    await browser.close();
  }

  const passed = probes.filter((p) => p.verdict === "PASS").length;
  const failed = probes.filter((p) => p.verdict === "FAIL").length;
  const md = [
    `# RFSN-053H ${LABEL} validation`,
    "",
    `- Host: ${BASE}`,
    `- League: ESPN ${ESPN_LEAGUE}`,
    `- buildTime: ${String(health?.buildTime ?? "?")}`,
    `- Result: **${passed}/${probes.length}** (${failed} fail)`,
    "",
    "| Probe | Verdict | Notes |",
    "| --- | --- | --- |",
    ...probes.map((p) => `| ${p.name} | ${p.verdict} | ${(p.failures.join("; ") || p.sample || "").replace(/\|/g, "/").slice(0, 180)} |`),
    "",
  ].join("\n");
  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(OUT_JSON, JSON.stringify({ host: BASE, health, passed, failed, probes }, null, 2));
  console.log(`\n${passed}/${probes.length} PASS → ${OUT_MD}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
