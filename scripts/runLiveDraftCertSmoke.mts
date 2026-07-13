/**
 * Live Draft certification smoke test — proves draft startup before full cert.
 *
 *   railway run -- pnpm exec tsx scripts/runLiveDraftCertSmoke.mts
 */
import {
  CertNotReadyError,
  SMOKE_OUT_DIR,
  TIMEOUTS,
  type HarnessContext,
  type SmokeStep,
  clickEnableSound,
  createHarnessContext,
  ensureFreshDraftSession,
  launchCertBrowser,
  openLiveDraftTab,
  recordStep,
  resolveLeagueDraft,
  signInForCert,
  startSimulation,
  verifyClerk,
  verifyDeploySha,
  waitForBroadcastPickReceived,
  waitForCommentaryCard,
  waitForFirstAudioAttempt,
  waitForFirstLockedPick,
  waitForPickClockRunning,
  writeSmokeReport,
} from "./liveDraftCertHarness.mts";

async function runSmoke(): Promise<{
  ready: boolean;
  blockingStep?: string;
  steps: SmokeStep[];
  ctx: HarnessContext;
}> {
  const ctx = createHarnessContext();
  const steps: SmokeStep[] = [];
  const started = Date.now();

  console.log(`Live Draft cert smoke → ${ctx.base}`);
  const { browser, context } = await launchCertBrowser(ctx.base);

  try {
    if (!(await verifyDeploySha(ctx, steps))) {
      return { ready: false, blockingStep: "SMOKE-01", steps, ctx };
    }

    const page = await signInForCert(context, ctx.base);
    if (!(await verifyClerk(page, steps))) {
      return { ready: false, blockingStep: "SMOKE-02", steps, ctx };
    }

    await resolveLeagueDraft(page, ctx);
    console.log(`league=${ctx.leagueId} draftId=${ctx.draftId}`);

    if (!(await openLiveDraftTab(page, ctx.base, steps))) {
      return { ready: false, blockingStep: "SMOKE-03", steps, ctx };
    }

    if (Date.now() - started > TIMEOUTS.draftSessionActive) {
      throw new CertNotReadyError("SMOKE-04", "Exceeded 30s before draft session setup");
    }
    if (!(await ensureFreshDraftSession(page, ctx, steps))) {
      return { ready: false, blockingStep: "SMOKE-04", steps, ctx };
    }

    if (!(await startSimulation(page, steps, { pace: "Broadcast" }))) {
      return { ready: false, blockingStep: "SMOKE-05", steps, ctx };
    }

    if (!(await waitForPickClockRunning(page, steps))) {
      return { ready: false, blockingStep: "SMOKE-06", steps, ctx };
    }

    const pickDeadline = started + TIMEOUTS.firstPickLocked;
    const pickTimeout = Math.max(5_000, pickDeadline - Date.now());
    if (!(await waitForFirstLockedPick(page, ctx, steps, pickTimeout))) {
      return { ready: false, blockingStep: "SMOKE-07", steps, ctx };
    }

    const broadcastDeadline = started + TIMEOUTS.commentaryCard;
    const broadcastTimeout = Math.max(5_000, broadcastDeadline - Date.now());
    if (!(await waitForBroadcastPickReceived(page, ctx, steps, broadcastTimeout))) {
      return { ready: false, blockingStep: "SMOKE-08", steps, ctx };
    }

    const commentaryDeadline = started + TIMEOUTS.commentaryCard;
    const commentaryTimeout = Math.max(5_000, commentaryDeadline - Date.now());
    if (!(await waitForCommentaryCard(page, steps, commentaryTimeout))) {
      return { ready: false, blockingStep: "SMOKE-09", steps, ctx };
    }

    if (!(await clickEnableSound(page, steps, SMOKE_OUT_DIR))) {
      return { ready: false, blockingStep: "SMOKE-10", steps, ctx };
    }

    const audioDeadline = started + TIMEOUTS.firstAudioAttempt;
    const audioTimeout = Math.max(10_000, audioDeadline - Date.now());
    if (!(await waitForFirstAudioAttempt(page, steps, SMOKE_OUT_DIR, audioTimeout))) {
      return { ready: false, blockingStep: "SMOKE-11", steps, ctx };
    }

    if (Date.now() - started > TIMEOUTS.smokeTotal) {
      recordStep(steps, {
        id: "SMOKE-TIMEOUT",
        requirement: "Smoke test completes within maximum runtime",
        pass: false,
        evidence: `elapsedMs=${Date.now() - started}`,
        rootCause: "Smoke exceeded total runtime budget",
      });
      return { ready: false, blockingStep: "SMOKE-TIMEOUT", steps, ctx };
    }

    return { ready: true, steps, ctx };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  let status: "READY" | "NOT READY" = "NOT READY";
  let blockingStep = "unknown";
  let steps: SmokeStep[] = [];
  let ctx = createHarnessContext();

  try {
    const result = await runSmoke();
    steps = result.steps;
    ctx = result.ctx;
    if (result.ready) {
      status = "READY";
      console.log("\n✅ SMOKE READY — draft startup chain verified");
    } else {
      blockingStep = result.blockingStep ?? "unknown";
      console.log(`\n🔴 NOT READY — blocked at ${blockingStep}`);
    }
  } catch (err) {
    if (err instanceof CertNotReadyError) {
      blockingStep = err.blockingStep;
      recordStep(steps, {
        id: err.blockingStep,
        requirement: "Smoke gate",
        pass: false,
        evidence: err.message,
        rootCause: err.message,
      });
    } else {
      recordStep(steps, {
        id: "SMOKE-FATAL",
        requirement: "Smoke harness completed without fatal error",
        pass: false,
        evidence: err instanceof Error ? err.message : String(err),
        rootCause: "Unexpected harness failure",
      });
      blockingStep = "SMOKE-FATAL";
    }
    console.log(`\n🔴 NOT READY — ${blockingStep}`);
  }

  const reportPath = writeSmokeReport(SMOKE_OUT_DIR, ctx, steps, status);
  console.log(`Report → ${reportPath}`);
  process.exit(status === "READY" ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
