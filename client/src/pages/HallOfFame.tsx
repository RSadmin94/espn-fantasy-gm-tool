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
import type { ReactNode } from "react";

function dash(v: string | null | undefined): string {
  return v?.trim() || "—";
}

type Maybe<T> = { available: true; value: T } | { available: false; reason: string };

function formatValue(rec: Maybe<Record<string, unknown>>): ReactNode {
  if (!rec.available) {
    return <span className="text-muted-foreground">Unavailable — {rec.reason}</span>;
  }
  const o = rec.value;
  return (
    <span className="text-foreground/95 tabular-nums">
      {Object.entries(o)
        .map(([k, v]) => `${k}: ${typeof v === "number" ? (Number.isInteger(v) ? v : Number(v).toFixed(2)) : String(v)}`)
        .join(" · ")}
    </span>
  );
}

function RecordRow({ label, rec }: { label: string; rec: Maybe<Record<string, unknown>> }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/10 px-3 py-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="mt-0.5">{formatValue(rec)}</div>
    </div>
  );
}

export function HallOfFame() {
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const hofQ = trpc.espn.hallOfFame.useQuery(undefined, { staleTime: 60_000 });
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

  if (hofQ.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading Hall of Fame…
      </div>
    );
  }

  if (hofQ.isError || !data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 text-destructive text-sm">
        Could not load Hall of Fame: {hofQ.isError ? String(hofQ.error?.message ?? hofQ.error) : "no data"}
      </div>
    );
  }

  const sg = data.singleGameRecords;
  const rv = data.rivalryRecords;
  const sr = data.seasonRecords;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 pb-16 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-foreground">Hall of Fame</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Championships from <code className="text-xs">league_medals</code> (team names → owners via{" "}
          <code className="text-xs">gmTeams</code>). Owner W/L/T, single-game marks, rivalry indexes, and season
          bests use <strong>completed regular-season</strong> <code className="text-xs">gmMatchups</code> only — not
          standings snapshots and not <code className="text-xs">gmTeams</code> win/loss columns.
        </p>
        <p className="text-xs text-muted-foreground/90 rounded-md border border-border/40 bg-muted/15 px-3 py-2 mt-2">
          <strong>Coverage:</strong> {data.coverage.note} Deduped matchup rows:{" "}
          <span className="tabular-nums text-foreground">{data.coverage.dedupedMatchupRows}</span>
          {data.coverage.seasonsTouched.length > 0 && (
            <>
              {" "}
              · Seasons: {data.coverage.seasonsTouched.join(", ")}
            </>
          )}
        </p>
      </div>

      {/* 1. Championships */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground border-b border-border/50 pb-1">1. Championships</h2>
        <h3 className="text-sm font-medium text-muted-foreground">Champion leaderboard</h3>
        {data.championships.leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground">No resolved champions yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Titles</TableHead>
                <TableHead>Title seasons</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.championships.leaderboard.map((row) => (
                <TableRow key={row.ownerKey}>
                  <TableCell>
                    <div className="font-medium">{row.displayName}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[240px]">{row.ownerKey}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.titles}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums text-sm">
                    {row.titleSeasons.length ? row.titleSeasons.join(", ") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <h3 className="text-sm font-medium text-muted-foreground pt-4">Championship history</h3>
        <p className="text-xs text-muted-foreground">Podium slots from medals; owners resolved per season.</p>
        {data.championships.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No medal rows.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Season</TableHead>
                <TableHead>Champion (team label)</TableHead>
                <TableHead>Champion owner</TableHead>
                <TableHead>Runner-up</TableHead>
                <TableHead>Third</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.championships.history.map((row) => (
                <TableRow key={row.season}>
                  <TableCell className="font-medium tabular-nums">{row.season}</TableCell>
                  <TableCell>{dash(row.championTeam)}</TableCell>
                  <TableCell className={cn(row.resolvedChampionOwnerKey ? "" : "text-amber-400")}>
                    {dash(row.resolvedChampionDisplay)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{dash(row.runnerUpTeam)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{dash(row.thirdTeam)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* 2. Owner records */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground border-b border-border/50 pb-1">2. Owner records</h2>
        <p className="text-xs text-muted-foreground">
          W/L/T from deduped completed RS gmMatchups + canonical owner keys. Titles from medals (unique seasons).
        </p>
        {data.ownerRecords.length === 0 ? (
          <p className="text-sm text-muted-foreground">No owner rows.</p>
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
                <TableHead className="text-right">Seasons active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.ownerRecords.map((row) => (
                <TableRow key={row.ownerKey}>
                  <TableCell>
                    <div className="font-medium">{row.displayName}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[220px]">{row.ownerKey}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.titles}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.titleSeasons.join(", ") || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.wins}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.losses}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.ties}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.winPct.toFixed(1)}%</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{row.seasonsActive}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* 3. Single-game */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground border-b border-border/50 pb-1">3. Single-game records</h2>
        <p className="text-xs text-muted-foreground">All from completed RS gmMatchups (deduped).</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <RecordRow label="Highest team score" rec={sg.highestTeamScore as Maybe<Record<string, unknown>>} />
          <RecordRow label="Lowest team score" rec={sg.lowestTeamScore as Maybe<Record<string, unknown>>} />
          <RecordRow label="Biggest blowout (margin)" rec={sg.biggestBlowout as Maybe<Record<string, unknown>>} />
          <RecordRow label="Closest game (smallest margin)" rec={sg.closestGame as Maybe<Record<string, unknown>>} />
          <RecordRow label="Highest combined score" rec={sg.highestCombinedScore as Maybe<Record<string, unknown>>} />
          <RecordRow label="Lowest combined score" rec={sg.lowestCombinedScore as Maybe<Record<string, unknown>>} />
        </div>
      </section>

      {/* 4. Rivalry */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground border-b border-border/50 pb-1">4. Rivalry records</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <RecordRow label="Most games (pair)" rec={rv.mostGamesPlayed as Maybe<Record<string, unknown>>} />
          <RecordRow label="Most lopsided (avg |margin|, ≥3 games)" rec={rv.mostLopsidedRivalry as Maybe<Record<string, unknown>>} />
          <RecordRow label="Most heartbreak games (≤3 pt, decisive)" rec={rv.mostHeartbreakGames as Maybe<Record<string, unknown>>} />
          <RecordRow label="Longest dominance (consecutive wins vs one opponent)" rec={rv.longestDominance as Maybe<Record<string, unknown>>} />
        </div>
      </section>

      {/* 5. Season */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground border-b border-border/50 pb-1">5. Season records</h2>
        <p className="text-xs text-muted-foreground">Owner-season rows need ≥6 RS games in gmMatchups.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <RecordRow label="Best regular-season record (win %)" rec={sr.bestRegularSeasonRecord as Maybe<Record<string, unknown>>} />
          <RecordRow label="Worst regular-season record" rec={sr.worstRegularSeasonRecord as Maybe<Record<string, unknown>>} />
          <RecordRow label="Most points scored (season)" rec={sr.mostPointsInSeason as Maybe<Record<string, unknown>>} />
          <RecordRow label="Fewest points scored (season)" rec={sr.fewestPointsInSeason as Maybe<Record<string, unknown>>} />
        </div>
      </section>

      {/* Diagnostics — collapsed */}
      <details className="rounded-lg border border-border/60 bg-muted/5">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
          Data diagnostics &amp; tools
        </summary>
        <div className="space-y-4 border-t border-border/40 px-4 py-4 text-xs text-muted-foreground">
          {diag && (
            <div
              className={cn(
                "rounded-md border px-3 py-2 font-mono",
                unmatchedMedal > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-muted/10",
              )}
            >
              <span className="font-semibold text-foreground/70">Medals → owners</span> · rows: {diag.totalMedals} ·
              champion unmatched: {diag.unmatchedChampionTeams.length} · runner-up: {diag.unmatchedRunnerUpTeams.length}{" "}
              · third: {diag.unmatchedThirdTeams.length}
            </div>
          )}

          {coverageQ.data && (
            <details className="rounded-md border border-border/40" open={coverageWarning}>
              <summary className="cursor-pointer px-3 py-2 hover:text-foreground">
                Season-by-season gmMatchups coverage
              </summary>
              <div className="overflow-x-auto px-3 pb-3">
                <table className="w-full font-mono text-[11px]">
                  <thead>
                    <tr className="border-b border-border/40 text-muted-foreground">
                      <th className="py-1 text-left">Season</th>
                      <th className="py-1 text-right">Rows</th>
                      <th className="py-1 text-center">Usable?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageQ.data.seasons.map((s) => (
                      <tr key={s.season} className={cn("border-b border-border/20", !s.usable && "text-amber-300/90")}>
                        <td className="py-0.5">{s.season}</td>
                        <td className="py-0.5 text-right tabular-nums">{s.gmMatchupsRows}</td>
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
              className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-foreground hover:bg-primary/20 disabled:opacity-50"
            >
              {backfilling ? (
                <>
                  <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                  Backfilling…
                </>
              ) : (
                "Backfill gmMatchups from ESPN cache"
              )}
            </button>
            {backfillNote && <span className="text-[11px]">{backfillNote}</span>}
          </div>
          <p className="text-[11px] opacity-80">
            Legacy routes <code className="text-[10px]">/ring-of-honor</code> and{" "}
            <code className="text-[10px]">/championships</code> redirect here.
          </p>
        </div>
      </details>
    </div>
  );
}
