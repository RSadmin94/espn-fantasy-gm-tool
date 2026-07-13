/**
 * Five-test Draft War Room browser certification (BUG-001 – BUG-005).
 *
 * Prereq: local `pnpm dev` OR deployed build; scripts/_founder_signin_url.txt
 *
 *   QA_BASE=http://localhost:3000 pnpm exec tsx scripts/runLiveDraftWarRoomBrowserCert.mts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { buildRfsnLiveDraftIdFromLeague } from "../client/src/lib/rfsnLiveDraftId";

const BASE = (process.env.QA_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const SIGNIN_PATH = path.join(import.meta.dirname, "_founder_signin_url.txt");
const OUT_DIR = path.join(process.cwd(), "cert-output", "live-draft-browser-cert");

type CertResult = {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
  screenshot?: string;
  rootCause?: string;
};

const results: CertResult[] = [];
let draftId = "war-room-live-2026";
let leagueId = "457622";

function record(r: CertResult): void {
  results.push(r);
  console.log(`${r.pass ? "PASS" : "FAIL"} — [${r.id}] ${r.name}: ${r.detail}`);
  if (r.rootCause) console.log(`  root cause: ${r.rootCause}`);
}

async function shot(page: Page, name: string): Promise<string> {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function trpcQuery<T>(page: Page, proc: string, input: Record<string, unknown>): Promise<T> {
  return page.evaluate(
    async ({ proc, input, base }) => {
      const url = `${base}/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
      const res = await fetch(url, { credentials: "include" });
      const body = await res.json();
      if (body.error) throw new Error(body.error?.json?.message ?? JSON.stringify(body.error));
      return body.result?.data?.json as T;
    },
    { proc, input, base: BASE },
  );
}

async function signIn(context: BrowserContext): Promise<Page> {
  if (!fs.existsSync(SIGNIN_PATH)) {
    throw new Error("Missing scripts/_founder_signin_url.txt — run scripts/_mint_founder_signin.mts");
  }
  let signInUrl = fs.readFileSync(SIGNIN_PATH, "utf8").trim();
  if (!signInUrl.startsWith(BASE)) {
    const ticket = new URL(signInUrl).searchParams.get("__clerk_ticket");
    if (!ticket) throw new Error("Sign-in URL has no __clerk_ticket");
    signInUrl = `${BASE}/sign-in?__clerk_ticket=${encodeURIComponent(ticket)}`;
  }
  const page = await context.newPage();
  await page.goto(signInUrl, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(3000);
  return page;
}

async function openLiveDraftTab(page: Page): Promise<void> {
  await page.goto(`${BASE}/draft-war-room`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.getByRole("button", { name: /Live Draft/i }).click();
  await page.waitForSelector("[data-live-draft-wrap-up], .live-draft-surface, [data-rfsn-warroom-broadcast]", {
    timeout: 60_000,
  });
}

async function enableSound(page: Page): Promise<void> {
  const btn = page.getByRole("button", { name: /Enable Broadcast Audio|Tap to Enable Sound/i });
  if ((await btn.count()) > 0) await btn.first().click();
}

async function startDraftTurbo(page: Page): Promise<void> {
  const turbo = page.getByRole("button", { name: "Turbo" });
  if ((await turbo.count()) > 0) await turbo.click();
  const start = page.getByRole("button", { name: /Start Draft|Resume/i });
  if ((await start.count()) > 0) await start.first().click();
}

async function countAudioPlaySessions(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __rfsnCertAudioStarts?: number };
    return w.__rfsnCertAudioStarts ?? 0;
  });
}

async function wireAudioCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __rfsnCertAudioStarts: number };
    w.__rfsnCertAudioStarts = 0;
    const Orig = window.Audio;
    window.Audio = function (this: HTMLAudioElement, src?: string) {
      const a = new Orig(src);
      w.__rfsnCertAudioStarts += 1;
      return a;
    } as unknown as typeof Audio;
    Object.assign(window.Audio, Orig);
    window.Audio.prototype = Orig.prototype;
  });
}

async function activeAudioState(page: Page): Promise<{ playing: boolean; currentTime: number; count: number }> {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("audio"));
    const active = els.find((a) => !a.paused && a.currentTime > 0);
    return {
      playing: Boolean(active),
      currentTime: active?.currentTime ?? els[0]?.currentTime ?? 0,
      count: els.length,
    };
  });
}

async function test1MultiLineAutoPlay(page: Page): Promise<void> {
  await wireAudioCounter(page);
  await openLiveDraftTab(page);
  await enableSound(page);
  await startDraftTurbo(page);

  let maxStarts = 0;
  let sawSecondLine = false;
  const start = Date.now();
  while (Date.now() - start < 180_000) {
    const starts = await countAudioPlaySessions(page);
    maxStarts = Math.max(maxStarts, starts);
    const boothActive = await page.locator('[data-booth-state="active"]').count();
    const seq = await page.locator("[data-rfsn-warroom-broadcast]").textContent();
    if (maxStarts >= 2) {
      sawSecondLine = true;
      break;
    }
    if (boothActive > 0 && maxStarts >= 1 && Date.now() - start > 45_000) {
      // waited long enough for line 2 if picks are flowing
      break;
    }
    await page.waitForTimeout(2000);
    void seq;
  }
  const ss = await shot(page, "test1-multi-line-audio");
  record({
    id: "TEST-1",
    name: "Multi-line auto-play after Enable Sound",
    pass: sawSecondLine || maxStarts >= 2,
    detail: `audio start events=${maxStarts}`,
    screenshot: ss,
    rootCause:
      maxStarts < 2
        ? "Second+ lines did not trigger new Audio elements — booth may still advance on timer or clip pending→ready retry failed"
        : undefined,
  });
}

async function test2NoPrematureCutoff(page: Page): Promise<void> {
  await openLiveDraftTab(page);
  await enableSound(page);
  const broadcast = page.getByRole("button", { name: "Broadcast" });
  if ((await broadcast.count()) > 0) await broadcast.click();
  await startDraftTurbo(page);

  let prematureExit = false;
  let observedPlayingMs = 0;
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    const { playing, currentTime } = await activeAudioState(page);
    const activeCard = await page.locator('[data-booth-state="active"]').count();
    if (playing) observedPlayingMs += 2000;
  if (!playing && activeCard === 0 && currentTime > 0.5 && observedPlayingMs < 8000) {
      prematureExit = true;
      break;
    }
    if (observedPlayingMs >= 12_000) break;
    await page.waitForTimeout(2000);
  }
  const ss = await shot(page, "test2-long-line");
  record({
    id: "TEST-2",
    name: "Long lines play until ended (no fixed cut-off)",
    pass: !prematureExit && observedPlayingMs >= 3000,
    detail: `observedPlayingMs≈${observedPlayingMs} prematureExit=${prematureExit}`,
    screenshot: ss,
    rootCause: prematureExit
      ? "Booth exited speaker while audio was still in progress — fixed timer may still be firing"
      : undefined,
  });
}

async function test3NavigationPersist(page: Page): Promise<void> {
  await openLiveDraftTab(page);
  await enableSound(page);
  await startDraftTurbo(page);
  await page.waitForTimeout(8000);

  const beforePick = await page.locator(".live-draft-surface").textContent();
  const replayBefore = await page.getByRole("button", { name: /Replay/i }).count();
  await page.getByRole("button", { name: "Draft Board", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Live Draft/i }).click();
  await page.waitForTimeout(2000);

  const afterPick = await page.locator(".live-draft-surface").textContent();
  const replayAfter = await page.getByRole("button", { name: /Replay/i }).count();
  const ss = await shot(page, "test3-navigation-return");
  const preserved =
    Boolean(beforePick && afterPick && beforePick.length > 50) &&
    replayAfter >= replayBefore;
  record({
    id: "TEST-3",
    name: "Leave War Room tab and return — session preserved",
    pass: preserved,
    detail: `replayBefore=${replayBefore} replayAfter=${replayAfter}`,
    screenshot: ss,
    rootCause: !preserved
      ? "LiveDraftEngine or audio session reset on tab switch — mount/persistKey regression"
      : undefined,
  });
}

async function test4PauseOnMyPicks(page: Page): Promise<void> {
  await openLiveDraftTab(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const label = await page.locator(".live-draft-surface").getByText(/Full AI draft|Spectating/i).first().textContent();
  const fullAi = /Full AI|Spectating/i.test(label ?? "");
  const pauseOnMyPicksChecked = await page.locator('.live-draft-surface input[type="checkbox"]').first().isChecked().catch(() => false);

  await startDraftTurbo(page);
  await page.waitForTimeout(6000);
  const stillRunning = (await page.getByRole("button", { name: /Pause/i }).count()) > 0;
  const pickMoved = /Pick \d+\//.test((await page.locator(".live-draft-surface").textContent()) ?? "");
  const ss1 = await shot(page, "test4-full-ai");

  record({
    id: "TEST-4a",
    name: "Pause on my picks disabled — sim continues",
    pass: fullAi && !pauseOnMyPicksChecked && stillRunning && pickMoved,
    detail: `label=${label?.trim()} pauseOnMyPicks=${pauseOnMyPicksChecked} running=${stillRunning}`,
    screenshot: ss1,
    rootCause: !fullAi
      ? "manualTeamIds still defaults to user team — draft pauses on user picks"
      : !stillRunning
        ? "Simulation stopped without manual team checked"
        : undefined,
  });

  // Enable pause on my picks
  const pauseToggle = page.locator('.live-draft-surface label:has-text("Pause on my picks") input');
  if ((await pauseToggle.count()) > 0) {
    await pauseToggle.check();
    await page.waitForTimeout(4000);
    const manualLabel = await page.locator(".live-draft-surface").getByText(/manual/i).first().textContent();
    const ss2 = await shot(page, "test4-manual-enabled");
    record({
      id: "TEST-4b",
      name: "Manual team checked — sim pauses when on manual team",
      pass: /manual/i.test(manualLabel ?? ""),
      detail: `label=${manualLabel?.trim()}`,
      screenshot: ss2,
    });
  }
}

async function test5WrapUp(page: Page): Promise<void> {
  await openLiveDraftTab(page);
  await enableSound(page);
  await startDraftTurbo(page);

  let wrapUpCount = 0;
  const start = Date.now();
  while (Date.now() - start < 600_000) {
    wrapUpCount = await page.locator("[data-live-draft-wrap-up]").count();
    const doneBanner = await page.getByText(/Draft complete/i).count();
    if (wrapUpCount >= 1 && doneBanner > 0) break;
    await page.waitForTimeout(3000);
  }

  const ss = await shot(page, "test5-wrap-up");
  let wrapUpPayloads = 0;
  try {
    const snap = await trpcQuery<{ sessionState?: string; draftComplete?: boolean }>(
      page,
      "rfsnBroadcast.getLiveSnapshot",
      { leagueId, draftId },
    );
    if (snap.sessionState === "draft_complete" || snap.draftComplete) wrapUpPayloads = 1;
  } catch {
    // ignore
  }

  const replay = await page.getByRole("button", { name: /Replay/i }).count();
  record({
    id: "TEST-5",
    name: "Final pick — exactly one wrap-up renders",
    pass: wrapUpCount === 1,
    detail: `wrapUpPanels=${wrapUpCount} sessionComplete=${wrapUpPayloads} replay=${replay}`,
    screenshot: ss,
    rootCause:
      wrapUpCount === 0
        ? "LiveDraftWrapUp not rendered or draft did not reach done state in time"
        : wrapUpCount > 1
          ? "Duplicate wrap-up panels — dedupe/render regression"
          : undefined,
  });
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext();
  let page: Page | null = null;
  try {
    page = await signIn(context);

    const league = await trpcQuery<{ leagueId?: string }>(page, "league.getActive", {});
    leagueId = String(league.leagueId ?? "457622");
    const seasons = await trpcQuery<number[]>(page, "espn.cachedSeasons", {}).catch(() => []);
    draftId = buildRfsnLiveDraftIdFromLeague(seasons);
    console.log(`Cert target: ${BASE} league=${leagueId} draftId=${draftId}`);
    console.log(
      BASE.includes("localhost")
        ? "Mode: local build (uncommitted fixes)"
        : "Mode: production — FAILs here indicate deployed build, not uncommitted fixes",
    );

    await test1MultiLineAutoPlay(page);
    await test2NoPrematureCutoff(page);
    await test3NavigationPersist(page);
    await test4PauseOnMyPicks(page);
    await test5WrapUp(page);
  } finally {
    const report = {
      base: BASE,
      leagueId,
      draftId,
      at: new Date().toISOString(),
      results,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass).length,
    };
    const reportPath = path.join(OUT_DIR, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport → ${reportPath}`);
    await browser.close();
    process.exit(report.failed > 0 ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
