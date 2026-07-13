/**
 * Shared helpers for Live Draft War Room browser certification.
 * Proves draft startup before any audio assertions run.
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { execSync } from "node:child_process";
import { type BrowserContext, type Page, chromium } from "playwright";
import { buildRfsnLiveDraftIdFromLeague } from "../client/src/lib/rfsnLiveDraftId";
import { isClerkAllowedHost, signInFounderForPreview } from "./_liveDraftCertAuth.mts";
import { chromiumHostRule, resolveHostIp } from "./_liveDraftCertDns.mts";

export const OUT_DIR = path.join(process.cwd(), "cert-output", "live-draft-browser-cert");
export const SMOKE_OUT_DIR = path.join(process.cwd(), "cert-output", "live-draft-cert-smoke");

export const TIMEOUTS = {
  draftSessionActive: 30_000,
  firstPickLocked: 45_000,
  commentaryCard: 60_000,
  enableSound: 15_000,
  firstAudioAttempt: 90_000,
  smokeTotal: 180_000,
  fullCertTotal: 900_000,
} as const;

export type SmokeStep = {
  id: string;
  requirement: string;
  pass: boolean;
  evidence: string;
  selector?: string;
  screenshot?: string;
  rootCause?: string;
};

export type HarnessContext = {
  base: string;
  expectedSha: string;
  leagueId: string;
  draftId: string;
  deployedSha: string;
};

export function resolveExpectedGitSha(): string {
  if (process.env.EXPECTED_GIT_SHA) return process.env.EXPECTED_GIT_SHA;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    throw new Error("EXPECTED_GIT_SHA is required when git rev-parse is unavailable");
  }
}

export function createHarnessContext(): HarnessContext {
  return {
    base: (process.env.QA_BASE ?? "https://sprint-8-preview.fantasyfootballrivals.com").replace(/\/$/, ""),
    expectedSha: resolveExpectedGitSha(),
    leagueId: "457622",
    draftId: "war-room-live-2026",
    deployedSha: "unknown",
  };
}

export function recordStep(steps: SmokeStep[], step: SmokeStep): void {
  steps.push(step);
  console.log(`${step.pass ? "PASS" : "FAIL"} — [${step.id}] ${step.requirement}`);
  console.log(`  evidence: ${step.evidence}`);
  if (step.selector) console.log(`  selector: ${step.selector}`);
  if (step.rootCause) console.log(`  root cause: ${step.rootCause}`);
}

export async function shot(page: Page, outDir: string, name: string): Promise<string> {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, name.endsWith(".png") ? name : `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

export async function trpcQuery<T>(
  page: Page,
  base: string,
  proc: string,
  input: Record<string, unknown>,
): Promise<T> {
  return page.evaluate(
    async ({ proc, input, base }) => {
      const url = `${base}/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
      const res = await fetch(url, { credentials: "include" });
      const body = await res.json();
      if (body.error) throw new Error(body.error?.json?.message ?? JSON.stringify(body.error));
      return body.result?.data?.json as T;
    },
    { proc, input, base },
  );
}

export async function trpcMutate<T>(
  page: Page,
  base: string,
  proc: string,
  input: Record<string, unknown>,
): Promise<T> {
  return page.evaluate(
    async ({ proc, input, base }) => {
      const res = await fetch(`${base}/api/trpc/${proc}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error?.json?.message ?? JSON.stringify(body.error));
      return body.result?.data?.json as T;
    },
    { proc, input, base },
  );
}

async function fetchHealthJson(base: string): Promise<{ gitSha?: string }> {
  const host = new URL(base).hostname;
  const ip = await resolveHostIp(host);
  const body = await new Promise<string>((resolve, reject) => {
    https
      .get({ host: ip, servername: host, path: "/api/health", headers: { host } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
  return JSON.parse(body) as { gitSha?: string };
}

export async function verifyDeploySha(ctx: HarnessContext, steps: SmokeStep[]): Promise<boolean> {
  const body = await fetchHealthJson(ctx.base);
  ctx.deployedSha = body.gitSha ?? "unknown";
  const pass =
    ctx.deployedSha.startsWith(ctx.expectedSha.slice(0, 7)) || ctx.deployedSha === ctx.expectedSha;
  recordStep(steps, {
    id: "SMOKE-01",
    requirement: "Preview custom domain serves expected Sprint 8 gitSha",
    pass,
    evidence: `gitSha=${ctx.deployedSha} expected=${ctx.expectedSha}`,
    selector: "GET /api/health",
    rootCause: pass ? undefined : "Deployed SHA does not match certification build",
  });
  return pass;
}

export async function verifyClerk(page: Page, steps: SmokeStep[]): Promise<boolean> {
  let userId: string | null = null;
  for (let i = 0; i < 25; i++) {
    userId = await page.evaluate(() => {
      const w = window as unknown as { Clerk?: { user?: { id?: string } | null } };
      return w.Clerk?.user?.id ?? null;
    });
    if (userId) break;
    await page.waitForTimeout(1000);
  }
  const pass = Boolean(userId);
  recordStep(steps, {
    id: "SMOKE-02",
    requirement: "Clerk initializes and founder authentication completes",
    pass,
    evidence: pass ? `clerkUserId=${userId}` : "no Clerk user id after 25s",
    selector: "window.Clerk.user.id",
    rootCause: pass ? undefined : "Founder sign-in did not complete",
  });
  return pass;
}

export async function launchCertBrowser(base: string): Promise<{
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  context: BrowserContext;
}> {
  const host = new URL(base).hostname;
  const ip = await resolveHostIp(host);
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      `--host-resolver-rules=${chromiumHostRule(host, ip)}`,
    ],
  });
  const context = await browser.newContext();
  await installAudioCounterInitScript(context);
  return { browser, context };
}

export async function signInForCert(context: BrowserContext, base: string): Promise<Page> {
  if (!isClerkAllowedHost(base)) {
    console.log(
      "Note: Clerk on *.railway.app is blocked — use sprint-8-preview.fantasyfootballrivals.com",
    );
  }
  const page = await signInFounderForPreview(context, base);
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 60_000 });
  await page.waitForTimeout(1500);
  return page;
}

export async function resolveLeagueDraft(page: Page, ctx: HarnessContext): Promise<void> {
  const league = await trpcQuery<{ leagueId?: string }>(page, ctx.base, "league.getActive", {});
  ctx.leagueId = String(league.leagueId ?? "457622");
  const seasons = await trpcQuery<number[]>(page, ctx.base, "espn.cachedSeasons", {}).catch(() => []);
  ctx.draftId = buildRfsnLiveDraftIdFromLeague(seasons);
}

export async function openLiveDraftTab(page: Page, base: string, steps: SmokeStep[]): Promise<boolean> {
  await page.goto(`${base}/draft-war-room`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const liveDraftBtn = page.getByRole("button", { name: /Live Draft/i });
  let found = false;
  for (let i = 0; i < 30; i++) {
    if ((await liveDraftBtn.count()) > 0) {
      found = true;
      break;
    }
    await page.waitForTimeout(1000);
  }
  if (!found) {
    recordStep(steps, {
      id: "SMOKE-03",
      requirement: "Harness reaches the Live Draft tab",
      pass: false,
      evidence: "Live Draft button not found after 30s",
      selector: 'role=button[name=/Live Draft/i]',
      rootCause: "Draft War Room did not expose Live Draft navigation",
    });
    return false;
  }
  await liveDraftBtn.click();
  try {
    await page.waitForSelector(".live-draft-surface", { timeout: 60_000 });
  } catch {
    recordStep(steps, {
      id: "SMOKE-03",
      requirement: "Harness reaches the Live Draft tab",
      pass: false,
      evidence: ".live-draft-surface not visible after clicking Live Draft",
      selector: ".live-draft-surface",
      rootCause: "Live Draft surface did not mount",
    });
    return false;
  }
  recordStep(steps, {
    id: "SMOKE-03",
    requirement: "Harness reaches the Live Draft tab",
    pass: true,
    evidence: "Live Draft clicked; .live-draft-surface visible",
    selector: ".live-draft-surface",
  });
  return true;
}

export type DraftUiState = {
  pickCompleted: number;
  pickTotal: number;
  draftComplete: boolean;
  startVisible: boolean;
  pauseVisible: boolean;
  resetVisible: boolean;
  clockState: string | null;
  boothLabel: string;
  boothActive: boolean;
};

export async function readDraftUiState(page: Page): Promise<DraftUiState> {
  return page.evaluate(() => {
    const surface = document.querySelector(".live-draft-surface");
    const pickText =
      surface?.textContent?.match(/Pick (\d+)\/(\d+)/)?.slice(1) ?? [];
    const pickCompleted = Number(pickText[0] ?? 0);
    const pickTotal = Number(pickText[1] ?? 0);
    const buttons = [...(surface?.querySelectorAll("button") ?? [])].map((b) => b.textContent ?? "");
    const startVisible = buttons.some((t) => /Start Draft|Resume/i.test(t));
    const pauseVisible = buttons.some(
      (t) => /⏸\s*Pause/.test(t) || (/\bPause\b/.test(t) && !/Pause on my picks/i.test(t)),
    );
    const resetVisible = buttons.some((t) => /Reset/i.test(t) && !/Reset team controls/i.test(t));
    const draftComplete = Boolean(surface?.textContent?.includes("Draft complete"));
    const clock = document.querySelector("[data-clock-state]");
    const booth = document.querySelector("[data-rfsn-warroom-broadcast]");
    const boothText = booth?.textContent ?? "";
    return {
      pickCompleted,
      pickTotal,
      draftComplete,
      startVisible,
      pauseVisible,
      resetVisible,
      clockState: clock?.getAttribute("data-clock-state") ?? null,
      boothLabel: boothText.includes("On air")
        ? "On air"
        : boothText.includes("Commentary in progress")
          ? "Commentary in progress"
          : boothText.includes("Draft complete")
            ? "Draft complete"
            : "Between picks",
      boothActive: Boolean(document.querySelector('[data-booth-state="active"]')),
    };
  });
}

export async function ensureFreshDraftSession(
  page: Page,
  ctx: HarnessContext,
  steps: SmokeStep[],
): Promise<boolean> {
  try {
    await trpcMutate(page, ctx.base, "rfsnBroadcast.resetLiveSession", {
      leagueId: ctx.leagueId,
      draftId: ctx.draftId,
    });
  } catch (err) {
    recordStep(steps, {
      id: "SMOKE-04",
      requirement: "Draft session exists and is reset for certification",
      pass: false,
      evidence: err instanceof Error ? err.message : String(err),
      selector: "trpc rfsnBroadcast.resetLiveSession",
      rootCause: "Server live session reset failed",
    });
    return false;
  }

  await page.evaluate(
    ({ leagueId, draftId }) => {
      const prefix = `rfsn-live-draft:${leagueId}:${draftId}:`;
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
      }
    },
    { leagueId: ctx.leagueId, draftId: ctx.draftId },
  );

  const ui = await readDraftUiState(page);
  if (ui.draftComplete || ui.pickCompleted > 0 || ui.resetVisible) {
    const resetBtn = page.locator(".live-draft-surface").getByRole("button", { name: /↺ Reset/i });
    if ((await resetBtn.count()) > 0) {
      await resetBtn.first().click();
      await page.waitForTimeout(1500);
    }
  }

  let serverClean = false;
  let lastSnap: { sessionState?: string; draftComplete?: boolean } = {};
  for (let i = 0; i < 20; i++) {
    lastSnap = await trpcQuery<{ sessionState?: string; draftComplete?: boolean }>(
      page,
      ctx.base,
      "rfsnBroadcast.getLiveSnapshot",
      { leagueId: ctx.leagueId, draftId: ctx.draftId },
    );
    serverClean =
      lastSnap.sessionState === "waiting_for_draft" && !lastSnap.draftComplete;
    if (serverClean) break;
    await page.waitForTimeout(500);
  }

  const after = await readDraftUiState(page);
  const pass =
    !after.draftComplete &&
    after.startVisible &&
    after.pickCompleted === 0 &&
    serverClean;
  recordStep(steps, {
    id: "SMOKE-04",
    requirement: "Draft session exists and is reset for certification",
    pass,
    evidence: `draftComplete=${after.draftComplete} pick=${after.pickCompleted}/${after.pickTotal} startVisible=${after.startVisible} sessionState=${lastSnap.sessionState ?? "unknown"} serverDraftComplete=${Boolean(lastSnap.draftComplete)}`,
    selector: 'role=button[name=/Start Draft/i]',
    rootCause: pass
      ? undefined
      : after.draftComplete
        ? "Draft still complete after reset — stale client or booth state"
        : !serverClean
          ? "Server live session still draft_complete or busy after reset"
          : "Start Draft not available after reset",
  });
  return pass;
}

export async function startSimulation(
  page: Page,
  steps: SmokeStep[],
  opts: { pace?: "Broadcast" | "Brisk" | "Turbo" } = {},
): Promise<boolean> {
  const pace = opts.pace ?? "Broadcast";
  const paceBtn = page.locator(".live-draft-surface").getByRole("button", { name: pace, exact: true });
  if ((await paceBtn.count()) > 0) await paceBtn.click();

  const startBtn = page.locator(".live-draft-surface").getByRole("button", { name: /Start Draft|Resume/i });
  if ((await startBtn.count()) === 0) {
    recordStep(steps, {
      id: "SMOKE-05",
      requirement: "Simulation is explicitly started",
      pass: false,
      evidence: "Start Draft / Resume button not found",
      selector: 'role=button[name=/Start Draft|Resume/i]',
      rootCause: "Cannot start simulation — button missing",
    });
    return false;
  }
  await startBtn.first().click();

  const deadline = Date.now() + 10_000;
  let pauseVisible = false;
  while (Date.now() < deadline) {
    const ui = await readDraftUiState(page);
    if (ui.pauseVisible) {
      pauseVisible = true;
      break;
    }
    await page.waitForTimeout(250);
  }

  recordStep(steps, {
    id: "SMOKE-05",
    requirement: "Simulation is explicitly started",
    pass: pauseVisible,
    evidence: `pauseVisible=${pauseVisible}`,
    selector: 'role=button[name=/Pause/i]',
    rootCause: pauseVisible ? undefined : "Clicked Start but Pause never appeared — running=false",
  });
  return pauseVisible;
}

export async function waitForPickClockRunning(page: Page, steps: SmokeStep[], timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let clockState: string | null = null;
  while (Date.now() < deadline) {
    const ui = await readDraftUiState(page);
    clockState = ui.clockState;
    if (clockState === "running" || clockState === "urgent" || clockState === "paused_for_broadcast") {
      recordStep(steps, {
        id: "SMOKE-06",
        requirement: "Pick clock is running",
        pass: true,
        evidence: `data-clock-state=${clockState}`,
        selector: "[data-clock-state]",
      });
      return true;
    }
    await page.waitForTimeout(500);
  }
  recordStep(steps, {
    id: "SMOKE-06",
    requirement: "Pick clock is running",
    pass: false,
    evidence: `data-clock-state=${clockState ?? "missing"}`,
    selector: "[data-clock-state]",
    rootCause: "Clock never entered running/urgent/paused_for_broadcast",
  });
  return false;
}

export async function waitForFirstLockedPick(
  page: Page,
  ctx: HarnessContext,
  steps: SmokeStep[],
  timeoutMs = TIMEOUTS.firstPickLocked,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let lastUi: DraftUiState | null = null;
  let lastSnap: { sessionState?: string; overallPick?: number } | null = null;

  while (Date.now() < deadline) {
    lastUi = await readDraftUiState(page);
    if (lastUi.pickCompleted >= 1) {
      recordStep(steps, {
        id: "SMOKE-07",
        requirement: "At least one pick is locked",
        pass: true,
        evidence: `pickCompleted=${lastUi.pickCompleted}/${lastUi.pickTotal}`,
        selector: '.live-draft-surface text=/Pick \\d+\\//',
      });
      return true;
    }

    try {
      lastSnap = await trpcQuery<{
        sessionState?: string;
        overallPick?: number;
        snapshot?: { overallPick?: number };
      }>(page, ctx.base, "rfsnBroadcast.getLiveSnapshot", {
        leagueId: ctx.leagueId,
        draftId: ctx.draftId,
      });
      const overall = lastSnap.overallPick ?? lastSnap.snapshot?.overallPick ?? 0;
      if (overall >= 1 && lastSnap.sessionState && lastSnap.sessionState !== "between_picks") {
        recordStep(steps, {
          id: "SMOKE-07",
          requirement: "At least one pick is locked",
          pass: true,
          evidence: `snapshot.overallPick=${overall} sessionState=${lastSnap.sessionState}`,
          selector: "trpc rfsnBroadcast.getLiveSnapshot",
        });
        return true;
      }
    } catch {
      // retry
    }

    if (lastUi.boothLabel !== "Between picks" || lastUi.boothActive) {
      // commentary activity implies a pick was processed
      recordStep(steps, {
        id: "SMOKE-07",
        requirement: "At least one pick is locked",
        pass: true,
        evidence: `booth=${lastUi.boothLabel} boothActive=${lastUi.boothActive}`,
        selector: "[data-rfsn-warroom-broadcast]",
      });
      return true;
    }

    await page.waitForTimeout(500);
  }

  recordStep(steps, {
    id: "SMOKE-07",
    requirement: "At least one pick is locked",
    pass: false,
    evidence: `pickCompleted=${lastUi?.pickCompleted ?? 0} sessionState=${lastSnap?.sessionState ?? "unknown"} booth=${lastUi?.boothLabel ?? "unknown"}`,
    selector: '.live-draft-surface text=/Pick \\d+\\//',
    rootCause: "No pick advanced within timeout — simulation idle",
  });
  return false;
}

export async function waitForBroadcastPickReceived(
  page: Page,
  ctx: HarnessContext,
  steps: SmokeStep[],
  timeoutMs = TIMEOUTS.commentaryCard,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let last: { sessionState?: string } = {};
  while (Date.now() < deadline) {
    try {
      last = await trpcQuery(page, ctx.base, "rfsnBroadcast.getLiveSnapshot", {
        leagueId: ctx.leagueId,
        draftId: ctx.draftId,
      });
      if (
        last.sessionState === "commentary_pending" ||
        last.sessionState === "commentary_active" ||
        last.sessionState === "draft_complete"
      ) {
        recordStep(steps, {
          id: "SMOKE-08",
          requirement: "Broadcast API received a locked pick",
          pass: true,
          evidence: `sessionState=${last.sessionState}`,
          selector: "trpc rfsnBroadcast.getLiveSnapshot",
        });
        return true;
      }
    } catch {
      // retry
    }
    await page.waitForTimeout(500);
  }
  recordStep(steps, {
    id: "SMOKE-08",
    requirement: "Broadcast API received a locked pick",
    pass: false,
    evidence: `sessionState=${last.sessionState ?? "between_picks"}`,
    selector: "trpc rfsnBroadcast.getLiveSnapshot",
    rootCause: "notifyLockedPick did not produce commentary session activity",
  });
  return false;
}

export async function waitForCommentaryCard(
  page: Page,
  steps: SmokeStep[],
  timeoutMs = TIMEOUTS.commentaryCard,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let boothLabel = "Between picks";
  let boothActive = false;
  while (Date.now() < deadline) {
    const ui = await readDraftUiState(page);
    boothLabel = ui.boothLabel;
    boothActive = ui.boothActive;
    if (boothActive || boothLabel === "On air" || boothLabel === "Commentary in progress") {
      recordStep(steps, {
        id: "SMOKE-09",
        requirement: "Commentary card appears in booth",
        pass: true,
        evidence: `booth=${boothLabel} boothActive=${boothActive}`,
        selector: '[data-booth-state="active"]',
      });
      return true;
    }
    await page.waitForTimeout(500);
  }
  recordStep(steps, {
    id: "SMOKE-09",
    requirement: "Commentary card appears in booth",
    pass: false,
    evidence: `booth=${boothLabel} boothActive=${boothActive}`,
    selector: '[data-booth-state="active"]',
    rootCause: "Booth stayed idle — no commentary card rendered",
  });
  return false;
}

export async function clickEnableSound(page: Page, steps: SmokeStep[], outDir: string): Promise<boolean> {
  const enableBtn = page
    .locator("[data-rfsn-warroom-broadcast]")
    .getByRole("button", { name: /Enable Broadcast Audio|Tap to Enable Sound/i });
  const selector = '[data-rfsn-warroom-broadcast] role=button[/Enable Broadcast Audio|Tap to Enable Sound/]';

  try {
    await enableBtn.first().waitFor({ state: "visible", timeout: TIMEOUTS.enableSound });
  } catch {
    recordStep(steps, {
      id: "SMOKE-10",
      requirement: "Enable Sound button is clicked and unlock verified",
      pass: false,
      evidence: "Enable button never became visible",
      selector,
      screenshot: await shot(page, outDir, "smoke-10-enable-missing"),
      rootCause: "TTS controls not rendered or booth panel missing",
    });
    return false;
  }

  for (let i = 0; i < 5 && (await enableBtn.count()) > 0; i++) {
    await enableBtn.first().click();
    await page.waitForTimeout(400);
  }

  const unlockRemaining = await enableBtn.count();
  const audioOnVisible =
    (await page.locator("[data-rfsn-warroom-broadcast]").getByText("Audio on").count()) > 0;
  const pass = unlockRemaining === 0 && audioOnVisible;
  recordStep(steps, {
    id: "SMOKE-10",
    requirement: "Enable Sound button is clicked and unlock verified",
    pass,
    evidence: `unlockButtonsRemaining=${unlockRemaining} audioOn=${audioOnVisible}`,
    selector,
    screenshot: await shot(page, outDir, "smoke-10-enable-sound"),
    rootCause: pass
      ? undefined
      : unlockRemaining > 0
        ? "Enable button still visible after clicks"
        : 'Audio on label not shown after unlock',
  });
  return pass;
}

export async function waitForFirstAudioAttempt(
  page: Page,
  steps: SmokeStep[],
  outDir: string,
  timeoutMs = TIMEOUTS.firstAudioAttempt,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let metrics = { playCalls: 0, audioStarts: 0, audioFetches: 0 };
  while (Date.now() < deadline) {
    metrics = await certMetrics(page);
    if (metrics.playCalls >= 1 || metrics.audioStarts >= 1 || metrics.audioFetches >= 1) {
      recordStep(steps, {
        id: "SMOKE-11",
        requirement: "First audio play is attempted",
        pass: true,
        evidence: `playCalls=${metrics.playCalls} audioStarts=${metrics.audioStarts} audioFetches=${metrics.audioFetches}`,
        selector: "HTMLAudioElement.play / window.Audio",
      });
      return true;
    }
    await page.waitForTimeout(500);
  }
  recordStep(steps, {
    id: "SMOKE-11",
    requirement: "First audio play is attempted",
    pass: false,
    evidence: `playCalls=${metrics.playCalls} audioStarts=${metrics.audioStarts} audioFetches=${metrics.audioFetches}`,
    selector: "HTMLAudioElement.play / window.Audio",
    screenshot: await shot(page, outDir, "smoke-11-no-audio"),
    rootCause: "No audio fetch or play after commentary — not certifiable yet",
  });
  return false;
}

export function installAudioCounterInitScript(context: BrowserContext): Promise<void> {
  return context.addInitScript(() => {
    const w = window as unknown as {
      __rfsnCert: {
        audioStarts: number;
        endedEvents: number;
        replayStarts: number;
        playCalls: number;
        audioFetches: number;
      };
    };
    w.__rfsnCert = { audioStarts: 0, endedEvents: 0, replayStarts: 0, playCalls: 0, audioFetches: 0 };
    const origFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/rfsn/audio/")) w.__rfsnCert.audioFetches += 1;
      return origFetch(input, init);
    }) as typeof window.fetch;
    const Orig = window.Audio;
    window.Audio = function (this: HTMLAudioElement, src?: string) {
      const a = new Orig(src);
      w.__rfsnCert.audioStarts += 1;
      a.addEventListener("ended", () => {
        w.__rfsnCert.endedEvents += 1;
      });
      return a;
    } as unknown as typeof Audio;
    Object.assign(window.Audio, Orig);
    window.Audio.prototype = Orig.prototype;
    const origPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function (this: HTMLAudioElement, ...args: Parameters<typeof origPlay>) {
      w.__rfsnCert.playCalls += 1;
      return origPlay.apply(this, args);
    };
  });
}

export async function certMetrics(page: Page): Promise<{
  audioStarts: number;
  endedEvents: number;
  replayStarts: number;
  playCalls: number;
  audioFetches: number;
}> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __rfsnCert?: {
        audioStarts: number;
        endedEvents: number;
        replayStarts: number;
        playCalls: number;
        audioFetches: number;
      };
    };
    return {
      audioStarts: w.__rfsnCert?.audioStarts ?? 0,
      endedEvents: w.__rfsnCert?.endedEvents ?? 0,
      replayStarts: w.__rfsnCert?.replayStarts ?? 0,
      playCalls: w.__rfsnCert?.playCalls ?? 0,
      audioFetches: w.__rfsnCert?.audioFetches ?? 0,
    };
  });
}

export function writeSmokeReport(
  outDir: string,
  ctx: HarnessContext,
  steps: SmokeStep[],
  status: "READY" | "NOT READY",
): string {
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    status,
    previewUrl: ctx.base,
    deployedGitSha: ctx.deployedSha,
    expectedGitSha: ctx.expectedSha,
    leagueId: ctx.leagueId,
    draftId: ctx.draftId,
    at: new Date().toISOString(),
    steps,
    passed: steps.filter((s) => s.pass).length,
    failed: steps.filter((s) => !s.pass).length,
  };
  const reportPath = path.join(outDir, "smoke-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

export class CertNotReadyError extends Error {
  readonly blockingStep: string;
  constructor(blockingStep: string, message: string) {
    super(message);
    this.name = "CertNotReadyError";
    this.blockingStep = blockingStep;
  }
}
