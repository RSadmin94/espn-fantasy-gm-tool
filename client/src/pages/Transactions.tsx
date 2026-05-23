// FILE: client/src/pages/Transactions.tsx
// Transaction log — shows all ESPN transactions across seasons with
// filtering by type (trades, waivers, drops, adds), team, and season.

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  ArrowLeftRight, UserPlus, UserMinus, RefreshCw,
  TrendingUp, Search, Filter, Calendar,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type TxRow = {
  transactionId: string;
  type: string;
  status: string;
  proposedDate: number;
  season: number;
  teamId: number;
  playerId: number;
  playerName: string;
  position: string;
  fromTeamId: number | null;
  toTeamId: number | null;
  itemType: string;
  overallPickNumber: number | null;
  round: number | null;
  pickInRound: number | null;
};

// ── Transaction type metadata ─────────────────────────────────────────────────
const TX_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  TRADE:          { label: "Trade",    icon: <ArrowLeftRight className="w-3 h-3" />, color: "text-blue-300",   bg: "bg-blue-500/15 border-blue-500/30"   },
  TRADE_PROPOSAL: { label: "Trade",    icon: <ArrowLeftRight className="w-3 h-3" />, color: "text-blue-300",   bg: "bg-blue-500/15 border-blue-500/30"   },
  WAIVER:         { label: "Waiver",   icon: <RefreshCw className="w-3 h-3" />,      color: "text-yellow-300", bg: "bg-yellow-500/15 border-yellow-500/30" },
  FREEAGENT:      { label: "Add",      icon: <UserPlus className="w-3 h-3" />,       color: "text-green-300",  bg: "bg-green-500/15 border-green-500/30"  },
  DROP:           { label: "Drop",     icon: <UserMinus className="w-3 h-3" />,      color: "text-red-300",    bg: "bg-red-500/15 border-red-500/30"      },
};

const POS_COLOR: Record<string, string> = {
  QB: "bg-red-900/50 text-red-300",
  RB: "bg-green-900/50 text-green-300",
  WR: "bg-blue-900/50 text-blue-300",
  TE: "bg-orange-900/50 text-orange-300",
  K:  "bg-purple-900/50 text-purple-300",
  DST:"bg-pink-900/50 text-pink-300",
};

function posTag(pos: string) {
  return `inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${POS_COLOR[pos] ?? "bg-slate-700 text-slate-300"}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function groupByTransaction(rows: TxRow[]) {
  const groups = new Map<string, TxRow[]>();
  for (const row of rows) {
    const key = `${row.transactionId}-${row.type}-${row.season}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return Array.from(groups.values()).sort((a, b) => (b[0].proposedDate ?? 0) - (a[0].proposedDate ?? 0));
}

// ── Transaction Card ──────────────────────────────────────────────────────────
function TxCard({ rows, ownerMap }: { rows: TxRow[]; ownerMap: Record<number, string> }) {
  const first = rows[0];
  const meta = TX_META[first.type] ?? TX_META.FREEAGENT;
  const isTrade = first.type === "TRADE" || first.type === "TRADE_PROPOSAL";

  if (isTrade) {
    // Group by teamId for trade display
    const sides = new Map<number, TxRow[]>();
    for (const r of rows) {
      const team = r.toTeamId ?? r.teamId;
      if (!sides.has(team)) sides.set(team, []);
      sides.get(team)!.push(r);
    }
    const sideArr = Array.from(sides.entries());

    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.bg} ${meta.color}`}>
                {meta.icon} {meta.label}
              </span>
              <span className="text-slate-500 text-xs">{formatDate(first.proposedDate)}</span>
            </div>
            <span className="text-slate-600 text-xs">S{first.season}</span>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className={`grid gap-3 ${sideArr.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {sideArr.map(([teamId, teamRows]) => (
              <div key={teamId} className="bg-slate-800/50 rounded-lg p-2.5">
                <div className="text-xs font-semibold text-slate-400 mb-2">
                  {ownerMap[teamId] ?? `Team ${teamId}`} receives
                </div>
                <div className="space-y-1">
                  {teamRows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={posTag(r.position)}>{r.position}</span>
                      <span className="text-slate-200 text-sm truncate">
                        {r.playerName || (r.round ? `${r.season} R${r.round} P${r.pickInRound}` : "Unknown")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Waiver / Add / Drop
  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardContent className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${meta.bg} ${meta.color}`}>
              {meta.icon} {meta.label}
            </span>
            <span className={posTag(first.position)}>{first.position}</span>
            <span className="text-slate-200 text-sm truncate font-medium">{first.playerName}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-slate-400 text-xs">{ownerMap[first.teamId] ?? `Team ${first.teamId}`}</span>
            <span className="text-slate-600 text-xs">{formatDate(first.proposedDate)}</span>
            <span className="text-slate-600 text-xs">S{first.season}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function TxSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full bg-slate-800/50 rounded-lg" />
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Transactions() {
  const currentYear = new Date().getFullYear();
  const [season, setSeason] = useState(currentYear);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const txQuery = trpc.espn.transactions.useQuery(
    { season },
    { retry: false, staleTime: 5 * 60_000 }
  );

  const standingsQuery = trpc.espn.standings.useQuery(
    { season },
    { retry: false, staleTime: 10 * 60_000 }
  );

  // Build owner name map from standings
  const ownerMap: Record<number, string> = {};
  for (const team of standingsQuery.data ?? []) {
    ownerMap[(team as Record<string, unknown>).teamId as number] =
      (team as Record<string, unknown>).ownerName as string ?? `Team ${(team as Record<string, unknown>).teamId}`;
  }

  const allTx = (txQuery.data ?? []) as TxRow[];

  // Filter
  const filtered = allTx.filter(r => {
    const matchType = typeFilter === "ALL" || r.type === typeFilter ||
      (typeFilter === "TRADE" && (r.type === "TRADE" || r.type === "TRADE_PROPOSAL"));
    const matchSearch = !search ||
      r.playerName?.toLowerCase().includes(search.toLowerCase()) ||
      ownerMap[r.teamId]?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const groups = groupByTransaction(filtered);

  // Stats
  const tradeCount   = groups.filter(g => g[0].type === "TRADE" || g[0].type === "TRADE_PROPOSAL").length;
  const waiverCount  = groups.filter(g => g[0].type === "WAIVER").length;
  const addDropCount = groups.filter(g => g[0].type === "FREEAGENT" || g[0].type === "DROP").length;

  const seasons = Array.from({ length: 9 }, (_, i) => currentYear - i);

  return (
    <AppLayout title="Transactions" subtitle="Every move across all seasons — trades, waivers, adds and drops">

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5">
        <Select value={String(season)} onValueChange={v => setSeason(Number(v))}>
          <SelectTrigger className="w-32 bg-slate-900 border-slate-700 text-slate-200">
            <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            {seasons.map(s => (
              <SelectItem key={s} value={String(s)} className="text-slate-200">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 bg-slate-900 border-slate-700 text-slate-200">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="ALL" className="text-slate-200">All Types</SelectItem>
            <SelectItem value="TRADE" className="text-slate-200">Trades</SelectItem>
            <SelectItem value="WAIVER" className="text-slate-200">Waivers</SelectItem>
            <SelectItem value="FREEAGENT" className="text-slate-200">Free Agents</SelectItem>
            <SelectItem value="DROP" className="text-slate-200">Drops</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input
            placeholder="Search player or owner..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Trades",    value: tradeCount,   icon: <ArrowLeftRight className="w-4 h-4" />, color: "text-blue-400"   },
          { label: "Waivers",   value: waiverCount,  icon: <RefreshCw className="w-4 h-4" />,      color: "text-yellow-400" },
          { label: "Adds/Drops",value: addDropCount, icon: <TrendingUp className="w-4 h-4" />,     color: "text-green-400"  },
        ].map(s => (
          <Card key={s.label} className="bg-slate-900/60 border-slate-700/50">
            <CardContent className="flex items-center gap-3 p-4">
              <span className={s.color}>{s.icon}</span>
              <div>
                <div className="text-2xl font-bold text-slate-100">{s.value}</div>
                <div className="text-xs text-slate-400">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transaction list */}
      {txQuery.isLoading ? (
        <TxSkeleton />
      ) : txQuery.isError ? (
        <Card className="bg-slate-900/60 border-red-800/40">
          <CardContent className="py-8 text-center">
            <p className="text-red-400 text-sm">Failed to load transactions. Trigger a data refresh first.</p>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardContent className="py-12 text-center">
            <p className="text-slate-400">No transactions found for {season}.</p>
            <p className="text-slate-600 text-sm mt-1">Try refreshing ESPN data from the Data Center.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((rows, i) => (
            <TxCard key={i} rows={rows} ownerMap={ownerMap} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}
