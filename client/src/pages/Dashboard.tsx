import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth, useUser } from "@clerk/react-router";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { Skeleton } from "@/components/ui/skeleton";
import { IntelPageShell } from "@/components/layout";
import { type MarqueeTeam, type ScoreboardLite } from "@/components/dashboard/DashboardMatchupMarquee";
import { type TimelineChamp } from "@/components/dashboard/DashboardTimelineStrip";
import { WelcomeBackCoachHome } from "@/components/dashboard/welcomeBackCoach/WelcomeBackCoachHome";
import { GmBriefingPage } from "@/components/briefing/GmBriefingPage";
import { CuratedHome } from "@/components/home/CuratedHome";
import { Link } from "react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { V1 } from "@/lib/v1Copy";
import {
  buildAcquisitionHeadline,
  buildDraftMemo,
  buildDynastyLine,
  buildHofHeadline,
  buildPlayoffOutlook,
  countRecentTrades,
  seasonHasRealResults,
} from "@/lib/dashboardBriefingData";
import {
  buildExecutiveBriefing,
  buildIntelligenceBeatCandidates,
  detectSeasonPhase,
  selectIntelligenceTrio,
  stateOfTheWeekLine,
  thisWeekInHistoryLine,
} from "@/lib/welcomeBackCoachBriefing";

type NormalizedStanding = {
  teamId: number;
  teamName: string;
  ownerName: string;
  logoUrl?: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  rankFinal: number | null;
  playoffSeed: number | null;
  displayRank: number;
};

type StandingWithoutDisplayRank = Omit<NormalizedStanding, "displayRank">;

const CURRENT_YEAR = new Date().getFullYear();
const SEASONS_DESC = Array.from({ length: CURRENT_YEAR - 2009 + 1 }, (_, i) => CURRENT_YEAR - i);

const USE_GM_BRIEFING = import.meta.env.VITE_GM_BRIEFING_V2 !== "false";

const DASH_QUERY_OPTS = {
  staleTime: 5 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  gcTime: 10 * 60 * 1000,
} as const;

function num(n: number | undefined | null): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function pickNum(...vals: unknown[]): number {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function winPct(t: Pick<NormalizedStanding, "wins" | "losses" | "ties">): number {
  const w = num(t.wins);
  const l = num(t.losses);
  const ti = num(t.ties);
  const g = w + l + ti;
  return g > 0 ? (w + 0.5 * ti) / g : 0;
}

function compareRegular(a: StandingWithoutDisplayRank, b: StandingWithoutDisplayRank): number {
  const dPct = winPct(b) - winPct(a);
  if (Math.abs(dPct) > 1e-9) return dPct;
  return num(b.pointsFor) - num(a.pointsFor);
}

function compareFinal(a: StandingWithoutDisplayRank, b: StandingWithoutDisplayRank): number {
  const ra = a.rankFinal != null && Number.isFinite(a.rankFinal) ? a.rankFinal : 999;
  const rb = b.rankFinal != null && Number.isFinite(b.rankFinal) ? b.rankFinal : 999;
  if (ra !== rb) return ra - rb;
  return compareRegular(a, b);
}

function normalizeStandingRow(raw: unknown): Omit<NormalizedStanding, "displayRank"> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const teamId = pickNum(r.teamId, r.id);
  if (!Number.isFinite(teamId) || teamId <= 0) return null;
  const teamName = String(r.teamName ?? r.name ?? `Team ${teamId}`).trim() || `Team ${teamId}`;
  const ownerName = String(r.owners ?? r.ownerName ?? r.owner ?? "").trim();
  const wins = pickNum(r.wins);
  const losses = pickNum(r.losses);
  const ties = pickNum(r.ties);
  const pointsFor = pickNum(r.pointsFor, r.PF);
  const pointsAgainst = pickNum(r.pointsAgainst, r.PA);
  let rankFinal: number | null = null;
  for (const key of ["rankFinal", "rank", "standing"]) {
    const v = r[key];
    if (v != null && Number.isFinite(Number(v)) && Number(v) > 0) {
      rankFinal = Number(v);
      break;
    }
  }
  if (rankFinal == null) {
    const ps = r.playoffSeed;
    if (ps != null && Number.isFinite(Number(ps)) && Number(ps) > 0) {
      rankFinal = Number(ps);
    }
  }
  let playoffSeed: number | null = null;
  const psRaw = r.playoffSeed;
  if (psRaw != null && Number.isFinite(Number(psRaw)) && Number(psRaw) > 0) {
    playoffSeed = Number(psRaw);
  }
  const logoUrl = String(r.logoUrl ?? r.logo ?? "").trim();
  return {
    teamId,
    teamName,
    ownerName,
    wins,
    losses,
    ties,
    pointsFor,
    pointsAgainst,
    rankFinal,
    playoffSeed,
    logoUrl: logoUrl || undefined,
  };
}

function rankStandings(rows: Omit<NormalizedStanding, "displayRank">[]): NormalizedStanding[] {
  const sorted = [...rows].sort(compareFinal);
  return sorted.map((t, i) => ({ ...t, displayRank: i + 1 }));
}

function formatRecord(t: Pick<NormalizedStanding, "wins" | "losses" | "ties">): string {
  const ti = num(t.ties);
  return ti > 0 ? `${num(t.wins)}-${num(t.losses)}-${ti}` : `${num(t.wins)}-${num(t.losses)}`;
}

function firstNameFromDisplay(displayName: string | null | undefined): string {
  const s = displayName?.trim();
  if (!s) return "";
  return s.split(/\s+/)[0] ?? "";
}

type ScoreboardRow = {
  homeTeamId: number;
  awayTeamId: number;
  homeProjected: number | null;
  awayProjected: number | null;
  homeScore?: number;
  awayScore?: number;
  isCompleted?: boolean;
  home: { teamName: string; ownerName: string };
  away: { teamName: string; ownerName: string };
};

function findScoreboardMatchup(
  rows: readonly ScoreboardRow[] | undefined,
  a: number,
  b: number,
): ScoreboardRow | null {
  if (!rows?.length) return null;
  for (const m of rows) {
    const ids = [m.homeTeamId, m.awayTeamId];
    if (ids.includes(a) && ids.includes(b)) return m;
  }
  return null;
}

function toMarqueeTeam(t: NormalizedStanding): MarqueeTeam {
  return {
    teamId: t.teamId,
    teamName: t.teamName,
    ownerName: t.ownerName,
    displayRank: t.displayRank,
    wins: t.wins,
    losses: t.losses,
    logoUrl: t.logoUrl,
  };
}

export function Dashboard({ variant = "briefing" }: { variant?: "briefing" | "curated" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const espnConnected = searchParams.get("espnConnected") === "1";
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const leagueCtx = useLeagueContext();
  const utils = trpc.useUtils();
  const leagueKeyReady =
    authLoaded && isSignedIn && !leagueCtx.leagueContextKey.startsWith("__");

  const ownerHomeQ = trpc.me.ownerHome.useQuery(
    withLeagueSalt({}, leagueCtx.leagueContextKey),
    { ...DASH_QUERY_OPTS, enabled: authLoaded && !!isSignedIn },
  );
  const activeLeagueQ = trpc.league.getActive.useQuery(undefined, {
    ...DASH_QUERY_OPTS,
    staleTime: 5_000,
    refetchInterval: espnConnected ? 2_000 : false,
  });
  const cachedSeasonsQ = trpc.espn.cachedSeasons.useQuery(
    withLeagueSalt({}, leagueCtx.leagueContextKey),
    { ...DASH_QUERY_OPTS, staleTime: 60_000 },
  );
  const cachedSeasons = cachedSeasonsQ.data ?? [];

  const defaultSeason =
    cachedSeasons.length > 0 ? Math.max(...cachedSeasons) : Math.min(CURRENT_YEAR, 2026);
  const [season, setSeason] = useState(defaultSeason);

  useEffect(() => {
    if (leagueCtx.season > 0) setSeason(leagueCtx.season);
  }, [leagueCtx.season]);

  useEffect(() => {
    if (!espnConnected) return;
    const syncStatus = activeLeagueQ.data?.syncStatus;
    if (syncStatus === "ok") {
      void utils.me.ownerHome.invalidate();
      void utils.me.activeProfile.invalidate();
      void utils.rivalry.getScores.invalidate();
      void utils.espn.hallOfFame.invalidate();
      void utils.espn.cachedSeasons.invalidate();
      toast.success("Your league is connected and ready.");
      searchParams.delete("espnConnected");
      setSearchParams(searchParams, { replace: true });
      return;
    }
    if (syncStatus === "error") {
      toast.error("League sync failed. Open Sync Data to retry.");
      searchParams.delete("espnConnected");
      setSearchParams(searchParams, { replace: true });
    }
  }, [espnConnected, activeLeagueQ.data?.syncStatus, utils, searchParams, setSearchParams]);

  useEffect(() => {
    if (cachedSeasons.length > 0) {
      const maxS = Math.max(...cachedSeasons);
      setSeason((s) => (cachedSeasons.includes(s) ? s : maxS));
    }
  }, [cachedSeasons, leagueCtx.leagueContextKey]);

  const hofQ = trpc.espn.hallOfFame.useQuery(
    withLeagueSalt({}, leagueCtx.leagueContextKey),
    { ...DASH_QUERY_OPTS, staleTime: 60_000 },
  );

  const pulseQ = trpc.weeklyAssessment.leaguePulse.useQuery(
    withLeagueSalt({ season }, leagueCtx.leagueContextKey),
    { ...DASH_QUERY_OPTS, retry: false, staleTime: 30_000 },
  );

  const week = pulseQ.data?.week ?? 0;

  const scoreboardQ = trpc.espn.matchupsScoreboard.useQuery(
    withLeagueSalt({ season, week: week >= 1 ? week : 1 }, leagueCtx.leagueContextKey),
    {
      ...DASH_QUERY_OPTS,
      enabled: week >= 1 && pulseQ.isSuccess && !pulseQ.isFetching,
      staleTime: 30_000,
    },
  );

  const standingsQ = trpc.espn.standings.useQuery(
    withLeagueSalt({ season }, leagueCtx.leagueContextKey),
    { ...DASH_QUERY_OPTS, enabled: !leagueCtx.isLoading, staleTime: 60_000 },
  );

  const draftIntelQ = trpc.draftWarRoom.getDraftWarRoomData.useQuery(
    withLeagueSalt({ season: CURRENT_YEAR }, leagueCtx.leagueContextKey),
    {
      ...DASH_QUERY_OPTS,
      staleTime: 5 * 60 * 1000,
      enabled: leagueKeyReady && CURRENT_YEAR > 0,
    },
  );

  const dynastyLandscapeQ = trpc.dynasty.powerRankings.useQuery(
    withLeagueSalt({ season: CURRENT_YEAR }, leagueCtx.leagueContextKey),
    { ...DASH_QUERY_OPTS, staleTime: 60_000, enabled: leagueKeyReady },
  );

  const pulseTeams = (pulseQ.data?.teams ?? []) as Array<{
    teamId: number;
    teamName: string;
    ownerName: string;
    wins: number;
    losses: number;
    currentOpponentTeamId: number | null;
    playoffProbability: number;
    standingRank: number;
    memberIds?: string[];
  }>;

  const eventSeasons = useMemo(() => {
    const out: number[] = [];
    if (cachedSeasons.includes(season)) out.push(season);
    for (let y = season - 1; y >= season - 4 && y >= 2009; y--) {
      if (cachedSeasons.includes(y)) out.push(y);
    }
    return [...new Set(out)];
  }, [season, cachedSeasons]);

  const recentEventsQ = trpc.espn.recentLeagueTransactionEvents.useQuery(
    withLeagueSalt(
      { seasons: eventSeasons.length ? eventSeasons : [CURRENT_YEAR], limit: 12 },
      leagueCtx.leagueContextKey,
    ),
    {
      ...DASH_QUERY_OPTS,
      enabled: leagueKeyReady && eventSeasons.length > 0,
      staleTime: 45_000,
    },
  );

  const pulseOwnerMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of pulseTeams) {
      if (t.teamId > 0 && t.ownerName?.trim()) m.set(t.teamId, t.ownerName.trim());
    }
    return m;
  }, [pulseTeams]);

  const ranked = useMemo(() => {
    const raw = standingsQ.data;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const base = raw
      .map(normalizeStandingRow)
      .filter((r): r is NonNullable<typeof r> => r != null);
    const sorted = rankStandings(base);
    return sorted.map((t) => ({
      ...t,
      ownerName: pulseOwnerMap.get(t.teamId) || t.ownerName || t.teamName,
    }));
  }, [standingsQ.data, pulseOwnerMap]);

  const thisWeekOpponent = useMemo(() => {
    const my = leagueCtx.myTeamId;
    if (!my || !pulseTeams.length) return null;
    const mine = pulseTeams.find((t) => t.teamId === my);
    const oid = mine?.currentOpponentTeamId ?? null;
    if (oid == null) return null;
    const opp = pulseTeams.find((t) => t.teamId === oid);
    if (!opp) return null;
    return {
      teamId: oid,
      ownerName: opp.ownerName?.trim() || opp.teamName || "Opponent",
      teamName: opp.teamName?.trim() || "",
    };
  }, [leagueCtx.myTeamId, pulseTeams]);

  const scoreRows = scoreboardQ.data?.matchups as ScoreboardRow[] | undefined;

  const marqueePick = useMemo(() => {
    if (!ranked.length) return { a: null as NormalizedStanding | null, b: null as NormalizedStanding | null };
    let a: NormalizedStanding | null = null;
    let b: NormalizedStanding | null = null;
    if (leagueCtx.myTeamId) {
      a = ranked.find((t) => t.teamId === leagueCtx.myTeamId) ?? null;
      const p = pulseTeams.find((x) => x.teamId === leagueCtx.myTeamId);
      const oid = p?.currentOpponentTeamId ?? null;
      b = oid != null ? ranked.find((t) => t.teamId === oid) ?? null : null;
    }
    if (!a || !b) {
      const lead = ranked[0] ?? null;
      if (!lead) return { a: null, b: null };
      const p0 = pulseTeams.find((x) => x.teamId === lead.teamId);
      const oid = p0?.currentOpponentTeamId ?? null;
      a = lead;
      b = oid != null ? ranked.find((t) => t.teamId === oid) ?? null : null;
    }
    return { a, b };
  }, [ranked, pulseTeams, leagueCtx.myTeamId]);

  const boardLite = useMemo((): ScoreboardLite | null => {
    const { a, b } = marqueePick;
    if (!a || !b || !scoreRows?.length) return null;
    const r = findScoreboardMatchup(scoreRows, a.teamId, b.teamId);
    if (!r) return null;
    return {
      homeTeamId: r.homeTeamId,
      awayTeamId: r.awayTeamId,
      homeProjected: r.homeProjected,
      awayProjected: r.awayProjected,
    };
  }, [marqueePick, scoreRows]);

  const outlookPct = useMemo(() => {
    const { a } = marqueePick;
    if (!a) return null;
    const p = pulseTeams.find((x) => x.teamId === a.teamId);
    if (p == null || typeof p.playoffProbability !== "number" || !Number.isFinite(p.playoffProbability)) {
      return null;
    }
    return Math.round(p.playoffProbability);
  }, [marqueePick, pulseTeams]);

  const timelineRows = useMemo(() => {
    const hist = hofQ.data?.championships?.history;
    if (!Array.isArray(hist) || hist.length === 0) return [];
    return [...hist].sort((a, b) => a.season - b.season);
  }, [hofQ.data?.championships?.history]);

  const timelineChamps: TimelineChamp[] = useMemo(
    () =>
      timelineRows.map((row) => ({
        season: row.season,
        label:
          row.resolvedChampionDisplay?.trim() ||
          row.championTeam?.trim() ||
          "Not Yet Available",
        isCurrentSeason: row.season === season,
      })),
    [timelineRows, season],
  );

  const leagueName =
    activeLeagueQ.data?.leagueName?.trim() ||
    (leagueCtx.leagueId ? `League ${leagueCtx.leagueId}` : "Your league");

  const seasonsWithData = hofQ.data?.coverage?.seasonsTouched?.length ?? null;
  const ownerCount =
    ranked.length > 0 ? ranked.length : leagueCtx.teamCount > 0 ? leagueCtx.teamCount : null;

  const subtitleParts: string[] = [];
  if (seasonsWithData != null && seasonsWithData > 0) {
    subtitleParts.push(`${seasonsWithData} season${seasonsWithData === 1 ? "" : "s"}`);
  }
  if (ownerCount != null && ownerCount > 0) {
    subtitleParts.push(`${ownerCount} owner${ownerCount === 1 ? "" : "s"}`);
  }
  const subtitle =
    subtitleParts.length > 0 ? subtitleParts.join(" · ") : "Connect ESPN and sync to populate history";

  const hasRealResults = useMemo(
    () =>
      seasonHasRealResults({
        standings: ranked,
        scoreboardMatchups: scoreRows,
      }),
    [ranked, scoreRows],
  );

  const { isInSeason, isPreseason } = detectSeasonPhase({
    season,
    pulseComplete: !!pulseQ.data?.isSeasonComplete,
    pulseReady: pulseQ.isSuccess,
    hasRealResults,
  });

  const weekLabel =
    week >= 1 && !pulseQ.data?.isSeasonComplete
      ? `Season ${season} · Week ${week}`
      : pulseQ.data?.isSeasonComplete
        ? `Season ${season} · Final`
        : `Season ${season}`;

  const oh = ownerHomeQ.data;
  const focalOwner = oh?.owner;
  const welcomeName =
    user?.firstName?.trim() ||
    firstNameFromDisplay(user?.fullName) ||
    firstNameFromDisplay(focalOwner?.displayName) ||
    focalOwner?.franchiseName?.trim() ||
    focalOwner?.leagueName?.trim() ||
    "Manager";

  const hofLeader = hofQ.data?.championships?.leaderboard?.[0];
  const dynastyLine = buildDynastyLine(dynastyLandscapeQ.data);
  const draftMemo = buildDraftMemo(draftIntelQ.data as Record<string, unknown> | null | undefined);
  const hofHeadline = buildHofHeadline(hofLeader);
  const recentTradeCount = countRecentTrades(recentEventsQ.data);
  const acquisitionHeadline = buildAcquisitionHeadline(recentEventsQ.data);

  const myPulse = leagueCtx.myTeamId
    ? pulseTeams.find((t) => t.teamId === leagueCtx.myTeamId)
    : undefined;
  const playoffSpots = leagueCtx.playoffTeams > 0 ? leagueCtx.playoffTeams : 6;
  const playoffOutlook = buildPlayoffOutlook({
    standingRank: myPulse?.standingRank,
    playoffProbability: myPulse?.playoffProbability,
    playoffSpots,
  });

  const beatCandidates = useMemo(
    () =>
      buildIntelligenceBeatCandidates({
        isPreseason,
        week,
        ownerHome: oh,
        topRival: oh?.rival
          ? {
              rivalName: oh.rival.rivalName ?? undefined,
              loreSentence: oh.threat?.primary?.reason ?? undefined,
              heatLabel: oh.rival.heatLabel ?? undefined,
            }
          : null,
        dynastyLine,
        draftMemo,
        playoffOutlook,
        recentTradeCount,
        hofHeadline,
        acquisitionHeadline,
      }),
    [
      isPreseason,
      week,
      oh,
      dynastyLine,
      draftMemo,
      playoffOutlook,
      recentTradeCount,
      hofHeadline,
      acquisitionHeadline,
    ],
  );

  const executiveBriefing = useMemo(
    () =>
      buildExecutiveBriefing({
        isPreseason,
        isInSeason,
        welcomeName,
        weekLabel,
        week,
        opponentName: thisWeekOpponent?.ownerName,
        rivalName: oh?.rival?.rivalName,
        threatName: oh?.threat?.primary?.ownerName,
        dynastyLine,
        draftMemo,
        hofHeadline,
        candidates: beatCandidates,
      }),
    [
      isPreseason,
      isInSeason,
      welcomeName,
      weekLabel,
      thisWeekOpponent?.ownerName,
      oh?.rival?.rivalName,
      oh?.threat?.primary?.ownerName,
      dynastyLine,
      draftMemo,
      hofHeadline,
      beatCandidates,
    ],
  );

  const trio = useMemo(
    () => selectIntelligenceTrio(beatCandidates, executiveBriefing.action, isPreseason),
    [beatCandidates, executiveBriefing.action, isPreseason],
  );

  const stateLine = stateOfTheWeekLine({ isPreseason, isInSeason, weekLabel, leagueName });
  const thisWeekInHistory = thisWeekInHistoryLine(timelineChamps, season);

  const pageLoading =
    leagueCtx.isLoading ||
    activeLeagueQ.isLoading ||
    cachedSeasonsQ.isLoading ||
    standingsQ.isLoading;

  if (pageLoading) {
    return (
      <IntelPageShell
        width="full"
        background="none"
        minHeight="none"
        bleed={false}
        padding="none"
        className="mx-auto max-w-[1400px] space-y-4 bg-background px-4 py-6"
        aria-busy="true"
      >
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
      </IntelPageShell>
    );
  }

  const teamA = marqueePick.a ? toMarqueeTeam(marqueePick.a) : null;
  const teamB = marqueePick.b ? toMarqueeTeam(marqueePick.b) : null;

  const freeProfileDisplayName =
    firstNameFromDisplay(focalOwner?.displayName) ||
    focalOwner?.franchiseName?.trim() ||
    welcomeName;
  const freeProfileCareerLine = oh?.careerRecord
    ? `${oh.careerRecord.wins}-${oh.careerRecord.losses} (${Number(oh.careerRecord.winPct).toFixed(1)}% win)`
    : null;
  const freeProfileTitlesLine =
    oh?.championships != null
      ? oh.championships.count > 0
        ? `${oh.championships.count} title${oh.championships.count === 1 ? "" : "s"}`
        : "0 titles"
      : null;
  const freeProfileRivalName = oh?.rival?.rivalName?.trim() || null;
  const freeProfileThreatLine = oh?.threat?.primary
    ? `${oh.threat.primary.ownerName} · ${oh.threat.primary.threatLevel}`
    : null;

  const myStandingRank =
    myPulse?.standingRank ??
    (leagueCtx.myTeamId != null ? ranked.find((t) => t.teamId === leagueCtx.myTeamId)?.displayRank : null);
  const rankLine = myStandingRank != null ? `#${myStandingRank}` : null;
  const syncReady = activeLeagueQ.data?.syncStatus === "ok" || cachedSeasons.length > 0;
  const syncHeaderAction = (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="h-8 shrink-0 border-red-500/25 bg-red-500/[0.06] text-red-200 hover:bg-red-500/15"
    >
      <Link to="/sync" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        {V1.features.syncData}
      </Link>
    </Button>
  );

  const myStanding = leagueCtx.myTeamId != null ? ranked.find((t) => t.teamId === leagueCtx.myTeamId) : null;
  const seasonRecordLine = myStanding ? formatRecord(myStanding) : freeProfileCareerLine;
  const nextMatchupLine =
    isInSeason && thisWeekOpponent
      ? `vs ${thisWeekOpponent.ownerName}${thisWeekOpponent.teamName ? ` (${thisWeekOpponent.teamName})` : ""}`
      : null;
  const rosterAlertLine =
    isPreseason && draftMemo
      ? draftMemo
      : playoffOutlook
        ? playoffOutlook
        : null;
  const leagueMovementLine =
    [acquisitionHeadline, dynastyLine].filter((line): line is string => Boolean(line && String(line).trim())).join(" · ") ||
    null;
  const showRecentEvents = (recentEventsQ.data?.length ?? 0) > 0;
  const rivalInsight =
    oh?.threat?.primary?.reason?.trim() ||
    (oh?.rival?.heatLabel ? `${oh.rival.heatLabel} rivalry` : null);

  if (variant === "curated") {
    return (
      <CuratedHome
        welcomeName={welcomeName}
        leagueName={leagueName}
        weekLabel={weekLabel}
        season={season}
        briefingParagraph={executiveBriefing.paragraph}
        briefingActionLabel={executiveBriefing.action.label}
        briefingActionHref={executiveBriefing.action.href}
        recordLine={seasonRecordLine}
        rankLine={rankLine}
        nextMatchupLine={nextMatchupLine}
        rosterAlertLine={rosterAlertLine}
        rivalName={oh?.rival?.rivalName?.trim() || oh?.threat?.primary?.ownerName?.trim() || null}
        rivalInsight={rivalInsight}
        leagueMovementLine={leagueMovementLine}
        eventSeasons={eventSeasons}
        showRecentEvents={showRecentEvents}
        headerActions={syncHeaderAction}
      />
    );
  }

  if (USE_GM_BRIEFING) {
    return (
      <GmBriefingPage
        welcomeName={welcomeName}
        leagueName={leagueName}
        weekLabel={weekLabel}
        season={season}
        seasonsDesc={SEASONS_DESC}
        cachedSeasons={cachedSeasons}
        onSeasonChange={setSeason}
        isPreseason={isPreseason}
        isInSeason={isInSeason}
        week={week}
        beats={beatCandidates}
        opponentName={isInSeason ? thisWeekOpponent?.ownerName ?? null : null}
        rivalName={oh?.rival?.rivalName ?? null}
        threatName={oh?.threat?.primary?.ownerName ?? null}
        threatReason={oh?.threat?.primary?.reason ?? null}
        threatLevel={oh?.threat?.primary?.threatLevel ?? null}
        hofHeadline={hofHeadline}
        displayName={freeProfileDisplayName}
        careerLine={freeProfileCareerLine}
        titlesLine={freeProfileTitlesLine}
        rankLine={rankLine}
        winPct={oh?.careerRecord?.winPct != null ? Number(oh.careerRecord.winPct) : null}
        syncReady={syncReady}
        seasonCount={cachedSeasons.length}
        teamA={teamA}
        teamB={teamB}
        boardLite={boardLite}
        outlookPct={outlookPct}
        matchupLoading={pulseQ.isLoading || scoreboardQ.isLoading}
        eventSeasons={eventSeasons}
        headerActions={syncHeaderAction}
      />
    );
  }

  return (
    <WelcomeBackCoachHome
      welcomeName={welcomeName}
      leagueName={leagueName}
      subtitle={subtitle}
      stateLine={stateLine}
      season={season}
      seasonsDesc={SEASONS_DESC}
      cachedSeasons={cachedSeasons}
      onSeasonChange={setSeason}
      isPreseason={isPreseason}
      isInSeason={isInSeason}
      weekLabel={weekLabel}
      briefingParagraph={executiveBriefing.paragraph}
      briefingActionLabel={executiveBriefing.action.label}
      briefingActionHref={executiveBriefing.action.href}
      trio={trio}
      teamA={teamA}
      teamB={teamB}
      boardLite={boardLite}
      outlookPct={outlookPct}
      matchupLoading={pulseQ.isLoading || scoreboardQ.isLoading}
      opponentName={isInSeason ? thisWeekOpponent?.ownerName ?? null : null}
      rivalryHeat={oh?.rival?.heatLabel ?? null}
      ranked={ranked}
      myTeamId={leagueCtx.myTeamId}
      formatRecord={formatRecord}
      eventSeasons={eventSeasons}
      timelineChamps={timelineChamps}
      timelineLoading={hofQ.isLoading}
      thisWeekInHistory={thisWeekInHistory}
      freeProfileDisplayName={freeProfileDisplayName}
      freeProfileCareerLine={freeProfileCareerLine}
      freeProfileTitlesLine={freeProfileTitlesLine}
      freeProfileRivalName={freeProfileRivalName}
      freeProfileThreatLine={freeProfileThreatLine}
    />
  );
}
