import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { Loader2, AlertTriangle, ListChecks, Info } from "lucide-react";

// Server-provided forecast row (keeperForecastService.computeLeagueKeeperForecast).
// The client never recomputes value, status, or confidence.
type KeeperForecastStatus = "MANUAL" | "CONFIRMED" | "PREDICTED";
type KeeperForecastRow = {
  ownerKey: string;
  ownerName: string;
  playerId: number;
  playerName: string;
  position: string;
  keeperRound: number;
  roundsSaved: number | null;
  status: KeeperForecastStatus;
  confidence: number;
  reason: string;
};

const POS_STYLE: Record<string, string> = {
  QB: "text-rose-400", RB: "text-emerald-400", WR: "text-sky-400",
  TE: "text-amber-400", K: "text-zinc-400", "D/ST": "text-zinc-400", DEF: "text-zinc-400",
};

const STATUS_STYLE: Record<KeeperForecastStatus, string> = {
  MANUAL: "border-lime-600 bg-lime-600/15 text-lime-300",
  CONFIRMED: "border-cyan-600 bg-cyan-600/15 text-cyan-300",
  PREDICTED: "border-amber-600 bg-amber-600/15 text-amber-300",
};

export function LeagueKeeperForecast({ embedded = false }: { embedded?: boolean } = {}) {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );
  const draftYear = new Date().getFullYear();

  const forecastQ = trpc.espn.leagueKeeperForecast.useQuery(
    withLeagueSalt({ draftYear }, leagueContextKey),
    { enabled: leagueKeyReady },
  );

  const payload = leagueKeyReady ? forecastQ.data : undefined;
  const rows = useMemo((): KeeperForecastRow[] => {
    const raw = (payload as { forecast?: KeeperForecastRow[] } | undefined)?.forecast;
    return Array.isArray(raw) ? raw : [];
  }, [payload]);

  const counts = useMemo(() => {
    const c = { MANUAL: 0, CONFIRMED: 0, PREDICTED: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const loading = leagueKeyReady && forecastQ.isLoading;
  const errorMsg = (payload as { error?: string } | undefined)?.error;

  return (
    <div className={embedded ? "" : "min-h-screen bg-zinc-950 px-4 py-6 sm:px-8"}>
      <div className={embedded ? "" : "mx-auto max-w-6xl"}>
        {!embedded ? (
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-lime-700/40 bg-lime-600/10">
            <ListChecks className="h-6 w-6 text-lime-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">League Keeper Forecast {draftYear}</h1>
            <p className="text-sm text-zinc-400">
              A reasonable estimate of what each owner is likely to keep before real selections exist.
            </p>
            <p className="mt-0.5 text-xs text-zinc-600">
              Manual selections and ESPN-confirmed keepers always override the forecast.
            </p>
          </div>
        </div>
        ) : null}

        {/* States */}
        {loading && (
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Building forecast…
          </div>
        )}
        {!loading && errorMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-800/50 bg-amber-900/15 px-4 py-6 text-amber-300">
            <AlertTriangle className="h-4 w-4" /> {errorMsg}
          </div>
        )}
        {!loading && !errorMsg && rows.length === 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-zinc-400">
            No keeper forecast available for this league yet.
          </div>
        )}

        {/* Forecast table */}
        {!loading && !errorMsg && rows.length > 0 && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded px-2 py-1 font-bold uppercase tracking-wider border border-lime-600 bg-lime-600/15 text-lime-300">{counts.MANUAL} Manual</span>
              <span className="rounded px-2 py-1 font-bold uppercase tracking-wider border border-cyan-600 bg-cyan-600/15 text-cyan-300">{counts.CONFIRMED} Confirmed</span>
              <span className="rounded px-2 py-1 font-bold uppercase tracking-wider border border-amber-600 bg-amber-600/15 text-amber-300">{counts.PREDICTED} Predicted</span>
              <span className="ml-auto text-zinc-600">{rows.length} owners · one forecast each</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-[12px] uppercase tracking-wider text-zinc-500">
                    <th className="px-4 py-3 font-semibold">Owner</th>
                    <th className="px-4 py-3 font-semibold">Keeper</th>
                    <th className="px-3 py-3 font-semibold">Pos</th>
                    <th className="px-3 py-3 font-semibold text-center">Keeper Cost</th>
                    <th className="px-3 py-3 font-semibold text-center">Rounds Saved</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.ownerKey}
                      className={cn("border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/20", i % 2 ? "bg-zinc-900/20" : "")}
                    >
                      <td className="px-4 py-3 font-semibold text-zinc-200">{r.ownerName}</td>
                      <td className="px-4 py-3 font-bold text-white">{r.playerName}</td>
                      <td className={cn("px-3 py-3 font-bold", POS_STYLE[r.position] ?? "text-zinc-400")}>{r.position}</td>
                      <td className="px-3 py-3 text-center text-zinc-300">Rd {r.keeperRound}</td>
                      <td className="px-3 py-3 text-center">
                        {r.roundsSaved == null ? (
                          <span className="text-zinc-600">—</span>
                        ) : (
                          <span className={cn("font-bold", r.roundsSaved > 0 ? "text-emerald-400" : r.roundsSaved < 0 ? "text-rose-400" : "text-zinc-400")}>
                            {r.roundsSaved > 0 ? `+${r.roundsSaved}` : r.roundsSaved}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", STATUS_STYLE[r.status])}>
                          {r.status} <span className="opacity-70">{r.confidence}%</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-600">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Predicted keepers are the highest-value player on each roster (75% display confidence). They feed Draft After Keepers until a real keeper is set.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
