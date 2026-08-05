/**
 * RFSN Draft Night Show Engine — first consumer of League Context.
 * Builds awards + summary facts; does not generate persona lines.
 */

import { computeOwnerDraftMetrics, type DraftNightPickInput } from "../../../shared/draftNightGrading";
import type { MockPickLike } from "../draftMoments/draftMomentReceiptService";
import { normName } from "../draftMoments/draftMomentReceiptService";
import type { HistoricalContext } from "./historicalContext";
import { passesAirRule } from "./historicalContext";
import {
  type DraftNightShowResult,
  type PressureCandidate,
  buildDraftNightShow,
} from "./draftNightAwards";
import {
  type LeagueContextSnapshot,
  findChampionshipForOwner,
  rivalryForOwner,
  getOrLoadLeagueContextCache,
} from "./leagueContextCache";
import { collectHistoricalContexts } from "./historicalPatterns";
import type { BroadcastMoment } from "../sofia/broadcastMomentTypes";
import { draftMomentToBroadcastMoment } from "../sofia/broadcastMomentBridge";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";

/** Locked picks may carry ADP from the live notify path. */
export type DraftNightLockedPick = MockPickLike & { adp?: number | null };

export type DraftNightShowPayload = DraftNightShowResult & {
  generatedAt: string;
  totalPicks: number;
  teamCount: number;
};

function picksToInputs(
  picks: readonly DraftNightLockedPick[],
  adpByName: Map<string, number>,
): DraftNightPickInput[] {
  return picks.map((p) => {
    const fromPick = p.adp != null && Number.isFinite(Number(p.adp)) ? Number(p.adp) : null;
    const fromMap = adpByName.get(normName(p.playerName));
    return {
      teamId: String(p.teamId),
      ownerName: p.ownerName,
      playerName: p.playerName,
      position: String(p.position ?? "?"),
      overallPick: p.overall,
      round: p.round,
      adp: fromPick ?? (fromMap != null ? fromMap : null),
      marketValue: null,
    };
  });
}

function syntheticMomentForOwner(
  leagueId: string,
  draftId: string,
  owner: { ownerName: string; teamId: string; letter: string },
  samplePick: DraftNightLockedPick | undefined,
): BroadcastMoment {
  const stub: DraftMoment = {
    eventId: `draft-night:${draftId}:${owner.teamId}`,
    leagueId,
    draftId,
    overallPick: samplePick?.overall ?? 1,
    round: samplePick?.round ?? 1,
    roundPick: 1,
    owner: {
      teamId: owner.teamId,
      ownerId: null,
      ownerName: owner.ownerName,
      identityScope: "franchise",
      identitySource: "draft-night",
    },
    player: {
      playerId: samplePick ? `p:${samplePick.overall}` : "p:0",
      playerName: samplePick?.playerName ?? "—",
      position: String(samplePick?.position ?? "WR"),
      nflTeam: null,
      adp: samplePick?.adp ?? null,
    },
    rosterBeforePick: {},
    receipts: [],
    signals: ["DRAFT_NIGHT"],
    level: "major",
    permittedClaims: [],
    forbiddenClaimCategories: [],
    primaryStoryline: "DRAFT_NIGHT_SHOW",
    secondaryStoryline: null,
    commentaryBudget: { enabled: false, maxSentences: 0, maxWords: 0 },
    validation: { valid: true, errors: [], warnings: [] },
  };
  return draftMomentToBroadcastMoment(stub, { momentType: "draft_night_context" });
}

function collectEvidenceForOwners(
  leagueId: string,
  draftId: string,
  owners: ReturnType<typeof computeOwnerDraftMetrics>,
  picks: readonly DraftNightLockedPick[],
  snapshot: LeagueContextSnapshot,
): Map<string, HistoricalContext[]> {
  const map = new Map<string, HistoricalContext[]>();
  for (const o of owners) {
    const sample = picks.find((p) => String(p.teamId) === o.teamId);
    const moment = syntheticMomentForOwner(leagueId, draftId, o, sample);
    const all = collectHistoricalContexts(moment, snapshot);
    map.set(
      o.ownerName.trim().toLowerCase(),
      all.filter((c) => passesAirRule(c) || c.confidence >= 0.85),
    );
  }
  return map;
}

function buildPressureCandidates(
  owners: ReturnType<typeof computeOwnerDraftMetrics>,
  snapshot: LeagueContextSnapshot,
): PressureCandidate[] {
  return owners.map((o) => {
    const champ = findChampionshipForOwner(snapshot, o.ownerName);
    const riv = rivalryForOwner(snapshot, o.ownerName);
    return {
      ownerName: o.ownerName,
      ownerKey: o.ownerKey,
      championshipTitles: champ?.titles ?? 0,
      titleSeasons: champ?.titleSeasons ?? [],
      playoffEliminationsInflicted: riv?.playoffEliminations ?? 0,
      h2hRecord: riv?.h2hRecord,
      draftLetter: o.letter,
      rawScore: o.rawScore,
    };
  });
}

/**
 * Build the Draft Night Show from locked picks + league context snapshot.
 * Uses only pick ADP + live `adpByName` — never seed shadow/sample story ADP
 * (that fabricated Mahomes/Olave sleeper/reach awards across unrelated drafts).
 */
export function buildDraftNightShowFromPicks(args: {
  leagueId: string;
  draftId: string;
  picks: readonly DraftNightLockedPick[];
  teamCount: number;
  snapshot: LeagueContextSnapshot;
  adpByName?: Map<string, number>;
}): DraftNightShowPayload {
  const adp = new Map<string, number>();
  if (args.adpByName) {
    for (const [k, v] of args.adpByName) {
      if (v != null && Number.isFinite(Number(v))) adp.set(k, Number(v));
    }
  }
  const inputs = picksToInputs(args.picks, adp);
  const adpAvailable = inputs.some((p) => p.adp != null && Number.isFinite(Number(p.adp)));
  const owners = computeOwnerDraftMetrics(inputs);
  const evidenceByOwner = collectEvidenceForOwners(
    args.leagueId,
    args.draftId,
    owners,
    args.picks,
    args.snapshot,
  );
  const pressureCandidates = buildPressureCandidates(owners, args.snapshot);
  const show = buildDraftNightShow({
    owners,
    evidenceByOwner,
    pressureCandidates,
    adpAvailable,
  });

  return {
    ...show,
    generatedAt: new Date().toISOString(),
    totalPicks: args.picks.length,
    teamCount: args.teamCount,
  };
}

export async function buildDraftNightShowForSession(args: {
  leagueId: string;
  draftId: string;
  picks: readonly DraftNightLockedPick[];
  teamCount: number;
  userId?: number | null;
  adpByName?: Map<string, number>;
}): Promise<DraftNightShowPayload> {
  const snapshot = await getOrLoadLeagueContextCache({
    leagueId: args.leagueId,
    draftId: args.draftId,
    userId: args.userId,
  });
  return buildDraftNightShowFromPicks({
    leagueId: args.leagueId,
    draftId: args.draftId,
    picks: args.picks,
    teamCount: args.teamCount,
    snapshot,
    adpByName: args.adpByName,
  });
}

/** Merge award facts into wrap-up verifiedFacts (evidence only). */
export function awardFactsForWrapUp(show: DraftNightShowPayload): string[] {
  const facts = show.awards.map((a) => `[${a.title}] ${a.fact}`);
  for (const s of show.suppressed) {
    if (s.awardType === "biggest_mistake") facts.push(s.reason);
  }
  return facts;
}
