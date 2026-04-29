import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Star, AlertTriangle, CheckCircle, XCircle, Info, Calendar } from "lucide-react";

const POS_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  WR: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  TE: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  K: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "D/ST": "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

type KeeperRecord = {
  season: number;
  playerName: string;
  position: string;
  roundId: number;
  consecutiveYears: number;
};

type TeamAnalysis = {
  teamId: number;
  teamName: string;
  keeperHistory: KeeperRecord[];
  ineligibleForNext: string[];
  eligibleForNext: Array<{
    playerName: string;
    position: string;
    roundId: number;
    consecutiveYears: number;
    mustReturn: boolean;
  }>;
};

type AnalysisData = {
  latestSeason: number;
  nextSeason: number;
  teams: TeamAnalysis[];
};

type RawKeeper = {
  season: number;
  teamName: string;
  playerName: string;
  position: string;
  roundId: number;
  teamId: number;
};

export default function Keepers() {
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterSeason, setFilterSeason] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("eligibility");

  const { data: keepersRaw, isLoading: loadingHistory } = trpc.espn.keeperHistory.useQuery();
  const { data: analysisRaw, isLoading: loadingAnalysis } = trpc.espn.keeperAnalysis.useQuery();
  const { data: draftOrder2026Raw } = trpc.espn.draftOrder.useQuery({ season: 2026 });

  const allKeepers = (keepersRaw as RawKeeper[]) || [];
  const analysis = analysisRaw as AnalysisData | null;
  const draftOrder2026 = draftOrder2026Raw as { pickOrder?: Array<{ position: number; teamId: number; name?: string }> } | null;

  // Unique teams and seasons for history tab
  const teamNames = useMemo(() => Array.from(new Set(allKeepers.map((k) => k.teamName))).filter(Boolean).sort(), [allKeepers]);
  const seasons = useMemo(() => Array.from(new Set(allKeepers.map((k) => k.season))).sort((a, b) => b - a), [allKeepers]);

  const filteredHistory = useMemo(() => {
    return allKeepers.filter((k) => {
      if (filterTeam !== "all" && k.teamName !== filterTeam) return false;
      if (filterSeason !== "all" && k.season !== parseInt(filterSeason)) return false;
      return true;
    });
  }, [allKeepers, filterTeam, filterSeason]);

  // Group history by season
  const bySeason = useMemo(() => {
    const map: Record<number, RawKeeper[]> = {};
    for (const k of filteredHistory) {
      if (!map[k.season]) map[k.season] = [];
      map[k.season].push(k);
    }
    return map;
  }, [filteredHistory]);

  const nextSeason = analysis?.nextSeason ?? 2026;
  const latestSeason = analysis?.latestSeason ?? 2025;

  // Build draft position map for 2026
  const draftPositionMap = useMemo(() => {
    const map: Record<number, number> = {};
    if (draftOrder2026?.pickOrder) {
      draftOrder2026.pickOrder.forEach((entry) => { map[entry.teamId] = entry.position; });
    }
    return map;
  }, [draftOrder2026]);

  return (
    <AppLayout title="Keeper Intelligence" subtitle="2-year rule enforcement · eligibility analysis · keeper history">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Keeper Intelligence</h1>
          <p className="text-slate-400 text-sm mt-1">
            Tracks keeper eligibility with the 2-consecutive-year rule — a player kept in back-to-back seasons must return to the draft pool.
          </p>
        </div>

        {/* Rule Banner */}
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-300 font-semibold text-sm">2-Year Keeper Rule</p>
              <p className="text-amber-200/80 text-xs mt-1">
                A player may be kept for a maximum of 2 consecutive seasons. If kept in both {latestSeason - 1} and {latestSeason},
                that player is <strong>ineligible</strong> to be kept in {nextSeason} and must re-enter the draft pool.
                Keeper deadline: <strong>August 18, {nextSeason}</strong>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800/60 border border-slate-700">
            <TabsTrigger value="eligibility" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
              {nextSeason} Eligibility
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
              Keeper History
            </TabsTrigger>
            <TabsTrigger value="draftorder" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
              {nextSeason} Draft Order
            </TabsTrigger>
          </TabsList>

          {/* ── Eligibility Tab ── */}
          <TabsContent value="eligibility" className="mt-4 space-y-4">
            {loadingAnalysis ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                <span className="ml-3 text-slate-400">Analyzing keeper eligibility...</span>
              </div>
            ) : !analysis || analysis.teams.length === 0 ? (
              <Card className="bg-slate-800/60 border-slate-700">
                <CardContent className="p-12 text-center">
                  <p className="text-slate-400">No keeper analysis available. Load season data via Data Refresh.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysis.teams.map((team) => {
                  const draftPos = draftPositionMap[team.teamId];
                  return (
                    <Card key={team.teamId} className="bg-slate-800/60 border-slate-700">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-white text-sm font-semibold flex items-center justify-between">
                          <span>{team.teamName}</span>
                          {draftPos && (
                            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">
                              Pick #{draftPos} in {nextSeason}
                            </Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Eligible */}
                        {team.eligibleForNext.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-400 font-medium mb-2 flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                              Eligible to Keep in {nextSeason}
                            </p>
                            <div className="space-y-1.5">
                              {team.eligibleForNext.map((p, i) => (
                                <div key={i} className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0 ${POS_COLORS[p.position] || "bg-slate-600/20 text-slate-300 border-slate-600/30"}`}>
                                      {p.position}
                                    </Badge>
                                    <span className="text-white text-sm font-medium">{p.playerName}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-slate-400 text-xs">Rd {p.roundId}</span>
                                    {p.consecutiveYears === 1 && (
                                      <span className="text-amber-400 text-xs ml-2">(1st yr)</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Ineligible */}
                        {team.ineligibleForNext.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-400 font-medium mb-2 flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5 text-red-400" />
                              Ineligible (2-Year Rule) — Returns to Draft Pool
                            </p>
                            <div className="space-y-1.5">
                              {team.ineligibleForNext.map((name, i) => (
                                <div key={i} className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                  <span className="text-red-300 text-sm font-medium">{name}</span>
                                  <span className="text-red-400/60 text-xs ml-auto">Must re-enter draft</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {team.eligibleForNext.length === 0 && team.ineligibleForNext.length === 0 && (
                          <p className="text-slate-500 text-sm text-center py-3">No keeper data for this team in {latestSeason}.</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── History Tab ── */}
          <TabsContent value="history" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={filterSeason} onValueChange={setFilterSeason}>
                <SelectTrigger className="w-36 bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="All Seasons" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white hover:bg-slate-700">All Seasons</SelectItem>
                  {seasons.map((s) => (
                    <SelectItem key={s} value={String(s)} className="text-white hover:bg-slate-700">{s} Season</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterTeam} onValueChange={setFilterTeam}>
                <SelectTrigger className="w-52 bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white hover:bg-slate-700">All Teams</SelectItem>
                  {teamNames.map((n) => (
                    <SelectItem key={n} value={n} className="text-white hover:bg-slate-700">{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-slate-400 text-sm ml-auto">{filteredHistory.length} keeper{filteredHistory.length !== 1 ? "s" : ""}</span>
            </div>

            {loadingHistory ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <Card className="bg-slate-800/60 border-slate-700">
                <CardContent className="p-12 text-center">
                  <Star className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                  <p className="text-slate-400">No keeper data found. Load season data via Data Refresh.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {Object.entries(bySeason).sort(([a], [b]) => Number(b) - Number(a)).map(([seasonStr, seasonKeepers]) => (
                  <Card key={seasonStr} className="bg-slate-800/60 border-slate-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                        <Star className="w-4 h-4 text-yellow-400" />
                        {seasonStr} Keepers
                        <Badge variant="outline" className="ml-auto text-xs border-slate-600 text-slate-400">
                          {seasonKeepers.length} total
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-700 bg-slate-900/40">
                              <th className="text-left px-4 py-2.5 text-slate-400 font-medium text-xs">Player</th>
                              <th className="text-left px-4 py-2.5 text-slate-400 font-medium text-xs">Pos</th>
                              <th className="text-left px-4 py-2.5 text-slate-400 font-medium text-xs">Round Kept</th>
                              <th className="text-left px-4 py-2.5 text-slate-400 font-medium text-xs">Team</th>
                            </tr>
                          </thead>
                          <tbody>
                            {seasonKeepers.map((k, i) => (
                              <tr key={i} className="border-b border-slate-700/40 hover:bg-slate-700/25 transition-colors">
                                <td className="px-4 py-2.5 text-white font-medium">{k.playerName || "Unknown"}</td>
                                <td className="px-4 py-2.5">
                                  <Badge variant="outline" className={`text-xs px-1.5 py-0 ${POS_COLORS[k.position] || "bg-slate-600/20 text-slate-300 border-slate-600/30"}`}>
                                    {k.position || "?"}
                                  </Badge>
                                </td>
                                <td className="px-4 py-2.5 text-slate-300 text-xs">Round {k.roundId || "—"}</td>
                                <td className="px-4 py-2.5 text-slate-400 text-xs">{k.teamName || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── 2026 Draft Order Tab ── */}
          <TabsContent value="draftorder" className="mt-4">
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  {nextSeason} Draft Order
                  <span className="text-slate-400 font-normal text-xs ml-2">— August 29, 2026 @ 3:30 PM EDT</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!draftOrder2026?.pickOrder ? (
                  <p className="text-slate-400 text-sm">Load 2026 season data to see the draft order.</p>
                ) : (
                  <div className="space-y-2">
                    {draftOrder2026.pickOrder.map((entry) => {
                      const teamAnalysis = analysis?.teams.find((t) => t.teamId === entry.teamId);
                      const eligibleKeepers = teamAnalysis?.eligibleForNext || [];
                      const ineligible = teamAnalysis?.ineligibleForNext || [];
                      return (
                        <div key={entry.position} className="flex items-center gap-4 bg-slate-700/30 rounded-lg px-4 py-3 border border-slate-700/50">
                          <span className="text-slate-400 font-mono text-sm w-6 text-right flex-shrink-0">{entry.position}.</span>
                          <span className="text-white font-medium text-sm flex-1">{entry.name || `Team ${entry.teamId}`}</span>
                          <div className="flex gap-1.5 flex-wrap justify-end">
                            {eligibleKeepers.map((k, i) => (
                              <Badge key={i} className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                                <Star className="w-2.5 h-2.5 mr-1" />
                                {k.playerName} (Rd {k.roundId})
                              </Badge>
                            ))}
                            {ineligible.map((name, i) => (
                              <Badge key={i} className="bg-red-500/10 text-red-400 border-red-500/20 text-xs line-through opacity-60">
                                {name}
                              </Badge>
                            ))}
                            {eligibleKeepers.length === 0 && ineligible.length === 0 && (
                              <span className="text-slate-500 text-xs">No keeper data</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
