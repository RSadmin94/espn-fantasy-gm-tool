import { describe, it, expect } from "vitest";
import {
  BROADCAST_FRAME_SCHEMA_VERSION,
  assertBroadcastFrameVersion,
  buildBroadcastFramePublic,
  deriveBroadcastFrameStatus,
  freezeBroadcastFrame,
  parseBroadcastFrame,
  serializeBroadcastFrame,
  stripDiagnostics,
  type BroadcastFrame,
  type BroadcastVoiceDiagnostics,
} from "./broadcastFrameContract";
import type { FactPacket } from "./broadcastVoice";

const draftIdentity = {
  kind: "draft_pick" as const,
  draftId: "draft-457622",
  pickNumber: 18,
  pickId: "457622:m:18",
};

const factPacket: FactPacket = {
  subject: { ownerName: "Rod Sellers", playerName: "Lamar Jackson", position: "QB", overallPick: 18, round: 2 },
  verifiedFacts: ["Rod Sellers selected Lamar Jackson at pick 18."],
  entities: ["Rod Sellers", "Lamar Jackson"],
};

function voice(overrides: Partial<BroadcastVoiceDiagnostics>): BroadcastVoiceDiagnostics {
  return {
    voice: "sofia",
    commentaryType: "FACT",
    text: "Rod Sellers selected Lamar Jackson at pick 18.",
    accepted: true,
    suppressed: false,
    premise: "pick fact",
    entailment: "entail",
    attemptCount: 1,
    latencyMs: 120,
    ...overrides,
  };
}

describe("BroadcastFrame contract", () => {
  it("builds a full ready frame", () => {
    const pub = buildBroadcastFramePublic({
      identity: draftIdentity,
      momentType: "pick_locked",
      significance: "notable",
      primaryVoice: voice({ voice: "sofia" }),
      secondaryVoice: voice({ voice: "coach", commentaryType: "OPINION", accepted: true }),
      deferredVoices: [voice({ voice: "roxanne", commentaryType: "SPECULATION", accepted: true })],
    });
    expect(pub.status).toBe("ready");
    expect(pub.schemaVersion).toBe(BROADCAST_FRAME_SCHEMA_VERSION);
    expect(pub.primaryVoice?.voice).toBe("sofia");
    expect(pub.deferredVoices).toHaveLength(1);
  });

  it("marks partial when only some voices accept", () => {
    const status = deriveBroadcastFrameStatus("major", [
      voice({ accepted: true }),
      voice({ voice: "coach", accepted: false, rejectionCategory: "number", suppressed: true }),
    ]);
    expect(status).toBe("partial");
  });

  it("marks routine intentional silence as suppressed", () => {
    const status = deriveBroadcastFrameStatus("routine", [
      voice({ accepted: false, suppressed: true, rejectionCategory: "entailment" }),
    ]);
    expect(status).toBe("suppressed");
  });

  it("marks all providers failed as failed", () => {
    expect(deriveBroadcastFrameStatus("major", [], { allProvidersFailed: true })).toBe("failed");
  });

  it("marks stale results as expired", () => {
    expect(deriveBroadcastFrameStatus("major", [voice({})], { stale: true })).toBe("expired");
  });

  it("supports league-event identity", () => {
    const pub = buildBroadcastFramePublic({
      identity: { kind: "league_event", leagueId: "457622", eventId: "trade-1", occurredAt: "2026-07-11T00:00:00.000Z" },
      momentType: "trade_deadline",
      significance: "major",
      primaryVoice: voice({}),
    });
    expect(pub.identity.kind).toBe("league_event");
  });

  it("strips diagnostics from public payload", () => {
    const frame: BroadcastFrame = {
      public: buildBroadcastFramePublic({
        identity: draftIdentity,
        momentType: "pick_locked",
        significance: "notable",
        primaryVoice: voice({ entityDiagnostics: [{ guard: "entity", playerId: "x", canonicalName: "Andrew Luck", matchedText: "Andrew Luck", reason: "unauthorized_player_mention", start: 0, end: 11 }] }),
      }),
      diagnostics: { factPacket, voiceAttempts: [voice({})], providerFailures: [], stale: false },
    };
    const pub = stripDiagnostics(frame);
    expect(pub.primaryVoice).not.toHaveProperty("entityDiagnostics");
    expect(pub.primaryVoice).not.toHaveProperty("premise");
  });

  it("round-trips serialization", () => {
    const frame: BroadcastFrame = {
      public: buildBroadcastFramePublic({
        identity: draftIdentity,
        momentType: "pick_locked",
        significance: "major",
        primaryVoice: voice({}),
        context: { kind: "breaking_news", headline: "REACH", body: "Early QB" },
      }),
      diagnostics: { factPacket, voiceAttempts: [voice({})], providerFailures: [], stale: false },
    };
    const parsed = parseBroadcastFrame(serializeBroadcastFrame(frame));
    expect(parsed.public.identity).toEqual(draftIdentity);
    expect(parsed.public.context.kind).toBe("breaking_news");
  });

  it("freezes frame immutably", () => {
    const frozen = freezeBroadcastFrame({
      public: buildBroadcastFramePublic({ identity: draftIdentity, momentType: "x", significance: "routine" }),
      diagnostics: { factPacket, voiceAttempts: [], providerFailures: [], stale: false },
    });
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.public.deferredVoices)).toBe(true);
  });

  it("rejects unsupported schema version", () => {
    expect(() =>
      assertBroadcastFrameVersion({
        schemaVersion: 99 as 1,
        identity: draftIdentity,
        momentType: "x",
        significance: "routine",
        headline: null,
        primaryVoice: null,
        secondaryVoice: null,
        deferredVoices: [],
        context: { kind: "none" },
        generatedAt: "2026-01-01T00:00:00.000Z",
        status: "pending",
      }),
    ).toThrow(/Unsupported BroadcastFrame schema version/);
  });
});
