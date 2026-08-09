/**
 * RFSN-053D — Preview founder validation: Advisor visual Historical Matchup Gallery.
 * ESPN 457622 only. Defaults to Preview. Does not touch Production.
 *
 *   npx tsx scripts/rfsn-053d-preview-validation.mts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const PREVIEW_HOST =
  process.env.RFSN_053D_HOST?.trim() || "sprint-8-preview.fantasyfootballrivals.com";
const BASE = `https://${PREVIEW_HOST}`;
const ESPN_LEAGUE = "457622";
const LABEL = /www\.fantasyfootballrivals\.com/i.test(PREVIEW_HOST) ? "production" : "preview";
const OUT_DIR = path.resolve("audit-artifacts/rfsn-053");
const OUT_MD = path.join(OUT_DIR, `RFSN-053D-${LABEL}-validation.md`);
const OUT_JSON = path.join(OUT_DIR, `RFSN-053D-${LABEL}-validation.json`);
const SHOT_DIR = path.join(OUT_DIR, `screenshots-053d-${LABEL}`);
const GAP_MS = 6500;

type ChatOut = {
  message?: string;
  tool?: string;
  visual?: {
    type?: string;
    preset?: string;
    filters?: Record<string, unknown>;
    href?: string;
    result?: {
      total?: number;
      empty?: boolean;
      emptyReason?: string | null;
      summary?: string;
      matchups?: Array<{ matchupId?: number; viewerHref?: string }>;
    };
  };
  meta?: { intent?: string; llmInvoked?: boolean; deterministicShortCircuit?: boolean };
};

type Probe = {
  name: string;
  question: string;
  verdict: "PASS" | "FAIL";
  failures: string[];
  tool?: string;
  intent?: string;
  visualType?: string;
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

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof import("playwright")["chromium"]["launch"]>>["newPage"]>>;

async function chat(page: Page, leagueId: string, message: string): Promise<ChatOut> {
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

async function clearHistory(page: Page, leagueId: string): Promise<void> {
  await page.evaluate(async ({ leagueId }) => {
    await fetch(`/api/trpc/advisor.clearHistory`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { activeLeagueKey: leagueId } }),
    });
  }, { leagueId });
}

function genericFails(message: string): string[] {
  const failures: string[] = [];
  if (!message || message.length < 8) failures.push("empty or short response");
  if (/i don't have that information|as an ai language model/i.test(message)) {
    failures.push("generic LLM missing-data fallback");
  }
  return failures;
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY?.trim()) throw new Error("CLERK_SECRET_KEY required");
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const probes: Probe[] = [];
  let health: Record<string, unknown> | null = null;
  let lastAt = 0;

  const waitGap = async () => {
    const elapsed = Date.now() - lastAt;
    if (lastAt > 0 && elapsed < GAP_MS) await page.waitForTimeout(GAP_MS - elapsed);
  };

  const push = (row: Probe) => {
    probes.push(row);
    console.log(
      `${row.verdict} | ${row.name}${row.question ? ` · ${row.question}` : ""}${
        row.sample ? `\n  ${row.sample}` : ""
      }${row.failures.length ? `\n  !! ${row.failures.join("; ")}` : ""}`,
    );
  };

  try {
    await page.goto(await mintUrl(BASE), { waitUntil: "domcontentloaded", timeout: 90_000 });
    const expectedHost = new URL(BASE).hostname;
    await page.waitForURL(
      (url) => url.hostname === expectedHost && !url.pathname.includes("sign-in"),
      { timeout: 90_000 },
    );
    if (new URL(page.url()).hostname !== expectedHost) {
      throw new Error(`Abort: landed on ${page.url()} — expected ${expectedHost}`);
    }
    await page.waitForTimeout(2000);

    health = (await page.evaluate(async () => {
      const res = await fetch("/api/health", { credentials: "include" });
      return res.json();
    })) as Record<string, unknown>;
    console.log(
      `host=${new URL(page.url()).hostname} health buildTime=${String(health?.buildTime ?? "?")} gitSha=${String(health?.gitSha ?? "?").slice(0, 12)}`,
    );

    type LiveLeague = { id: number; provider: string; leagueId: string };
    const connections = (await page.evaluate(async () => {
      const res = await fetch(
        `/api/trpc/league.getMyLeagues?input=${encodeURIComponent(JSON.stringify({ json: null }))}`,
        { credentials: "include" },
      );
      const body = await res.json();
      return (body?.result?.data?.json ?? body?.result?.data ?? []) as LiveLeague[];
    })) as LiveLeague[];
    const espn = connections.find((l) => l.provider === "espn" && l.leagueId === ESPN_LEAGUE);
    if (!espn) throw new Error("ESPN 457622 not connected on Preview founder account");
    await page.evaluate(async ({ id }) => {
      const res = await fetch(`/api/trpc/league.setActive`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { leagueConnectionId: id } }),
      });
      const body = await res.json();
      if (body?.error) throw new Error(JSON.stringify(body.error));
    }, { id: espn.id });
    await page.waitForTimeout(600);

    await clearHistory(page, ESPN_LEAGUE);
    await waitGap();

    const galleryQs: Array<{ name: string; q: string; expect: (out: ChatOut) => string[] }> = [
      {
        name: "No Mercy wins",
        q: "Show me my No Mercy wins.",
        expect: (out) => {
          const f = genericFails(String(out.message ?? ""));
          if (out.tool !== "query_matchup_gallery") f.push(`tool=${out.tool ?? "none"}`);
          if (out.visual?.type !== "matchup_gallery") f.push("missing visual");
          if (out.visual?.preset !== "no_mercy" && !out.visual?.filters?.noMercy) f.push("not no_mercy preset");
          if (out.visual?.filters?.marginMin !== 50 && Number(out.visual?.filters?.marginMin) !== 50) {
            f.push("marginMin != 50");
          }
          if (!out.visual?.filters?.winsOnly && out.visual?.filters?.result !== "win") f.push("winsOnly missing");
          if (!/no mercy/i.test(String(out.message ?? ""))) f.push("summary missing No Mercy");
          if (!out.visual?.href?.includes("/league/history/matchups")) f.push("href missing full gallery path");
          return f;
        },
      },
      {
        name: "Rod vs Bruce",
        q: "Show Rod vs Bruce",
        expect: (out) => {
          const f = genericFails(String(out.message ?? ""));
          if (out.visual?.type !== "matchup_gallery") f.push("missing visual");
          const owner = String(out.visual?.filters?.owner ?? out.visual?.filters?.ownerName ?? "");
          const opp = String(out.visual?.filters?.opponent ?? out.visual?.filters?.opponentName ?? "");
          if (!/rod/i.test(owner)) f.push(`owner=${owner}`);
          if (!/bruce/i.test(opp)) f.push(`opponent=${opp}`);
          return f;
        },
      },
      {
        name: "championship games",
        q: "Show me every championship game.",
        expect: (out) => {
          const f = genericFails(String(out.message ?? ""));
          if (out.visual?.type !== "matchup_gallery") f.push("missing visual");
          if (!out.visual?.filters?.championshipGames) f.push("championshipGames filter missing");
          if (out.visual?.result?.empty && out.visual.result.emptyReason !== "insufficient_playoff_tier" && out.visual.result.emptyReason !== "no_matching_games") {
            f.push(`unexpected emptyReason=${out.visual.result.emptyReason}`);
          }
          if ((out.visual?.result?.matchups?.length ?? 0) > 0 && out.visual?.result?.emptyReason === "insufficient_playoff_tier") {
            f.push("invented championship games");
          }
          return f;
        },
      },
      {
        name: "playoff games",
        q: "Show me every playoff game.",
        expect: (out) => {
          const f = genericFails(String(out.message ?? ""));
          if (out.visual?.type !== "matchup_gallery") f.push("missing visual");
          if (out.visual?.filters?.phase !== "playoffs") f.push(`phase=${String(out.visual?.filters?.phase)}`);
          return f;
        },
      },
      {
        name: "closest wins",
        q: "Show me my closest wins.",
        expect: (out) => {
          const f = genericFails(String(out.message ?? ""));
          if (out.visual?.type !== "matchup_gallery") f.push("missing visual");
          if (out.visual?.filters?.sort !== "closest") f.push(`sort=${String(out.visual?.filters?.sort)}`);
          if (out.visual?.filters?.result !== "win" && !out.visual?.filters?.winsOnly) f.push("wins filter missing");
          return f;
        },
      },
      {
        name: "biggest losses",
        q: "Show me my biggest losses.",
        expect: (out) => {
          const f = genericFails(String(out.message ?? ""));
          if (out.visual?.type !== "matchup_gallery") f.push("missing visual");
          if (out.visual?.filters?.sort !== "margin_desc") f.push(`sort=${String(out.visual?.filters?.sort)}`);
          if (out.visual?.filters?.result !== "loss") f.push(`result=${String(out.visual?.filters?.result)}`);
          return f;
        },
      },
    ];

    for (const row of galleryQs) {
      await waitGap();
      const out = await chat(page, ESPN_LEAGUE, row.q);
      lastAt = Date.now();
      const failures = row.expect(out);
      push({
        name: row.name,
        question: row.q,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        tool: out.tool,
        intent: out.meta?.intent,
        visualType: out.visual?.type,
        sample: String(out.message ?? "").replace(/\s+/g, " ").slice(0, 280),
      });
    }

    await waitGap();
    const followNoMercy = await chat(page, ESPN_LEAGUE, "Show me my No Mercy wins.");
    lastAt = Date.now();
    await waitGap();
    const followPlayoffs = await chat(page, ESPN_LEAGUE, "Show only the playoff ones.");
    lastAt = Date.now();
    {
      const failures = genericFails(String(followPlayoffs.message ?? ""));
      if (followPlayoffs.visual?.type !== "matchup_gallery") failures.push("follow-up missing visual");
      if (followPlayoffs.visual?.filters?.phase !== "playoffs") failures.push("follow-up did not add playoffs");
      if (!followNoMercy.visual?.filters?.noMercy && followNoMercy.visual?.preset !== "no_mercy") {
        failures.push("seed No Mercy missing");
      }
      if (followPlayoffs.visual?.filters?.noMercy !== true && followPlayoffs.visual?.preset !== "no_mercy") {
        failures.push("follow-up dropped No Mercy");
      }
      push({
        name: "follow-up playoff filter",
        question: "Show only the playoff ones.",
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        visualType: followPlayoffs.visual?.type,
        sample: String(followPlayoffs.message ?? "").replace(/\s+/g, " ").slice(0, 280),
      });
    }

    await waitGap();
    await chat(page, ESPN_LEAGUE, "Show Rod vs Bruce");
    lastAt = Date.now();
    await waitGap();
    const only2018 = await chat(page, ESPN_LEAGUE, "Now only 2018.");
    lastAt = Date.now();
    {
      const failures = genericFails(String(only2018.message ?? ""));
      if (only2018.visual?.type !== "matchup_gallery") failures.push("missing visual");
      const season = only2018.visual?.filters?.season ?? only2018.visual?.filters?.seasonFrom;
      if (Number(season) !== 2018) failures.push(`season=${String(season)}`);
      const opp = String(only2018.visual?.filters?.opponent ?? only2018.visual?.filters?.opponentName ?? "");
      if (!/bruce/i.test(opp)) failures.push("dropped Bruce opponent");
      push({
        name: "follow-up season filter",
        question: "Now only 2018.",
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        visualType: only2018.visual?.type,
        sample: String(only2018.message ?? "").replace(/\s+/g, " ").slice(0, 280),
      });
    }

    await clearHistory(page, ESPN_LEAGUE);
    await waitGap();
    const afterClear = await chat(page, ESPN_LEAGUE, "Now only 2018.");
    lastAt = Date.now();
    {
      const failures: string[] = [];
      if (afterClear.visual?.type === "matchup_gallery" && afterClear.visual?.filters?.opponent) {
        failures.push("Clear leaked prior Rod vs Bruce opponent into gallery");
      }
      push({
        name: "Clear conversation",
        question: "Now only 2018.",
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        intent: afterClear.meta?.intent,
        sample: String(afterClear.message ?? "").replace(/\s+/g, " ").slice(0, 220),
      });
    }

    const textOnly = [
      ["Who has the most championships?", "championships"],
      ["Who has the most blowouts?", "blowout"],
      ["Who has the most one-point losses?", "one-point"],
      ["Who reaches the most?", "reach"],
      ["Who drafts QBs early?", "qb|quarterback|draft"],
    ] as const;
    for (const [q, cue] of textOnly) {
      await waitGap();
      const out = await chat(page, ESPN_LEAGUE, q);
      lastAt = Date.now();
      const failures = genericFails(String(out.message ?? ""));
      if (out.visual?.type === "matchup_gallery") failures.push("leaderboard returned gallery visual");
      if (out.tool === "query_matchup_gallery") failures.push("leaderboard used gallery tool");
      push({
        name: `text-only: ${q}`,
        question: q,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        tool: out.tool,
        intent: out.meta?.intent,
        sample: String(out.message ?? "").replace(/\s+/g, " ").slice(0, 220),
      });
      void cue;
    }

    await page.goto(`${BASE}/advisor`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOT_DIR, "advisor-home__1440.png"), fullPage: true });

    const input = page.locator("textarea").first();
    await input.fill("Show me my No Mercy wins.");
    await input.press("Enter");
    await page.waitForTimeout(8000);
    const embedVisible = await page.locator("[data-advisor-visual='matchup_gallery']").count();
    const openFull = page.locator("[data-open-full-gallery]");
    const openHref = embedVisible ? await openFull.first().getAttribute("href") : null;
    const viewMatchup = await page.locator("[data-matchup-gallery] a, [data-matchup-card] a").count();
    {
      const failures: string[] = [];
      if (!embedVisible) failures.push("embedded gallery not rendered");
      if (!openHref?.includes("/league/history/matchups")) failures.push(`Open Full Gallery href=${openHref}`);
      push({
        name: "UI embed + Open Full Gallery",
        question: "Show me my No Mercy wins.",
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        sample: `embed=${embedVisible} href=${openHref ?? "none"} viewLinks=${viewMatchup}`,
      });
    }
    await page.screenshot({ path: path.join(SHOT_DIR, "advisor-no-mercy-gallery__1440.png"), fullPage: true });

    if (openHref) {
      await page.goto(`${BASE}${openHref}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(2500);
      const galleryPage = await page.locator("[data-matchup-gallery]").count();
      push({
        name: "Open Full Gallery navigation",
        question: openHref,
        verdict: galleryPage ? "PASS" : "FAIL",
        failures: galleryPage ? [] : ["full gallery page missing data-matchup-gallery"],
        sample: `gallery=${galleryPage}`,
      });
      await page.screenshot({ path: path.join(SHOT_DIR, "open-full-gallery__1440.png"), fullPage: true });
    }

    const viewerLink = page.locator("[data-matchup-card] a").first();
    if (await viewerLink.count()) {
      await viewerLink.click();
      await page.waitForTimeout(2500);
      const viewer = await page.locator("[data-historical-viewer], [data-matchup-viewer], h1, h2").count();
      push({
        name: "View Matchup",
        question: "click first card",
        verdict: viewer ? "PASS" : "FAIL",
        failures: viewer ? [] : ["viewer did not open"],
        sample: page.url(),
      });
      await page.screenshot({ path: path.join(SHOT_DIR, "view-matchup__1440.png"), fullPage: true });
    } else {
      push({
        name: "View Matchup",
        question: "click first card",
        verdict: "FAIL",
        failures: ["no matchup card link on full gallery"],
      });
    }
  } finally {
    await browser.close();
  }

  const pass = probes.filter((p) => p.verdict === "PASS").length;
  const fail = probes.filter((p) => p.verdict === "FAIL").length;
  const payload = {
    label: LABEL,
    host: PREVIEW_HOST,
    buildTime: health?.buildTime ?? null,
    gitSha: health?.gitSha ?? null,
    pass,
    fail,
    total: probes.length,
    probes,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
  fs.writeFileSync(
    OUT_MD,
    [
      `# RFSN-053D ${LABEL} validation`,
      "",
      `- host: \`${PREVIEW_HOST}\``,
      `- buildTime: \`${String(health?.buildTime ?? "?")}\``,
      `- ESPN: \`${ESPN_LEAGUE}\``,
      `- result: **${pass}/${probes.length} PASS** (${fail} fail)`,
      "",
      "| Probe | Verdict | Notes |",
      "| --- | --- | --- |",
      ...probes.map(
        (p) =>
          `| ${p.name} | ${p.verdict} | ${(p.failures.join("; ") || p.sample || "").replace(/\|/g, "/")} |`,
      ),
      "",
    ].join("\n"),
  );
  console.log(`\n${pass}/${probes.length} PASS  ${OUT_MD}`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
