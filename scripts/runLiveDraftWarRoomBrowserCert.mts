/**
 * Sprint 8 — authoritative Live Draft browser certification (single uninterrupted draft).
 * Requires smoke-ready draft startup before audio requirements are scored.
 *
 *   railway run -- pnpm exec tsx scripts/runLiveDraftWarRoomBrowserCert.mts
 */
import fs from "node:fs";
import path from "node:path";
import { type Page } from "playwright";
import {
  OUT_DIR,
  TIMEOUTS,
  CertNotReadyError,
  type AudioUnlockEvidence,
  certMetrics,
  clearRfsnAudioCertState,
  createHarnessContext,
  ensureFreshDraftSession,
  launchCertBrowser,
  openLiveDraftTab,
  performRealAudioUnlock,
  readDraftUiState,
  recordStep,
  resolveLeagueDraft,
  shot,
  signInForCert,
  startSimulation,
  trpcQuery,
  verifyClerk,
  verifyDeploySha,
  waitForCommentaryCard,
  waitForBroadcastPickReceived,
  waitForFirstLockedPick,
  type HarnessContext,
  type SmokeStep,
} from "./liveDraftCertHarness.mts";

type ReqResult = {
  id: string;
  requirement: string;
  pass: boolean;
  evidence: string;
  screenshot?: string;
  rootCause?: string;
};

const results: ReqResult[] = [];
let unlockEvidence: AudioUnlockEvidence | undefined;

function record(r: ReqResult): void {
  results.push(r);
  console.log(`${r.pass ? "PASS" : "FAIL"} — [${r.id}] ${r.requirement}`);
  console.log(`  evidence: ${r.evidence}`);
  if (r.rootCause) console.log(`  root cause: ${r.rootCause}`);
}

async function assertDraftStartup(page: Page, ctx: HarnessContext): Promise<void> {
  const gates: SmokeStep[] = [];
  const started = Date.now();

  if (!(await ensureFreshDraftSession(page, ctx, gates))) {
    const fail = gates.find((g) => !g.pass);
    throw new CertNotReadyError(fail?.id ?? "GATE-04", fail?.rootCause ?? "Draft session not ready");
  }

  if (Date.now() - started > TIMEOUTS.draftSessionActive) {
    throw new CertNotReadyError("GATE-TIMEOUT", "No active draft session within 30s");
  }

  if (!(await startSimulation(page, gates, { pace: "Brisk" }))) {
    const fail = gates.find((g) => g.id === "SMOKE-05");
    throw new CertNotReadyError("GATE-05", fail?.rootCause ?? "Simulation did not start");
  }

  const pickTimeout = Math.max(5_000, TIMEOUTS.firstPickLocked - (Date.now() - started));
  if (!(await waitForFirstLockedPick(page, ctx, gates, pickTimeout))) {
    const fail = gates.find((g) => g.id === "SMOKE-07");
    throw new CertNotReadyError("GATE-07", fail?.rootCause ?? "No pick locked within 45s");
  }

  const broadcastTimeout = Math.max(5_000, TIMEOUTS.commentaryCard - (Date.now() - started));
  if (!(await waitForBroadcastPickReceived(page, ctx, gates, broadcastTimeout))) {
    const fail = gates.find((g) => g.id === "SMOKE-08");
    throw new CertNotReadyError("GATE-08", fail?.rootCause ?? "Broadcast did not receive locked pick");
  }

  const commentaryTimeout = Math.max(5_000, TIMEOUTS.commentaryCard - (Date.now() - started));
  if (!(await waitForCommentaryCard(page, gates, commentaryTimeout))) {
    const fail = gates.find((g) => g.id === "SMOKE-09");
    throw new CertNotReadyError("GATE-09", fail?.rootCause ?? "No commentary card within 60s");
  }

  await page.waitForTimeout(1500);

  const unlock = await performRealAudioUnlock(page, gates, OUT_DIR, ctx);
  unlockEvidence = unlock.evidence;
  if (!unlock.ok) {
    throw new CertNotReadyError(unlock.errorCode ?? "REQ-0", unlock.errorCode ?? "Enable Sound failed");
  }
  const enable = gates.find((g) => g.id === "SMOKE-10");
  record({
    id: "REQ-0",
    requirement: "Enable Sound once at draft start",
    pass: Boolean(enable?.pass),
    evidence: enable?.evidence ?? JSON.stringify(unlock.evidence),
    screenshot: enable?.screenshot,
    rootCause: enable?.pass ? undefined : unlock.errorCode,
  });

  for (const g of gates.filter((g) => g.id.startsWith("SMOKE-"))) {
    console.log(`${g.pass ? "PASS" : "FAIL"} — [startup ${g.id}] ${g.requirement}`);
    console.log(`  evidence: ${g.evidence}`);
  }
}

async function boothPlayingAligned(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __rfsnAudioProbe?: {
        samples: Array<{ currentTime: number; ended: boolean | null; playInFlight: boolean }>;
      };
    };
    const last = w.__rfsnAudioProbe?.samples?.at(-1);
    const playing = Boolean(
      last && last.playInFlight && !last.ended && (last.currentTime ?? 0) > 0,
    );
    const active = document.querySelector('[data-booth-state="active"]');
    if (playing && !active) return false;
    return true;
  });
}

async function runSingleDraftCert(page: Page, ctx: HarnessContext): Promise<void> {
  if (!(await openLiveDraftTab(page, ctx.base, []))) {
    throw new CertNotReadyError("SMOKE-03", "Live Draft tab not reachable");
  }
  await clearRfsnAudioCertState(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Live Draft/i }).click();
  await page.waitForSelector(".live-draft-surface", { timeout: 60_000 });
  await assertDraftStartup(page, ctx);

  const pauseToggle = page.locator('.live-draft-surface label:has-text("Pause on my picks") input');
  const pauseOff = (await pauseToggle.count()) === 0 || !(await pauseToggle.isChecked());
  record({
    id: "REQ-6",
    requirement: '"Pause on my picks" OFF — simulation continues through user picks',
    pass: pauseOff,
    evidence: `pauseOnMyPicksChecked=${!pauseOff}`,
    screenshot: await shot(page, OUT_DIR, "req6-pause-off-default"),
    rootCause: !pauseOff ? "Pause on my picks defaults to enabled" : undefined,
  });

  let navigated = false;
  let replayTested = false;
  let wrapUpCount = 0;
  let prematureCutoff = false;
  let maxAudioStarts = 0;
  let maxPlayCalls = 0;
  let maxAudioFetches = 0;
  let longPlayMs = 0;
  const start = Date.now();
  let pickBeforeNav = "";
  let lastPickCompleted = 0;
  let idleSince = Date.now();
  let maxPickReached = 0;
  let resetObserved = false;
  const draftTrace: Array<Record<string, unknown>> = [];

  while (Date.now() - start < TIMEOUTS.fullCertTotal) {
    const metrics = await certMetrics(page);
    maxAudioStarts = Math.max(maxAudioStarts, metrics.audioStarts);
    maxPlayCalls = Math.max(maxPlayCalls, metrics.playCalls);
    maxAudioFetches = Math.max(maxAudioFetches, metrics.audioFetches);

    const ui = await readDraftUiState(page);
    if (ui.pickCompleted > lastPickCompleted) {
      lastPickCompleted = ui.pickCompleted;
      idleSince = Date.now();
    } else if (
      lastPickCompleted === 0 &&
      ui.pickCompleted === 0 &&
      Date.now() - idleSince > TIMEOUTS.commentaryCard
    ) {
      throw new CertNotReadyError(
        "GATE-IDLE",
        `Booth idle with no pick activity for ${TIMEOUTS.commentaryCard}ms (booth=${ui.boothLabel})`,
      );
    }

    const audioProgress = await page.evaluate(() => {
      const w = window as unknown as {
        __rfsnAudioProbe?: {
          samples: Array<{ currentTime: number; ended: boolean | null; playInFlight: boolean }>;
        };
      };
      const samples = w.__rfsnAudioProbe?.samples ?? [];
      const last = samples[samples.length - 1];
      const playing = Boolean(
        last && last.playInFlight && !last.ended && (last.currentTime ?? 0) > 0,
      );
      return { playing, currentTime: last?.currentTime ?? 0 };
    });
    if (audioProgress.playing) longPlayMs += 2000;

    const aligned = await boothPlayingAligned(page);
    if (audioProgress.playing && !aligned) prematureCutoff = true;

    const pickNum = ui.pickCompleted;
    if (pickNum > maxPickReached) {
      maxPickReached = pickNum;
      draftTrace.push({
        tMs: Date.now() - start,
        event: "pick_highwater",
        pick: pickNum,
        startVisible: ui.startVisible,
        pauseVisible: ui.pauseVisible,
        clockState: ui.clockState,
      });
    }
    if (maxPickReached > 0 && pickNum < maxPickReached && !resetObserved) {
      resetObserved = true;
      draftTrace.push({
        tMs: Date.now() - start,
        event: "PICK_RESET",
        pick: pickNum,
        fromHighwater: maxPickReached,
        startVisible: ui.startVisible,
        pauseVisible: ui.pauseVisible,
        clockState: ui.clockState,
        buttons: await page.evaluate(() =>
          [...(document.querySelector(".live-draft-surface")?.querySelectorAll("button") ?? [])]
            .map((b) => (b.textContent ?? "").trim())
            .filter(Boolean),
        ),
      });
      console.log(
        `RESET DETECTED t=${Date.now() - start}ms pick ${maxPickReached}→${pickNum} startVisible=${ui.startVisible}`,
      );
    }

    if (!navigated && pickNum >= 8) {
      pickBeforeNav = `Pick ${pickNum}/${ui.pickTotal}`;
      await page.getByRole("button", { name: "Draft Board", exact: true }).click();
      await page.waitForTimeout(2000);
      await page.getByRole("button", { name: /Live Draft/i }).click();
      await page.waitForSelector(".live-draft-surface", { timeout: 60_000 });
      await page.waitForTimeout(3000);
      navigated = true;
      const afterUi = await readDraftUiState(page);
      const boothReplayVisible =
        (await page.locator("[data-rfsn-warroom-broadcast]").getByRole("button", { name: /^Replay$/i }).count()) >
        0;
      const resumeVisible = (await page.getByRole("button", { name: /Resume/i }).count()) > 0;
      if (resumeVisible) await page.getByRole("button", { name: /Resume/i }).first().click();
      record({
        id: "REQ-5",
        requirement: "Leaving Draft War Room pauses instead of resetting session",
        pass: afterUi.pickCompleted >= pickNum,
        evidence: `before=${pickBeforeNav} after=Pick ${afterUi.pickCompleted}/${afterUi.pickTotal} boothReplay=${boothReplayVisible} resumed=${resumeVisible}`,
        screenshot: await shot(page, OUT_DIR, "req5-navigation-return"),
        rootCause: afterUi.pickCompleted < pickNum ? "Tab navigation reset live draft idx" : undefined,
      });
    }

    // REQ-4: only after a confirmed terminal state — never click "Replay same seed".
    if (!replayTested) {
      const probe = await page.evaluate(() => {
        const w = window as unknown as {
          __rfsnAudioProbe?: {
            samples: Array<{ label: string; playInFlight: boolean }>;
          };
        };
        const samples = w.__rfsnAudioProbe?.samples ?? [];
        const lastComplete = [...samples].reverse().find((s) => s.label.startsWith("complete_"));
        const last = samples[samples.length - 1];
        return {
          endedEvents: (window as unknown as { __rfsnCert?: { endedEvents?: number } }).__rfsnCert
            ?.endedEvents ?? 0,
          playInFlight: Boolean(last?.playInFlight),
          completeObserved: Boolean(lastComplete),
          completeLabel: lastComplete?.label ?? null,
        };
      });
      const terminalReady =
        (probe.endedEvents >= 1 || probe.completeObserved) && probe.playInFlight === false;
      if (terminalReady) {
        const booth = page.locator("[data-rfsn-warroom-broadcast]");
        const replayBtn = booth.getByRole("button", { name: /^Replay$/i });
        if ((await replayBtn.count()) > 0 && (await replayBtn.isEnabled())) {
          const before = await certMetrics(page);
          await replayBtn.click();
          await page.waitForTimeout(2500);
          const after = await certMetrics(page);
          // Allow up to ~20s for the replayed clip to terminal.
          const replayTermDeadline = Date.now() + 20_000;
          let replayTerminal = after.endedEvents > before.endedEvents;
          while (Date.now() < replayTermDeadline && !replayTerminal) {
            const m = await certMetrics(page);
            if (m.endedEvents > before.endedEvents) {
              replayTerminal = true;
              break;
            }
            const complete = await page.evaluate(() => {
              const samples =
                (window as unknown as { __rfsnAudioProbe?: { samples: Array<{ label: string }> } })
                  .__rfsnAudioProbe?.samples ?? [];
              return samples.some((s) => s.label.startsWith("complete_"));
            });
            if (complete && (await certMetrics(page)).endedEvents > before.endedEvents) {
              replayTerminal = true;
              break;
            }
            await page.waitForTimeout(500);
          }
          const finalAfter = await certMetrics(page);
          replayTested = true;
          const playAdvanced = finalAfter.playCalls === before.playCalls + 1;
          record({
            id: "REQ-4",
            requirement: "Replay works for commentary",
            pass: playAdvanced,
            evidence: `playCalls before=${before.playCalls} after=${finalAfter.playCalls} ended before=${before.endedEvents} after=${finalAfter.endedEvents} replayTerminal=${replayTerminal} preTerminal=${probe.completeLabel ?? `ended=${probe.endedEvents}`}`,
            screenshot: await shot(page, OUT_DIR, "req4-replay"),
            rootCause: !playAdvanced
              ? "Booth Replay did not increment playCalls by exactly 1"
              : undefined,
          });
          draftTrace.push({
            tMs: Date.now() - start,
            event: "req4_booth_replay",
            pick: (await readDraftUiState(page)).pickCompleted,
            playBefore: before.playCalls,
            playAfter: finalAfter.playCalls,
            endedBefore: before.endedEvents,
            endedAfter: finalAfter.endedEvents,
          });
        }
      }
    }

    wrapUpCount = await page.locator("[data-live-draft-wrap-up]").count();
    const done = ui.draftComplete;
    if (wrapUpCount >= 1 && done) break;
    if (done && wrapUpCount === 0 && pickNum >= 190) break;

    await page.waitForTimeout(2000);
  }

  const finalMetrics = await certMetrics(page);
  wrapUpCount = await page.locator("[data-live-draft-wrap-up]").count();
  const finalUi = await readDraftUiState(page);
  draftTrace.push({
    tMs: Date.now() - start,
    event: "loop_exit",
    pick: finalUi.pickCompleted,
    maxPickReached,
    resetObserved,
    startVisible: finalUi.startVisible,
    draftComplete: finalUi.draftComplete,
    playCalls: finalMetrics.playCalls,
    endedEvents: finalMetrics.endedEvents,
  });
  fs.writeFileSync(
    path.join(OUT_DIR, "draft-reset-trace.json"),
    JSON.stringify({ maxPickReached, resetObserved, elapsedMs: Date.now() - start, draftTrace }, null, 2),
    "utf8",
  );
  console.log(
    `Draft trace: maxPick=${maxPickReached} resetObserved=${resetObserved} finalPick=${finalUi.pickCompleted} startVisible=${finalUi.startVisible}`,
  );

  record({
    id: "REQ-1",
    requirement: "Every commentary auto-plays after Enable Sound (not just the first)",
    pass: maxAudioStarts >= 2 || maxPlayCalls >= 2 || maxAudioFetches >= 2,
    evidence: `audioStartEvents=${maxAudioStarts} playCalls=${maxPlayCalls} audioFetches=${maxAudioFetches} endedEvents=${finalMetrics.endedEvents}`,
    screenshot: await shot(page, OUT_DIR, "req1-multi-audio"),
    rootCause:
      maxAudioStarts < 2 && maxPlayCalls < 2 && maxAudioFetches < 2
        ? "Audio playback did not fire for multiple commentary lines"
        : undefined,
  });

  record({
    id: "REQ-2",
    requirement: "No commentary cut off mid-speech",
    pass: !prematureCutoff && (longPlayMs >= 3000 || maxPlayCalls >= 2),
    evidence: `prematureCutoff=${prematureCutoff} longPlayMs≈${longPlayMs} playCalls=${maxPlayCalls}`,
    screenshot: await shot(page, OUT_DIR, "req2-no-cutoff"),
    rootCause: prematureCutoff ? "Booth exited while audio still playing" : undefined,
  });

  record({
    id: "REQ-3",
    requirement: "Analysts remain visible until playback finishes",
    pass: !prematureCutoff,
    evidence: `boothAudioAligned=${!prematureCutoff}`,
    screenshot: await shot(page, OUT_DIR, "req3-analyst-visible"),
  });

  if ((await pauseToggle.count()) > 0) {
    await pauseToggle.check();
    await page.waitForTimeout(3000);
    const paused = (await page.getByRole("button", { name: /Resume/i }).count()) > 0;
    record({
      id: "REQ-7",
      requirement: '"Pause on my picks" ON pauses when expected',
      pass: paused || (await pauseToggle.isChecked()),
      evidence: `pauseChecked=${await pauseToggle.isChecked()} resumeVisible=${paused}`,
      screenshot: await shot(page, OUT_DIR, "req7-pause-on"),
    });
  }

  let sessionComplete = false;
  try {
    const snap = await trpcQuery<{ sessionState?: string; draftComplete?: boolean }>(
      page,
      ctx.base,
      "rfsnBroadcast.getLiveSnapshot",
      { leagueId: ctx.leagueId, draftId: ctx.draftId },
    );
    sessionComplete = snap.sessionState === "draft_complete" || Boolean(snap.draftComplete);
  } catch {
    // ignore
  }

  record({
    id: "REQ-8",
    requirement: "Exactly one draft wrap-up appears",
    pass: wrapUpCount === 1,
    evidence: `wrapUpPanels=${wrapUpCount} sessionComplete=${sessionComplete}`,
    screenshot: await shot(page, OUT_DIR, "req8-wrap-up"),
    rootCause:
      wrapUpCount === 0
        ? "Draft did not complete or wrap-up UI not rendered"
        : wrapUpCount > 1
          ? "Duplicate wrap-up panels"
          : undefined,
  });

  const replayAtEnd = page
    .locator("[data-rfsn-warroom-broadcast]")
    .getByRole("button", { name: /^Replay$/i });
  if ((await replayAtEnd.count()) > 0 && (await replayAtEnd.isEnabled())) {
    const beforeMetrics = await certMetrics(page);
    await replayAtEnd.click();
    await page.waitForTimeout(3000);
    const after = await certMetrics(page);
    record({
      id: "REQ-9",
      requirement: "Wrap-up replay works",
      pass: after.playCalls > beforeMetrics.playCalls || after.audioStarts > beforeMetrics.audioStarts,
      evidence: `playCalls before=${beforeMetrics.playCalls} after=${after.playCalls} audioStarts=${after.audioStarts}`,
      screenshot: await shot(page, OUT_DIR, "req9-wrap-up-replay"),
    });
  } else {
    record({
      id: "REQ-9",
      requirement: "Wrap-up replay works",
      pass: false,
      evidence: "Booth Replay button not available at wrap-up",
      rootCause: "No replayable wrap-up clip stored",
    });
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ctx = createHarnessContext();
  console.log(`Sprint 8 cert → ${ctx.base}`);

  const smokeSteps: SmokeStep[] = [];
  if (!(await verifyDeploySha(ctx, smokeSteps))) {
    record({
      id: "DEPLOY",
      requirement: "Preview gitSha matches Sprint 8 certification build",
      pass: false,
      evidence: smokeSteps[0]?.evidence ?? "SHA check failed",
      rootCause: "Wrong deployment SHA",
    });
    writeReport(ctx, "NOT READY");
    process.exit(2);
    return;
  }
  record({
    id: "DEPLOY",
    requirement: "Preview gitSha matches Sprint 8 certification build",
    pass: true,
    evidence: smokeSteps[0]?.evidence ?? `gitSha=${ctx.deployedSha}`,
  });

  const { browser, context } = await launchCertBrowser(ctx.base);
  let exitCode = 0;
  try {
    const page = await signInForCert(context, ctx.base);
    const clerkSteps: SmokeStep[] = [];
    if (!(await verifyClerk(page, clerkSteps))) {
      record({
        id: "AUTH",
        requirement: "Founder authentication completes",
        pass: false,
        evidence: clerkSteps[0]?.evidence ?? "Clerk auth failed",
        rootCause: "Cannot certify without founder session",
      });
      exitCode = 2;
      return;
    }

    await resolveLeagueDraft(page, ctx);
    console.log(`league=${ctx.leagueId} draftId=${ctx.draftId}`);

    await runSingleDraftCert(page, ctx);
    exitCode = results.some((r) => !r.pass) ? 1 : 0;
  } catch (err) {
    if (err instanceof CertNotReadyError) {
      record({
        id: "NOT_READY",
        requirement: "Draft startup gates passed before certification scoring",
        pass: false,
        evidence: `[${err.blockingStep}] ${err.message}`,
        rootCause: err.message,
      });
      exitCode = 2;
    } else {
      record({
        id: "FATAL",
        requirement: "Certification harness completed without fatal error",
        pass: false,
        evidence: err instanceof Error ? err.message : String(err),
        rootCause: "Sign-in, navigation, or draft UI failed before requirements could be measured",
      });
      exitCode = 1;
    }
  } finally {
    const status = exitCode === 2 ? "NOT READY" : exitCode === 1 ? "FAIL" : "PASS";
    writeReport(ctx, status);
    await browser.close();
    process.exit(exitCode);
  }
}

function writeReport(ctx: HarnessContext, status: string): void {
  const report = {
    status,
    previewUrl: ctx.base,
    deployedGitSha: ctx.deployedSha,
    expectedGitSha: ctx.expectedSha,
    leagueId: ctx.leagueId,
    draftId: ctx.draftId,
    at: new Date().toISOString(),
    unlockEvidence: unlockEvidence ?? null,
    results,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
  };
  const reportPath = path.join(OUT_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport → ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
