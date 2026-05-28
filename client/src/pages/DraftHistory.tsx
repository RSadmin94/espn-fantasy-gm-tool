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
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Wrench, XCircle } from "lucide-react";

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
  const [showVerify, setShowVerify] = useState(false);
  const [verifyEnabled, setVerifyEnabled] = useState(false);

  /** Always query by selected season — `draft_picks` may exist even if `cachedSeasons` omits the year. */
  const draftQ = trpc.espn.draftHistory.useQuery({ season }, { staleTime: 0 });
  const diagQ  = trpc.espn.draftDiagnostics.useQuery({ season }, { staleTime: 0 });
  const verifyQ = trpc.espn.verifyDraftHistory.useQuery({ season }, { enabled: verifyEnabled, staleTime: 0 });
  const repairMut = trpc.espn.repairDraftHistory.useMutation();

  const rawPicks = (draftQ.data?.picks as DraftPickRow[] | undefined) ?? [];
  const draftSource              = draftQ.data?.dataSource as string | undefined;
  const rawCount                 = draftQ.data?.rawCount   ?? null;
  const dedupedCount             = draftQ.data?.dedupedCount ?? null;
  const dedupedSlotCount         = (draftQ.data as { dedupedSlotCount?: number } | undefined)?.dedupedSlotCount ?? null;
  const duplicateOverallRemoved  = (draftQ.data as { duplicateOverallRemoved?: number } | undefined)?.duplicateOverallRemoved ?? 0;
  const duplicateSlotRemoved     = (draftQ.data as { duplicateSlotRemoved?: number } | undefined)?.duplicateSlotRemoved ?? 0;
  const serverTeamCount          = (draftQ.data as { teamCount?: number } | undefined)?.teamCount ?? 0;
  const serverValidCount         = (draftQ.data as { validCount?: number } | undefined)?.validCount ?? null;
  const serverInvalidCount       = (draftQ.data as { invalidCount?: number } | undefined)?.invalidCount ?? null;
  const missingPlayerNameCount   = (draftQ.data as { missingPlayerNameCount?: number } | undefined)?.missingPlayerNameCount ?? 0;
  const unresolvedTeamMapCount   = (draftQ.data as { unresolvedTeamMappingCount?: number } | undefined)?.unresolvedTeamMappingCount ?? 0;
  const unresolvedTeamMappings   = (draftQ.data as { unresolvedTeamMappings?: Array<{ season?: number; teamId: number; overallPick: number; round: number; roundPick: number }> } | undefined)?.unresolvedTeamMappings ?? [];

  // Server returns the canonical cleaned pick set (dedup + validity + team resolution).
  const picks = rawPicks;

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
      // Server guarantees round >= 1 for all returned picks — no fallback needed
      if (p.round <= 0) continue;
      const arr = m.get(p.round) ?? [];
      arr.push(p);
      m.set(p.round, arr);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => a.roundPick - b.roundPick || a.overallPick - b.overallPick);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [filteredPicks]);

  // boardCols: canonical team count from server only — never derive from max observed roundPick
  const boardCols = serverTeamCount > 0 ? serverTeamCount : 14;

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
      if (p.round <= 0) continue; // skip invalid rounds (server should have filtered, safety guard)
      const pos = (p.position || "?").toUpperCase();
      if (!byRoundPos[p.round]) byRoundPos[p.round] = {};
      byRoundPos[p.round][pos] = (byRoundPos[p.round][pos] ?? 0) + 1;
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

      {/* ── Diagnostics panel ── */}
      <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-2 font-mono text-xs text-muted-foreground space-y-0.5">
        <div>
          <span className="text-foreground/60 font-semibold">draft-diag</span>
          {" · "}season: <span className="text-foreground">{season}</span>
          {" · "}teamCount: <span className={cn(serverTeamCount > 0 ? "text-emerald-400" : "text-amber-400")}>{serverTeamCount > 0 ? serverTeamCount : "unknown"}</span>
          {" · "}boardCols: <span className="text-foreground">{boardCols}</span>
          {" · "}dbRows: <span className="text-foreground">{diagQ.data?.totalRows ?? "…"}</span>
          {" · "}rawPicks: <span className="text-foreground">{rawCount ?? "…"}</span>
          {" · "}afterOverallDedup: <span className="text-foreground">{dedupedCount ?? "…"}</span>
          {" · "}afterSlotDedup: <span className="text-foreground">{dedupedSlotCount ?? "…"}</span>
          {" · "}cleanShown: <span className="text-emerald-400">{serverValidCount ?? picks.length}</span>
          {" · "}invalidHidden: <span className={cn(
            (serverInvalidCount ?? 0) > 0 ? "text-red-400 font-bold" : "text-foreground"
          )}>{serverInvalidCount ?? "…"}</span>
          {" · "}dupOverallRemoved: <span className="text-foreground">{duplicateOverallRemoved}</span>
          {" · "}dupSlotRemoved: <span className="text-foreground">{duplicateSlotRemoved}</span>
          {missingPlayerNameCount > 0 && (
            <>
              {" · "}missingPlayerName: <span className="text-amber-400">{missingPlayerNameCount}</span>
            </>
          )}
        </div>
        <div>
          {" · "}dbDupOverallSlots: <span className={cn(
            (diagQ.data?.duplicateOverallPickSlots?.length ?? 0) > 0 ? "text-red-400 font-bold" : "text-foreground"
          )}>{diagQ.data?.duplicateOverallPickSlots?.length ?? "…"}</span>
          {" · "}unresolvedTeamMappings: <span className={cn(
            unresolvedTeamMapCount > 0 ? "text-amber-400 font-bold" : "text-foreground"
          )}>{unresolvedTeamMapCount}</span>
        </div>
        {unresolvedTeamMappings.length > 0 && (
          <div className="text-amber-400">
            {unresolvedTeamMappings.slice(0, 10).map((m) =>
              `Unresolved team owner mapping: season ${m.season ?? season} teamId ${m.teamId} (pick #${m.overallPick}, R${m.round}.${m.roundPick})`
            ).join(" · ")}
          </div>
        )}
      </div>

      {/* ── ESPN Verification panel ── */}
      <div className="rounded-lg border border-border/60 bg-card/50">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Verify Against ESPN</span>
          <span className="text-xs text-muted-foreground">Compare DB rows for {season} with live ESPN draft recap data</span>
          <div className="ml-auto flex items-center gap-2">
            {verifyEnabled && verifyQ.isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <button
              onClick={() => {
                if (!showVerify) {
                  setVerifyEnabled(true);
                  setShowVerify(true);
                } else {
                  setShowVerify(false);
                  setVerifyEnabled(false);
                }
              }}
              className="rounded border border-border/70 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
            >
              {showVerify ? "Hide" : "Verify Against ESPN"}
            </button>
          </div>
        </div>

        {showVerify && (
          <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-4">
            {verifyQ.isError && (
              <div className="flex items-center gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                <XCircle className="h-4 w-4 shrink-0" />
                {verifyQ.error.message}
              </div>
            )}

            {verifyQ.data && (() => {
              const v = verifyQ.data;
              const statusColors = {
                verified: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
                mismatch: "text-red-400 border-red-500/30 bg-red-500/10",
                missing_espn_data: "text-amber-400 border-amber-500/30 bg-amber-500/10",
                missing_db_data: "text-orange-400 border-orange-500/30 bg-orange-500/10",
              };
              const statusColor = statusColors[v.status] ?? statusColors.mismatch;
              const canRepair = v.status === "mismatch" || v.status === "missing_db_data";

              return (
                <div className="space-y-3">
                  {/* Summary row */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={cn("rounded border px-2 py-0.5 text-xs font-semibold", statusColor)}>
                      {v.status === "verified" && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                      {v.status === "mismatch" && <XCircle className="mr-1 inline h-3 w-3" />}
                      {v.status.replace("_", " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      DB: <span className="text-foreground font-mono">{v.dbCount}</span>
                      {" · "}ESPN: <span className="text-foreground font-mono">{v.scrapedCount}</span>
                      {" · "}Matched: <span className="text-emerald-400 font-mono">{v.matchedCount}</span>
                      {v.missingPicks.length > 0 && <>{" · "}Missing: <span className="text-amber-400 font-mono">{v.missingPicks.length}</span></>}
                      {v.mismatchedPlayers.length > 0 && <>{" · "}Wrong player: <span className="text-red-400 font-mono">{v.mismatchedPlayers.length}</span></>}
                      {v.mismatchedOwners.length > 0 && <>{" · "}Wrong owner: <span className="text-orange-400 font-mono">{v.mismatchedOwners.length}</span></>}
                      {v.extraRows.length > 0 && <>{" · "}Extra DB: <span className="text-muted-foreground font-mono">{v.extraRows.length}</span></>}
                      {v.duplicatePicks.length > 0 && <>{" · "}Dup slots: <span className="text-red-400 font-mono">{v.duplicatePicks.length}</span></>}
                    </span>
                    {canRepair && (
                      <button
                        onClick={async () => {
                          await repairMut.mutateAsync({ season });
                          void verifyQ.refetch();
                          void draftQ.refetch();
                          void diagQ.refetch();
                        }}
                        disabled={repairMut.isPending}
                        className="ml-auto flex items-center gap-1.5 rounded border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
                      >
                        {repairMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                        Repair From ESPN
                      </button>
                    )}
                  </div>

                  {repairMut.data && (
                    <div className="rounded border border-emerald-500/25 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-300">
                      Repair complete — deleted {repairMut.data.deleted}, inserted {repairMut.data.inserted} ({repairMut.data.uniquePicks} unique slots, {repairMut.data.skippedDuplicates} skipped)
                    </div>
                  )}
                  {repairMut.error && (
                    <div className="rounded border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                      Repair failed: {repairMut.error.message}
                    </div>
                  )}

                  {/* Missing picks (in ESPN, not in DB) */}
                  {v.missingPicks.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-amber-400">Missing from DB ({v.missingPicks.length})</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                          <thead><tr className="border-b border-border/30 text-left text-muted-foreground">
                            <th className="py-0.5 pr-3">Pick</th><th className="py-0.5 pr-3">R.Slot</th><th className="py-0.5 pr-3">Pos</th><th className="py-0.5">Player</th>
                          </tr></thead>
                          <tbody>
                            {v.missingPicks.map((p) => (
                              <tr key={p.overallPick} className="border-b border-border/15 text-amber-300/80">
                                <td className="py-0.5 pr-3">#{p.overallPick}</td>
                                <td className="py-0.5 pr-3">R{p.round}.{p.roundPick}</td>
                                <td className="py-0.5 pr-3">{p.position ?? "?"}</td>
                                <td className="py-0.5">{p.playerName ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Mismatched players (same slot, different player) */}
                  {v.mismatchedPlayers.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-red-400">Wrong player ({v.mismatchedPlayers.length})</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                          <thead><tr className="border-b border-border/30 text-left text-muted-foreground">
                            <th className="py-0.5 pr-3">Pick</th><th className="py-0.5 pr-3">DB</th><th className="py-0.5">ESPN</th>
                          </tr></thead>
                          <tbody>
                            {v.mismatchedPlayers.map((m) => (
                              <tr key={m.overallPick} className="border-b border-border/15">
                                <td className="py-0.5 pr-3 text-muted-foreground">#{m.overallPick}</td>
                                <td className="py-0.5 pr-3 text-red-400">{m.dbPlayerName ?? "—"}</td>
                                <td className="py-0.5 text-emerald-400">{m.espnPlayerName ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Mismatched owners */}
                  {v.mismatchedOwners.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-orange-400">Wrong owner ({v.mismatchedOwners.length})</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                          <thead><tr className="border-b border-border/30 text-left text-muted-foreground">
                            <th className="py-0.5 pr-3">Pick</th><th className="py-0.5 pr-3">DB teamId</th><th className="py-0.5 pr-3">ESPN teamId</th><th className="py-0.5">Player</th>
                          </tr></thead>
                          <tbody>
                            {v.mismatchedOwners.map((m) => (
                              <tr key={m.overallPick} className="border-b border-border/15">
                                <td className="py-0.5 pr-3 text-muted-foreground">#{m.overallPick}</td>
                                <td className="py-0.5 pr-3 text-orange-400">{m.dbTeamId}</td>
                                <td className="py-0.5 pr-3 text-emerald-400">{m.espnTeamId}</td>
                                <td className="py-0.5 text-foreground/80">{m.playerName ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Extra DB rows */}
                  {v.extraRows.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">Extra in DB only ({v.extraRows.length})</div>
                      <div className="flex flex-wrap gap-1">
                        {v.extraRows.map((r) => (
                          <span key={r.overallPick} className="rounded border border-border/30 bg-muted/20 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            #{r.overallPick} {r.playerName ?? "—"}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {v.status === "verified" && v.missingPicks.length === 0 && v.mismatchedPlayers.length === 0 && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> All {v.matchedCount} picks match ESPN data exactly.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

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
                <CardTitle className="text-base">
                  Draft board
                  {serverTeamCount > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {serverTeamCount} teams · {boardCols} slots per round
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="sticky left-0 z-10 bg-muted/30 px-2 py-2 text-left font-medium text-muted-foreground">
                          Round
                        </th>
                        {Array.from({ length: boardCols }, (_, i) => (
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
                      {byRound.map(([round, slots]) => {
                        // Build roundPick → pick lookup so board is slot-correct (not array-index)
                        const byRoundPick = new Map(slots.map((p) => [p.roundPick, p]));
                        return (
                          <tr key={round} className="border-b border-border/50">
                            <td className="sticky left-0 z-10 bg-card px-2 py-1 font-semibold text-foreground">
                              {round}
                            </td>
                            {Array.from({ length: boardCols }, (_, col) => {
                              const pick = byRoundPick.get(col + 1);
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
                        );
                      })}
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
