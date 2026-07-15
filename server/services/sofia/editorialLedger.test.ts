import { describe, it, expect, beforeEach } from "vitest";
import { SessionEditorialLedger, createEditorialLedger } from "./editorialLedger";
import { getEditorialPlan } from "./editorialPlans";
import type { BroadcastMoment } from "./broadcastMomentTypes";

function bm(overrides: Partial<BroadcastMoment> = {}): BroadcastMoment {
  return {
    identity: { kind: "draft_pick", draftId: "d1", pickNumber: 1, pickId: "e1" },
    momentType: "draft_pick",
    significance: "notable",
    headline: null,
    context: { kind: "none" },
    factPacket: {
      subject: { ownerName: "A", playerName: "P", position: "WR", overallPick: 1, round: 1 },
      verifiedFacts: ["A selected P (WR) at pick 1, round 1."],
      entities: ["A", "P"],
    },
    commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
    signals: [],
    storylines: [],
    receipts: [],
    primaryStoryline: null,
    callbackKeys: [],
    ...overrides,
  };
}

describe("SessionEditorialLedger", () => {
  let ledger: SessionEditorialLedger;

  beforeEach(() => {
    ledger = new SessionEditorialLedger();
  });

  it("starts with empty decompression window", () => {
    expect(ledger.snapshot().decompressionRemaining).toBe(0);
  });

  it("triggers decompression after exceptional frame", () => {
    ledger.recordFrame({
      planId: "championship",
      leadVoice: "sofia",
      voicesOnAir: ["sofia", "coach"],
      silenced: false,
      significance: "historic",
      storylines: ["CHAMP"],
      callbackKeys: [],
      acceptedTexts: { sofia: "Champions crowned." },
      planEnergy: "peak",
      decompressionTriggered: true,
      decompressionWindow: 2,
    });
    expect(ledger.snapshot().decompressionRemaining).toBe(2);
  });

  it("suppresses routine pick during decompression", () => {
    const plan = getEditorialPlan("routine_pick");
    ledger.recordFrame({
      planId: "championship",
      leadVoice: "sofia",
      voicesOnAir: ["sofia"],
      silenced: false,
      significance: "historic",
      storylines: [],
      callbackKeys: [],
      acceptedTexts: {},
      planEnergy: "peak",
      decompressionTriggered: true,
      decompressionWindow: 2,
    });
    const res = ledger.resolveForMoment(plan, bm({ significance: "routine" }));
    expect(res.silenced).toBe(true);
    expect(res.silenceReason).toContain("decompression");
  });

  it("allows back-to-back exceptional via overrideDecompression", () => {
    const plan = getEditorialPlan("hall_of_fame");
    ledger.recordFrame({
      planId: "championship",
      leadVoice: "sofia",
      voicesOnAir: ["sofia"],
      silenced: false,
      significance: "historic",
      storylines: [],
      callbackKeys: [],
      acceptedTexts: {},
      planEnergy: "peak",
      decompressionTriggered: true,
      decompressionWindow: 3,
    });
    const res = ledger.resolveForMoment(plan, bm({ significance: "historic", overrideDecompression: true }));
    expect(res.silenced).toBe(false);
  });

  it("does not rotate value_pick lead — ordinary value stays single-voice with no optionals", () => {
    const plan = getEditorialPlan("value_pick");
    expect(plan.optionalVoices).toEqual([]);
    expect(plan.maxVoices).toBe(1);
    for (let i = 0; i < 2; i++) {
      ledger.recordFrame({
        planId: "value_pick",
        leadVoice: "coach",
        voicesOnAir: ["coach"],
        silenced: false,
        significance: "notable",
        storylines: [],
        callbackKeys: [],
        acceptedTexts: { coach: "Roster depth concern." },
        planEnergy: "medium",
        decompressionTriggered: false,
      });
    }
    const res = ledger.resolveForMoment(plan, bm());
    expect(res.leadRotated).toBe(false);
    expect(res.plan.leadVoice).toBe("coach");
  });

  it("rotates coach lead on position_run with optional sofia", () => {
    const plan = getEditorialPlan("position_run");
    for (let i = 0; i < 2; i++) {
      ledger.recordFrame({
        planId: "position_run",
        leadVoice: "coach",
        voicesOnAir: ["coach"],
        silenced: false,
        significance: "notable",
        storylines: [],
        callbackKeys: [],
        acceptedTexts: {},
        planEnergy: "medium",
        decompressionTriggered: false,
      });
    }
    const res = ledger.resolveForMoment(plan, bm());
    expect(res.leadRotated).toBe(true);
    expect(res.plan.leadVoice).toBe("sofia");
  });

  it("suppresses repeated callback within cooldown", () => {
    ledger.recordFrame({
      planId: "value_pick",
      leadVoice: "coach",
      voicesOnAir: ["coach"],
      silenced: false,
      significance: "notable",
      storylines: ["REACH"],
      callbackKeys: ["story:REACH"],
      acceptedTexts: {},
      planEnergy: "medium",
      decompressionTriggered: false,
    });
    expect(ledger.shouldSuppressCallback(["story:REACH"])).toBe(true);
  });

  it("allows callback after cooldown", () => {
    for (let i = 0; i < 5; i++) {
      ledger.recordFrame({
        planId: "value_pick",
        leadVoice: "coach",
        voicesOnAir: ["coach"],
        silenced: false,
        significance: "notable",
        storylines: [],
        callbackKeys: i === 0 ? ["story:REACH"] : [],
        acceptedTexts: {},
        planEnergy: "medium",
        decompressionTriggered: false,
      });
    }
    expect(ledger.shouldSuppressCallback(["story:REACH"])).toBe(false);
  });

  it("tracks active storylines across frames", () => {
    ledger.recordFrame({
      planId: "draft_run",
      leadVoice: "coach",
      voicesOnAir: ["coach"],
      silenced: false,
      significance: "major",
      storylines: ["POSITION_RUN"],
      callbackKeys: [],
      acceptedTexts: {},
      planEnergy: "high",
      decompressionTriggered: false,
    });
    expect(ledger.snapshot().activeStorylines).toContain("POSITION_RUN");
  });

  it("resets session state", () => {
    ledger.recordFrame({
      planId: "championship",
      leadVoice: "sofia",
      voicesOnAir: ["sofia"],
      silenced: false,
      significance: "historic",
      storylines: [],
      callbackKeys: [],
      acceptedTexts: {},
      planEnergy: "peak",
      decompressionTriggered: true,
      decompressionWindow: 2,
    });
    ledger.reset();
    expect(ledger.snapshot().decompressionRemaining).toBe(0);
    expect(ledger.snapshot().momentIndex).toBe(0);
  });

  it("factory creates ledger", () => {
    expect(createEditorialLedger()).toBeInstanceOf(SessionEditorialLedger);
  });
});
