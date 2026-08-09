/**
 * RFSN-052H — Live Preview validation for the four historical evidence gaps.
 *
 *   npx tsx scripts/rfsn-052h-preview-validation.mts
 *
 * ESPN 457622 only. League-switch runs only when real Sleeper/Workbook
 * connections exist. Does not fabricate those providers. Does not touch Production.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const BASE = (
  process.env.QA_BASE ?? "https://sprint-8-preview.fantasyfootballrivals.com"
).replace(/\/$/, "");
const OUT_DIR = path.resolve("audit-artifacts/rfsn-052");
const OUT_MD = path.join(OUT_DIR, "RFSN-052H-live-gaps.md");
const OUT_JSON = path.join(OUT_DIR, "RFSN-052H-live-gaps.json");

type LiveLeague = {
  id: number;
  provider: string;
  leagueId: string;
  leagueName: string | null;
};

type ProbeRow = {
  question: string;
  answer: string;
  tool?: string;
  verdict: "PASS" | "FAIL" | "SKIP";
  failures: string[];
};

const ESPN_SEQUENCE = [
  "How many championships does LOZELL STYLES have?",
  "Compare Demetri Clark and LOZELL STYLES.",
  "Check their head-to-head stats.",
  "Who has the most championships?",
  "Who has the most playoff eliminations?",
  "Who has the best career winning percentage?",
  "Who has the worst career record?",
  "Who has the most one-point losses?",
  "Who has the most 50-point blowout wins?",
] as const;

function failuresFor(question: string, message: string): string[] {
  const failures: string[] = [];
  const a = message.toLowerCase();
  if (!message || message.length < 20) failures.push("empty or short response");
  if (/i don't have that information|as an ai language model/i.test(message)) {
    failures.push("generic LLM missing-data fallback");
  }
  if (/let me (correct|recheck|update)|on second thought|i was wrong/i.test(message)) {
    failures.push("self-correction instead of first-answer authority");
  }
  if (/\ball-time\b/i.test(message) && !/not all-time/i.test(message)) {
    failures.push("unqualified all-time");
  }

  if (/lozell/i.test(question) && /championship/i.test(question)) {
    if (!/lozell/i.test(message)) failures.push("LOZELL missing from championship answer");
    if (!/\b2\b/.test(message) && !/two/i.test(message)) failures.push("expected 2 LOZELL titles");
    if (!/2011/.test(message) || !/2021/.test(message)) failures.push("expected 2011 and 2021");
  }

  if (/compare demetri/i.test(question)) {
    if (!/demetri/i.test(message) || !/lozell/i.test(message)) {
      failures.push("compare answer missing Demetri or LOZELL");
    }
    if (!/regular season/i.test(message) || !/playoffs?/i.test(message)) {
      failures.push("compare not labeled RS vs playoffs");
    }
  }

  if (/head-to-head/i.test(question)) {
    if (!/demetri/i.test(message) || !/lozell/i.test(message)) {
      failures.push("follow-up H2H lost Demetri + LOZELL");
    }
    if (/bruce/i.test(message)) failures.push("follow-up H2H resolved Bruce instead of LOZELL");
    if (!/regular season/i.test(message) || !/playoffs?/i.test(message)) {
      failures.push("follow-up H2H not labeled RS vs playoffs");
    }
  }

  if (/most championships\?$/i.test(question)) {
    if (!/championship totals/i.test(message) && !/^\s*1\./m.test(message) && !/\n1\./.test(message)) {
      failures.push("unnamed most-championships is not a leaderboard");
    }
    if (/has more championships/i.test(message)) {
      failures.push("unnamed most-championships became a two-owner compare");
    }
  }

  if (/playoff eliminations/i.test(question)) {
    if (/does not have recorded playoff eliminations/i.test(message)) {
      failures.push("false missing-dataset; Rivalry/H2H playoff meetings exist");
    }
    if (!/playoff/i.test(a)) failures.push("elim answer not labeled playoffs");
  }

  if (/winning percentage/i.test(question) || /worst career/i.test(question)) {
    if (/does not have recorded career records/i.test(message)) {
      failures.push("false missing-dataset; HoF/owner records exist");
    }
    if (!/regular season/i.test(a) && !/win/i.test(a)) {
      failures.push("career answer missing regular-season record");
    }
  }

  if (/one-point losses/i.test(question) && !/deroux|nate west|one-point/i.test(a)) {
    failures.push("one-point losses answer missing expected owner/metric");
  }
  if (/50-point blowout|blowout wins/i.test(question) && !/graham|blowout|50/i.test(a)) {
    failures.push("blowout answer missing expected owner/metric");
  }

  return failures;
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    throw new Error("CLERK_SECRET_KEY required");
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
  const rows: ProbeRow[] = [];
  let connections: LiveLeague[] = [];
  try {
    await page.goto(signInUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForURL(
      (url) => url.hostname.includes("fantasyfootballrivals.com") && !url.pathname.includes("sign-in"),
      { timeout: 90_000 },
    );
    await page.waitForTimeout(2500);

    connections = (await page.evaluate(async () => {
      const res = await fetch(
        `/api/trpc/league.getMyLeagues?input=${encodeURIComponent(JSON.stringify({ json: null }))}`,
        { credentials: "include" },
      );
      const body = await res.json();
      return (body?.result?.data?.json ?? body?.result?.data ?? []) as LiveLeague[];
    })) as LiveLeague[];

    console.log(
      `Connections (${connections.length}): ${
        connections.map((l) => `${l.provider}:${l.leagueId}:${l.leagueName ?? "?"}`).join(" | ") || "(none)"
      }`,
    );

    const espn = connections.find((l) => l.provider === "espn" && l.leagueId === "457622");
    const sleeper = connections.find((l) => l.provider === "sleeper");
    const workbook = connections.find((l) => l.provider === "sleeper_workbook");
    if (!espn) {
      rows.push({
        question: "[setup] ESPN 457622",
        answer: "Not connected on founder Preview",
        verdict: "FAIL",
        failures: ["ESPN 457622 required"],
      });
      throw new Error("ESPN 457622 not connected");
    }

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
    for (const question of ESPN_SEQUENCE) {
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
      const message = String(chatOut?.message ?? chatOut?.error ?? JSON.stringify(chatOut)).slice(0, 4000);
      const fails = failuresFor(question, message);
      rows.push({
        question,
        answer: message,
        tool: chatOut?.tool,
        verdict: fails.length ? "FAIL" : "PASS",
        failures: fails,
      });
      console.log(
        `${fails.length ? "FAIL" : "PASS"} | ${question}\n  ${message.slice(0, 280)}${
          fails.length ? `\n  !! ${fails.join("; ")}` : ""
        }`,
      );
    }

    if (sleeper || workbook) {
      const other = sleeper ?? workbook!;
      await page.evaluate(async ({ id }) => {
        const res = await fetch(`/api/trpc/league.setActive`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ json: { leagueConnectionId: id } }),
        });
        const body = await res.json();
        if (body?.error) throw new Error(JSON.stringify(body.error));
      }, { id: other.id });
      await page.waitForTimeout(800);
      const elapsed = Date.now() - lastAt;
      if (elapsed < 6500) await page.waitForTimeout(6500 - elapsed);
      const follow = await page.evaluate(
        async ({ leagueId }) => {
          const chat = await fetch(`/api/trpc/advisor.chat`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              json: { message: "Check their head-to-head stats.", activeLeagueKey: leagueId },
            }),
          });
          const chatBody = await chat.json();
          return chatBody?.result?.data?.json ?? chatBody?.result?.data ?? chatBody;
        },
        { leagueId: other.leagueId },
      );
      const msg = String(follow?.message ?? "");
      const leak = /\b(Demetri Clark|LOZELL STYLES|LOZELL|Bruce Edwards)\b/i.test(msg);
      rows.push({
        question: `Check their head-to-head stats. (switch ESPN → ${other.provider})`,
        answer: msg,
        tool: follow?.tool,
        verdict: leak ? "FAIL" : "PASS",
        failures: leak ? ["ESPN owner pair leaked after league switch"] : [],
      });
      console.log(
        `${leak ? "FAIL" : "PASS"} | switch ESPN → ${other.provider}\n  ${msg.slice(0, 240)}`,
      );
    } else {
      rows.push({
        question: "[switch] Sleeper / Workbook",
        answer: "No Sleeper API or Workbook connection on founder Preview — not fabricated.",
        verdict: "SKIP",
        failures: [],
      });
      console.log("SKIP | league-switch (no Sleeper/Workbook on Preview)");
    }
  } finally {
    await browser.close();
  }

  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const fail = rows.filter((r) => r.verdict === "FAIL").length;
  const skip = rows.filter((r) => r.verdict === "SKIP").length;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const md = [
    `# RFSN-052H — Close Live Historical Evidence Gaps`,
    ``,
    `**Preview host:** \`${BASE}\``,
    `**Live ESPN 457622:** ${pass} PASS / ${fail} FAIL / ${skip} SKIP`,
    `**Production:** not touched.`,
    ``,
    `| Question | Answer | PASS/FAIL |`,
    `| --- | --- | --- |`,
    ...rows.map(
      (r) =>
        `| ${r.question.replace(/\|/g, "\\|")} | ${r.answer.replace(/\|/g, "\\|").replace(/\n/g, "<br>").slice(0, 500)} | ${r.verdict}${
          r.failures.length ? ` (${r.failures.join("; ")})` : ""
        } |`,
    ),
    ``,
    `Connections: ${connections.map((l) => `${l.provider}:${l.leagueId}`).join(" · ") || "(none)"}`,
    ``,
    `**Stop for review. No Production push/deploy.**`,
    ``,
  ].join("\n");
  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(OUT_JSON, JSON.stringify({ previewHost: BASE, rows, connections }, null, 2));
  console.log(`Wrote ${OUT_MD}`);
  if (fail) {
    console.error(`\nFAIL ${fail}. Do not promote to Production.`);
    process.exit(1);
  }
  console.log("\nPreview ESPN 457622 gate PASS. Do not promote to Production.");
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
