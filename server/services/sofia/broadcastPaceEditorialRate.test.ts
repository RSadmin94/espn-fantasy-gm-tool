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
import type { DraftMoment } from "../draftMoments/draftMomentTypes";

const CERT_SEEDS = ["cert-seed-a", "cert-seed-b", "cert-seed-c"] as const;

export function measureCommentaryRate(moments: DraftMoment[]) {
  const ledger = new SessionEditorialLedger();
  let commented = 0;
  let silenced = 0;
  const plans: Record<string, number> = {};
  const leads: Record<string, number> = {};

  for (const m of moments) {
    const bm = draftMomentToBroadcastMoment(m);
    const planId = resolveEditorialPlanId(bm);
    plans[planId] = (plans[planId] ?? 0) + 1;
    const a = buildEditorialAssignment(bm, ledger);
    if (a.silence) silenced++;
    else {
      commented++;
      if (a.leadVoice) leads[a.leadVoice] = (leads[a.leadVoice] ?? 0) + 1;
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
  };
}

describe("broadcast pace editorial rate (168-pick fixture)", () => {
  it("broadcast pace yields 10–15 meaningful moments across three certification seeds", () => {
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
      expect(stats.commented).toBeGreaterThanOrEqual(10);
      expect(stats.commented).toBeLessThanOrEqual(15);
      expect(stats.nonRoutine).toBeGreaterThanOrEqual(10);
      expect(Object.keys(stats.leads).length).toBeGreaterThan(0);
      expect(seed).toBeTruthy();
    }

    expect(multi[0]!.stats).toEqual(multi[2]!.stats);
    expect(brisk.commented).toBeLessThan(multi[0]!.stats.commented);
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
});
