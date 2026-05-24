import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Loader2,
  Medal,
  RefreshCw,
  Trophy,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamRow {
  teamId: number;
  teamName: string;
  abbrev?: string;
  owners?: string;
  wins?: number;
  losses?: number;
  ties?: number;
  pointsFor?: number;
  pointsAgainst?: number;
  rankFinal?: number;
  playoffSeed?: number;
  logoUrl?: string;
  primaryColor?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function RankDecal({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-4 w-4 text-yellow-400" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-600" />;
  return <span className="w-4 text-center text-xs font-semibold text-muted-foreground">{rank}</span>;
}

function fmt(n: number | undefined, decimals = 1) {
  if (n == null) return "—";
  return Number(n).toFixed(decimals);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Standings() {
  const allSeasonsQ = trpc.espn.allSeasons.useQuery();
  const cachedQ = trpc.espn.cachedSeasons.useQuery();

  const allSeasons: number[] = allSeasonsQ.data ?? [];
  const cachedSeasons: number[] = cachedQ.data ?? [];

  const defaultSeason = cachedSeasons.length > 0
    ? Math.max(...cachedSeasons)
    : allSeasons.length > 0 ? allSeasons[allSeasons.length - 1] : 2025;

  const [season, setSeason] = useState(defaultSeason);

  const standingsQ = trpc.espn.standings.useQuery(
    { season },
    { enabled: cachedSeasons.includes(season) }
  );

  const teams = (standingsQ.data as TeamRow[] | undefined) ?? [];
  const isNotCached = !cachedSeasons.includes(season);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Standings</h1>
          <p className="mt-1 text-muted-foreground">Final league standings by season.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={standingsQ.isFetching || isNotCached}
          onClick={() => void standingsQ.refetch()}
        >
          {standingsQ.isFetching
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Season selector */}
      <div className="flex items-center gap-3">
        <Select
          value={String(season)}
          onValueChange={v => setSeason(Number(v))}
        >
          <SelectTrigger className="w-32 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...allSeasons].reverse().map(s => (
              <SelectItem key={s} value={String(s)}>
                <span className="flex items-center gap-1.5">
                  {s}
                  {cachedSeasons.includes(s) && (
                    <span className="text-emerald-400 text-xs">✓</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {teams.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {teams.length} teams
          </span>
        )}
      </div>

      {/* Not-cached notice */}
      {isNotCached && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Season {season} hasn't been synced yet.{" "}
          <a href="/sync" className="underline underline-offset-2">Sync it now</a>.
        </div>
      )}

      {/* Loading */}
      {standingsQ.isLoading && (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading standings…
        </div>
      )}

      {/* Error */}
      {standingsQ.isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {standingsQ.error.message}
        </div>
      )}

      {/* Empty */}
      {!standingsQ.isLoading && !standingsQ.isError && !isNotCached && teams.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          No standings data for {season}.
        </div>
      )}

      {/* Standings table */}
      {teams.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {season} Final Standings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-10 px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">#</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Team</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">W</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">L</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">T</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">PF</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">PA</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground hidden md:table-cell">Seed</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team, idx) => {
                    const rank = team.rankFinal ?? (idx + 1);
                    const isChamp = rank === 1;
                    return (
                      <tr
                        key={team.teamId}
                        className={cn(
                          "border-b border-border/50 last:border-0 transition-colors hover:bg-accent/20",
                          isChamp && "bg-yellow-500/5"
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <RankDecal rank={rank} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground leading-tight">
                            {team.teamName || `Team ${team.teamId}`}
                          </div>
                          {team.owners && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {team.owners}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-foreground">{team.wins ?? "—"}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{team.losses ?? "—"}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{team.ties ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-mono text-foreground">{fmt(team.pointsFor)}</td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">{fmt(team.pointsAgainst)}</td>
                        <td className="hidden px-4 py-3 text-center text-xs text-muted-foreground md:table-cell">
                          {team.playoffSeed ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-border">
              {teams.map((team, idx) => {
                const rank = team.rankFinal ?? (idx + 1);
                return (
                  <div key={team.teamId} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <RankDecal rank={rank} />
                      <div>
                        <div className="font-medium text-foreground text-sm">
                          {team.teamName || `Team ${team.teamId}`}
                        </div>
                        <div className="text-xs text-muted-foreground">{team.owners}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-foreground text-sm">
                        {team.wins ?? "—"}–{team.losses ?? "—"}
                        {(team.ties ?? 0) > 0 ? `–${team.ties}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {fmt(team.pointsFor)} pts
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
