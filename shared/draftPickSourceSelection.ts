import {
  draftPickNameIsBlank,
  espnPlayerIdKey,
  type DraftPickIdentityFields,
} from "./draftPickIdentity";
import { isEspnDefensePlayerId } from "./espnDefenseIdentity";

export type DraftPickIdentityCoverage = {
  total: number;
  resolved: number;
  withPlayerId: number;
  unresolved: number;
  resolutionPct: number;
};

export function draftPickHasPlayerId(p: DraftPickIdentityFields): boolean {
  return espnPlayerIdKey(p.playerId) != null || isEspnDefensePlayerId(p.playerId);
}

export function draftPickHasIdentity(p: DraftPickIdentityFields): boolean {
  return !draftPickNameIsBlank(p.playerName) || draftPickHasPlayerId(p);
}

export function draftPickIdentityCoverage(
  picks: DraftPickIdentityFields[],
): DraftPickIdentityCoverage {
  let resolved = 0;
  let withPlayerId = 0;
  for (const p of picks) {
    if (!draftPickNameIsBlank(p.playerName)) resolved += 1;
    if (draftPickHasPlayerId(p)) withPlayerId += 1;
  }
  const total = picks.length;
  return {
    total,
    resolved,
    withPlayerId,
    unresolved: total - resolved,
    resolutionPct: total > 0 ? Math.round((resolved / total) * 1000) / 10 : 100,
  };
}

/** ESPN dynasty order ledger: slots exist but every row lacks a resolvable player identity. */
export function isPlaceholderDraftLedger(
  picks: DraftPickIdentityFields[],
  minRows = 8,
): boolean {
  if (picks.length < minRows) return false;
  return draftPickIdentityCoverage(picks).resolved === 0;
}

export function pickIdentityScore(picks: DraftPickIdentityFields[]): number {
  const cov = draftPickIdentityCoverage(picks);
  return cov.resolved * 1000 + cov.withPlayerId;
}

export type OverlayableDraftPick = DraftPickIdentityFields & {
  overallPickNumber?: number | null;
  overallPick?: number | null;
  draftedForAnalytics?: boolean;
  keeper?: boolean;
  reservedForKeeper?: boolean;
  keeperSlot?: boolean;
  retained?: boolean;
  isKeeper?: boolean;
};

function overallOf(p: OverlayableDraftPick): number {
  const n = Number(p.overallPickNumber ?? p.overallPick ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Copy player identity onto blank rows from a donor source matched by overall pick.
 * Does not copy keeper / draftedForAnalytics / slot classification.
 */
export function overlayDraftPickIdentities<T extends OverlayableDraftPick>(
  base: T[],
  donors: OverlayableDraftPick[],
): T[] {
  const donorByOverall = new Map<number, OverlayableDraftPick>();
  for (const donor of donors) {
    const overall = overallOf(donor);
    if (overall <= 0 || !draftPickHasIdentity(donor)) continue;
    const existing = donorByOverall.get(overall);
    if (!existing || pickIdentityScore([donor]) > pickIdentityScore([existing])) {
      donorByOverall.set(overall, donor);
    }
  }
  return base.map((row) => {
    if (draftPickHasIdentity(row)) return row;
    const donor = donorByOverall.get(overallOf(row));
    if (!donor) return row;
    return {
      ...row,
      playerId: donor.playerId ?? row.playerId,
      playerName: draftPickNameIsBlank(donor.playerName) ? row.playerName : donor.playerName,
      position: donor.position ?? row.position,
    };
  });
}

/** Ambiguous roster membership must never assign a draft-slot identity. */
export function rosterCannotAssignDraftIdentity(
  pick: DraftPickIdentityFields,
  rosterCandidates: DraftPickIdentityFields[],
): boolean {
  if (draftPickHasIdentity(pick)) return false;
  return rosterCandidates.length !== 1;
}
