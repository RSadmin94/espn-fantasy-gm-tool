/**
 * RFSN-055 — Preview founder smoke: Draft Intelligence Authority.
 *
 *   npx tsx scripts/rfsn-055-preview-validation.mts
 *
 * ESPN 457622 only. Defaults to Preview. Does not touch Production.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const PREVIEW_HOST = "sprint-8-preview.fantasyfootballrivals.com";
const BASE = `https://${PREVIEW_HOST}`;
const OUT_DIR = path.resolve("audit-artifacts/rfsn-055");
const OUT_MD = path.join(OUT_DIR, "RFSN-055-preview-validation.md");
const OUT_JSON = path.join(OUT_DIR, "RFSN-055-preview-validation.json");
const ESPN_LEAGUE = "457622";
const GAP_MS = 6500;
const OWNER_RE =
  /demetri|lozell|rod sellers|bruce|graham|nate west|randy|maurice|hibbard|deroux|christian|tony dorsey|teco|steffon|vince|sheldon|jan graham/i;

type LiveLeague = {
  id: number;
  provider: string;
  leagueId: string;
  leagueName: string | null;
};

type ProbeRow = {
  question: string;
  kind: "adp" | "board" | "thin-adp";
  answer: string;
  tool?: string;
  intent?: string;
  llmInvoked?: boolean;
  verdict: "PASS" | "FAIL";
  failures: string[];
};

const QUESTIONS: Array<{ question: string; kind: ProbeRow["kind"] }> = [
  { question: "Who reaches the most?", kind: "adp" },
  { question: "What was the biggest reach ever?", kind: "adp" },
  { question: "What was the biggest steal?", kind: "adp" },
  { question: "Who drafts QBs early?", kind: "board" },
  { question: "Who waits on QB?", kind: "board" },
  { question: "Who loves RBs?", kind: "board" },
  { question: "Who drafts safest?", kind: "adp" },
  { question: "Who gambles the most?", kind: "adp" },
  { question: "Who reached the most in 2010?", kind: "thin-adp" },
];

function genericFails(message: string): string[] {
  const failures: string[] = [];
  if (!message || message.length < 12) failures.push("empty or short response");
  if (/i don't have that information|as an ai language model|as a language model/i.test(message)) {
    failures.push("generic LLM missing-data fallback");
  }
  if (/lacks draft strategy|does not have recorded draft strategy/i.test(message)) {
    failures.push("pretended the league has no draft history/strategy");
  }
  if (/\ball-time\b/i.test(message) && !/not all-time/i.test(message)) {
    failures.push("unqualified all-time");
  }
  if (/ADP\s*1(?:6[0-9]|7[0-1])(?:\.\d+)?/i.test(message)) {
    failures.push("undrafted-sentinel ADP leaked into answer");
  }
  if (/gambler|madman|reckless|baller|personality/i.test(message)) {
    failures.push("invented personality filler");
  }
  return failures;
}

function failuresFor(kind: ProbeRow["kind"], message: string, tool?: string, llmInvoked?: boolean): string[] {
  const failures = genericFails(message);
  const honestyOnly =
    /adp is not available for those seasons/i.test(message) &&
    /recorded draft history covers/i.test(message);
  if (tool && tool !== "query_draft_intelligence") {
    failures.push(`unexpected tool ${tool}`);
  }
  if (!tool) failures.push("missing query_draft_intelligence tool");
  if (llmInvoked) failures.push("LLM invoked for deterministic draft ranking");
  if (!/20\d{2}/.test(message)) failures.push("no coverage year");
  if (kind !== "thin-adp" && !honestyOnly && !OWNER_RE.test(message)) {
    failures.push("no recognizable founder owner");
  }

  if (kind === "adp" && !honestyOnly) {
    if (!/adp|reach|steal|pick/i.test(message)) failures.push("missing pick/ADP/reach language");
    if (
      /biggest reach|largest reach|steal/i.test(message) &&
      !/pick\s+\d+/i.test(message) &&
      !/ADP\s+\d/i.test(message)
    ) {
      failures.push("reach/steal answer missing pick or ADP number");
    }
    if (
      !/draft reach data is available|adp-joined|avg reach|reach frequency|largest reach|largest steal/i.test(
        message,
      )
    ) {
      failures.push("not a deterministic ADP draft-intelligence answer");
    }
  }

  if (kind === "board") {
    if (!/round/i.test(message)) failures.push("positional timing missing round");
    if (/loves rbs/i.test(message)) failures.push("echoed 'loves RBs' personality instead of recorded rounds");
    if (!/recorded draft coverage|across recorded drafts/i.test(message)) {
      failures.push("board-only timing missing coverage phrasing");
    }
  }

  if (kind === "thin-adp") {
    if (!/2010/.test(message)) failures.push("2010 coverage missing");
    if (
      !/adp is not available|preserved without reliable adp|draft reach data is available/i.test(message)
    ) {
      failures.push("thin-ADP season did not return coverage honesty");
    }
    if (/lacks draft strategy/i.test(message)) {
      failures.push("thin ADP described as no draft strategy");
    }
  }

  return failures;
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

async function chat(page: Page, leagueId: string, message: string) {
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
    tool: chatOut?.tool as string | undefined,
    intent: chatOut?.meta?.intent as string | undefined,
    llmInvoked: Boolean(chatOut?.meta?.llmInvoked),
  };
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
      (url) => url.hostname === PREVIEW_HOST && !url.pathname.includes("sign-in"),
      { timeout: 90_000 },
    );
    if (new URL(page.url()).hostname !== PREVIEW_HOST) {
      throw new Error(`Abort: landed on ${page.url()} — expected ${PREVIEW_HOST}`);
    }
    await page.waitForTimeout(2500);

    health = (await page.evaluate(async () => {
      const res = await fetch("/api/health", { credentials: "include" });
      return res.json();
    })) as Record<string, unknown>;
    console.log(
      `host=${new URL(page.url()).hostname} health buildTime=${String(health?.buildTime ?? "?")} gitSha=${String(health?.gitSha ?? "?").slice(0, 12)}`,
    );

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
    await page.waitForTimeout(800);

    await clearHistory(page, ESPN_LEAGUE);

    for (const q of QUESTIONS) {
      await waitGap();
      const out = await chat(page, ESPN_LEAGUE, q.question);
      lastAt = Date.now();
      const failures = failuresFor(q.kind, out.message, out.tool, out.llmInvoked);
      if (out.intent && out.intent !== "draft_intelligence") {
        failures.push(`intent ${out.intent}, expected draft_intelligence`);
      }
      const row: ProbeRow = {
        question: q.question,
        kind: q.kind,
        answer: out.message,
        tool: out.tool,
        intent: out.intent,
        llmInvoked: out.llmInvoked,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
      };
      rows.push(row);
      console.log(
        `${row.verdict} | ${q.question}\n  ${(out.message || "").replace(/\s+/g, " ").slice(0, 320)}${
          failures.length ? `\n  !! ${failures.join("; ")}` : ""
        }`,
      );
    }
  } finally {
    await browser.close();
  }

  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const fail = rows.filter((r) => r.verdict === "FAIL").length;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const md = [
    `# RFSN-055 — Preview validation`,
    ``,
    `**Host:** \`${BASE}\``,
    `**buildTime:** \`${String(health?.buildTime ?? "?")}\``,
    `**gitSha (may be stale):** \`${String(health?.gitSha ?? "?")}\``,
    `**Live ESPN 457622:** ${pass} PASS / ${fail} FAIL`,
    `**Founder:** Clerk \`user_3E8K7ihI9tYXU06UJ5BfeCsg1bo\``,
    ``,
    `| Question | Kind | Tool | Answer | PASS/FAIL |`,
    `| --- | --- | --- | --- | --- |`,
    ...rows.map(
      (r) =>
        `| ${r.question.replace(/\|/g, "\\|")} | ${r.kind} | ${r.tool ?? ""} | ${r.answer
          .replace(/\|/g, "\\|")
          .replace(/\n/g, "<br>")
          .slice(0, 900)} | ${r.verdict}${r.failures.length ? ` (${r.failures.join("; ")})` : ""} |`,
    ),
    ``,
  ].join("\n");
  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(OUT_JSON, JSON.stringify({ host: BASE, health, rows }, null, 2));
  console.log(`Wrote ${OUT_MD}`);
  if (fail) {
    console.error(`\nFAIL ${fail}/${rows.length}.`);
    process.exit(1);
  }
  console.log(`\nPreview 055 validation ${pass}/${rows.length} PASS.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
