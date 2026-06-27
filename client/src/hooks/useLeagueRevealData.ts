import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";

export type LeagueRevealCard = {
  id: string;
  label: string;
  value: string;
  detail: string;
  empty?: boolean;
};

function normalizeOwnerKey(key: string | null | undefined): string {
  if (!key) return "";
  return key.replace(/^\{?id:\{?/i, "").replace(/\}?\}?$/, "").trim().toUpperCase();
}

function firstNameFromDisplay(name: string | null | undefined): string | null {
  const t = name?.trim();
  if (!t) return null;
  return t.split(/\s+/)[0] ?? null;
}

export function useLeagueRevealData(enabled: boolean) {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const { leagueId } = useLeagueContext();
  const ready = Boolean(
    enabled && authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );

  const ownerHomeQ = trpc.me.ownerHome.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 60_000,
  });
  const hofQ = trpc.espn.hallOfFame.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 60_000,
  });
  const ownerListQ = trpc.owners.ownerList.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 60_000,
  });
  const discoverQ = trpc.espn.discoverLeagueHistory.useQuery(withLeagueSalt({}, leagueContextKey), {
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

  const isLoading =
    ownerHomeQ.isLoading ||
    hofQ.isLoading ||
    ownerListQ.isLoading ||
    discoverQ.isLoading ||
    notoriousQ.isLoading;

  const cards = useMemo((): LeagueRevealCard[] => {
    const oh = ownerHomeQ.data;
    const discover = discoverQ.data;
    const synced =
      discover?.syncedSeasons?.length ??
      (cachedQ.data?.length ? cachedQ.data.length : 0);
    const available = discover?.availableSeasons?.length ?? synced;
    const seasonsCount = synced > 0 ? synced : available;
    const seasonsLabel =
      seasonsCount > 0
        ? String(seasonsCount)
        : "—";
    const seasonsDetail =
      seasonsCount > 0
        ? discover?.detectedStartYear
          ? `From ${discover.detectedStartYear} through ${discover?.syncedSeasons?.[0] ?? cachedQ.data?.[0] ?? "today"}`
          : `${seasonsCount} season${seasonsCount === 1 ? "" : "s"} in your sync cache`
        : "Sync more seasons on Sync Data to deepen your league story.";

    const focal = oh?.owner;
    const pr = (ownerListQ.data?.powerRankings ?? []) as Array<{ rank: number; ownerKey: string }>;
    let legacyPrimary = "—";
    let legacySecondary = "Finish setup to personalize";
    if (focal?.ownerKey && pr.length > 0) {
      const target = normalizeOwnerKey(focal.ownerKey);
      const row = pr.find((r) => normalizeOwnerKey(r.ownerKey) === target);
      if (row) {
        legacyPrimary = `#${row.rank}`;
        legacySecondary = `of ${pr.length} managers`;
      }
    }
    const gmName =
      firstNameFromDisplay(focal?.displayName) ||
      focal?.franchiseName?.trim() ||
      "Your GM profile";
    const career = oh?.careerRecord;
    const careerLine = career
      ? `${career.wins}–${career.losses} career · ${Number(career.winPct).toFixed(1)}%`
      : oh?.threat?.isSetupComplete === false
        ? "Select your team in Settings to personalize"
        : "Profile builds as matchup history syncs";

    const rival = oh?.rival;
    const rivalryValue = rival?.rivalName?.trim() || "—";
    const rivalryDetail = rival
      ? [
          rival.heatLabel ? `${rival.heatLabel} heat` : null,
          rival.h2hWins != null && rival.h2hLosses != null
            ? `You ${rival.h2hWins}–${rival.h2hLosses}${rival.h2hTies ? `–${rival.h2hTies}` : ""}`
            : null,
          rival.loreSentence,
        ]
          .filter(Boolean)
          .join(" · ") || "Your top feud by rivalry score"
      : "Rivalries appear after synced head-to-head history";

    const leader = hofQ.data?.championships?.leaderboard?.[0];
    const championValue = leader?.displayName?.trim() || "—";
    const titleSeasons = leader?.titleSeasons ?? [];
    const titles = leader?.titles ?? titleSeasons.length;
    const championDetail =
      titles > 0
        ? titles >= 2
          ? `${titles} titles — dynasty footprint in this league`
          : `${titles} title${titles === 1 ? "" : "s"} · ${leader?.titleSeasons?.slice(-3).join(", ") ?? "champion"}`
        : "Championship medals import with league history sync";

    const gap = notoriousQ.data?.biggestValueGap;
    const tradeValue = gap
      ? `${gap.sideA?.ownerName ?? "Side A"} vs ${gap.sideB?.ownerName ?? "Side B"}`
      : "—";
    const tradeDetail = gap
      ? `Biggest value gap: +${Math.round(gap.margin)} points`
      : (notoriousQ.data as { tradeCount?: number; rankedByMargin?: unknown[] } | undefined)?.tradeCount ??
          notoriousQ.data?.rankedByMargin?.length
        ? "Completed trades on file — open League History for the full ledger"
        : "Notorious trades appear after completed ESPN trades sync";

    return [
      {
        id: "seasons",
        label: "Seasons analyzed",
        value: seasonsLabel,
        detail: seasonsDetail,
        empty: seasonsCount === 0,
      },
      {
        id: "gm",
        label: "Your GM profile",
        value: gmName,
        detail: [legacyPrimary !== "—" ? `Legacy rank ${legacyPrimary} (${legacySecondary})` : null, careerLine]
          .filter(Boolean)
          .join(" · "),
        empty: !focal,
      },
      {
        id: "rivalry",
        label: "Biggest rivalry",
        value: rivalryValue,
        detail: rivalryDetail,
        empty: !rival,
      },
      {
        id: "champion",
        label: "League champion",
        value: championValue,
        detail: championDetail,
        empty: !leader,
      },
      {
        id: "trade",
        label: "Notorious trade",
        value: tradeValue,
        detail: tradeDetail,
        empty: !gap,
      },
    ];
  }, [
    ownerHomeQ.data,
    ownerListQ.data?.powerRankings,
    discoverQ.data,
    cachedQ.data,
    hofQ.data?.championships?.leaderboard,
    notoriousQ.data,
  ]);

  return {
    isLoading,
    isError: ownerHomeQ.isError || hofQ.isError,
    cards,
    leagueId,
  };
}
