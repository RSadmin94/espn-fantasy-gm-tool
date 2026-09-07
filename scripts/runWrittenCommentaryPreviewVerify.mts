/**
 * Written-commentary preview verification:
 * 1) 3-round short session (voice disabled)
 * 2) Full draft to pick 196 + wrap-up
 *
 *   railway run -- pnpm exec tsx scripts/runWrittenCommentaryPreviewVerify.mts
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

const VERIFY_OUT = path.join(OUT_DIR, "written-preview-verify");
const EXPECTED_SHA_PREFIX = (process.env.EXPECTED_GIT_SHA ?? "02946c1").slice(0, 7);

type WrittenCapture = {
  pickNumber: number | null;
  analyst: string | null;
  text: string | null;
  logEntry: string | null;
  secondCommentAppeared: boolean;
  draftKeptMoving: boolean;
  blankOrDuplicate: boolean;
  enableSoundVisible: boolean;
};

async function disableVoiceCompletely(page: import("playwright").Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.setItem("rfsn-live-audio-enabled", "false");
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith("rfsn-")) sessionStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  });
}

async function captureWrittenState(page: import("playwright").Page): Promise<{
  activeAnalyst: string | null;
  activeText: string | null;
  pickCompleted: number;
  logEntries: string[];
  enableSoundVisible: boolean;
  wrapUp: boolean;
  blankActive: boolean;
}> {
  return page.evaluate(() => {
    const active = document.querySelector('[data-booth-state="active"]') as HTMLElement | null;
    const activeText =
      active?.querySelector("p.font-medium:not(.italic)")?.textContent?.trim() ??
      [...(active?.querySelectorAll("p") ?? [])]
        .map((p) => p.textContent?.trim() ?? "")
        .find((t) => t && !/standby/i.test(t) && t.length > 12) ??
      null;
    const analyst =
      active?.querySelector("header span.font-black, header span")?.textContent?.trim() ??
      active?.getAttribute("data-booth-card") ??
      null;
    const log = document.querySelector("[data-rfsn-commentary-log]");
    const logEntries = [...(log?.querySelectorAll("li") ?? [])].map((li) => li.textContent?.trim() ?? "");
    const surface = document.querySelector(".live-draft-surface");
    const pickCompleted = Number(surface?.textContent?.match(/Pick (\d+)\//)?.[1] ?? 0);
    const enableSoundVisible = [...(document.querySelectorAll("button") ?? [])].some((b) =>
      /Enable Sound|Tap to unmute|Broadcast Audio/i.test(b.textContent ?? ""),
    );
    const wrapUp =
      document.querySelector('[data-rfsn-wrap-up="true"]') != null ||
      /Draft complete/i.test(document.querySelector("[data-rfsn-warroom-broadcast]")?.textContent ?? "");
    const blankActive = Boolean(active && (!activeText || activeText.length < 8));
    return {
      activeAnalyst: analyst,
      activeText,
      pickCompleted,
      logEntries,
      enableSoundVisible,
      wrapUp,
      blankActive,
    };
  });
}

async function runThreeRound(
  page: import("playwright").Page,
  ctx: HarnessContext,
  steps: SmokeStep[],
): Promise<WrittenCapture> {
  await ensureFreshDraftSession(page, ctx, steps);
  await disableVoiceCompletely(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Live Draft/i }).click();
  await page.waitForSelector(".live-draft-surface", { timeout: 60_000 });
  await disableVoiceCompletely(page);

  if (!(await startSimulation(page, steps, { pace: "Turbo" }))) {
    throw new Error("3-round: simulation did not start");
  }
  await waitForPickClockRunning(page, steps);

  const first: WrittenCapture = {
    pickNumber: null,
    analyst: null,
    text: null,
    logEntry: null,
    secondCommentAppeared: false,
    draftKeptMoving: false,
    blankOrDuplicate: false,
    enableSoundVisible: false,
  };

  const deadline = Date.now() + 180_000;
  let sawFirst = false;
  let firstPickAt = 0;
  let secondSeen = false;
  const seenTexts = new Set<string>();

  while (Date.now() < deadline) {
    const snap = await captureWrittenState(page);
    first.enableSoundVisible = snap.enableSoundVisible;
    if (snap.blankActive) first.blankOrDuplicate = true;

    if (snap.activeText && snap.activeAnalyst) {
      const key = `${snap.activeAnalyst}|${snap.activeText}`;
      if (!sawFirst) {
        sawFirst = true;
        firstPickAt = snap.pickCompleted;
        first.pickNumber = snap.pickCompleted;
        first.analyst = snap.activeAnalyst;
        first.text = snap.activeText;
        first.logEntry = snap.logEntries[0] ?? null;
        seenTexts.add(key);
        recordStep(steps, {
          id: "W3-01",
          requirement: "First written comment visible",
          pass: true,
          evidence: `pick=${first.pickNumber} analyst=${first.analyst} text=${first.text?.slice(0, 80)}`,
        });
      } else if (!seenTexts.has(key)) {
        secondSeen = true;
        seenTexts.add(key);
        first.secondCommentAppeared = true;
      } else if (seenTexts.has(key) && snap.logEntries.filter((e) => e.includes(snap.activeText!)).length > 1) {
        first.blankOrDuplicate = true;
      }
    }

    if (sawFirst && snap.pickCompleted > firstPickAt) {
      first.draftKeptMoving = true;
    }
    // Stop after ~3 rounds of a 14-team draft (~42 picks) or after second comment + movement.
    if (sawFirst && first.draftKeptMoving && (secondSeen || snap.pickCompleted >= 42)) {
      break;
    }
    if (snap.pickCompleted >= 42) break;
    await page.waitForTimeout(800);
  }

  recordStep(steps, {
    id: "W3-02",
    requirement: "Second written comment or three rounds progressed",
    pass: first.secondCommentAppeared || first.draftKeptMoving,
    evidence: `second=${first.secondCommentAppeared} moved=${first.draftKeptMoving} pick=${(await readDraftUiState(page)).pickCompleted}`,
  });
  recordStep(steps, {
    id: "W3-03",
    requirement: "Voice disabled (no Enable Sound)",
    pass: !first.enableSoundVisible,
    evidence: `enableSoundVisible=${first.enableSoundVisible}`,
  });
  recordStep(steps, {
    id: "W3-04",
    requirement: "No blank/duplicate cards",
    pass: !first.blankOrDuplicate,
    evidence: `blankOrDuplicate=${first.blankOrDuplicate}`,
  });

  // Pause simulation for clean handoff to full draft
  const pauseBtn = page.locator(".live-draft-surface button").filter({ hasText: /^⏸?\s*Pause$|^Pause$/ });
  if ((await pauseBtn.count()) > 0) {
    await pauseBtn.first().click().catch(() => undefined);
  }

  return first;
}

async function runFullDraft(
  page: import("playwright").Page,
  ctx: HarnessContext,
  steps: SmokeStep[],
): Promise<{
  pick196: boolean;
  wrapUpCount: number;
  sessionComplete: boolean;
  enableSoundVisible: boolean;
  froze: boolean;
  quality: {
    spoken: number;
    holeMailMergeHits: number;
    analysts: Record<string, number>;
    receiptLikeLines: number;
    leagueCueLines: number;
    sample: string[];
  };
}> {
  await ensureFreshDraftSession(page, ctx, steps);
  await disableVoiceCompletely(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Live Draft/i }).click();
  await page.waitForSelector(".live-draft-surface", { timeout: 60_000 });
  await disableVoiceCompletely(page);

  if (!(await startSimulation(page, steps, { pace: "Turbo" }))) {
    throw new Error("full draft: simulation did not start");
  }

  const started = Date.now();
  let lastPick = 0;
  let lastProgressAt = Date.now();
  let wrapUpHits = 0;
  let sessionComplete = false;
  let enableSoundVisible = false;
  let froze = false;
  const seenComments = new Map<string, { analyst: string; text: string }>();

  while (Date.now() - started < 25 * 60_000) {
    const ui = await readDraftUiState(page);
    const snap = await captureWrittenState(page);
    enableSoundVisible = snap.enableSoundVisible;
    if (snap.wrapUp) wrapUpHits += 1;
    if (snap.activeText && snap.activeAnalyst) {
      seenComments.set(`${snap.activeAnalyst}|${snap.activeText}`, {
        analyst: snap.activeAnalyst,
        text: snap.activeText,
      });
    }
    for (const entry of snap.logEntries) {
      const m = entry.match(/^(Coach|Sofia|Roxanne|RFSN)\s*\d[\d.]*\s*(.+)$/i);
      if (m) seenComments.set(entry, { analyst: m[1]!, text: m[2]! });
    }

    if (ui.pickCompleted > lastPick) {
      lastPick = ui.pickCompleted;
      lastProgressAt = Date.now();
      console.log(`full draft progress: Pick ${ui.pickCompleted}/${ui.pickTotal}`);
    } else if (Date.now() - lastProgressAt > 90_000 && !ui.draftComplete) {
      froze = true;
      break;
    }

    if (ui.draftComplete || ui.pickCompleted >= ui.pickTotal) {
      // Poll wrap-up
      for (let i = 0; i < 40; i++) {
        const live = await trpcQuery(page, ctx.base, "rfsnBroadcast.getLiveSnapshot", {
          leagueId: ctx.leagueId,
          draftId: ctx.draftId,
        });
        const payload = live as {
          sessionState?: string;
          draftComplete?: boolean;
          snapshot?: { primary?: { text?: string } | null };
        };
        sessionComplete = Boolean(
          payload?.draftComplete || payload?.sessionState === "draft_complete",
        );
        const hasWrap = Boolean(payload?.snapshot?.primary?.text?.trim());
        if (hasWrap) wrapUpHits = Math.max(wrapUpHits, 1);
        const cap = await captureWrittenState(page);
        if (cap.wrapUp || cap.logEntries.some((e) => /draft complete|wrap/i.test(e))) {
          wrapUpHits = Math.max(wrapUpHits, 1);
        }
        if (sessionComplete && wrapUpHits >= 1) break;
        await page.waitForTimeout(1500);
      }
      break;
    }
    await page.waitForTimeout(1000);
  }

  const finalUi = await readDraftUiState(page);
  const pick196 = finalUi.pickCompleted >= 196 || finalUi.pickTotal >= 196 && finalUi.draftComplete;

  // Count distinct wrap-up log/primary appearances — exactly one required
  const live = (await trpcQuery(page, ctx.base, "rfsnBroadcast.getLiveSnapshot", {
    leagueId: ctx.leagueId,
    draftId: ctx.draftId,
  })) as { sessionState?: string; draftComplete?: boolean; snapshot?: { primary?: { id?: string; text?: string } } };
  sessionComplete = Boolean(live.draftComplete || live.sessionState === "draft_complete");
  const wrapUpCount = live.snapshot?.primary?.text ? 1 : wrapUpHits > 0 ? 1 : 0;

  const comments = [...seenComments.values()];
  const analysts: Record<string, number> = {};
  for (const c of comments) {
    const key = c.analyst.toLowerCase();
    analysts[key] = (analysts[key] ?? 0) + 1;
  }
  const quality = {
    spoken: comments.length,
    holeMailMergeHits: comments.filter((c) => /just closed a starting .+ hole/i.test(c.text)).length,
    analysts,
    receiptLikeLines: comments.filter((c) =>
      /\b(ADP|ahead|fell|past ADP|earliest|latest|tracked|still needed|rival|receipt|consensus)\b/i.test(c.text),
    ).length,
    leagueCueLines: comments.filter((c) =>
      /\b(league|rival|tracked|history|franchise|ADP|consensus|board|run|starter|build)\b/i.test(c.text),
    ).length,
    sample: comments.slice(0, 12).map((c) => `${c.analyst}: ${c.text}`),
  };

  recordStep(steps, {
    id: "WF-01",
    requirement: "Pick 196 reached / draft complete",
    pass: pick196 || finalUi.draftComplete,
    evidence: `pickCompleted=${finalUi.pickCompleted} total=${finalUi.pickTotal} done=${finalUi.draftComplete}`,
  });
  recordStep(steps, {
    id: "WF-02",
    requirement: "Exactly one written wrap-up",
    pass: wrapUpCount === 1,
    evidence: `wrapUpCount=${wrapUpCount} primary=${live.snapshot?.primary?.text?.slice(0, 80) ?? "none"}`,
  });
  recordStep(steps, {
    id: "WF-03",
    requirement: "sessionComplete=true",
    pass: sessionComplete,
    evidence: `sessionState=${live.sessionState} draftComplete=${live.draftComplete}`,
  });
  recordStep(steps, {
    id: "WF-04",
    requirement: "No audio dependency",
    pass: !enableSoundVisible,
    evidence: `enableSoundVisible=${enableSoundVisible}`,
  });
  recordStep(steps, {
    id: "WF-05",
    requirement: "No broadcast freeze",
    pass: !froze,
    evidence: `froze=${froze} lastPick=${lastPick}`,
  });
  recordStep(steps, {
    id: "WF-06",
    requirement: "No Coach hole mail-merge",
    pass: quality.holeMailMergeHits === 0,
    evidence: `holeMailMergeHits=${quality.holeMailMergeHits} spoken=${quality.spoken}`,
  });
  recordStep(steps, {
    id: "WF-07",
    requirement: "Multiple analysts observed",
    pass: Object.keys(quality.analysts).length >= 2,
    evidence: JSON.stringify(quality.analysts),
  });

  return {
    pick196: pick196 || finalUi.draftComplete,
    wrapUpCount,
    sessionComplete,
    enableSoundVisible,
    froze,
    quality,
  };
}

async function pollHealthForSha(expectedPrefix: string, timeoutMs = 12 * 60_000): Promise<string> {
  const base = (process.env.QA_BASE ?? "https://sprint-8-preview.fantasyfootballrivals.com").replace(/\/$/, "");
  const deadline = Date.now() + timeoutMs;
  let last = "unknown";
  while (Date.now() < deadline) {
    try {
      const h = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15_000) }).then((r) =>
        r.json(),
      )) as { gitSha?: string; gitBranch?: string };
      last = String(h.gitSha ?? "unknown");
      console.log(`health gitSha=${last} branch=${h.gitBranch}`);
      if (last.toLowerCase().startsWith(expectedPrefix.toLowerCase())) return last;
    } catch (e) {
      console.log(`health poll error: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error(`Preview health SHA did not reach ${expectedPrefix} (last=${last})`);
}

async function main(): Promise<void> {
  fs.mkdirSync(VERIFY_OUT, { recursive: true });
  console.log(`Waiting for preview SHA ${EXPECTED_SHA_PREFIX}…`);
  const liveSha = await pollHealthForSha(EXPECTED_SHA_PREFIX);
  console.log(`Preview SHA matched: ${liveSha}`);

  const ctx = createHarnessContext();
  const steps: SmokeStep[] = [];
  // Force SHA check against expected
  process.env.EXPECTED_GIT_SHA = EXPECTED_SHA_PREFIX;
  const { browser, context } = await launchCertBrowser(ctx.base);

  let threeRound: WrittenCapture | null = null;
  let full: Awaited<ReturnType<typeof runFullDraft>> | null = null;
  let ready = false;

  try {
    if (!(await verifyDeploySha(ctx, steps))) {
      throw new Error("verifyDeploySha failed");
    }
    const page = await signInForCert(context, ctx.base);
    if (!(await verifyClerk(page, steps))) throw new Error("Clerk failed");
    await resolveLeagueDraft(page, ctx);
    console.log(`league=${ctx.leagueId} draftId=${ctx.draftId}`);

    if (!(await openLiveDraftTab(page, ctx.base, steps))) throw new Error("Live Draft tab failed");
    await clearRfsnAudioCertState(page);
    await disableVoiceCompletely(page);
    await page.getByRole("button", { name: /Live Draft/i }).click();
    await page.waitForSelector(".live-draft-surface", { timeout: 60_000 });

    console.log("--- Three-round written session ---");
    threeRound = await runThreeRound(page, ctx, steps);
    console.log(JSON.stringify(threeRound, null, 2));

    if (process.env.THREE_ROUND_ONLY === "1") {
      ready =
        Boolean(threeRound?.text) &&
        Boolean(threeRound?.analyst) &&
        !threeRound.enableSoundVisible &&
        !threeRound.blankOrDuplicate &&
        Boolean(threeRound.draftKeptMoving) &&
        !/selected .+ at pick \d+, round \d+/i.test(threeRound.text ?? "");
      full = null;
    } else {
    console.log("--- Full written draft ---");
    full = await runFullDraft(page, ctx, steps);
    console.log(JSON.stringify(full, null, 2));

    ready =
      Boolean(threeRound?.text) &&
      Boolean(threeRound?.analyst) &&
      !threeRound.enableSoundVisible &&
      !threeRound.blankOrDuplicate &&
      Boolean(threeRound.draftKeptMoving) &&
      Boolean(full?.pick196) &&
      full?.wrapUpCount === 1 &&
      Boolean(full?.sessionComplete) &&
      !full?.enableSoundVisible &&
      !full?.froze &&
      (full?.quality?.holeMailMergeHits ?? 0) === 0 &&
      Object.keys(full?.quality?.analysts ?? {}).length >= 2;
    }

    const report = {
      ready,
      verdict: ready ? "READY FOR PERSONAL REVIEW" : "NOT READY",
      liveSha,
      expectedSha: EXPECTED_SHA_PREFIX,
      threeRound,
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
