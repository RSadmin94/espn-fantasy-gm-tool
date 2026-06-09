/**
 * Single source of truth for the authenticated user's focal ESPN owner identity
 * (active league connection + selected team / owner key). Cached per user.
 */
import { memCache } from "./memCache";
import { resolveActiveProfile, memberIdFromOwnerKey } from "./db";

export type CurrentOwnerResolved = {
  /** Bare ESPN member id (`id:` prefix stripped). Null when not setup or missing key. */
  ownerId: string | null;
  /** Raw `selectedOwnerKey` from league_connections (often `id:{guid}`). */
  ownerKey: string | null;
  displayName: string | null;
  franchiseName: string | null;
  leagueId: string | null;
  leagueName: string | null;
  teamId: number | null;
  selectedSeason: number | null;
  isSetupComplete: boolean;
};

function emptyCurrentOwner(): CurrentOwnerResolved {
  return {
    ownerId: null,
    ownerKey: null,
    displayName: null,
    franchiseName: null,
    leagueId: null,
    leagueName: null,
    teamId: null,
    selectedSeason: null,
    isSetupComplete: false,
  };
}

function fromActiveProfile(p: Awaited<ReturnType<typeof resolveActiveProfile>>): CurrentOwnerResolved {
  if (!p.isSetupComplete) {
    return {
      ownerId: null,
      ownerKey: p.selectedOwnerKey,
      displayName: p.selectedOwnerName,
      franchiseName: p.selectedFranchiseName,
      leagueId: p.leagueId,
      leagueName: p.leagueName,
      teamId: p.selectedTeamId,
      selectedSeason: p.selectedSeason,
      isSetupComplete: false,
    };
  }
  return {
    ownerId: memberIdFromOwnerKey(p.selectedOwnerKey),
    ownerKey: p.selectedOwnerKey,
    displayName: p.selectedOwnerName,
    franchiseName: p.selectedFranchiseName,
    leagueId: p.leagueId,
    leagueName: p.leagueName,
    teamId: p.selectedTeamId,
    selectedSeason: p.selectedSeason,
    isSetupComplete: true,
  };
}

/**
 * Resolve the current user's focal owner row (one `resolveActiveProfile` read, TTL-cached).
 */
export async function resolveCurrentOwner(
  user: { id: number } | null | undefined,
): Promise<CurrentOwnerResolved> {
  if (!user?.id) return emptyCurrentOwner();
  const uid = user.id;
  return memCache(`currentOwner:${uid}`, 60 * 60_000, async () => {
    const p = await resolveActiveProfile({ id: uid });
    return fromActiveProfile(p);
  });
}
