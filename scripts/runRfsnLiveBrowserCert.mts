/**
 * Production browser certification — audio playback, mobile layout, no 502s.
 *
 * Prereq: scripts/_founder_signin_url.txt (mint via scripts/_mint_founder_signin.mts)
 *
 *   npx tsx scripts/runRfsnLiveBrowserCert.mts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page, type BrowserContext } from "playwright";
import { buildRfsnLiveDraftIdFromLeague } from "../client/src/lib/rfsnLiveDraftId";

const BASE = (process.env.QA_BASE ?? "https://fantasyfootballrivals.com").replace(/\/$/, "");
const SIGNIN_URL = fs
  .readFileSync(path.join(import.meta.dirname, "_founder_signin_url.txt"), "utf8")
  .trim();
let DRAFT_ID = "rfsn-live-internal"; // authoritative war-room-live-{season}; resolved from synced seasons in main()

type Check = { name: string; pass: boolean; detail: string };

const checks: Check[] = [];
const audioResponses: Array<{ url: string; status: number }> = [];
const consoleErrors: string[] = [];

function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}: ${detail}`);
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

async function trpcMutate<T>(page: Page, proc: string, input: Record<string, unknown>): Promise<T> {
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
    { proc, input, base: BASE },
  );
}

function wireNetwork(page: Page): void {
  page.on("response", (res) => {
    if (res.url().includes("/api/rfsn/audio")) {
      audioResponses.push({ url: res.url(), status: res.status() });
    }
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
}

async function signIn(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  wireNetwork(page);
  await page.goto(SIGNIN_URL, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForURL(/fantasyfootballrivals\.com|gmwarroom\.online/, { timeout: 60_000 });
  await page.waitForTimeout(3000);
  return page;
}

async function triggerCommentaryPick(page: Page, leagueId: string): Promise<void> {
  await trpcMutate(page, "rfsnBroadcast.resetLiveSession", { leagueId, draftId: DRAFT_ID });
  await trpcMutate(page, "rfsnBroadcast.notifyLockedPick", {
    leagueId,
    draftId: DRAFT_ID,
    pick: {
      overallPick: 9,
      round: 1,
      roundPick: 9,
      teamId: "3",
      ownerName: "Demetri Clark",
      playerId: "allen",
      playerName: "Josh Allen",
      position: "QB",
      nflTeam: "BUF",
    },
    useDeterministicProvider: false,
  });
}

async function waitForReadyClip(page: Page, leagueId: string, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await trpcQuery<{
      audioStatus?: {
        draftId: string;
        pickId: string;
        pickNumber: number;
        clips: Array<{ status: string; audioId?: string; voice: string }>;
      };
    }>(page, "rfsnBroadcast.getLiveSnapshot", { leagueId, draftId: DRAFT_ID });
    const clip = snap.audioStatus?.clips?.find((c) => c.status === "ready" && c.audioId);
    if (clip && snap.audioStatus) return { snap: snap.audioStatus, clip };
    await page.waitForTimeout(2500);
  }
  return null;
}

async function runDesktopPlayback(page: Page, leagueId: string): Promise<void> {
  await page.goto(`${BASE}/rfsn/live`, { waitUntil: "networkidle", timeout: 60_000 });
  const enableBtn = page.getByRole("button", { name: /Enable Broadcast Audio/i });
  if ((await enableBtn.count()) > 0) {
    await enableBtn.click();
  }

  await triggerCommentaryPick(page, leagueId);

  const ready = await waitForReadyClip(page, leagueId);
  if (!ready) {
    record("audible playback", false, "no ready audio clip within timeout");
    return;
  }

  const fetchRes = await page.evaluate(
    async ({ audioStatus, clip, base }) => {
      const params = new URLSearchParams({
        draftId: audioStatus.draftId,
        pickId: audioStatus.pickId,
        pickNumber: String(audioStatus.pickNumber),
        voice: clip.voice,
      });
      const r = await fetch(
        `${base}/api/rfsn/audio/${encodeURIComponent(clip.audioId!)}?${params}`,
        { credentials: "include" },
      );
      const buf = await r.arrayBuffer();
      return {
        status: r.status,
        len: buf.byteLength,
        ct: r.headers.get("content-type"),
        riff: new TextDecoder().decode(buf.slice(0, 4)),
      };
    },
    { audioStatus: ready.snap, clip: ready.clip, base: BASE },
  );

  if (fetchRes.status !== 200 || fetchRes.riff !== "RIFF") {
    record(
      "audible playback",
      false,
      `audio fetch status=${fetchRes.status} len=${fetchRes.len} ct=${fetchRes.ct}`,
    );
    return;
  }

  const blobPlay = await page.evaluate(
    async ({ audioStatus, clip, base }) => {
      const params = new URLSearchParams({
        draftId: audioStatus.draftId,
        pickId: audioStatus.pickId,
        pickNumber: String(audioStatus.pickNumber),
        voice: clip.voice,
      });
      const r = await fetch(
        `${base}/api/rfsn/audio/${encodeURIComponent(clip.audioId!)}?${params}`,
        { credentials: "include" },
      );
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      await a.play();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const ok = !a.paused && a.currentTime > 0;
      a.pause();
      URL.revokeObjectURL(url);
      return { ok, currentTime: a.currentTime, blobBytes: blob.size };
    },
    { audioStatus: ready.snap, clip: ready.clip, base: BASE },
  );

  if (blobPlay.ok) {
    record(
      "audible playback",
      true,
      `WAV decodes and plays (${blobPlay.blobBytes}B, t=${blobPlay.currentTime.toFixed(2)}s)`,
    );
    return;
  }

  // Booth-integrated playback (may fail in headless due to timing/autoplay)
  for (let i = 0; i < 20; i++) {
    const state = await page.evaluate(async () => {
      const a = document.querySelector("audio");
      if (!a) return { hasAudio: false, playing: false, currentTime: 0 };
      try {
        if (a.paused) await a.play();
      } catch {
        // ignore — may need another poll
      }
      return { hasAudio: true, playing: !a.paused, currentTime: a.currentTime };
    });
    if (state.playing && state.currentTime > 0) {
      record(
        "audible playback",
        true,
        `audio progressing t=${state.currentTime.toFixed(2)}s, fetch ${fetchRes.len}B WAV`,
      );
      return;
    }
    await page.waitForTimeout(2000);
  }
  record(
    "audible playback",
    false,
    `fetch OK (${fetchRes.len}B) but blob play failed in session`,
  );
}

async function runMobileChecks(context: BrowserContext, leagueId: string): Promise<void> {
  const page = await context.newPage();
  wireNetwork(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/rfsn/live`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2000);

  const enableBtn = page.getByRole("button", { name: /Enable Broadcast Audio/i });
  if ((await enableBtn.count()) > 0) await enableBtn.click();

  await triggerCommentaryPick(page, leagueId);

  const access = await trpcQuery<{ ttsEnabled?: boolean }>(page, "rfsnBroadcast.getAccess", {});
  const controlArea = page.locator("button", { hasText: /Broadcast Audio|Audio on|Muted/i });
  const controlVisible = Boolean(access.ttsEnabled) && (await controlArea.count()) > 0;
  record(
    "mobile controls/layout",
    controlVisible,
    controlVisible
      ? `ttsEnabled audio control visible (${await controlArea.first().innerText()})`
      : `ttsEnabled=${access.ttsEnabled} controls=${await controlArea.count()}`,
  );

  // Portrait activates when commentary is on air
  let portraitActive = false;
  for (let i = 0; i < 45; i++) {
    const active = await page.locator('[data-booth-state="active"]').count();
    const portrait = await page.locator(".rfsn-booth-portrait img").count();
    if (active > 0 && portrait > 0) {
      portraitActive = true;
      break;
    }
    await page.waitForTimeout(2000);
  }
  record(
    "portrait activation",
    portraitActive,
    portraitActive ? "active booth card with portrait image" : "no active portrait within timeout",
  );

  await page.close();
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext();
  const page = await signIn(context);

  const league = await trpcQuery<{ leagueId?: string }>(page, "league.getActive", {});
  const leagueId = String(league.leagueId ?? "457622");

  // Authoritative live draft id — same helper the app uses (highest synced season,
  // calendar-year fallback). Replaces the legacy hardcoded "rfsn-live-internal".
  const cachedSeasons = await trpcQuery<number[]>(page, "espn.cachedSeasons", {}).catch(
    () => [] as number[],
  );
  DRAFT_ID = buildRfsnLiveDraftIdFromLeague(cachedSeasons);
  console.log(
    `Live draft id: ${DRAFT_ID} (synced seasons: ${cachedSeasons.length ? cachedSeasons.join(", ") : "none — calendar-year fallback"})`,
  );

  await runDesktopPlayback(page, leagueId);
  await runMobileChecks(context, leagueId);

  const badAudio = audioResponses.filter((r) => r.status >= 500);
  const leaks = consoleErrors.filter((e) =>
    /generation failed|entailment|kokoro|TTS_SERVICE|unsupported voice/i.test(e),
  );
  const audio502 = audioResponses.filter((r) => r.status === 502);
  record(
    "no browser 502s or raw errors",
    audio502.length === 0 && leaks.length === 0,
    audio502.length
      ? `audio 502s: ${audio502.length}`
      : leaks.length
        ? `console leaks: ${leaks.slice(0, 3).join(" | ")}`
        : `audio fetches: ${audioResponses.map((r) => r.status).join(",") || "none"}`,
  );

  await browser.close();

  const failed = checks.filter((c) => !c.pass);
  console.log("\n===== BROWSER CERT =====");
  console.log(JSON.stringify({ passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
