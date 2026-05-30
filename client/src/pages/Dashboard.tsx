import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Flame, HeartPulse, Loader2, RefreshCw, Trophy } from "lucide-react";
import { DevBuildDiagnostics } from "@/components/DevBuildDiagnostics";
import { DashboardLeagueHealthCard } from "@/components/dashboard/DashboardLeagueHealthCard";
import { DashboardMatchupMarquee, type MarqueeTeam, type ScoreboardLite } from "@/components/dashboard/DashboardMatchupMarquee";
import { DashboardTimelineStrip, type TimelineChamp } from "@/components/dashboard/DashboardTimelineStrip";
import { useRivalryDossierScan } from "@/components/dashboard/rivalryDossierScan";
import { MiniTable, StatusBadge } from "@/components/dashboard/DashboardPrimitives";

// ── Types ─────────────────────────────────────────────────────────────────────

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

type MaybeAvail<T> = { available: true; value: T } | { available: false; reason: string };

function unwrapMaybe<T>(m: MaybeAvail<T> | undefined | null): T | null {
  if (m && m.available) return m.value;
  return null;
}

// ── Standings helpers (aligned with Standings page tie-break logic) ───────────

const CURRENT_YEAR = new Date().getFullYear();
const SEASONS_DESC = Array.from({ length: CURRENT_YEAR - 2009 + 1 }, (_, i) => CURRENT_YEAR - i);

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
  return ti > 0
    ? `${num(t.wins)}-${num(t.losses)}-${ti}`
    : `${num(t.wins)}-${num(t.losses)}`;
}

// ── Matchup scoreboard ─────────────────────────────────────────────────────────

type ScoreboardRow = {
  homeTeamId: number;
  awayTeamId: number;
  homeProjected: number | null;
  awayProjected: number | null;
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

function classifyPlayoff(
  t: NormalizedStanding,
  playoffSpots: number,
): { label: string; tone: "success" | "warning" | "danger" | "default" } {
  const spots = playoffSpots > 0 ? playoffSpots : 6;
  if (t.playoffSeed != null) {
    if (t.playoffSeed <= spots) return { label: "In", tone: "success" };
    if (t.playoffSeed === spots + 1) return { label: "Bubble", tone: "warning" };
    return { label: "Outside", tone: "danger" };
  }
  const r = t.displayRank;
  if (r <= spots) return { label: "In", tone: "success" };
  if (r === spots + 1) return { label: "Bubble", tone: "warning" };
  return { label: "Outside", tone: "danger" };
}

// ── Dashboard ───────────────────────────────────────────────────────────────────

export function Dashboard() {
  const leagueCtx = useLeagueContext();
  const activeLeagueQ = trpc.league.getActive.useQuery(undefined, { staleTime: 30_000 });
  const cachedSeasonsQ = trpc.espn.cachedSeasons.useQuery(undefined, { staleTime: 60_000 });
  const cachedSeasons = cachedSeasonsQ.data ?? [];

  const defaultSeason =
    cachedSeasons.length > 0 ? Math.max(...cachedSeasons) : Math.min(CURRENT_YEAR, 2026);
  const [season, setSeason] = useState(defaultSeason);

  useEffect(() => {
    if (leagueCtx.season > 0) setSeason(leagueCtx.season);
  }, [leagueCtx.season]);

  useEffect(() => {
    if (cachedSeasons.length > 0) {
      const maxS = Math.max(...cachedSeasons);
      setSeason((s) => (cachedSeasons.includes(s) ? s : maxS));
    }
  }, [cachedSeasons]);

  const hofQ = trpc.espn.hallOfFame.useQuery(undefined, { staleTime: 60_000 });
  const ownerListQ = trpc.owners.ownerList.useQuery(undefined, { staleTime: 60_000 });
  const dataHealthQ = trpc.dataHealth.leagueOverview.useQuery(undefined, { staleTime: 60_000 });
  const coverageQ = trpc.espn.ownerMatchupCoverage.useQuery(undefined, { staleTime: 60_000 });

  const pulseQ = trpc.weeklyAssessment.leaguePulse.useQuery(
    { season },
    { retry: false, staleTime: 30_000 },
  );

  const week = pulseQ.data?.week ?? 0;
  const scoreboardQ = trpc.espn.matchupsScoreboard.useQuery(
    { season, week: week >= 1 ? week : 1 },
    {
      enabled: week >= 1 && pulseQ.isSuccess && !pulseQ.isFetching,
      staleTime: 30_000,
    },
  );

  const standingsQ = trpc.espn.standings.useQuery(
    { season },
    { enabled: !leagueCtx.isLoading, staleTime: 60_000 },
  );

  const ranked = useMemo(() => {
    const raw = standingsQ.data;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const base = raw
      .map(normalizeStandingRow)
      .filter((r): r is NonNullable<typeof r> => r != null);
    return rankStandings(base);
  }, [standingsQ.data]);

  const leagueName =
    activeLeagueQ.data?.leagueName?.trim() ||
    (leagueCtx.leagueId ? `League ${leagueCtx.leagueId}` : "Your league");

  const seasonsWithData = hofQ.data?.coverage?.seasonsTouched?.length ?? null;
  const ownerCount =
    ownerListQ.data?.active?.length ??
    (ranked.length > 0 ? ranked.length : leagueCtx.teamCount > 0 ? leagueCtx.teamCount : null);

  const subtitleParts: string[] = [];
  if (seasonsWithData != null && seasonsWithData > 0) {
    subtitleParts.push(`${seasonsWithData} season${seasonsWithData === 1 ? "" : "s"}`);
  }
  if (ownerCount != null && ownerCount > 0) {
    subtitleParts.push(`${ownerCount} owner${ownerCount === 1 ? "" : "s"}`);
  }
  const subtitle =
    subtitleParts.length > 0 ? subtitleParts.join(" · ") : "Connect ESPN and sync to populate history";

  const hofLeader = hofQ.data?.championships?.leaderboard?.[0];
  const leaderStats = hofLeader
    ? hofQ.data?.ownerRecords?.find((r) => r.ownerKey === hofLeader.ownerKey)
    : undefined;

  const sg = hofQ.data?.singleGameRecords;
  const sr = hofQ.data?.seasonRecords;
  const highest = unwrapMaybe(sg?.highestTeamScore);
  const lowest = unwrapMaybe(sg?.lowestTeamScore);
  const hiSeasonPf = unwrapMaybe(sr?.mostPointsInSeason);

  const hasPlayoffGmMatchups = useMemo(() => {
    const rows = coverageQ.data?.seasons ?? [];
    return rows.some((s) => s.completedPlayoffDedupedRows > 0);
  }, [coverageQ.data?.seasons]);

  const activeOwnerKeys = useMemo(
    () => (ownerListQ.data?.active ?? []).map((o) => o.ownerKey),
    [ownerListQ.data?.active],
  );
  const rivalryHero = useRivalryDossierScan(activeOwnerKeys);

  const pulseTeams = (pulseQ.data?.teams ?? []) as Array<{
    teamId: number;
    teamName: string;
    ownerName: string;
    wins: number;
    losses: number;
    currentOpponentTeamId: number | null;
    playoffProbability: number;
    standingRank: number;
  }>;

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

  const powerTop = (ownerListQ.data?.powerRankings ?? []).slice(0, 5);

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

  const pageLoading =
    leagueCtx.isLoading ||
    activeLeagueQ.isLoading ||
    cachedSeasonsQ.isLoading ||
    standingsQ.isLoading;

  if (pageLoading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-4 bg-[#07090e] px-4 py-6" aria-busy="true">
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  const teamA = marqueePick.a ? toMarqueeTeam(marqueePick.a) : null;
  const teamB = marqueePick.b ? toMarqueeTeam(marqueePick.b) : null;
  const weekLabel =
    week >= 1 && !pulseQ.data?.isSeasonComplete
      ? `Season ${season} · Week ${week}`
      : pulseQ.data?.isSeasonComplete
        ? `Season ${season} · Final`
        : `Season ${season}`;

  const playoffSpots = leagueCtx.playoffTeams > 0 ? leagueCtx.playoffTeams : 6;

  return (
    <div className="mx-auto max-w-[1400px] space-y-10 bg-[#07090e] px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-white/[0.06] pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-500/90">GM War Room</p>
          <h1 className="truncate text-3xl font-bold tracking-tight text-zinc-50 md:text-4xl">{leagueName}</h1>
          <p className="text-sm text-zinc-400">{subtitle}</p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <div className="w-full min-w-[160px] sm:w-48">
            <Select value={String(season)} onValueChange={(v) => setSeason(Number(v))}>
              <SelectTrigger className="border-white/[0.08] bg-[#0f131c] text-zinc-100">
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                {SEASONS_DESC.map((s) => (
                  <SelectItem key={s} value={String(s)} disabled={!cachedSeasons.includes(s)}>
                    Season {s}
                    {!cachedSeasons.includes(s) ? " (not cached)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="shrink-0 border-red-500/25 bg-red-500/[0.06] text-red-200 hover:bg-red-500/15"
          >
            <Link to="/sync" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero — three prestige cards */}
      <section aria-label="League highlights" className="grid gap-4 md:grid-cols-3">
        <div className="flex min-h-[240px] flex-col rounded-2xl border border-amber-500/25 bg-gradient-to-br from-[#141820] to-[#0c0f14] p-5 shadow-[0_0_40px_-12px_rgba(245,158,11,0.35)]">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400/90">Hall of Fame leader</p>
            <Trophy className="h-4 w-4 shrink-0 text-amber-400/80" aria-hidden />
          </div>
          {hofQ.isLoading ? (
            <div className="mt-8 flex flex-1 items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : hofLeader ? (
            <div className="mt-4 flex flex-1 flex-col">
              <p className="text-2xl font-bold tracking-tight text-zinc-50">{hofLeader.displayName}</p>
              <p className="mt-1 text-sm text-amber-200/90">
                {hofLeader.titles} championship{hofLeader.titles === 1 ? "" : "s"}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-2">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Win %</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-zinc-100">
                    {leaderStats ? `${leaderStats.winPct.toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-2">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Seasons active</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-zinc-100">
                    {leaderStats?.seasonsActive ?? "—"}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">Hall of Fame score</p>
                <p className="mt-1 text-sm font-medium text-zinc-300">Coming Soon</p>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-1 flex-col justify-center text-sm text-zinc-500">
              <p className="font-medium text-zinc-400">Not Yet Available</p>
              <p className="mt-1 text-xs text-zinc-600">Import medals to crown a league leader.</p>
            </div>
          )}
          <Link to="/hall-of-fame" className="mt-4 text-xs font-medium text-amber-400/90 hover:text-amber-300">
            View Hall of Fame →
          </Link>
        </div>

        <div className="flex min-h-[240px] flex-col rounded-2xl border border-red-500/25 bg-gradient-to-br from-[#16121a] to-[#0c0f14] p-5 shadow-[0_0_36px_-12px_rgba(239,68,68,0.3)]">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-400/90">Hottest rivalry</p>
            <Flame className="h-4 w-4 shrink-0 text-red-400/80" aria-hidden />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5">
            <span className="text-[10px] font-medium text-zinc-500">Active owners only</span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-zinc-600">Historical</span>
              <Switch disabled checked={false} className="scale-90 opacity-50" aria-label="Include historical owners — coming soon" />
            </div>
          </div>
          {rivalryHero.status === "loading" || ownerListQ.isLoading ? (
            <div className="mt-8 flex flex-1 items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Scanning dossiers…
            </div>
          ) : rivalryHero.status === "ready" ? (
            <div className="mt-4 flex flex-1 flex-col">
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <p className="text-lg font-bold text-zinc-100">{rivalryHero.focalDisplay}</p>
                <span className="rounded-full border border-red-500/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-300">
                  vs
                </span>
                <p className="text-lg font-bold text-zinc-100">{rivalryHero.opponentDisplay}</p>
              </div>
              <p className="mt-3 text-center font-mono text-3xl font-black tabular-nums text-red-400/95">
                {rivalryHero.wins}-{rivalryHero.losses}
                {rivalryHero.ties > 0 ? `-${rivalryHero.ties}` : ""}
              </p>
              <p className="text-center text-[10px] text-zinc-500">Head-to-head (focal: {rivalryHero.focalDisplay})</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Heartbreak losses</p>
                  <p className="mt-0.5 text-lg font-bold text-red-300/90">{rivalryHero.heartbreakLosses}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Closest game</p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-200">
                    {rivalryHero.closestMarginLabel ?? "—"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-1 flex-col justify-center text-center text-sm text-zinc-500">
              <p className="font-medium text-zinc-400">Not Yet Available</p>
              <p className="mt-1 px-2 text-xs text-zinc-600">
                {rivalryHero.status === "idle"
                  ? "No active owner list yet."
                  : "Need at least two active owners with regular-season head-to-head rows in gmMatchups."}
              </p>
            </div>
          )}
          <Link to="/matchups" className="mt-4 text-xs font-medium text-red-400/90 hover:text-red-300">
            Rivalry center →
          </Link>
        </div>

        <DashboardLeagueHealthCard isLoading={dataHealthQ.isLoading} data={dataHealthQ.data ?? null} />
      </section>

      {/* Row 2 — standings | marquee matchup | records */}
      <section className="grid gap-4 xl:grid-cols-12" aria-label="League board">
        <div className="space-y-3 xl:col-span-3">
          <div className="flex min-h-[280px] flex-col rounded-2xl border border-white/[0.08] bg-[#0f131c]/95 shadow-lg shadow-black/40">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <h3 className="text-sm font-semibold text-zinc-50">Current standings</h3>
              <p className="text-xs text-zinc-500">Top 6 · Season {season}</p>
            </div>
            <div className="flex-1 px-3 py-3">
              {standingsQ.isError ? (
                <div className="flex flex-col gap-2 text-sm text-red-300">
                  <span>Could not load standings.</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => void standingsQ.refetch()}>
                    Retry
                  </Button>
                </div>
              ) : ranked.length === 0 ? (
                <p className="text-sm text-zinc-500">Not Yet Available for this season.</p>
              ) : (
                <MiniTable
                  dense
                  columns={["Rank", "Owner", "Record", "PF"]}
                  rows={ranked.slice(0, 6).map((t) => {
                    const mine = leagueCtx.myTeamId != null && t.teamId === leagueCtx.myTeamId;
                    return [
                      <span key="r" className="tabular-nums text-zinc-400">
                        {t.displayRank}
                      </span>,
                      <div key="o" className={cn("min-w-0 font-medium", mine && "text-red-400")}>
                        <div className="truncate">{t.ownerName || t.teamName}</div>
                      </div>,
                      formatRecord(t),
                      <span key="pf" className="tabular-nums text-zinc-200">
                        {num(t.pointsFor).toFixed(1)}
                      </span>,
                    ];
                  })}
                />
              )}
            </div>
            <div className="border-t border-white/[0.06] px-4 py-2">
              <Link to="/standings" className="text-xs font-medium text-blue-400 hover:text-blue-300">
                View full standings →
              </Link>
            </div>
          </div>
        </div>

        <div className="xl:col-span-6">
          <DashboardMatchupMarquee
            isLoading={pulseQ.isLoading || scoreboardQ.isLoading}
            weekLabel={weekLabel}
            teamA={teamA}
            teamB={teamB}
            board={boardLite}
            winProbPct={outlookPct}
            winProbCaption="Uses weeklyAssessment.leaguePulse team outlook when available."
          />
        </div>

        <div className="space-y-3 xl:col-span-3">
          <div className="flex min-h-[280px] flex-col rounded-2xl border border-amber-500/20 bg-[#0f131c]/95 shadow-[0_0_28px_-12px_rgba(245,158,11,0.22)]">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <h3 className="text-sm font-semibold text-zinc-50">League records</h3>
              <p className="text-xs text-zinc-500">All-time marks</p>
            </div>
            <div className="flex flex-1 flex-col gap-3 px-4 py-3 text-sm">
              {hofQ.isLoading ? (
                <div className="flex items-center gap-2 text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-0.5 border-b border-white/[0.05] pb-2">
                    <span className="text-[10px] font-semibold uppercase text-zinc-500">Highest single game</span>
                    <span className="text-zinc-100">
                      {highest ? `${highest.score.toFixed(1)} pts · ${highest.label}` : "Not Yet Calculated"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-white/[0.05] pb-2">
                    <span className="text-[10px] font-semibold uppercase text-zinc-500">Lowest single game</span>
                    <span className="text-zinc-100">
                      {lowest ? `${lowest.score.toFixed(1)} pts · ${lowest.label}` : "Not Yet Calculated"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-white/[0.05] pb-2">
                    <span className="text-[10px] font-semibold uppercase text-zinc-500">Most points (season)</span>
                    <span className="text-zinc-100">
                      {hiSeasonPf
                        ? `${hiSeasonPf.pointsFor.toFixed(1)} PF · ${hiSeasonPf.displayName} (${hiSeasonPf.season})`
                        : "Not Yet Calculated"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-semibold uppercase text-zinc-500">Closest championship</span>
                    <span className="text-xs leading-snug text-zinc-400">
                      {hasPlayoffGmMatchups
                        ? "Playoff rows exist in gmMatchups; smallest championship margin is not included in the Hall of Fame payload for this view."
                        : "Not included in Hall of Fame payload."}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="border-t border-white/[0.06] px-4 py-2">
              <Link to="/hall-of-fame" className="text-xs font-medium text-amber-400/90 hover:text-amber-300">
                Full records →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Row 3 — events | power | playoff */}
      <section className="grid gap-4 lg:grid-cols-3" aria-label="League insights">
        <div className="flex min-h-[220px] flex-col rounded-2xl border border-white/[0.08] bg-[#0f131c]/95">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <h3 className="text-sm font-semibold text-zinc-50">Recent league events</h3>
            <p className="text-xs text-zinc-500">Story feed</p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <HeartPulse className="h-9 w-9 text-zinc-600" />
            <p className="text-sm font-medium text-zinc-400">No event feed available yet.</p>
            <p className="text-[11px] leading-relaxed text-zinc-600">
              Future hooks: records broken, Hall of Fame movement, rivalry milestones — requires a league events engine.
            </p>
          </div>
        </div>

        <div className="flex min-h-[220px] flex-col rounded-2xl border border-white/[0.08] bg-[#0f131c]/95">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <h3 className="text-sm font-semibold text-zinc-50">Dynasty power rankings</h3>
            <p className="text-xs text-zinc-500">Top 5 · owners.ownerList</p>
          </div>
          <div className="flex-1 px-3 py-3">
            {ownerListQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : powerTop.length === 0 ? (
              <p className="text-sm text-zinc-500">Not Yet Available</p>
            ) : (
              <MiniTable
                dense
                columns={["Owner", "Power Score"]}
                rows={powerTop.map((o) => [
                  <div key="n" className="min-w-0">
                    <div className="truncate font-medium text-zinc-100">{o.ownerName}</div>
                    <div className="truncate text-[10px] text-zinc-600">{o.currentTeam}</div>
                  </div>,
                  <span key="s" className="tabular-nums font-semibold text-emerald-300/90">
                    {o.score}
                  </span>,
                ])}
              />
            )}
          </div>
          <div className="border-t border-white/[0.06] px-4 py-2">
            <Link to="/owner-profiles" className="text-xs font-medium text-blue-400 hover:text-blue-300">
              Owner profiles →
            </Link>
          </div>
        </div>

        <div className="flex min-h-[220px] flex-col rounded-2xl border border-white/[0.08] bg-[#0f131c]/95">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <h3 className="text-sm font-semibold text-zinc-50">Playoff picture</h3>
            <p className="text-xs text-zinc-500">Seed-based · top 6 · no fabricated odds</p>
          </div>
          <div className="flex-1 space-y-2 px-3 py-3">
            {ranked.length === 0 ? (
              <p className="text-sm text-zinc-500">Not Yet Available</p>
            ) : (
              <ul className="space-y-2">
                {ranked.slice(0, 6).map((t) => {
                  const { label, tone } = classifyPlayoff(t, playoffSpots);
                  const mine = leagueCtx.myTeamId != null && t.teamId === leagueCtx.myTeamId;
                  return (
                    <li
                      key={t.teamId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-2"
                    >
                      <div className={cn("min-w-0", mine && "text-red-400")}>
                        <p className="truncate text-sm font-medium text-zinc-100">{t.ownerName || t.teamName}</p>
                        <p className="text-[11px] text-zinc-500">
                          #{t.displayRank} · {formatRecord(t)}
                          {t.playoffSeed != null ? ` · Seed ${t.playoffSeed}` : ""}
                        </p>
                      </div>
                      <StatusBadge tone={tone}>{label}</StatusBadge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <DashboardTimelineStrip
        isLoading={hofQ.isLoading}
        rows={timelineChamps}
        currentSeason={season}
      />

      <DevBuildDiagnostics compact />
    </div>
  );
}
