import { describe, it, expect, beforeEach } from "vitest";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import { BroadcastOrchestrator } from "./broadcastOrchestrator";
import { COACH, ROXANNE, SOFIA } from "./voicePersonalities";
import { buildPlayerRegistryOracle } from "./playerRegistryOracle";
import type { EntailmentChecker } from "./sofiaDeterministicValidation";
import { draftMomentToBroadcastMoment, draftMomentToIdentity, leagueEventToBroadcastMoment } from "./broadcastMomentBridge";
import { SessionEditorialLedger } from "./editorialLedger";

function moment(overrides: Partial<DraftMoment> = {}): DraftMoment {
  return {
    eventId: "457622:mock-457622-2026:42",
    leagueId: "457622",
    draftId: "mock-457622-2026",
    overallPick: 42,
    round: 3,
    roundPick: 14,
    owner: {
      teamId: "3",
      ownerId: "user_a",
      ownerName: "Alice Owner",
      identityScope: "person",
      identitySource: "gmTeams.ownerId",
    },
    player: {
      playerId: "p1",
      playerName: "Test Player",
      position: "WR",
      nflTeam: "KC",
      adp: 50,
    },
    rosterBeforePick: { WR: 1 },
    receipts: [],
    signals: [],
    level: "routine",
    permittedClaims: ["Alice Owner selected Test Player (WR) at pick 42, round 3."],
    forbiddenClaimCategories: [],
    primaryStoryline: null,
    secondaryStoryline: null,
    commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
    validation: { valid: true, errors: [], warnings: [] },
    ...overrides,
  };
}

function toBroadcast(draft: DraftMoment, opts: Parameters<typeof draftMomentToBroadcastMoment>[1] = {}) {
  return draftMomentToBroadcastMoment(draft, opts);
}

const entailChecker: EntailmentChecker = {
  async check() { return "entail"; },
};

const contradictChecker: EntailmentChecker = {
  async check() { return "contradict"; },
};

function mockGenerate(lines: Record<string, string>) {
  const defaultPremise = "Alice Owner selected Test Player (WR) at pick 42, round 3.";
  return async (prompt: string) => {
    const voice = prompt.includes("Sofia") ? "sofia" : prompt.includes("Coach") ? "coach" : "roxanne";
    const line = lines[voice] ?? defaultPremise;
    const premiseMatch = prompt.match(/VERIFIED FACTS:\n1\. (.+)/);
    const premise = premiseMatch?.[1] ?? defaultPremise;
    return JSON.stringify({ line, premise });
  };
}

describe("BroadcastOrchestrator", () => {
  let orchestrator: BroadcastOrchestrator;
  let ledger: SessionEditorialLedger;

  beforeEach(() => {
    ledger = new SessionEditorialLedger();
    orchestrator = new BroadcastOrchestrator({
      voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
      checker: entailChecker,
      playerOracle: buildPlayerRegistryOracle([
        { playerId: "p1", fullName: "Test Player", normalizedName: "test player" },
      ]),
      ledger,
      generate: mockGenerate({
        sofia: "Alice Owner selected Test Player (WR) at pick 42, round 3.",
        coach: "Here's what worries me about the roster balance.",
        roxanne: "Did Alice just change the whole draft?",
      }),
      clock: () => Date.now(),
    }, { voiceTimeoutMs: 5000, maxTransientRetries: 1 });
  });

  describe("happy paths", () => {
    it("produces suppressed routine silence without calling voices", async () => {
      const frame = await orchestrator.buildFrame(toBroadcast(moment({ level: "routine" })));
      expect(frame.public.status).toBe("suppressed");
      expect(frame.public.primaryVoice).toBeNull();
      expect(frame.diagnostics.voiceAttempts).toHaveLength(0);
    });

    it("produces sofia-led analytical value pick frame", async () => {
      const frame = await orchestrator.buildFrame(toBroadcast(moment({ level: "notable", signals: ["STEAL"] })));
      expect(frame.public.status).toBe("ready");
      expect(frame.public.primaryVoice?.voice).toBe("sofia");
    });

    it("produces sofia-led major reach frame", async () => {
      const frame = await orchestrator.buildFrame(toBroadcast(moment({ level: "major", signals: ["REACH:strong"] })));
      expect(frame.public.primaryVoice?.voice).toBe("sofia");
      expect(frame.public.secondaryVoice?.voice).toBe("coach");
    });

    it("produces roxanne-led rivalry receipt frame", async () => {
      const frame = await orchestrator.buildFrame(toBroadcast(moment({
        level: "major",
        receipts: [{ id: "rivalry", type: "rivalry", status: "available", source: "x", authority: "x", confidence: 1 }],
      })));
      expect(frame.public.primaryVoice?.voice).toBe("roxanne");
    });
  });

  describe("prohibited voices", () => {
    it("never generates prohibited voices for value pick", async () => {
      const voices: string[] = [];
      const orch = new BroadcastOrchestrator({
        voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
        checker: entailChecker,
        playerOracle: buildPlayerRegistryOracle([]),
        ledger: new SessionEditorialLedger(),
        generate: async (prompt) => {
          if (prompt.includes("Write Sofia's reaction")) voices.push("sofia");
          if (prompt.includes("Write Coach's reaction")) voices.push("coach");
          if (prompt.includes("Write Roxanne's reaction")) voices.push("roxanne");
          return JSON.stringify({ line: "Alice Owner selected Test Player (WR) at pick 42, round 3.", premise: "f" });
        },
      });
      await orch.buildFrame(toBroadcast(moment({ level: "notable", signals: ["STEAL"] })));
      expect(voices).toEqual(["sofia"]);
    });
  });

  describe("failures", () => {
    it("becomes partial when coach times out on major reach", async () => {
      const slow = new BroadcastOrchestrator({
        voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
        checker: entailChecker,
        playerOracle: buildPlayerRegistryOracle([]),
        generate: async (prompt) => {
          if (prompt.includes("Coach")) await new Promise((r) => setTimeout(r, 50));
          return JSON.stringify({ line: "Alice Owner selected Test Player (WR) at pick 42, round 3.", premise: "f" });
        },
        clock: () => Date.now(),
      }, { voiceTimeoutMs: 10, maxTransientRetries: 0 });

      const frame = await slow.buildFrame(toBroadcast(moment({ level: "major", signals: ["REACH:strong"] })));
      expect(frame.public.status).toBe("partial");
    });

    it("rejects entity violations", async () => {
      const bad = new BroadcastOrchestrator({
        voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
        checker: entailChecker,
        playerOracle: buildPlayerRegistryOracle([
          { playerId: "luck", fullName: "Andrew Luck", normalizedName: "andrew luck" },
        ]),
        generate: async () => JSON.stringify({ line: "Best since Andrew Luck.", premise: "x" }),
      }, { voiceTimeoutMs: 3000, maxTransientRetries: 0 });

      const frame = await bad.buildFrame(toBroadcast(moment({ level: "major", signals: ["REACH:strong"] })));
      expect(frame.diagnostics.voiceAttempts.some((v) => v.rejectionCategory === "entity")).toBe(true);
    });
  });

  describe("stale", () => {
    it("expires when isStillActive returns false", async () => {
      const frame = await orchestrator.buildFrame(toBroadcast(moment({ level: "major", signals: ["REACH:strong"] })), {
        isStillActive: () => false,
      });
      expect(frame.public.status).toBe("expired");
    });

    it("expires when a newer buildFrame starts", async () => {
      const slow = new BroadcastOrchestrator({
        voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
        checker: entailChecker,
        playerOracle: buildPlayerRegistryOracle([]),
        generate: async (prompt) => {
          if (prompt.includes("Sofia")) await new Promise((r) => setTimeout(r, 30));
          return JSON.stringify({ line: "Alice Owner selected Test Player (WR) at pick 42, round 3.", premise: "f" });
        },
      }, { voiceTimeoutMs: 5000 });

      const p1 = slow.buildFrame(toBroadcast(moment({ overallPick: 1, eventId: "e1", level: "major", signals: ["REACH:strong"] })));
      const p2 = slow.buildFrame(toBroadcast(moment({ overallPick: 2, eventId: "e2", level: "major", signals: ["REACH:strong"] })));
      const [f1, f2] = await Promise.all([p1, p2]);
      expect([f1, f2].some((f) => f.public.status === "expired")).toBe(true);
    });
  });

  describe("decompression integration", () => {
    it("silences routine pick after championship moment", async () => {
      const orch = new BroadcastOrchestrator({
        voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
        checker: entailChecker,
        playerOracle: buildPlayerRegistryOracle([]),
        ledger,
        generate: mockGenerate({
          sofia: "Alice Owner selected Test Player (WR) at pick 42, round 3.",
          coach: "Championship implications everywhere.",
          roxanne: "Did Alice just win it all?",
        }),
      });

      await orch.buildFrame({
        ...toBroadcast(moment({ level: "historic" })),
        momentType: "championship",
        editorialPlanId: "championship",
      });

      const quiet = await orch.buildFrame(toBroadcast(moment({ level: "routine", overallPick: 43, eventId: "e43" })));
      expect(quiet.public.status).toBe("suppressed");
    });

    it("allows back-to-back historic with override", async () => {
      await orchestrator.buildFrame({
        ...toBroadcast(moment({ level: "historic" })),
        momentType: "championship",
        editorialPlanId: "championship",
      });

      const second = await orchestrator.buildFrame({
        ...toBroadcast(moment({ level: "historic", overallPick: 43, eventId: "e43" })),
        editorialPlanId: "hall_of_fame",
        overrideDecompression: true,
      });
      expect(second.diagnostics.voiceAttempts.length).toBeGreaterThan(0);
    });
  });

  describe("rotation integration", () => {
    it("rotates coach lead after streak on position run", async () => {
      const orch = new BroadcastOrchestrator({
        voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
        checker: entailChecker,
        playerOracle: buildPlayerRegistryOracle([]),
        ledger,
        generate: mockGenerate({
          sofia: "Alice Owner selected Test Player (WR) at pick 42, round 3.",
          coach: "Another RB run building.",
        }),
      });

      for (let i = 0; i < 3; i++) {
        await orch.buildFrame(toBroadcast(moment({
          level: "notable",
          overallPick: 10 + i,
          eventId: `run-${i}`,
          primaryStoryline: "POSITION_RUN",
        }), { context: { kind: "position_run", count: 4, position: "RB" } }));
      }

      const frame = await orch.buildFrame(toBroadcast(moment({
        level: "notable",
        overallPick: 20,
        eventId: "run-20",
      }), { context: { kind: "position_run", count: 5, position: "RB" } }));

      expect(frame.public.primaryVoice?.voice).toBe("sofia");
    });
  });

  describe("BroadcastMoment bridges", () => {
    it("preserves draft identity through bridge", async () => {
      const m = moment({ level: "notable", signals: ["STEAL"] });
      const frame = await orchestrator.buildFrame(toBroadcast(m));
      expect(frame.public.identity).toEqual(draftMomentToIdentity(m));
    });

    it("accepts league event broadcast moment", async () => {
      const bm = leagueEventToBroadcastMoment({
        leagueId: "457622",
        eventId: "trade-99",
        occurredAt: "2026-07-11T00:00:00.000Z",
        momentType: "trade",
        significance: "major",
        headline: "BLOCKBUSTER",
        editorialPlanId: "rivalry_trade",
        factPacket: {
          subject: { ownerName: "A", playerName: "B", position: "WR", overallPick: 0, round: 0 },
          verifiedFacts: ["Blockbuster trade agreed."],
          entities: ["A", "B"],
        },
        receipts: [{ id: "rivalry", type: "rivalry" }],
      });
      const frame = await orchestrator.buildFrame(bm);
      expect(frame.public.identity.kind).toBe("league_event");
      expect(frame.public.primaryVoice?.voice).toBe("roxanne");
    });
  });

  describe("determinism", () => {
    it("returns immutable frozen frames", async () => {
      const frame = await orchestrator.buildFrame(toBroadcast(moment({ level: "notable", signals: ["STEAL"] })));
      expect(Object.isFrozen(frame)).toBe(true);
    });

    it("exposes injected ledger", () => {
      expect(orchestrator.getLedger()).toBe(ledger);
    });
  });
});
