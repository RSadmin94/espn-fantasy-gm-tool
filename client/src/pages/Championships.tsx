import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

function dash(v: string | null | undefined): string {
  return v?.trim() || "—";
}

function normalizeOwnerKey(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^\(+|\)+$/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function Championships() {
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const ringQ = trpc.espn.ringOfHonor.useQuery(undefined, { staleTime: 60_000 });
  const recordsQ = trpc.espn.ownerAllTimeRecords.useQuery(undefined, { staleTime: 60_000 });
  const coverageQ = trpc.espn.ownerMatchupCoverage.useQuery(undefined, { staleTime: 60_000 });
  const backfillMut = trpc.espn.backfillMatchupsFromCache.useMutation({
    onSuccess: (data) => {
      const written = data.results.filter((r) => r.status === "backfilled");
      setBackfillNote(
        written.length > 0
          ? `Backfilled ${written.map((r) => r.season).join(", ")} (${data.totalWritten} rows). Refreshing…`
          : "No new seasons found in cache.",
      );
      void utils.espn.ownerAllTimeRecords.invalidate();
      void utils.espn.ownerMatchupCoverage.invalidate();
      setBackfilling(false);
    },
    onError: (e) => { setBackfillNote(`Error: ${e.message}`); setBackfilling(false); },
  });

  const isLoading = ringQ.isLoading || recordsQ.isLoading;
  const diag = recordsQ.data?.diagnostics;
  const coverageWarning = diag?.coverageWarning ?? false;
  const emptySeasons = diag?.emptySeasons ?? [];
  const cacheSeasons = diag?.cacheSeasons ?? [];
  const dbSeasons = diag?.dbSeasons ?? [];

  const mergedOwners = useMemo(() => {
    const leaderboard = ringQ.data?.leaderboard ?? [];
    const records = recordsQ.data?.owners ?? [];
    const recordByKey = new Map(records.map((r) => [r.ownerKey, r]));
    const recordByNorm = new Map(records.map((r) => [normalizeOwnerKey(r.displayName), r]));

    const keys = new Set<string>();
    for (const row of leaderboard) keys.add(row.ownerKey);
    for (const row of records) keys.add(row.ownerKey);

    return [...keys]
      .map((ownerKey) => {
        const titles = leaderboard.find((l) => l.ownerKey === ownerKey);
        const rec = recordByKey.get(ownerKey) ?? recordByNorm.get(ownerKey);
        const displayName = titles?.ownerName ?? rec?.displayName ?? ownerKey;
        const wins = rec?.wins ?? 0;
        const losses = rec?.losses ?? 0;
        const ties = rec?.ties ?? 0;
        const gamesPlayed = rec?.gamesPlayed ?? wins + losses + ties;
        const winPct = rec?.winPct ?? (gamesPlayed > 0 ? ((wins + 0.5 * ties) / gamesPlayed) * 100 : 0);
        return {
          ownerKey,
          displayName,
          titles: titles?.titles ?? 0,
          titleSeasons: titles?.seasons ?? [],
          wins,
          losses,
          ties,
          gamesPlayed,
          winPct,
        };
      })
      .sort(
        (a, b) =>
          b.titles - a.titles ||
          b.winPct - a.winPct ||
          b.wins - a.wins ||
          a.displayName.localeCompare(b.displayName),
      );
  }, [ringQ.data, recordsQ.data]);

  const medals = ringQ.data?.medals ?? [];
  const bySeason = useMemo(() => [...medals].sort((a, b) => a.season - b.season), [medals]);

  const totalTitles = mergedOwners.reduce((sum, o) => sum + o.titles, 0);
  const totalGames = mergedOwners.reduce((sum, o) => sum + o.gamesPlayed, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-1 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Championships</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Titles from <code className="text-xs">ringOfHonor</code> · W-L-T from{" "}
          <code className="text-xs">ownerAllTimeRecords</code> (weekly matchups)
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Owners: {mergedOwners.length} · Titles credited: {totalTitles} · Matchup games counted:{" "}
          {totalGames}
        </p>
      </div>

      {/* Coverage diagnostics bar */}
      {diag && (
        <div className={cn(
          "rounded-md border px-4 py-2 font-mono text-xs text-muted-foreground space-y-0.5",
          coverageWarning ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-muted/10",
        )}>
          <div>
            <span className="font-semibold text-foreground/60">matchup-coverage</span>
            {" · "}total-rows: <span className="text-foreground">{diag.rawMatchupRows}</span>
            {" · "}unique: <span className="text-foreground">{diag.uniqueMatchups}</span>
            {" · "}dups: <span className={diag.duplicateMatchups > 0 ? "text-amber-400" : "text-foreground"}>{diag.duplicateMatchups}</span>
            {" · "}db-seasons: <span className="text-emerald-400">{dbSeasons.length > 0 ? dbSeasons.join(", ") : "none"}</span>
            {" · "}cache-seasons: <span className={cacheSeasons.length > 0 ? "text-blue-400" : "text-muted-foreground"}>{cacheSeasons.length > 0 ? cacheSeasons.join(", ") : "none"}</span>
            {emptySeasons.length > 0 && (
              <>{" · "}missing: <span className="font-bold text-red-400">{emptySeasons.join(", ")}</span></>
            )}
          </div>
          {coverageWarning && (
            <div className="flex items-center gap-3 pt-1">
              <span className="text-amber-300 font-semibold">
                ⚠ Historical matchup coverage incomplete — records may be partial.
              </span>
              <button
                onClick={() => { setBackfilling(true); setBackfillNote(null); backfillMut.mutate(); }}
                disabled={backfilling}
                className="rounded border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
              >
                {backfilling ? <><Loader2 className="inline h-3 w-3 animate-spin mr-1" />Backfilling…</> : "Backfill from cache"}
              </button>
              {backfillNote && <span className="text-[11px] text-muted-foreground">{backfillNote}</span>}
            </div>
          )}
        </div>
      )}

      {/* Per-season coverage table (only shown when there's an issue) */}
      {coverageQ.data && coverageWarning && (
        <details className="rounded-md border border-border/40 bg-muted/5">
          <summary className="cursor-pointer px-4 py-2 text-xs font-mono text-muted-foreground hover:text-foreground">
            Season-by-season coverage ({coverageQ.data.seasons.filter((s) => s.gmMatchupsRows === 0).length} seasons missing from gmMatchups)
          </summary>
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground">
                  <th className="py-1 text-left">Season</th>
                  <th className="py-1 text-right">gmMatchups rows</th>
                  <th className="py-1 text-right">Completed</th>
                  <th className="py-1 text-right">Deduped</th>
                  <th className="py-1 text-right">gmTeams rows</th>
                  <th className="py-1 text-center">Cache?</th>
                  <th className="py-1 text-center">Usable?</th>
                </tr>
              </thead>
              <tbody>
                {coverageQ.data.seasons.map((s) => (
                  <tr key={s.season} className={cn("border-b border-border/20", !s.usable && "text-red-400/70")}>
                    <td className="py-0.5">{s.season}</td>
                    <td className="py-0.5 text-right tabular-nums">{s.gmMatchupsRows}</td>
                    <td className="py-0.5 text-right tabular-nums">{s.completedRows}</td>
                    <td className="py-0.5 text-right tabular-nums">{s.dedupedRows}</td>
                    <td className="py-0.5 text-right tabular-nums">{s.gmTeamsRows}</td>
                    <td className="py-0.5 text-center">{s.cacheAvailable ? "✓" : "—"}</td>
                    <td className={cn("py-0.5 text-center", s.usable ? "text-emerald-400" : "text-red-400")}>{s.usable ? "✓" : "✗"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Owner Records</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Titles</TableHead>
              <TableHead>Title Seasons</TableHead>
              <TableHead className="text-right">W</TableHead>
              <TableHead className="text-right">L</TableHead>
              <TableHead className="text-right">T</TableHead>
              <TableHead className="text-right">Win %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mergedOwners.map((row) => (
              <TableRow key={row.ownerKey}>
                <TableCell className="font-medium">{row.displayName}</TableCell>
                <TableCell className="text-right tabular-nums">{row.titles}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {row.titleSeasons.length > 0 ? row.titleSeasons.join(", ") : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.wins}</TableCell>
                <TableCell className="text-right tabular-nums">{row.losses}</TableCell>
                <TableCell className="text-right tabular-nums">{row.ties}</TableCell>
                <TableCell className="text-right tabular-nums">{row.winPct.toFixed(1)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Champions by Season</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Season</TableHead>
              <TableHead>Champion Team</TableHead>
              <TableHead>Champion Owner</TableHead>
              <TableHead>Runner-Up</TableHead>
              <TableHead>Third</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bySeason.map((row) => (
              <TableRow key={row.season}>
                <TableCell>{row.season}</TableCell>
                <TableCell>{dash(row.championTeam)}</TableCell>
                <TableCell>{dash(row.resolvedChampionOwner)}</TableCell>
                <TableCell>{dash(row.runnerUpTeam)}</TableCell>
                <TableCell>{dash(row.thirdTeam)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
