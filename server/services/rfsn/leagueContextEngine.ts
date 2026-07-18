/**
 * RFSN-005 — League Context Engine (Sprint 9 Phase 1).
 * Produces HistoricalContext only — never commentary.
 * Additive enrich of BroadcastMoment before editorial routing.
 */

import type { BroadcastMoment } from "../sofia/broadcastMomentTypes";
import { shareContextForVoices, sharedFactsForVerifiedPacket } from "./analystExchange";
import {
  type HistoricalContext,
  passesAirRule,
} from "./historicalContext";
import { shouldTriggerHistoricalContext } from "./historicalTrigger";
import { collectHistoricalContexts } from "./historicalPatterns";
import {
  type LeagueContextSnapshot,
  getOrLoadLeagueContextCache,
  getLeagueContextCache,
} from "./leagueContextCache";
import { recordAiredStoryThreads } from "./storyThreads";

export type EnrichLeagueContextOpts = {
  leagueId: string;
  draftId: string;
  userId?: number | null;
  /** Injected snapshot (tests) — skips I/O. */
  snapshot?: LeagueContextSnapshot;
  confidenceThreshold?: number;
  heatThreshold?: number;
};

export type EnrichLeagueContextResult = {
  moment: BroadcastMoment;
  aired: HistoricalContext[];
  benched: HistoricalContext[];
  all: HistoricalContext[];
};

/**
 * Pure enrich against an already-loaded snapshot.
 */
export function enrichMomentWithSnapshot(
  moment: BroadcastMoment,
  snapshot: LeagueContextSnapshot,
  opts: {
    leagueId: string;
    draftId: string;
    confidenceThreshold?: number;
    heatThreshold?: number;
  },
): EnrichLeagueContextResult {
  if (!shouldTriggerHistoricalContext(moment.significance)) {
    return { moment, aired: [], benched: [], all: [] };
  }

  const all = collectHistoricalContexts(moment, snapshot);
  const thresholds = {
    confidence: opts.confidenceThreshold,
    heat: opts.heatThreshold,
  };
  const aired = all.filter((c) => passesAirRule(c, thresholds));
  const benched = all.filter((c) => !passesAirRule(c, thresholds));

  const shared = shareContextForVoices({ aired, benched });
  const extraFacts = sharedFactsForVerifiedPacket(shared);

  // Deduplicate facts already present
  const existing = new Set(moment.factPacket.verifiedFacts.map((f) => f.trim()));
  const toAdd = extraFacts.filter((f) => f.trim() && !existing.has(f.trim()));

  const enriched: BroadcastMoment = {
    ...moment,
    factPacket: {
      ...moment.factPacket,
      verifiedFacts: [...moment.factPacket.verifiedFacts, ...toAdd],
    },
    leagueContext: aired,
  };

  const pickNumber =
    moment.identity.kind === "draft_pick" ? moment.identity.pickNumber : null;

  recordAiredStoryThreads({
    leagueId: opts.leagueId,
    draftId: opts.draftId,
    ownerName: moment.factPacket.subject.ownerName,
    pickNumber,
    contexts: aired,
  });

  return { moment: enriched, aired, benched, all };
}

/**
 * Primary integration entry: after moment build, before editorial routing.
 */
export async function enrich(moment: BroadcastMoment, opts: EnrichLeagueContextOpts): Promise<EnrichLeagueContextResult> {
  const snapshot =
    opts.snapshot ??
    getLeagueContextCache(opts.leagueId, opts.draftId) ??
    (await getOrLoadLeagueContextCache({
      leagueId: opts.leagueId,
      draftId: opts.draftId,
      userId: opts.userId,
    }));

  return enrichMomentWithSnapshot(moment, snapshot, {
    leagueId: opts.leagueId,
    draftId: opts.draftId,
    confidenceThreshold: opts.confidenceThreshold,
    heatThreshold: opts.heatThreshold,
  });
}

/** Alias matching the locked build-spec call site name. */
export const leagueContextEngine = { enrich, enrichMomentWithSnapshot };
