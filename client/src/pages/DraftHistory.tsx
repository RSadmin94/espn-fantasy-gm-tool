import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertCircle, Loader2 } from "lucide-react";

interface DraftPickRow {
  overallPick: number;
  round: number;
  roundPick: number;
  teamId: number;
  teamName: string;
  ownerName: string;
  playerId: number | null;
  playerName: string | null;
  position: string | null;
  nflTeam: string;
  isKeeper: boolean;
  bidAmount: number;
}

type ViewMode = "round" | "owner";

function PosBadge({ pos }: { pos: string | null | undefined }) {
  const p = (pos || "?").toUpperCase();
  const colors: Record<string, string> = {
    QB: "border-red-500/30 bg-red-500/10 text-red-300",
    RB: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    WR: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    TE: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    K: "border-purple-500/30 bg-purple-500/10 text-purple-300",
    DST: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    "D/ST": "border-slate-500/30 bg-slate-500/10 text-slate-300",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
        colors[p] ?? "border-border bg-muted/40 text-muted-foreground"
      )}
    >
      {p}
    </span>
  );
}

export function DraftHistory() {
  const allSeasonsQ = trpc.espn.allSeasons.useQuery();
  const cachedQ = trpc.espn.cachedSeasons.useQuery();

  const allSeasons: number[] = allSeasonsQ.data ?? [];
  const cachedSeasons: number[] = cachedQ.data ?? [];

  const defaultSeason =
    cachedSeasons.length > 0
      ? Math.max(...cachedSeasons)
      : allSeasons.length > 0
        ? allSeasons[allSeasons.length - 1]!
        : 2025;

  const [season, setSeason] = useState<number>(defaultSeason);
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("round");

  /** Always query by selected season — `draft_picks` may exist even if `cachedSeasons` omits the year. */
  const draftQ = trpc.espn.draftHistory.useQuery({ season }, { staleTime: 0 });

  const picks = (draftQ.data?.picks as DraftPickRow[] | undefined) ?? [];
  const draftSource = draftQ.data?.dataSource as string | undefined;

  const filteredPicks = useMemo(() => {
    if (teamFilter === "ALL") return picks;
    const tid = Number(teamFilter);
    if (!Number.isFinite(tid)) return picks;
    return picks.filter((p) => p.teamId === tid);
  }, [picks, teamFilter]);

  const teamOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of picks) {
      if (!m.has(p.teamId)) m.set(p.teamId, p.teamName);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [picks]);

  const byRound = useMemo(() => {
    const m = new Map<number, DraftPickRow[]>();
    for (const p of filteredPicks) {
      const r = p.round > 0 ? p.round : 1;
      const arr = m.get(r) ?? [];
      arr.push(p);
      m.set(r, arr);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => a.roundPick - b.roundPick || a.overallPick - b.overallPick);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [filteredPicks]);

  const maxSlots = useMemo(() => {
    let n = 0;
    for (const [, arr] of byRound) n = Math.max(n, arr.length);
    return n;
  }, [byRound]);

  /** Teams ordered by first overall pick in this season (stable draft order). */
  const byOwnerGroups = useMemo(() => {
    const m = new Map<number, DraftPickRow[]>();
    for (const p of filteredPicks) {
      const arr = m.get(p.teamId) ?? [];
      arr.push(p);
      m.set(p.teamId, arr);
    }
    const groups = [...m.values()].map((arr) => {
      arr.sort((a, b) => a.overallPick - b.overallPick);
      return arr;
    });
    groups.sort((a, b) => (a[0]?.overallPick ?? 0) - (b[0]?.overallPick ?? 0));
    return groups;
  }, [filteredPicks]);

  const summary = useMemo(() => {
    const keeperCount = filteredPicks.filter((p) => p.isKeeper).length;
    const byRoundPos: Record<number, Record<string, number>> = {};
    for (const p of filteredPicks) {
      const rd = p.round > 0 ? p.round : 1;
      const pos = (p.position || "?").toUpperCase();
      if (!byRoundPos[rd]) byRoundPos[rd] = {};
      byRoundPos[rd][pos] = (byRoundPos[rd][pos] ?? 0) + 1;
    }
    return {
      total: filteredPicks.length,
      keeperCount,
      byRoundPos,
      rounds: Object.keys(byRoundPos)
        .map(Number)
        .sort((a, b) => a - b),
    };
  }, [filteredPicks]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-1">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Draft History</h1>
        <p className="mt-1 text-muted-foreground">
          Draft board from synced league data — switch between round grid and picks grouped by team.
        </p>
        {draftSource === "verified_manual" ? (
          <p className="mt-2 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200">
            Source: verified_manual
          </p>
        ) : null}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="w-28">
            <Select
              value={String(season)}
              onValueChange={(v) => {
                setSeason(Number(v));
                setTeamFilter("ALL");
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...allSeasons].reverse().map((s) => (
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

          <div className="min-w-[12rem] flex-1">
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All teams</SelectItem>
                {teamOptions.map(([tid, name]) => (
                  <SelectItem key={tid} value={String(tid)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => {
              if (v === "round" || v === "owner") setViewMode(v);
            }}
            variant="outline"
            size="sm"
            className="shrink-0"
          >
            <ToggleGroupItem value="round" className="text-xs">
              By Round
            </ToggleGroupItem>
            <ToggleGroupItem value="owner" className="text-xs">
              By Owner
            </ToggleGroupItem>
          </ToggleGroup>
        </CardContent>
      </Card>

      {draftQ.isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading draft history…
        </div>
      )}

      {draftQ.isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {draftQ.error.message}
        </div>
      )}

      {!draftQ.isLoading && !draftQ.isError && picks.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          <p>
            {`No draft picks found for ${season}. Draft history is available from 2010 onwards. The 2009 season was the league's inaugural year with no draft data.`}
          </p>
        </div>
      )}

      {!draftQ.isLoading && !draftQ.isError && filteredPicks.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total picks</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold tabular-nums">{summary.total}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Keepers</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold tabular-nums text-amber-400">
                {summary.keeperCount}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Rounds</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold tabular-nums">{byRound.length}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Positions by round</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {summary.rounds.length === 0 ? (
                <p className="text-muted-foreground">—</p>
              ) : (
                summary.rounds.map((rd) => {
                  const posMap = summary.byRoundPos[rd] ?? {};
                  const parts = Object.entries(posMap).sort((a, b) => b[1] - a[1]);
                  return (
                    <div key={rd} className="flex flex-wrap items-baseline gap-2 border-b border-border/40 pb-2 last:border-0">
                      <span className="w-16 shrink-0 font-medium text-foreground">R{rd}</span>
                      <span className="text-muted-foreground">
                        {parts.map(([pos, n]) => `${pos}: ${n}`).join(" · ")}
                      </span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {viewMode === "round" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Draft board</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="sticky left-0 z-10 bg-muted/30 px-2 py-2 text-left font-medium text-muted-foreground">
                          Round
                        </th>
                        {Array.from({ length: maxSlots }, (_, i) => (
                          <th
                            key={i}
                            className="min-w-[7.5rem] border-l border-border/60 px-1 py-2 text-center font-medium text-muted-foreground"
                          >
                            Slot {i + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {byRound.map(([round, slots]) => (
                        <tr key={round} className="border-b border-border/50">
                          <td className="sticky left-0 z-10 bg-card px-2 py-1 font-semibold text-foreground">
                            {round}
                          </td>
                          {Array.from({ length: maxSlots }, (_, col) => {
                            const pick = slots[col];
                            if (!pick) {
                              return (
                                <td
                                  key={col}
                                  className="border-l border-border/40 bg-muted/5 align-top p-1"
                                />
                              );
                            }
                            return (
                              <td
                                key={`${pick.overallPick}-${col}`}
                                className={cn(
                                  "border-l border-border/40 align-top p-1.5",
                                  pick.isKeeper && "bg-amber-500/10 ring-1 ring-inset ring-amber-500/25"
                                )}
                              >
                                <div className="flex flex-col gap-0.5 rounded-md bg-background/80 p-1.5">
                                  <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                                    <span className="font-mono">#{pick.overallPick}</span>
                                    <span>
                                      R{pick.round}.{pick.roundPick}
                                    </span>
                                  </div>
                                  <div className="line-clamp-2 font-medium leading-tight text-foreground">
                                    {pick.playerName ?? "—"}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1">
                                    <PosBadge pos={pick.position} />
                                    {pick.isKeeper && (
                                      <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-300">
                                        K
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {(pick.nflTeam || "").trim() || "—"}
                                  </div>
                                  <div className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                                    {pick.teamName}
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {viewMode === "owner" && (
            <div className="space-y-4">
              {byOwnerGroups.map((group) => {
                const head = group[0];
                if (!head) return null;
                return (
                  <Card key={head.teamId}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{head.teamName}</CardTitle>
                      {(head.ownerName || "").trim() !== "" && (
                        <p className="text-xs text-muted-foreground">{head.ownerName}</p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {group.map((pick) => (
                        <div
                          key={pick.overallPick}
                          className={cn(
                            "flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-xs",
                            pick.isKeeper && "border-amber-500/30 bg-amber-500/5"
                          )}
                        >
                          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                            #{pick.overallPick}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            R{pick.round}.{pick.roundPick}
                          </span>
                          <span className="min-w-0 flex-1 font-medium text-foreground">
                            {pick.playerName ?? "—"}
                          </span>
                          <PosBadge pos={pick.position} />
                          <span className="text-[10px] text-muted-foreground">
                            {(pick.nflTeam || "").trim() || "—"}
                          </span>
                          {pick.isKeeper && (
                            <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-300">
                              K
                            </span>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {!draftQ.isLoading && !draftQ.isError && picks.length > 0 && filteredPicks.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          No picks for this team in {season}.
        </div>
      )}
    </div>
  );
}
