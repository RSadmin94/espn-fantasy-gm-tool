/**
 * RFSN-053F — Preview founder validation: Premium Historical Share Cards.
 * ESPN 457622 only. Defaults to Preview. No screenshots. No PNG. No Production.
 *
 *   npx tsx scripts/rfsn-053f-preview-validation.mts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { STORY_COLLECTION_IDS, type StoryCollectionId } from "../shared/matchupStoryCollections";

const PREVIEW_HOST =
  process.env.RFSN_053F_HOST?.trim() || "sprint-8-preview.fantasyfootballrivals.com";
const BASE = `https://${PREVIEW_HOST}`;
const ESPN_LEAGUE = "457622";
const LABEL = /www\.fantasyfootballrivals\.com/i.test(PREVIEW_HOST) ? "production" : "preview";
const OUT_DIR = path.resolve("audit-artifacts/rfsn-053");
const OUT_MD = path.join(OUT_DIR, `RFSN-053F-${LABEL}-validation.md`);
const OUT_JSON = path.join(OUT_DIR, `RFSN-053F-${LABEL}-validation.json`);
const GAP_MS = 6500;

type Probe = {
  name: string;
  verdict: "PASS" | "FAIL";
  failures: string[];
  sample?: string;
};

type ChatOut = {
  message?: string;
  tool?: string;
  visual?: { type?: string; collection?: string; href?: string };
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
      const res = await fetch(
        `/api/trpc/${pathName}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`,
        { credentials: "include" },
      );
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

async function openShareCard(page: Page): Promise<{ open: boolean; theme: string | null; layout: string | null; downloadDisabled: boolean }> {
  const btn = page.locator("[data-share-card-open]").first();
  if (!(await btn.count())) return { open: false, theme: null, layout: null, downloadDisabled: false };
  await btn.click();
  await page.waitForSelector("[data-share-card-modal]", { timeout: 10_000 }).catch(() => null);
  const theme = await page.$eval("[data-share-card-preview] [data-share-card-theme]", (n) => n.getAttribute("data-share-card-theme")).catch(() => null);
  const layout = await page.$eval("[data-share-card-preview] [data-share-card-layout]", (n) => n.getAttribute("data-share-card-layout")).catch(() => null);
  const downloadDisabled = await page.$eval("[data-share-download]", (n) => (n as HTMLButtonElement).disabled).catch(() => false);
  return { open: Boolean(await page.$("[data-share-card-modal]")), theme, layout, downloadDisabled };
}

async function closeShareCard(page: Page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(250);
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY?.trim()) throw new Error("CLERK_SECRET_KEY required");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const probes: Probe[] = [];
  let health: Record<string, unknown> | null = null;
  let lastAt = 0;
  let ownerName = "";

  const waitGap = async () => {
    const elapsed = Date.now() - lastAt;
    if (lastAt > 0 && elapsed < GAP_MS) await page.waitForTimeout(GAP_MS - elapsed);
  };

  const push = (row: Probe) => {
    probes.push(row);
    console.log(
      `${row.verdict} | ${row.name}${row.sample ? `\n  ${row.sample}` : ""}${
        row.failures.length ? `\n  !! ${row.failures.join("; ")}` : ""
      }`,
    );
  };

  try {
    await page.goto(await mintUrl(BASE), { waitUntil: "domcontentloaded", timeout: 90_000 });
    const expectedHost = new URL(BASE).hostname;
    await page.waitForURL(
      (url) => url.hostname === expectedHost && !url.pathname.includes("sign-in"),
      { timeout: 90_000 },
    );
    await page.waitForTimeout(2000);

    health = (await page.evaluate(async () => {
      const res = await fetch("/api/health", { credentials: "include" });
      return res.json();
    })) as Record<string, unknown>;
    console.log(
      `host=${new URL(page.url()).hostname} health buildTime=${String(health?.buildTime ?? "?")} gitSha=${String(health?.gitSha ?? "?").slice(0, 12)}`,
    );

    type LiveLeague = { id: number; provider: string; leagueId: string; selectedOwnerName?: string | null };
    const connections = unwrap((await trpcGet(page, "league.getMyLeagues", null)).body) as LiveLeague[];
    const espn = (connections ?? []).find((l) => l.provider === "espn" && l.leagueId === ESPN_LEAGUE);
    if (!espn) throw new Error("ESPN 457622 not connected on Preview founder account");
    ownerName = espn.selectedOwnerName?.trim() || "";
    await trpcMutate(page, "league.setActive", { leagueConnectionId: espn.id });
    await page.waitForTimeout(800);

    await page.goto(`${BASE}/league/history/matchups`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-story-collection-card]", { timeout: 45_000 }).catch(() => null);
    const homeShare = await page.$$eval("[data-story-collection-card] [data-share-card-open]", (els) => els.length).catch(() => 0);
    push({
      name: "Story Collections home Share Card",
      verdict: homeShare === STORY_COLLECTION_IDS.length ? "PASS" : "FAIL",
      failures: homeShare === STORY_COLLECTION_IDS.length ? [] : [`share buttons=${homeShare}`],
      sample: `share=${homeShare}`,
    });

    const founderIds: StoryCollectionId[] = ["no-mercy", "heartbreak", "championship", "blood-rival", "cashier"];
    for (const id of founderIds) {
      const href =
        id === "blood-rival"
          ? `/league/history/matchups/c/blood-rival?ownerName=${encodeURIComponent(ownerName || "Rod Sellers")}&opponentName=${encodeURIComponent("Bruce Edwards")}`
          : `/league/history/matchups/c/${id}`;
      await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector(`[data-story-collection='${id}']`, { timeout: 30_000 }).catch(() => null);
      const headerShare = Boolean(await page.$("[data-story-collection-header] [data-share-card-open]"));
      const opened = await openShareCard(page);
      const failures: string[] = [];
      if (!headerShare) failures.push("missing header Share Card");
      if (!opened.open) failures.push("modal did not open");
      if (opened.theme !== id) failures.push(`theme=${opened.theme ?? "none"}`);
      if (opened.layout !== "landscape") failures.push(`layout=${opened.layout ?? "none"}`);
      if (!opened.downloadDisabled) failures.push("download not disabled");
      if (opened.open) {
        await page.click("[data-share-theme='neutral']").catch(() => null);
        await page.click("[data-share-layout='portrait']").catch(() => null);
        const switchedTheme = await page.$eval("[data-share-card-preview] [data-share-card-theme]", (n) => n.getAttribute("data-share-card-theme")).catch(() => null);
        const switchedLayout = await page.$eval("[data-share-card-preview] [data-share-card-layout]", (n) => n.getAttribute("data-share-card-layout")).catch(() => null);
        if (switchedTheme !== "neutral") failures.push(`theme switch=${switchedTheme}`);
        if (switchedLayout !== "portrait") failures.push(`layout switch=${switchedLayout}`);
        await page.click("[data-share-layout='square']").catch(() => null);
        const square = await page.$eval("[data-share-card-preview] [data-share-card-layout]", (n) => n.getAttribute("data-share-card-layout")).catch(() => null);
        if (square !== "square") failures.push(`square=${square}`);
      }
      await closeShareCard(page);
      push({
        name: `collection ${id}`,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        sample: href,
      });
    }

    await page.goto(`${BASE}/league/history/matchups/c/no-mercy`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-matchup-card] [data-share-card-open]", { timeout: 30_000 }).catch(() => null);
    const galleryCardShare = Boolean(await page.$("[data-matchup-card] [data-share-card-open]"));
    const galleryOpen = await openShareCard(page);
    await closeShareCard(page);
    push({
      name: "gallery matchup Share Card",
      verdict: galleryCardShare && galleryOpen.open && galleryOpen.theme === "no-mercy" ? "PASS" : "FAIL",
      failures: [
        ...(!galleryCardShare ? ["missing card Share Card"] : []),
        ...(!galleryOpen.open ? ["modal did not open"] : []),
        ...(galleryOpen.theme && galleryOpen.theme !== "no-mercy" ? [`theme=${galleryOpen.theme}`] : []),
      ],
    });

    const viewHref = await page.$eval("[data-matchup-card] a[href*='/league/history/matchups/']", (a) =>
      (a as HTMLAnchorElement).getAttribute("href"),
    ).catch(() => null);
    if (viewHref) {
      await page.goto(`${BASE}${viewHref}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector("[data-matchup-viewer]", { timeout: 30_000 }).catch(() => null);
      const viewerShare = Boolean(await page.$("[data-matchup-viewer] [data-share-card-open]"));
      const viewerOpen = await openShareCard(page);
      await closeShareCard(page);
      push({
        name: "viewer Share Card",
        verdict: viewerShare && viewerOpen.open ? "PASS" : "FAIL",
        failures: [
          ...(!viewerShare ? ["missing viewer Share Card"] : []),
          ...(!viewerOpen.open ? ["modal did not open"] : []),
        ],
        sample: viewHref,
      });
    } else {
      push({ name: "viewer Share Card", verdict: "FAIL", failures: ["no View Matchup link"] });
    }

    await page.goto(`${BASE}/league/history/records`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-share-card-open]", { timeout: 45_000 }).catch(() => null);
    const recordButtons = await page.$$eval("[data-share-card-open][data-share-card-type='record']", (els) => els.length).catch(() => 0);
    const recordOpen = recordButtons > 0 ? await openShareCard(page) : { open: false, theme: null, layout: null, downloadDisabled: false };
    await closeShareCard(page);
    push({
      name: "Hall of Fame / records Share Card",
      verdict: recordButtons >= 1 && recordOpen.open ? "PASS" : "FAIL",
      failures: [
        ...(recordButtons < 1 ? ["no record Share Card"] : []),
        ...(!recordOpen.open ? ["modal did not open"] : []),
      ],
      sample: `recordButtons=${recordButtons} theme=${recordOpen.theme ?? "none"}`,
    });

    await clearHistory(page, ESPN_LEAGUE);
    await waitGap();
    const out = await chat(page, ESPN_LEAGUE, "Show me my No Mercy games");
    lastAt = Date.now();
    await page.goto(`${BASE}/league/advisor`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-advisor-collection='no-mercy']", { timeout: 45_000 }).catch(() => null);
    await page.waitForSelector("[data-advisor-visual='matchup_gallery'] [data-share-card-open]", { timeout: 20_000 }).catch(() => null);
    const advisorShare = Boolean(await page.$("[data-advisor-visual='matchup_gallery'] [data-share-card-open]"));
    push({
      name: "Advisor embed Share Card",
      verdict: out.visual?.collection === "no-mercy" && advisorShare ? "PASS" : "FAIL",
      failures: [
        ...(out.visual?.collection !== "no-mercy" ? [`collection=${out.visual?.collection ?? "none"}`] : []),
        ...(!advisorShare ? ["missing embed Share Card"] : []),
      ],
      sample: String(out.message ?? "").replace(/\s+/g, " ").slice(0, 200),
    });
  } finally {
    await browser.close();
  }

  const passed = probes.filter((p) => p.verdict === "PASS").length;
  const failed = probes.filter((p) => p.verdict === "FAIL").length;
  const md = [
    `# RFSN-053F ${LABEL} validation`,
    "",
    `- Host: ${BASE}`,
    `- League: ESPN ${ESPN_LEAGUE}`,
    `- buildTime: ${String(health?.buildTime ?? "?")}`,
    `- Result: **${passed}/${probes.length}** (${failed} fail)`,
    "",
    "| Probe | Verdict | Notes |",
    "| --- | --- | --- |",
    ...probes.map(
      (p) =>
        `| ${p.name} | ${p.verdict} | ${(p.failures.join("; ") || p.sample || "").replace(/\|/g, "/").slice(0, 180)} |`,
    ),
    "",
  ].join("\n");
  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify({ label: LABEL, host: BASE, health, passed, failed, probes }, null, 2),
  );
  console.log(`\n${passed}/${probes.length} PASS → ${OUT_MD}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
