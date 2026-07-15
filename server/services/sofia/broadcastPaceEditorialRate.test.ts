import { describe, expect, it } from "vitest";
import {
  BROADCAST_PACE_MOMENT_CONFIG,
  DEFAULT_MOMENT_CONFIG,
  LEGACY_MOMENT_CONFIG,
} from "../draftMoments/draftMomentTypes";
import { buildBroadcastPaceDraftMoments } from "./shadowDraftSources";
import { draftMomentToBroadcastMoment } from "./broadcastMomentBridge";
import { buildEditorialAssignment, resolveEditorialPlanId } from "./broadcastEditorialRouting";
import { SessionEditorialLedger } from "./editorialLedger";
import { applyLiveDraftWrittenEligibility } from "./liveDraftWrittenFloor";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";

const CERT_SEEDS = ["cert-seed-a", "cert-seed-b", "cert-seed-c"] as const;

export function measureCommentaryRate(moments: DraftMoment[], opts: { applyWrittenEligibility?: boolean } = {}) {
  const ledger = new SessionEditorialLedger();
  let commented = 0;
  let silenced = 0;
  const plans: Record<string, number> = {};
  const leads: Record<string, number> = {};
  let roxanneOrdinary = 0;
  let earlyRoutinePromoted = 0;

  for (const raw of moments) {
    const m = opts.applyWrittenEligibility ? applyLiveDraftWrittenEligibility(raw) : raw;
    if (
      raw.level === "routine" &&
      raw.round <= 3 &&
      m.level !== "routine" &&
      m.commentaryBudget.enabled
    ) {
      earlyRoutinePromoted += 1;
    }
    const bm = draftMomentToBroadcastMoment(m);
    const planId = resolveEditorialPlanId(bm);
    plans[planId] = (plans[planId] ?? 0) + 1;
    const a = buildEditorialAssignment(bm, ledger);
    if (a.silence) silenced++;
    else {
      commented++;
      if (a.leadVoice) leads[a.leadVoice] = (leads[a.leadVoice] ?? 0) + 1;
      if (
        a.leadVoice === "roxanne" &&
        planId !== "rivalry_receipt" &&
        planId !== "rivalry_trade" &&
        planId !== "playoff_upset" &&
        planId !== "championship" &&
        planId !== "historic_reach" &&
        planId !== "hall_of_fame" &&
        planId !== "breaking_news" &&
        planId !== "keeper_surprise"
      ) {
        roxanneOrdinary += 1;
      }
    }
    ledger.recordFrame({
      planId,
      leadVoice: a.leadVoice,
      voicesOnAir: a.request.filter((v) => v !== "silence"),
      silenced: a.silence,
      significance: m.level,
      storylines: [],
      callbackKeys: [],
      acceptedTexts: {},
      planEnergy: "low",
      decompressionTriggered: false,
    });
  }

  const total = moments.length;
  return {
    total,
    commented,
    silenced,
    silenceRate: total > 0 ? silenced / total : 0,
    commentRate: total > 0 ? commented / total : 0,
    plans,
    leads,
    nonRoutine: moments.filter((m) => m.level !== "routine").length,
    earlyRoutinePromoted,
    roxanneOrdinary,
  };
}

describe("broadcast pace editorial rate (168-pick fixture)", () => {
  it("broadcast pace yields 15–25% commentary across three certification seeds", () => {
    const brisk = measureCommentaryRate(
      buildBroadcastPaceDraftMoments(CERT_SEEDS[0], LEGACY_MOMENT_CONFIG),
    );
    const multi = CERT_SEEDS.map((seed) => ({
      seed,
      stats: measureCommentaryRate(buildBroadcastPaceDraftMoments(seed)),
    }));

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ brisk, broadcast: multi }));

    for (const { seed, stats } of multi) {
      expect(stats.total).toBe(168);
      // Evidence-backed editorial intelligence band (silence ≥ 75%).
      expect(stats.commentRate).toBeGreaterThanOrEqual(0.15);
      expect(stats.commentRate).toBeLessThanOrEqual(0.25);
      expect(stats.silenceRate).toBeGreaterThanOrEqual(0.75);
      expect(stats.nonRoutine).toBeGreaterThanOrEqual(10);
      expect(Object.keys(stats.leads).length).toBeGreaterThan(0);
      expect(seed).toBeTruthy();
    }

    expect(multi[0]!.stats).toEqual(multi[2]!.stats);
    expect(brisk.commented).toBeLessThanOrEqual(multi[0]!.stats.commented);
  });

  it("brisk/turbo config stays more selective than broadcast pace", () => {
    const broadcast = measureCommentaryRate(buildBroadcastPaceDraftMoments("pace-compare"));
    const brisk = measureCommentaryRate(
      buildBroadcastPaceDraftMoments("pace-compare", DEFAULT_MOMENT_CONFIG),
    );
    const turbo = measureCommentaryRate(
      buildBroadcastPaceDraftMoments("pace-compare", LEGACY_MOMENT_CONFIG),
    );
    expect(broadcast.commented).toBeGreaterThanOrEqual(10);
    expect(broadcast.commented).toBeGreaterThan(turbo.commented);
    expect(brisk.commented).toBeLessThanOrEqual(broadcast.commented);
    expect(turbo.commented).toBeLessThanOrEqual(brisk.commented);
  });

  it("identical seed yields identical editorial distribution", () => {
    const a = measureCommentaryRate(buildBroadcastPaceDraftMoments("replay-42"));
    const b = measureCommentaryRate(buildBroadcastPaceDraftMoments("replay-42"));
    expect(a).toEqual(b);
  });

  it("live written eligibility: no early-round force promotion, no ordinary Roxanne, no written_notable", () => {
    const turbo = measureCommentaryRate(
      buildBroadcastPaceDraftMoments("persona-gate", LEGACY_MOMENT_CONFIG),
      { applyWrittenEligibility: true },
    );
    expect(turbo.earlyRoutinePromoted).toBe(0);
    expect(turbo.roxanneOrdinary).toBe(0);
    expect(turbo.plans.written_notable ?? 0).toBe(0);
    expect(turbo.silenceRate).toBeGreaterThanOrEqual(0.75);
    expect(turbo.commentRate).toBeLessThanOrEqual(0.25);
  });
});
