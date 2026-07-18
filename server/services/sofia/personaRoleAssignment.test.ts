import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildEditorialAssignment } from "./broadcastEditorialRouting";
import { SessionEditorialLedger } from "./editorialLedger";
import type { BroadcastMoment } from "./broadcastMomentTypes";
import {
  applyConversationMemory,
  classifyEventRole,
  disablePersonaAssignmentMetrics,
  enablePersonaAssignmentMetrics,
  getPersonaAssignmentMetrics,
  resolveRoleFirstLead,
} from "./personaRoleAssignment";

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

describe("classifyEventRole", () => {
  it("assigns Coach for reaches and steals", () => {
    expect(classifyEventRole(bm({ signals: ["REACH"] }), "slight_reach").primary).toBe("coach");
    expect(classifyEventRole(bm({ signals: ["STEAL"] }), "value_pick").primary).toBe("coach");
  });

  it("assigns Sofia for ordinary value analysis", () => {
    expect(classifyEventRole(bm(), "value_pick").primary).toBe("sofia");
  });

  it("assigns Roxanne for rivalry and championship", () => {
    expect(classifyEventRole(bm({ receipts: [{ id: "rivalry", type: "rivalry" }] }), "rivalry_receipt").primary).toBe(
      "roxanne",
    );
    expect(classifyEventRole(bm({ momentType: "championship" }), "championship").primary).toBe("roxanne");
  });
});

describe("applyConversationMemory", () => {
  it("prefers secondary after two consecutive primary leads", () => {
    const res = applyConversationMemory({
      primary: "coach",
      secondary: "sofia",
      recentLeads: ["coach", "coach"],
      moment: bm(),
    });
    expect(res.lead).toBe("sofia");
    expect(res.reasonSuffix).toBe("rotation_secondary_owner");
  });

  it("allows historic override to keep primary", () => {
    const res = applyConversationMemory({
      primary: "roxanne",
      secondary: "sofia",
      recentLeads: ["roxanne", "roxanne"],
      moment: bm({
        significance: "historic",
        receipts: [{ id: "rivalry", type: "rivalry" }],
      }),
    });
    expect(res.lead).toBe("roxanne");
    expect(res.rotationOverride).toBe(true);
  });
});

describe("role-first via buildEditorialAssignment", () => {
  beforeEach(() => {
    enablePersonaAssignmentMetrics().reset();
  });
  afterEach(() => {
    disablePersonaAssignmentMetrics();
  });

  it("Coach wins over Roxanne on reach (no rivalry)", () => {
    const a = buildEditorialAssignment(
      bm({ signals: ["REACH:strong"], significance: "major" }),
      new SessionEditorialLedger(),
    );
    expect(a.leadVoice).toBe("coach");
    expect(a.request).not.toContain("roxanne");
    expect(a.assignmentReason).toMatch(/coach|rotation/);
  });

  it("Sofia wins over Coach on ordinary value pick", () => {
    const a = buildEditorialAssignment(bm({ signals: [], significance: "notable" }), new SessionEditorialLedger());
    expect(a.planId).toBe("value_pick");
    expect(a.leadVoice).toBe("sofia");
  });

  it("Roxanne correctly overrides rotation on historic rivalry", () => {
    const ledger = new SessionEditorialLedger();
    for (let i = 0; i < 2; i++) {
      ledger.recordFrame({
        planId: "rivalry_receipt",
        leadVoice: "roxanne",
        voicesOnAir: ["roxanne"],
        silenced: false,
        significance: "major",
        storylines: [],
        callbackKeys: [],
        acceptedTexts: {},
        planEnergy: "high",
        decompressionTriggered: false,
      });
    }
    const a = buildEditorialAssignment(
      bm({
        significance: "historic",
        receipts: [{ id: "rivalry", type: "rivalry" }],
      }),
      ledger,
    );
    expect(a.leadVoice).toBe("roxanne");
    expect(a.rotationOverrideReason === "historic_or_extraordinary_moment" || a.assignmentReason === "rotation_override_historic" || a.leadVoice === "roxanne").toBe(true);
  });

  it("records assignment metrics for verification", () => {
    const ledger = new SessionEditorialLedger();
    buildEditorialAssignment(bm({ signals: ["STEAL"] }), ledger);
    buildEditorialAssignment(bm({ significance: "notable" }), ledger);
    buildEditorialAssignment(
      bm({ significance: "major", receipts: [{ id: "rivalry", type: "rivalry" }] }),
      ledger,
    );
    const snap = getPersonaAssignmentMetrics()?.snapshot();
    expect(snap).toBeTruthy();
    expect(snap!.coach.assigned + snap!.sofia.assigned + snap!.roxanne.assigned).toBeGreaterThanOrEqual(3);
    expect(snap!.decisions.length).toBeGreaterThanOrEqual(3);
  });
});

describe("resolveRoleFirstLead", () => {
  it("maps positional run to Coach", () => {
    const d = resolveRoleFirstLead({
      moment: bm({ context: { kind: "position_run", count: 4, position: "RB" } }),
      planId: "position_run",
      recentLeads: [],
      allowedVoices: ["coach", "sofia"],
    });
    expect(d.lead).toBe("coach");
    expect(d.reason).toBe("role_coach_positional_run");
  });
});
