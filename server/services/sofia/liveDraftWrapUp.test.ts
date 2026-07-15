import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import { buildBroadcastPaceDraftMoments } from "./shadowDraftSources";
import { buildEditorialAssignment } from "./broadcastEditorialRouting";
import { SessionEditorialLedger } from "./editorialLedger";
import {
  processDraftWrapUp,
  resetLiveBroadcastServiceForTests,
} from "./liveBroadcastService";
import {
  getLiveSession,
  hasWrapUpBeenProcessed,
  resetLiveSessionsForTests,
} from "./liveBroadcastSession";
import {
  awaitLiveBroadcastIdle,
  resetLiveBroadcastPickHookForTests,
  scheduleLiveBroadcastForDraftMoment,
} from "./liveBroadcastPickHook";
import { resetLiveDraftMomentSessionsForTests, buildDraftMomentForLockedPick } from "./liveDraftMomentSession";
import { buildDraftWrapUpBroadcastMoment, summarizeDraftWrapUp } from "./liveDraftWrapUp";

const ENV_KEY = "RFSN_LIVE_BROADCAST_ENABLED";
const LEAGUE = "WRAP";
const DRAFT = "draft-wrap-test";

async function seedAllPicks(): Promise<DraftMoment> {
  const moments = buildBroadcastPaceDraftMoments("wrap-up-seed");
  let last = moments[0]!;
  for (const m of moments) {
    last = await buildDraftMomentForLockedPick(LEAGUE, DRAFT, {
      overallPick: m.overallPick,
      round: m.round,
      roundPick: m.roundPick,
      teamId: m.owner.teamId,
      ownerName: m.owner.ownerName,
      playerId: m.player.playerId,
      playerName: m.player.playerName,
      position: m.player.position,
      nflTeam: m.player.nflTeam,
    }, { reset: m.overallPick === 1 });
  }
  return last;
}

describe("live draft wrap-up", () => {
  beforeEach(() => {
    process.env[ENV_KEY] = "true";
    resetLiveBroadcastServiceForTests();
    resetLiveSessionsForTests();
    resetLiveBroadcastPickHookForTests();
    resetLiveDraftMomentSessionsForTests();
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("builds grounded wrap-up with Sofia lead and Coach/Roxanne requested", () => {
    const picks = buildBroadcastPaceDraftMoments("wrap-summary");
    const summary = summarizeDraftWrapUp(
      picks.map((m) => ({
        overall: m.overallPick,
        round: m.round,
        roundPick: m.roundPick,
        teamId: m.owner.teamId,
        ownerName: m.owner.ownerName,
        playerId: m.player.playerId,
        playerName: m.player.playerName,
        position: m.player.position,
      })),
      14,
    );
    const moment = buildDraftWrapUpBroadcastMoment(LEAGUE, DRAFT, summary);
    const ledger = new SessionEditorialLedger();
    const assignment = buildEditorialAssignment(moment, ledger);
    expect(assignment.planId).toBe("draft_wrap_up");
    expect(assignment.silence).toBe(false);
    expect(assignment.request).toEqual(["sofia", "coach", "roxanne"]);
    expect(assignment.leadVoice).toBe("sofia");
    expect(moment.factPacket.verifiedFacts[0]).toMatch(/Draft complete:/);
  });

  it("runs exactly once per draft and permits a new wrap-up after session reset", async () => {
    const finalPick = await seedAllPicks();
    const first = await processDraftWrapUp({
      leagueId: LEAGUE,
      draftId: DRAFT,
      finalDraftMoment: finalPick,
      useDeterministicProvider: true,
    });
    expect(first).not.toBeNull();
    expect(hasWrapUpBeenProcessed(LEAGUE, DRAFT)).toBe(true);

    const second = await processDraftWrapUp({
      leagueId: LEAGUE,
      draftId: DRAFT,
      finalDraftMoment: finalPick,
      useDeterministicProvider: true,
    });
    expect(second?.generatedAt).toBe(first?.generatedAt);

    resetLiveSessionsForTests();
    expect(hasWrapUpBeenProcessed(LEAGUE, DRAFT)).toBe(false);

    const afterReset = await processDraftWrapUp({
      leagueId: LEAGUE,
      draftId: DRAFT,
      finalDraftMoment: finalPick,
      useDeterministicProvider: true,
    });
    expect(afterReset).not.toBeNull();
    expect(getLiveSession(LEAGUE, DRAFT)?.state).toBe("draft_complete");
  });

  it("marks draft complete with on-air commentary after the final pick", async () => {
    const finalPick = await seedAllPicks();
    const payload = await processDraftWrapUp({
      leagueId: LEAGUE,
      draftId: DRAFT,
      finalDraftMoment: finalPick,
      useDeterministicProvider: true,
    });
    expect(payload?.draftComplete).toBe(true);
    expect(payload?.sessionState).toBe("draft_complete");
    expect(payload?.snapshot).toBeDefined();
    expect(
      payload?.snapshot?.primary?.text ??
        payload?.snapshot?.secondary?.text ??
        payload?.frameStatus,
    ).toBeTruthy();
  });

  it("deterministic partial output survives a rejected middle voice", async () => {
    const finalPick = await seedAllPicks();
    const { createDeterministicLiveOrchestrator } = await import("./liveBroadcastOrchestratorFactory");
    const spy = vi.spyOn(
      await import("./liveBroadcastOrchestratorFactory"),
      "createDeterministicLiveOrchestrator",
    ).mockImplementation((ledger) => {
      const base = createDeterministicLiveOrchestrator(ledger);
      return {
        buildFrame: async (moment, opts) => {
          const frame = await base.buildFrame(moment, opts);
          for (const v of frame.diagnostics.voiceAttempts) {
            if (v.voice === "coach") v.accepted = false;
          }
          return frame;
        },
      } as any;
    });

    const payload = await processDraftWrapUp({
      leagueId: LEAGUE,
      draftId: DRAFT,
      finalDraftMoment: finalPick,
      useDeterministicProvider: true,
    });
    spy.mockRestore();

    expect(payload?.snapshot).toBeDefined();
    expect(payload?.draftComplete).toBe(true);
  });

  it("schedules wrap-up once after the final pick via the live pick hook", async () => {
    const finalPick = await seedAllPicks();
    scheduleLiveBroadcastForDraftMoment(finalPick, {
      draftComplete: true,
      useDeterministicProvider: true,
      teamCount: 14,
    });
    await awaitLiveBroadcastIdle(LEAGUE, DRAFT);
    expect(hasWrapUpBeenProcessed(LEAGUE, DRAFT)).toBe(true);
    expect(getLiveSession(LEAGUE, DRAFT)?.state).toBe("draft_complete");

    scheduleLiveBroadcastForDraftMoment(finalPick, {
      draftComplete: true,
      useDeterministicProvider: true,
      teamCount: 14,
    });
    await awaitLiveBroadcastIdle(LEAGUE, DRAFT);
    expect(getLiveSession(LEAGUE, DRAFT)?.wrapUpEventId).toBe(`wrap-up:${DRAFT}`);
  });
});
