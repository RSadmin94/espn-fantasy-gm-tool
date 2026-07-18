/**
 * P3 live correction — football event ownership beats decorative rivalry receipts.
 * P4 thresholds are exercised but not modified.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyReach } from "../draftMoments/reachClassification";
import { buildEditorialAssignment, resolveEditorialPlanId } from "./broadcastEditorialRouting";
import { SessionEditorialLedger } from "./editorialLedger";
import type { BroadcastMoment } from "./broadcastMomentTypes";
import {
  applyConversationMemory,
  disablePersonaAssignmentMetrics,
  enablePersonaAssignmentMetrics,
  getPersonaAssignmentMetrics,
  hasSubstantiveRivalryEvidence,
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

const DECORATIVE_RIVALRY = [{ id: "rivalry", type: "rivalry" }] as const;
const SUBSTANTIVE_RIVALRY = [
  { id: "rivalry", type: "rivalry" },
  { id: "rivalryImpact", type: "rivalryImpact" },
] as const;

function reachMoment(input: {
  playerName: string;
  pickNumber: number;
  playerAdp: number;
  numberOfTeams?: number;
  rivalry?: "decorative" | "substantive" | "none";
}): BroadcastMoment {
  const teams = input.numberOfTeams ?? 14;
  const round = Math.ceil(input.pickNumber / teams);
  const reach = classifyReach({
    pickNumber: input.pickNumber,
    playerAdp: input.playerAdp,
    numberOfTeams: teams,
  });
  const rivalry =
    input.rivalry === "substantive"
      ? [...SUBSTANTIVE_RIVALRY]
      : input.rivalry === "decorative"
        ? [...DECORATIVE_RIVALRY]
        : [];
  const signal =
    reach.isReach && (reach.severity === "big" || reach.severity === "massive")
      ? "REACH:strong"
      : reach.isReach
        ? "REACH"
        : undefined;
  return bm({
    identity: {
      kind: "draft_pick",
      draftId: "live-like",
      pickNumber: input.pickNumber,
      pickId: `p${input.pickNumber}`,
    },
    significance: reach.isReach
      ? reach.severity === "massive"
        ? "historic"
        : reach.severity === "mild"
          ? "notable"
          : "major"
      : "notable",
    signals: signal ? [signal] : [],
    receipts: rivalry,
    reachClassification: reach,
    factPacket: {
      subject: {
        ownerName: "Rival Owner",
        playerName: input.playerName,
        position: "RB",
        overallPick: input.pickNumber,
        round,
      },
      verifiedFacts:
        input.rivalry === "substantive"
          ? [
              `Rival Owner selected ${input.playerName} at pick ${input.pickNumber}.`,
              "Championship rematch humiliation vs focal rival.",
            ]
          : [`Rival Owner selected ${input.playerName} at pick ${input.pickNumber}.`],
      entities: ["Rival Owner", input.playerName],
    },
  });
}

describe("P3 rivalry vs football event priority", () => {
  it("1. Mild reach + rivalry receipt → Coach", () => {
    // Javonte ~11 early, early phase → mild
    const m = reachMoment({
      playerName: "Javonte Williams",
      pickNumber: 20,
      playerAdp: 31,
      rivalry: "decorative",
    });
    expect(m.reachClassification?.severity).toBe("mild");
    expect(resolveEditorialPlanId(m)).toBe("slight_reach");
    const a = buildEditorialAssignment(m, new SessionEditorialLedger());
    expect(a.leadVoice).toBe("coach");
    expect(a.assignmentReason).toMatch(/primary_event_coach|rivalry_context_only|rotation/);
  });

  it("2. Big reach + rivalry receipt → Coach", () => {
    // Dallas Goedert ~20 early, early phase → big
    const m = reachMoment({
      playerName: "Dallas Goedert",
      pickNumber: 40,
      playerAdp: 60,
      rivalry: "decorative",
    });
    expect(m.reachClassification?.severity).toBe("big");
    expect(resolveEditorialPlanId(m)).toBe("major_reach");
    expect(buildEditorialAssignment(m, new SessionEditorialLedger()).leadVoice).toBe("coach");
  });

  it("3. Massive 25–39 + rivalry receipt → Coach", () => {
    // Tyler Shough 25 early, early phase → massive, personaOwner coach (<40)
    const m = reachMoment({
      playerName: "Tyler Shough",
      pickNumber: 50,
      playerAdp: 75,
      rivalry: "decorative",
    });
    expect(m.reachClassification?.severity).toBe("massive");
    expect(m.reachClassification?.personaOwner).toBe("coach");
    expect(m.reachClassification?.reachDelta).toBe(25);
    expect(buildEditorialAssignment(m, new SessionEditorialLedger()).leadVoice).toBe("coach");
  });

  it("4. 40+ outrageous reach + substantive rivalry → Roxanne eligible", () => {
    const m = reachMoment({
      playerName: "Outrage Pick",
      pickNumber: 10,
      playerAdp: 55,
      rivalry: "substantive",
    });
    expect(m.reachClassification?.severity).toBe("massive");
    expect(m.reachClassification?.personaOwner).toBe("roxanne");
    expect(m.reachClassification!.reachDelta).toBeGreaterThanOrEqual(40);
    expect(hasSubstantiveRivalryEvidence(m)).toBe(true);
    const a = buildEditorialAssignment(m, new SessionEditorialLedger());
    expect(a.leadVoice).toBe("roxanne");
  });

  it("5. Normal sub-threshold ADP difference + rivalry receipt does not become a reach", () => {
    // CMC ~3.4 early — normal under P4 early band
    const m = reachMoment({
      playerName: "Christian McCaffrey",
      pickNumber: 3,
      playerAdp: 6.4,
      rivalry: "decorative",
    });
    expect(m.reachClassification?.isReach).toBe(false);
    expect(m.reachClassification?.severity).toBe("normal");
    expect(m.signals.some((s) => s.startsWith("REACH"))).toBe(false);
    expect(resolveEditorialPlanId(m)).not.toMatch(/reach/);
    expect(resolveEditorialPlanId(m)).not.toBe("rivalry_receipt");
  });

  it("6. Ordinary value pick + rivalry context → Sofia", () => {
    const m = bm({
      significance: "notable",
      signals: [],
      receipts: [...DECORATIVE_RIVALRY],
    });
    const a = buildEditorialAssignment(m, new SessionEditorialLedger());
    expect(a.planId).toBe("value_pick");
    expect(a.leadVoice).toBe("sofia");
    expect(a.assignmentReason).toMatch(/primary_event_sofia|rivalry_context_only|rotation/);
  });

  it("7. Generic rivalry receipt does not trigger historic rotation override", () => {
    const res = applyConversationMemory({
      primary: "roxanne",
      secondary: "sofia",
      recentLeads: ["roxanne", "roxanne"],
      moment: bm({ significance: "major", receipts: [...DECORATIVE_RIVALRY] }),
    });
    expect(res.rotationOverride).toBe(false);
    expect(res.lead).toBe("sofia");
    expect(res.reasonSuffix).toBe("rotation_secondary_owner");
  });

  it("8. Substantive historic rivalry may override rotation", () => {
    const res = applyConversationMemory({
      primary: "roxanne",
      secondary: "sofia",
      recentLeads: ["roxanne", "roxanne"],
      moment: bm({
        significance: "historic",
        receipts: [...SUBSTANTIVE_RIVALRY],
        factPacket: {
          subject: { ownerName: "Alice", playerName: "Player", position: "WR", overallPick: 10, round: 1 },
          verifiedFacts: ["Head-to-head championship rematch."],
          entities: ["Alice", "Player"],
        },
      }),
    });
    expect(res.rotationOverride).toBe(true);
    expect(res.lead).toBe("roxanne");
    expect(res.reasonSuffix).toBe("rotation_override_historic");
  });

  it("9. Same persona does not exceed two ordinary consecutive speaking turns", () => {
    const ledger = new SessionEditorialLedger();
    const leads: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = buildEditorialAssignment(
        bm({
          identity: { kind: "draft_pick", draftId: "d", pickNumber: i + 1, pickId: `p${i}` },
          significance: "notable",
          signals: [],
        }),
        ledger,
      );
      if (a.silence) continue;
      leads.push(a.leadVoice);
      ledger.recordFrame({
        planId: a.planId,
        leadVoice: a.leadVoice,
        voicesOnAir: a.request,
        silenced: false,
        significance: "notable",
        storylines: [],
        callbackKeys: [],
        acceptedTexts: {},
        planEnergy: a.plan.energyLevel,
        decompressionTriggered: false,
      });
    }
    for (let i = 2; i < leads.length; i++) {
      if (leads[i] === leads[i - 1] && leads[i] === leads[i - 2]) {
        expect.fail(`persona ${leads[i]} exceeded two consecutive ordinary turns at index ${i}`);
      }
    }
  });

  it("12. Steals, runs, construction, and routine silence still behave correctly", () => {
    expect(buildEditorialAssignment(bm({ signals: ["STEAL"] }), new SessionEditorialLedger()).leadVoice).toBe(
      "coach",
    );
    expect(
      buildEditorialAssignment(
        bm({ context: { kind: "position_run", count: 3, position: "RB" }, significance: "major" }),
        new SessionEditorialLedger(),
      ).leadVoice,
    ).toBe("coach");
    expect(
      buildEditorialAssignment(bm({ signals: ["STARTER_NEED"], significance: "major" }), new SessionEditorialLedger())
        .leadVoice,
    ).toBe("coach");
    expect(buildEditorialAssignment(bm({ significance: "routine" }), new SessionEditorialLedger()).silence).toBe(true);
  });
});

describe("P3 rivalry-heavy live-like fixture (failed preview mix)", () => {
  beforeEach(() => {
    enablePersonaAssignmentMetrics().reset();
  });
  afterEach(() => {
    disablePersonaAssignmentMetrics();
  });

  /** Seeded moments modeled on the 14-team preview failure (decorative rivalry on football events). */
  function liveLikeFailedMix(): BroadcastMoment[] {
    return [
      reachMoment({ playerName: "Christian McCaffrey", pickNumber: 3, playerAdp: 6.4, rivalry: "decorative" }),
      reachMoment({ playerName: "Kenneth Walker", pickNumber: 14, playerAdp: 17, rivalry: "decorative" }),
      reachMoment({ playerName: "Javonte Williams", pickNumber: 20, playerAdp: 31, rivalry: "decorative" }),
      reachMoment({ playerName: "Dallas Goedert", pickNumber: 40, playerAdp: 60, rivalry: "decorative" }),
      reachMoment({ playerName: "Rhamondre Stevenson", pickNumber: 80, playerAdp: 90, rivalry: "decorative" }),
      reachMoment({ playerName: "Justin Herbert", pickNumber: 85, playerAdp: 95, rivalry: "decorative" }),
      reachMoment({ playerName: "Tyler Shough", pickNumber: 50, playerAdp: 75, rivalry: "decorative" }),
      // Ordinary analysis opportunities (must reach Sofia)
      bm({
        identity: { kind: "draft_pick", draftId: "live-like", pickNumber: 25, pickId: "p25" },
        significance: "notable",
        signals: [],
        receipts: [...DECORATIVE_RIVALRY],
        factPacket: {
          subject: { ownerName: "Rival Owner", playerName: "Value WR", position: "WR", overallPick: 25, round: 2 },
          verifiedFacts: ["Rival Owner selected Value WR at pick 25."],
          entities: ["Rival Owner", "Value WR"],
        },
      }),
      bm({
        identity: { kind: "draft_pick", draftId: "live-like", pickNumber: 30, pickId: "p30" },
        significance: "notable",
        signals: [],
        receipts: [...DECORATIVE_RIVALRY],
      }),
      bm({
        identity: { kind: "draft_pick", draftId: "live-like", pickNumber: 35, pickId: "p35" },
        significance: "notable",
        signals: ["STEAL"],
        receipts: [...DECORATIVE_RIVALRY],
      }),
      // One substantive entertainment moment
      bm({
        identity: { kind: "draft_pick", draftId: "live-like", pickNumber: 100, pickId: "p100" },
        significance: "historic",
        receipts: [...SUBSTANTIVE_RIVALRY],
        factPacket: {
          subject: { ownerName: "Rival Owner", playerName: "Lore RB", position: "RB", overallPick: 100, round: 8 },
          verifiedFacts: ["Dynasty championship rematch vs focal rival."],
          entities: ["Rival Owner", "Lore RB"],
        },
      }),
      // Silence
      bm({
        identity: { kind: "draft_pick", draftId: "live-like", pickNumber: 110, pickId: "p110" },
        significance: "routine",
        receipts: [...DECORATIVE_RIVALRY],
      }),
    ];
  }

  it("10. Rivalry-heavy fixture does not starve Sofia and Coach", () => {
    const metrics = enablePersonaAssignmentMetrics();
    metrics.reset();
    const ledger = new SessionEditorialLedger();
    const moments = liveLikeFailedMix();
    const speaking: { player: string; lead: string; plan: string; reason?: string; severity?: string }[] = [];
    const leads: string[] = [];

    for (const m of moments) {
      const a = buildEditorialAssignment(m, ledger);
      if (a.silence) continue;
      const player = m.factPacket.subject.playerName;
      speaking.push({
        player,
        lead: a.leadVoice,
        plan: a.planId,
        reason: a.assignmentReason,
        severity: m.reachClassification?.severity,
      });
      leads.push(a.leadVoice);
      ledger.recordFrame({
        planId: a.planId,
        leadVoice: a.leadVoice,
        voicesOnAir: a.request,
        silenced: false,
        significance: m.significance,
        storylines: m.storylines,
        callbackKeys: m.callbackKeys ?? [],
        acceptedTexts: {},
        planEnergy: a.plan.energyLevel,
        decompressionTriggered: false,
      });
    }

    const snap = getPersonaAssignmentMetrics()!.snapshot();
    const sofia = snap.sofia.assigned;
    const coach = snap.coach.assigned;
    const roxanne = snap.roxanne.assigned;
    const total = sofia + coach + roxanne;

    // eslint-disable-next-line no-console
    console.log("\n========== P3 LIVE-LIKE FIXTURE (after) ==========");
    // eslint-disable-next-line no-console
    console.log({
      before: { sofia: 0, coach: 2, roxanne: 8, maxRoxanneStreak: 5 },
      after: {
        sofia,
        coach,
        roxanne,
        sofiaPct: total ? Math.round((1000 * sofia) / total) / 10 : 0,
        coachPct: total ? Math.round((1000 * coach) / total) / 10 : 0,
        roxannePct: total ? Math.round((1000 * roxanne) / total) / 10 : 0,
        maxStreak: maxStreak(leads),
      },
      speaking,
    });
    // eslint-disable-next-line no-console
    console.log("=================================================\n");

    expect(sofia).toBeGreaterThanOrEqual(1);
    // Coach owns mild/big/sub-40 reach events; rotation may briefly hand to Sofia after ≤2 Coach turns.
    for (const row of speaking) {
      if (row.severity === "mild" || row.severity === "big" || (row.severity === "massive" && row.player === "Tyler Shough")) {
        expect(row.plan).toMatch(/reach/);
        expect(row.lead).not.toBe("roxanne");
        if (row.lead === "sofia") {
          expect(row.reason).toBe("rotation_secondary_owner");
        } else {
          expect(row.lead).toBe("coach");
        }
      }
      if (row.severity === "normal") {
        expect(row.plan).not.toMatch(/reach/);
      }
    }
    // Roxanne streak ≤ 2 consecutive turns in this fixture
    expect(maxPersonaStreak(leads, "roxanne")).toBeLessThanOrEqual(2);
    expect(maxStreak(leads)).toBeLessThanOrEqual(2);

    // Roxanne only leads substantive entertainment
    for (const row of speaking) {
      if (row.lead === "roxanne") {
        expect(row.plan === "rivalry_receipt" || row.plan === "hall_of_fame" || row.plan === "championship" || row.plan === "historic_reach").toBe(
          true,
        );
      }
    }

    // Named corrected ownership
    const byPlayer = Object.fromEntries(speaking.map((s) => [s.player, s]));
    expect(byPlayer["Javonte Williams"]?.lead).toBe("coach");
    expect(byPlayer["Dallas Goedert"]?.lead).toBe("coach");
    expect(byPlayer["Tyler Shough"]?.lead).toBe("coach");
  });
});

function maxStreak(leads: readonly string[]): number {
  let best = 0;
  let cur = 0;
  let prev = "";
  for (const v of leads) {
    if (v === prev) cur += 1;
    else {
      prev = v;
      cur = 1;
    }
    if (cur > best) best = cur;
  }
  return best;
}

function maxPersonaStreak(leads: readonly string[], voice: string): number {
  let best = 0;
  let cur = 0;
  for (const v of leads) {
    if (v === voice) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}
