import { useMemo, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { Loader2, Trophy, Medal, Crown, Swords, Landmark, ChevronDown, Skull } from "lucide-react";
import {
  CinematicPageHeader,
  IntelPageShell,
  IntelPanel,
  PageError,
  PageLoading,
  ProGate,
  TabBar,
} from "@/components/layout";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type MaybeAvail<T> = { available: true; value: T } | { available: false; reason: string };

function unwrapMaybe<T>(m: MaybeAvail<T> | undefined | null): T | null {
  if (m && m.available) return m.value;
  return null;
}

function UnavailableBlock({ title }: { title: string }) {
  return (
    <IntelPanel variant="profile" className="p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      <p className="mt-2 text-lg font-semibold text-zinc-300">Unavailable</p>
      <p className="mt-1 text-xs text-zinc-600">Data not yet imported.</p>
    </IntelPanel>
  );
}

function GoldGlowCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <IntelPanel variant="profile" accent="gold" className={className}>
      {children}
    </IntelPanel>
  );
}

/** Joins focal ownerKeyA with `owners.rivalryDossier` to show RS H2H win % and record vs ownerKeyB (same source as Rivalry Dossier). */
function RivalryPairWithDossier({
  title,
  displayA,
  displayB,
  ownerKeyA,
  ownerKeyB,
  metricLabel,
  metricValue,
  sub,
}: {
  title: string;
  displayA: string;
  displayB: string;
  ownerKeyA: string;
  ownerKeyB: string;
  metricLabel: string;
  metricValue: number;
  sub?: string;
}) {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const dossierQ = trpc.owners.rivalryDossier.useQuery(
    withLeagueSalt({ ownerKey: ownerKeyA }, leagueContextKey),
    { enabled: leagueKeyReady && Boolean(ownerKeyA && ownerKeyB), staleTime: 60_000 },
  );
  const row = dossierQ.data?.opponents.find((o) => o.opponentOwnerKey === ownerKeyB);
  const hasH2h = row != null && row.gamesPlayed > 0;
  const joinMsg = "Available from Rivalry Dossier, not yet joined here.";

  return (
    <GoldGlowCard className="p-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <div className="text-center">
          <p className="text-lg font-bold text-zinc-100">{displayA}</p>
        </div>
        <div className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-red-300">
          vs
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-zinc-100">{displayB}</p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-4 text-center text-xs">
        <div>
          <p className="text-zinc-600">{metricLabel}</p>
          <p className="mt-1 font-semibold tabular-nums text-zinc-200">{metricValue}</p>
        </div>
        <div>
          <p className="text-zinc-600">Win %</p>
          <p className="mt-1 text-zinc-400">
            {dossierQ.isLoading ? (
              <span className="text-zinc-600">…</span>
            ) : hasH2h && row ? (
              <span className="font-semibold tabular-nums text-zinc-200">{row.winPct.toFixed(1)}%</span>
            ) : (
              <span className="text-zinc-500">{joinMsg}</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-zinc-600">Record</p>
          <p className="mt-1 text-zinc-400">
            {dossierQ.isLoading ? (
              <span className="text-zinc-600">…</span>
            ) : hasH2h && row ? (
              <span className="font-semibold tabular-nums text-zinc-200">
                {row.wins}-{row.losses}
                {row.ties > 0 ? `-${row.ties}` : ""}{" "}
                <span className="font-normal text-zinc-600">(focal: {displayA})</span>
              </span>
            ) : (
              <span className="text-zinc-500">{joinMsg}</span>
            )}
          </p>
        </div>
      </div>
      {sub ? <p className="mt-3 text-center text-xs text-zinc-500">{sub}</p> : null}
      {hasH2h ? (
        <p className="mt-3 text-center text-[10px] text-zinc-600">
          Win % and record from completed regular-season gmMatchups (Rivalry Dossier), focal {displayA}.
        </p>
      ) : null}
    </GoldGlowCard>
  );
}

function ClosestChampionshipCard({ hasPlayoffGmMatchups }: { hasPlayoffGmMatchups: boolean }) {
  return (
    <GoldGlowCard className="p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Closest championship</p>
      {hasPlayoffGmMatchups ? (
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Playoff matchups are present in <code className="text-[11px] text-zinc-300">gmMatchups</code>. Smallest championship
          margin is still <span className="font-medium text-zinc-300">not included in the Hall of Fame payload</span> for
          this view.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          <span className="font-medium text-zinc-300">Not included in Hall of Fame payload.</span> No completed playoff
          matchup rows were found in <code className="text-[11px] text-zinc-300">gmMatchups</code> coverage for this league
          (see Data Coverage &amp; Diagnostics).
        </p>
      )}
    </GoldGlowCard>
  );
}

export function HallOfFame() {
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState<string | null>(null);
  const [hofTab, setHofTab] = useState<"champions" | "records" | "dynasties" | "rivalries" | "legacy" | "cemetery">("champions");
  const [coverageOpen, setCoverageOpen] = useState(false);
  const utils = trpc.useUtils();

  const { leagueContextKey, authLoaded, userLoaded, isSignedIn, activeQ } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const hofQ = trpc.espn.hallOfFame.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: leagueKeyReady,
  });
  const coverageQ = trpc.espn.ownerMatchupCoverage.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: leagueKeyReady,
  });
  const ownerListQ = (trpc as any).owners.ownerList.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: leagueKeyReady,
  });
  const backfillMut = trpc.espn.backfillMatchupsFromCache.useMutation({
    onSuccess: (data) => {
      const written = data.results.filter((r) => r.status === "backfilled");
      setBackfillNote(
        written.length > 0
          ? `Backfilled ${written.map((r) => r.season).join(", ")} (${data.totalWritten} rows). Refreshing…`
          : "No new seasons found in cache.",
      );
      void utils.espn.ownerMatchupCoverage.invalidate();
      void utils.espn.hallOfFame.invalidate();
      setBackfilling(false);
    },
    onError: (e) => {
      setBackfillNote(`Error: ${e.message}`);
      setBackfilling(false);
    },
  });

  const data = hofQ.data;
  const diag = data?.championships.medalDiagnostics;
  const unmatchedMedal =
    (diag?.unmatchedChampionTeams?.length ?? 0) +
    (diag?.unmatchedRunnerUpTeams?.length ?? 0) +
    (diag?.unmatchedThirdTeams?.length ?? 0);

  const coverageWarning = useMemo(() => {
    const rows = coverageQ.data?.seasons ?? [];
    return rows.some((s) => !s.usable);
  }, [coverageQ.data?.seasons]);

  const hasPlayoffGmMatchups = useMemo(() => {
    const rows = coverageQ.data?.seasons ?? [];
    return rows.some((s) => s.completedPlayoffDedupedRows > 0);
  }, [coverageQ.data?.seasons]);

  const runnerUpFinishesByOwner = useMemo(() => {
    const d = hofQ.data;
    if (!d) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const h of d.championships.history) {
      const k = h.resolvedRunnerUpOwnerKey;
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [hofQ.data]);

  const legacyFinalsLeader = useMemo(() => {
    const d = hofQ.data;
    if (!d) return { kind: "skip" as const };
    const lb = d.championships.leaderboard;
    const hist = d.championships.history;
    const hasRunnerUpMedalText = hist.some((h) => Boolean(h.runnerUpTeam?.trim()));
    const hasResolvedRunnerUp = hist.some((h) => h.resolvedRunnerUpOwnerKey != null);

    if (hasResolvedRunnerUp) {
      const keys = new Set<string>();
      for (const r of lb) keys.add(r.ownerKey);
      for (const k of runnerUpFinishesByOwner.keys()) keys.add(k);
      let best: { ownerKey: string; displayName: string; finals: number; titles: number; runnerUps: number } | null = null;
      for (const ownerKey of keys) {
        const titles = lb.find((x) => x.ownerKey === ownerKey)?.titles ?? 0;
        const runnerUps = runnerUpFinishesByOwner.get(ownerKey) ?? 0;
        const finals = titles + runnerUps;
        const displayName =
          lb.find((x) => x.ownerKey === ownerKey)?.displayName ??
          d.ownerRecords.find((r) => r.ownerKey === ownerKey)?.displayName ??
          ownerKey;
        if (
          !best ||
          finals > best.finals ||
          (finals === best.finals && (runnerUps > best.runnerUps || titles > best.titles))
        ) {
          best = { ownerKey, displayName, finals, titles, runnerUps };
        }
      }
      return { kind: "resolved" as const, leader: best };
    }

    if (hasRunnerUpMedalText) {
      return { kind: "unresolved" as const };
    }

    return { kind: "no_medals" as const };
  }, [hofQ.data, runnerUpFinishesByOwner]);

  const leagueLabel =
    activeQ.data?.leagueName?.trim() ||
    (activeQ.data?.leagueId ? `League ${activeQ.data.leagueId}` : "Your league");

  // -- Freemium gate (deep record book) --------------------------------------
  const hofGated = Boolean((hofQ.data as any)?.gated);
  const hofCheckout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (res) => {
      if (res?.url) window.open(res.url, "_blank", "noopener,noreferrer");
      else toast.error("Checkout did not return a link. Try again or contact support.");
    },
    onError: (err) => {
      toast.error(err.message || "Could not start checkout. Please try again.");
    },
  });
  const hofLog = (trpc as any).usageMonitor.logUIEvent.useMutation();
  const hofSnapLogged = useRef(false);
  const hofPaywallLogged = useRef(false);
  useEffect(() => {
    if (!hofSnapLogged.current && hofQ.data) {
      hofSnapLogged.current = true;
      hofLog.mutate({ eventType: "feature_open", featureName: "hof_snapshot_viewed" });
    }
  }, [hofQ.data]);
  useEffect(() => {
    if (hofGated && (hofTab === "records" || hofTab === "rivalries") && !hofPaywallLogged.current) {
      hofPaywallLogged.current = true;
      hofLog.mutate({ eventType: "feature_open", featureName: "hof_paywall_viewed" });
    }
  }, [hofGated, hofTab]);
  const startHofCheckout = () => {
    if (typeof window === "undefined") return;
    hofLog.mutate({ eventType: "cta_click", featureName: "hof_unlock_clicked" });
    hofCheckout.mutate({ origin: window.location.origin });
  };

  if (!leagueKeyReady) {
    return (
      <IntelPageShell bleed minHeight="full" background="cinematic" width="standard" padding="compact">
        <PageLoading message="Loading league…" />
      </IntelPageShell>
    );
  }

  if (hofQ.isLoading) {
    return (
      <IntelPageShell bleed minHeight="full" background="cinematic" width="standard" padding="compact">
        <PageLoading message="Loading Hall of Fame…" />
      </IntelPageShell>
    );
  }

  if (hofQ.isError || !data) {
    return (
      <IntelPageShell bleed minHeight="full" background="cinematic" width="standard" padding="compact">
        <PageError
          message={`Could not load Hall of Fame: ${hofQ.isError ? String(hofQ.error?.message ?? hofQ.error) : "no data"}`}
        />
      </IntelPageShell>
    );
  }

  const lb = data.championships.leaderboard;
  const leader = lb[0];
  const coLeaders = lb.filter((r) => r.titles === (leader?.titles ?? -1));
  const leaderStats = leader ? data.ownerRecords.find((r) => r.ownerKey === leader.ownerKey) : undefined;

  const totalSeasonsTouched = data.coverage.seasonsTouched.length;
  const totalTitles = lb.reduce((s, r) => s + r.titles, 0);
  const totalOwners = data.ownerRecords.length;

  const sg = data.singleGameRecords;
  const sr = data.seasonRecords;
  const rv = data.rivalryRecords;

  const hiWeek = unwrapMaybe(sg.highestTeamScore);
  const loWeek = unwrapMaybe(sg.lowestTeamScore);
  const hiSeasonPf = unwrapMaybe(sr.mostPointsInSeason);
  const loSeasonPf = unwrapMaybe(sr.fewestPointsInSeason);
  const blowout = unwrapMaybe(sg.biggestBlowout);

  const mostGames = unwrapMaybe(rv.mostGamesPlayed);
  const mostHb = unwrapMaybe(rv.mostHeartbreakGames);
  const mostLop = unwrapMaybe(rv.mostLopsidedRivalry);
  const longDom = unwrapMaybe(rv.longestDominance);

  const legacyMostTitles = lb[0];
  const legacyBestWinPct = [...data.ownerRecords].sort((a, b) => b.winPct - a.winPct || b.gamesPlayed - a.gamesPlayed)[0];
  const legacyLongestTenure = [...data.ownerRecords].sort((a, b) => b.seasonsActive - a.seasonsActive || b.gamesPlayed - a.gamesPlayed)[0];

  const cemetery = (() => { const activeNames = new Set(((ownerListQ.data?.active ?? []) as any[]).map((o: any) => String(o.ownerName ?? o.ownerKey).trim().toLowerCase())); const byName = new Map<string, { name: string; years: number[]; champs: number }>(); for (const o of ((ownerListQ.data?.allOwners ?? []) as any[])) { const nm = String(o.ownerName ?? o.ownerKey).trim(); const k = nm.toLowerCase(); const e = byName.get(k) ?? { name: nm, years: [], champs: 0 }; if (Array.isArray(o.seasons)) for (const s of o.seasons) { const y = Number(s); if (y && !e.years.includes(y)) e.years.push(y); } e.champs += Number(o.championships ?? 0); byName.set(k, e); } return [...byName.values()].filter((e) => e.years.length > 0 && e.years.length < 2 && e.champs === 0 && !activeNames.has(e.name.toLowerCase())).map((e) => ({ name: e.name, years: [...e.years].sort((x, y) => x - y) })).sort((p, q) => (p.years[0] ?? 0) - (q.years[0] ?? 0)); })();

  const tabs = [
    { id: "champions", label: "Champions", icon: Trophy },
    { id: "records", label: "Records", icon: Medal },
    { id: "dynasties", label: "Dynasties", icon: Crown },
    { id: "legacy", label: "Legacy", icon: Landmark },
    { id: "cemetery", label: "Cemetery", icon: Skull },
  ];

  return (
    <IntelPageShell
      bleed
      minHeight="full"
      width="standard"
      background="cinematic"
      padding="compact"
      className="pb-20"
    >
      <div className="space-y-8">
      {diag && diag.totalMedals === 0 && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-100/95">
          <p className="font-semibold text-amber-50">No championship medals imported yet</p>
          <p className="mt-1 text-[13px] leading-relaxed text-amber-100/80">
            The Ring of Honor reads dynasty titles from <code className="rounded bg-black/30 px-1 text-[11px]">league_medals</code>{" "}
            (scraped from ESPN&apos;s League History page). Until those rows exist for this league, the champions tab
            stays empty — this is expected, not a sync bug. Use{" "}
            <Link to="/sync" className="font-medium text-amber-50 underline underline-offset-2 hover:text-white">
              Sync Data → League History Medals
            </Link>{" "}
            to capture medals, then refresh this page.
          </p>
        </div>
      )}
      {diag && diag.totalMedals > 0 && lb.length === 0 && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.07] px-4 py-3 text-sm text-violet-100/95">
          <p className="font-semibold text-violet-50">Medals on file but no resolved champions</p>
          <p className="mt-1 text-[13px] leading-relaxed text-violet-100/80">
            Team labels in <code className="rounded bg-black/30 px-1 text-[11px]">league_medals</code> could not be
            matched to owners in <code className="rounded bg-black/30 px-1 text-[11px]">gm_teams</code>. Check medal
            diagnostics below or re-scrape medals after team names stabilize on{" "}
            <Link to="/sync" className="font-medium text-violet-50 underline underline-offset-2 hover:text-white">
              Sync Data
            </Link>
            .
          </p>
        </div>
      )}
      {/* HERO */}
      <section className="space-y-4">
        <CinematicPageHeader
          eyebrowMono="League Legacy Center"
          title={leagueLabel}
          subtitle={
            <span className="inline-flex flex-wrap justify-center gap-x-4 gap-y-1">
              <span>
                <span className="text-zinc-600">Seasons in coverage</span>{" "}
                <span className="font-semibold tabular-nums text-zinc-200">{totalSeasonsTouched}</span>
              </span>
              <span className="text-zinc-700">·</span>
              <span>
                <span className="text-zinc-600">Total titles</span>{" "}
                <span className="font-semibold tabular-nums text-amber-200/90">{totalTitles}</span>
              </span>
              <span className="text-zinc-700">·</span>
              <span>
                <span className="text-zinc-600">Owners tracked</span>{" "}
                <span className="font-semibold tabular-nums text-zinc-200">{totalOwners}</span>
              </span>
            </span>
          }
          className="mb-0 text-center [&>div]:w-full [&>div]:items-center [&_h1]:text-center [&_p]:mx-auto"
        />

        {leader ? (
          <GoldGlowCard className="relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/90">{coLeaders.length > 1 ? "Co-leaders" : "Top leader"}</p>
                <p className="mt-1 text-2xl font-bold text-zinc-50 sm:text-3xl">{coLeaders.map((c) => c.displayName).join(" & ")}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                    {leader.titles} title{leader.titles === 1 ? "" : "s"}{coLeaders.length > 1 ? " each" : ""}
                  </span>
                  {coLeaders.length > 1 ? null : leaderStats ? (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className="tabular-nums">{leaderStats.winPct.toFixed(1)}% reg. season wins</span>
                      <span className="text-zinc-600">·</span>
                      <span>{leaderStats.seasonsActive} seasons active</span>
                    </>
                  ) : (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-500">Owner totals unavailable for this key in ownerRecords.</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex gap-1 text-3xl sm:text-4xl" aria-hidden>
                {Array.from({ length: Math.min(5, leader.titles) }).map((_, i) => (
                  <span key={i} className="drop-shadow-[0_0_12px_rgba(245,158,11,0.35)]">
                    🏆
                  </span>
                ))}
              </div>
            </div>
          </GoldGlowCard>
        ) : (
          <UnavailableBlock title="Championship leaderboard" />
        )}
      </section>

      {/* TABS */}
      <IntelPanel variant="profile" className="overflow-hidden">
        <TabBar
          tabs={tabs}
          value={hofTab}
          onChange={(id) => setHofTab(id as typeof hofTab)}
          tone="hof"
        />

        <div className="p-4 sm:p-6">
          {hofTab === "champions" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lb.length === 0 ? (
                <p className="col-span-full text-center text-sm text-zinc-500">No resolved champions yet.</p>
              ) : (
                lb.slice(0, 10).map((row) => (
                  <GoldGlowCard key={row.ownerKey} className="p-5">
                    <p className="text-lg font-bold text-zinc-50">{row.displayName}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-200/80">
                      {row.titles} championship{row.titles === 1 ? "" : "s"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1 text-2xl" aria-hidden>
                      {Array.from({ length: Math.min(5, row.titles) }).map((_, i) => (
                        <span key={i}>🏆</span>
                      ))}
                    </div>
                    <div className="mt-4 space-y-1 border-t border-white/[0.06] pt-3">
                      {row.titleSeasons.length ? (
                        row.titleSeasons.map((y) => (
                          <p key={y} className="text-sm tabular-nums text-zinc-300">
                            {y}
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-zinc-600">—</p>
                      )}
                    </div>
                  </GoldGlowCard>
                ))
              )}
            </div>
          )}

          {hofTab === "records" && hofGated && (
            <ProGate
              icon={Trophy}
              heading="Single-game & season records"
              description="The leaderboard, titles, tenure and win % stay free. The deep record book - single-game marks, season bests, and head-to-head legacy - unlocks with Rivals Pro."
              ctaLabel="Unlock the Record Book"
              accent="amber"
              onUnlock={startHofCheckout}
              pending={hofCheckout.isPending}
            />
          )}
          {hofTab === "records" && !hofGated && (
            <div className="grid gap-3 md:grid-cols-2">
              {hiWeek ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Highest single week</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-amber-200">{hiWeek.score.toFixed(1)} pts</p>
                  <p className="mt-2 text-sm text-zinc-400">{hiWeek.label}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {hiWeek.season} · week {hiWeek.week}
                  </p>
                </GoldGlowCard>
              ) : (
                <UnavailableBlock title="Highest single week" />
              )}
              {loWeek ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Lowest single week</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-200">{loWeek.score.toFixed(1)} pts</p>
                  <p className="mt-2 text-sm text-zinc-400">{loWeek.label}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {loWeek.season} · week {loWeek.week}
                  </p>
                </GoldGlowCard>
              ) : (
                <UnavailableBlock title="Lowest single week" />
              )}
              {hiSeasonPf ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Highest season PF</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-amber-200">{hiSeasonPf.pointsFor.toFixed(1)}</p>
                  <p className="mt-2 text-sm font-medium text-zinc-200">{hiSeasonPf.displayName}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {hiSeasonPf.season} · {hiSeasonPf.games} RS games
                  </p>
                </GoldGlowCard>
              ) : (
                <UnavailableBlock title="Highest season PF" />
              )}
              {loSeasonPf ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Lowest season PF</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-200">{loSeasonPf.pointsFor.toFixed(1)}</p>
                  <p className="mt-2 text-sm font-medium text-zinc-200">{loSeasonPf.displayName}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {loSeasonPf.season} · {loSeasonPf.games} RS games
                  </p>
                </GoldGlowCard>
              ) : (
                <UnavailableBlock title="Lowest season PF" />
              )}
              <ClosestChampionshipCard hasPlayoffGmMatchups={hasPlayoffGmMatchups} />
              {blowout ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Largest blowout</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-amber-200">{blowout.margin.toFixed(1)} pt margin</p>
                  <p className="mt-2 text-sm text-zinc-300">
                    {blowout.winnerLabel} {blowout.winnerScore} — {blowout.loserScore} {blowout.loserLabel}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {blowout.season} · week {blowout.week}
                  </p>
                </GoldGlowCard>
              ) : (
                <UnavailableBlock title="Largest blowout" />
              )}
            </div>
          )}

          {hofTab === "dynasties" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="col-span-full flex flex-col gap-2 rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13px] text-sky-100/80">All-time legacy records (regular season). For current roster strength, see Dynasty Power Rankings.</p>
                <Link to="/dynasty-power-rankings" className="shrink-0 text-sm font-semibold text-sky-300 hover:text-sky-200">Dynasty Power Rankings →</Link>
              </div>
              {data.ownerRecords.length === 0 ? (
                <p className="col-span-full text-center text-sm text-zinc-500">No owner rows.</p>
              ) : (
                data.ownerRecords.slice(0, 12).map((row, idx) => (
                  <IntelPanel key={row.ownerKey} variant="profile" className="relative overflow-hidden p-5">
                    <span className="absolute right-3 top-3 text-4xl font-black tabular-nums text-white/[0.04]">
                      {idx + 1}
                    </span>
                    <p className="text-lg font-bold text-zinc-50">{row.displayName}</p>
                    <div className="mt-3 space-y-2 text-sm text-zinc-400">
                      <p>
                        <span className="text-zinc-600">Titles</span>{" "}
                        <span className="font-semibold text-amber-200/90">{row.titles}</span>
                      </p>
                      <p>
                        <span className="text-zinc-600">Regular Season Win %</span>{" "}
                        <span className="tabular-nums text-zinc-200">{row.winPct.toFixed(1)}%</span>
                      </p>
                      <p>
                        <span className="text-zinc-600">Seasons</span>{" "}
                        <span className="tabular-nums text-zinc-200">{row.seasonsActive}</span>
                      </p>
                    </div>
                  </IntelPanel>
                ))
              )}
            </div>
          )}

          {hofTab === "rivalries" && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.08] px-5 py-6 text-center">
              <p className="text-sm font-semibold text-violet-50">Rivalries have moved</p>
              <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-violet-100/75">
                Head-to-head rivalry intelligence now lives in its own home — the canonical source for every rivalry stat.
              </p>
              <Link to="/rivalry-center" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-violet-300 hover:text-violet-200">
                Rivalries now live in Rivalry Center →
              </Link>
            </div>
          )}

          {hofTab === "legacy" && (
            <div className="grid gap-3 md:grid-cols-2">
              {legacyMostTitles ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Most championships</p>
                  <p className="mt-2 text-xl font-bold text-zinc-50">{legacyMostTitles.displayName}</p>
                  <p className="mt-2 text-sm text-amber-200/90">{legacyMostTitles.titles} title(s)</p>
                </GoldGlowCard>
              ) : (
                <UnavailableBlock title="Most championships" />
              )}
              {legacyFinalsLeader.kind === "resolved" && legacyFinalsLeader.leader ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Most finals appearances</p>
                  <p className="mt-2 text-xl font-bold text-zinc-50">{legacyFinalsLeader.leader.displayName}</p>
                  <p className="mt-2 text-sm text-amber-200/90">
                    {legacyFinalsLeader.leader.finals} finals{" "}
                    <span className="text-zinc-500">
                      ({legacyFinalsLeader.leader.titles} titles + {legacyFinalsLeader.leader.runnerUps} runner-up
                      {legacyFinalsLeader.leader.runnerUps === 1 ? "" : "s"})
                    </span>
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
                    Finals appearances = championships + runner-up finishes, from{" "}
                    <code className="text-[10px] text-zinc-400">league_medals</code> history on the server.
                  </p>
                </GoldGlowCard>
              ) : legacyFinalsLeader.kind === "unresolved" ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Most finals appearances</p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    Runner-up teams appear in <code className="text-[10px] text-zinc-300">league_medals</code>, but at least
                    one season could not be resolved to a canonical owner key. Check medal diagnostics below for unmatched
                    runner-up rows.
                  </p>
                </GoldGlowCard>
              ) : legacyFinalsLeader.kind === "no_medals" ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Most finals appearances</p>
                  <p className="mt-2 text-sm text-zinc-400">
                    No runner-up medal text in <code className="text-[10px] text-zinc-300">league_medals</code> for this
                    league — only titles can be counted here.
                  </p>
                </GoldGlowCard>
              ) : null}
              {legacyLongestTenure ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Longest tenure (seasons active)</p>
                  <p className="mt-2 text-xl font-bold text-zinc-50">{legacyLongestTenure.displayName}</p>
                  <p className="mt-2 text-sm text-zinc-400">{legacyLongestTenure.seasonsActive} seasons</p>
                </GoldGlowCard>
              ) : (
                <UnavailableBlock title="Longest tenure" />
              )}
              {legacyBestWinPct && legacyBestWinPct.gamesPlayed > 0 ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Highest Regular Season Win %</p>
                  <p className="mt-2 text-xl font-bold text-zinc-50">{legacyBestWinPct.displayName}</p>
                  <p className="mt-2 text-sm text-zinc-400">
                    {legacyBestWinPct.winPct.toFixed(1)}% · {legacyBestWinPct.gamesPlayed} RS games
                  </p>
                </GoldGlowCard>
              ) : (
                <UnavailableBlock title="Highest Regular Season Win %" />
              )}
            </div>
          )}
          {hofTab === "cemetery" && (
            <div>
              <p className="mb-5 max-w-2xl text-sm text-zinc-500">
                The dearly departed - owners who lasted less than two seasons. They came, they lost, they left.
              </p>
              {cemetery.length === 0 ? (
                <p className="text-center text-sm text-zinc-500">No short-timers - everyone who joined stuck around.</p>
              ) : (
                <div className="rounded-2xl border border-white/[0.06] bg-[linear-gradient(180deg,#1b131f,#140e17)] px-5 pt-8 pb-4">
                  <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                    {cemetery.map((g, i) => (
                      <div key={g.name + i} className="flex flex-col items-center">
                        <div className="relative flex w-full max-w-[170px] flex-col items-center rounded-t-[80px] rounded-b-md border border-zinc-700/60 bg-[linear-gradient(180deg,#3a4150,#281d2e)] px-4 pt-7 pb-6 text-center shadow-[inset_0_2px_12px_rgba(0,0,0,.45),0_10px_20px_-12px_rgba(0,0,0,.8)]">
                          <span className="text-[10px] font-bold tracking-[0.35em] text-zinc-500">R . I . P</span>
                          <span className="my-2 block h-px w-10 bg-white/15" />
                          <Skull className="mb-2 h-5 w-5 text-zinc-500" />
                          <span className="font-serif text-[15px] font-bold leading-tight text-zinc-200">{g.name}</span>
                          <span className="mt-1.5 text-xs tabular-nums text-zinc-400">{g.years.length ? g.years.join(" - ") : "Unknown"}</span>
                          <span className="mt-2 text-[9px] italic text-zinc-600">gone too soon</span>
                        </div>
                        <span className="h-3 w-[88%] max-w-[150px] rounded-b-sm bg-[linear-gradient(180deg,#1f1624,#16101a)] shadow-[0_6px_8px_-6px_rgba(0,0,0,.9)]" />
                        <span className="mb-6 h-1.5 w-[96%] max-w-[160px] rounded-full bg-lime-900/30 blur-[1px]" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </IntelPanel>

      {/* Data coverage — collapsed */}
      <Collapsible open={coverageOpen} onOpenChange={setCoverageOpen}>
        <IntelPanel variant="profile" className="overflow-hidden">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.03]">
          <span>Data Coverage &amp; Diagnostics</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", coverageOpen && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 border-t border-white/[0.06] px-4 py-4 text-xs text-zinc-500">
            <p className="leading-relaxed text-zinc-400">
              Championships from <code className="text-[10px] text-zinc-300">league_medals</code> (team names → owners via{" "}
              <code className="text-[10px] text-zinc-300">gmTeams</code>). Owner W/L/T, single-game marks, rivalry indexes,
              and season bests use <strong className="text-zinc-300">completed regular-season</strong>{" "}
              <code className="text-[10px] text-zinc-300">gmMatchups</code> only.
            </p>
            <p className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-zinc-400">
              <span className="font-semibold text-zinc-300">Coverage:</span> {data.coverage.note} Deduped matchup rows:{" "}
              <span className="tabular-nums text-zinc-200">{data.coverage.dedupedMatchupRows}</span>
              {data.coverage.seasonsTouched.length > 0 && (
                <>
                  {" "}
                  · Seasons: {data.coverage.seasonsTouched.join(", ")}
                </>
              )}
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              <RecordDump title="Highest combined score" rec={sg.highestCombinedScore as MaybeAvail<Record<string, unknown>>} />
              <RecordDump title="Lowest combined score" rec={sg.lowestCombinedScore as MaybeAvail<Record<string, unknown>>} />
              <RecordDump title="Closest game (margin)" rec={sg.closestGame as MaybeAvail<Record<string, unknown>>} />
            </div>

            {diag && (
              <div
                className={cn(
                  "rounded-md border px-3 py-2 font-mono",
                  unmatchedMedal > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-white/[0.08] bg-white/[0.02]",
                )}
              >
                <span className="font-semibold text-zinc-300">Medals → owners</span> · rows: {diag.totalMedals} · champion
                unmatched: {diag.unmatchedChampionTeams.length} · runner-up: {diag.unmatchedRunnerUpTeams.length} · third:{" "}
                {diag.unmatchedThirdTeams.length}
                {diag.unmatchedChampionTeams.length > 0 && (
                  <div className="mt-2 space-y-0.5 text-[10px] leading-snug text-amber-200/90">
                    <span className="text-zinc-500">Sample champion labels not matched:</span>
                    {diag.unmatchedChampionTeams.slice(0, 4).map((u) => (
                      <div key={`${u.season}-${u.teamName}`}>
                        {u.season}: <span className="text-zinc-300">{u.teamName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {coverageQ.data && (
              <details className="rounded-md border border-white/[0.08]" open={coverageWarning}>
                <summary className="cursor-pointer px-3 py-2 text-zinc-400 hover:text-zinc-200">
                  Season-by-season gmMatchups coverage
                </summary>
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="w-full font-mono text-[11px]">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-zinc-500">
                        <th className="py-1 text-left">Season</th>
                        <th className="py-1 text-right">Rows</th>
                        <th className="py-1 text-right">PO dedupe</th>
                        <th className="py-1 text-center">Usable?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coverageQ.data.seasons.map((s) => (
                        <tr key={s.season} className={cn("border-b border-white/[0.05]", !s.usable && "text-amber-300/90")}>
                          <td className="py-0.5">{s.season}</td>
                          <td className="py-0.5 text-right tabular-nums">{s.gmMatchupsRows}</td>
                          <td className="py-0.5 text-right tabular-nums">{s.completedPlayoffDedupedRows}</td>
                          <td className="py-0.5 text-center">{s.usable ? "✓" : "✗"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBackfilling(true);
                  setBackfillNote(null);
                  backfillMut.mutate();
                }}
                disabled={backfilling}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
              >
                {backfilling ? (
                  <>
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    Backfilling…
                  </>
                ) : (
                  "Backfill gmMatchups from ESPN cache"
                )}
              </button>
              {backfillNote && <span className="text-[11px] text-zinc-400">{backfillNote}</span>}
            </div>
            <p className="text-[11px] text-zinc-600">
              Routes <code className="text-[10px]">/ring-of-honor</code> and <code className="text-[10px]">/championships</code>{" "}
              redirect here.
            </p>
          </div>
        </CollapsibleContent>
        </IntelPanel>
      </Collapsible>
      </div>
    </IntelPageShell>
  );
}

function RecordDump({ title, rec }: { title: string; rec: MaybeAvail<Record<string, unknown>> }) {
  if (!rec.available) {
    return (
      <IntelPanel variant="profile" className="p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
        <p className="mt-1 text-xs text-zinc-600">Unavailable — {rec.reason}</p>
      </IntelPanel>
    );
  }
  const o = rec.value;
  return (
    <IntelPanel variant="profile" className="p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-1 font-mono text-[11px] text-zinc-300">
        {Object.entries(o)
          .map(([k, v]) => `${k}: ${typeof v === "number" ? (Number.isInteger(v) ? v : Number(v).toFixed(2)) : String(v)}`)
          .join(" · ")}
      </p>
    </IntelPanel>
  );
}
