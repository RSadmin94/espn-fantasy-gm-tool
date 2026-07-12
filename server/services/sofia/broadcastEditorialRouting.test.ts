import { describe, it, expect } from "vitest";
import {
  assignEditorialRoles,
  buildEditorialAssignment,
  resolveEditorialPlanId,
  listEditorialPlanIds,
} from "./broadcastEditorialRouting";
import { SessionEditorialLedger } from "./editorialLedger";
import { getEditorialPlan, voicesForPlan } from "./editorialPlans";
import type { BroadcastMoment } from "./broadcastMomentTypes";
import type { BroadcastVoiceDiagnostics } from "./broadcastFrameContract";

function bm(overrides: Partial<BroadcastMoment> = {}): BroadcastMoment {
  return {
    identity: { kind: "draft_pick", draftId: "d1", pickNumber: 10, pickId: "e10" },
    momentType: "draft_pick",
    significance: "notable",
    headline: null,
    context: { kind: "none" },
    factPacket: {
      subject: { ownerName: "Alice", playerName: "Player", position: "WR", overallPick: 10, round: 1 },
      verifiedFacts: ["Alice selected Player (WR) at pick 10, round 1."],
      entities: ["Alice", "Player"],
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

function diag(voice: string, accepted = true): BroadcastVoiceDiagnostics {
  return {
    voice,
    commentaryType: voice === "sofia" ? "FACT" : voice === "coach" ? "OPINION" : "SPECULATION",
    text: `${voice} line`,
    accepted,
    suppressed: !accepted,
    premise: null,
    entailment: "entail",
    attemptCount: 1,
    latencyMs: 1,
  };
}

describe("editorial plans registry", () => {
  it("defines all bible plan ids", () => {
    const ids = listEditorialPlanIds();
    expect(ids).toContain("routine_pick");
    expect(ids).toContain("rivalry_trade");
    expect(ids).toContain("documentary");
    expect(ids.length).toBeGreaterThanOrEqual(20);
  });

  it("routine_pick prohibits all voices", () => {
    const p = getEditorialPlan("routine_pick");
    expect(voicesForPlan(p)).toEqual([]);
    expect(p.maxVoices).toBe(0);
  });
});

describe("resolveEditorialPlanId", () => {
  it("resolves routine_pick for routine significance", () => {
    expect(resolveEditorialPlanId(bm({ significance: "routine" }))).toBe("routine_pick");
  });

  it("resolves value_pick for steal signal", () => {
    expect(resolveEditorialPlanId(bm({ signals: ["STEAL"] }))).toBe("value_pick");
  });

  it("resolves slight_reach for moderate reach", () => {
    expect(resolveEditorialPlanId(bm({ signals: ["REACH"], significance: "notable" }))).toBe("slight_reach");
  });

  it("resolves major_reach for strong reach on major", () => {
    expect(resolveEditorialPlanId(bm({ signals: ["REACH:strong"], significance: "major" }))).toBe("major_reach");
  });

  it("resolves historic_reach", () => {
    expect(resolveEditorialPlanId(bm({ signals: ["REACH:strong"], significance: "historic" }))).toBe("historic_reach");
  });

  it("resolves position_run from context", () => {
    expect(resolveEditorialPlanId(bm({ context: { kind: "position_run", count: 4, position: "RB" } }))).toBe("position_run");
  });

  it("resolves draft_run from signal", () => {
    expect(resolveEditorialPlanId(bm({ signals: ["CONSEQUENTIAL_RUN"], significance: "major" }))).toBe("draft_run");
  });

  it("resolves rivalry_receipt", () => {
    expect(resolveEditorialPlanId(bm({
      significance: "major",
      receipts: [{ id: "rivalry", type: "rivalry" }],
    }))).toBe("rivalry_receipt");
  });

  it("resolves rivalry_trade", () => {
    expect(resolveEditorialPlanId(bm({
      significance: "major",
      receipts: [{ id: "rivalry", type: "rivalry" }],
      context: { kind: "league_storyline", title: "Blockbuster trade", body: "WR swap" },
    }))).toBe("rivalry_trade");
  });

  it("resolves breaking_news", () => {
    expect(resolveEditorialPlanId(bm({
      context: { kind: "breaking_news", headline: "ALERT", body: "News" },
    }))).toBe("breaking_news");
  });

  it("resolves championship moment type", () => {
    expect(resolveEditorialPlanId(bm({ momentType: "championship", significance: "historic" }))).toBe("championship");
  });

  it("resolves hall_of_fame for historic default", () => {
    expect(resolveEditorialPlanId(bm({ significance: "historic" }))).toBe("hall_of_fame");
  });

  it("respects editorialPlanId override", () => {
    expect(resolveEditorialPlanId(bm({ editorialPlanId: "documentary" }))).toBe("documentary");
  });
});

describe("buildEditorialAssignment", () => {
  const ledger = new SessionEditorialLedger();

  it("silences routine_pick", () => {
    const a = buildEditorialAssignment(bm({ significance: "routine" }), ledger);
    expect(a.silence).toBe(true);
    expect(a.request).toEqual([]);
  });

  it("requests coach only for value_pick", () => {
    const a = buildEditorialAssignment(bm({ signals: ["STEAL"] }), ledger);
    expect(a.planId).toBe("value_pick");
    expect(a.leadVoice).toBe("coach");
    expect(a.request).toEqual(["coach"]);
  });

  it("requests sofia lead for major_reach", () => {
    const a = buildEditorialAssignment(bm({ signals: ["REACH:strong"], significance: "major" }), ledger);
    expect(a.leadVoice).toBe("sofia");
    expect(a.request).toContain("sofia");
  });

  it("requests roxanne lead for rivalry_receipt", () => {
    const a = buildEditorialAssignment(bm({
      significance: "major",
      receipts: [{ id: "rivalry", type: "rivalry" }],
    }), ledger);
    expect(a.leadVoice).toBe("roxanne");
    expect(a.request[0]).toBe("roxanne");
  });

  it("never requests prohibited voices", () => {
    const a = buildEditorialAssignment(bm({ signals: ["STEAL"] }), ledger);
    const plan = getEditorialPlan(a.planId);
    for (const v of a.request) {
      expect(plan.prohibitedVoices).not.toContain(v);
    }
  });
});

describe("assignEditorialRoles", () => {
  it("places coach as primary when coach leads", () => {
    const assignment = buildEditorialAssignment(bm({ signals: ["STEAL"] }), new SessionEditorialLedger());
    const roles = assignEditorialRoles(assignment, [diag("coach")]);
    expect(roles.primary?.voice).toBe("coach");
  });

  it("places sofia as primary when sofia leads", () => {
    const assignment = buildEditorialAssignment(
      bm({ signals: ["REACH:strong"], significance: "major" }),
      new SessionEditorialLedger(),
    );
    const roles = assignEditorialRoles(assignment, [diag("sofia"), diag("coach")]);
    expect(roles.primary?.voice).toBe("sofia");
    expect(roles.secondary?.voice).toBe("coach");
  });

  it("places roxanne as primary for rivalry_receipt", () => {
    const assignment = buildEditorialAssignment(bm({
      significance: "major",
      receipts: [{ id: "rivalry", type: "rivalry" }],
    }), new SessionEditorialLedger());
    const roles = assignEditorialRoles(assignment, [diag("roxanne"), diag("coach"), diag("sofia")]);
    expect(roles.primary?.voice).toBe("roxanne");
    expect(roles.secondary?.voice).toBe("coach");
    expect(roles.deferred[0]?.voice).toBe("sofia");
  });

  it("respects maxVoices cap", () => {
    const plan = getEditorialPlan("rivalry_receipt");
    const assignment = {
      planId: plan.id,
      plan,
      silence: false,
      request: voicesForPlan(plan),
      leadVoice: plan.leadVoice,
      leadRotated: false,
      callbackSuppressed: false,
    };
    const roles = assignEditorialRoles(assignment, [diag("roxanne"), diag("coach"), diag("sofia")]);
    expect([roles.primary, roles.secondary, ...roles.deferred].filter(Boolean)).toHaveLength(3);
  });
});

describe("decompression via assignment", () => {
  it("silences routine after championship trigger", () => {
    const ledger = new SessionEditorialLedger();
    ledger.recordFrame({
      planId: "championship",
      leadVoice: "sofia",
      voicesOnAir: ["sofia", "coach", "roxanne"],
      silenced: false,
      significance: "historic",
      storylines: [],
      callbackKeys: [],
      acceptedTexts: {},
      planEnergy: "peak",
      decompressionTriggered: true,
      decompressionWindow: 2,
    });
    const a = buildEditorialAssignment(bm({ significance: "routine" }), ledger);
    expect(a.silence).toBe(true);
  });
});

describe("callback suppression via assignment", () => {
  it("reduces booth when callback repeated", () => {
    const ledger = new SessionEditorialLedger();
    const moment = bm({ signals: ["STEAL"], callbackKeys: ["story:REACH"] });
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
    const a = buildEditorialAssignment(moment, ledger);
    expect(a.callbackSuppressed).toBe(true);
    expect(a.request.length).toBeLessThanOrEqual(1);
  });
});
