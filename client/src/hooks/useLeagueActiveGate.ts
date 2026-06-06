import { useMemo } from "react";
import { useAuth, useUser } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";

export type LeagueActiveGate = {
  /** Client-only React Query cache salt; ESPN league id when `getActive` has loaded. */
  leagueContextKey: string;
  authLoaded: boolean;
  userLoaded: boolean;
  isSignedIn: boolean;
};

/**
 * Minimal hook: `league.getActive` + stable `leagueContextKey` for query cache salt.
 * Use on pages that should not mount the full `useLeagueContext()` dependency graph.
 */
export function useLeagueActiveGate() {
  const { isLoaded: authLoaded, isSignedIn: isSignedInRaw } = useAuth();
  const isSignedIn = Boolean(isSignedInRaw);
  const { isLoaded: userLoaded } = useUser();

  const activeQ = trpc.league.getActive.useQuery(undefined, {
    enabled: Boolean(authLoaded && userLoaded && isSignedIn),
    staleTime: 5 * 60_000,
    refetchOnMount: false,
  });

  const leagueContextKey = useMemo(() => {
    if (!authLoaded || !userLoaded) return "__auth_pending__";
    if (!isSignedIn) return "__signed_out__";
    const lid = activeQ.data?.leagueId?.trim();
    if (lid) return lid;
    if (activeQ.isLoading) return "__active_loading__";
    if (activeQ.isFetched) return "__no_active_league__";
    return "__active_unknown__";
  }, [
    authLoaded,
    userLoaded,
    isSignedIn,
    activeQ.data?.leagueId,
    activeQ.isLoading,
    activeQ.isFetched,
  ]);

  return { leagueContextKey, authLoaded, userLoaded, isSignedIn, activeQ };
}
