/**
 * Phase 4 seeded reach before/after report (classification only).
 * Run: npx vitest run server/services/draftMoments/reachClassification.seeded.report.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import { buildBroadcastPaceDraftMoments } from "../sofia/shadowDraftSources";
import { draftMomentToBroadcastMoment } from "../sofia/broadcastMomentBridge";
import { buildEditorialAssignment } from "../sofia/broadcastEditorialRouting";
import { SessionEditorialLedger } from "../sofia/editorialLedger";
import { BROADCAST_PACE_MOMENT_CONFIG, DEFAULT_MOMENT_CONFIG } from "./draftMomentTypes";
import { classifyReach } from "./reachClassification";

/** Pre-P4 REACH rule (broadcast pace config) for before counts. */
function oldIsReach(adpDelta: number | null, round: number, config = BROADCAST_PACE_MOMENT_CONFIG): boolean {
  if (adpDelta == null || adpDelta >= 0) return false;
  return round <= config.adp.maxRound && Math.abs(adpDelta) >= config.adp.moderateDelta;
}

describe("Phase 4 seeded reach before/after report", () => {
  const report: Record<string, unknown> = {};

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log("\n========== PHASE 4 REACH CLASSIFICATION REPORT ==========");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    // eslint-disable-next-line no-console
    console.log("=========================================================\n");
  });

  it("broadcast-pace 168-pick fixture before/after", () => {
    const moments = buildBroadcastPaceDraftMoments("p4-reach", BROADCAST_PACE_MOMENT_CONFIG);

    let before = 0;
    let after = 0;
    const severity: Record<string, number> = { mild: 0, big: 0, massive: 0 };
    let coachReach = 0;
    let roxanneReach = 0;
    const demoted: { pick: number; player: string; early: number; round: number }[] = [];
    const ledger = new SessionEditorialLedger();

    for (const m of moments) {
      const adp = m.player.adp;
      const legacyDelta = adp == null ? null : m.overallPick - adp;
      const wasReach = oldIsReach(legacyDelta, m.round, BROADCAST_PACE_MOMENT_CONFIG);
      if (wasReach) before++;

      const reach = m.reach ?? classifyReach({
        pickNumber: m.overallPick,
        playerAdp: adp,
        round: m.round,
        numberOfTeams: 14,
      });

      if (reach.isReach) {
        after++;
        severity[reach.severity] = (severity[reach.severity] ?? 0) + 1;
        const bm = draftMomentToBroadcastMoment(m);
        const a = buildEditorialAssignment(bm, ledger);
        if (!a.silence) {
          if (a.leadVoice === "coach") coachReach++;
          if (a.leadVoice === "roxanne") roxanneReach++;
        }
        ledger.recordFrame({
          planId: a.planId,
          leadVoice: a.leadVoice,
          voicesOnAir: a.request,
          silenced: a.silence,
          significance: m.level,
          storylines: [],
          callbackKeys: [],
          acceptedTexts: {},
          planEnergy: "medium",
          decompressionTriggered: false,
        });
      } else if (wasReach && legacyDelta != null) {
        demoted.push({
          pick: m.overallPick,
          player: m.player.playerName,
          early: -legacyDelta,
          round: m.round,
        });
      }
    }

    report.broadcastPace168 = {
      beforeReachEvents: before,
      afterReachEvents: after,
      severityCounts: severity,
      coachReachAssignments: coachReach,
      roxanneReachAssignments: roxanneReach,
      previouslyReachNowNormal: demoted,
    };

    expect(after).toBeLessThanOrEqual(before);
    expect(demoted.length).toBeGreaterThanOrEqual(0);
  });

  it("synthetic draft shows false reaches demoted under new thresholds", () => {
    // Old broadcast-pace: |delta|>=3 in R1–12 = reach. New early: need 8+.
    const samples = [
      { pick: 5, adp: 8, round: 1, label: "3 early — was reach, now normal" },
      { pick: 5, adp: 12, round: 1, label: "7 early — was reach, now normal" },
      { pick: 5, adp: 13, round: 1, label: "8 early — mild both eras (old+new)" },
      { pick: 100, adp: 108, round: 9, label: "8 early middle — old reach, now normal (<10)" },
      { pick: 100, adp: 110, round: 9, label: "10 early middle — mild new" },
      { pick: 180, adp: 192, round: 14, label: "12 early late — old no (past maxRound), new normal" },
      { pick: 10, adp: 50, round: 1, label: "40 early — massive Roxanne" },
      { pick: 10, adp: 40, round: 1, label: "30 early — massive Coach" },
    ];

    const demoted: string[] = [];
    const severity: Record<string, number> = {};
    let coach = 0;
    let roxanne = 0;
    let before = 0;
    let after = 0;

    for (const s of samples) {
      const legacyDelta = s.pick - s.adp;
      const was = oldIsReach(legacyDelta, s.round, BROADCAST_PACE_MOMENT_CONFIG);
      if (was) before++;
      const reach = classifyReach({
        pickNumber: s.pick,
        playerAdp: s.adp,
        round: s.round,
        numberOfTeams: 14,
      });
      if (reach.isReach) {
        after++;
        severity[reach.severity] = (severity[reach.severity] ?? 0) + 1;
        if (reach.personaOwner === "coach") coach++;
        if (reach.personaOwner === "roxanne") roxanne++;
      } else if (was) {
        demoted.push(`${s.label} (pick ${s.pick}, ADP ${s.adp})`);
      }
    }

    report.syntheticFalseReachDemotion = {
      beforeReachEvents: before,
      afterReachEvents: after,
      severityCounts: severity,
      coachReachAssignments: coach,
      roxanneReachAssignments: roxanne,
      previouslyReachNowNormal: demoted,
    };

    expect(demoted.length).toBeGreaterThanOrEqual(2);
    expect(after).toBeLessThan(before);
  });
});
