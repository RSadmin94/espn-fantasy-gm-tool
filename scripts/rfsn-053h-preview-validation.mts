/**
 * RFSN-053H — Preview founder validation: AI historical narration.
 * ESPN 457622 only. Defaults to Preview. No Production. No video. No TTS.
 *
 *   npx tsx scripts/rfsn-053h-preview-validation.mts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const PREVIEW_HOST =
  process.env.RFSN_053H_HOST?.trim() || "sprint-8-preview.fantasyfootballrivals.com";
const BASE = `https://${PREVIEW_HOST}`;
const ESPN_LEAGUE = "457622";
const LABEL = /www\.fantasyfootballrivals\.com/i.test(PREVIEW_HOST) ? "production" : "preview";
const OUT_DIR = path.resolve("audit-artifacts/rfsn-053");
const OUT_MD = path.join(OUT_DIR, `RFSN-053H-${LABEL}-validation.md`);
const OUT_JSON = path.join(OUT_DIR, `RFSN-053H-${LABEL}-validation.json`);
const GAP_MS = 8000;

type Probe = { name: string; verdict: "PASS" | "FAIL"; failures: string[]; sample?: string };

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

async function narrateOnPage(page: Page, voice: string): Promise<{ headline: string; story: string; failures: string[] }> {
  const failures: string[] = [];
  await page.waitForSelector("[data-historical-narration]", { timeout: 20_000 }).catch(() => null);
  if (!(await page.$("[data-historical-narration]"))) {
    return { headline: "", story: "", failures: ["narration panel missing"] };
  }
  await page.click(`[data-narration-voice-chip='${voice}']`).catch(() => undefined);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("historicalNarration.narrate") && r.request().method() === "POST", {
      timeout: 90_000,
    }),
    page.click("[data-narration-generate]"),
  ]).catch(() => [null] as const);
  if (!res) failures.push("narrate request did not start");
  else if (!res.ok()) failures.push(`narrate http ${res.status()}`);
  await page.waitForSelector("[data-narration-headline]", { timeout: 20_000 }).catch(() => null);
  const headline = ((await page.locator("[data-narration-headline]").innerText().catch(() => "")) || "").trim();
  const story = ((await page.locator("[data-narration-story]").innerText().catch(() => "")) || "").trim();
  if (!headline) failures.push("missing headline");
  if (!story) failures.push("missing story");
  if (/\b1999\b/.test(`${headline} ${story}`)) failures.push("invented year 1999");
  return { headline, story, failures };
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

    const runs: Array<{ id: string; href: string; expect: RegExp; voice: string }> = [
      { id: "no-mercy", href: "/league/history/matchups/c/no-mercy", expect: /\b22\b|no mercy/i, voice: "sofia" },
      { id: "heartbreak", href: "/league/history/matchups/c/heartbreak", expect: /\b4\b|heartbreak/i, voice: "sofia" },
      { id: "cashier", href: "/league/history/matchups/c/cashier", expect: /\b70\b|cashier/i, voice: "cashier" },
      { id: "statement-wins", href: "/league/history/matchups/c/statement-wins", expect: /statement/i, voice: "sofia" },
      { id: "biggest-collapses", href: "/league/history/matchups/c/biggest-collapses", expect: /collapse/i, voice: "coach" },
      {
        id: "blood-rival",
        href: `/league/history/matchups/c/blood-rival?ownerName=${encodeURIComponent(ownerName)}&opponentName=${encodeURIComponent("Bruce Edwards")}`,
        expect: /bruce|rod|rival/i,
        voice: "roxanne",
      },
    ];

    for (const row of runs) {
      await page.goto(`${BASE}${row.href}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector(`[data-story-collection='${row.id}']`, { timeout: 30_000 }).catch(() => null);
      const countText = ((await page.locator("[data-story-collection-count]").innerText().catch(() => "")) || "").trim();
      const n = await narrateOnPage(page, row.voice);
      const failures = [...n.failures];
      const blob = `${n.headline} ${n.story} ${countText}`;
      if (n.headline && !row.expect.test(blob)) failures.push(`story did not reflect ${row.id} facts (${blob.slice(0, 120)})`);
      push({
        name: `Narrate ${row.id} (${row.voice})`,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        sample: n.headline || row.href,
      });
    }

    await page.evaluate(async ({ leagueId }) => {
      await fetch(`/api/trpc/advisor.clearHistory`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { activeLeagueKey: leagueId } }),
      });
    }, { leagueId: ESPN_LEAGUE });
    await page.waitForTimeout(GAP_MS);
    await page.goto(`${BASE}/my-team/advisor`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);
    await page.locator("textarea").first().fill("Why is this No Mercy?");
    await page.locator("textarea").first().press("Enter");
    await page.waitForSelector("[data-advisor-visual='matchup_gallery'], [data-historical-narration]", { timeout: 45_000 }).catch(() => null);
    const advisorStory = ((await page.locator("[data-narration-headline], [data-historical-narration]").first().innerText().catch(() => "")) || "").trim();
    const advisorText = ((await page.locator("div.rounded-2xl").last().innerText().catch(() => "")) || "").trim();
    const advisorFail: string[] = [];
    if (!/no mercy|blowout|50/i.test(`${advisorStory} ${advisorText}`)) advisorFail.push("advisor narration missing No Mercy facts");
    if (/\b1999\b/.test(advisorText)) advisorFail.push("advisor invented 1999");
    push({
      name: "Advisor Why is this No Mercy?",
      verdict: advisorFail.length ? "FAIL" : "PASS",
      failures: advisorFail,
      sample: (advisorStory || advisorText).slice(0, 160),
    });
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
  fs.writeFileSync(OUT_JSON, JSON.stringify({ label: LABEL, host: BASE, health, passed, failed, probes }, null, 2));
  console.log(`\n${passed}/${probes.length} PASS → ${OUT_MD}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
