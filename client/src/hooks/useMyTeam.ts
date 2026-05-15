/**
 * useMyTeam — deterministic ESPN team identity hook.
 *
 * Returns the user's explicitly claimed ESPN team from the espn_team_ownership
 * table. Falls back to name-based matching only when no claim exists (beta
 * compatibility for existing users who haven't gone through the claim flow yet).
 *
 * Usage:
 *   const { myTeamId, myMemberId, isClaimed, isLoading } = useMyTeam();
 *   const isMyTeam = (teamId: number) => myTeamId === teamId;
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export interface MyTeamInfo {
  /** The ESPN integer team ID (1–14). null if not yet claimed. */
  myTeamId: number | null;
  /** The ESPN member GUID (e.g. "{A1B2C3...}"). null if not yet claimed. */
  myMemberId: string | null;
  /** The claimed team name (e.g. "Atlantas Finest"). null if not yet claimed. */
  myTeamName: string | null;
  /** The owner display name from ESPN. null if not yet claimed. */
  myOwnerDisplayName: string | null;
  /** True if the user has explicitly claimed their team via the onboarding picker. */
  isClaimed: boolean;
  /** True while the query is loading. */
  isLoading: boolean;
  /**
   * Convenience function: returns true if the given ESPN teamId belongs to
   * the current user. Falls back to name-based matching when no claim exists.
   */
  isMyTeam: (teamId: number, teamName?: string, ownerName?: string) => boolean;
}

export function useMyTeam(season?: number): MyTeamInfo {
  const { user } = useAuth();

  const query = trpc.identity.getMyTeam.useQuery(
    { season: season ?? 2025 },
    { enabled: !!user, staleTime: 5 * 60_000 }
  );

  return useMemo(() => {
    const claim = query.data;
    const myTeamId = claim?.espnTeamId ?? null;
    const myMemberId = claim?.espnMemberId ?? null;
    const myTeamName = claim?.teamName ?? null;
    const myOwnerDisplayName = claim?.ownerDisplayName ?? null;
    const isClaimed = !!claim;

    const isMyTeam = (teamId: number, teamName?: string, ownerName?: string): boolean => {
      // Deterministic path: use the claimed teamId
      if (isClaimed && myTeamId !== null) {
        return myTeamId === teamId;
      }
      // Fallback: name-based matching for users who haven't claimed yet
      if (!user) return false;
      const userName = user.name?.toLowerCase() ?? "";
      if (!userName) return false;
      const firstName = userName.split(" ")[0];
      if (teamName) {
        const tn = teamName.toLowerCase();
        if (tn.includes(firstName) || (userName.split(" ")[1] && tn.includes(userName.split(" ")[1]))) return true;
      }
      if (ownerName) {
        const on = ownerName.toLowerCase();
        if (on.includes(firstName) || (userName.split(" ")[1] && on.includes(userName.split(" ")[1]))) return true;
      }
      return false;
    };

    return {
      myTeamId,
      myMemberId,
      myTeamName,
      myOwnerDisplayName,
      isClaimed,
      isLoading: query.isLoading,
      isMyTeam,
    };
  }, [query.data, query.isLoading, user]);
}
