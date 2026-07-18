import { describe, it, expect } from "vitest";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import { SessionEditorialLedger } from "./editorialLedger";
import { BroadcastOrchestrator } from "./broadcastOrchestrator";
import { COACH, ROXANNE, SOFIA } from "./voicePersonalities";
import { buildPlayerRegistryOracle } from "./playerRegistryOracle";
import { createShadowGroundedVoiceProvider } from "./shadowGroundedVoiceProvider";
import { draftMomentToBroadcastMoment } from "./broadcastMomentBridge";
import {
  processShadowPick,
  runShadowPipeline,
  validateShadowArtifact,
  validateSnapshotDeterminism,
  type ShadowPipelineState,
} from "./broadcastShadowPipeline";
import { buildMockDraftMoments, buildSimulatedDraftMoments } from "./shadowDraftSources";

const entailChecker = { async check() { return "entail" as const; } };

function orch(ledger?: SessionEditorialLedger) {
  return new BroadcastOrchestrator({
    voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
    checker: entailChecker,
    playerOracle: buildPlayerRegistryOracle([]),
    ledger,
    generate: createShadowGroundedVoiceProvider(),
  });
}

function dm(over: Partial<DraftMoment> = {}): DraftMoment {
  return {
    eventId: "SHADOW:draft:10",
    leagueId: "SHADOW",
    draftId: "draft",
    overallPick: 10,
    round: 1,
    roundPick: 10,
    owner: { teamId: "1", ownerId: "u1", ownerName: "Alice", identityScope: "person", identitySource: "x" },
    player: { playerId: "p1", playerName: "CeeDee Lamb", position: "WR", nflTeam: "DAL", adp: 4 },
    rosterBeforePick: {},
    receipts: [],
    signals: [],
    level: "routine",
    permittedClaims: ["Alice selected CeeDee Lamb (WR) at pick 10, round 1."],
    forbiddenClaimCategories: [],
    primaryStoryline: null,
    secondaryStoryline: null,
    commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
    validation: { valid: true, errors: [], warnings: [] },
    ...over,
  };
}

describe("broadcast shadow e2e", () => {
  it("produces DraftMoment → BroadcastFrame → RfsnBroadcastSnapshot", async () => {
    const state: ShadowPipelineState = { queue: [], ticker: [] };
    const artifact = await processShadowPick(orch(), dm({ level: "notable", signals: ["STEAL"] }), state);
    expect(artifact.broadcastFrame.public.identity.kind).toBe("draft_pick");
    expect(artifact.snapshot).toBeDefined();
    expect(artifact.snapshotJson).toContain("significance");
    expect(validateShadowArtifact(artifact)).toEqual([]);
  });

  it("preserves identity through the pipeline", async () => {
    const m = dm({ level: "notable", signals: ["STEAL"], overallPick: 15, eventId: "SHADOW:draft:15" });
    const state: ShadowPipelineState = { queue: [], ticker: [] };
    const artifact = await processShadowPick(orch(), m, state);
    expect(artifact.broadcastFrame.public.identity).toMatchObject({
      pickNumber: 15,
      pickId: "SHADOW:draft:15",
    });
    expect(artifact.commentaryResults.every((r) => r.pickNumber === 15)).toBe(true);
  });

  it("suppresses routine silence end-to-end", async () => {
    const state: ShadowPipelineState = { queue: [], ticker: [] };
    const artifact = await processShadowPick(orch(), dm({ level: "routine" }), state);
    expect(artifact.broadcastFrame.public.status).toBe("suppressed");
    expect(artifact.snapshot.primary).toBeUndefined();
    expect(artifact.commentaryResults).toHaveLength(0);
  });

  it("routes coach-led value pick to snapshot primary", async () => {
    const state: ShadowPipelineState = { queue: [], ticker: [] };
    const artifact = await processShadowPick(orch(), dm({ level: "notable", signals: ["STARTER_NEED"] }), state);
    expect(artifact.broadcastFrame.public.primaryVoice?.voice).toBe("coach");
    expect(artifact.snapshot.primary?.commentator).toBe("coach");
  });

  it("routes coach-only major reach without sofia secondary (P3A)", async () => {
    const state: ShadowPipelineState = { queue: [], ticker: [] };
    const artifact = await processShadowPick(orch(), dm({ level: "major", signals: ["REACH(strong)"] }), state);
    expect(artifact.broadcastFrame.public.primaryVoice?.voice).toBe("coach");
    expect(artifact.snapshot.primary?.commentator).toBe("coach");
    expect(artifact.snapshot.secondary == null).toBe(true);
  });

    it("routes roxanne-led rivalry with deferred voices on frame", async () => {
      const state: ShadowPipelineState = { queue: [], ticker: [] };
      const artifact = await processShadowPick(orch(), dm({
        level: "major",
        receipts: [
          { id: "rivalry", type: "rivalry", status: "available", source: "x", authority: "x", confidence: 1 },
          { id: "rivalryImpact", type: "rivalryImpact", status: "available", source: "x", authority: "x", confidence: 1 },
        ],
        permittedClaims: [
          "Alice selected CeeDee Lamb (WR) at pick 10, round 1.",
          "Championship rematch humiliation vs rival Bob.",
        ],
      }), state);
      expect(artifact.broadcastFrame.public.primaryVoice?.voice).toBe("roxanne");
      expect(artifact.snapshot.primary?.commentator).toBe("roxanne");
    });

  it("handles breaking news context in snapshot", async () => {
    const state: ShadowPipelineState = { queue: [], ticker: [] };
    const artifact = await processShadowPick(orch(), dm({ level: "notable" }), state, {
      context: { kind: "breaking_news", headline: "BLOCKBUSTER", body: "Trade agreed" },
    });
    expect(artifact.snapshot.breakingNews?.headline).toBe("BLOCKBUSTER");
    expect(artifact.broadcastFrame.public.primaryVoice?.voice).toBe("sofia");
  });

  it("handles position run context", async () => {
    const state: ShadowPipelineState = { queue: [], ticker: [] };
    const artifact = await processShadowPick(orch(), dm({ level: "notable", primaryStoryline: "POSITION_RUN" }), state, {
      context: { kind: "position_run", count: 4, position: "RB" },
    });
    expect(artifact.snapshot.positionRun?.position).toBe("RB");
    expect(artifact.broadcastFrame.public.primaryVoice?.voice).toBe("coach");
  });

  it("handles championship editorial plan", async () => {
    const state: ShadowPipelineState = { queue: [], ticker: [] };
    const artifact = await processShadowPick(orch(), dm({ level: "historic" }), state, {
      momentType: "championship",
      editorialPlanId: "championship",
    });
    expect(artifact.broadcastFrame.public.primaryVoice?.voice).toBe("roxanne");
    expect(artifact.snapshot.significance).toBe("historic");
  });

  it("has no stale frames in sequential simulated draft", async () => {
    const moments = buildSimulatedDraftMoments();
    const result = await runShadowPipeline(moments, orch());
    expect(result.metrics.staleFrameCount).toBe(0);
    expect(result.metrics.expiredFrames).toBe(0);
    expect(result.metrics.silencePct).toBeGreaterThan(50);
  });

  it("maintains queue integrity across picks", async () => {
    const moments = buildMockDraftMoments();
    const result = await runShadowPipeline(moments, orch());
    for (const q of result.finalQueue) {
      expect(q.id).toMatch(/:/);
      expect(q.primary).toBeDefined();
    }
  });

  it("produces deterministic snapshots for identical inputs", async () => {
    const m = dm({ level: "notable", signals: ["STEAL"] });
    const state1: ShadowPipelineState = { queue: [], ticker: [] };
    const state2: ShadowPipelineState = { queue: [], ticker: [] };
    const a = await processShadowPick(orch(new SessionEditorialLedger()), m, state1);
    const b = await processShadowPick(orch(new SessionEditorialLedger()), m, state2);
    expect(validateSnapshotDeterminism(a.snapshot, b.snapshot)).toBe(true);
  });

  it("collects metrics on full mock draft run", async () => {
    const result = await runShadowPipeline(buildMockDraftMoments(), orch());
    expect(result.metrics.totalMoments).toBe(14);
    expect(result.metrics.silencePct).toBeGreaterThan(0);
    expect(result.artifacts).toHaveLength(14);
    for (const a of result.artifacts) {
      expect(validateShadowArtifact(a)).toEqual([]);
    }
  });

  it("serializes snapshots for inspection", async () => {
    const state: ShadowPipelineState = { queue: [], ticker: [] };
    const artifact = await processShadowPick(orch(), dm({ level: "major", signals: ["REACH(strong)"] }), state);
    const parsed = JSON.parse(artifact.snapshotJson);
    expect(parsed.significance).toBe("major");
    expect(parsed.primary?.commentator).toBe("coach");
  });

  it("assigns editorial roles on commentary results", async () => {
    const state: ShadowPipelineState = { queue: [], ticker: [] };
    const artifact = await processShadowPick(orch(), dm({ level: "major", signals: ["REACH(strong)"] }), state);
    const primary = artifact.commentaryResults.find((r) => r.editorialRole === "primary");
    expect(primary?.commentator).toBe("coach");
  });
});

describe("broadcastMoment bridge in e2e", () => {
  it("normalizes REACH(strong) for editorial routing", async () => {
    const m = dm({ level: "major", signals: ["REACH(strong)"] });
    const bm = draftMomentToBroadcastMoment(m);
    expect(bm.signals).toContain("REACH:strong");
    const state: ShadowPipelineState = { queue: [], ticker: [] };
    const artifact = await processShadowPick(orch(), m, state);
    expect(artifact.broadcastFrame.public.primaryVoice?.voice).toBe("coach");
  });
});
