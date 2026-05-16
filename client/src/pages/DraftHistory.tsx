import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Trophy, Star, Search, Filter, Calendar } from "lucide-react";

const SEASONS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009];

const POS_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  WR: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  TE: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  K: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "D/ST": "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

type DraftPick = {
  season: number;
  roundId: number;
  roundPickNumber: number;
  overallPickNumber: number;
  teamId: number;
  teamName: string;
  playerId: number;
  playerName: string;
  position: string;
  proTeam: string;
  keeper: boolean;
  reservedForKeeper: boolean;
  autoDrafted: boolean;
};

type DraftOrderEntry = {
  position: number;
  teamId: number;
  name?: string;
  abbrev?: string;
  owners?: string;
};

type DraftOrderData = {
  pickOrder?: DraftOrderEntry[];
  draftDate?: number;
  keeperDeadline?: number;
  draftType?: string;
  keeperCount?: number;
};

export default function DraftHistory() {
  const [season, setSeason] = useState(2025);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [roundFilter, setRoundFilter] = useState<string>("all");

  const { data: picks = [], isLoading } = trpc.espn.draftPicks.useQuery({ season });
  const { data: draftOrderRaw } = trpc.espn.draftOrder.useQuery({ season });
  const draftOrder = draftOrderRaw as DraftOrderData | null;

  const typedPicks = picks as DraftPick[];

  // Unique teams
  const teams = useMemo(() => {
    const map = new Map<number, string>();
    typedPicks.forEach((p) => { if (p.teamId && p.teamName) map.set(p.teamId, p.teamName); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [typedPicks]);

  // Unique rounds
  const rounds = useMemo(() => {
    const set = new Set(typedPicks.map((p) => p.roundId));
    return Array.from(set).sort((a, b) => a - b);
  }, [typedPicks]);

  // Filtered picks
  const filteredPicks = useMemo(() => {
    return typedPicks.filter((p) => {
      if (roundFilter !== "all" && p.roundId !== parseInt(roundFilter)) return false;
      if (teamFilter !== "all" && p.teamId !== parseInt(teamFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.playerName?.toLowerCase().includes(q) && !p.teamName?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [typedPicks, roundFilter, teamFilter, search]);

  const keeperCount = typedPicks.filter((p) => p.keeper).length;

  return (
    <AppLayout title="Draft History" subtitle="Pick-by-pick draft recaps · 2009–2026">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* Header Row */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Draft History</h1>
            <p className="text-slate-400 text-sm mt-1">Complete pick-by-pick records for every available season</p>
          </div>
          <Select value={String(season)} onValueChange={(v) => { setSeason(parseInt(v)); setRoundFilter("all"); setTeamFilter("all"); setSearch(""); }}>
            <SelectTrigger className="w-36 bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {SEASONS.map((s) => (
                <SelectItem key={s} value={String(s)} className="text-white hover:bg-slate-700">{s} Season</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Stats */}
        {!isLoading && typedPicks.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Picks", value: typedPicks.length, icon: "📋" },
              { label: "Keepers", value: keeperCount, icon: "🔒" },
              { label: "Rounds", value: rounds.length, icon: "🔄" },
              { label: "Auto-Drafted", value: typedPicks.filter((p) => p.autoDrafted).length, icon: "🤖" },
            ].map((stat) => (
              <Card key={stat.label} className="bg-slate-800/60 border-slate-700">
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="text-2xl">{stat.icon}</span>
                  <div>
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                    <p className="text-xs text-slate-400">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Draft Order Card */}
        {draftOrder?.pickOrder && draftOrder.pickOrder.length > 0 && (
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                {season} Draft Order
                {draftOrder.draftDate && (
                  <span className="text-slate-400 font-normal ml-2 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(draftOrder.draftDate).toLocaleDateString("en-US", {
                      weekday: "long", month: "long", day: "numeric", year: "numeric",
                    })}
                  </span>
                )}
                {draftOrder.keeperDeadline && (
                  <span className="text-amber-400 font-normal ml-2 text-xs">
                    · Keeper Deadline: {new Date(draftOrder.keeperDeadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {draftOrder.pickOrder.map((entry) => (
                  <div key={entry.position} className="flex items-center gap-1.5 bg-slate-700/50 rounded-lg px-3 py-1.5 border border-slate-600/40">
                    <span className="text-slate-400 text-xs font-mono w-5 text-right">{entry.position}.</span>
                    <span className="text-white text-xs font-medium">{entry.name || `Team ${entry.teamId}`}</span>
                    {entry.owners && <span className="text-slate-500 text-xs hidden md:inline">({entry.owners})</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search player or team..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
            />
          </div>
          <Select value={roundFilter} onValueChange={setRoundFilter}>
            <SelectTrigger className="w-36 bg-slate-800 border-slate-700 text-white">
              <Filter className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="All Rounds" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all" className="text-white hover:bg-slate-700">All Rounds</SelectItem>
              {rounds.map((r) => (
                <SelectItem key={r} value={String(r)} className="text-white hover:bg-slate-700">Round {r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-52 bg-slate-800 border-slate-700 text-white">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all" className="text-white hover:bg-slate-700">All Teams</SelectItem>
              {teams.map(([tid, tname]) => (
                <SelectItem key={tid} value={String(tid)} className="text-white hover:bg-slate-700">{tname}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Picks Table */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <span className="ml-3 text-slate-400">Loading draft data...</span>
          </div>
        ) : typedPicks.length === 0 ? (
          <Card className="bg-slate-800/60 border-slate-700">
            <CardContent className="p-12 text-center">
              <p className="text-slate-400 text-lg">No draft data available for {season}.</p>
              <p className="text-slate-500 text-sm mt-2">Navigate to Data Refresh to pull this season's data from ESPN.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-slate-800/60 border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <span className="text-slate-300 text-sm font-medium">
                {filteredPicks.length} picks {filteredPicks.length !== typedPicks.length && `(filtered from ${typedPicks.length})`}
              </span>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400" /> = Keeper</span>
                <span className="flex items-center gap-1"><span className="text-slate-500">🤖</span> = Auto-drafted</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-900/40">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wider w-16">Pick</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wider w-20">Round</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wider">Player</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wider w-16">Pos</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wider w-16">NFL</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wider">Team</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wider w-28">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPicks.map((pick, idx) => (
                    <tr
                      key={`${pick.overallPickNumber}-${idx}`}
                      className={`border-b border-slate-700/40 transition-colors hover:bg-slate-700/25 ${pick.keeper ? "bg-yellow-500/5 border-l-2 border-l-yellow-500/40" : ""}`}
                    >
                      <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">
                        {pick.overallPickNumber > 0 ? `#${pick.overallPickNumber}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 text-xs font-medium">
                        {pick.roundId}.{String(pick.roundPickNumber).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-white font-medium">
                          {pick.playerName && !pick.playerName.startsWith("Player #")
                            ? pick.playerName
                            : <span className="text-slate-500 italic">Unknown Player</span>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`text-xs px-1.5 py-0 ${POS_COLORS[pick.position] || "bg-slate-600/20 text-slate-300 border-slate-600/30"}`}>
                          {pick.position || "?"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{pick.proTeam || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-300 text-xs">{pick.teamName || `Team ${pick.teamId}`}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1 flex-wrap">
                          {pick.keeper && (
                            <Badge className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-xs px-1.5 py-0 flex items-center gap-1">
                              <Star className="w-2.5 h-2.5" />
                              Keeper
                            </Badge>
                          )}
                          {pick.autoDrafted && (
                            <Badge className="bg-slate-600/20 text-slate-400 border border-slate-600/30 text-xs px-1.5 py-0">
                              Auto
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPicks.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  No picks match your current filters.
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
