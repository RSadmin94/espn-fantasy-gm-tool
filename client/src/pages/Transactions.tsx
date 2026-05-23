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
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  RefreshCw,
  Repeat2,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TxnRow {
  type: string;
  transactionId?: string;
  relatedTransactionId?: string;
  playerId?: number;
  playerName?: string;
  position?: string;
  teamId?: number;
  fromTeamId?: number;
  proposedDate?: number;
  status?: string;
}

interface TeamRow {
  teamId: number;
  teamName: string;
  owners?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TX_TYPES = [
  { value: "ALL", label: "All types" },
  { value: "ADD", label: "Add" },
  { value: "DROP", label: "Drop" },
  { value: "WAIVER", label: "Waiver" },
  { value: "TRADE_PROPOSAL", label: "Trade" },
  { value: "TRADE_UPHOLD", label: "Trade Accepted" },
  { value: "TRADE_ACCEPT", label: "Trade Accepted (alt)" },
];

const TX_TYPE_LABELS: Record<string, string> = {
  ADD: "Add",
  DROP: "Drop",
  WAIVER: "Waiver",
  TRADE_PROPOSAL: "Trade",
  TRADE_UPHOLD: "Trade ✓",
  TRADE_ACCEPT: "Trade ✓",
};

// ── Row styling ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const base = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium";
  if (type === "ADD")
    return <span className={cn(base, "border-emerald-500/20 bg-emerald-500/10 text-emerald-400")}><ArrowDownToLine className="h-3 w-3" />Add</span>;
  if (type === "DROP")
    return <span className={cn(base, "border-red-500/20 bg-red-500/10 text-red-400")}><ArrowUpFromLine className="h-3 w-3" />Drop</span>;
  if (type === "WAIVER")
    return <span className={cn(base, "border-blue-500/20 bg-blue-500/10 text-blue-400")}><Search className="h-3 w-3" />Waiver</span>;
  if (type.startsWith("TRADE"))
    return <span className={cn(base, "border-orange-500/20 bg-orange-500/10 text-orange-400")}><Repeat2 className="h-3 w-3" />{TX_TYPE_LABELS[type] ?? "Trade"}</span>;
  return <span className={cn(base, "border-border bg-muted/30 text-muted-foreground")}>{type}</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Transactions() {
  const allSeasonsQ = trpc.espn.allSeasons.useQuery();
  const cachedQ = trpc.espn.cachedSeasons.useQuery();

  const allSeasons: number[] = allSeasonsQ.data ?? [];
  const cachedSeasons: number[] = cachedQ.data ?? [];

  // Default to latest cached season
  const defaultSeason = cachedSeasons.length > 0
    ? Math.max(...cachedSeasons)
    : allSeasons.length > 0
      ? allSeasons[allSeasons.length - 1]
      : 2025;

  const [season, setSeason] = useState<number>(defaultSeason);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Transactions query — season must be in cachedSeasons to return real data
  const txQ = trpc.espn.transactions.useQuery(
    { season },
    { enabled: cachedSeasons.includes(season) }
  );
  const teamsQ = trpc.espn.teams.useQuery(
    { season },
    { enabled: cachedSeasons.includes(season) }
  );

  const teams = (teamsQ.data as TeamRow[] | undefined) ?? [];
  const rawTxns = (txQ.data as TxnRow[] | undefined) ?? [];

  // Build a teamId → name map
  const teamMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of teams) m.set(t.teamId, t.teamName || t.owners || `Team ${t.teamId}`);
    return m;
  }, [teams]);

  // Filtered and sorted transactions
  const filtered = useMemo(() => {
    let rows = rawTxns;

    // Type filter
    if (typeFilter !== "ALL") {
      rows = rows.filter(r => r.type === typeFilter);
    }

    // Team filter — matches teamId OR fromTeamId
    if (teamFilter !== "ALL") {
      const tid = Number(teamFilter);
      rows = rows.filter(r => r.teamId === tid || r.fromTeamId === tid);
    }

    // Search by player name
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r => r.playerName?.toLowerCase().includes(q));
    }

    // Sort newest first
    return [...rows].sort((a, b) => (b.proposedDate ?? 0) - (a.proposedDate ?? 0));
  }, [rawTxns, typeFilter, teamFilter, search]);

  const isNotCached = !cachedSeasons.includes(season);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
          <p className="mt-1 text-muted-foreground">
            Adds, drops, waivers, and trades by season.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={txQ.isFetching || isNotCached}
          onClick={() => void txQ.refetch()}
        >
          {txQ.isFetching
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap gap-3 py-4">
          {/* Season */}
          <div className="w-28">
            <Select
              value={String(season)}
              onValueChange={v => {
                setSeason(Number(v));
                setTypeFilter("ALL");
                setTeamFilter("ALL");
                setSearch("");
              }}
            >
              <SelectTrigger className="h-9 text-sm">
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
          </div>

          {/* Type filter */}
          <div className="w-44">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TX_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Team filter */}
          <div className="w-48">
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All teams</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t.teamId} value={String(t.teamId)}>
                    {t.teamName || t.owners || `Team ${t.teamId}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Player search */}
          <div className="relative flex-1 min-w-36">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="h-9 pl-8 text-sm"
              placeholder="Search player…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Result count */}
          {!isNotCached && !txQ.isLoading && (
            <div className="flex items-center text-xs text-muted-foreground self-center ml-auto">
              {filtered.length} of {rawTxns.length} rows
            </div>
          )}
        </CardContent>
      </Card>

      {/* Not-cached notice */}
      {isNotCached && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Season {season} has not been synced yet. Go to{" "}
          <a href="/sync" className="underline underline-offset-2">Sync Data</a>{" "}
          to fetch it.
        </div>
      )}

      {/* Loading */}
      {txQ.isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading transactions…
        </div>
      )}

      {/* Error */}
      {txQ.isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {txQ.error.message}
        </div>
      )}

      {/* Empty state */}
      {!txQ.isLoading && !txQ.isError && !isNotCached && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          {rawTxns.length === 0
            ? "No transactions found for this season."
            : "No transactions match the current filters."}
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {season} Transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Date
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Type
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Player
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Pos
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Team
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hidden md:table-cell">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx, idx) => {
                    const date = tx.proposedDate
                      ? new Date(tx.proposedDate).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "—";
                    const team = tx.teamId ? teamMap.get(tx.teamId) ?? `Team ${tx.teamId}` : "—";
                    const fromTeam = tx.fromTeamId && tx.fromTeamId !== tx.teamId
                      ? teamMap.get(tx.fromTeamId) ?? `Team ${tx.fromTeamId}`
                      : null;
                    return (
                      <tr
                        key={`${tx.transactionId}-${tx.playerId}-${idx}`}
                        className="border-b border-border/50 hover:bg-accent/20 transition-colors last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {date}
                        </td>
                        <td className="px-4 py-3">
                          <TypeBadge type={tx.type} />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {tx.playerName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {tx.position ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground">
                          {team}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                          {fromTeam ? `from ${fromTeam}` : tx.status ?? "—"}
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
