import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Flame,
  HeartPulse,
  Loader2,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { DevBuildDiagnostics } from "@/components/DevBuildDiagnostics";
import {
  DashboardCard,
  DashboardSectionHeader,
  MetricPill,
  MiniTable,
  StatusBadge,
} from "@/components/dashboard/DashboardPrimitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NormalizedStanding {
  teamId: number;
  teamName: string;
  ownerName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  rankFinal: number | null;
  playoffSeed: number | null;
  displayRank: number;
}

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

function formatWinPct(t: Pick<NormalizedStanding, "wins" | "losses" | "ties">): string {
  const p = winPct(t);
  return p > 0 ? `${(p * 100).toFixed(1)}%` : "—";
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
  const hbRivalry = unwrapMaybe(hofQ.data?.rivalryRecords?.mostHeartbreakGames);
  const gamesRivalry = unwrapMaybe(hofQ.data?.rivalryRecords?.mostGamesPlayed);

  const rivalryPair = hbRivalry ?? gamesRivalry;
  const rivalryTitle = hbRivalry ? "Hottest rivalry (heartbreaks)" : "Most-played rivalry";

  const sg = hofQ.data?.singleGameRecords;
  const highest = unwrapMaybe(sg?.highestTeamScore);
  const lowest = unwrapMaybe(sg?.lowestTeamScore);
  const blowout = unwrapMaybe(sg?.biggestBlowout);
  const closest = unwrapMaybe(sg?.closestGame);

  const readiness = dataHealthQ.data?.readinessScore;
  const ownerResPct = dataHealthQ.data?.ownerResolution;

  const pulseTeams = (pulseQ.data?.teams ?? []) as Array<{
    teamId: number;
    teamName: string;
    ownerName: string;
    wins: number;
    losses: number;
    currentOpponentTeamId: number | null;
  }>;

  const myPulse =
    leagueCtx.myTeamId != null
      ? pulseTeams.find((t) => t.teamId === leagueCtx.myTeamId) ?? null
      : null;
  const oppId = myPulse?.currentOpponentTeamId ?? null;
  const oppPulse = oppId != null ? pulseTeams.find((t) => t.teamId === oppId) ?? null : null;

  const scoreRows = scoreboardQ.data?.matchups as ScoreboardRow[] | undefined;
  const matchupRow =
    leagueCtx.myTeamId != null && oppId != null
      ? findScoreboardMatchup(scoreRows, leagueCtx.myTeamId, oppId)
      : null;

  const homeIsMine = matchupRow && leagueCtx.myTeamId === matchupRow.homeTeamId;
  const myProj = matchupRow
    ? homeIsMine
      ? matchupRow.homeProjected
      : matchupRow.awayProjected
    : null;
  const oppProj = matchupRow
    ? homeIsMine
      ? matchupRow.awayProjected
      : matchupRow.homeProjected
    : null;

  const powerTop = (ownerListQ.data?.powerRankings ?? []).slice(0, 5);

  const timelineRows = useMemo(() => {
    const hist = hofQ.data?.championships?.history;
    if (!Array.isArray(hist) || hist.length === 0) return [];
    return [...hist].sort((a, b) => a.season - b.season);
  }, [hofQ.data?.championships?.history]);

  const pageLoading =
    leagueCtx.isLoading ||
    activeLeagueQ.isLoading ||
    cachedSeasonsQ.isLoading ||
    standingsQ.isLoading;

  if (pageLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-10">
      {/* Top header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Command center</p>
          <h1 className="truncate text-2xl font-bold tracking-tight text-zinc-50 md:text-3xl">{leagueName}</h1>
          <p className="text-sm text-zinc-400">{subtitle}</p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <div className="w-full min-w-[140px] sm:w-44">
            <Select value={String(season)} onValueChange={(v) => setSeason(Number(v))}>
              <SelectTrigger className="border-white/[0.08] bg-[#0f131c] text-zinc-100">
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                {SEASONS_DESC.map((s) => (
                  <SelectItem key={s} value={String(s)} disabled={!cachedSeasons.includes(s)}>
                    {s}
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
            className="shrink-0 border-white/[0.1] bg-white/[0.02] text-zinc-200"
          >
            <Link to="/sync" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync
            </Link>
          </Button>
        </div>
      </header>

      <DevBuildDiagnostics compact />

      {/* Hero row */}
      <section aria-label="League highlights">
        <div className="grid gap-3 md:grid-cols-3">
          <DashboardCard
            title="Hall of Fame leader"
            subtitle="All-time titles"
            accent="gold"
            to="/hall-of-fame"
            toLabel="View Hall of Fame"
          >
            {hofQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : hofLeader ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
                    <Trophy className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-zinc-50">{hofLeader.displayName}</p>
                    <p className="text-sm text-zinc-400">
                      {hofLeader.titles} title{hofLeader.titles === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <MetricPill label="Hall of Fame score" value="Unavailable" variant="neutral" />
                {/* TODO: surface a dedicated HoF composite score from the API when available */}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No championship data yet.</p>
            )}
          </DashboardCard>

          <DashboardCard
            title={rivalryTitle}
            accent="red"
            to="/matchups"
            toLabel="View matchups"
          >
            {hofQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rivalryPair && "displayA" in rivalryPair ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2 text-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{rivalryPair.displayA}</p>
                  </div>
                  <Flame className="h-5 w-5 shrink-0 text-red-400/90" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{rivalryPair.displayB}</p>
                  </div>
                </div>
                {"heartbreakGames" in rivalryPair ? (
                  <MetricPill
                    label="Heartbreak games (≤3 pts)"
                    value={num(rivalryPair.heartbreakGames as number)}
                    variant="red"
                  />
                ) : null}
                {"games" in rivalryPair ? (
                  <MetricPill
                    label="Head-to-head games tracked"
                    value={num(rivalryPair.games as number)}
                    variant="neutral"
                  />
                ) : null}
                <p className="text-[11px] leading-snug text-zinc-500">
                  Win–loss between this pair is not returned on this payload; open Matchups for scheduled
                  head-to-heads.
                </p>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Unavailable — import matchup history to compute rivalries.</p>
            )}
          </DashboardCard>

          <DashboardCard
            title="League health"
            subtitle="Data readiness"
            accent="green"
            to="/league-data-health"
            toLabel="League data health"
          >
            {dataHealthQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : dataHealthQ.data == null ? (
              <p className="text-sm text-zinc-500">Unavailable</p>
            ) : (
              <div className="space-y-3">
                {readiness != null ? (
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold tabular-nums text-emerald-300">{readiness}</span>
                    <span className="pb-1 text-xs font-medium uppercase text-zinc-500">readiness</span>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">Unavailable</p>
                )}
                <ul className="space-y-1.5 text-xs text-zinc-400">
                  <li className="flex justify-between gap-2 border-b border-white/[0.04] pb-1">
                    <span>Owner name resolution (2018+)</span>
                    <span className="tabular-nums text-zinc-200">
                      {ownerResPct != null ? `${ownerResPct}%` : "Unavailable"}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>Weekly player stats table</span>
                    <span className="text-zinc-200">
                      {dataHealthQ.data.weeklyStatsExist ? "Present" : "Not present"}
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </DashboardCard>
        </div>
      </section>

      {/* Main grid */}
      <section className="space-y-3" aria-label="League grid">
        <DashboardSectionHeader title="League board" />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <DashboardCard
              title="Current standings"
              subtitle={`Season ${season} · top 5`}
              to="/standings"
              toLabel="Full standings"
            >
              {standingsQ.isError ? (
                <div className="flex flex-col items-start gap-2 text-sm text-red-300">
                  <span>Could not load standings.</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => void standingsQ.refetch()}>
                    Retry
                  </Button>
                </div>
              ) : ranked.length === 0 ? (
                <p className="text-sm text-zinc-500">No standings for this season.</p>
              ) : (
                <MiniTable
                  dense
                  columns={["#", "Team / owner", "W-L-T", "Win %", "PF"]}
                  rows={ranked.slice(0, 5).map((t) => {
                    const mine = leagueCtx.myTeamId != null && t.teamId === leagueCtx.myTeamId;
                    return [
                      <span key="r" className="tabular-nums text-zinc-400">
                        {t.displayRank}
                      </span>,
                      <div key="tm" className={cn("min-w-0", mine && "text-red-400")}>
                        <div className="truncate font-medium">{t.teamName}</div>
                        <div className="truncate text-[11px] text-zinc-500">{t.ownerName || "—"}</div>
                      </div>,
                      formatRecord(t),
                      formatWinPct(t),
                      num(t.pointsFor).toFixed(1),
                    ];
                  })}
                />
              )}
            </DashboardCard>

            <DashboardCard
              title="This week's matchup"
              subtitle={
                week >= 1 && !pulseQ.data?.isSeasonComplete
                  ? `Week ${week}`
                  : pulseQ.data?.isSeasonComplete
                    ? "Season complete"
                    : "Current week"
              }
              to="/matchups"
              toLabel="All matchups"
            >
              {pulseQ.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : pulseQ.isError || !pulseQ.data ? (
                <p className="text-sm text-zinc-500">
                  No current matchup data — refresh ESPN cache from Sync Data.
                </p>
              ) : pulseQ.data.isSeasonComplete || week < 1 ? (
                <p className="text-sm text-zinc-500">No current matchup data for a completed season window.</p>
              ) : !myPulse || !oppPulse ? (
                <p className="text-sm text-zinc-500">
                  {leagueCtx.myTeamId == null
                    ? "Link your team in your profile to highlight your matchup."
                    : "No current matchup data for your team in the pulse snapshot."}
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-stretch justify-between gap-3 text-center">
                    <div className="min-w-0 flex-1 rounded-lg border border-blue-500/15 bg-blue-500/[0.04] px-2 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-300/90">You</p>
                      <p className="mt-1 truncate text-sm font-semibold text-zinc-100">{myPulse.teamName}</p>
                      <p className="truncate text-[11px] text-zinc-500">{myPulse.ownerName || "—"}</p>
                      <p className="mt-2 text-xs text-zinc-400">
                        {myPulse.wins}–{myPulse.losses}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-center justify-center px-1">
                      <span className="text-[10px] font-bold text-zinc-500">VS</span>
                    </div>
                    <div className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Opponent</p>
                      <p className="mt-1 truncate text-sm font-semibold text-zinc-100">{oppPulse.teamName}</p>
                      <p className="truncate text-[11px] text-zinc-500">{oppPulse.ownerName || "—"}</p>
                      <p className="mt-2 text-xs text-zinc-400">
                        {oppPulse.wins}–{oppPulse.losses}
                      </p>
                    </div>
                  </div>
                  {myProj != null && oppProj != null ? (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase text-blue-300/90">Projected (ESPN)</p>
                      <p className="font-mono text-sm text-zinc-200">
                        {myProj.toFixed(1)} — {oppProj.toFixed(1)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">Projections unavailable for this week in synced data.</p>
                  )}
                </div>
              )}
            </DashboardCard>

            <DashboardCard
              title="League records"
              subtitle="Single-game book"
              accent="gold"
              to="/hall-of-fame"
              toLabel="Hall of Fame records"
            >
              {hofQ.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  <li className="flex flex-col gap-0.5 border-b border-white/[0.04] pb-2 sm:flex-row sm:justify-between">
                    <span className="text-zinc-500">Highest team score</span>
                    <span className="text-zinc-100">
                      {highest ? `${highest.score.toFixed(1)} pts · ${highest.label}` : "Unavailable"}
                    </span>
                  </li>
                  <li className="flex flex-col gap-0.5 border-b border-white/[0.04] pb-2 sm:flex-row sm:justify-between">
                    <span className="text-zinc-500">Lowest team score</span>
                    <span className="text-zinc-100">
                      {lowest ? `${lowest.score.toFixed(1)} pts · ${lowest.label}` : "Unavailable"}
                    </span>
                  </li>
                  <li className="flex flex-col gap-0.5 border-b border-white/[0.04] pb-2 sm:flex-row sm:justify-between">
                    <span className="text-zinc-500">Biggest blowout</span>
                    <span className="text-zinc-100">
                      {blowout
                        ? `${blowout.margin.toFixed(1)} pts margin · ${blowout.winnerLabel} vs ${blowout.loserLabel}`
                        : "Unavailable"}
                    </span>
                  </li>
                  <li className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                    <span className="text-zinc-500">Closest game</span>
                    <span className="text-zinc-100">
                      {closest
                        ? `${closest.margin.toFixed(2)} pt margin · ${closest.homeLabel} ${closest.homeScore}–${closest.awayScore} ${closest.awayLabel}`
                        : "Unavailable"}
                    </span>
                  </li>
                </ul>
              )}
            </DashboardCard>
          </div>

          <div className="space-y-3">
            <DashboardCard title="Recent league events" subtitle="Automated feed">
              {/* TODO: wire to a real league activity stream when the API exposes it */}
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <HeartPulse className="h-8 w-8 text-zinc-600" />
                <p className="text-sm text-zinc-500">No tracked events yet.</p>
                <p className="text-[11px] text-zinc-600">
                  Championship, record, and rivalry notifications will appear here once a timeline feed exists.
                </p>
              </div>
            </DashboardCard>

            <DashboardCard
              title="Dynasty power rankings"
              subtitle="Composite score (server)"
              to="/owner-profiles"
              toLabel="Owner profiles"
            >
              {ownerListQ.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : powerTop.length === 0 ? (
                <p className="text-sm text-zinc-500">No power ranking data.</p>
              ) : (
                <ol className="space-y-2">
                  {powerTop.map((o) => (
                    <li
                      key={o.ownerKey}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-5 text-center text-xs font-bold text-zinc-500">{o.rank}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-100">{o.ownerName}</p>
                          <p className="truncate text-[11px] text-zinc-500">{o.currentTeam}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-300/90">
                        {o.score}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </DashboardCard>

            <DashboardCard title="Playoff picture" subtitle="By standings order only · top 6">
              {ranked.length === 0 ? (
                <p className="text-sm text-zinc-500">No standings data.</p>
              ) : (
                <ul className="space-y-2">
                  {ranked.slice(0, 6).map((t) => {
                    const seed = t.playoffSeed;
                    return (
                      <li
                        key={t.teamId}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.05] px-2 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-100">{t.teamName}</p>
                          <p className="text-[11px] text-zinc-500">
                            #{t.displayRank} · {formatRecord(t)}
                          </p>
                        </div>
                        {seed != null ? (
                          <StatusBadge tone="info">Seed {seed}</StatusBadge>
                        ) : (
                          <StatusBadge tone="default">No seed</StatusBadge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 text-[10px] leading-snug text-zinc-600">
                No win-probability or clinch math is shown unless ESPN exposes it on the standings payload (playoff
                seed only).
              </p>
            </DashboardCard>
          </div>
        </div>
      </section>

      {/* Timeline strip */}
      <section aria-label="Championship timeline">
        <DashboardSectionHeader
          title="League timeline"
          action={
            <Link
              to="/league-timeline"
              className="text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Open timeline →
            </Link>
          }
        />
        <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#0f131c]/80 px-3 py-4">
          {hofQ.isLoading ? (
            <div className="flex justify-center py-6 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : timelineRows.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              No medal history loaded — sync and open Hall of Fame to resolve champions.
            </div>
          ) : (
            <div className="flex min-w-max gap-4">
              {timelineRows.map((row) => {
                const champ =
                  row.resolvedChampionDisplay?.trim() ||
                  row.championTeam?.trim() ||
                  "Unavailable";
                const isCurrent = row.season === season;
                return (
                  <div
                    key={row.season}
                    className={cn(
                      "flex w-[88px] shrink-0 flex-col items-center gap-1.5 text-center",
                      isCurrent && "rounded-lg border border-blue-500/30 bg-blue-500/5 py-2",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wide",
                        isCurrent ? "text-blue-300" : "text-zinc-500",
                      )}
                    >
                      {row.season}
                    </span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/25 bg-amber-500/10 text-[10px] font-bold text-amber-200">
                      {champ === "Unavailable" ? "?" : champ.slice(0, 2).toUpperCase()}
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-tight text-zinc-400">{champ}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
