/**
 * Canonical `/rfsn/recaps` — weekly matchup recaps from League Wire postgame reports.
 * Requires season+week (existing API); no new recap generation.
 */
import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router";
import { skipToken } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CalendarDays, Loader2, Newspaper } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { RfsnMediaShell } from "@/components/rfsn/RfsnMediaShell";
import { RFSN_ROUTES } from "@/lib/rfsnEditorial";
import { cn } from "@/lib/utils";

type MatchupReport = {
  matchupId: number;
  season: number;
  week: number;
  headline: string;
  shortRecap?: string;
  shareableLine?: string;
  gameType?: string | null;
  winner?: { name: string; score: number } | null;
  loser?: { name: string; score: number } | null;
};

type WeekSlot = { season: number; week: number; count?: number };

export function RfsnRecaps() {
  const _trpc = trpc as any;
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );

  const activeLeagueQ = _trpc.league.getActive.useQuery(undefined, { enabled: leagueKeyReady });
  const liveAccessQ = _trpc.rfsnBroadcast.getAccess.useQuery(undefined, {
    enabled: leagueKeyReady,
    staleTime: 60_000,
  });
  const showLiveNav = Boolean(liveAccessQ.data?.enabled && liveAccessQ.data?.canAccess);
  const leagueName =
    leagueKeyReady && activeLeagueQ.data?.leagueName ? activeLeagueQ.data.leagueName : "";

  const weeksQ = _trpc.leagueWire.getAvailableWeeks.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const weeks: WeekSlot[] = leagueKeyReady ? (weeksQ.data ?? []) : [];

  const [selected, setSelected] = useState<WeekSlot | null>(null);
  useEffect(() => {
    if (!selected && weeks[0]) setSelected(weeks[0]);
  }, [weeks, selected]);

  const activeWeek = selected ?? weeks[0] ?? null;

  const reportsQ = _trpc.leagueWire.getPostgameReports.useQuery(
    leagueKeyReady && activeWeek != null
      ? withLeagueSalt({ season: activeWeek.season, week: activeWeek.week }, leagueContextKey)
      : skipToken,
  );

  const reports: MatchupReport[] =
    leagueKeyReady && activeWeek != null ? (reportsQ.data ?? []) : [];
  const loading = !leagueKeyReady || weeksQ.isLoading || (activeWeek != null && reportsQ.isLoading);
  const error = weeksQ.isError || reportsQ.isError;

  const weeksBySeason = useMemo(() => {
    const map = new Map<number, WeekSlot[]>();
    for (const w of weeks) {
      const list = map.get(w.season) ?? [];
      list.push(w);
      map.set(w.season, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [weeks]);

  return (
    <RfsnMediaShell active="recaps" leagueName={leagueName} showLive={showLiveNav} data-v2-rfsn-recaps>
      <div className="mb-5">
        <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-white">
          <Newspaper className="h-5 w-5 text-lime-400" /> Recaps
        </h2>
        <p className="mt-1 text-xs text-[#8b97a8]">
          Weekly matchup recaps already produced by the League Wire desk. Draft wrap-ups and season
          books appear elsewhere when those systems publish them — this page does not invent content.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-ink-secondary">
          <Loader2 className="h-4 w-4 animate-spin text-lime-400" /> Loading recaps…
        </div>
      ) : error ? (
        <div className="rounded-[15px] border border-red-500/20 bg-red-500/[0.05] px-5 py-10 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-zinc-300">Couldn’t load recaps</p>
          <Link to={RFSN_ROUTES.stories} className="mt-4 inline-block text-xs font-bold text-lime-400">
            Open Stories →
          </Link>
        </div>
      ) : weeks.length === 0 ? (
        <div className="rounded-[15px] border border-white/[0.07] bg-white/[0.02] px-5 py-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-ink-tertiary" />
          <p className="text-sm font-semibold text-zinc-300">No weekly recaps yet</p>
          <p className="mx-auto mt-2 max-w-md text-xs text-[#8b97a8]">
            Matchup recaps appear after completed weeks sync. Feature stories and live draft coverage
            remain available on Stories and Live.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link to={RFSN_ROUTES.stories} className="text-xs font-bold text-lime-400 hover:text-lime-300">
              Open Stories →
            </Link>
            <Link to={RFSN_ROUTES.live} className="text-xs font-bold text-lime-400 hover:text-lime-300">
              Open Live →
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {weeksBySeason.flatMap(([season, slots]) =>
              slots.map((w) => {
                const isActive = activeWeek?.season === w.season && activeWeek?.week === w.week;
                return (
                  <button
                    key={`${w.season}-${w.week}`}
                    type="button"
                    onClick={() => setSelected(w)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider transition-colors",
                      isActive
                        ? "border-lime-400/50 bg-lime-400/10 text-lime-300"
                        : "border-white/[0.08] text-[#8b97a8] hover:border-white/20 hover:text-zinc-200",
                    )}
                  >
                    {season} · Wk {w.week}
                  </button>
                );
              }),
            )}
          </div>

          {reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-secondary">
              No completed matchup reports for this week.
            </p>
          ) : (
            <ul className="space-y-3">
              {reports.map((r) => (
                <li
                  key={r.matchupId}
                  className="rounded-[15px] border border-white/[0.07] bg-white/[0.02] px-5 py-4"
                >
                  <p className="text-2xs font-semibold uppercase tracking-widest text-lime-400/90">
                    {r.season} · Week {r.week}
                    {r.gameType ? ` · ${r.gameType.replace(/_/g, " ")}` : ""}
                  </p>
                  <h4 className="mt-1 text-base font-bold text-white">{r.headline}</h4>
                  {r.shortRecap ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{r.shortRecap}</p>
                  ) : null}
                  {r.winner && r.loser ? (
                    <p className="mt-2 text-xs tabular-nums text-ink-secondary">
                      <span className="font-semibold text-zinc-300">{r.winner.name}</span>{" "}
                      {r.winner.score.toFixed(2)} — {r.loser.score.toFixed(2)}{" "}
                      <span className="text-zinc-400">{r.loser.name}</span>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <Link
            to={RFSN_ROUTES.stories}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-lime-400 hover:text-lime-300"
          >
            More league stories <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </RfsnMediaShell>
  );
}
