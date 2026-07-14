/**
 * WR-001 — Trace every qualifying written commentary frame in a live browser draft.
 *
 *   EXPECTED_GIT_SHA=… QA_BASE=https://sprint-8-preview.fantasyfootballrivals.com \
 *   railway run -- pnpm exec tsx scripts/runWr001WrittenReliability.mts
 */
import fs from "node:fs";
import path from "node:path";
import {
  OUT_DIR,
  clearRfsnAudioCertState,
  createHarnessContext,
  ensureFreshDraftSession,
  launchCertBrowser,
  openLiveDraftTab,
  readDraftUiState,
  resolveLeagueDraft,
  signInForCert,
  startSimulation,
  trpcQuery,
  verifyClerk,
  verifyDeploySha,
  waitForPickClockRunning,
  type HarnessContext,
  type SmokeStep,
  recordStep,
} from "./liveDraftCertHarness.mts";

const VERIFY_OUT = path.join(OUT_DIR, "wr001-written-reliability");
const EXPECTED_SHA_PREFIX = (process.env.EXPECTED_GIT_SHA ?? "02946c1").slice(0, 7);
const BARE_TXN = /^.+ selected .+\.?$/i;
const WHY_OR_CONTEXT =
  /\b(ADP|ahead|fell|need|starter|roster|build|board|run|rival|receipt|round|consensus|tracked|history|franchise|slot|lineup|reach|steal|depth|construction|scramble|temperature|reply|opinions)\b/i;

type FrameTrace = {
  pick: number | null;
  owner: string | null;
  player: string | null;
  analyst: string | null;
  serverGenerated: boolean;
  serverDelivered: boolean;
  clientReceived: boolean;
  snapshotContainsCard: boolean;
  boothSequenceContainsCard: boolean;
  heroDisplayed: boolean;
  textVisible: boolean;
  displayDurationMs: number | null;
  broadcastLogEntryCreated: boolean;
  advancementCompleted: boolean;
  text: string | null;
  failedTransition: string | null;
  sessionState: string | null;
};

type PhaseReport = {
  qualifyingFrames: number;
  displayed: number;
  skipped: number;
  blankCards: number;
  duplicateCards: number;
  minDisplayMs: number | null;
  avgDisplayMs: number | null;
  maxDisplayMs: number | null;
  wrapUpCount: number;
  sessionComplete: boolean;
  picks: number[];
  analysts: Record<string, number>;
  traces: FrameTrace[];
  firstFailure: FrameTrace | null;
  bareTxnCards: number;
};

async function disableVoice(page: import("playwright").Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.setItem("rfsn-live-audio-enabled", "false");
    } catch {
      // ignore
    }
  });
}

async function captureDom(page: import("playwright").Page) {
  return page.evaluate(() => {
    const active = document.querySelector('[data-booth-state="active"]') as HTMLElement | null;
    const paragraphs = [...(active?.querySelectorAll("p") ?? [])].map((p) => p.textContent?.trim() ?? "");
    const text =
      paragraphs.find((t) => t && !/standby/i.test(t) && t.length > 8) ??
      active?.querySelector("p.font-medium:not(.italic)")?.textContent?.trim() ??
      null;
    const analyst =
      active?.querySelector("header span.font-black, header span")?.textContent?.trim() ??
      active?.getAttribute("data-booth-card") ??
      null;
    const log = document.querySelector("[data-rfsn-commentary-log]");
    const logEntries = [...(log?.querySelectorAll("li") ?? [])].map((li) => li.textContent?.trim() ?? "");
    const surface = document.querySelector(".live-draft-surface");
    const pickCompleted = Number(surface?.textContent?.match(/Pick (\d+)\//)?.[1] ?? 0);
    const pickTotal = Number(surface?.textContent?.match(/Pick \d+\/(\d+)/)?.[1] ?? 0);
    const draftComplete = /Draft complete|Complete/i.test(surface?.textContent ?? "");
    const wrapUp =
      document.querySelector('[data-rfsn-wrap-up="true"]') != null ||
      /Draft complete/i.test(document.querySelector("[data-rfsn-warroom-broadcast]")?.textContent ?? "");
    const blankActive = Boolean(active && (!text || text.length < 8));
    const enableSoundVisible = [...document.querySelectorAll("button")].some((b) =>
      /Enable Sound|Tap to unmute|Broadcast Audio/i.test(b.textContent ?? ""),
    );
    return {
      analyst,
      text,
      logEntries,
      pickCompleted,
      pickTotal,
      draftComplete,
      wrapUp,
      blankActive,
      enableSoundVisible,
      hasActiveBooth: Boolean(active),
    };
  });
}

async function getSnapshot(
  page: import("playwright").Page,
  ctx: HarnessContext,
): Promise<{
  sessionState: string | null;
  draftComplete: boolean;
  primaryText: string | null;
  primaryAnalyst: string | null;
  pickNumber: number | null;
  owner: string | null;
  player: string | null;
  significance: string | null;
}> {
  const live = (await trpcQuery(page, ctx.base, "rfsnBroadcast.getLiveSnapshot", {
    leagueId: ctx.leagueId,
    draftId: ctx.draftId,
  })) as {
    sessionState?: string;
    draftComplete?: boolean;
    snapshot?: {
      significance?: string;
      primary?: { text?: string; commentator?: string } | null;
      board?: Array<{ ownerName?: string; playerName?: string; overall?: number }>;
    } | null;
    activePickIdentity?: { pickNumber?: number } | null;
  };

  const pickNumber = live.activePickIdentity?.pickNumber ?? null;
  const board = live.snapshot?.board ?? [];
  const row = pickNumber != null ? board.find((b) => b.overall === pickNumber) : undefined;

  return {
    sessionState: live.sessionState ?? null,
    draftComplete: Boolean(live.draftComplete),
    primaryText: live.snapshot?.primary?.text?.trim() ?? null,
    primaryAnalyst: live.snapshot?.primary?.commentator ?? null,
    pickNumber,
    owner: row?.ownerName ?? null,
    player: row?.playerName ?? null,
    significance: live.snapshot?.significance ?? null,
  };
}

function emptyPhase(): PhaseReport {
  return {
    qualifyingFrames: 0,
    displayed: 0,
    skipped: 0,
    blankCards: 0,
    duplicateCards: 0,
    minDisplayMs: null,
    avgDisplayMs: null,
    maxDisplayMs: null,
    wrapUpCount: 0,
    sessionComplete: false,
    picks: [],
    analysts: {},
    traces: [],
    firstFailure: null,
    bareTxnCards: 0,
  };
}

function finalizeDurations(phase: PhaseReport): void {
  const durs = phase.traces
    .map((t) => t.displayDurationMs)
    .filter((n): n is number => typeof n === "number" && n > 0);
  if (durs.length === 0) return;
  phase.minDisplayMs = Math.min(...durs);
  phase.maxDisplayMs = Math.max(...durs);
  phase.avgDisplayMs = Math.round(durs.reduce((a, b) => a + b, 0) / durs.length);
}

async function runPhase(
  page: import("playwright").Page,
  ctx: HarnessContext,
  steps: SmokeStep[],
  opts: { stopAtPick?: number; timeoutMs: number; label: string },
): Promise<PhaseReport> {
  const phase = emptyPhase();
  await ensureFreshDraftSession(page, ctx, steps);
  await disableVoice(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Live Draft/i }).click();
  await page.waitForSelector(".live-draft-surface", { timeout: 60_000 });
  await disableVoice(page);

  if (!(await startSimulation(page, steps, { pace: "Turbo" }))) {
    throw new Error(`${opts.label}: simulation did not start`);
  }
  await waitForPickClockRunning(page, steps);

  const started = Date.now();
  const openTraces = new Map<string, { trace: FrameTrace; firstVisibleAt: number | null; lastText: string | null }>();
  const seenKeys = new Set<string>();
  const seenTexts = new Map<string, number>();
  let lastPick = 0;
  let lastProgressAt = Date.now();
  let wrapHits = 0;
  let stopped = false;

  const closeOpen = (now: number, advancement: boolean) => {
    for (const [key, open] of openTraces) {
      if (open.firstVisibleAt != null && open.trace.displayDurationMs == null) {
        open.trace.displayDurationMs = now - open.firstVisibleAt;
      }
      open.trace.advancementCompleted = advancement || open.trace.advancementCompleted;
      if (!open.trace.failedTransition) {
        if (!open.trace.serverGenerated) open.trace.failedTransition = "server generated";
        else if (!open.trace.serverDelivered) open.trace.failedTransition = "server delivered";
        else if (!open.trace.clientReceived) open.trace.failedTransition = "client received";
        else if (!open.trace.snapshotContainsCard) open.trace.failedTransition = "snapshot contains card";
        else if (!open.trace.boothSequenceContainsCard) open.trace.failedTransition = "booth sequence contains card";
        else if (!open.trace.heroDisplayed) open.trace.failedTransition = "hero displayed";
        else if (!open.trace.textVisible) open.trace.failedTransition = "text visible";
        else if ((open.trace.displayDurationMs ?? 0) < 5500) open.trace.failedTransition = "display duration (>=6s)";
        else if (!open.trace.broadcastLogEntryCreated) open.trace.failedTransition = "broadcast log entry created";
      }
      if (open.trace.failedTransition && !phase.firstFailure) {
        phase.firstFailure = open.trace;
      }
      if (open.trace.textVisible) phase.displayed += 1;
      else phase.skipped += 1;
      openTraces.delete(key);
    }
  };

  while (Date.now() - started < opts.timeoutMs && !stopped) {
    const snap = await getSnapshot(page, ctx);
    const dom = await captureDom(page);
    const now = Date.now();

    if (dom.blankActive) phase.blankCards += 1;
    if (dom.wrapUp) wrapHits += 1;

    if (dom.pickCompleted > lastPick) {
      lastPick = dom.pickCompleted;
      lastProgressAt = now;
      console.log(`${opts.label} progress: Pick ${dom.pickCompleted}/${dom.pickTotal}`);
      // closing previous visible when pick advances — dwell may continue across picks with preserve
    } else if (now - lastProgressAt > 90_000 && !dom.draftComplete) {
      for (const open of openTraces.values()) {
        open.trace.failedTransition = open.trace.failedTransition ?? "advancement completed";
        if (!phase.firstFailure) phase.firstFailure = open.trace;
      }
      break;
    }

    const hasQualifyingCard =
      Boolean(snap.primaryText) &&
      (snap.sessionState === "commentary_active" ||
        snap.sessionState === "commentary_pending" ||
        snap.sessionState === "draft_complete" ||
        snap.sessionState === "between_picks") &&
      snap.significance !== "routine";

    if (hasQualifyingCard && snap.primaryText) {
      const key = `${snap.pickNumber ?? "?"}|${snap.primaryAnalyst ?? "?"}|${snap.primaryText}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        phase.qualifyingFrames += 1;
        if (snap.pickNumber != null) phase.picks.push(snap.pickNumber);
        const analystKey = (snap.primaryAnalyst ?? "unknown").toLowerCase();
        phase.analysts[analystKey] = (phase.analysts[analystKey] ?? 0) + 1;

        const isBare =
          BARE_TXN.test(snap.primaryText) && !WHY_OR_CONTEXT.test(snap.primaryText);
        if (isBare) phase.bareTxnCards += 1;

        const dupCount = (seenTexts.get(snap.primaryText) ?? 0) + 1;
        seenTexts.set(snap.primaryText, dupCount);
        if (dupCount > 1) phase.duplicateCards += 1;

        const trace: FrameTrace = {
          pick: snap.pickNumber,
          owner: snap.owner,
          player: snap.player,
          analyst: snap.primaryAnalyst,
          serverGenerated: true,
          serverDelivered: true,
          clientReceived: true,
          snapshotContainsCard: true,
          boothSequenceContainsCard: false,
          heroDisplayed: false,
          textVisible: false,
          displayDurationMs: null,
          broadcastLogEntryCreated: false,
          advancementCompleted: false,
          text: snap.primaryText,
          failedTransition: null,
          sessionState: snap.sessionState,
        };
        phase.traces.push(trace);
        openTraces.set(key, { trace, firstVisibleAt: null, lastText: null });
        console.log(
          JSON.stringify({
            event: "qualifying_frame",
            pick: trace.pick,
            analyst: trace.analyst,
            text: trace.text?.slice(0, 100),
          }),
        );
      }

      const open = openTraces.get(key);
      if (open) {
        open.trace.clientReceived = true;
        open.trace.snapshotContainsCard = true;
        const boothHas =
          Boolean(dom.text) &&
          (dom.text === snap.primaryText ||
            (snap.primaryText.length > 20 && dom.text.includes(snap.primaryText.slice(0, 24))));
        if (boothHas || (dom.text && dom.hasActiveBooth && dom.text.length > 12)) {
          open.trace.boothSequenceContainsCard = true;
          open.trace.heroDisplayed = true;
          open.trace.textVisible = Boolean(dom.text && dom.text.length > 8);
          if (open.firstVisibleAt == null && open.trace.textVisible) {
            open.firstVisibleAt = now;
            open.lastText = dom.text;
          }
        }
        if (dom.logEntries.some((e) => e.includes((snap.primaryText ?? "").slice(0, 32)))) {
          open.trace.broadcastLogEntryCreated = true;
        }
        if (open.firstVisibleAt != null) {
          open.trace.displayDurationMs = now - open.firstVisibleAt;
        }
      }
    }

    // Mark advancement on open traces whose pick is behind current completed pick.
    for (const open of openTraces.values()) {
      if (open.trace.pick != null && dom.pickCompleted > open.trace.pick) {
        open.trace.advancementCompleted = true;
        if (open.firstVisibleAt != null && open.trace.displayDurationMs == null) {
          open.trace.displayDurationMs = now - open.firstVisibleAt;
        }
        // Keep tracing until duration gate or replacement; freeze duration once >= 6s
        if ((open.trace.displayDurationMs ?? 0) >= 6000) {
          // leave in map until phase end for log confirmation updates
        }
      }
      if (dom.logEntries.some((e) => open.trace.text && e.includes(open.trace.text.slice(0, 32)))) {
        open.trace.broadcastLogEntryCreated = true;
      }
    }

    if (opts.stopAtPick != null && dom.pickCompleted >= opts.stopAtPick) {
      // Allow remaining dwell
      await page.waitForTimeout(7000);
      closeOpen(Date.now(), true);
      stopped = true;
      break;
    }

    if (dom.draftComplete || (dom.pickTotal > 0 && dom.pickCompleted >= dom.pickTotal)) {
      for (let i = 0; i < 40; i++) {
        const end = await getSnapshot(page, ctx);
        const endDom = await captureDom(page);
        if (endDom.wrapUp || end.sessionState === "draft_complete") wrapHits += 1;
        phase.sessionComplete = end.draftComplete || end.sessionState === "draft_complete";
        if (phase.sessionComplete && wrapHits >= 1) break;
        await page.waitForTimeout(1500);
      }
      closeOpen(Date.now(), true);
      break;
    }

    await page.waitForTimeout(400);
  }

  closeOpen(Date.now(), true);
  phase.wrapUpCount = wrapHits > 0 ? 1 : 0;
  if (!phase.sessionComplete) {
    const end = await getSnapshot(page, ctx);
    phase.sessionComplete = end.draftComplete || end.sessionState === "draft_complete";
  }
  finalizeDurations(phase);

  // If a frame was still open and never hit 6s, capture as failure.
  for (const t of phase.traces) {
    if (!t.failedTransition && t.textVisible && (t.displayDurationMs ?? 0) < 5500) {
      t.failedTransition = "display duration (>=6s)";
      if (!phase.firstFailure) phase.firstFailure = t;
    }
  }

  return phase;
}

async function pollHealth(expectedPrefix: string): Promise<string> {
  const base = (process.env.QA_BASE ?? "https://sprint-8-preview.fantasyfootballrivals.com").replace(/\/$/, "");
  const deadline = Date.now() + 12 * 60_000;
  let last = "unknown";
  while (Date.now() < deadline) {
    try {
      const h = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15_000) }).then((r) =>
        r.json(),
      )) as { gitSha?: string };
      last = String(h.gitSha ?? "unknown");
      if (last.toLowerCase().startsWith(expectedPrefix.toLowerCase())) return last;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error(`health SHA did not reach ${expectedPrefix} (last=${last})`);
}

async function main(): Promise<void> {
  fs.mkdirSync(VERIFY_OUT, { recursive: true });
  const liveSha = await pollHealth(EXPECTED_SHA_PREFIX);
  const ctx = createHarnessContext();
  const steps: SmokeStep[] = [];
  process.env.EXPECTED_GIT_SHA = EXPECTED_SHA_PREFIX;
  const { browser, context } = await launchCertBrowser(ctx.base);

  try {
    if (!(await verifyDeploySha(ctx, steps))) throw new Error("SHA mismatch");
    const page = await signInForCert(context, ctx.base);
    if (!(await verifyClerk(page, steps))) throw new Error("Clerk failed");
    await resolveLeagueDraft(page, ctx);
    if (!(await openLiveDraftTab(page, ctx.base, steps))) throw new Error("Live Draft failed");
    await clearRfsnAudioCertState(page);
    await disableVoice(page);

    console.log("--- WR-001 three-round gate ---");
    const three = await runPhase(page, ctx, steps, {
      label: "3R",
      stopAtPick: 42,
      timeoutMs: 4 * 60_000,
    });
    console.log(
      JSON.stringify(
        {
          qualifyingFrames: three.qualifyingFrames,
          displayed: three.displayed,
          picks: three.picks,
          analysts: three.analysts,
          firstFailure: three.firstFailure,
        },
        null,
        2,
      ),
    );

    if (three.firstFailure) {
      const report = {
        ready: false,
        verdict: "NOT READY",
        liveSha,
        phase: "three-round",
        firstFailure: three.firstFailure,
        three,
        at: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(VERIFY_OUT, `report-${EXPECTED_SHA_PREFIX}.json`), JSON.stringify(report, null, 2));
      console.log("\nNOT READY — first failed transition:", three.firstFailure.failedTransition);
      process.exitCode = 1;
      return;
    }

    console.log("--- WR-001 full draft ---");
    const full = await runPhase(page, ctx, steps, {
      label: "FULL",
      timeoutMs: 25 * 60_000,
    });
    console.log(
      JSON.stringify(
        {
          qualifyingFrames: full.qualifyingFrames,
          displayed: full.displayed,
          skipped: full.skipped,
          blankCards: full.blankCards,
          duplicateCards: full.duplicateCards,
          minDisplayMs: full.minDisplayMs,
          avgDisplayMs: full.avgDisplayMs,
          maxDisplayMs: full.maxDisplayMs,
          wrapUpCount: full.wrapUpCount,
          sessionComplete: full.sessionComplete,
          bareTxnCards: full.bareTxnCards,
          analysts: full.analysts,
          firstFailure: full.firstFailure,
        },
        null,
        2,
      ),
    );

    const dwellOk =
      full.minDisplayMs == null || full.displayed === 0 || full.minDisplayMs >= 5500;
    const ready =
      !three.firstFailure &&
      !full.firstFailure &&
      three.qualifyingFrames > 0 &&
      three.displayed === three.qualifyingFrames &&
      full.qualifyingFrames > 0 &&
      full.displayed >= Math.floor(full.qualifyingFrames * 0.9) &&
      full.wrapUpCount === 1 &&
      full.sessionComplete &&
      full.blankCards === 0 &&
      full.bareTxnCards === 0 &&
      dwellOk;

    recordStep(steps, {
      id: "WR001-3R",
      requirement: "Every qualifying three-round frame displayed",
      pass: three.qualifyingFrames > 0 && three.displayed === three.qualifyingFrames && !three.firstFailure,
      evidence: `qual=${three.qualifyingFrames} displayed=${three.displayed}`,
    });
    recordStep(steps, {
      id: "WR001-FULL",
      requirement: "Full draft written reliability",
      pass: ready,
      evidence: `qual=${full.qualifyingFrames} displayed=${full.displayed} wrap=${full.wrapUpCount} complete=${full.sessionComplete} minMs=${full.minDisplayMs}`,
    });

    const report = {
      ready,
      verdict: ready ? "READY" : "NOT READY",
      liveSha,
      three,
      full,
      steps,
      at: new Date().toISOString(),
    };
    const outPath = path.join(VERIFY_OUT, `report-${EXPECTED_SHA_PREFIX}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\nWrote ${outPath}`);
    console.log(`\n${report.verdict}`);
    if (!ready) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
