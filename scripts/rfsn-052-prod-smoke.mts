/**
 * RFSN-052 Production close-out smoke.
 * Five first-answer probes vs Preview on ESPN 457622.
 *
 *   npx tsx scripts/rfsn-052-prod-smoke.mts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const PREVIEW = "https://sprint-8-preview.fantasyfootballrivals.com";
const PROD = (process.env.QA_BASE ?? "https://www.fantasyfootballrivals.com").replace(/\/$/, "");
const OUT = path.resolve("audit-artifacts/rfsn-052/RFSN-052-production-close.md");

const QUESTIONS = [
  "How many championships does LOZELL STYLES have?",
  "Compare Demetri Clark and LOZELL STYLES.",
  "Check their head-to-head stats.",
  "Who has the most one-point losses?",
  "Who has the most 50-point blowout wins?",
] as const;

type LiveLeague = { id: number; provider: string; leagueId: string; leagueName: string | null };

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function coreFacts(q: string, a: string): string[] {
  const fails: string[] = [];
  if (/championship/i.test(q) && /lozell/i.test(q) && !/most championships/i.test(q)) {
    if (!/lozell/i.test(a)) fails.push("LOZELL missing");
    if (!/\b2\b/.test(a)) fails.push("expected 2 titles");
    if (!/2011/.test(a) || !/2021/.test(a)) fails.push("expected 2011 and 2021");
  }
  if (/compare demetri/i.test(q) || /head-to-head/i.test(q)) {
    if (!/demetri/i.test(a) || !/lozell/i.test(a)) fails.push("missing Demetri or LOZELL");
    if (/head-to-head/i.test(q) && /bruce/i.test(a)) fails.push("pronoun resolved Bruce");
    if (!/regular season/i.test(a) || !/playoffs?/i.test(a)) fails.push("RS/PO not labeled");
  }
  if (/one-point/i.test(q) && !/deroux/i.test(a)) fails.push("expected Mark Deroux");
  if (/50-point|blowout/i.test(q) && !/graham/i.test(a)) fails.push("expected Christian Graham");
  if (/i don't have that information/i.test(a)) fails.push("generic missing-data");
  return fails;
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
  if (data.url) {
    const u = new URL(data.url);
    u.protocol = "https:";
    u.host = new URL(base).host;
    return u.toString();
  }
  return `${base}/sign-in?__clerk_ticket=${encodeURIComponent(data.token!)}`;
}

async function askHost(base: string, label: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const answers: Array<{ question: string; answer: string; tool?: string }> = [];
  try {
    await page.goto(await mintUrl(base), { waitUntil: "domcontentloaded", timeout: 90_000 });
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
    const espn = leagues.find((l) => l.provider === "espn" && l.leagueId === "457622");
    if (!espn) throw new Error(`${label}: ESPN 457622 not connected`);
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
    let lastAt = 0;
    for (const question of QUESTIONS) {
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
        { leagueId: espn.leagueId, message: question },
      );
      lastAt = Date.now();
      answers.push({
        question,
        answer: String(chatOut?.message ?? chatOut?.error ?? JSON.stringify(chatOut)).slice(0, 2500),
        tool: chatOut?.tool,
      });
      console.log(`${label} | ${question}\n  ${String(chatOut?.message ?? "").slice(0, 240)}`);
    }
  } finally {
    await browser.close();
  }
  return answers;
}

async function health(url: string) {
  try {
    const h = await fetch(`${url}/api/health`);
    return (await h.json()) as { gitSha?: string; buildTime?: string; gitBranch?: string };
  } catch {
    return {};
  }
}

async function main() {
  const previewH = await health(PREVIEW);
  const prodH = await health(PROD);
  console.log(`Preview buildTime=${previewH.buildTime} sha=${previewH.gitSha}`);
  console.log(`Prod     buildTime=${prodH.buildTime} sha=${prodH.gitSha} branch=${prodH.gitBranch}`);

  const preview = await askHost(PREVIEW, "PREVIEW");
  const prod = await askHost(PROD, "PROD");

  const rows = QUESTIONS.map((q, i) => {
    const p = preview[i]!;
    const o = prod[i]!;
    const factFails = coreFacts(q, o.answer);
    const previewFacts = coreFacts(q, p.answer);
    const previewOk = previewFacts.length === 0;
    const sameCore =
      factFails.length === 0 &&
      previewOk &&
      (/lozell/i.test(q)
        ? /2/.test(p.answer) && /2/.test(o.answer)
        : true);
    let verdict: "PASS" | "FAIL" = factFails.length === 0 && previewOk ? "PASS" : "FAIL";
    if (/compare|head-to-head/i.test(q)) {
      const pRs = p.answer.match(/regular season:[^\n.]+/i)?.[0] ?? "";
      const oRs = o.answer.match(/regular season:[^\n.]+/i)?.[0] ?? "";
      const pPo = p.answer.match(/playoffs?:[^\n.]+/i)?.[0] ?? "";
      const oPo = o.answer.match(/playoffs?:[^\n.]+/i)?.[0] ?? "";
      if (norm(pRs).toLowerCase() !== norm(oRs).toLowerCase() || norm(pPo).toLowerCase() !== norm(oPo).toLowerCase()) {
        verdict = "FAIL";
        factFails.push("RS/PO line mismatch vs Preview");
      }
    }
    if (/one-point/i.test(q) && !/mark deroux has the most one-point losses: 4/i.test(o.answer)) {
      verdict = "FAIL";
      factFails.push("one-point leader/count mismatch");
    }
    if (/50-point|blowout/i.test(q) && !/christian graham has the most wins by 50\+ points: 32/i.test(o.answer)) {
      verdict = "FAIL";
      factFails.push("blowout leader/count mismatch");
    }
    if (/championship/i.test(q) && /lozell/i.test(q) && !/most championships/i.test(q)) {
      if (!/2 championships \(2011, 2021\)/i.test(o.answer) || !/2 championships \(2011, 2021\)/i.test(p.answer)) {
        verdict = "FAIL";
        factFails.push("LOZELL title line mismatch");
      }
    }
    return {
      question: q,
      preview: p.answer,
      production: o.answer,
      verdict,
      failures: factFails,
      sameCore,
    };
  });

  const fail = rows.filter((r) => r.verdict === "FAIL").length;
  const md = [
    `# RFSN-052 — Production close-out`,
    ``,
    `- Preview: \`${PREVIEW}\` · buildTime=${previewH.buildTime ?? "?"} · gitSha=${previewH.gitSha ?? "?"}`,
    `- Production: \`${PROD}\` · buildTime=${prodH.buildTime ?? "?"} · gitSha=${prodH.gitSha ?? "?"} · branch=${prodH.gitBranch ?? "?"}`,
    `- ESPN 457622 first-answer smoke: ${rows.length - fail}/${rows.length} PASS`,
    ``,
    `| Question | Preview | Production | PASS/FAIL |`,
    `| --- | --- | --- | --- |`,
    ...rows.map(
      (r) =>
        `| ${r.question.replace(/\|/g, "\\|")} | ${r.preview.replace(/\|/g, "\\|").replace(/\n/g, "<br>").slice(0, 400)} | ${r.production.replace(/\|/g, "\\|").replace(/\n/g, "<br>").slice(0, 400)} | ${r.verdict}${
          r.failures.length ? ` (${r.failures.join("; ")})` : ""
        } |`,
    ),
    ``,
    fail === 0
      ? `**RFSN-052 CLOSED.** Production first answers match Preview on the five smoke probes.`
      : `**RFSN-052 NOT CLOSED.** Production smoke failed ${fail} probe(s).`,
    ``,
  ].join("\n");
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, md);
  console.log(`Wrote ${OUT}`);
  if (fail) {
    console.error(`FAIL ${fail}`);
    process.exit(1);
  }
  console.log("RFSN-052 CLOSED — Production smoke matched Preview.");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
