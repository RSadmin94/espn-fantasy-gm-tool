import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function RingOfHonor() {
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const q = trpc.espn.ringOfHonor.useQuery(undefined, { staleTime: 60_000 });
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
      void utils.espn.leagueHistoryH2H.invalidate();
      void utils.espn.ringOfHonor.invalidate();
      setBackfilling(false);
    },
    onError: (e) => {
      setBackfillNote(`Error: ${e.message}`);
      setBackfilling(false);
    },
  });

  const isLoading = q.isLoading || recordsQ.isLoading;
  const diag = recordsQ.data?.diagnostics;
  const coverageWarning = diag?.coverageWarning ?? false;
  const emptySeasons = diag?.emptySeasons ?? [];
  const cacheSeasons = diag?.cacheSeasons ?? [];
  const dbSeasons = diag?.dbSeasons ?? [];

  const mergedOwners = useMemo(() => {
    const leaderboard = q.data?.leaderboard ?? [];
    const records = recordsQ.data?.owners ?? [];
    const recordByDispNorm = new Map(records.map((r) => [normalizeOwnerKey(r.displayName), r]));

    const keys = new Set<string>();
    for (const row of leaderboard) keys.add(row.ownerKey);
    for (const row of records) keys.add(normalizeOwnerKey(row.displayName));

    return [...keys]
      .map((ownerKey) => {
        const titles = leaderboard.find((l) => l.ownerKey === ownerKey);
        const rec = recordByDispNorm.get(ownerKey);
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
  }, [q.data, recordsQ.data]);

  const medals = q.data?.medals ?? [];
  const rohDiag = q.data?.diagnostics;

  const bySeason = [...medals].sort((a, b) => b.season - a.season);

  const unmatchedCount =
    (rohDiag?.unmatchedChampionTeams?.length ?? 0) +
    (rohDiag?.unmatchedRunnerUpTeams?.length ?? 0) +
    (rohDiag?.unmatchedThirdTeams?.length ?? 0);

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
      <div className="space-y-0.5">
        <h1 className="text-3xl font-bold text-foreground">Ring of Honor</h1>
        <p className="text-sm text-muted-foreground">
          Championships resolved from ESPN team names → owners via team roster data. Titles from{" "}
          <code className="text-xs">ringOfHonor</code>
          {" · "}
          W-L-T from <code className="text-xs">ownerAllTimeRecords</code> (weekly matchups).
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Owners: {mergedOwners.length} · Titles credited: {totalTitles} · Matchup games counted: {totalGames}
          {" · "}
          <span className="text-muted-foreground/80">
            Former <code className="text-[11px]">/championships</code> route redirects here.
          </span>
        </p>
      </div>

      {/* 1. Championships & owner records (titles + career W-L-T from matchups) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">1. Championships &amp; owner records</h2>
        <p className="text-xs text-muted-foreground">
          Titles from league medals resolution; W-L-T from deduped regular-season matchups. One row per owner.
        </p>
        {mergedOwners.length === 0 ? (
          <p className="text-sm text-muted-foreground">No owner rows yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Titles</TableHead>
                <TableHead>Title seasons</TableHead>
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
        )}
      </section>

      {/* 2. Championship History by season */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">2. Championship history by season</h2>
        {bySeason.length === 0 ? (
          <p className="text-sm text-muted-foreground">No medal records found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Season</TableHead>
                <TableHead>Champion Team</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Runner-Up</TableHead>
                <TableHead>Third</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bySeason.map((row) => (
                <TableRow key={row.season}>
                  <TableCell className="tabular-nums font-medium">{row.season}</TableCell>
                  <TableCell>{dash(row.championTeam)}</TableCell>
                  <TableCell
                    className={cn("font-medium", row.resolvedChampionOwner ? "text-foreground" : "text-amber-400")}
                  >
                    {dash(row.resolvedChampionOwner)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{dash(row.runnerUpTeam)}</TableCell>
                  <TableCell className="text-muted-foreground">{dash(row.thirdTeam)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* 3. Matchup coverage & diagnostics */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">3. Matchup Coverage &amp; Diagnostics</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Medal join health, matchup row counts, and per-season gmMatchups vs cache (from existing APIs only).
          </p>
        </div>

        {rohDiag && (
          <div
            className={cn(
              "rounded-md border px-4 py-2 font-mono text-xs text-muted-foreground",
              unmatchedCount > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-muted/10",
            )}
          >
            <span className="font-semibold text-foreground/60">League medals → owners</span>
            {" · "}rows: <span className="text-foreground">{rohDiag.totalMedals}</span>
            {" · "}champion-unmatched:{" "}
            <span
              className={cn(rohDiag.unmatchedChampionTeams.length > 0 ? "font-bold text-amber-400" : "text-emerald-400")}
              title={rohDiag.unmatchedChampionTeams.map((u) => `${u.season}: ${u.teamName}`).join(" | ") || undefined}
            >
              {rohDiag.unmatchedChampionTeams.length > 0
                ? rohDiag.unmatchedChampionTeams.map((u) => `${u.season}: ${u.teamName}`).join(", ")
                : "ok"}
            </span>
            {" · "}runner-up-unmatched:{" "}
            <span className={cn(rohDiag.unmatchedRunnerUpTeams.length > 0 ? "font-bold text-amber-400" : "text-emerald-400")}>
              {rohDiag.unmatchedRunnerUpTeams.length > 0 ? rohDiag.unmatchedRunnerUpTeams.length : "ok"}
            </span>
            {" · "}third-unmatched:{" "}
            <span className={cn(rohDiag.unmatchedThirdTeams.length > 0 ? "font-bold text-amber-400" : "text-emerald-400")}>
              {rohDiag.unmatchedThirdTeams.length > 0 ? rohDiag.unmatchedThirdTeams.length : "ok"}
            </span>
          </div>
        )}

        {diag && (
          <div
            className={cn(
              "rounded-md border px-4 py-3 font-mono text-xs text-muted-foreground space-y-2",
              coverageWarning ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-muted/10",
            )}
          >
            <div>
              <span className="font-semibold text-foreground/60">Matchup coverage (ownerAllTimeRecords)</span>
              {" · "}total-rows: <span className="text-foreground">{diag.rawMatchupRows}</span>
              {" · "}unique: <span className="text-foreground">{diag.uniqueMatchups}</span>
              {" · "}dups:{" "}
              <span className={diag.duplicateMatchups > 0 ? "text-amber-400" : "text-foreground"}>{diag.duplicateMatchups}</span>
              {" · "}db-seasons: <span className="text-emerald-400">{dbSeasons.length > 0 ? dbSeasons.join(", ") : "none"}</span>
              {" · "}cache-seasons:{" "}
              <span className={cacheSeasons.length > 0 ? "text-blue-400" : "text-muted-foreground"}>
                {cacheSeasons.length > 0 ? cacheSeasons.join(", ") : "none"}
              </span>
              {emptySeasons.length > 0 && (
                <>
                  {" · "}missing: <span className="font-bold text-red-400">{emptySeasons.join(", ")}</span>
                </>
              )}
            </div>
            {coverageWarning && (
              <p className="text-amber-300 font-semibold">
                ⚠ Historical matchup coverage incomplete — owner W-L-T may be partial until gmMatchups is backfilled.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setBackfilling(true);
                  setBackfillNote(null);
                  backfillMut.mutate();
                }}
                disabled={backfilling}
                className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-foreground hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                {backfilling ? (
                  <>
                    <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                    Backfilling…
                  </>
                ) : (
                  "Backfill matchups from cache"
                )}
              </button>
              {backfillNote && <span className="text-[11px] text-muted-foreground">{backfillNote}</span>}
            </div>
          </div>
        )}

        {coverageQ.data && (
          <details
            className="rounded-md border border-border/40 bg-muted/5"
            open={coverageWarning || coverageQ.data.seasons.some((s) => !s.usable)}
          >
            <summary className="cursor-pointer px-4 py-2 text-xs font-mono text-muted-foreground hover:text-foreground">
              Season-by-season coverage (
              {coverageQ.data.seasons.filter((s) => s.gmMatchupsRows === 0).length} seasons with 0 gmMatchups rows)
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
                      <td className={cn("py-0.5 text-center", s.usable ? "text-emerald-400" : "text-red-400")}>
                        {s.usable ? "✓" : "✗"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
