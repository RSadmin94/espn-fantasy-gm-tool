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

export function RingOfHonor() {
  const q = trpc.espn.ringOfHonor.useQuery(undefined, { staleTime: 60_000 });

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  const medals     = q.data?.medals      ?? [];
  const leaderboard = q.data?.leaderboard ?? [];
  const diag       = q.data?.diagnostics;

  const bySeason = [...medals].sort((a, b) => b.season - a.season);

  const unmatchedCount = (diag?.unmatchedChampionTeams?.length ?? 0) +
    (diag?.unmatchedRunnerUpTeams?.length ?? 0) +
    (diag?.unmatchedThirdTeams?.length ?? 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-1 pb-12">

      <div className="space-y-0.5">
        <h1 className="text-3xl font-bold text-foreground">Ring of Honor</h1>
        <p className="text-sm text-muted-foreground">
          Championships resolved from ESPN team names → owners via team roster data
        </p>
      </div>

      {/* Diagnostics bar */}
      {diag && (
        <div className={cn(
          "rounded-md border px-4 py-2 font-mono text-xs text-muted-foreground",
          unmatchedCount > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-muted/10",
        )}>
          <span className="font-semibold text-foreground/60">diag</span>
          {" · "}medals: <span className="text-foreground">{diag.totalMedals}</span>
          {" · "}champion-unmatched:{" "}
          <span
            className={cn(diag.unmatchedChampionTeams.length > 0 ? "font-bold text-amber-400" : "text-emerald-400")}
            title={diag.unmatchedChampionTeams.map((u) => `${u.season}: ${u.teamName}`).join(" | ") || undefined}
          >
            {diag.unmatchedChampionTeams.length > 0
              ? diag.unmatchedChampionTeams.map((u) => `${u.season}: ${u.teamName}`).join(", ")
              : "ok"}
          </span>
          {" · "}runner-up-unmatched:{" "}
          <span className={cn(diag.unmatchedRunnerUpTeams.length > 0 ? "font-bold text-amber-400" : "text-emerald-400")}>
            {diag.unmatchedRunnerUpTeams.length > 0 ? diag.unmatchedRunnerUpTeams.length : "ok"}
          </span>
          {" · "}third-unmatched:{" "}
          <span className={cn(diag.unmatchedThirdTeams.length > 0 ? "font-bold text-amber-400" : "text-emerald-400")}>
            {diag.unmatchedThirdTeams.length > 0 ? diag.unmatchedThirdTeams.length : "ok"}
          </span>
        </div>
      )}

      {/* Leaderboard */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Champion Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No data. Scrape ESPN League History Medals on the Sync Data page first.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Titles</TableHead>
                <TableHead>Championship Seasons</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((row, idx) => (
                <TableRow key={row.ownerKey}>
                  <TableCell className="text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{row.ownerName}</TableCell>
                  <TableCell className="text-right tabular-nums font-bold">{row.titles}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{row.seasons.join(", ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Championship history */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Championship History</h2>
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
                  <TableCell className={cn(
                    "font-medium",
                    row.resolvedChampionOwner ? "text-foreground" : "text-amber-400",
                  )}>
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

    </div>
  );
}
