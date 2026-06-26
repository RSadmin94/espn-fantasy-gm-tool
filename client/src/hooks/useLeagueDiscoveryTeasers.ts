import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";

export type LeagueDiscoveryTeaserId =
  | "gm-profile"
  | "biggest-rivalry"
  | "league-history"
  | "trade-analyzer"
  | "notorious-trades";

function firstNameFromDisplay(name: string | null | undefined): string | null {
  const t = name?.trim();
  if (!t) return null;
  return t.split(/\s+/)[0] ?? null;
}

export function useLeagueDiscoveryTeasers() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const ownerHomeQ = trpc.me.ownerHome.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 60_000,
  });
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
    withLeagueSalt(
      {
        leagueId: leagueContextKey,
        seasons: tradeSeasons,
      },
      leagueContextKey,
    ),
    {
      enabled: ready && tradeSeasons.length > 0,
      staleTime: 60_000,
    },
  );

  const teasers = useMemo((): Partial<Record<LeagueDiscoveryTeaserId, string>> => {
    const out: Partial<Record<LeagueDiscoveryTeaserId, string>> = {};
    const oh = ownerHomeQ.data;
    const focal = oh?.owner;
    const gmName = firstNameFromDisplay(focal?.displayName) || focal?.franchiseName?.trim();
    const career = oh?.careerRecord;
    if (gmName && career) {
      out["gm-profile"] = `${gmName} · ${career.wins}–${career.losses} career`;
    } else if (gmName) {
      out["gm-profile"] = gmName;
    }

    const rival = oh?.rival;
    if (rival?.rivalName?.trim()) {
      const h2h =
        rival.h2hWins != null && rival.h2hLosses != null
          ? `You ${rival.h2hWins}–${rival.h2hLosses}${rival.h2hTies ? `–${rival.h2hTies}` : ""}`
          : null;
      out["biggest-rivalry"] = [firstNameFromDisplay(rival.rivalName) || rival.rivalName, rival.heatLabel, h2h]
        .filter(Boolean)
        .join(" · ");
    }

    const leader = hofQ.data?.championships?.leaderboard?.[0];
    if (leader?.displayName?.trim() && (leader.titles ?? 0) > 0) {
      const titles = leader.titles ?? leader.titleSeasons?.length ?? 0;
      out["league-history"] = `${leader.displayName} leads with ${titles} title${titles === 1 ? "" : "s"}`;
    }

    const ranked = notoriousQ.data?.rankedByMargin?.length ?? 0;
    if (ranked > 0) {
      out["trade-analyzer"] = `${ranked} completed trade${ranked === 1 ? "" : "s"} on file`;
    }

    const gap = notoriousQ.data?.biggestValueGap;
    if (gap) {
      const a = gap.sideA?.ownerName?.trim() || "Side A";
      const b = gap.sideB?.ownerName?.trim() || "Side B";
      out["notorious-trades"] = `${a} vs ${b} · +${Math.round(gap.margin)} value gap`;
    }

    return out;
  }, [ownerHomeQ.data, hofQ.data?.championships?.leaderboard, notoriousQ.data]);

  return {
    teasers,
    isLoading: ownerHomeQ.isLoading || hofQ.isLoading || notoriousQ.isLoading,
  };
}
