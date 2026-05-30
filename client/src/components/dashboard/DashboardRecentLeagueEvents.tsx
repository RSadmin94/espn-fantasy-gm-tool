import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

type Props = {
  /** Seasons to pull from `gmTransactions` (most recent activity first after merge). */
  seasons: number[];
  enabled?: boolean;
};

function formatWhen(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function DashboardRecentLeagueEvents({ seasons, enabled = true }: Props) {
  const uniqSeasons = useMemo(() => [...new Set(seasons.filter((s) => Number.isFinite(s) && s > 0))].slice(0, 6), [seasons.join(",")]);

  const q = trpc.espn.recentLeagueTransactionEvents.useQuery(
    { seasons: uniqSeasons.length ? uniqSeasons : [new Date().getFullYear()], limit: 12 },
    { enabled: enabled && uniqSeasons.length > 0, staleTime: 45_000 },
  );

  if (!enabled || uniqSeasons.length === 0) {
    return <p className="text-sm text-zinc-500">No recent completed transactions available.</p>;
  }

  if (q.isLoading || q.isFetching) {
    return (
      <div className="flex items-center gap-2 px-2 py-4 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
      </div>
    );
  }

  if (q.isError) {
    return <p className="px-2 py-4 text-sm text-zinc-500">No recent completed transactions available.</p>;
  }

  const rows = q.data ?? [];
  if (rows.length === 0) {
    return <p className="px-2 py-4 text-sm text-zinc-500">No recent completed transactions available.</p>;
  }

  return (
    <ul className="max-h-[280px] space-y-2 overflow-y-auto px-2 py-3">
      {rows.map((r, i) => (
        <li
          key={`${r.eventType}-${r.processedMs}-${i}`}
          className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-400/90">{r.eventType}</span>
            <span className="shrink-0 text-[10px] text-zinc-500">{formatWhen(r.processedMs)}</span>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-zinc-100">{r.teamLabel}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400">{r.playersLine}</p>
          <p className="mt-1 text-[10px] text-zinc-600">Season {r.season}</p>
        </li>
      ))}
    </ul>
  );
}
