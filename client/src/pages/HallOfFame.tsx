import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, Trophy, Medal, Crown, Swords, Landmark, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/** Matches Owner Profiles / Dashboard prestige surfaces */
const PROFILE_SURFACE =
  "rounded-xl border border-white/[0.08] bg-[#0f131c]/95 shadow-[0_0_28px_-14px_rgba(0,0,0,0.65)]";

type MaybeAvail<T> = { available: true; value: T } | { available: false; reason: string };

function unwrapMaybe<T>(m: MaybeAvail<T> | undefined | null): T | null {
  if (m && m.available) return m.value;
  return null;
}

function UnavailableBlock({ title }: { title: string }) {
  return (
    <div className={cn(PROFILE_SURFACE, "p-5")}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      <p className="mt-2 text-lg font-semibold text-zinc-300">Unavailable</p>
      <p className="mt-1 text-xs text-zinc-600">Data not yet imported.</p>
    </div>
  );
}

function GoldGlowCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        PROFILE_SURFACE,
        "border-amber-500/20 shadow-[0_0_32px_-12px_rgba(245,158,11,0.22)]",
        className,
      )}
    >
      {children}
    </div>
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
  const dossierQ = trpc.owners.rivalryDossier.useQuery(
    { ownerKey: ownerKeyA },
    { enabled: Boolean(ownerKeyA && ownerKeyB), staleTime: 60_000 },
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
  const [hofTab, setHofTab] = useState<"champions" | "records" | "dynasties" | "rivalries" | "legacy">("champions");
  const [coverageOpen, setCoverageOpen] = useState(false);
  const utils = trpc.useUtils();

  const hofQ = trpc.espn.hallOfFame.useQuery(undefined, { staleTime: 60_000 });
  const activeLeagueQ = trpc.league.getActive.useQuery(undefined, { staleTime: 30_000 });
  const coverageQ = trpc.espn.ownerMatchupCoverage.useQuery(undefined, { staleTime: 60_000 });
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
    activeLeagueQ.data?.leagueName?.trim() ||
    (activeLeagueQ.data?.leagueId ? `League ${activeLeagueQ.data.leagueId}` : "Your league");

  if (hofQ.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 bg-[#0b0e14] py-20 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading Hall of Fame…
      </div>
    );
  }

  if (hofQ.isError || !data) {
    return (
      <div className="mx-auto max-w-6xl bg-[#0b0e14] px-4 py-12 text-sm text-red-400 sm:px-6">
        Could not load Hall of Fame: {hofQ.isError ? String(hofQ.error?.message ?? hofQ.error) : "no data"}
      </div>
    );
  }

  const lb = data.championships.leaderboard;
  const leader = lb[0];
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

  const tabs = [
    { id: "champions" as const, label: "Champions", Icon: Trophy },
    { id: "records" as const, label: "Records", Icon: Medal },
    { id: "dynasties" as const, label: "Dynasties", Icon: Crown },
    { id: "rivalries" as const, label: "Rivalries", Icon: Swords },
    { id: "legacy" as const, label: "Legacy", Icon: Landmark },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8 bg-[#0b0e14] px-4 pb-20 pt-6 sm:px-6">
      {/* HERO */}
      <section className="space-y-4">
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-500/90">Hall of Fame</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">{leagueLabel}</h1>
          <div className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-4 text-sm text-zinc-400">
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
          </div>
        </div>

        {leader ? (
          <GoldGlowCard className="relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/90">Top leader</p>
                <p className="mt-1 text-2xl font-bold text-zinc-50 sm:text-3xl">{leader.displayName}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                    {leader.titles} title{leader.titles === 1 ? "" : "s"}
                  </span>
                  {leaderStats ? (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className="tabular-nums">{leaderStats.winPct.toFixed(1)}% wins</span>
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
      <div className={cn(PROFILE_SURFACE, "overflow-hidden")}>
        <div className="flex flex-wrap gap-0 border-b border-white/[0.06] px-1 sm:px-2">
          {tabs.map(({ id, label, Icon }) => {
            const active = hofTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setHofTab(id)}
                className={cn(
                  "flex min-w-0 flex-1 basis-[45%] items-center justify-center gap-2 border-b-2 py-3.5 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors sm:basis-0 sm:text-xs",
                  active ? "border-red-500 text-red-400" : "border-transparent text-zinc-500 hover:text-zinc-300",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-red-400" : "text-zinc-600")} aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>

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

          {hofTab === "records" && (
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
              {data.ownerRecords.length === 0 ? (
                <p className="col-span-full text-center text-sm text-zinc-500">No owner rows.</p>
              ) : (
                data.ownerRecords.slice(0, 12).map((row, idx) => (
                  <div key={row.ownerKey} className={cn(PROFILE_SURFACE, "relative overflow-hidden p-5")}>
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
                        <span className="text-zinc-600">Win %</span>{" "}
                        <span className="tabular-nums text-zinc-200">{row.winPct.toFixed(1)}%</span>
                      </p>
                      <p>
                        <span className="text-zinc-600">Seasons</span>{" "}
                        <span className="tabular-nums text-zinc-200">{row.seasonsActive}</span>
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {hofTab === "rivalries" && (
            <div className="grid gap-4 md:grid-cols-2">
              {mostGames ? (
                <RivalryPairWithDossier
                  title="Most games (pair)"
                  displayA={mostGames.displayA}
                  displayB={mostGames.displayB}
                  ownerKeyA={mostGames.ownerKeyA}
                  ownerKeyB={mostGames.ownerKeyB}
                  metricLabel="Games"
                  metricValue={mostGames.games}
                />
              ) : (
                <UnavailableBlock title="Most games (pair)" />
              )}
              {mostHb ? (
                <RivalryPairWithDossier
                  title="Most heartbreak games"
                  displayA={mostHb.displayA}
                  displayB={mostHb.displayB}
                  ownerKeyA={mostHb.ownerKeyA}
                  ownerKeyB={mostHb.ownerKeyB}
                  metricLabel="Games tracked"
                  metricValue={mostHb.games}
                  sub={`Heartbreaks: ${mostHb.heartbreakGames}`}
                />
              ) : (
                <UnavailableBlock title="Most heartbreak games" />
              )}
              {mostLop ? (
                <RivalryPairWithDossier
                  title="Most lopsided (avg |margin|)"
                  displayA={mostLop.displayA}
                  displayB={mostLop.displayB}
                  ownerKeyA={mostLop.ownerKeyA}
                  ownerKeyB={mostLop.ownerKeyB}
                  metricLabel="Games"
                  metricValue={mostLop.games}
                  sub={`Avg |margin|: ${mostLop.avgAbsMargin.toFixed(2)}`}
                />
              ) : (
                <UnavailableBlock title="Most lopsided rivalry" />
              )}
              {longDom ? (
                <RivalryPairWithDossier
                  title="Longest dominance streak"
                  displayA={longDom.dominantDisplay}
                  displayB={longDom.opponentDisplay}
                  ownerKeyA={longDom.dominantOwnerKey}
                  ownerKeyB={longDom.opponentOwnerKey}
                  metricLabel="Consecutive wins"
                  metricValue={longDom.consecutiveWins}
                />
              ) : (
                <UnavailableBlock title="Longest dominance streak" />
              )}
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
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Highest winning %</p>
                  <p className="mt-2 text-xl font-bold text-zinc-50">{legacyBestWinPct.displayName}</p>
                  <p className="mt-2 text-sm text-zinc-400">
                    {legacyBestWinPct.winPct.toFixed(1)}% · {legacyBestWinPct.gamesPlayed} RS games
                  </p>
                </GoldGlowCard>
              ) : (
                <UnavailableBlock title="Highest winning %" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Data coverage — collapsed */}
      <Collapsible open={coverageOpen} onOpenChange={setCoverageOpen} className={cn(PROFILE_SURFACE, "overflow-hidden")}>
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
      </Collapsible>
    </div>
  );
}

function RecordDump({ title, rec }: { title: string; rec: MaybeAvail<Record<string, unknown>> }) {
  if (!rec.available) {
    return (
      <div className={cn(PROFILE_SURFACE, "p-3")}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
        <p className="mt-1 text-xs text-zinc-600">Unavailable — {rec.reason}</p>
      </div>
    );
  }
  const o = rec.value;
  return (
    <div className={cn(PROFILE_SURFACE, "p-3")}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-1 font-mono text-[11px] text-zinc-300">
        {Object.entries(o)
          .map(([k, v]) => `${k}: ${typeof v === "number" ? (Number.isInteger(v) ? v : Number(v).toFixed(2)) : String(v)}`)
          .join(" · ")}
      </p>
    </div>
  );
}
