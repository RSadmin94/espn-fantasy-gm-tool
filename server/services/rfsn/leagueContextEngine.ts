/**
 * RFSN-005 — League Context Engine (Sprint 9 Phase 1).
 * Produces HistoricalContext only — never commentary.
 * Additive enrich of BroadcastMoment before editorial routing.
 */

import type { BroadcastMoment } from "../sofia/broadcastMomentTypes";
import { shareContextForVoices, sharedFactsForVerifiedPacket } from "./analystExchange";
import {
  type HistoricalContext,
  DEFAULT_CONFIDENCE_THRESHOLD,
  passesAirRule,
} from "./historicalContext";
import { shouldTriggerHistoricalContext } from "./historicalTrigger";
import { collectHistoricalContexts } from "./historicalPatterns";
import {
  type LeagueContextSnapshot,
  getOrLoadLeagueContextCache,
  getLeagueContextCache,
} from "./leagueContextCache";
import {
  type LeagueContextDebug,
  isLeagueContextDebugEnabled,
} from "./leagueContextDebug";
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
  debug: LeagueContextDebug;
};

function buildDebug(
  moment: BroadcastMoment,
  all: HistoricalContext[],
  aired: HistoricalContext[],
  benched: HistoricalContext[],
  opts: { confidenceThreshold?: number; userIdPresent: boolean },
): LeagueContextDebug {
  const Tc = opts.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const eligible = all.filter((c) => c.confidence >= Tc);
  const pickNumber =
    moment.identity.kind === "draft_pick" ? moment.identity.pickNumber : null;
  return {
    owner: moment.factPacket.subject.ownerName,
    pickNumber,
    factsFound: all.length,
    factsEligible: eligible.length,
    factsAired: aired.length,
    typesFound: [...new Set(all.map((c) => c.narrativeType))],
    typesAired: [...new Set(aired.map((c) => c.narrativeType))],
    sampleAired: aired.map((c) => c.fact).slice(0, 3),
    sampleBenched: benched.map((c) => c.fact).slice(0, 3),
    userIdPresent: opts.userIdPresent,
  };
}

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
    userIdPresent?: boolean;
  },
): EnrichLeagueContextResult {
  const userIdPresent = Boolean(opts.userIdPresent);
  if (!shouldTriggerHistoricalContext(moment.significance)) {
    return {
      moment,
      aired: [],
      benched: [],
      all: [],
      debug: buildDebug(moment, [], [], [], {
        confidenceThreshold: opts.confidenceThreshold,
        userIdPresent,
      }),
    };
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

  return {
    moment: enriched,
    aired,
    benched,
    all,
    debug: buildDebug(moment, all, aired, benched, {
      confidenceThreshold: opts.confidenceThreshold,
      userIdPresent,
    }),
  };
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
    userIdPresent: opts.userId != null,
  });
}

/** Alias matching the locked build-spec call site name. */
export const leagueContextEngine = { enrich, enrichMomentWithSnapshot };

export { isLeagueContextDebugEnabled };
export type { LeagueContextDebug };
