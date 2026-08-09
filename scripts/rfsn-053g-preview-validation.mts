/**
 * RFSN-053G — Preview founder validation: Share Card PNG export.
 * ESPN 457622 only. Defaults to Preview. No Production. No AI. No video.
 *
 *   npx tsx scripts/rfsn-053g-preview-validation.mts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { SHARE_CARD_LAYOUT_SIZE, type ShareCardLayout } from "../shared/historicalShareCard";

const PREVIEW_HOST =
  process.env.RFSN_053G_HOST?.trim() || "sprint-8-preview.fantasyfootballrivals.com";
const BASE = `https://${PREVIEW_HOST}`;
const ESPN_LEAGUE = "457622";
const LABEL = /www\.fantasyfootballrivals\.com/i.test(PREVIEW_HOST) ? "production" : "preview";
const OUT_DIR = path.resolve("audit-artifacts/rfsn-053");
const PNG_DIR = path.join(OUT_DIR, "png-053g-preview");
const OUT_MD = path.join(OUT_DIR, `RFSN-053G-${LABEL}-validation.md`);
const OUT_JSON = path.join(OUT_DIR, `RFSN-053G-${LABEL}-validation.json`);
const GAP_MS = 8000;

type Probe = { name: string; verdict: "PASS" | "FAIL"; failures: string[]; sample?: string };

function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.subarray(0, 8).toString("binary") !== "\u0089PNG\r\n\u001a\n") return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
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

async function downloadPng(page: Page, layout: ShareCardLayout, destName: string): Promise<{
  ok: boolean;
  filename: string;
  dims: { width: number; height: number } | null;
  failures: string[];
}> {
  const failures: string[] = [];
  await page.waitForSelector("[data-share-card-modal]", { timeout: 10_000 }).catch(() => null);
  if (!(await page.$("[data-share-card-modal]"))) {
    return { ok: false, filename: "", dims: null, failures: ["modal not open"] };
  }
  const htmlTheme = await page.$eval("[data-share-card-preview] [data-share-card-theme]", (n) => n.getAttribute("data-share-card-theme")).catch(() => null);
  const htmlType = await page.$eval("[data-share-card-preview] [data-share-card-type]", (n) => n.getAttribute("data-share-card-type")).catch(() => null);
  const htmlBadges = await page.$$eval("[data-share-card-preview] [data-share-record-badge]", (els) => els.map((e) => e.getAttribute("data-share-record-badge"))).catch(() => []);
  await page.click(`[data-share-layout='${layout}']`).catch(() => null);
  await page.click("[data-share-scale='1']").catch(() => null);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    page.click("[data-share-download]"),
  ]).catch(() => [null] as const);
  if (!download) return { ok: false, filename: "", dims: null, failures: ["download did not start"] };
  const filename = download.suggestedFilename();
  const dest = path.join(PNG_DIR, destName || filename);
  await download.saveAs(dest);
  const buf = fs.readFileSync(dest);
  const dims = pngSize(buf);
  const expected = SHARE_CARD_LAYOUT_SIZE[layout];
  if (!dims) failures.push("not a png");
  if (dims && (dims.width !== expected.width || dims.height !== expected.height)) {
    failures.push(`dims ${dims.width}x${dims.height} != ${expected.width}x${expected.height}`);
  }
  if (!filename.toLowerCase().endsWith(".png")) failures.push(`filename=${filename}`);
  const previewText = ((await page.locator("[data-share-card-preview]").innerText().catch(() => "")) || "").slice(0, 200);
  if (!htmlTheme) failures.push("preview missing theme");
  if (!htmlType) failures.push("preview missing type");
  return {
    ok: failures.length === 0,
    filename,
    dims,
    failures: failures.length
      ? failures
      : [],
    ...( { sample: undefined } as { sample?: string } ),
  } as { ok: boolean; filename: string; dims: { width: number; height: number } | null; failures: string[]; htmlTheme?: string; htmlType?: string; htmlBadges?: string[]; previewText?: string; dest?: string };
}

async function openFirstShare(page: Page): Promise<boolean> {
  const btn = page.locator("[data-share-card-open]").first();
  if (!(await btn.count())) return false;
  await btn.click();
  await page.waitForSelector("[data-share-card-modal]", { timeout: 10_000 }).catch(() => null);
  return Boolean(await page.$("[data-share-card-modal]"));
}

async function closeShare(page: Page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(300);
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY?.trim()) throw new Error("CLERK_SECRET_KEY required");
  fs.mkdirSync(PNG_DIR, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  const probes: Probe[] = [];
  let health: Record<string, unknown> | null = null;
  let ownerName = "";

  const push = (row: Probe) => {
    probes.push(row);
    console.log(`${row.verdict} | ${row.name}${row.sample ? `\n  ${row.sample}` : ""}${row.failures.length ? `\n  !! ${row.failures.join("; ")}` : ""}`);
  };

  try {
    await page.goto(await mintUrl(BASE), { waitUntil: "domcontentloaded", timeout: 90_000 });
    const expectedHost = new URL(BASE).hostname;
    await page.waitForURL((url) => url.hostname === expectedHost && !url.pathname.includes("sign-in"), { timeout: 90_000 });
    await page.waitForTimeout(2000);
    health = (await page.evaluate(async () => (await fetch("/api/health", { credentials: "include" })).json())) as Record<string, unknown>;
    console.log(`host=${new URL(page.url()).hostname} health buildTime=${String(health?.buildTime ?? "?")}`);

    type LiveLeague = { id: number; provider: string; leagueId: string; selectedOwnerName?: string | null };
    const connections = unwrap((await trpcGet(page, "league.getMyLeagues", null)).body) as LiveLeague[];
    const espn = (connections ?? []).find((l) => l.provider === "espn" && l.leagueId === ESPN_LEAGUE);
    if (!espn) throw new Error("ESPN 457622 not connected on Preview founder account");
    ownerName = espn.selectedOwnerName?.trim() || "Rod Sellers";
    await trpcMutate(page, "league.setActive", { leagueConnectionId: espn.id });
    await page.waitForTimeout(800);

    const collectionRuns: Array<{ id: string; href: string; file: string; layout: ShareCardLayout }> = [
      { id: "no-mercy", href: "/league/history/matchups/c/no-mercy", file: "no-mercy-landscape.png", layout: "landscape" },
      { id: "heartbreak", href: "/league/history/matchups/c/heartbreak", file: "heartbreak-portrait.png", layout: "portrait" },
      { id: "championship", href: "/league/history/matchups/c/championship", file: "championship-square.png", layout: "square" },
      {
        id: "blood-rival",
        href: `/league/history/matchups/c/blood-rival?ownerName=${encodeURIComponent(ownerName)}&opponentName=${encodeURIComponent("Bruce Edwards")}`,
        file: "blood-rival-landscape.png",
        layout: "landscape",
      },
      { id: "cashier", href: "/league/history/matchups/c/cashier", file: "cashier-landscape.png", layout: "landscape" },
    ];

    for (const row of collectionRuns) {
      await page.goto(`${BASE}${row.href}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector(`[data-story-collection='${row.id}']`, { timeout: 30_000 }).catch(() => null);
      const opened = await openFirstShare(page);
      const failures: string[] = [];
      if (!opened) failures.push("Share Card did not open");
      let sample = row.href;
      if (opened) {
        const dl = await downloadPng(page, row.layout, row.file);
        failures.push(...dl.failures);
        sample = `${dl.filename} ${dl.dims ? `${dl.dims.width}x${dl.dims.height}` : "no-dims"}`;
        await closeShare(page);
      }
      push({ name: `PNG ${row.id} ${row.layout}`, verdict: failures.length ? "FAIL" : "PASS", failures, sample });
    }

    await page.goto(`${BASE}/league/history/records`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-share-card-open][data-share-card-type='record']", { timeout: 45_000 }).catch(() => null);
    const recordOpened = await openFirstShare(page);
    const recordFail: string[] = [];
    if (!recordOpened) recordFail.push("record Share Card missing");
    else {
      const dl = await downloadPng(page, "landscape", "league-record-landscape.png");
      recordFail.push(...dl.failures);
      await closeShare(page);
      push({
        name: "PNG league record / HoF",
        verdict: recordFail.length ? "FAIL" : "PASS",
        failures: recordFail,
        sample: dl.filename,
      });
    }
    if (!recordOpened) {
      push({ name: "PNG league record / HoF", verdict: "FAIL", failures: recordFail });
    }

    await clearHistory(page, ESPN_LEAGUE);
    await page.waitForTimeout(GAP_MS);
    await page.goto(`${BASE}/my-team/advisor`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);
    await page.locator("textarea").first().fill("Show me my No Mercy games");
    await page.locator("textarea").first().press("Enter");
    await page.waitForSelector("[data-advisor-visual='matchup_gallery'] [data-share-card-open]", { timeout: 45_000 }).catch(() => null);
    const advisorOpened = await openFirstShare(page);
    const advisorFail: string[] = [];
    if (!advisorOpened) advisorFail.push("advisor Share Card missing");
    else {
      const dl = await downloadPng(page, "landscape", "advisor-no-mercy.png");
      advisorFail.push(...dl.failures);
      await closeShare(page);
      push({
        name: "PNG Advisor gallery",
        verdict: advisorFail.length ? "FAIL" : "PASS",
        failures: advisorFail,
        sample: dl.filename,
      });
    }
    if (!advisorOpened) push({ name: "PNG Advisor gallery", verdict: "FAIL", failures: advisorFail });

    await page.goto(`${BASE}/rivals/rivalries`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-share-card-open]", { timeout: 30_000 }).catch(() => null);
    const rivalryOpened = await openFirstShare(page);
    const rivalryFail: string[] = [];
    if (!rivalryOpened) rivalryFail.push("rivalry Share Card missing");
    else {
      const dl = await downloadPng(page, "square", "rivalry-blood-rival.png");
      rivalryFail.push(...dl.failures);
      await closeShare(page);
      push({
        name: "PNG Rivalry",
        verdict: rivalryFail.length ? "FAIL" : "PASS",
        failures: rivalryFail,
        sample: dl.filename,
      });
    }
    if (!rivalryOpened) push({ name: "PNG Rivalry", verdict: "FAIL", failures: rivalryFail });
  } finally {
    await browser.close();
  }

  const passed = probes.filter((p) => p.verdict === "PASS").length;
  const failed = probes.filter((p) => p.verdict === "FAIL").length;
  const md = [
    `# RFSN-053G ${LABEL} validation`,
    "",
    `- Host: ${BASE}`,
    `- League: ESPN ${ESPN_LEAGUE}`,
    `- buildTime: ${String(health?.buildTime ?? "?")}`,
    `- Result: **${passed}/${probes.length}** (${failed} fail)`,
    `- PNG dir: \`${path.relative(process.cwd(), PNG_DIR)}\``,
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
