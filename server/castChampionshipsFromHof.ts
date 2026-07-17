/**
 * Cast championship counts from Hall of Fame leaderboard (same source as /league/history).
 * Match by stable ownerKey GUID — never by display name.
 */

import { memberIdFromOwnerKey } from "./db";
import { canonicalOwnerKeyForMemberId } from "./ownerProfileService";
import type { TrophyLite } from "./leagueDnaProfile";

export type HofChampionshipLeaderboardRow = {
  ownerKey: string;
  displayName: string;
  titles: number;
  titleSeasons: number[];
};

export type CastPastChampion = {
  memberId: string;
  ownerKey: string;
  ownerName: string;
  championships: number;
  championshipYears: number[];
};

function trophyLiteFromRow(row: HofChampionshipLeaderboardRow): TrophyLite {
  return {
    championships: row.titles,
    championshipYears: [...row.titleSeasons].sort((a, b) => a - b),
    runnerUps: 0,
    thirdPlaceFinishes: 0,
  };
}

/**
 * Build per-memberId trophy map for `buildLeagueDnaProfile` / Cast badges.
 * Resolves each member through canonical ownerKey remap, then HoF leaderboard.
 */
export function trophyByMemberFromHofLeaderboard(args: {
  leaderboard: HofChampionshipLeaderboardRow[];
  memberIds: string[];
  ownerKeyRemap?: ReadonlyMap<string, string>;
}): Map<string, TrophyLite> {
  const remap = args.ownerKeyRemap ?? new Map<string, string>();
  const byOwnerKey = new Map(args.leaderboard.map((r) => [r.ownerKey, r]));
  const out = new Map<string, TrophyLite>();

  for (const memberId of args.memberIds) {
    const ownerKey = canonicalOwnerKeyForMemberId(memberId, remap);
    const row =
      (ownerKey ? byOwnerKey.get(ownerKey) : undefined) ??
      byOwnerKey.get(`id:${memberId}`) ??
      args.leaderboard.find((r) => memberIdFromOwnerKey(r.ownerKey) === memberId);
    if (row && row.titles > 0) {
      out.set(memberId, trophyLiteFromRow(row));
    }
  }
  return out;
}

/** Titles for one cast member via ownerKey / memberId GUID match. */
export function hofTitlesForMember(args: {
  leaderboard: HofChampionshipLeaderboardRow[];
  memberId: string;
  ownerKey: string;
}): { championships: number; championshipYears: number[] } {
  const row =
    args.leaderboard.find((r) => r.ownerKey === args.ownerKey) ??
    args.leaderboard.find((r) => memberIdFromOwnerKey(r.ownerKey) === args.memberId);
  if (!row) return { championships: 0, championshipYears: [] };
  return {
    championships: row.titles,
    championshipYears: [...row.titleSeasons].sort((a, b) => a - b),
  };
}

/**
 * Departed champions: HoF title holders whose ownerKey/memberId is not in the current league.
 */
export function pastChampionsFromHofLeaderboard(args: {
  leaderboard: HofChampionshipLeaderboardRow[];
  currentMemberIds: ReadonlySet<string>;
  currentOwnerKeys: ReadonlySet<string>;
}): CastPastChampion[] {
  return args.leaderboard
    .filter((r) => r.titles >= 1)
    .filter((r) => {
      if (args.currentOwnerKeys.has(r.ownerKey)) return false;
      const mid = memberIdFromOwnerKey(r.ownerKey);
      if (mid && args.currentMemberIds.has(mid)) return false;
      return true;
    })
    .map((r) => {
      const memberId = memberIdFromOwnerKey(r.ownerKey) ?? r.ownerKey;
      return {
        memberId,
        ownerKey: r.ownerKey,
        ownerName: r.displayName,
        championships: r.titles,
        championshipYears: [...r.titleSeasons].sort((a, b) => a - b),
      };
    })
    .sort((a, b) => b.championships - a.championships || a.ownerName.localeCompare(b.ownerName));
}
