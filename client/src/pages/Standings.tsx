import { useMemo, useState } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

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

interface TxRow {
  teamId?: number | null;
  transactionId?: string | null;
}

type StandingsMode = "regular" | "final";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const SEASONS_DESC = Array.from({ length: CURRENT_YEAR - 2009 + 1 }, (_, i) => CURRENT_YEAR - i);

function num(n: number | undefined | null): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function fmt1(n: number | undefined | null) {
  return num(n).toFixed(1);
}

function gamesPlayed(t: TeamRow): number {
  const g = num(t.wins) + num(t.losses) + num(t.ties);
  return g > 0 ? g : 1;
}

function winPct(t: TeamRow): number {
  const w = num(t.wins);
  const l = num(t.losses);
  const ti = num(t.ties);
  const g = w + l + ti;
  return g > 0 ? (w + 0.5 * ti) / g : 0;
}

/** Regular season: win pct desc, then PF desc (ESPN-style tiebreak). */
function compareRegular(a: TeamRow, b: TeamRow): number {
  const dPct = winPct(b) - winPct(a);
  if (Math.abs(dPct) > 1e-9) return dPct;
  return num(b.pointsFor) - num(a.pointsFor);
}

/** Final: league final rank, then regular tiebreak. */
function compareFinal(a: TeamRow, b: TeamRow): number {
  const ra = a.rankFinal != null && Number.isFinite(Number(a.rankFinal)) ? Number(a.rankFinal) : 999;
  const rb = b.rankFinal != null && Number.isFinite(Number(b.rankFinal)) ? Number(b.rankFinal) : 999;
  if (ra !== rb) return ra - rb;
  return compareRegular(a, b);
}

function formatRec(t: TeamRow): string {
  return `${num(t.wins)}-${num(t.losses)}-${num(t.ties)}`;
}

function formatDiff(pf: number, pa: number): { text: string; positive: boolean; zero: boolean } {
  const d = pf - pa;
  const zero = Math.abs(d) < 0.05;
  const positive = d > 0;
  const sign = zero ? "" : d > 0 ? "+" : "";
  return { text: `${sign}${d.toFixed(1)}`, positive, zero };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Standings() {
  const cachedQ = trpc.espn.cachedSeasons.useQuery();

  const cachedSeasons: number[] = cachedQ.data ?? [];

  const defaultSeason =
    cachedSeasons.length > 0 ? Math.max(...cachedSeasons) : Math.min(CURRENT_YEAR, 2025);

  const [season, setSeason] = useState<number>(defaultSeason);
  const [mode, setMode] = useState<StandingsMode>("regular");

  const standingsQ = trpc.espn.standings.useQuery({ season }, { staleTime: 60_000 });
  const txsQ = trpc.espn.transactions.useQuery(
    { season, typeFilter: "ALL" },
    { staleTime: 60_000 }
  );

  const rawTeams = (standingsQ.data as TeamRow[] | undefined) ?? [];
  const isNotCached = !cachedSeasons.includes(season);

  const moveCountByTeam = useMemo(() => {
    const txs = (txsQ.data as TxRow[] | undefined) ?? [];
    const perTeam = new Map<number, Set<string>>();
    for (const row of txs) {
      const tid = row.teamId != null ? Number(row.teamId) : NaN;
      const txid = row.transactionId != null ? String(row.transactionId) : "";
      if (!Number.isFinite(tid) || tid <= 0 || !txid) continue;
      if (!perTeam.has(tid)) perTeam.set(tid, new Set());
      perTeam.get(tid)!.add(txid);
    }
    const counts = new Map<number, number>();
    for (const [tid, set] of perTeam) counts.set(tid, set.size);
    return counts;
  }, [txsQ.data]);

  const teams = useMemo(() => {
    const copy = [...rawTeams];
    copy.sort(mode === "final" ? compareFinal : compareRegular);
    return copy;
  }, [rawTeams, mode]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Standings</h1>
          <p className="mt-1 text-muted-foreground">
            League standings in ESPN layout — switch between regular season order and final ranks.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={standingsQ.isFetching || txsQ.isFetching}
          onClick={() => {
            void standingsQ.refetch();
            void txsQ.refetch();
          }}
        >
          {standingsQ.isFetching || txsQ.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-[7.5rem]">
          <Select value={String(season)} onValueChange={(v) => setSeason(Number(v))}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEASONS_DESC.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  <span className="flex items-center gap-1.5">
                    {s}
                    {cachedSeasons.includes(s) && (
                      <span className="text-xs text-emerald-400">✓</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => {
            if (v === "regular" || v === "final") setMode(v);
          }}
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          <ToggleGroupItem value="regular" className="text-xs">
            Regular Season
          </ToggleGroupItem>
          <ToggleGroupItem value="final" className="text-xs">
            Final Standings
          </ToggleGroupItem>
        </ToggleGroup>

        {teams.length > 0 && (
          <span className="text-sm text-muted-foreground">{teams.length} teams</span>
        )}
      </div>

      {isNotCached && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Season {season} is not in the local cache yet.{" "}
          <a href="/sync" className="underline underline-offset-2">
            Sync data
          </a>{" "}
          to load standings and moves.
        </div>
      )}

      {standingsQ.isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading standings…
        </div>
      )}

      {standingsQ.isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {standingsQ.error.message}
        </div>
      )}

      {!standingsQ.isLoading && !standingsQ.isError && teams.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          No standings data for {season}.
        </div>
      )}

      {teams.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {season} {mode === "final" ? "Final" : "Regular season"} standings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="sticky left-0 z-10 bg-muted/40 px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      RK
                    </th>
                    <th className="min-w-[200px] px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Team
                    </th>
                    <th className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      REC
                    </th>
                    <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      PF
                    </th>
                    <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      PA
                    </th>
                    <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      PF/G
                    </th>
                    <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      PA/G
                    </th>
                    <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      DIFF
                    </th>
                    <th className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      MOVES
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team, idx) => {
                    const rk = idx + 1;
                    const pf = num(team.pointsFor);
                    const pa = num(team.pointsAgainst);
                    const gp = gamesPlayed(team);
                    const pfg = pf / gp;
                    const pag = pa / gp;
                    const diff = formatDiff(pf, pa);
                    const moves = moveCountByTeam.get(team.teamId) ?? 0;
                    const logo = (team.logoUrl || "").trim();

                    return (
                      <tr
                        key={team.teamId}
                        className="border-b border-border/50 transition-colors hover:bg-accent/15"
                      >
                        <td className="sticky left-0 z-10 bg-card px-2 py-2.5 text-sm font-semibold tabular-nums text-foreground">
                          {rk}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/40">
                              {logo ? (
                                <img
                                  src={logo}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground">
                                  {(team.abbrev || team.teamName || "?").slice(0, 3).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 leading-tight">
                              <div className="truncate font-medium text-foreground">
                                {team.teamName?.trim() || `Team ${team.teamId}`}
                              </div>
                              {(team.owners || "").trim() !== "" && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {team.owners}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-xs tabular-nums text-foreground">
                          {formatRec(team)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                          {fmt1(team.pointsFor)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {fmt1(team.pointsAgainst)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                          {pfg.toFixed(1)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {pag.toFixed(1)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-2.5 text-right font-mono text-xs font-semibold tabular-nums",
                            diff.zero && "text-muted-foreground",
                            !diff.zero && diff.positive && "text-emerald-400",
                            !diff.zero && !diff.positive && "text-red-400"
                          )}
                        >
                          {diff.text}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-xs tabular-nums text-muted-foreground">
                          {txsQ.isLoading ? "…" : moves}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
