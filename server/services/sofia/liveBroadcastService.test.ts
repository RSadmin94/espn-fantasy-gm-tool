import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import {
  buildLiveBroadcastFrame,
  processLockedDraftMoment,
  resetLiveBroadcastServiceForTests,
} from "./liveBroadcastService";
import { draftMomentToBroadcastMoment } from "./broadcastMomentBridge";
import {
  resetLiveSessionsForTests,
  getLiveSession,
} from "./liveBroadcastSession";
import { resetLiveBroadcastTelemetryForTests, getLiveBroadcastTelemetrySnapshot } from "./liveBroadcastTelemetry";
import { resetLiveBroadcastPickHookForTests } from "./liveBroadcastPickHook";
import { resetLiveDraftMomentSessionsForTests } from "./liveDraftMomentSession";

const ENV_KEY = "RFSN_LIVE_BROADCAST_ENABLED";

function dm(over: Partial<DraftMoment> = {}): DraftMoment {
  return {
    eventId: "LIVE:draft:5",
    leagueId: "LIVE",
    draftId: "draft-1",
    overallPick: 5,
    round: 1,
    roundPick: 5,
    owner: { teamId: "1", ownerId: "u1", ownerName: "Alice", identityScope: "person", identitySource: "x" },
    player: { playerId: "p1", playerName: "CeeDee Lamb", position: "WR", nflTeam: "DAL", adp: 4 },
    rosterBeforePick: {},
    receipts: [],
    signals: ["STEAL"],
    level: "notable",
    permittedClaims: ["Alice selected CeeDee Lamb (WR) at pick 5, round 1."],
    forbiddenClaimCategories: [],
    primaryStoryline: null,
    secondaryStoryline: null,
    commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
    validation: { valid: true, errors: [], warnings: [] },
    ...over,
  };
}

describe("liveBroadcastService", () => {
  beforeEach(() => {
    process.env[ENV_KEY] = "true";
    resetLiveBroadcastServiceForTests();
    resetLiveSessionsForTests();
    resetLiveBroadcastTelemetryForTests();
    resetLiveBroadcastPickHookForTests();
    resetLiveDraftMomentSessionsForTests();
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
    vi.restoreAllMocks();
  });

  it("preserves prior booth snapshot while commentary_pending", async () => {
    const first = dm({ overallPick: 5, eventId: "LIVE:draft:5", level: "notable", signals: ["STEAL"] });
    const firstResult = await buildLiveBroadcastFrame({
      moment: draftMomentToBroadcastMoment(first),
      leagueId: first.leagueId,
      draftId: first.draftId,
      draftMoment: first,
      useDeterministicProvider: true,
    });
    expect(firstResult?.publicPayload.snapshot?.primary?.text).toBeTruthy();
    const priorText = firstResult!.publicPayload.snapshot!.primary!.text;

    let pendingSnapshotText: string | null | undefined;
    const identity = {
      kind: "draft_pick" as const,
      draftId: first.draftId,
      pickNumber: 6,
      pickId: "LIVE:draft:6",
    };
    const spy = vi
      .spyOn(await import("./liveBroadcastOrchestratorFactory"), "createDeterministicLiveOrchestrator")
      .mockReturnValue({
        buildFrame: async () => {
          pendingSnapshotText = getLiveSession(first.leagueId, first.draftId)?.payload.snapshot?.primary?.text ?? null;
          return {
            public: {
              status: "ready",
              generatedAt: new Date().toISOString(),
              identity,
              primaryVoice: {
                voice: "coach",
                accepted: true,
                text: "Next construction note.",
                premise: "x",
              },
              secondaryVoice: null,
              deferredVoices: [],
              context: { kind: "none" },
              significance: "notable",
              headline: null,
              momentType: "draft_pick",
            },
            diagnostics: { stale: false, voiceAttempts: [], providerFailures: [] },
          };
        },
      } as any);

    const second = dm({ overallPick: 6, eventId: "LIVE:draft:6", level: "notable", signals: ["STEAL"] });
    await buildLiveBroadcastFrame({
      moment: draftMomentToBroadcastMoment(second),
      leagueId: second.leagueId,
      draftId: second.draftId,
      draftMoment: second,
      useDeterministicProvider: true,
    });

    expect(pendingSnapshotText).toBe(priorText);
    spy.mockRestore();
  });

  it("builds public snapshot without diagnostics when enabled", async () => {
    const draftMoment = dm({ level: "notable" });
    const result = await buildLiveBroadcastFrame({
      moment: draftMomentToBroadcastMoment(draftMoment),
      leagueId: draftMoment.leagueId,
      draftId: draftMoment.draftId,
      draftMoment,
      useDeterministicProvider: true,
    });
    expect(result).not.toBeNull();
    expect(result!.publicPayload.snapshot).toBeDefined();
    expect(result!.publicPayload.snapshot!.significance).toBe("notable");
    expect((result!.publicPayload as any).diagnostics).toBeUndefined();
    expect(getLiveBroadcastTelemetrySnapshot().length).toBeGreaterThan(0);
  });

  it("newer pick supersedes older build in session", async () => {
    await processLockedDraftMoment(dm({ overallPick: 5, eventId: "LIVE:draft:5" }), {
      useDeterministicProvider: true,
    });
    await processLockedDraftMoment(dm({ overallPick: 6, eventId: "LIVE:draft:6" }), {
      useDeterministicProvider: true,
    });
    expect(getLiveSession("LIVE", "draft-1")?.lastProcessedPickId).toBe("LIVE:draft:6");
  });

  it("routine pick stays silent in snapshot", async () => {
    const result = await processLockedDraftMoment(dm({ level: "routine", signals: [] }), {
      useDeterministicProvider: true,
    });
    expect(result?.snapshot?.primary).toBeUndefined();
    expect(result?.sessionState).toBe("between_picks");
  });

  it("marks session unavailable when orchestrator throws", async () => {
    const draftMoment = dm();
    const { createDeterministicLiveOrchestrator } = await import("./liveBroadcastOrchestratorFactory");
    const spy = vi.spyOn(
      await import("./liveBroadcastOrchestratorFactory"),
      "createDeterministicLiveOrchestrator",
    ).mockReturnValue({
      buildFrame: async () => {
        throw new Error("provider down");
      },
    } as any);

    const result = await buildLiveBroadcastFrame({
      moment: draftMomentToBroadcastMoment(draftMoment),
      leagueId: draftMoment.leagueId,
      draftId: draftMoment.draftId,
      draftMoment,
      useDeterministicProvider: true,
    });
    expect(result).toBeNull();
    expect(getLiveSession(draftMoment.leagueId, draftMoment.draftId)?.state).toBe("between_picks");
    expect(getLiveSession(draftMoment.leagueId, draftMoment.draftId)?.payload.sessionState).toBe(
      "between_picks",
    );
    spy.mockRestore();
    void createDeterministicLiveOrchestrator;
  });

  it("restores between_picks when a stale frame is discarded after commentary_pending", async () => {
    const draftMoment = dm({ overallPick: 7, eventId: "LIVE:draft:7" });
    const { bumpLiveSessionEpoch } = await import("./liveBroadcastSession");
    const identity = {
      kind: "draft_pick" as const,
      draftId: draftMoment.draftId,
      pickNumber: draftMoment.overallPick,
      pickId: draftMoment.eventId,
    };
    const spy = vi
      .spyOn(await import("./liveBroadcastOrchestratorFactory"), "createDeterministicLiveOrchestrator")
      .mockReturnValue({
        buildFrame: async () => ({
          public: {
            status: "ready",
            generatedAt: new Date().toISOString(),
            identity,
            primaryVoice: { accepted: true },
            secondaryVoice: null,
            deferredVoices: [],
            context: {},
          },
          diagnostics: { stale: true, voiceAttempts: [], providerFailures: [] },
        }),
      } as any);

    const result = await buildLiveBroadcastFrame({
      moment: draftMomentToBroadcastMoment(draftMoment),
      leagueId: draftMoment.leagueId,
      draftId: draftMoment.draftId,
      draftMoment,
      useDeterministicProvider: true,
    });

    expect(result).toBeNull();
    const session = getLiveSession(draftMoment.leagueId, draftMoment.draftId);
    expect(session?.state).toBe("between_picks");
    expect(session?.payload.sessionState).not.toBe("commentary_pending");
    expect(session?.payload.sessionState).toBe("between_picks");
    spy.mockRestore();
    void bumpLiveSessionEpoch;
  });

  it("restores between_picks when epoch advances before build completes", async () => {
    const draftMoment = dm({ overallPick: 8, eventId: "LIVE:draft:8" });
    const { bumpLiveSessionEpoch } = await import("./liveBroadcastSession");
    const identity = {
      kind: "draft_pick" as const,
      draftId: draftMoment.draftId,
      pickNumber: draftMoment.overallPick,
      pickId: draftMoment.eventId,
    };
    const spy = vi
      .spyOn(await import("./liveBroadcastOrchestratorFactory"), "createDeterministicLiveOrchestrator")
      .mockReturnValue({
        buildFrame: async () => {
          bumpLiveSessionEpoch(draftMoment.leagueId, draftMoment.draftId);
          return {
            public: {
              status: "ready",
              generatedAt: new Date().toISOString(),
              identity,
              primaryVoice: { accepted: true },
              secondaryVoice: null,
              deferredVoices: [],
              context: {},
            },
            diagnostics: { stale: false, voiceAttempts: [], providerFailures: [] },
          };
        },
      } as any);

    const result = await processLockedDraftMoment(draftMoment, { useDeterministicProvider: true });
    expect(result?.sessionState).toBe("between_picks");
    expect(result?.sessionState).not.toBe("commentary_pending");
    spy.mockRestore();
  });
});
