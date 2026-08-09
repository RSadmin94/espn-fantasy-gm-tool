/**
 * RFSN-052G — GM Advisor historical intelligence regression.
 *
 * Offline (always): ESPN / Sleeper API / Sleeper Workbook fixture matrix.
 * Live Preview (optional): `--live` with CLERK_SECRET_KEY, founder sign-in.
 *
 *   npx tsx scripts/rfsn-052g-preview-regression.mts
 *   npx tsx scripts/rfsn-052g-preview-regression.mts --live
 *
 * Does not deploy. Does not touch Production.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  buildHistoricalRegressionMatrix,
  REGRESSION_LEAGUES,
  SWITCH_LEAGUE_QUESTIONS,
  regressionSummary,
  type RegressionRow,
} from "../server/advisorHistoricalRegression";

const BASE = (
  process.env.QA_BASE ?? "https://sprint-8-preview.fantasyfootballrivals.com"
).replace(/\/$/, "");
const LIVE = process.argv.includes("--live");
const OUT_DIR = path.resolve("audit-artifacts/rfsn-052");
const OUT_MD = path.join(OUT_DIR, "RFSN-052G-historical-regression.md");
const OUT_JSON = path.join(OUT_DIR, "RFSN-052G-historical-regression.json");

function mdEscape(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function matrixMarkdown(rows: RegressionRow[], title: string): string {
  const lines = [
    `| Question | League | Scope | Authorities | Answer | Source verification | PASS/FAIL |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
  ];
  for (const r of rows) {
    const fail = r.failures.length ? ` (${r.failures.join("; ")})` : "";
    lines.push(
      `| ${mdEscape(r.question)} | ${mdEscape(`${r.league} (${r.provider})`)} | ${mdEscape(r.scope)} | ${mdEscape(r.authorities)} | ${mdEscape(r.answer)} | ${mdEscape(r.sourceVerification)}${mdEscape(fail)} | ${r.verdict} |`,
    );
  }
  return `## ${title}\n\n${lines.join("\n")}\n`;
}

async function writeArtifacts(offline: RegressionRow[], live: RegressionRow[] | null) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const offSum = regressionSummary(offline);
  const liveSum = live ? regressionSummary(live) : null;
  const liveGate = liveSum
    ? liveSum.fail === 0
      ? "PASS"
      : "FAIL"
    : "not run";
  const md = [
    `# RFSN-052G — GM Advisor Historical Intelligence Regression Suite`,
    ``,
    `**Status:** Offline fixture matrix ${offSum.fail === 0 ? "PASS" : "FAIL"} (machinery). Live Preview ${liveGate} (real league facts). **Do not promote to Production until live Preview passes.**`,
    ``,
    `- Preview host: \`${BASE}\``,
    `- Providers: ESPN \`${REGRESSION_LEAGUES[0]?.leagueId}\`, Sleeper API \`${REGRESSION_LEAGUES[1]?.leagueId}\`, Sleeper Workbook \`${REGRESSION_LEAGUES[2]?.leagueId}\``,
    `- Offline: ${offSum.pass}/${offSum.total} PASS (fixtures prove routing, not production totals)`,
    liveSum
      ? `- Live Preview: ${liveSum.pass}/${liveSum.total} PASS`
      : `- Live Preview: skipped (pass \`--live\` + \`CLERK_SECRET_KEY\`)`,
    `- Switch questions: ${SWITCH_LEAGUE_QUESTIONS.join(" · ")}`,
    `- ESPN architecture probes: LOZELL championships · Demetri vs LOZELL · check their H2H · one-point losses · 50-point blowouts`,
    `- Streaming/non-streaming: both call \`runAdvisorEvidencePath\` (052E). Live spot-checks stream vs chat.`,
    ``,
    matrixMarkdown(offline, "Offline fixture matrix (routing + scope + authorities)"),
    live ? matrixMarkdown(live, "Live Preview matrix (real league facts)") : "",
    `## Verification checklist`,
    ``,
    `- [${offSum.fail === 0 ? "x" : " "}] Offline machinery: active league, default history, alias, RS/playoffs, partial coverage, no hallucinated filler`,
    `- [${liveSum && liveSum.fail === 0 ? "x" : " "}] Live real data: championships / H2H / elims / records / closest / blowouts match authorities`,
    `- [${liveSum && liveSum.fail === 0 ? "x" : " "}] Live league switching: ESPN / Sleeper API / Workbook, no cross-league names`,
    `- [${liveSum && liveSum.fail === 0 ? "x" : " "}] Live coverage: partial seasons qualified; no “I don't have that information” when data exists`,
    ``,
    `**Stop for review. No Production push/deploy.**`,
    ``,
  ].join("\n");
  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify({ previewHost: BASE, offline, live, summary: { offline: offSum, live: liveSum } }, null, 2),
  );
  console.log(`Wrote ${OUT_MD}`);
  console.log(`Wrote ${OUT_JSON}`);
}

function printTable(rows: RegressionRow[], label: string) {
  const sum = regressionSummary(rows);
  console.log(`\n======== ${label} (${sum.pass}/${sum.total} PASS) ========`);
  console.log(
    ["Question", "League", "Scope", "Authorities", "Answer", "Source verification", "PASS/FAIL"].join(" | "),
  );
  for (const r of rows) {
    console.log(
      [
        r.question,
        `${r.league} (${r.provider})`,
        r.scope,
        r.authorities,
        r.answer.replace(/\n/g, " / ").slice(0, 180),
        r.sourceVerification,
        r.verdict + (r.failures.length ? ` :: ${r.failures.join("; ")}` : ""),
      ].join(" | "),
    );
  }
}

type LiveLeague = {
  id: number;
  provider: string;
  leagueId: string;
  leagueName: string | null;
};

const ESPN_LEAK_RE =
  /\b(Mark Deroux|Rod Sellers|LOZELL STYLES|LOZELL|Nate West|Demetri Clark|Bruce Edwards|Atlantas Finest|ATLANTAS)\b/i;

const HISTORICAL_CORE = [
  "Who has the most one-point losses?",
  "Who has the most blowout wins by 50+?",
  "Who has the most championships?",
  "Who has the most playoff eliminations?",
  "What is the greatest rivalry?",
  "Who has the best career winning percentage?",
  "Who has the worst career record?",
  "What was the closest game?",
  "Who is the biggest playoff villain?",
] as const;

const ESPN_ARCHITECTURE_PROBES = [
  "How many championships does LOZELL STYLES have?",
  "Compare Demetri Clark and LOZELL STYLES.",
  "Check their head-to-head stats.",
  "Who has the most one-point losses?",
  "Who has the most 50-point blowout wins?",
] as const;

function espnLeak(answer: string, provider: string): boolean {
  if (provider === "espn") return false;
  return ESPN_LEAK_RE.test(answer);
}

function looksAuthorityBacked(answer: string, question: string): boolean {
  if (/this week/i.test(question)) return true;
  const a = answer.toLowerCase();
  return (
    /across recorded|not all-time|championship totals|one-point|wins by \d+\+|closest recorded|regular season|playoffs?:|query_matchup_margins|missing dataset|does not have recorded/i.test(
      a,
    ) || /\b\d{4}\b/.test(answer)
  );
}

function liveFailures(opts: {
  question: string;
  provider: string;
  message: string;
  tool?: string;
  streamText?: string;
  checkStream?: boolean;
}): string[] {
  const { question, provider, message, tool, streamText, checkStream } = opts;
  const failures: string[] = [];
  const coaching = /this week/i.test(question);
  if (!message || (message.length < 40 && /Unauthorized|error/i.test(message))) {
    failures.push("empty or error response");
  }
  if (/i don't have that information|i don't have the data on|as an ai language model/i.test(message)) {
    failures.push("generic missing-data / hallucinated fallback");
  }
  if (/let me (correct|recheck|update)|on second thought|i was wrong|wait,? i /i.test(message)) {
    failures.push("self-correction instead of first-answer authority");
  }
  if (!coaching && /\ball-time\b/i.test(message) && !/not all-time/i.test(message)) {
    failures.push("unqualified all-time");
  }
  if (!coaching && espnLeak(message, provider)) {
    failures.push("ESPN names leaked into non-ESPN league");
  }
  if (!coaching && !looksAuthorityBacked(message, question) && tool !== "query_matchup_margins") {
    failures.push("answer does not look authority-backed");
  }
  if (/lozell/i.test(question) && /championship/i.test(question) && !/lozell/i.test(message)) {
    failures.push("LOZELL championship answer missing LOZELL");
  }
  if (
    /demetri/i.test(question) &&
    /lozell/i.test(question) &&
    (!/demetri/i.test(message) || !/lozell/i.test(message))
  ) {
    failures.push("Demetri vs LOZELL answer missing a named owner");
  }
  if (
    /head-to-head|compare /i.test(question) &&
    !/regular season|playoffs?/i.test(message) &&
    !coaching
  ) {
    failures.push("H2H/compare not labeled regular season vs playoffs");
  }
  if (checkStream && streamText != null && !coaching) {
    const head = message.slice(0, 60);
    const streamOk =
      streamText.includes(head) ||
      /"delta"\s*:/.test(streamText) ||
      /"done"\s*:\s*true/.test(streamText);
    if (head.length >= 20 && !streamOk && streamText.length > 80) {
      failures.push("stream/chat mismatch");
    }
  }
  return failures;
}

async function runLivePreview(): Promise<RegressionRow[]> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    throw new Error("CLERK_SECRET_KEY required for --live");
  }
  const { chromium } = await import("playwright");
  const FOUNDER_CLERK_ID =
    process.env.SMOKE_CLERK_USER_ID ?? "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo";
  const mint = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: FOUNDER_CLERK_ID, expires_in_seconds: 300 }),
  });
  if (!mint.ok) throw new Error(`Clerk token mint failed: ${mint.status} ${await mint.text()}`);
  const data = (await mint.json()) as { url?: string; token?: string };
  const signInUrl = data.url
    ? (() => {
        const u = new URL(data.url!);
        u.protocol = "https:";
        u.host = new URL(BASE).host;
        return u.toString();
      })()
    : `${BASE}/sign-in?__clerk_ticket=${encodeURIComponent(data.token!)}`;

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const rows: RegressionRow[] = [];
  try {
    await page.goto(signInUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForURL(
      (url) => url.hostname.includes("fantasyfootballrivals.com") && !url.pathname.includes("sign-in"),
      { timeout: 90_000 },
    );
    await page.waitForTimeout(2500);

    const leagues = (await page.evaluate(async () => {
      const res = await fetch(
        `/api/trpc/league.getMyLeagues?input=${encodeURIComponent(JSON.stringify({ json: null }))}`,
        { credentials: "include" },
      );
      const body = await res.json();
      return (body?.result?.data?.json ?? body?.result?.data ?? []) as LiveLeague[];
    })) as LiveLeague[];

    console.log(
      `All founder connections (${leagues.length}): ${
        leagues.map((l) => `${l.provider}:${l.leagueId}:${l.leagueName ?? "?"}`).join(" | ") || "(none)"
      }`,
    );

    const espn =
      leagues.find((l) => l.provider === "espn" && l.leagueId === "457622") ??
      leagues.find((l) => l.provider === "espn") ??
      null;
    const sleeper =
      leagues.find((l) => l.provider === "sleeper" && l.leagueId === "1360071954299621376") ??
      leagues.find((l) => l.provider === "sleeper") ??
      null;
    const workbook =
      leagues.find((l) => l.provider === "sleeper_workbook" && String(l.leagueId).startsWith("smoke_wb_")) ??
      leagues.find((l) => l.provider === "sleeper_workbook") ??
      null;
    const targets = [espn, sleeper, workbook].filter(Boolean) as LiveLeague[];
    console.log(
      `Live targets: ${targets.map((l) => `${l.provider}:${l.leagueId}:${l.leagueName}`).join(" | ") || "(none)"}`,
    );
    if (!espn || espn.leagueId !== "457622") {
      rows.push({
        question: "[setup] ESPN Rivals 457622",
        league: espn?.leagueName ?? "n/a",
        provider: "espn",
        leagueId: espn?.leagueId ?? "n/a",
        scope: "setup",
        intent: "live",
        authorities: "n/a",
        answer: espn
          ? `Founder ESPN active connection is ${espn.leagueId} (${espn.leagueName}), not Rivals 457622`
          : "No ESPN league on founder Preview account",
        sourceVerification: "league.getMyLeagues",
        verdict: "FAIL",
        failures: ["Rivals 457622 not selected — live gate requires that league"],
      });
    }
    if (!sleeper) {
      rows.push({
        question: "[setup] Sleeper API",
        league: "n/a",
        provider: "sleeper",
        leagueId: "n/a",
        scope: "setup",
        intent: "live",
        authorities: "n/a",
        answer: "No Sleeper API league on founder Preview account",
        sourceVerification: "league.getMyLeagues",
        verdict: "FAIL",
        failures: ["Sleeper API connection missing"],
      });
    }
    if (!workbook) {
      rows.push({
        question: "[setup] Sleeper Workbook",
        league: "n/a",
        provider: "sleeper_workbook",
        leagueId: "n/a",
        scope: "setup",
        intent: "live",
        authorities: "n/a",
        answer: "No Sleeper Workbook league on founder Preview account",
        sourceVerification: "league.getMyLeagues",
        verdict: "FAIL",
        failures: ["Sleeper Workbook connection missing"],
      });
    }

    let lastAt = 0;
    const setActive = async (league: LiveLeague) => {
      await page.evaluate(async ({ id }) => {
        const res = await fetch(`/api/trpc/league.setActive`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ json: { leagueConnectionId: id } }),
        });
        const body = await res.json();
        if (body?.error) throw new Error(JSON.stringify(body.error));
      }, { id: league.id });
      await page.waitForTimeout(800);
    };

    const askChat = async (league: LiveLeague, message: string, withStream = false) => {
      const elapsed = Date.now() - lastAt;
      if (lastAt > 0 && elapsed < 6500) await page.waitForTimeout(6500 - elapsed);
      const chatOut = await page.evaluate(
        async ({ leagueId, message }) => {
          const chat = await fetch(`/api/trpc/advisor.chat`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ json: { message, activeLeagueKey: leagueId } }),
          });
          const chatBody = await chat.json();
          return chatBody?.result?.data?.json ?? chatBody?.result?.data ?? chatBody;
        },
        { leagueId: league.leagueId, message },
      );
      lastAt = Date.now();
      let streamText = "";
      if (withStream) {
        const sinceChat = Date.now() - lastAt;
        if (sinceChat < 6500) await page.waitForTimeout(6500 - sinceChat);
        streamText = await page.evaluate(
          async ({ leagueId, message }) => {
            const stream = await fetch(`/api/advisor/stream`, {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message, activeLeagueKey: leagueId }),
            });
            return stream.text();
          },
          { leagueId: league.leagueId, message },
        );
        lastAt = Date.now();
      }
      return { chat: chatOut, streamText };
    };

    const recordLive = (opts: {
      question: string;
      league: LiveLeague;
      message: string;
      tool?: string;
      streamText?: string;
      checkStream?: boolean;
      scope?: string;
      authorities?: string;
    }) => {
      const failures = liveFailures({
        question: opts.question,
        provider: opts.league.provider,
        message: opts.message,
        tool: opts.tool,
        streamText: opts.streamText,
        checkStream: opts.checkStream,
      });
      rows.push({
        question: opts.question,
        league: opts.league.leagueName ?? opts.league.leagueId,
        provider: opts.league.provider as RegressionRow["provider"],
        leagueId: opts.league.leagueId,
        scope: opts.scope ?? ( /this week/i.test(opts.question) ? "current_season (live)" : "live Preview (no season in message)"),
        intent: "live",
        authorities: opts.authorities ?? `live advisor.chat · tool=${opts.tool ?? "none"}`,
        answer: opts.message,
        sourceVerification: `tool=${opts.tool ?? "none"} · streamChars=${opts.streamText?.length ?? 0}`,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
      console.log(
        `${failures.length ? "FAIL" : "PASS"} | ${opts.league.provider} | ${opts.question}\n  ${opts.message.slice(0, 240)}${
          failures.length ? `\n  !! ${failures.join("; ")}` : ""
        }`,
      );
    };

    for (const league of targets) {
      await setActive(league);
      const questions: string[] =
        league.provider === "espn"
          ? [
              ...ESPN_ARCHITECTURE_PROBES,
              ...HISTORICAL_CORE.filter((q) => !(ESPN_ARCHITECTURE_PROBES as readonly string[]).includes(q)),
              "Who should I start this week?",
            ]
          : [...HISTORICAL_CORE, "Who should I start this week?"];

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i]!;
        const withStream = i === 0;
        const out = await askChat(league, q, withStream);
        const message = String(out.chat?.message ?? out.chat?.error ?? JSON.stringify(out.chat)).slice(0, 2500);
        recordLive({
          question: q,
          league,
          message,
          tool: out.chat?.tool,
          streamText: out.streamText,
          checkStream: withStream,
          authorities:
            league.provider === "espn" && (ESPN_ARCHITECTURE_PROBES as readonly string[]).includes(q)
              ? "ESPN architecture probe · advisor.chat"
              : `live advisor.chat · tool=${out.chat?.tool ?? "none"}`,
        });
      }
    }

    const switchQs = [...SWITCH_LEAGUE_QUESTIONS];
    for (let i = 0; i < targets.length; i++) {
      const from = targets[i]!;
      const to = targets[(i + 1) % targets.length]!;
      if (from.leagueId === to.leagueId) continue;
      for (const q of switchQs) {
        await setActive(from);
        const a = await askChat(from, q);
        await setActive(to);
        const b = await askChat(to, q);
        const ma = String(a.chat?.message ?? "");
        const mb = String(b.chat?.message ?? "");
        const failures: string[] = [];
        if (ma === mb) failures.push("answer identical after league switch");
        if (espnLeak(mb, to.provider)) failures.push("ESPN leak after switch to non-ESPN");
        if (espnLeak(ma, from.provider)) failures.push("ESPN leak on source league unexpectedly");
        rows.push({
          question: `${q} (switch ${from.provider} → ${to.provider})`,
          league: `${from.leagueName} → ${to.leagueName}`,
          provider: to.provider as RegressionRow["provider"],
          leagueId: `${from.leagueId}→${to.leagueId}`,
          scope: "live switch",
          intent: "live",
          authorities: "live advisor.chat after league.setActive",
          answer: `FROM: ${ma}\nTO: ${mb}`,
          sourceVerification: `leagueIds ${from.leagueId} vs ${to.leagueId}`,
          verdict: failures.length ? "FAIL" : "PASS",
          failures,
        });
        console.log(
          `${failures.length ? "FAIL" : "PASS"} | switch ${from.provider}→${to.provider} | ${q}\n  FROM: ${ma.slice(0, 140)}\n  TO:   ${mb.slice(0, 140)}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
  return rows;
}

async function main() {
  console.log(`Preview host: ${BASE}`);
  console.log(`Live: ${LIVE ? "yes" : "no (offline fixtures only)"}`);
  console.log("Production: not touched.");

  const offline = buildHistoricalRegressionMatrix();
  printTable(offline, "OFFLINE FIXTURE MATRIX");

  let live: RegressionRow[] | null = null;
  if (LIVE) {
    live = await runLivePreview();
    printTable(live, "LIVE PREVIEW MATRIX");
  }

  await writeArtifacts(offline, live);

  const offFail = regressionSummary(offline).fail;
  const liveFail = live ? regressionSummary(live).fail : 0;
  if (offFail || liveFail) {
    console.error(`\nFAIL offline=${offFail} live=${liveFail}. Do not promote to Production.`);
    process.exit(1);
  }
  console.log("\nOffline matrix PASS. Do not promote to Production until live Preview also passes.");
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
