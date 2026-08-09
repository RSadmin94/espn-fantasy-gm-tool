/**
 * RFSN-052L — founder validation: Clear = true session reset.
 *
 *   npx tsx scripts/rfsn-052l-preview-validation.mts
 *   $env:QA_BASE="https://www.fantasyfootballrivals.com"; npx tsx scripts/rfsn-052l-preview-validation.mts
 *
 * ESPN 457622 only. Defaults to Preview. Production only when QA_BASE is www.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const PREVIEW_HOST = "sprint-8-preview.fantasyfootballrivals.com";
const PROD_HOST = "www.fantasyfootballrivals.com";
const qa = (process.env.QA_BASE ?? "").replace(/\/$/, "");
const IS_PROD = /www\.fantasyfootballrivals\.com/i.test(qa);
const HOST = IS_PROD ? PROD_HOST : PREVIEW_HOST;
const BASE = `https://${HOST}`;
const STEM = IS_PROD ? "RFSN-052L-production-validation" : "RFSN-052L-preview-validation";
const GIT_COMMIT = IS_PROD ? "ee9ed04" : "68fa655";
const OUT_DIR = path.resolve("audit-artifacts/rfsn-052");
const OUT_MD = path.join(OUT_DIR, `${STEM}.md`);
const OUT_JSON = path.join(OUT_DIR, `${STEM}.json`);
const ESPN_LEAGUE = "457622";
const GAP_MS = 6500;

type LiveLeague = {
  id: number;
  provider: string;
  leagueId: string;
  leagueName: string | null;
};

type ProbeRow = {
  scenario: string;
  step: string;
  question?: string;
  answer?: string;
  tool?: string;
  activeLeagueAfter?: string;
  verdict: "PASS" | "FAIL" | "SKIP";
  failures: string[];
};

function genericFails(message: string): string[] {
  const failures: string[] = [];
  if (!message || message.length < 12) failures.push("empty or short response");
  if (/i don't have that information|as an ai language model/i.test(message)) {
    failures.push("generic LLM missing-data fallback");
  }
  return failures;
}

function isLargestMarginLeagueWide(message: string): string[] {
  const failures = genericFails(message);
  if (/one-point/i.test(message)) failures.push("routed to one-point losses");
  if (/championship totals|most championships/i.test(message)) {
    failures.push("still answering championships after Clear");
  }
  if (/regular season:|playoffs:.*leads/i.test(message)) {
    failures.push("H2H compare leaked into biggest win");
  }
  if (!/rod sellers/i.test(message)) failures.push("expected Rod Sellers as largest-win owner");
  if (!/129\.5/.test(message)) failures.push("expected 129.5 margin");
  if (!/margin|victory|defeating|largest single-game|biggest win/i.test(message)) {
    failures.push("not a largest-margin answer");
  }
  return failures;
}

function marginFingerprint(message: string): string {
  return [
    /rod sellers/i.test(message) ? "rod" : "",
    /129\.5/.test(message) ? "129.5" : "",
    /maurice welch/i.test(message) ? "maurice" : "leaderboard-or-single",
    /championship totals/i.test(message) ? "champs" : "margins",
  ].join("|");
}

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

async function chat(
  page: Page,
  leagueId: string,
  message: string,
): Promise<{ message: string; tool?: string }> {
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
    { leagueId, message },
  );
  return {
    message: String(chatOut?.message ?? chatOut?.error ?? JSON.stringify(chatOut)).slice(0, 4000),
    tool: chatOut?.tool,
  };
}

async function clearHistory(page: Page, leagueId: string): Promise<unknown> {
  return page.evaluate(async ({ leagueId }) => {
    const res = await fetch(`/api/trpc/advisor.clearHistory`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { activeLeagueKey: leagueId } }),
    });
    return res.json();
  }, { leagueId });
}

async function activeLeagueId(page: Page): Promise<string> {
  const leagues = (await page.evaluate(async () => {
    const res = await fetch(
      `/api/trpc/league.getMyLeagues?input=${encodeURIComponent(JSON.stringify({ json: null }))}`,
      { credentials: "include" },
    );
    const body = await res.json();
    return (body?.result?.data?.json ?? body?.result?.data ?? []) as LiveLeague[];
  })) as LiveLeague[];
  const active = await page.evaluate(async () => {
    const res = await fetch(
      `/api/trpc/league.getActive?input=${encodeURIComponent(JSON.stringify({ json: null }))}`,
      { credentials: "include" },
    );
    const body = await res.json();
    return body?.result?.data?.json ?? body?.result?.data ?? null;
  });
  return String(active?.leagueId ?? leagues.find((l) => l.leagueId === ESPN_LEAGUE)?.leagueId ?? "");
}

async function historyLen(page: Page, leagueId: string): Promise<number> {
  const rows = (await page.evaluate(async ({ leagueId }) => {
    const res = await fetch(
      `/api/trpc/advisor.history?input=${encodeURIComponent(JSON.stringify({ json: { activeLeagueKey: leagueId } }))}`,
      { credentials: "include" },
    );
    const body = await res.json();
    return body?.result?.data?.json ?? body?.result?.data ?? [];
  }, { leagueId })) as unknown[];
  return Array.isArray(rows) ? rows.length : -1;
}

function logRow(row: ProbeRow) {
  const snippet = (row.answer ?? "").replace(/\s+/g, " ").slice(0, 280);
  console.log(
    `${row.verdict} | ${row.scenario} · ${row.step}${row.question ? ` · ${row.question}` : ""}${
      snippet ? `\n  ${snippet}` : ""
    }${row.failures.length ? `\n  !! ${row.failures.join("; ")}` : ""}`,
  );
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY?.trim()) throw new Error("CLERK_SECRET_KEY required");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const rows: ProbeRow[] = [];
  let health: Record<string, unknown> | null = null;
  let lastAt = 0;

  const waitGap = async () => {
    const elapsed = Date.now() - lastAt;
    if (lastAt > 0 && elapsed < GAP_MS) await page.waitForTimeout(GAP_MS - elapsed);
  };

  try {
    await page.goto(await mintUrl(BASE), { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForURL(
      (url) => url.hostname === HOST && !url.pathname.includes("sign-in"),
      { timeout: 90_000 },
    );
    if (new URL(page.url()).hostname !== HOST) {
      throw new Error(`Abort: landed on ${page.url()} — expected ${HOST}`);
    }
    await page.waitForTimeout(2500);

    health = (await page.evaluate(async () => {
      const res = await fetch("/api/health", { credentials: "include" });
      return res.json();
    })) as Record<string, unknown>;
    console.log(
      `host=${new URL(page.url()).hostname} health buildTime=${String(health?.buildTime ?? "?")} gitSha=${String(health?.gitSha ?? "?").slice(0, 12)}`,
    );
    if (IS_PROD && String(health?.buildTime ?? "").startsWith("2026-08-09T07:37")) {
      throw new Error("Abort: Production health is still 054A, not 052L");
    }
    if (!IS_PROD && String(health?.buildTime ?? "").startsWith("2026-08-09T07:37")) {
      throw new Error("Abort: health is Production 054A, not Preview 052L");
    }

    const connections = (await page.evaluate(async () => {
      const res = await fetch(
        `/api/trpc/league.getMyLeagues?input=${encodeURIComponent(JSON.stringify({ json: null }))}`,
        { credentials: "include" },
      );
      const body = await res.json();
      return (body?.result?.data?.json ?? body?.result?.data ?? []) as LiveLeague[];
    })) as LiveLeague[];
    const espn = connections.find((l) => l.provider === "espn" && l.leagueId === ESPN_LEAGUE);
    if (!espn) throw new Error(`ESPN 457622 not connected on ${IS_PROD ? "Production" : "Preview"} founder account`);

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
    await page.waitForTimeout(800);

    const push = (row: ProbeRow) => {
      rows.push(row);
      logRow(row);
    };

    // ── Fresh baseline biggest win (no prior conversation) ──────────────────
    await clearHistory(page, ESPN_LEAGUE);
    await waitGap();
    let out = await chat(page, ESPN_LEAGUE, "Who has the biggest win?");
    lastAt = Date.now();
    const baselineFp = marginFingerprint(out.message);
    {
      const failures = isLargestMarginLeagueWide(out.message);
      push({
        scenario: "baseline",
        step: "fresh biggest win",
        question: "Who has the biggest win?",
        answer: out.message,
        tool: out.tool,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }

    // ── Primary: championships → Clear → biggest win ────────────────────────
    await waitGap();
    out = await chat(page, ESPN_LEAGUE, "Who has the most championships?");
    lastAt = Date.now();
    {
      const failures = genericFails(out.message);
      if (!/championship totals/i.test(out.message) && !/\n?1\./.test(out.message)) {
        failures.push("most championships is not a leaderboard");
      }
      push({
        scenario: "primary",
        step: "Q1 championships",
        question: "Who has the most championships?",
        answer: out.message,
        tool: out.tool,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }

    await clearHistory(page, ESPN_LEAGUE);
    const histAfterClear1 = await historyLen(page, ESPN_LEAGUE);
    const leagueAfterClear1 = await activeLeagueId(page);
    {
      const failures: string[] = [];
      if (histAfterClear1 !== 0) failures.push(`history still has ${histAfterClear1} rows after Clear`);
      if (leagueAfterClear1 !== ESPN_LEAGUE) {
        failures.push(`active league reset or switched: ${leagueAfterClear1}`);
      }
      push({
        scenario: "primary",
        step: "Clear",
        activeLeagueAfter: String(leagueAfterClear1),
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }

    await waitGap();
    out = await chat(page, ESPN_LEAGUE, "Who has the biggest win?");
    lastAt = Date.now();
    {
      const failures = isLargestMarginLeagueWide(out.message);
      if (out.tool && !/matchup_margin/i.test(String(out.tool))) {
        failures.push(`unexpected tool ${out.tool}`);
      }
      if (marginFingerprint(out.message) !== baselineFp) {
        failures.push(`after Clear, biggest win diverged from fresh baseline (${baselineFp} vs ${marginFingerprint(out.message)})`);
      }
      push({
        scenario: "primary",
        step: "Q2 biggest win after Clear",
        question: "Who has the biggest win?",
        answer: out.message,
        tool: out.tool,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }

    // ── Owner comparison → Clear → historical ───────────────────────────────
    await waitGap();
    out = await chat(page, ESPN_LEAGUE, "Compare Demetri Clark and LOZELL STYLES.");
    lastAt = Date.now();
    {
      const failures = genericFails(out.message);
      if (!/demetri/i.test(out.message) || !/lozell/i.test(out.message)) {
        failures.push("compare missing Demetri or LOZELL");
      }
      push({
        scenario: "compare-then-historical",
        step: "Q1 compare",
        question: "Compare Demetri Clark and LOZELL STYLES.",
        answer: out.message,
        tool: out.tool,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }

    await clearHistory(page, ESPN_LEAGUE);
    await waitGap();
    out = await chat(page, ESPN_LEAGUE, "What was LOZELL's 2009 regular-season record?");
    lastAt = Date.now();
    {
      const failures = genericFails(out.message);
      if (!/partial legacy season/i.test(out.message)) {
        failures.push("expected partial-legacy limitation, not H2H follow-up");
      }
      if (/regular season:|playoffs:|tied 10/i.test(out.message)) {
        failures.push("compare H2H leaked into 2009 historical ask");
      }
      if (/\d+–\d+–\d+|\d+-\d+-\d+/.test(out.message)) failures.push("fabricated 2009 record");
      push({
        scenario: "compare-then-historical",
        step: "Q2 2009 record after Clear",
        question: "What was LOZELL's 2009 regular-season record?",
        answer: out.message,
        tool: out.tool,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }

    // ── Metric clarification → Clear → different metric ─────────────────────
    await waitGap();
    out = await chat(page, ESPN_LEAGUE, "Who has the most one-point losses?");
    lastAt = Date.now();
    {
      const failures = genericFails(out.message);
      if (!/one-point|deroux|nate west/i.test(out.message)) {
        failures.push("one-point losses answer missing expected metric/owner");
      }
      push({
        scenario: "metric-then-other",
        step: "Q1 one-point losses",
        question: "Who has the most one-point losses?",
        answer: out.message,
        tool: out.tool,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }

    await clearHistory(page, ESPN_LEAGUE);
    await waitGap();
    out = await chat(page, ESPN_LEAGUE, "Who has the most 50-point blowout wins?");
    lastAt = Date.now();
    {
      const failures = genericFails(out.message);
      if (/one-point/i.test(out.message)) failures.push("prior one-point metric leaked after Clear");
      if (!/graham|blowout|50/i.test(out.message)) {
        failures.push("blowout answer missing expected owner/metric");
      }
      push({
        scenario: "metric-then-other",
        step: "Q2 blowouts after Clear",
        question: "Who has the most 50-point blowout wins?",
        answer: out.message,
        tool: out.tool,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }

    // ── Pronoun → Clear → named owner ───────────────────────────────────────
    await waitGap();
    out = await chat(page, ESPN_LEAGUE, "How many championships does LOZELL STYLES have?");
    lastAt = Date.now();
    {
      const failures = genericFails(out.message);
      if (!/lozell/i.test(out.message)) failures.push("LOZELL missing");
      if (!/\b3\b/.test(out.message) && !/three/i.test(out.message)) failures.push("expected 3 LOZELL titles");
      push({
        scenario: "pronoun-then-named",
        step: "Q1 LOZELL championships",
        question: "How many championships does LOZELL STYLES have?",
        answer: out.message,
        tool: out.tool,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }

    await clearHistory(page, ESPN_LEAGUE);
    await waitGap();
    out = await chat(page, ESPN_LEAGUE, "How many championships does Bruce Edwards have?");
    lastAt = Date.now();
    {
      const failures = genericFails(out.message);
      if (!/bruce/i.test(out.message)) failures.push("Bruce missing");
      if (/lozell/i.test(out.message) && !/bruce/i.test(out.message)) {
        failures.push("LOZELL leaked after Clear into named Bruce ask");
      }
      if (/\b3\b/.test(out.message) && !/\b2\b/.test(out.message)) {
        failures.push("looks like LOZELL 3 titles, not Bruce 2");
      }
      if (!/\b2\b/.test(out.message) && !/two/i.test(out.message)) failures.push("expected 2 Bruce titles");
      if (!/2016/.test(out.message) || !/2023/.test(out.message)) {
        failures.push("expected Bruce seasons 2016 and 2023");
      }
      push({
        scenario: "pronoun-then-named",
        step: "Q2 Bruce after Clear",
        question: "How many championships does Bruce Edwards have?",
        answer: out.message,
        tool: out.tool,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }

    // ── UI Clear: messages / input / scroll; league + user preserved ────────
    await page.goto(`${BASE}/my-team/advisor`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    if (new URL(page.url()).hostname !== HOST) {
      throw new Error(`Abort: UI probe left ${HOST} (${page.url()})`);
    }
    await page.waitForTimeout(4000);
    const input = page.locator("textarea").first();
    await input.waitFor({ timeout: 20_000 });
    const clearBtn = page.locator("[data-advisor-clear], [data-rfsn-052l], button:has-text('Clear')");
    if (!(await clearBtn.count())) {
      await input.fill("Who has the most championships?");
      await page.getByRole("button").last().click();
      await page.waitForTimeout(12_000);
    }
    await input.fill("leftover draft text");
    await clearBtn.first().waitFor({ timeout: 25_000 });
    await clearBtn.first().click();
    await page.waitForTimeout(2000);
    const ui = await page.evaluate(() => {
      const pane = document.querySelector("[data-advisor-messages]") as HTMLElement | null;
      const ta = document.querySelector("textarea") as HTMLTextAreaElement | null;
      const bubbles = Array.from(document.querySelectorAll("[data-advisor-messages] [data-role], [data-advisor-messages] .rounded-lg, [data-advisor-messages] p"))
        .map((el) => (el.textContent ?? "").trim())
        .filter(Boolean);
      return {
        scrollTop: pane?.scrollTop ?? -1,
        input: ta?.value ?? "",
        bubbleCount: bubbles.length,
        bubbleSample: bubbles.slice(0, 6),
        stillOnAdvisor: location.pathname.includes("advisor"),
        userChip: document.body.innerText.includes("Sign in") ? "signed-out" : "signed-in",
      };
    });
    {
      const failures: string[] = [];
      if (!ui.stillOnAdvisor) failures.push("left Advisor page after Clear");
      if (ui.userChip === "signed-out") failures.push("logged-out user after Clear");
      if (ui.input.trim()) failures.push(`input not cleared: ${JSON.stringify(ui.input)}`);
      if (ui.scrollTop > 80) failures.push(`scroll not reset: ${ui.scrollTop}`);
      const leftover = ui.bubbleSample.join(" ").toLowerCase();
      if (/christian graham|championship totals|leftover draft/i.test(leftover) && ui.bubbleCount > 2) {
        failures.push("prior transcript still visible after Clear");
      }
      push({
        scenario: "ui-clear",
        step: "Clear button resets chrome",
        answer: JSON.stringify(ui),
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }

    await input.fill("Who has the biggest win?");
    await page.getByRole("button").last().click();
    await page.waitForTimeout(12_000);
    const afterUiAsk = await page.evaluate(() => {
      const pane = document.querySelector("[data-advisor-messages]");
      return (pane?.textContent ?? "").slice(0, 2500);
    });
    {
      const failures = isLargestMarginLeagueWide(afterUiAsk);
      push({
        scenario: "ui-clear",
        step: "UI biggest win after Clear",
        question: "Who has the biggest win?",
        answer: afterUiAsk,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      });
    }
  } finally {
    await browser.close();
  }

  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const fail = rows.filter((r) => r.verdict === "FAIL").length;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const md = [
    `# RFSN-052L — ${IS_PROD ? "Production" : "Preview"} validation`,
    ``,
    `**Host:** \`${BASE}\``,
    `**Git commit:** \`${GIT_COMMIT}\``,
    `**buildTime:** \`${String(health?.buildTime ?? "?")}\``,
    `**gitSha (may be stale):** \`${String(health?.gitSha ?? "?")}\``,
    `**Live ESPN 457622:** ${pass} PASS / ${fail} FAIL`,
    IS_PROD
      ? `**Railway Production:** Git \`${GIT_COMMIT}\` (cherry-pick of \`68fa655\`).`
      : `**Railway Preview:** SUCCESS \`68fa655\` · health must be Preview (\`buildTime\` ≥ \`2026-08-09T08:23:34Z\`).`,
    ``,
    `| Scenario | Step | Answer | PASS/FAIL |`,
    `| --- | --- | --- | --- |`,
    ...rows.map(
      (r) =>
        `| ${r.scenario} | ${r.step}${r.question ? ` — ${r.question.replace(/\|/g, "\\|")}` : ""} | ${(r.answer ?? r.activeLeagueAfter ?? "")
          .replace(/\|/g, "\\|")
          .replace(/\n/g, "<br>")
          .slice(0, 700)} | ${r.verdict}${r.failures.length ? ` (${r.failures.join("; ")})` : ""} |`,
    ),
    ``,
  ].join("\n");
  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(OUT_JSON, JSON.stringify({ host: BASE, commit: GIT_COMMIT, health, rows }, null, 2));
  console.log(`Wrote ${OUT_MD}`);
  if (fail) {
    console.error(`\nFAIL ${fail}/${rows.length}.`);
    process.exit(1);
  }
  console.log(`\n${IS_PROD ? "Production" : "Preview"} 052L validation ${pass}/${rows.length} PASS.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
