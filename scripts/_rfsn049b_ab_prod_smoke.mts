/**
 * RFSN-049/B production A/B validation — intent + prompt size + OpenAI usage + quality.
 *
 * Requires advisor.chat `meta` telemetry (classification, systemApproxTok, promptTokens…).
 * Clears chat history before each question for a fresh session.
 *
 *   QA_BASE=https://www.fantasyfootballrivals.com pnpm exec tsx scripts/_rfsn049b_ab_prod_smoke.mts
 */
import "dotenv/config";
import { chromium, type Page } from "playwright";
import { classifyAdvisorQuestion } from "../server/advisorQuestionClassify";
import fs from "node:fs";

const BASE = (
  process.env.QA_BASE ?? "https://www.fantasyfootballrivals.com"
).replace(/\/$/, "");
const FOUNDER_CLERK_ID =
  process.env.SMOKE_CLERK_USER_ID ?? "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo";
const ESPN_LEAGUE = "457622";
const OUT = "scripts/_rfsn049b_ab_prod_smoke_results.json";

type Meta = {
  classification?: string;
  systemChars?: number;
  systemApproxTok?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  model?: string | null;
  llmInvoked?: boolean;
  latencyMs?: number;
};

type Quality = {
  facts: "PASS" | "FAIL" | "DEGRADED";
  footballReasoning: "PASS" | "FAIL" | "DEGRADED";
  entertainment: "PASS" | "FAIL" | "DEGRADED";
  relevance: "PASS" | "FAIL" | "DEGRADED";
  notes: string;
};

type Row = {
  id: string;
  question: string;
  expectedIntent: string;
  expectedSystemTokApprox: number | null;
  localClassify: string;
  meta: Meta | null;
  tool?: string;
  answer: string;
  error?: string;
  quality?: Quality;
  tokenVerdict?: string;
};

const CORE: Array<{
  id: string;
  q: string;
  intent: string;
  sysTok: number;
}> = [
  { id: "A", q: "Who should I start at WR2?", intent: "START_SIT", sysTok: 990 },
  { id: "B", q: "How can I improve my team?", intent: "TEAM_IMPROVEMENT", sysTok: 990 },
  { id: "C", q: "How am I doing?", intent: "GENERAL_SMALL", sysTok: 990 },
  { id: "D", q: "Who is my biggest threat right now?", intent: "CURRENT_LEAGUE", sysTok: 990 },
  { id: "E", q: "Should I trade for Justin Jefferson?", intent: "TRADE_STRATEGY", sysTok: 2617 },
  { id: "F", q: "Why do I always lose to Bruce?", intent: "RIVALRY_HISTORY", sysTok: 3029 },
  { id: "G", q: "Who is the greatest owner in league history?", intent: "LEAGUE_HISTORY", sysTok: 1549 },
  { id: "H", q: "Tell me everything about my franchise.", intent: "GENERAL_FULL", sysTok: 3650 },
];

const BOUNDARY = [
  "Should I start Higgins or trade him?",
  "Why is Bruce my biggest threat right now?",
  "How can I improve compared with Vince?",
  "What do you think about my franchise?",
  "Am I good enough to win another championship?",
  "Tell me about my team.",
];

const DETERMINISTIC = [
  "Who has the most one-point losses?",
  "What was the closest game?",
];

async function mintFounderSignInUrl(): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error("CLERK_SECRET_KEY missing");
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: FOUNDER_CLERK_ID, expires_in_seconds: 600 }),
  });
  if (!res.ok) throw new Error(`Clerk token mint failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { url?: string; token?: string };
  if (data.url) {
    const u = new URL(data.url);
    u.protocol = "https:";
    u.host = new URL(BASE).host;
    return u.toString();
  }
  if (!data.token) throw new Error("Clerk token response missing url/token");
  return `${BASE}/sign-in?__clerk_ticket=${encodeURIComponent(data.token)}`;
}

async function trpcMutate<T>(page: Page, path: string, input: unknown): Promise<T> {
  return page.evaluate(
    async ({ path, input }) => {
      const res = await fetch(`/api/trpc/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      });
      const body = await res.json();
      if (body?.error) throw new Error(JSON.stringify(body.error));
      return (body?.result?.data?.json ?? body?.result?.data) as T;
    },
    { path, input },
  );
}

async function trpcQuery<T>(page: Page, path: string, input: unknown = null): Promise<T> {
  return page.evaluate(
    async ({ path, input }) => {
      const res = await fetch(
        `/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`,
        { credentials: "include" },
      );
      const body = await res.json();
      if (body?.error) throw new Error(JSON.stringify(body.error));
      return (body?.result?.data?.json ?? body?.result?.data) as T;
    },
    { path, input },
  );
}

function scoreQuality(id: string, question: string, intent: string, answer: string): Quality {
  const a = answer.trim();
  const notes: string[] = [];
  let facts: Quality["facts"] = "PASS";
  let footballReasoning: Quality["footballReasoning"] = "PASS";
  let entertainment: Quality["entertainment"] = "PASS";
  let relevance: Quality["relevance"] = "PASS";

  if (a.length < 60) {
    facts = "FAIL";
    entertainment = "FAIL";
    notes.push("answer too short");
  }
  if (/as an ai language model|i don't have access to your|cannot access/i.test(a)) {
    facts = "FAIL";
    entertainment = "FAIL";
    notes.push("generic AI refusal");
  }
  if (!/[.!?]/.test(a) || /^\s*\{/.test(a)) {
    entertainment = "DEGRADED";
    notes.push("flat/robotic tone cues");
  }
  if (!/\b(because|since|given|with|looking at|based on|edge|VORP|matchup|depth|roster|record|championship|trade|start|sit|upgrade|weakness)\b/i.test(a)) {
    footballReasoning = "DEGRADED";
    notes.push("weak why/reasoning cues");
  }

  // Intent-specific grounding
  if (intent === "RIVALRY_HISTORY" || /Bruce/i.test(question)) {
    if (!/Bruce/i.test(a)) {
      facts = "FAIL";
      notes.push("missing Bruce");
    }
  }
  if (intent === "TRADE_STRATEGY" || /Jefferson/i.test(question)) {
    if (!/Jefferson/i.test(a)) {
      facts = "DEGRADED";
      notes.push("Jefferson not named");
    }
  }
  if (intent === "LEAGUE_HISTORY" && !/(champion|title|owner|history|greatest|trophy|win)/i.test(a)) {
    facts = "DEGRADED";
    notes.push("thin history grounding");
  }
  if (
    (intent === "START_SIT" || intent === "TEAM_IMPROVEMENT" || intent === "GENERAL_SMALL" || intent === "CURRENT_LEAGUE") &&
    /\b(2009|2010|2011|2012|2013|2014)\b/.test(a) &&
    !/championship window|path to|legacy/i.test(question)
  ) {
    relevance = "DEGRADED";
    notes.push("unprompted deep history years in coaching answer");
  }
  if (intent === "START_SIT" && !/(start|WR|receiver|sit|bench|flex|lineup)/i.test(a)) {
    relevance = "DEGRADED";
    notes.push("weak start/sit focus");
  }
  if (/Rod|Str8FrmHell|ATLANTAS|league/i.test(a)) {
    notes.push("league/owner grounding present");
  }

  return { facts, footballReasoning, entertainment, relevance, notes: notes.join("; ") || "ok" };
}

function tokenVerdict(row: Row): string {
  const m = row.meta;
  if (!m) return "NO_META";
  if (m.llmInvoked === false) return "ZERO_LLM";
  const sys = m.systemApproxTok ?? 0;
  const prompt = m.promptTokens ?? 0;
  const exp = row.expectedSystemTokApprox;
  if (exp == null) return `sys≈${sys} prompt=${prompt}`;
  const sysOk = Math.abs(sys - exp) <= Math.max(250, exp * 0.25);
  // Fresh session: prompt should be roughly system + small user/history overhead
  const coaching = exp <= 1100;
  const promptOk = coaching
    ? prompt > 0 && prompt < 2800 // was ~4414 full bag
    : prompt > 0;
  if (sysOk && promptOk && coaching && prompt < 2800) return "SAVINGS_CONFIRMED";
  if (sysOk && promptOk) return "SIZE_OK";
  if (!sysOk) return `SYS_MISMATCH expected≈${exp} got=${sys}`;
  return `PROMPT_CHECK sys=${sys} prompt=${prompt}`;
}

async function askFresh(
  page: Page,
  question: string,
): Promise<{ message: string; tool?: string; meta?: Meta }> {
  await trpcMutate(page, "advisor.clearHistory", { activeLeagueKey: ESPN_LEAGUE });
  await page.waitForTimeout(500);
  return trpcMutate(page, "advisor.chat", {
    message: question,
    season: 2025,
    activeLeagueKey: ESPN_LEAGUE,
  });
}

async function main() {
  const health = (await (await fetch(`${BASE}/api/health`)).json()) as {
    gitSha?: string;
    gitBranch?: string;
  };
  console.log(`BASE=${BASE} sha=${health.gitSha} branch=${health.gitBranch}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const signInUrl = await mintFounderSignInUrl();
  await page.goto(signInUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForURL(
    (url) =>
      url.hostname.includes("fantasyfootballrivals.com") &&
      !url.pathname.includes("sign-in"),
    { timeout: 90_000 },
  );
  await page.waitForTimeout(2500);

  // Ensure ESPN active
  const leagues = await trpcQuery<
    Array<{ id: number; provider: string; leagueId: string }>
  >(page, "league.getMyLeagues", null);
  const espn = leagues.find((l) => l.leagueId === ESPN_LEAGUE);
  if (!espn) throw new Error("ESPN 457622 not connected");
  await trpcMutate(page, "league.setActive", { leagueConnectionId: espn.id });

  const rows: Row[] = [];

  console.log("=== CORE A–H ===");
  for (const item of CORE) {
    const localClassify = classifyAdvisorQuestion(item.q);
    const row: Row = {
      id: item.id,
      question: item.q,
      expectedIntent: item.intent,
      expectedSystemTokApprox: item.sysTok,
      localClassify,
      meta: null,
      answer: "",
    };
    try {
      await page.waitForTimeout(5500);
      const out = await askFresh(page, item.q);
      row.answer = out.message ?? "";
      row.meta = out.meta ?? null;
      row.tool = out.tool;
      row.quality = scoreQuality(item.id, item.q, item.intent, row.answer);
      row.tokenVerdict = tokenVerdict(row);
      console.log(
        `${item.id} intent=${row.meta?.classification ?? localClassify} sys≈${row.meta?.systemApproxTok} prompt=${row.meta?.promptTokens} llm=${row.meta?.llmInvoked} model=${row.meta?.model} ${row.tokenVerdict}`,
      );
      console.log(`  answer: ${row.answer.slice(0, 180).replace(/\s+/g, " ")}…`);
    } catch (e) {
      row.error = (e as Error).message;
      console.log(`${item.id} ERROR ${(e as Error).message.slice(0, 200)}`);
    }
    rows.push(row);
  }

  console.log("\n=== BOUNDARY ===");
  for (const [i, q] of BOUNDARY.entries()) {
    const localClassify = classifyAdvisorQuestion(q);
    const row: Row = {
      id: `BND-${i + 1}`,
      question: q,
      expectedIntent: "(boundary)",
      expectedSystemTokApprox: null,
      localClassify,
      meta: null,
      answer: "",
    };
    try {
      await page.waitForTimeout(5500);
      const out = await askFresh(page, q);
      row.answer = out.message ?? "";
      row.meta = out.meta ?? null;
      row.quality = scoreQuality(row.id, q, localClassify, row.answer);
      row.tokenVerdict = tokenVerdict(row);
      // Missing-info bug heuristic: rivalry name required but absent
      if (/Vince|Bruce/i.test(q) && !new RegExp(q.match(/Vince|Bruce/i)?.[0] ?? "___", "i").test(row.answer)) {
        row.quality.facts = "FAIL";
        row.quality.notes += "; missing named rival in answer";
      }
      console.log(
        `${row.id} class=${row.meta?.classification ?? localClassify} sys≈${row.meta?.systemApproxTok} prompt=${row.meta?.promptTokens} | ${row.answer.slice(0, 140).replace(/\s+/g, " ")}`,
      );
    } catch (e) {
      row.error = (e as Error).message;
      console.log(`${row.id} ERROR ${(e as Error).message.slice(0, 200)}`);
    }
    rows.push(row);
  }

  console.log("\n=== DETERMINISTIC ===");
  for (const [i, q] of DETERMINISTIC.entries()) {
    const localClassify = classifyAdvisorQuestion(q);
    const row: Row = {
      id: `DET-${i + 1}`,
      question: q,
      expectedIntent: "deterministic",
      expectedSystemTokApprox: 0,
      localClassify,
      meta: null,
      answer: "",
    };
    try {
      await page.waitForTimeout(2000);
      const out = await askFresh(page, q);
      row.answer = out.message ?? "";
      row.meta = out.meta ?? null;
      row.tool = out.tool;
      row.tokenVerdict = tokenVerdict(row);
      const ok =
        row.meta?.llmInvoked === false &&
        (row.meta?.promptTokens ?? 0) === 0 &&
        Boolean(row.tool);
      console.log(
        `${row.id} llmInvoked=${row.meta?.llmInvoked} tool=${row.tool} prompt=${row.meta?.promptTokens} ${ok ? "PASS_ZERO_LLM" : "FAIL_LLM_USED"}`,
      );
      console.log(`  ${row.answer.slice(0, 200)}`);
    } catch (e) {
      row.error = (e as Error).message;
      console.log(`${row.id} ERROR ${(e as Error).message.slice(0, 200)}`);
    }
    rows.push(row);
  }

  await browser.close();

  const payload = {
    observedSha: health.gitSha,
    branch: health.gitBranch,
    base: BASE,
    ranAt: new Date().toISOString(),
    rows,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${OUT}`);

  // Summary table
  console.log("\n| ID | Intent | Sys≈ | OpenAI prompt | Comp | Total | LLM | Verdict | Quality |");
  console.log("| -- | ------ | ---: | ------------: | ---: | ----: | --- | ------- | ------- |");
  for (const r of rows) {
    const q =
      r.quality
        ? `F:${r.quality.facts}/R:${r.quality.footballReasoning}/E:${r.quality.entertainment}/Rel:${r.quality.relevance}`
        : r.error
          ? "ERROR"
          : "—";
    console.log(
      `| ${r.id} | ${r.meta?.classification ?? r.localClassify} | ${r.meta?.systemApproxTok ?? "?"} | ${r.meta?.promptTokens ?? "?"} | ${r.meta?.completionTokens ?? "?"} | ${r.meta?.totalTokens ?? "?"} | ${r.meta?.llmInvoked ?? "?"} | ${r.tokenVerdict ?? r.error?.slice(0, 40) ?? "?"} | ${q} |`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
