// FILE: client/src/pages/Transactions.tsx
// Live ESPN transaction log — fetches directly from ESPN using the signed-in user's stored credentials.

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Filter } from "lucide-react";

type TxRow = {
  transactionId?: string;
  type?: string;
  status?: string;
  proposedDate?: number;
  season?: number;
  teamId?: number;
  playerId?: number | null;
  playerName?: string | null;
  position?: string | null;
  fromTeamId?: number | null;
  toTeamId?: number | null;
  itemType?: string | null;
  overallPickNumber?: number | null;
  round?: number | null;
  pickInRound?: number | null;
  teamName?: string;
  ownerName?: string;
  fromTeamName?: string | null;
  toTeamName?: string | null;
};

type TxGroup = {
  key: string;
  rows: TxRow[];
  date: number;
  type: string;
  teamIds: number[];
};

const TYPE_OPTIONS = [
  { value: "ALL", label: "All Types" },
  { value: "TRADE", label: "Trades" },
  { value: "ADD", label: "Adds" },
  { value: "DROP", label: "Drops" },
  { value: "WAIVER", label: "Waivers" },
];

function normalizeType(row: TxRow): string {
  const type = String(row.type ?? "").toUpperCase();
  const itemType = String(row.itemType ?? "").toUpperCase();

  if (type.includes("TRADE")) return "TRADE";
  if (type.includes("WAIVER")) return "WAIVER";
  if (type.includes("FREE") || itemType === "ADD") return "ADD";
  if (itemType === "DROP" || type === "DROP") return "DROP";
  return type || "UNKNOWN";
}

function typeLabel(type: string): string {
  switch (type) {
    case "TRADE": return "Trade";
    case "WAIVER": return "Waiver";
    case "ADD": return "Add";
    case "DROP": return "Drop";
    default: return type;
  }
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case "TRADE": return "bg-blue-500/15 text-blue-300 border-blue-500/30";
    case "WAIVER": return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
    case "ADD": return "bg-green-500/15 text-green-300 border-green-500/30";
    case "DROP": return "bg-red-500/15 text-red-300 border-red-500/30";
    default: return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  }
}

function formatDate(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function playerLabel(row: TxRow): string {
  if (row.playerName) return row.position ? `${row.playerName} (${row.position})` : row.playerName;
  if (row.round) return `${row.season ?? ""} Round ${row.round} Pick ${row.pickInRound ?? "?"}`.trim();
  if (row.overallPickNumber) return `Pick ${row.overallPickNumber}`;
  return "Unknown player/pick";
}

function groupTransactions(rows: TxRow[]): TxGroup[] {
  const groups = new Map<string, TxRow[]>();

  for (const row of rows) {
    const key = `${row.transactionId ?? "unknown"}-${normalizeType(row)}-${row.proposedDate ?? 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries())
    .map(([key, groupRows]) => {
      const teamIds = Array.from(new Set(groupRows.flatMap(row => [row.teamId, row.fromTeamId, row.toTeamId].filter((id): id is number => typeof id === "number"))));
      return {
        key,
        rows: groupRows,
        date: groupRows[0]?.proposedDate ?? 0,
        type: normalizeType(groupRows[0] ?? {}),
        teamIds,
      };
    })
    .sort((a, b) => b.date - a.date);
}

function teamNames(group: TxGroup): string {
  const names = new Set<string>();
  for (const row of group.rows) {
    if (row.ownerName) names.add(row.ownerName);
    else if (row.teamName) names.add(row.teamName);
    if (row.fromTeamName) names.add(row.fromTeamName);
    if (row.toTeamName) names.add(row.toTeamName);
  }
  return Array.from(names).join(" / ") || "Unknown team";
}

function playersInvolved(group: TxGroup): string {
  const players = Array.from(new Set(group.rows.map(playerLabel)));
  return players.join(", ");
}

function details(group: TxGroup): string {
  const status = group.rows[0]?.status ? `Status: ${group.rows[0].status}` : "Status: unknown";
  const id = group.rows[0]?.transactionId ? `Transaction: ${group.rows[0].transactionId}` : "";
  return [status, id].filter(Boolean).join(" • ");
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full bg-slate-800/50 rounded-lg" />
      ))}
    </div>
  );
}

export default function Transactions() {
  const currentYear = new Date().getFullYear();
  const [season, setSeason] = useState(currentYear);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");

  const liveTransactionsQuery = trpc.espn.liveTransactions.useQuery(
    { season },
    { retry: false, staleTime: 0, refetchOnWindowFocus: false }
  );

  const rows = (liveTransactionsQuery.data ?? []) as TxRow[];
  const groups = useMemo(() => groupTransactions(rows), [rows]);

  const teamOptions = useMemo(() => {
    const teams = new Map<number, string>();
    for (const row of rows) {
      if (typeof row.teamId === "number") teams.set(row.teamId, row.ownerName || row.teamName || `Team ${row.teamId}`);
      if (typeof row.fromTeamId === "number") teams.set(row.fromTeamId, row.fromTeamName || `Team ${row.fromTeamId}`);
      if (typeof row.toTeamId === "number") teams.set(row.toTeamId, row.toTeamName || `Team ${row.toTeamId}`);
    }
    return Array.from(teams.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filteredGroups = groups.filter(group => {
    const matchesType = typeFilter === "ALL" || group.type === typeFilter;
    const matchesTeam = teamFilter === "ALL" || group.teamIds.includes(Number(teamFilter));
    return matchesType && matchesTeam;
  });

  const seasons = Array.from({ length: 4 }, (_, i) => currentYear - i);

  return (
    <AppLayout title="Transactions" subtitle="Live ESPN transaction feed — fetched directly with your connected ESPN account">
      <div className="flex flex-wrap gap-3 mb-5">
        <Select value={String(season)} onValueChange={value => setSeason(Number(value))}>
          <SelectTrigger className="w-32 bg-slate-900 border-slate-700 text-slate-200">
            <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            {seasons.map(option => (
              <SelectItem key={option} value={String(option)} className="text-slate-200">{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 bg-slate-900 border-slate-700 text-slate-200">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            {TYPE_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value} className="text-slate-200">{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-56 bg-slate-900 border-slate-700 text-slate-200">
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="ALL" className="text-slate-200">All Teams</SelectItem>
            {teamOptions.map(([teamId, label]) => (
              <SelectItem key={teamId} value={String(teamId)} className="text-slate-200">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {liveTransactionsQuery.isLoading ? (
        <LoadingRows />
      ) : liveTransactionsQuery.isError ? (
        <Card className="bg-slate-900/60 border-red-800/40">
          <CardContent className="py-8 text-center">
            <p className="text-red-400 text-sm">Failed to load live ESPN transactions.</p>
            <p className="text-slate-500 text-xs mt-2">{liveTransactionsQuery.error.message}</p>
          </CardContent>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardContent className="py-12 text-center">
            <p className="text-slate-400">No live ESPN transactions found for {season}.</p>
            <p className="text-slate-600 text-sm mt-1">Try a different season, type, or team filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Team</th>
                <th className="px-4 py-3 text-left font-medium">Players Involved</th>
                <th className="px-4 py-3 text-left font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredGroups.map(group => (
                <tr key={group.key} className="text-slate-200 hover:bg-slate-900/40">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-400">{formatDate(group.date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge variant="outline" className={typeBadgeClass(group.type)}>{typeLabel(group.type)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{teamNames(group)}</td>
                  <td className="px-4 py-3">{playersInvolved(group)}</td>
                  <td className="px-4 py-3 text-slate-400">{details(group)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
