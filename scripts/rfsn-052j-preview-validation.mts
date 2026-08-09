/**
 * RFSN-052J — Live Preview validation for partial-legacy championships.
 *
 *   npx tsx scripts/rfsn-052j-preview-validation.mts
 *
 * ESPN 457622 only. Does not touch Production.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const BASE = (
  process.env.QA_BASE ?? "https://sprint-8-preview.fantasyfootballrivals.com"
).replace(/\/$/, "");
const OUT_DIR = path.resolve("audit-artifacts/rfsn-052");
const OUT_MD = path.join(OUT_DIR, "RFSN-052J-live-preview.md");
const OUT_JSON = path.join(OUT_DIR, "RFSN-052J-live-preview.json");

type LiveLeague = {
  id: number;
  provider: string;
  leagueId: string;
  leagueName: string | null;
};

type HofHistoryRow = {
  season: number;
  resolvedChampionDisplay?: string | null;
  resolvedRunnerUpDisplay?: string | null;
  resolvedThirdDisplay?: string | null;
  championTeam?: string | null;
  runnerUpTeam?: string | null;
  thirdTeam?: string | null;
};

type HofLeaderboardRow = {
  displayName: string;
  titles: number;
  titleSeasons?: number[];
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
  "Who has the most championships?",
  "Who was runner-up in 2009?",
  "Who finished third in 2009?",
  "What was LOZELL’s 2009 regular-season record?",
  "What was the 2009 championship score?",
  "Who did LOZELL play in Week 8 of 2009?",
  "Compare Demetri Clark and LOZELL STYLES.",
] as const;

const PARTIAL_LEGACY_RE =
  /is preserved as a partial legacy season[\s\S]*final podium placement[\s\S]*detailed matchup history is unavailable/i;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function nameHit(answer: string, name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  const a = norm(answer);
  const tokens = norm(name).split(" ").filter((t) => t.length >= 3);
  if (!tokens.length) return a.includes(norm(name));
  return tokens.every((t) => a.includes(t));
}

function failuresFor(
  question: string,
  message: string,
  hof2009: HofHistoryRow | null,
  hofLb: HofLeaderboardRow[],
): string[] {
  const failures: string[] = [];
  if (!message || message.length < 12) failures.push("empty or short response");
  if (/i don't have that information|as an ai language model/i.test(message)) {
    failures.push("generic LLM missing-data fallback");
  }
  if (/\ball-time\b/i.test(message) && !/not all-time/i.test(message)) {
    failures.push("unqualified all-time");
  }

  if (/how many championships does lozell/i.test(question)) {
    if (!/lozell/i.test(message)) failures.push("LOZELL missing");
    if (!/\b3\b/.test(message) && !/three/i.test(message)) failures.push("expected 3 LOZELL titles");
    if (!/2009/.test(message) || !/2011/.test(message) || !/2021/.test(message)) {
      failures.push("expected 2009, 2011, and 2021");
    }
    if (!/championship history/i.test(message)) failures.push("missing championship-history coverage phrase");
    if (/league history from 2010/i.test(message)) failures.push("still using matchup coverage for titles");
  }

  if (/most championships\?$/i.test(question)) {
    if (!/championship totals/i.test(message) && !/\n?1\./.test(message)) {
      failures.push("unnamed most-championships is not a leaderboard");
    }
    if (/has more championships/i.test(message)) failures.push("became a two-owner compare");
    if (!/championship history/i.test(message)) failures.push("missing championship-history coverage phrase");
    const lozellHof = hofLb.find((r) => /lozell/i.test(r.displayName));
    if (lozellHof && !new RegExp(String(lozellHof.titles)).test(message)) {
      failures.push(`leaderboard LOZELL titles ${lozellHof.titles} missing from Advisor`);
    }
    if (hofLb[0] && !nameHit(message, hofLb[0].displayName)) {
      failures.push(`leaderboard top ${hofLb[0].displayName} missing from Advisor`);
    }
  }

  if (/runner-up in 2009/i.test(question)) {
    if (PARTIAL_LEGACY_RE.test(message)) failures.push("runner-up incorrectly treated as unsupported matchup");
    if (!/2009/.test(message)) failures.push("2009 missing");
    const expectName = hof2009?.resolvedRunnerUpDisplay || hof2009?.runnerUpTeam;
    if (expectName && !nameHit(message, expectName)) {
      failures.push(`expected runner-up ${expectName}`);
    }
    if (!expectName && !/runner-up/i.test(message)) failures.push("runner-up not answered");
  }

  if (/finished third in 2009/i.test(question)) {
    if (PARTIAL_LEGACY_RE.test(message)) failures.push("third place incorrectly treated as unsupported matchup");
    if (!/2009/.test(message)) failures.push("2009 missing");
    const expectName = hof2009?.resolvedThirdDisplay || hof2009?.thirdTeam;
    if (expectName && !nameHit(message, expectName)) {
      failures.push(`expected third ${expectName}`);
    }
    if (!expectName && !/third/i.test(message)) failures.push("third place not answered");
  }

  if (/2009 regular-season record|2009 championship score|week 8 of 2009/i.test(question)) {
    if (!PARTIAL_LEGACY_RE.test(message)) failures.push("expected partial-legacy limitation sentence");
    if (/\d+–\d+–\d+|\d+-\d+-\d+/.test(message) && /record/i.test(question)) {
      failures.push("fabricated 2009 record");
    }
    if (/\b\d{2,3}(?:\.\d+)?\s*[–-]\s*\d{2,3}/.test(message) && /score/i.test(question)) {
      failures.push("fabricated 2009 championship score");
    }
  }

  if (/compare demetri/i.test(question)) {
    if (!/demetri/i.test(message) || !/lozell/i.test(message)) failures.push("compare missing Demetri or LOZELL");
    if (!/regular season/i.test(message) || !/playoffs?/i.test(message)) {
      failures.push("compare not labeled RS vs playoffs");
    }
    if (PARTIAL_LEGACY_RE.test(message)) failures.push("2010+ H2H incorrectly used partial-legacy sentence");
  }

  return failures;
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY?.trim()) throw new Error("CLERK_SECRET_KEY required");
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
  let health: Record<string, unknown> | null = null;
  let hof2009: HofHistoryRow | null = null;
  let hofLb: HofLeaderboardRow[] = [];
  try {
    await page.goto(signInUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForURL(
      (url) => url.hostname.includes("fantasyfootballrivals.com") && !url.pathname.includes("sign-in"),
      { timeout: 90_000 },
    );
    await page.waitForTimeout(2500);

    health = (await page.evaluate(async () => {
      const res = await fetch("/api/health", { credentials: "include" });
      return res.json();
    })) as Record<string, unknown>;

    connections = (await page.evaluate(async () => {
      const res = await fetch(
        `/api/trpc/league.getMyLeagues?input=${encodeURIComponent(JSON.stringify({ json: null }))}`,
        { credentials: "include" },
      );
      const body = await res.json();
      return (body?.result?.data?.json ?? body?.result?.data ?? []) as LiveLeague[];
    })) as LiveLeague[];

    const espn = connections.find((l) => l.provider === "espn" && l.leagueId === "457622");
    if (!espn) throw new Error("ESPN 457622 not connected");

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

    const hof = (await page.evaluate(async () => {
      const res = await fetch(
        `/api/trpc/espn.hallOfFame?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`,
        { credentials: "include" },
      );
      const body = await res.json();
      return body?.result?.data?.json ?? body?.result?.data ?? null;
    })) as {
      championships?: { history?: HofHistoryRow[]; leaderboard?: HofLeaderboardRow[] };
    } | null;
    hof2009 = hof?.championships?.history?.find((h) => Number(h.season) === 2009) ?? null;
    hofLb = hof?.championships?.leaderboard ?? [];
    console.log(
      `HoF 2009: champ=${hof2009?.resolvedChampionDisplay ?? hof2009?.championTeam ?? "?"} ru=${
        hof2009?.resolvedRunnerUpDisplay ?? hof2009?.runnerUpTeam ?? "?"
      } third=${hof2009?.resolvedThirdDisplay ?? hof2009?.thirdTeam ?? "?"}`,
    );
    console.log(
      `HoF leaderboard: ${hofLb.slice(0, 6).map((r) => `${r.displayName}:${r.titles}`).join(" · ") || "(none)"}`,
    );
    console.log(`health buildTime=${String(health?.buildTime ?? "?")} gitSha=${String(health?.gitSha ?? "?").slice(0, 12)}`);

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
      const fails = failuresFor(question, message, hof2009, hofLb);
      rows.push({
        question,
        answer: message,
        tool: chatOut?.tool,
        verdict: fails.length ? "FAIL" : "PASS",
        failures: fails,
      });
      console.log(
        `${fails.length ? "FAIL" : "PASS"} | ${question}\n  ${message.slice(0, 360)}${
          fails.length ? `\n  !! ${fails.join("; ")}` : ""
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
    `# RFSN-052J — Preview live gate`,
    ``,
    `**Preview host:** \`${BASE}\``,
    `**buildTime:** \`${String(health?.buildTime ?? "?")}\``,
    `**gitSha (may be stale on CLI upload):** \`${String(health?.gitSha ?? "?")}\``,
    `**Live ESPN 457622:** ${pass} PASS / ${fail} FAIL`,
    `**HoF 2009:** champ=${hof2009?.resolvedChampionDisplay ?? hof2009?.championTeam ?? "?"} · ru=${
      hof2009?.resolvedRunnerUpDisplay ?? hof2009?.runnerUpTeam ?? "?"
    } · third=${hof2009?.resolvedThirdDisplay ?? hof2009?.thirdTeam ?? "?"}`,
    `**Production:** not touched.`,
    ``,
    `| Question | Answer | PASS/FAIL |`,
    `| --- | --- | --- |`,
    ...rows.map(
      (r) =>
        `| ${r.question.replace(/\|/g, "\\|")} | ${r.answer.replace(/\|/g, "\\|").replace(/\n/g, "<br>").slice(0, 800)} | ${r.verdict}${
          r.failures.length ? ` (${r.failures.join("; ")})` : ""
        } |`,
    ),
    ``,
    `HoF leaderboard: ${hofLb.map((r) => `${r.displayName} ${r.titles}`).join(" · ") || "(none)"}`,
    ``,
    `**Stop. Do not promote to Production until this gate is green.**`,
    ``,
  ].join("\n");
  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify({ previewHost: BASE, health, hof2009, hofLb, rows, connections }, null, 2),
  );
  console.log(`Wrote ${OUT_MD}`);
  if (fail) {
    console.error(`\nFAIL ${fail}. Do not promote to Production.`);
    process.exit(1);
  }
  console.log("\nPreview ESPN 457622 052J gate PASS. Do not promote to Production.");
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
