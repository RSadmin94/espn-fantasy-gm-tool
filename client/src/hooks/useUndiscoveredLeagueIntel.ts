import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";

export type UndiscoveredIntelItem = {
  id: string;
  label: string;
  count: number;
  href: string;
  /** Which authority produced this count (shown in dev-friendly tooltips only if needed). */
  source: string;
};

/**
 * Counts for "What You Haven't Discovered Yet" — each figure comes from an
 * existing read-only authority; never estimated or fabricated.
 */
export function useUndiscoveredLeagueIntel() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const scoresQ = (trpc as any).rivalry.getScores.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { enabled: ready, staleTime: 60_000 },
  );
  const ownerListQ = trpc.owners.ownerList.useQuery(
    withLeagueSalt({ expectedLeagueId: leagueContextKey }, leagueContextKey),
    { enabled: ready, staleTime: 60_000 },
  );
  const hofQ = trpc.espn.hallOfFame.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 60_000,
  });
  const cachedQ = trpc.espn.cachedSeasons.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 60_000,
  });

  const tradeSeasons = useMemo(() => {
    const touched = hofQ.data?.coverage?.seasonsTouched ?? [];
    if (touched.length > 0) return [...touched].sort((a, b) => a - b);
    const cached = cachedQ.data ?? [];
    if (cached.length > 0) return [...cached].sort((a, b) => a - b);
    return [new Date().getFullYear()];
  }, [hofQ.data?.coverage?.seasonsTouched, cachedQ.data]);

  const notoriousQ = (trpc as any).completedTradeIntel.notoriousTradesReport.useQuery(
    withLeagueSalt({ leagueId: leagueContextKey, seasons: tradeSeasons }, leagueContextKey),
    { enabled: ready && tradeSeasons.length > 0, staleTime: 60_000 },
  );

  const items = useMemo((): UndiscoveredIntelItem[] => {
    const out: UndiscoveredIntelItem[] = [];

    const rivalryStories = Number((scoresQ.data as { totalRivalries?: number } | undefined)?.totalRivalries ?? 0);
    if (rivalryStories > 0) {
      out.push({
        id: "rivalry-stories",
        label: "Rivalry Stories",
        count: rivalryStories,
        href: "/rivalry-center",
        source: "rivalry.getScores.totalRivalries",
      });
    }

    const historicTrades =
      (notoriousQ.data as { tradeCount?: number; rankedByMargin?: unknown[] } | undefined)?.tradeCount ??
      notoriousQ.data?.rankedByMargin?.length ??
      0;
    if (historicTrades > 0) {
      out.push({
        id: "historic-trades",
        label: "Historic Trades",
        count: historicTrades,
        href: "/hall-of-fame#archive-trades",
        source: "completedTradeIntel.notoriousTradesReport.rankedByMargin",
      });
    }

    const championshipReports = ownerListQ.data?.allOwners?.length ?? 0;
    if (championshipReports > 0) {
      out.push({
        id: "championship-reports",
        label: "Championship Reports",
        count: championshipReports,
        href: "/why-havent-i-won",
        source: "owners.ownerList.allOwners",
      });
    }

    const activeProfiles = ownerListQ.data?.active?.length ?? 0;
    const alumniProfiles = ownerListQ.data?.graveyard?.length ?? 0;
    const gmProfiles = activeProfiles + alumniProfiles;
    if (gmProfiles > 0) {
      out.push({
        id: "gm-profiles",
        label: "GM Profiles",
        count: gmProfiles,
        href: "/owner-profiles",
        source: "owners.ownerList.active + graveyard",
      });
    }

    return out;
  }, [scoresQ.data, notoriousQ.data, ownerListQ.data]);

  const isLoading =
    scoresQ.isLoading || ownerListQ.isLoading || hofQ.isLoading || notoriousQ.isLoading;

  return { items, isLoading, ready };
}
