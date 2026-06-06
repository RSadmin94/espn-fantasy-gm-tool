import { useMemo, useState } from "react";
import { useAuth } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Crown,
  Flame,
  Gauge,
  Globe,
  HelpCircle,
  LayoutDashboard,
  Loader2,
  Mail,
  Medal,
  MessageSquare,
  RefreshCw,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

// ── Design tokens (matches app-wide dark theme) ───────────────────────────────

const PAGEBG: React.CSSProperties = {
  background:
    "radial-gradient(circle at 75% -8%,rgba(139,92,246,.18),transparent 40%),radial-gradient(circle at 20% 80%,rgba(16,185,129,.08),transparent 40%),linear-gradient(180deg,#0e0a10,#080609)",
  color: "#f3f8ff",
};

const PANEL =
  "rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,#1b131f,#140e17)] shadow-[0_0_28px_-14px_rgba(0,0,0,0.65)]";

const CARD = cn(PANEL, "p-4 sm:p-5");

// ── Helpers ───────────────────────────────────────────────────────────────────

function unwrap<T>(m: { available: true; value: T } | { available: false; reason: string } | null | undefined): T | null {
  if (m && m.available === true) return m.value;
  return null;
}

function heatColor(label: string): string {
  if (label === "Inferno" || label === "UNTOUCHABLE") return "text-red-400";
  if (label === "Burning" || label === "RISING THREAT") return "text-orange-400";
  if (label === "Heated" || label === "DANGEROUS") return "text-amber-300";
  if (label === "Simmering" || label === "NEUTRAL") return "text-lime-400";
  return "text-zinc-500";
}

function heatBg(label: string): string {
  if (label === "Inferno" || label === "UNTOUCHABLE") return "border-red-500/25 bg-red-500/10";
  if (label === "Burning" || label === "RISING THREAT") return "border-orange-500/25 bg-orange-500/10";
  if (label === "Heated" || label === "DANGEROUS") return "border-amber-500/25 bg-amber-500/10";
  if (label === "Simmering" || label === "NEUTRAL") return "border-lime-500/25 bg-lime-500/10";
  return "border-zinc-700 bg-zinc-800/40";
}

function storyIcon(storyType: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    REVENGE_GAME: <Swords className="h-4 w-4 text-red-400" />,
    HEARTBREAK_PENDING: <Target className="h-4 w-4 text-orange-400" />,
    COLLAPSE: <TrendingDown className="h-4 w-4 text-red-400" />,
    SILENT_THREAT: <Shield className="h-4 w-4 text-violet-400" />,
    DESPERATION_WINDOW: <AlertTriangle className="h-4 w-4 text-amber-400" />,
    PLAYOFF_BUBBLE: <Gauge className="h-4 w-4 text-cyan-400" />,
    MOMENTUM_SHIFT: <TrendingUp className="h-4 w-4 text-lime-400" />,
    FEAR_RISING: <Flame className="h-4 w-4 text-orange-400" />,
  };
  return icons[storyType] ?? <Sparkles className="h-4 w-4 text-zinc-400" />;
}

function formatDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SectionHeader({
  icon,
  title,
  subtitle,
  accent = "lime",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent?: "lime" | "violet" | "amber" | "orange" | "cyan";
}) {
  const colors: Record<string, string> = {
    lime: "text-lime-400",
    violet: "text-violet-400",
    amber: "text-amber-400",
    orange: "text-orange-400",
    cyan: "text-cyan-400",
  };
  return (
    <div className="flex items-center gap-3">
      <span className={cn("shrink-0", colors[accent] ?? "text-lime-400")}>{icon}</span>
      <div>
        <h2 className="text-[18px] font-extrabold leading-tight text-white/95">{title}</h2>
        <p className="text-[12px] text-white/40">{subtitle}</p>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
      <div className={cn("text-[22px] font-black leading-none tabular-nums", accent ?? "text-white/90")}>{value}</div>
      <div className="mt-1 text-[12px] uppercase tracking-wide text-white/40">{label}</div>
      {sub && <div className="mt-1 text-[12px] text-white/30">{sub}</div>}
    </div>
  );
}

function SmallBadge({ children, color = "zinc" }: { children: React.ReactNode; color?: string }) {
  const cls: Record<string, string> = {
    lime: "border-lime-500/30 bg-lime-500/10 text-lime-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    zinc: "border-white/10 bg-white/[0.04] text-white/60",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cls[color] ?? cls.zinc)}>
      {children}
    </span>
  );
}

function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className={cn(CARD, "space-y-2")}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cn("h-3 animate-pulse rounded bg-white/[0.05]", i === 0 ? "w-1/2" : i === 1 ? "w-3/4" : "w-2/3")} />
      ))}
    </div>
  );
}

// ── Copy helpers ───────────────────────────────────────────────────────────────

function copyText(text: string) {
  void navigator.clipboard.writeText(text).catch(() => {});
}

function BroadcastCard({
  icon,
  label,
  fact,
}: {
  icon: React.ReactNode;
  label: string;
  fact: string;
}) {
  const [copied, setCopied] = useState(false);

  const email = `mailto:?subject=${encodeURIComponent("League Update")}&body=${encodeURIComponent(fact)}`;
  const discordText = `> ${fact}`;

  function handleCopy() {
    copyText(fact);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn(PANEL, "p-4 space-y-3")}>
      <div className="flex items-center gap-2">
        <span className="text-violet-400 shrink-0">{icon}</span>
        <span className="text-[12px] font-bold uppercase tracking-[0.15em] text-white/40">{label}</span>
      </div>
      <p className="text-[14px] leading-relaxed text-white/80 italic">"{fact}"</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[12px] font-medium text-violet-200 transition-colors hover:bg-violet-500/20"
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-lime-400" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </button>
        <a
          href={email}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white/80"
        >
          <Mail className="h-3.5 w-3.5" /> Email
        </a>
        <button
          type="button"
          onClick={() => copyText(discordText)}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white/80"
        >
          <MessageSquare className="h-3.5 w-3.5" /> Discord
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CommissionerCommandCenter() {
  const [refreshing, setRefreshing] = useState(false);
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { leagueContextKey } = useLeagueContext();
  const leagueKeyReady =
    Boolean(authLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  // ── All data queries ──────────────────────────────────────────────────────
  const activeLeagueQ = trpc.league.getActive.useQuery(undefined, { staleTime: 30_000 });
  const allSeasonsQ   = trpc.espn.allSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  const cachedQ       = trpc.espn.cachedSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  const hofQ          = trpc.espn.hallOfFame.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  const medalsQ       = trpc.espn.leagueMedals.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  const standingsQ    = trpc.espn.leagueHistoryStandings.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  const rivalryQ      = trpc.rivalry.getScores.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  const dnaQ          = trpc.activityDna.league.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );

  const allSeasons  = allSeasonsQ.data ?? [];
  const cachedSeasons = cachedQ.data ?? [];
  const latestSeason = cachedSeasons.length > 0 ? Math.max(...cachedSeasons) : (allSeasons.length > 0 ? Math.max(...allSeasons) : 2025);

  const pulseQ      = trpc.weeklyAssessment.leaguePulse.useQuery(
    withLeagueSalt({ season: latestSeason }, leagueContextKey),
    { staleTime: 5 * 60_000, enabled: leagueKeyReady && latestSeason > 0 },
  );
  const fearQ       = trpc.fearIndex.getLatest.useQuery(
    withLeagueSalt({ season: latestSeason }, leagueContextKey),
    { staleTime: 5 * 60_000, enabled: leagueKeyReady && latestSeason > 0 },
  );
  const storylinesQ = trpc.weeklyStorylines.getLatest.useQuery(
    withLeagueSalt({ season: latestSeason }, leagueContextKey),
    { staleTime: 5 * 60_000, enabled: leagueKeyReady && latestSeason > 0 },
  );
  const recentTxQ   = trpc.espn.recentLeagueTransactionEvents.useQuery(
    withLeagueSalt(
      { seasons: cachedSeasons.slice(-2).filter(Boolean), limit: 10 },
      leagueContextKey,
    ),
    { staleTime: 5 * 60_000, enabled: leagueKeyReady && cachedSeasons.length > 0 },
  );

  // ── Derived data ──────────────────────────────────────────────────────────

  const leagueName = activeLeagueQ.data?.leagueName?.trim() || "Your League";
  const leagueSize = pulseQ.data?.teams.length ?? standingsQ.data?.owners.length ?? 0;
  const totalSeasons = allSeasons.length;

  // Activity DNA — most/least active
  const dnaList = useMemo(() => {
    const all = dnaQ.data ?? [];
    return all.filter((o) => (o.archetypes as Record<string, { score: number | null; status: string }>).highActivity?.status === "ok");
  }, [dnaQ.data]);

  const mostActive = useMemo(() => {
    if (!dnaList.length) return null;
    return [...dnaList].sort((a, b) => {
      const sa = (a.archetypes as Record<string, { score: number | null }>).highActivity?.score ?? 0;
      const sb = (b.archetypes as Record<string, { score: number | null }>).highActivity?.score ?? 0;
      return (sb ?? 0) - (sa ?? 0);
    })[0] ?? null;
  }, [dnaList]);

  const leastActive = useMemo(() => {
    if (!dnaList.length) return null;
    return [...dnaList].sort((a, b) => {
      const sa = (a.archetypes as Record<string, { score: number | null }>).highActivity?.score ?? 0;
      const sb = (b.archetypes as Record<string, { score: number | null }>).highActivity?.score ?? 0;
      return (sa ?? 0) - (sb ?? 0);
    })[0] ?? null;
  }, [dnaList]);

  // Current champion — latest medal
  const medals = medalsQ.data ?? [];
  const latestMedal = medals.length > 0 ? medals[medals.length - 1] : null;
  const currentChampion = latestMedal;

  // Longest drought -- among owners with 0 titles.
  // Uses HoF championships leaderboard (identity-resolved) not raw medals (old team names).
  const droughtOwner = useMemo(() => {
    const allOwners = standingsQ.data?.owners ?? [];
    const hofLeaderboard: any[] = hofQ.data?.championships?.leaderboard ?? [];
    const champOwnerKeys = new Set(
      hofLeaderboard.filter(c => (c.titles ?? 0) > 0).map(c => String(c.ownerKey ?? "").toLowerCase().trim()),
    );
    const champDisplayNames = new Set(
      hofLeaderboard.filter(c => (c.titles ?? 0) > 0).map(c => String(c.displayName ?? "").toLowerCase().trim()),
    );
    const noTitles = (allOwners as any[]).filter(
      o => !champOwnerKeys.has(String(o.ownerKey ?? "").toLowerCase().trim()) &&
           !champDisplayNames.has(String(o.displayName ?? "").toLowerCase().trim()),
    );
    if (!noTitles.length) return null;
    return noTitles.sort((a, b) => (b.seasons?.length ?? 0) - (a.seasons?.length ?? 0))[0] ?? null;
  }, [standingsQ.data, hofQ.data]);

  // Rivalry — biggest active
  const rivalries = rivalryQ.data ?? [];
  const biggestRivalry = rivalries.length > 0 ? rivalries[0] : null;

  // Storylines — hottest
  const storylines = storylinesQ.data ?? [];
  const hottestStory = storylines.length > 0
    ? [...storylines].sort((a: any, b: any) => (b.intensityScore ?? 0) - (a.intensityScore ?? 0))[0]
    : null;

  // Fear index
  const fearEntries = fearQ.data ?? [];
  const mostFeared = fearEntries.length > 0 ? fearEntries[0] : null; // rank 1
  const mostExploitable = fearEntries.length > 0
    ? [...fearEntries].sort((a: any, b: any) => (a.exploitabilityInverse ?? 50) - (b.exploitabilityInverse ?? 50))[0]
    : null;

  // Recent transactions
  const recentTxns = recentTxQ.data ?? [];

  // Closest to first championship (most seasons played, 0 titles)

  // Reigning champion display name from HoF (identity-resolved). Used to exclude from Desperation Board.
  const reigningChampName = useMemo(() => {
    const leaderboard: any[] = hofQ.data?.championships?.leaderboard ?? [];
    const allSeasons = leaderboard.flatMap((c: any) => c.titleSeasons ?? []);
    if (!allSeasons.length) return null;
    const maxSeason = Math.max(...allSeasons.filter(Number.isFinite));
    const champ = leaderboard.find((c: any) => (c.titleSeasons ?? []).includes(maxSeason));
    return (champ?.displayName ?? "").toLowerCase().trim() || null;
  }, [hofQ.data]);
  const closestToFirst = droughtOwner;

  // Biggest regression from storylines (COLLAPSE type)
  const collapseStory = storylines.find((s: any) => s.storyType === "COLLAPSE");

  // Silent threat (SILENT_THREAT type)
  const silentThreat = storylines.find((s: any) => s.storyType === "SILENT_THREAT");

  // Rising contender — high fear score + 0 titles
  const champNames = new Set(medals.map((m) => m.championOwner?.toLowerCase().trim()));
  const risingContender = fearEntries.find((e: any) => !champNames.has(e.ownerName?.toLowerCase().trim()) && e.fearScore >= 50);

  // Hall of Fame derived facts
  const hof = hofQ.data;
  const hofHighScore = hof ? unwrap(hof.singleGameRecords.highestTeamScore) : null;
  const hofMostGames = hof ? unwrap(hof.rivalryRecords.mostGamesPlayed) : null;
  const hofBlowout = hof ? unwrap(hof.singleGameRecords.biggestBlowout) : null;
  const hofBestRecord = hof ? unwrap(hof.seasonRecords.bestRegularSeasonRecord) : null;
  const hofChampLeader = hof?.championships.leaderboard[0] ?? null;

  // Broadcast facts (deterministic strings)
  const broadcastFacts = useMemo(() => {
    const facts: { label: string; icon: React.ReactNode; fact: string }[] = [];

    if (hof && totalSeasons > 0) {
      const games = hof.coverage.completedRsGmMatchupGames;
      facts.push({
        label: "League Fact",
        icon: <Globe className="h-4 w-4" />,
        fact: games > 0
          ? `${leagueName} has played ${games.toLocaleString()} regular-season games across ${totalSeasons} seasons. Every game counts.`
          : `${leagueName} has ${totalSeasons} seasons of history and counting.`,
      });
    }

    if (hofMostGames) {
      facts.push({
        label: "Rivalry Fact",
        icon: <Swords className="h-4 w-4" />,
        fact: `${hofMostGames.displayA} and ${hofMostGames.displayB} have faced each other ${hofMostGames.games} times — the most contested rivalry in ${leagueName} history.`,
      });
    } else if (biggestRivalry) {
      facts.push({
        label: "Rivalry Fact",
        icon: <Swords className="h-4 w-4" />,
        fact: `The hottest rivalry in ${leagueName} is burning at ${biggestRivalry.heatLabel} level. ${biggestRivalry.rivalName} has been the biggest thorn with ${biggestRivalry.h2hLosses} head-to-head losses.`,
      });
    }

    if (hofHighScore) {
      facts.push({
        label: "Hall of Fame Fact",
        icon: <Trophy className="h-4 w-4" />,
        fact: `${hofHighScore.label} holds the ${leagueName} single-game record with ${hofHighScore.score.toFixed(1)} points in Week ${hofHighScore.week} of ${hofHighScore.season}. That record still stands.`,
      });
    }

    if (hofChampLeader) {
      facts.push({
        label: "Championship Fact",
        icon: <Crown className="h-4 w-4" />,
        fact: `${hofChampLeader.displayName} leads ${leagueName} with ${hofChampLeader.titles} championship${hofChampLeader.titles === 1 ? "" : "s"} (${hofChampLeader.titleSeasons.join(", ")}). The dynasty is real.`,
      });
    }

    if (droughtOwner) {
      facts.push({
        label: "Drought Fact",
        icon: <HelpCircle className="h-4 w-4" />,
        fact: `${droughtOwner.displayName} has played ${droughtOwner.seasons.length} seasons in ${leagueName} without winning a championship. Every year is the year.`,
      });
    }

    if (hofBlowout) {
      facts.push({
        label: "Blowout Fact",
        icon: <Zap className="h-4 w-4" />,
        fact: `The biggest blowout in ${leagueName} history was ${hofBlowout.margin.toFixed(1)} points — ${hofBlowout.winnerLabel} over ${hofBlowout.loserLabel} in ${hofBlowout.season}.`,
      });
    }

    if (hofBestRecord) {
      facts.push({
        label: "Season Record Fact",
        icon: <Medal className="h-4 w-4" />,
        fact: `${hofBestRecord.displayName}'s ${hofBestRecord.season} season (${hofBestRecord.wins}–${hofBestRecord.losses}) remains the best regular-season record in ${leagueName} history.`,
      });
    }

    return facts;
  }, [hof, hofMostGames, hofHighScore, hofChampLeader, hofBlowout, hofBestRecord, droughtOwner, biggestRivalry, leagueName, totalSeasons]);

  const anyLoading = hofQ.isLoading || medalsQ.isLoading || standingsQ.isLoading || pulseQ.isLoading;

  return (
    <div className="-m-4 md:-m-6 min-h-full px-4 pt-6 pb-20 sm:px-6" style={PAGEBG}>
      <div className="mx-auto max-w-5xl space-y-8">

        {/* ── PAGE HEADER ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-violet-300">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Commissioner Command Center
              </div>
              <h1 className="text-[28px] font-black leading-tight sm:text-[36px]">
                {leagueName}
                <span className="align-super text-[0.4em] text-white/35">™</span>
              </h1>
              <p className="mt-1 text-[13px] text-white/40">
                {totalSeasons > 0 && <>{totalSeasons} seasons · </>}
                {leagueSize > 0 && <>{leagueSize} teams · </>}
                League intelligence at a glance
              </p>
            </div>
            <button
              type="button"
              disabled={refreshing}
              onClick={() => setRefreshing(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/90 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Refresh
            </button>
          </div>

          {/* Quick stats strip */}
          {!anyLoading && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Active Seasons" value={totalSeasons} accent="text-lime-400" />
              <StatTile label="Teams" value={leagueSize || "—"} />
              <StatTile
                label="Current Champion"
                value={currentChampion?.championOwner?.split(" ")[0] ?? "—"}
                sub={currentChampion ? String(currentChampion.season) : undefined}
                accent="text-amber-300"
              />
              <StatTile
                label="Most Feared"
                value={mostFeared ? mostFeared.ownerName.split(" ")[0] : "—"}
                sub={mostFeared ? mostFeared.heatLabel : undefined}
                accent="text-red-400"
              />
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION A — LEAGUE PULSE
        ════════════════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionHeader
            icon={<Activity className="h-5 w-5" />}
            title="League Pulse"
            subtitle="Activity, transactions, and current state of the league"
            accent="lime"
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

            {/* Most Active */}
            {dnaQ.isLoading ? <LoadingCard /> : mostActive ? (
              <div className={CARD}>
                <div className="mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-lime-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Most Active Owner</span>
                </div>
                <p className="text-lg font-bold text-white/95">{mostActive.ownerName}</p>
                <p className="mt-1 text-sm text-white/55">{mostActive.primaryDNA}</p>
                <div className="mt-3 flex items-center gap-2">
                  <SmallBadge color="lime">{mostActive.seasons} seasons</SmallBadge>
                  <SmallBadge color="lime">{mostActive.confidence}</SmallBadge>
                </div>
                <p className="mt-2 text-[12px] text-white/30 leading-snug">{mostActive.evidence[0]}</p>
              </div>
            ) : <LoadingCard />}

            {/* Least Active */}
            {dnaQ.isLoading ? <LoadingCard /> : leastActive ? (
              <div className={CARD}>
                <div className="mb-3 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-zinc-500" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Least Active Owner</span>
                </div>
                <p className="text-lg font-bold text-white/95">{leastActive.ownerName}</p>
                <p className="mt-1 text-sm text-white/55">{leastActive.primaryDNA}</p>
                <div className="mt-3 flex items-center gap-2">
                  <SmallBadge>{leastActive.seasons} seasons</SmallBadge>
                  <SmallBadge>{leastActive.confidence}</SmallBadge>
                </div>
                <p className="mt-2 text-[12px] text-white/30 leading-snug">{leastActive.evidence[0]}</p>
              </div>
            ) : <LoadingCard />}

            {/* Current Champion */}
            {medalsQ.isLoading ? <LoadingCard /> : currentChampion ? (
              <div className={cn(CARD, "border-amber-500/20 bg-gradient-to-b from-amber-500/[0.06] to-transparent")}>
                <div className="mb-3 flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-amber-300/60">Reigning Champion</span>
                </div>
                <p className="text-xl font-black text-amber-200">{currentChampion.championOwner}</p>
                <p className="mt-1 text-sm text-white/55">{currentChampion.season} season</p>
                {currentChampion.runnerUpOwner && (
                  <p className="mt-3 text-[12px] text-white/30">
                    Runner-up: <span className="text-white/50">{currentChampion.runnerUpOwner}</span>
                  </p>
                )}
                <div className="mt-3 text-2xl" aria-hidden>🏆</div>
              </div>
            ) : <LoadingCard />}

            {/* League Activity Snapshot */}
            {dnaQ.isLoading ? <LoadingCard lines={4} /> : dnaList.length > 0 ? (
              <div className={cn(CARD, "sm:col-span-2 lg:col-span-1")}>
                <div className="mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Activity Snapshot</span>
                </div>
                <div className="space-y-2">
                  {dnaList
                    .sort((a, b) => {
                      const sa = (a.archetypes as any).highActivity?.score ?? 0;
                      const sb = (b.archetypes as any).highActivity?.score ?? 0;
                      return (sb ?? 0) - (sa ?? 0);
                    })
                    .slice(0, 5)
                    .map((owner) => {
                      const score = (owner.archetypes as any).highActivity?.score ?? 0;
                      return (
                        <div key={owner.ownerId} className="flex items-center gap-3">
                          <div className="w-24 shrink-0 text-[12px] text-white/60 truncate">{owner.ownerName.split(" ")[0]}</div>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className="h-full rounded-full bg-lime-400/60"
                              style={{ width: `${Math.max(4, score)}%` }}
                            />
                          </div>
                          <div className="w-8 shrink-0 text-right text-[12px] tabular-nums text-white/40">{score}</div>
                        </div>
                      );
                    })}
                </div>
                <p className="mt-3 text-[12px] text-white/25">Activity percentile scores (0–100)</p>
              </div>
            ) : null}

            {/* League Identity */}
            <div className={cn(CARD, "space-y-3")}>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-400" />
                <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">League Identity</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5 text-center">
                  <div className="text-xl font-black text-violet-300 tabular-nums">{leagueSize || "—"}</div>
                  <div className="text-[10px] uppercase tracking-wide text-white/35">Teams</div>
                </div>
                <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5 text-center">
                  <div className="text-xl font-black text-violet-300 tabular-nums">{totalSeasons || "—"}</div>
                  <div className="text-[10px] uppercase tracking-wide text-white/35">Seasons</div>
                </div>
                {hof && hof.coverage.completedRsGmMatchupGames > 0 && (
                  <div className="col-span-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5 text-center">
                    <div className="text-xl font-black text-violet-300 tabular-nums">
                      {hof.coverage.completedRsGmMatchupGames.toLocaleString()}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-white/35">Games Played</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className={cn(PANEL, "p-4 sm:p-5")}>
            <div className="mb-4 flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-lime-400" />
              <span className="text-[13px] font-bold uppercase tracking-[0.1em] text-white/70">Recent Transactions</span>
              {recentTxQ.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/30" />}
            </div>
            {recentTxQ.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-3 w-full animate-pulse rounded bg-white/[0.04]" />
                ))}
              </div>
            ) : recentTxns.length === 0 ? (
              <p className="text-[13px] text-white/30">No recent transactions found. Sync a season to populate.</p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {recentTxns.slice(0, 8).map((tx: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="text-[12px] font-semibold text-white/60">{tx.eventType}</span>
                      {" "}
                      <span className="text-[13px] text-white/80">{tx.playersLine}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[12px] text-white/35">{tx.teamLabel}</div>
                      <div className="text-[10px] text-white/25">{formatDate(tx.processedMs)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION B — LEAGUE STORYLINES
        ════════════════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionHeader
            icon={<Sparkles className="h-5 w-5" />}
            title="League Storylines"
            subtitle="The rivalries, collapses, and moments defining your league right now"
            accent="violet"
          />

          <div className="grid gap-3 sm:grid-cols-2">

            {/* Biggest Active Rivalry */}
            {rivalryQ.isLoading ? <LoadingCard /> : biggestRivalry ? (
              <div className={cn(CARD, "border-red-500/15")}>
                <div className="mb-3 flex items-center gap-2">
                  <Swords className="h-4 w-4 text-red-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Biggest Active Rivalry</span>
                  <SmallBadge color="red">{biggestRivalry.heatLabel}</SmallBadge>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-base font-bold text-white/90">You</p>
                    <p className="text-[12px] text-white/40">{biggestRivalry.h2hWins}W</p>
                  </div>
                  <div className="flex-1 text-center">
                    <div className={cn("inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-bold uppercase tracking-wide", heatBg(biggestRivalry.heatLabel))}>
                      <span className={heatColor(biggestRivalry.heatLabel)}>{biggestRivalry.heatLabel}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-white/25">score: {biggestRivalry.rivalryScore}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-white/90">{biggestRivalry.rivalName.split(" ")[0]}</p>
                    <p className="text-[12px] text-white/40">{biggestRivalry.h2hLosses}W</p>
                  </div>
                </div>
                {biggestRivalry.loreSentence && (
                  <p className="mt-3 text-[13px] italic text-white/50 leading-snug">"{biggestRivalry.loreSentence}"</p>
                )}
                <div className="mt-3 flex gap-3 text-[12px] text-white/35">
                  {biggestRivalry.playoffEliminations > 0 && (
                    <span className="text-red-400">{biggestRivalry.playoffEliminations} playoff elim{biggestRivalry.playoffEliminations > 1 ? "s" : ""}</span>
                  )}
                  {biggestRivalry.closeLossCount > 0 && (
                    <span>{biggestRivalry.closeLossCount} close losses</span>
                  )}
                </div>
              </div>
            ) : (
              <div className={CARD}>
                <div className="mb-2 flex items-center gap-2">
                  <Swords className="h-4 w-4 text-zinc-600" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Biggest Active Rivalry</span>
                </div>
                <p className="text-sm text-white/30">No rivalry data yet. Sync seasons to populate.</p>
              </div>
            )}

            {/* Hottest Storyline */}
            {storylinesQ.isLoading ? <LoadingCard /> : hottestStory ? (
              <div className={cn(CARD, "border-orange-500/15")}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {storyIcon((hottestStory as any).storyType)}
                    <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Hottest Storyline</span>
                  </div>
                  <SmallBadge color="orange">{(hottestStory as any).emotionalTag}</SmallBadge>
                </div>
                <p className="text-[16px] font-bold text-white/95 leading-snug">{(hottestStory as any).headline}</p>
                {(hottestStory as any).bodyText && (
                  <p className="mt-2 text-[13px] text-white/55 leading-relaxed line-clamp-3">{(hottestStory as any).bodyText}</p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-orange-400"
                      style={{ width: `${Math.min(100, (hottestStory as any).intensityScore ?? 0)}%` }}
                    />
                  </div>
                  <span className="text-[12px] font-semibold tabular-nums text-orange-300">{(hottestStory as any).intensityScore}</span>
                </div>
              </div>
            ) : (
              <div className={CARD}>
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-zinc-600" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Hottest Storyline</span>
                </div>
                <p className="text-sm text-white/30">No storylines generated yet. Refresh to compute.</p>
              </div>
            )}

            {/* Longest Championship Drought */}
            {standingsQ.isLoading ? <LoadingCard /> : droughtOwner ? (
              <div className={CARD}>
                <div className="mb-3 flex items-center gap-2">
                  <Skull className="h-4 w-4 text-zinc-500" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Longest Championship Drought</span>
                </div>
                <p className="text-xl font-bold text-white/90">{droughtOwner.displayName}</p>
                <p className="mt-2 text-[28px] font-black tabular-nums text-zinc-400">
                  {droughtOwner.seasons.length}
                  <span className="text-[14px] font-normal text-zinc-600 ml-1">seasons</span>
                </p>
                <p className="mt-1 text-[12px] text-white/30">Without a championship. Still chasing.</p>
              </div>
            ) : <LoadingCard />}

            {/* Closest to First Championship */}
            {standingsQ.isLoading || medalsQ.isLoading ? <LoadingCard /> : closestToFirst ? (
              <div className={cn(CARD, "border-amber-500/10")}>
                <div className="mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-amber-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Closest to First Championship</span>
                </div>
                <p className="text-xl font-bold text-white/90">{closestToFirst.displayName}</p>
                <p className="mt-1 text-sm text-white/55">
                  {closestToFirst.seasons.length} seasons of experience, 0 titles
                </p>
                <p className="mt-2 text-[12px] text-white/30 leading-snug">
                  The most seasoned owner without a ring. Most likely to break through next.
                </p>
                <div className="mt-3">
                  <SmallBadge color="amber">Hungry</SmallBadge>
                </div>
              </div>
            ) : <LoadingCard />}

          </div>

          {/* All Storylines feed */}
          {storylines.length > 1 && (
            <div className={cn(PANEL, "p-4 sm:p-5")}>
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-400" />
                <span className="text-[13px] font-bold uppercase tracking-[0.1em] text-white/60">All Storylines This Week</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[...storylines]
                  .sort((a: any, b: any) => (b.intensityScore ?? 0) - (a.intensityScore ?? 0))
                  .map((story: any, i: number) => (
                    <div key={`${story.storyType}-${story.teamId}-${i}`} className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                      <span className="mt-0.5 shrink-0">{storyIcon(story.storyType)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-white/30">{story.emotionalTag}</span>
                          <span className="ml-auto text-[12px] font-semibold tabular-nums text-white/35">{story.intensityScore}</span>
                        </div>
                        <p className="mt-1 text-[13px] font-semibold text-white/85 leading-snug line-clamp-2">{story.headline}</p>
                        {story.supportingStat && (
                          <p className="mt-1 text-[12px] text-white/35">{story.supportingStat}</p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION C — COMMISSIONER INSIGHTS
        ════════════════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionHeader
            icon={<Gauge className="h-5 w-5" />}
            title="Commissioner Insights"
            subtitle="Who is rising, falling, threatening, and most ready to compete"
            accent="cyan"
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

            {/* Rising Contender */}
            {fearQ.isLoading ? <LoadingCard /> : risingContender ? (
              <div className={cn(CARD, "border-lime-500/15")}>
                <div className="mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-lime-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Rising Contender</span>
                </div>
                <p className="text-xl font-bold text-white/95">{(risingContender as any).ownerName}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className={cn("rounded-full border px-2.5 py-1 text-[12px] font-bold", heatBg((risingContender as any).heatLabel))}>
                    <span className={heatColor((risingContender as any).heatLabel)}>{(risingContender as any).heatLabel}</span>
                  </div>
                  <span className="text-[12px] tabular-nums text-white/40">Fear: {(risingContender as any).fearScore}</span>
                </div>
                <p className="mt-2 text-[12px] text-white/30 leading-snug">No title yet — this is their window.</p>
              </div>
            ) : fearQ.isError || fearEntries.length === 0 ? (
              <div className={CARD}>
                <div className="mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-zinc-600" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Rising Contender</span>
                </div>
                <p className="text-sm text-white/30">Run a Fear Index refresh to populate.</p>
              </div>
            ) : null}

            {/* Biggest Regression */}
            {storylinesQ.isLoading ? <LoadingCard /> : collapseStory ? (
              <div className={cn(CARD, "border-red-500/15")}>
                <div className="mb-3 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Biggest Regression</span>
                </div>
                <p className="text-xl font-bold text-white/95">{(collapseStory as any).ownerName}</p>
                <p className="mt-1 text-sm text-white/55">{(collapseStory as any).record}</p>
                <p className="mt-2 text-[13px] font-semibold text-red-300/80">{(collapseStory as any).headline}</p>
                <p className="mt-1 text-[12px] text-white/30">{(collapseStory as any).supportingStat}</p>
              </div>
            ) : (
              <div className={CARD}>
                <div className="mb-2 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-zinc-600" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Biggest Regression</span>
                </div>
                <p className="text-sm text-white/30">
                  {storylinesQ.isLoading ? "Loading…" : "No collapse detected this week."}
                </p>
              </div>
            )}

            {/* Silent Threat / Most Improved */}
            {storylinesQ.isLoading ? <LoadingCard /> : silentThreat ? (
              <div className={cn(CARD, "border-violet-500/15")}>
                <div className="mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-violet-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Silent Threat</span>
                </div>
                <p className="text-xl font-bold text-white/95">{(silentThreat as any).ownerName}</p>
                <p className="mt-1 text-sm text-white/55">{(silentThreat as any).record}</p>
                <p className="mt-2 text-[13px] font-semibold text-violet-300/80">{(silentThreat as any).headline}</p>
                <p className="mt-1 text-[12px] text-white/30">{(silentThreat as any).supportingStat}</p>
              </div>
            ) : dnaQ.isLoading ? <LoadingCard /> : mostActive ? (
              <div className={CARD}>
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-violet-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">League Activity Leader</span>
                </div>
                <p className="text-xl font-bold text-white/95">{mostActive.ownerName}</p>
                <p className="mt-1 text-sm text-white/55">{mostActive.primaryDNA}</p>
                <p className="mt-2 text-[12px] text-white/30 leading-snug">{mostActive.evidence[0]}</p>
              </div>
            ) : null}

            {/* Highest Championship Readiness (proxy: best W/L in current season) */}
            {pulseQ.isLoading ? <LoadingCard /> : pulseQ.data?.teams.length ? (
              <div className={cn(CARD, "border-lime-500/10")}>
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-lime-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Highest Readiness</span>
                </div>
                {(() => {
                  const best = [...(pulseQ.data?.teams ?? [])].sort((a, b) => {
                    const wa = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0;
                    const wb = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0;
                    return wb - wa;
                  })[0];
                  if (!best) return null;
                  return (
                    <>
                      <p className="text-xl font-bold text-lime-200">{best.ownerName}</p>
                      <p className="mt-1 text-sm text-white/55">{best.wins}–{best.losses}</p>
                      <p className="mt-2 text-[12px] text-white/30">Best win rate this season — championship window is open</p>
                    </>
                  );
                })()}
              </div>
            ) : null}

            {/* Lowest Championship Readiness */}
            {pulseQ.isLoading ? <LoadingCard /> : pulseQ.data?.teams.length ? (
              <div className={cn(CARD, "border-red-500/10")}>
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Lowest Readiness</span>
                </div>
                {(() => {
                  const worst = [...(pulseQ.data?.teams ?? [])].sort((a, b) => {
                    const wa = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0;
                    const wb = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0;
                    return wa - wb;
                  })[0];
                  if (!worst) return null;
                  return (
                    <>
                      <p className="text-xl font-bold text-red-300">{worst.ownerName}</p>
                      <p className="mt-1 text-sm text-white/55">{worst.wins}–{worst.losses}</p>
                      <p className="mt-2 text-[12px] text-white/30">Struggling this season — trade window may be opening</p>
                    </>
                  );
                })()}
              </div>
            ) : null}

            {/* Most Improved Owner — highest trade opportunist score */}
            {dnaQ.isLoading ? <LoadingCard /> : dnaList.length > 0 ? (() => {
              const mostImproved = [...dnaList].sort((a, b) => {
                const sa = ((a.archetypes as any).tradeOpportunist?.score ?? 0) + ((a.archetypes as any).waiverAggressive?.score ?? 0);
                const sb = ((b.archetypes as any).tradeOpportunist?.score ?? 0) + ((b.archetypes as any).waiverAggressive?.score ?? 0);
                return (sb ?? 0) - (sa ?? 0);
              })[0];
              if (!mostImproved) return null;
              return (
                <div className={CARD}>
                  <div className="mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400" />
                    <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Most Active Manager</span>
                  </div>
                  <p className="text-xl font-bold text-white/95">{mostImproved.ownerName}</p>
                  <p className="mt-1 text-sm text-white/55">{mostImproved.primaryDNA}</p>
                  <div className="mt-2 flex gap-2">
                    <SmallBadge color="amber">
                      Trades: {(mostImproved.archetypes as any).tradeOpportunist?.score ?? 0}th pct
                    </SmallBadge>
                  </div>
                </div>
              );
            })() : null}

          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION D — BROADCAST CENTER
        ════════════════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionHeader
            icon={<MessageSquare className="h-5 w-5" />}
            title="Broadcast Center"
            subtitle="Copy-ready messages for email, Discord, and group chats"
            accent="violet"
          />

          {broadcastFacts.length === 0 ? (
            hofQ.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => <LoadingCard key={i} lines={4} />)}
              </div>
            ) : (
              <div className={cn(PANEL, "p-5 text-center text-white/30 text-sm")}>
                No broadcast facts available yet. Sync more seasons to unlock Hall of Fame data.
              </div>
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {broadcastFacts.map((bf, i) => (
                <BroadcastCard key={i} icon={bf.icon} label={bf.label} fact={bf.fact} />
              ))}
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION E — LEAGUE INTELLIGENCE SNAPSHOT
        ════════════════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionHeader
            icon={<Zap className="h-5 w-5" />}
            title="League Intelligence Snapshot"
            subtitle="Fear, threat, and exploitability rankings from the data engines"
            accent="amber"
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

            {/* Defending Champion */}
            {medalsQ.isLoading ? <LoadingCard /> : currentChampion ? (
              <div className={cn(CARD, "border-amber-500/20")}>
                <div className="mb-3 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-amber-300/50">Defending Champion</span>
                </div>
                <p className="text-xl font-bold text-amber-200">{currentChampion.championOwner}</p>
                <p className="mt-1 text-sm text-white/55">{currentChampion.season} Champion</p>
                {currentChampion.runnerUpOwner && (
                  <p className="mt-2 text-[12px] text-white/30">
                    Runner-up: <span className="text-white/45">{currentChampion.runnerUpOwner}</span>
                  </p>
                )}
              </div>
            ) : <LoadingCard />}

            {/* Biggest Threat to Champion */}
            {fearQ.isLoading ? <LoadingCard /> : mostFeared ? (
              <div className={cn(CARD, "border-red-500/20")}>
                <div className="mb-3 flex items-center gap-2">
                  <Flame className="h-4 w-4 text-red-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Biggest Threat</span>
                </div>
                <p className="text-xl font-bold text-white/95">{(mostFeared as any).ownerName}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-[12px] font-bold uppercase", heatBg((mostFeared as any).heatLabel))}>
                    <span className={heatColor((mostFeared as any).heatLabel)}>{(mostFeared as any).heatLabel}</span>
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <span className="text-white/30">Fear Score</span>
                    <div className="font-bold tabular-nums text-red-300">{(mostFeared as any).fearScore}</div>
                  </div>
                  <div>
                    <span className="text-white/30">Win Streak</span>
                    <div className="font-bold tabular-nums text-white/70">
                      {(mostFeared as any).winStreak > 0 ? `+${(mostFeared as any).winStreak}` : (mostFeared as any).winStreak}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={CARD}>
                <div className="mb-2 flex items-center gap-2">
                  <Flame className="h-4 w-4 text-zinc-600" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Biggest Threat</span>
                </div>
                <p className="text-sm text-white/30">Run Fear Index refresh to populate.</p>
              </div>
            )}

            {/* Most Feared Team */}
            {fearQ.isLoading ? <LoadingCard /> : fearEntries.length > 0 ? (
              <div className={cn(PANEL, "p-4 sm:p-5")}>
                <div className="mb-3 flex items-center gap-2">
                  <Skull className="h-4 w-4 text-zinc-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Fear Index — Top 5</span>
                </div>
                <div className="space-y-2.5">
                  {fearEntries.slice(0, 5).map((e: any, i: number) => (
                    <div key={e.teamId ?? i} className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-center text-[12px] font-bold tabular-nums text-white/30">{e.rank}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold text-white/85 truncate">{e.ownerName.split(" ")[0]}</span>
                          <span className={cn("text-[12px] font-bold", heatColor(e.heatLabel))}>{e.fearScore}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className={cn("h-full rounded-full", i === 0 ? "bg-red-500" : i <= 2 ? "bg-orange-400" : "bg-amber-300")}
                            style={{ width: `${e.fearScore}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Most Exploitable Team */}
            {fearQ.isLoading ? <LoadingCard /> : mostExploitable ? (
              <div className={cn(CARD, "border-violet-500/15")}>
                <div className="mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-violet-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Most Exploitable</span>
                </div>
                <p className="text-xl font-bold text-white/95">{(mostExploitable as any).ownerName}</p>
                <p className="mt-1 text-sm text-white/55">
                  Exploitability: {100 - ((mostExploitable as any).exploitabilityInverse ?? 50)}/100
                </p>
                <p className="mt-2 text-[12px] text-white/30 leading-snug">
                  Highest behavioral predictability — most likely to make emotional decisions.
                </p>
              </div>
            ) : (
              <div className={CARD}>
                <div className="mb-2 flex items-center gap-2">
                  <Target className="h-4 w-4 text-zinc-600" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Most Exploitable</span>
                </div>
                <p className="text-sm text-white/30">Fear Index data needed.</p>
              </div>
            )}

            {/* League Activity Leader */}
            {dnaQ.isLoading ? <LoadingCard /> : mostActive ? (
              <div className={CARD}>
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-lime-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Activity Leader</span>
                </div>
                <p className="text-xl font-bold text-white/95">{mostActive.ownerName}</p>
                <p className="mt-1 text-sm text-white/55">{mostActive.primaryDNA}</p>
                <p className="mt-2 text-[12px] text-white/30 leading-snug">{mostActive.evidence[0]}</p>
              </div>
            ) : null}

            {/* Desperation Board — top 3 most desperate */}
            {pulseQ.isLoading ? <LoadingCard lines={4} /> : pulseQ.data?.teams.length ? (
              <div className={cn(PANEL, "p-4 sm:p-5")}>
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">Desperation Board</span>
                </div>
                <div className="space-y-2.5">
                  {[...(pulseQ.data?.teams ?? [])]
                    .filter((team: any) => {
                      // Exclude reigning champion -- winners have leverage, not desperation
                      if (!reigningChampName) return true;
                      return !(team.ownerName ?? '').toLowerCase().includes(reigningChampName.split(' ')[0] ?? '');
                    })
                    .sort((a: any, b: any) => b.desperationScore - a.desperationScore)
                    .slice(0, 4)
                    .map((team, i) => (
                      <div key={team.teamId ?? i} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-semibold text-white/85 truncate">{team.ownerName.split(" ")[0]}</span>
                            <span className={cn("text-[12px] font-semibold", team.desperationScore >= 70 ? "text-red-400" : team.desperationScore >= 45 ? "text-amber-300" : "text-white/35")}>
                              {team.desperationScore}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                              <div
                                className={cn("h-full rounded-full", team.desperationScore >= 70 ? "bg-red-500" : team.desperationScore >= 45 ? "bg-amber-400" : "bg-white/20")}
                                style={{ width: `${team.desperationScore}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-white/25 shrink-0">{team.desperationLabel}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
                <p className="mt-3 text-[12px] text-white/20">Trade window scores (0–100). Higher = more likely to accept offers.</p>
              </div>
            ) : null}

          </div>
        </section>

        {/* Footer note */}
        <p className="px-1 text-[12px] text-white/20">
          Commissioner Command Center v1 — All data computed deterministically from real league history. No estimates. No fabrications.
        </p>

      </div>
    </div>
  );
}

export default CommissionerCommandCenter;
