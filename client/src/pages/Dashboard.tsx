import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useAuth, useUser } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
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
import { Flame, Loader2, RefreshCw, Trophy, ChevronRight, Activity, Swords, FileText, Star, TrendingUp, ShieldAlert, Medal, Binoculars, Users } from "lucide-react";
import { DevBuildDiagnostics } from "@/components/DevBuildDiagnostics";
import { DashboardLeagueHealthCard } from "@/components/dashboard/DashboardLeagueHealthCard";
import { DashboardMatchupMarquee, type MarqueeTeam, type ScoreboardLite } from "@/components/dashboard/DashboardMatchupMarquee";
import { DashboardTimelineStrip, type TimelineChamp } from "@/components/dashboard/DashboardTimelineStrip";
import { buildDefaultRivalryEligibleOwnerKeys } from "@/lib/rivalryOwnerEligibility";
import { useRivalryDossierScan } from "@/components/dashboard/rivalryDossierScan";
import { DashboardRecentLeagueEvents } from "@/components/dashboard/DashboardRecentLeagueEvents";
import { LeagueWireNewsFeed } from "@/components/dashboard/LeagueWireNewsFeed";
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

/** Dashboard: avoid refetch storms on tab focus / route remount */
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
  return ti > 0
    ? `${num(t.wins)}-${num(t.losses)}-${ti}`
    : `${num(t.wins)}-${num(t.losses)}`;
}

function normalizeOwnerKeyForMatch(key: string | null | undefined): string {
  if (!key) return "";
  return String(key).replace(/^id:/i, "").trim();
}

function firstNameFromDisplay(displayName: string | null | undefined): string {
  const s = displayName?.trim();
  if (!s) return "";
  return s.split(/\s+/)[0] ?? "";
}

/** Plain labels for Matchup Intelligence (DNA + draft war room). */
function matchupIntelWeakness(dna: Record<string, unknown> | null | undefined): string {
  const draft = dna?.draft as Record<string, unknown> | undefined;
  if (!draft) return "—";
  const value = (draft.valuePositions as string[] | undefined) ?? [];
  const biases = (draft.biasVsLeague as Record<string, number> | undefined) ?? {};
  if (value.length > 0) {
    let bestPos = value[0];
    let bestBias = biases[bestPos] ?? 0;
    for (const p of value) {
      const b = biases[p] ?? 0;
      if (b < bestBias) {
        bestPos = p;
        bestBias = b;
      }
    }
    return `${bestPos} depth`;
  }
  const reach = (draft.reachPositions as string[] | undefined)?.[0];
  if (reach) return `${reach}-heavy builds`;
  const wins = (dna?.exploitWindows as string[] | undefined) ?? [];
  const w0 = wins[0];
  if (w0 && typeof w0 === "string") return w0.length > 52 ? `${w0.slice(0, 49)}…` : w0;
  return "—";
}

function matchupIntelDraftTendency(dna: Record<string, unknown> | null | undefined): string {
  const draft = dna?.draft as Record<string, unknown> | undefined;
  if (!draft) return "—";
  const badge = String(draft.draftStyleBadge ?? "").trim();
  const r1 = (draft.round1Distribution as Record<string, number> | undefined) ?? {};
  const entries = Object.entries(r1).filter(([, n]) => Number(n) > 0);
  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  if (entries.length > 0 && Number(entries[0][1]) >= 3) {
    return `${entries[0][0]} early`;
  }
  return badge || "—";
}

function matchupIntelTradeTendency(dna: Record<string, unknown> | null | undefined): string {
  const trade = dna?.trade as Record<string, unknown> | undefined;
  if (!trade) return "—";
  const freq = Number(trade.tradeFrequency ?? 0);
  const avg = Number(trade.avgTradesPerSeason ?? 0);
  if (freq < 28 && avg < 1.3) return "Rarely accepts 2-for-1 deals";
  if (freq < 38) return "Selective — prefers one-for-one upgrades";
  if (freq >= 62) return "Active dealmaker — open to multi-player swaps";
  return `~${avg.toFixed(1)} trades/season`;
}

function opponentKeeperPick(teamId: number, predictions: unknown[] | undefined): string {
  if (!predictions?.length) return "—";
  const row = (predictions as Array<Record<string, unknown>>).find(
    (p) => Number(p.teamId) === teamId,
  );
  const name = row?.predictedPlayer;
  return typeof name === "string" && name.trim() ? name.trim() : "—";
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
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const leagueCtx = useLeagueContext();
  const leagueKeyReady =
    authLoaded && isSignedIn && !leagueCtx.leagueContextKey.startsWith("__");
  /** X.30C — focal owner snapshot (no league picker required; resolves from active profile). */
  const ownerHomeQ = trpc.me.ownerHome.useQuery(
    withLeagueSalt({}, leagueCtx.leagueContextKey),
    { ...DASH_QUERY_OPTS, enabled: authLoaded && !!isSignedIn },
  );
  const activeLeagueQ = trpc.league.getActive.useQuery(undefined, { ...DASH_QUERY_OPTS, staleTime: 30_000 });
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
    if (cachedSeasons.length > 0) {
      const maxS = Math.max(...cachedSeasons);
      setSeason((s) => (cachedSeasons.includes(s) ? s : maxS));
    }
  }, [cachedSeasons, leagueCtx.leagueContextKey]);

  const hofQ = trpc.espn.hallOfFame.useQuery(
    withLeagueSalt({}, leagueCtx.leagueContextKey),
    { ...DASH_QUERY_OPTS, staleTime: 60_000 },
  );
  const ownerListQ = trpc.owners.ownerList.useQuery(
    withLeagueSalt({}, leagueCtx.leagueContextKey),
    { ...DASH_QUERY_OPTS, staleTime: 60_000 },
  );
  const dataHealthQ = trpc.dataHealth.leagueOverview.useQuery(
    withLeagueSalt({}, leagueCtx.leagueContextKey),
    { ...DASH_QUERY_OPTS, staleTime: 60_000 },
  );
  const coverageQ = trpc.espn.ownerMatchupCoverage.useQuery(
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

  // pulseTeams must be declared before `ranked` so we can overlay real ownerNames.
  // The standings API returns owners as ESPN member-ID GUIDs; pulse data has real names.
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

  const opponentMemberId = useMemo(() => {
    if (!thisWeekOpponent) return null;
    const row = pulseTeams.find((t) => t.teamId === thisWeekOpponent.teamId);
    const mids = row?.memberIds;
    return mids && mids[0] ? String(mids[0]) : null;
  }, [thisWeekOpponent, pulseTeams]);

  const matchupIntelEnabled =
    leagueKeyReady &&
    !!opponentMemberId &&
    (pulseQ.data?.week ?? 0) >= 1 &&
    !pulseQ.data?.isSeasonComplete;

  const opponentDnaQ = trpc.dna.managerProfile.useQuery(
    withLeagueSalt({ memberId: opponentMemberId ?? "__none__" }, leagueCtx.leagueContextKey),
    {
      ...DASH_QUERY_OPTS,
      enabled: matchupIntelEnabled && !!opponentMemberId,
    },
  );

  // teamId → ownerName from pulse (has real display names, not GUIDs)
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
    // Overlay real ownerName from pulse data — standings API may return ESPN member-ID GUIDs
    return sorted.map((t) => ({
      ...t,
      ownerName: pulseOwnerMap.get(t.teamId) || t.ownerName || t.teamName,
    }));
  }, [standingsQ.data, pulseOwnerMap]);

  const legacyRankDisplay = useMemo(() => {
    const focalKey = ownerHomeQ.data?.owner?.ownerKey;
    const pr = (ownerListQ.data?.powerRankings ?? []) as Array<{ rank: number; ownerKey: string }>;
    if (focalKey && pr.length > 0) {
      const target = normalizeOwnerKeyForMatch(focalKey);
      const row = pr.find((r) => normalizeOwnerKeyForMatch(r.ownerKey) === target);
      if (row) return { primary: `#${row.rank}`, secondary: `of ${pr.length} managers` };
    }
    if (leagueCtx.myTeamId && ranked.length > 0) {
      const t = ranked.find((x) => x.teamId === leagueCtx.myTeamId);
      if (t) return { primary: `#${t.displayRank}`, secondary: `${season} standings` };
    }
    return { primary: "—", secondary: "Sync data or finish setup" };
  }, [
    ownerHomeQ.data?.owner?.ownerKey,
    ownerListQ.data?.powerRankings,
    leagueCtx.myTeamId,
    ranked,
    season,
  ]);

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

  const rivalryEligibleOwnerKeys = useMemo(() => {
    const all = ownerListQ.data?.allOwners ?? [];
    return buildDefaultRivalryEligibleOwnerKeys(
      all.map((o) => ({
        ownerKey: o.ownerKey,
        seasons: Array.isArray(o.seasons) ? o.seasons : [],
        championships: typeof o.championships === "number" ? o.championships : 0,
      })),
      season,
    );
  }, [ownerListQ.data?.allOwners, season]);

  const rivalryEligibilityDiagnostics = useMemo(() => {
    const all = ownerListQ.data?.allOwners ?? [];
    return {
      totalOwners:    all.length,
      eligibleOwners: rivalryEligibleOwnerKeys.length,
      filteredOwners: all.length - rivalryEligibleOwnerKeys.length,
    };
  }, [ownerListQ.data?.allOwners, rivalryEligibleOwnerKeys]);

  const rivalryHero = useRivalryDossierScan(rivalryEligibleOwnerKeys);

  const eventSeasons = useMemo(() => {
    const out: number[] = [];
    if (cachedSeasons.includes(season)) out.push(season);
    for (let y = season - 1; y >= season - 4 && y >= 2009; y--) {
      if (cachedSeasons.includes(y)) out.push(y);
    }
    return [...new Set(out)];
  }, [season, cachedSeasons]);

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

  const draftIntelQ = trpc.draftWarRoom.getDraftWarRoomData.useQuery(
    withLeagueSalt({ season: CURRENT_YEAR }, leagueCtx.leagueContextKey),
    {
      ...DASH_QUERY_OPTS,
      staleTime: 5 * 60 * 1000,
      enabled: leagueKeyReady && CURRENT_YEAR > 0,
    },
  );


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
      <div className="mx-auto max-w-[1400px] space-y-4 bg-[#0c090e] px-4 py-6" aria-busy="true">
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

  const oh = ownerHomeQ.data;
  const focalOwner = oh?.owner;
  const welcomeName =
    user?.firstName?.trim() ||
    firstNameFromDisplay(user?.fullName) ||
    firstNameFromDisplay(focalOwner?.displayName) ||
    focalOwner?.franchiseName?.trim() ||
    focalOwner?.leagueName?.trim() ||
    "Manager";
  const careerFmt = oh?.careerRecord
    ? `${oh.careerRecord.wins}-${oh.careerRecord.losses} (${Number(oh.careerRecord.winPct).toFixed(1)}% win)`
    : "—";
  const champsFmt =
    oh?.championships != null
      ? oh.championships.count > 0
        ? `${oh.championships.count}${
            oh.championships.seasons.length > 0
              ? ` · ${oh.championships.seasons.slice(-4).join(", ")}${oh.championships.seasons.length > 4 ? "…" : ""}`
              : ""
          }`
        : "0 titles"
      : "—";
  const rivalFmt = oh?.rival?.rivalName?.trim() || "—";
  const threatFmt = oh?.threat?.primary
    ? `${oh.threat.primary.ownerName} · ${oh.threat.primary.threatLevel}`
    : "—";

  const opponentDna = opponentDnaQ.data as Record<string, unknown> | null | undefined;
  const matchupWeakLabel = matchupIntelWeakness(opponentDna);
  const matchupDraftLabel = matchupIntelDraftTendency(opponentDna);
  const matchupTradeLabel = matchupIntelTradeTendency(opponentDna);
  const matchupKeeperLabel = thisWeekOpponent
    ? opponentKeeperPick(thisWeekOpponent.teamId, (draftIntelQ as any)?.data?.keeperPredictions as unknown[] | undefined)
    : "—";
  const showMatchupIntelPanel =
    !!leagueCtx.myTeamId && !!thisWeekOpponent && (pulseQ.data?.week ?? 0) >= 1 && !pulseQ.data?.isSeasonComplete;

  return (
    <div className="mx-auto max-w-[1400px] space-y-10 bg-[#0c090e] px-4 pb-16 pt-6 sm:px-6">
      <header className="border-b border-white/[0.06] pb-6 space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-lime-500/90">Welcome back</p>
            <h1 className="truncate text-3xl font-bold tracking-tight text-zinc-50 md:text-4xl">{welcomeName}</h1>
            <p className="text-sm text-zinc-400">
              <span className="font-medium text-zinc-300">{leagueName}</span>
              {subtitle ? <span className="text-zinc-500"> · {subtitle}</span> : null}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="w-full min-w-[160px] sm:w-48">
              <Select value={String(season)} onValueChange={(v) => setSeason(Number(v))}>
                <SelectTrigger className="border-white/[0.08] bg-[#18111c] text-zinc-100">
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
        </div>

        {ownerHomeQ.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Your owner snapshot">
            <div className="rounded-xl border border-amber-500/20 bg-zinc-900/40 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-amber-400/90">
                <Medal className="h-3.5 w-3.5 shrink-0" />
                Your legacy rank
              </div>
              <p className="text-xl font-black tabular-nums text-zinc-50">{legacyRankDisplay.primary}</p>
              <p className="text-[11px] text-zinc-500 leading-snug">{legacyRankDisplay.secondary}</p>
            </div>
            <div className="rounded-xl border border-yellow-500/20 bg-zinc-900/40 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-yellow-400/90">
                <Trophy className="h-3.5 w-3.5 shrink-0" />
                Championships
              </div>
              <p className="text-lg font-bold text-zinc-100 leading-snug break-words">{champsFmt}</p>
              {isSignedIn && focalOwner && !focalOwner.isSetupComplete ? (
                <p className="text-[11px] text-zinc-500">Select your team in Settings to personalize.</p>
              ) : null}
            </div>
            <div className="rounded-xl border border-orange-500/20 bg-zinc-900/40 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-orange-400/90">
                <Swords className="h-3.5 w-3.5 shrink-0" />
                Biggest rival
              </div>
              <p className="text-lg font-bold text-zinc-100 truncate" title={rivalFmt}>
                {rivalFmt}
              </p>
              {oh?.rival?.heatLabel ? (
                <p className="text-[11px] text-zinc-500">{oh.rival.heatLabel} · score {oh.rival.rivalryScore}</p>
              ) : null}
            </div>
            <div className="rounded-xl border border-red-500/20 bg-zinc-900/40 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-red-400/90">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                Biggest threat
              </div>
              <p className="text-lg font-bold text-zinc-100 leading-snug break-words">{threatFmt}</p>
              {oh?.threat?.primary?.reason ? (
                <p className="text-[11px] text-zinc-500 line-clamp-2">{oh.threat.primary.reason}</p>
              ) : oh?.threat?.note ? (
                <p className="text-[11px] text-zinc-500">{oh.threat.note}</p>
              ) : null}
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-zinc-900/40 p-4 flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-emerald-400/90">
                <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                Career record
              </div>
              <p className="text-xl font-black tabular-nums text-zinc-50">{careerFmt}</p>
              {oh?.careerRecord ? (
                <p className="text-[11px] text-zinc-500">
                  {oh.careerRecord.seasonsActive} season{oh.careerRecord.seasonsActive === 1 ? "" : "s"} ·{" "}
                  {oh.careerRecord.playoffAppearances} playoff run{oh.careerRecord.playoffAppearances === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </header>

      {/* Matchup Intelligence: this-week opponent (linked team + in-season week) */}
      {showMatchupIntelPanel && thisWeekOpponent ? (
        <section
          className="rounded-2xl border border-sky-500/25 bg-gradient-to-br from-[#0d1218] via-[#0f1016] to-[#0c090e] p-6 shadow-[0_0_50px_-22px_rgba(56,189,248,0.25)] mb-2"
          aria-label="Matchup intelligence"
        >
          <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
              <Binoculars className="h-4 w-4 text-sky-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-sky-400/90">Matchup intelligence</p>
              <p className="text-lg md:text-xl font-bold text-zinc-50 mt-1">
                You play{" "}
                <span className="text-sky-200">{thisWeekOpponent.ownerName}</span>
                {thisWeekOpponent.teamName ? (
                  <span className="text-zinc-500 font-medium"> · {thisWeekOpponent.teamName}</span>
                ) : null}{" "}
                this week.
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">{weekLabel}</p>
            </div>
          </div>
          {opponentMemberId && opponentDnaQ.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : !opponentMemberId ? (
            <p className="text-sm text-zinc-500">
              Opponent DNA loads when member IDs are on this week&apos;s schedule. Run a league sync if this stays blank.
            </p>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-4 py-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Biggest weakness</dt>
                <dd className="mt-1 text-sm font-semibold text-zinc-100">{matchupWeakLabel}</dd>
              </div>
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-4 py-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Draft tendency</dt>
                <dd className="mt-1 text-sm font-semibold text-zinc-100">{matchupDraftLabel}</dd>
              </div>
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-4 py-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Trade tendency</dt>
                <dd className="mt-1 text-sm font-semibold text-zinc-100">{matchupTradeLabel}</dd>
              </div>
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-4 py-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Most likely keeper</dt>
                <dd className="mt-1 text-sm font-semibold text-zinc-100">{matchupKeeperLabel}</dd>
                {!(draftIntelQ as any)?.data?.ok ? (
                  <p className="text-[10px] text-zinc-600 mt-1">Sync draft data for keeper model.</p>
                ) : null}
              </div>
            </dl>
          )}
        </section>
      ) : null}

      {/* GM Command Center - richer CommandDashboard aesthetic; data sourced from draftIntelQ */}
      {(() => {
        const di: any = draftIntelQ as any;
        if (!di?.data?.ok) return null;
        const d: any = di.data ?? {};
        const meters: any[] = d.shockMeters ?? [];
        const runs: any[] = d.positionRunAlerts ?? [];
        const scarce: any[] = d.scarcityAlerts ?? [];
        const teamCount: number = d.teamCount ?? leagueCtx.teamCount ?? 0;
        const keepersCap = d.leagueCapabilities?.keepers !== false;
        const GOLD = "#f5c518", TEAL = "#a3e635", MUTED = "#8b97a8", RED = "#ef4444", ORANGE = "#f7902f", BLUE = "#8b5cf6", TXT = "#f3f8ff", ACCENT = "#a3e635";
        const PANEL = { background: "linear-gradient(180deg,#1b131f,#140e17)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 15 } as const;
        const SUB = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10 } as const;
        const fn = (x: any) => String(x || "").trim().split(" ")[0] || "Owner";
        const sev = (c: number) => (c >= 60 ? { t: "High", color: RED } : c >= 40 ? { t: "Med", color: ORANGE } : { t: "Low", color: TEAL });
        const arch = (m: any) => { const p = Number(m?.predictabilityScore ?? 0), su = Number(m?.surpriseProbability ?? 0); if (su >= 55) return { label: "Panic Pivot", color: RED }; if (p >= 72) return { label: "By-the-Book", color: TEAL }; if (p >= 55) return { label: "Steady Hand", color: BLUE }; return { label: "Wildcard", color: ORANGE }; };
        const bySurprise = [...meters].sort((a, b) => (b.surpriseProbability ?? 0) - (a.surpriseProbability ?? 0));
        const byPredict = [...meters].sort((a, b) => (b.predictabilityScore ?? 0) - (a.predictabilityScore ?? 0));
        const topRuns = [...runs].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
        const dnaOwners = byPredict.slice(0, 4);
        const avgPredict = meters.length ? Math.round(meters.reduce((s, m) => s + (m.predictabilityScore ?? 0), 0) / meters.length) : 0;
        const ownerCoverage = teamCount ? Math.min(100, Math.round((meters.length / teamCount) * 100)) : 0;
        const topSurprise = bySurprise[0];
        const topRun = topRuns[0];
        const pulse: any[] = [
          ...topRuns.slice(0, 2).map((r: any) => ({ icon: "\u2316", text: `${r.position} scarcity run forming`, s: sev(r.confidence ?? 0) })),
          ...(scarce[0] ? [{ icon: "\u25CC", text: `${scarce[0].position || "Value"} value window open`, s: sev(45) }] : []),
          ...(topSurprise ? [{ icon: "\u273A", text: `${fn(topSurprise.ownerName)} surprise risk ${Math.round(topSurprise.surpriseProbability ?? 0)}%`, s: sev(topSurprise.surpriseProbability ?? 0) }] : []),
        ];
        const memo = meters.length === 0 ? "Sync your league to generate today's GM briefing." : `Draft prep is live. ${topSurprise ? fn(topSurprise.ownerName) + " is your least predictable rival (" + (topSurprise.mostLikelyPosition || "flex") + " lean). " : ""}${topRun ? topRun.position + " run risk is the strongest board signal. " : ""}Protect leverage where value is thin.`;
        const metrics = [
          topSurprise && { b: `${Math.round(topSurprise.surpriseProbability ?? 0)}%`, s: `${fn(topSurprise.ownerName)} surprise` },
          bySurprise[1] && { b: `${Math.round(bySurprise[1].surpriseProbability ?? 0)}%`, s: `${fn(bySurprise[1].ownerName)} surprise` },
          topRun && { b: `${Math.round(topRun.confidence ?? 0)}%`, s: `${topRun.position} run risk` },
          { b: `${pulse.length}`, s: "Live signals" },
        ].filter(Boolean) as any[];
        const actions = [
          { t: "Open Draft War Room", to: "/draft-war-room", d: topRun ? `${topRun.position} run risk building - get owner-risk context.` : "Next pick needs owner-risk context.", cta: "Review" },
          { t: "Scan Owner DNA", to: "/owner-profiles", d: topSurprise ? `${fn(topSurprise.ownerName)} is ${Math.round(topSurprise.surpriseProbability ?? 0)}% surprise risk${teamCount ? ` in this ${teamCount}-team league` : ""}.` : "Review owner tendencies.", cta: "Analyze" },
          ...(keepersCap ? [{ t: "Check Keeper Lab", to: "/keeper-advisor", d: "Confirm your value holds before the draft.", cta: "Compare" }] : []),
        ];
        const rings = [
          { v: ownerCoverage, label: "Owner Read", sub: `${meters.length}/${teamCount || "?"} profiled`, color: TEAL },
          { v: avgPredict, label: "Predictability", sub: "League avg", color: GOLD },
          { v: topRun ? Math.round(topRun.confidence ?? 0) : 0, label: "Top Signal", sub: topRun ? `${topRun.position} run` : "-", color: BLUE },
        ];
        const readinessTable = [
          { k: "Owners profiled", v: `${meters.length}/${teamCount || "?"}` },
          { k: "Position run windows", v: `${runs.length}` },
          { k: "Value windows", v: `${scarce.length}` },
        ];
        return (
          <div className="mb-4 space-y-3" style={{ color: TXT }}>
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
              <div style={PANEL} className="overflow-hidden"><div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[18px] font-extrabold tracking-tight flex items-center gap-2"><Star className="h-5 w-5" style={{ color: ACCENT }} /> Today's GM Briefing</h3>
                  <span className="px-2 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap" style={{ background: "rgba(163,230,53,.10)", border: "1px solid rgba(163,230,53,.33)", color: TEAL }}>{pulse.length} signals</span>
                </div>
                <div className="mt-3 text-[17px] leading-snug font-black" style={{ color: GOLD }}>{memo}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
                  {metrics.map((m: any, i: number) => (<div key={i} style={SUB} className="p-2.5"><b className="block text-xl">{m.b}</b><span className="text-xs" style={{ color: MUTED }}>{m.s}</span></div>))}
                </div>
              </div></div>
              <div style={PANEL} className="overflow-hidden"><div className="p-[18px]">
                <h3 className="text-[18px] font-extrabold tracking-tight flex items-center gap-2"><Activity className="h-5 w-5" style={{ color: ACCENT }} /> League Intelligence Pulse</h3>
                <div className="mt-3">
                  {pulse.length === 0 && <div className="text-sm py-6 text-center" style={{ color: MUTED }}>No live signals yet.</div>}
                  {pulse.map((p: any, i: number) => (<div key={i} className="grid items-center gap-2 h-9 text-sm" style={{ gridTemplateColumns: "26px 1fr 58px", borderTop: "1px solid rgba(255,255,255,.06)" }}><span style={{ color: MUTED }}>{p.icon}</span><span>{p.text}</span><b className="text-right font-black" style={{ color: p.s.color }}>{p.s.t}</b></div>))}
                </div>
              </div></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div style={PANEL} className="overflow-hidden"><div className="p-[18px]">
                <h3 className="text-[18px] font-extrabold tracking-tight flex items-center gap-2" style={{ color: TXT }}><span style={{ color: ACCENT }}>&rarr;</span> Action Queue</h3>
                <div className="mt-3 space-y-2.5">
                  {actions.map((a: any, i: number) => (<Link key={i} to={a.to} className="grid items-center gap-2.5 no-underline" style={{ gridTemplateColumns: "34px 1fr 78px", ...SUB, padding: "8px 10px", minHeight: 60, color: TXT }}><span className="w-[30px] h-[30px] rounded-full flex items-center justify-center font-black" style={{ background: "rgba(139,92,246,.14)", border: "1px solid rgba(139,92,246,.45)", color: ACCENT }}>{i + 1}</span><span><b className="block text-sm">{a.t}</b><span className="text-xs" style={{ color: MUTED }}>{a.d}</span></span><span className="text-center text-xs font-extrabold rounded-md px-2 py-1.5" style={{ border: "1px solid rgba(163,230,53,.35)", background: "rgba(163,230,53,.08)", color: TEAL }}>{a.cta}</span></Link>))}
                </div>
              </div></div>
              <div style={PANEL} className="overflow-hidden"><div className="p-[18px]">
                <h3 className="text-[18px] font-extrabold tracking-tight flex items-center gap-2"><Users className="h-5 w-5" style={{ color: ACCENT }} /> Owner DNA Snapshot</h3>
                <div className="mt-2">
                  {dnaOwners.length === 0 && <div className="text-sm py-6 text-center" style={{ color: MUTED }}>No owner reads yet.</div>}
                  {dnaOwners.map((m: any, i: number) => { const a = arch(m); return (<div key={i} className="grid items-center gap-2.5 h-[50px]" style={{ gridTemplateColumns: "36px 1fr 70px", borderTop: "1px solid rgba(255,255,255,.06)" }}><span className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white" style={{ background: a.color }}>{fn(m.ownerName).charAt(0).toUpperCase()}</span><span><b className="block text-sm">{fn(m.ownerName)}</b><span className="text-xs" style={{ color: MUTED }}>{a.label}</span></span><span className="text-right font-black" style={{ color: TEAL }}>{Math.round(m.predictabilityScore ?? 0)}%</span></div>); })}
                </div>
              </div></div>
            </div>
            <div style={PANEL} className="overflow-hidden"><div className="p-[18px]">
              <h3 className="text-[18px] font-extrabold tracking-tight flex items-center gap-2"><Trophy className="h-5 w-5" style={{ color: ACCENT }} /> GM Readiness</h3>
              <div className="grid grid-cols-3 gap-2.5 mt-3">
                {rings.map((r: any, i: number) => (<div key={i} style={SUB} className="flex flex-col items-center justify-center py-4"><div className="w-[62px] h-[62px] rounded-full flex items-center justify-center text-xl font-black mb-2" style={{ border: `5px solid ${r.color}` }}>{r.v}</div><b className="text-sm">{r.label}</b><span className="text-xs" style={{ color: MUTED }}>{r.sub}</span></div>))}
              </div>
              <div className="mt-3">
                {readinessTable.map((t: any, i: number) => (<div key={i} className="grid items-center h-7 text-sm" style={{ gridTemplateColumns: "1fr 80px", borderTop: "1px solid rgba(255,255,255,.06)" }}><span style={{ color: MUTED }}>{t.k}</span><b className="text-right" style={{ color: TEAL }}>{t.v}</b></div>))}
              </div>
            </div></div>
          </div>
        );
      })()}

      {/* ── Intelligence Briefing Layer: Rival Threats · Decision Memo · Historical Receipts ── */}
      <section aria-label="Intelligence briefing" className="grid gap-4 lg:grid-cols-3 mb-2">

        {/* 1. Rival Threat Window */}
        <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-[#130d0d] via-[#110c14] to-[#0c090e] p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-red-400/80">Rival Threat Window</p>
              <p className="text-[10px] text-zinc-600">Highest-scoring opponents</p>
            </div>
          </div>
          {standingsQ.isLoading ? (
            <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-8 rounded-lg bg-zinc-800/60 animate-pulse" />)}</div>
          ) : (() => {
            const threats = (ranked ?? [])
              .slice().sort((a: any, b: any) => (b.pointsFor ?? 0) - (a.pointsFor ?? 0))
              .slice(0, 4);
            if (!threats.length) return <p className="text-xs text-zinc-600">Sync league data to see threats.</p>;
            return (
              <ul className="space-y-2">
                {threats.map((t: any, i: number) => (
                  <li key={t.teamId ?? i} className="flex items-center gap-3 rounded-lg bg-zinc-900/50 border border-zinc-800/40 px-3 py-2">
                    <span className={cn("text-[10px] font-black w-5 text-center tabular-nums", i === 0 ? "text-red-400" : i === 1 ? "text-orange-400/80" : "text-zinc-600")}>#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-200 truncate">{t.ownerName ?? t.teamName ?? "—"}</p>
                      <p className="text-[10px] text-zinc-600">{t.wins ?? 0}W–{t.losses ?? 0}L</p>
                    </div>
                    <span className="text-xs font-black tabular-nums text-zinc-300">{typeof t.pointsFor === "number" ? t.pointsFor.toFixed(0) : "—"}</span>
                  </li>
                ))}
              </ul>
            );
          })()}
          <Link to="/owner-profiles" className="mt-4 flex items-center gap-1 text-[10px] font-bold text-red-400/80 hover:text-red-300 transition-colors">
            Owner profiles <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {/* 2. Decision Memo */}
        <div className="rounded-2xl border border-lime-500/20 bg-gradient-to-br from-[#0f0b12] via-[#110c14] to-[#0c090e] p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-lime-500/10 border border-lime-500/25 flex items-center justify-center shrink-0">
              <FileText className="h-3.5 w-3.5 text-lime-400" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-lime-400/80">Decision Memo</p>
              <p className="text-[10px] text-zinc-600">Your draft action plan</p>
            </div>
          </div>
          {(draftIntelQ as any)?.isLoading ? (
            <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-8 rounded-lg bg-zinc-800/60 animate-pulse" />)}</div>
          ) : (() => {
            const di = (draftIntelQ as any)?.data;
            if (!di?.ok) return <p className="text-xs text-zinc-600">Sync draft data to generate memo.</p>;
            const keepMemo = di.leagueCapabilities?.keepers !== false;
            const kps: any[] = di.keeperPredictions ?? [];
            const top = kps.slice().sort((a: any, b: any) => (b.kvs ?? 0) - (a.kvs ?? 0))[0];
            const sas: any[] = di.scarcityAlerts ?? [];
            const crit = sas.find((a: any) => a.urgency === "CRITICAL" || a.urgency === "HIGH");
            const runs: any[] = di.positionRunAlerts ?? [];
            const topRun = runs[0];
            const memo = [
              {
                label: "Primary",
                color: "text-lime-400",
                text: keepMemo && top
                  ? `Lock ${top.predictedPlayer} as keeper — KVS ${top.kvs} at Round ${top.keeperRound}`
                  : keepMemo
                    ? "Review keeper eligibility before draft"
                    : crit
                      ? `Secure ${crit.position} depth early — scarcity window active`
                      : topRun
                        ? `Watch the ${topRun.position} window (${topRun.roundWindow ?? "mid-draft"})`
                        : "Best player available early — build positional leverage",
              },
              { label: "Contingency", color: "text-amber-400",   text: crit ? `Secure ${crit.position} depth early — scarcity window active` : "Monitor waiver wire for positional value" },
              { label: "Avoid",       color: "text-red-400",     text: topRun ? `Reaching for ${topRun.position} before ${topRun.roundWindow} — run expected` : "Panic drafting in rounds 1–3" },
            ];
            return (
              <ul className="space-y-2.5">
                {memo.map((m, i) => (
                  <li key={i} className="flex gap-2.5 text-xs">
                    <span className={cn("shrink-0 font-black w-18 text-right", m.color)} style={{minWidth:"68px"}}>{m.label}:</span>
                    <span className="text-zinc-400 leading-snug">{m.text}</span>
                  </li>
                ))}
              </ul>
            );
          })()}
          <Link to="/draft-war-room" className="mt-4 flex items-center gap-1 text-[10px] font-bold text-lime-400/80 hover:text-lime-300 transition-colors">
            Full Draft War Room <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {/* 3. Historical Receipts */}
        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-[#13100a] via-[#110c14] to-[#0c090e] p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0">
              <Star className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/80">Historical Receipts</p>
              <p className="text-[10px] text-zinc-600">League decisions on record</p>
            </div>
          </div>
          {hofQ.isLoading ? (
            <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-8 rounded-lg bg-zinc-800/60 animate-pulse" />)}</div>
          ) : (() => {
            const champions: any[] = hofQ.data?.championships?.history ?? [];
            if (!champions.length) return (
              <div className="space-y-2">
                <p className="text-xs text-zinc-600">No championship records found.</p>
                <p className="text-[10px] text-zinc-700">Import historical data to unlock receipts.</p>
              </div>
            );
            return (
              <ul className="space-y-2">
                {champions.slice().reverse().slice(0, 4).map((c: any, i: number) => (
                  <li key={i} className="flex items-center gap-3 rounded-lg bg-zinc-900/50 border border-zinc-800/40 px-3 py-2">
                    <span className="text-[10px] font-black text-amber-400 tabular-nums w-10 shrink-0">{c.season ?? "—"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-200 truncate">{c.displayName ?? c.ownerName ?? "—"}</p>
                      <p className="text-[10px] text-zinc-600">Champion{c.playoffSeed ? ` · Seed ${c.playoffSeed}` : ""}</p>
                    </div>
                    <Trophy className="h-3 w-3 text-amber-500/60 shrink-0" />
                  </li>
                ))}
              </ul>
            );
          })()}
          <div className="mt-4 flex items-center gap-3">
            <Link to="/draft-history" className="flex items-center gap-1 text-[10px] font-bold text-amber-400/80 hover:text-amber-300 transition-colors">
              Draft History <ChevronRight className="h-3 w-3" />
            </Link>
            <span className="text-zinc-700">·</span>
            <Link to="/hall-of-fame" className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
              Hall of Fame <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

      </section>
      {/* Hero — three prestige cards */}
      <section aria-label="League highlights" className="grid gap-4 md:grid-cols-3">
        <div className="flex min-h-[240px] flex-col rounded-2xl border border-amber-500/25 bg-gradient-to-br from-[#1c1420] to-[#110c14] p-5 shadow-[0_0_40px_-12px_rgba(245,158,11,0.35)]">
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

        <div className="flex min-h-[240px] flex-col rounded-2xl border border-red-500/25 bg-gradient-to-br from-[#16101a] to-[#110c14] p-5 shadow-[0_0_36px_-12px_rgba(239,68,68,0.3)]">
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
          {rivalryEligibilityDiagnostics.totalOwners > 0 && (
            <p className="mt-1 text-[9px] text-zinc-600">
              Eligible: {rivalryEligibilityDiagnostics.eligibleOwners} · Filtered: {rivalryEligibilityDiagnostics.filteredOwners} (inactive/unrecognized)
            </p>
          )}
        </div>

        <DashboardLeagueHealthCard isLoading={dataHealthQ.isLoading} data={dataHealthQ.data ?? null} />
      </section>

      {/* Row 2 — standings | marquee matchup | records */}
      <section className="grid gap-4 xl:grid-cols-12" aria-label="League board">
        <div className="space-y-3 xl:col-span-3">
          <div className="flex min-h-[280px] flex-col rounded-2xl border border-white/[0.08] bg-[#18111c]/95 shadow-lg shadow-black/40">
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
              <Link to="/standings" className="text-xs font-medium text-violet-400 hover:text-violet-300">
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
          <div className="flex min-h-[280px] flex-col rounded-2xl border border-amber-500/20 bg-[#18111c]/95 shadow-[0_0_28px_-12px_rgba(245,158,11,0.22)]">
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
        <div className="flex min-h-[220px] flex-col rounded-2xl border border-white/[0.08] bg-[#18111c]/95">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <h3 className="text-sm font-semibold text-zinc-50">Recent League Events</h3>
            <p className="text-xs text-zinc-500">Latest completed transactions (stored league data)</p>
          </div>
          <DashboardRecentLeagueEvents seasons={eventSeasons} enabled={eventSeasons.length > 0} />
        </div>

        <div className="flex min-h-[220px] flex-col rounded-2xl border border-white/[0.08] bg-[#18111c]/95">
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
                  <span key="s" className="tabular-nums font-semibold text-lime-300/90">
                    {o.score}
                  </span>,
                ])}
              />
            )}
          </div>
          <div className="border-t border-white/[0.06] px-4 py-2">
            <Link to="/owner-profiles" className="text-xs font-medium text-violet-400 hover:text-violet-300">
              Owner profiles →
            </Link>
          </div>
        </div>

        <div className="flex min-h-[220px] flex-col rounded-2xl border border-white/[0.08] bg-[#18111c]/95">
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


      <LeagueWireNewsFeed />
      <DevBuildDiagnostics compact />
    </div>
  );
}
