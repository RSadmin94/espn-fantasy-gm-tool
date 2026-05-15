import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart2, TrendingUp, Target, Star, Users, AlertTriangle } from "lucide-react";

const CURRENT_SEASON = 2025;
const SEASONS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

const TIER_COLORS: Record<string, string> = {
  "Elite": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "Starter": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Borderline": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Handcuff": "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "Droppable": "bg-red-500/20 text-red-300 border-red-500/30",
};

const SCARCITY_COLORS: Record<string, string> = {
  "Scarce": "text-red-400",
  "Tight": "text-orange-400",
  "Available": "text-yellow-400",
  "Deep": "text-emerald-400",
};

const GRADE_COLORS: Record<string, string> = {
  "A": "text-emerald-400",
  "B": "text-blue-400",
  "C": "text-yellow-400",
  "D": "text-orange-400",
  "F": "text-red-400",
};

const EFFICIENCY_COLORS: Record<string, string> = {
  "Elite Value": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "Good Value": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Fair Value": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Poor Value": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Avoid": "bg-red-500/20 text-red-300 border-red-500/30",
};

export default function LeagueAnalytics() {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [posFilter, setPosFilter] = useState("ALL");

  const { data: vorp, isLoading: vorpLoading } = trpc.analytics.vorp.useQuery({ season }, { staleTime: 10 * 60_000 });
  const { data: scarcity, isLoading: scarcityLoading } = trpc.analytics.scarcity.useQuery({ season }, { staleTime: 10 * 60_000 });
  const { data: rosterGaps, isLoading: gapsLoading } = trpc.analytics.rosterGaps.useQuery({ season }, { staleTime: 10 * 60_000 });
  const { data: keeperEff, isLoading: keeperLoading } = trpc.analytics.keeperEfficiency.useQuery({ season }, { staleTime: 10 * 60_000 });

  const filteredVorp = (vorp ?? []).filter(p =>
    posFilter === "ALL" || p.position === posFilter
  );

  const positions = ["ALL", "QB", "RB", "WR", "TE", "K", "D/ST"];

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-red-400" />
            League Analytics
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Calculated facts: VORP, positional scarcity, roster gaps, keeper efficiency
          </p>
        </div>
        <Select value={String(season)} onValueChange={v => setSeason(Number(v))}>
          <SelectTrigger className="w-32 bg-slate-800 border-slate-600 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            {SEASONS.map(s => (
              <SelectItem key={s} value={String(s)} className="text-white hover:bg-slate-700">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="vorp">
        <TabsList className="bg-slate-800/60 border border-slate-700">
          <TabsTrigger value="vorp" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">
            <TrendingUp className="w-4 h-4 mr-1" /> VORP
          </TabsTrigger>
          <TabsTrigger value="scarcity" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">
            <Target className="w-4 h-4 mr-1" /> Scarcity
          </TabsTrigger>
          <TabsTrigger value="gaps" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">
            <AlertTriangle className="w-4 h-4 mr-1" /> Roster Gaps
          </TabsTrigger>
          <TabsTrigger value="keeper" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">
            <Star className="w-4 h-4 mr-1" /> Keeper Efficiency
          </TabsTrigger>
        </TabsList>

        {/* VORP Tab */}
        <TabsContent value="vorp" className="mt-4">
          <div className="flex gap-2 mb-4 flex-wrap">
            {positions.map(pos => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  posFilter === pos
                    ? "bg-red-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>

          {vorpLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-12 bg-slate-700/50 rounded animate-pulse" />
              ))}
            </div>
          ) : filteredVorp.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <div>No data available for {season}. Refresh ESPN data first.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase border-b border-slate-700">
                    <th className="text-left py-2 px-3">Rank</th>
                    <th className="text-left py-2 px-3">Player</th>
                    <th className="text-left py-2 px-3">Pos</th>
                    <th className="text-left py-2 px-3">Owner</th>
                    <th className="text-right py-2 px-3">Avg PPG</th>
                    <th className="text-right py-2 px-3">Repl. Level</th>
                    <th className="text-right py-2 px-3">VORP</th>
                    <th className="text-left py-2 px-3">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVorp.slice(0, 50).map((p, i) => (
                    <tr key={p.playerId} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 px-3 text-slate-500">{i + 1}</td>
                      <td className="py-2 px-3 text-white font-medium">{p.playerName}</td>
                      <td className="py-2 px-3">
                        <span className="text-xs font-mono text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded">{p.position}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-400 text-xs">{p.ownerName}</td>
                      <td className="py-2 px-3 text-right text-white">{p.avgPoints.toFixed(1)}</td>
                      <td className="py-2 px-3 text-right text-slate-400">{p.replacementLevel.toFixed(1)}</td>
                      <td className={`py-2 px-3 text-right font-bold ${p.vorp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {p.vorp > 0 ? "+" : ""}{p.vorp.toFixed(1)}
                      </td>
                      <td className="py-2 px-3">
                        <Badge className={`text-xs border ${TIER_COLORS[p.vorpTier] ?? ""}`}>
                          {p.vorpTier}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Scarcity Tab */}
        <TabsContent value="scarcity" className="mt-4">
          {scarcityLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-slate-700/50 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {(scarcity ?? []).map(s => (
                <Card key={s.position} className="bg-slate-800/60 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-white text-lg">{s.position}</span>
                      <span className={`font-semibold text-sm ${SCARCITY_COLORS[s.scarcityLabel]}`}>
                        {s.scarcityLabel}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Rostered</span>
                        <span className="text-white">{s.totalRostered}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Starter Slots</span>
                        <span className="text-white">{s.starterSlots}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">FA Starters Avail.</span>
                        <span className={s.availableStarters > 0 ? "text-yellow-400" : "text-emerald-400"}>
                          {s.availableStarters}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Best FA Avg</span>
                        <span className="text-white">{s.topFreeAgentAvg.toFixed(1)} PPG</span>
                      </div>
                    </div>
                    {/* Scarcity bar */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Scarcity</span>
                        <span>{s.scarcityScore}/100</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            s.scarcityScore >= 80 ? "bg-red-500" :
                            s.scarcityScore >= 60 ? "bg-orange-500" :
                            s.scarcityScore >= 30 ? "bg-yellow-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${s.scarcityScore}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Roster Gaps Tab */}
        <TabsContent value="gaps" className="mt-4">
          {gapsLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-20 bg-slate-700/50 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(rosterGaps ?? []).map(team => (
                <Card key={team.teamId} className="bg-slate-800/60 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="font-semibold text-white">{team.ownerName}</span>
                        <span className="text-slate-500 text-xs ml-2">Weakest: {team.weakestPosition}</span>
                      </div>
                      <span className={`text-2xl font-bold ${GRADE_COLORS[team.overallGrade]}`}>
                        {team.overallGrade}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                      {team.gaps.map(gap => (
                        <div key={gap.position} className={`rounded p-2 text-center ${
                          gap.gapSeverity === "Critical" ? "bg-red-500/20 border border-red-500/30" :
                          gap.gapSeverity === "Weak" ? "bg-orange-500/20 border border-orange-500/30" :
                          gap.gapSeverity === "Adequate" ? "bg-yellow-500/20 border border-yellow-500/30" :
                          "bg-emerald-500/20 border border-emerald-500/30"
                        }`}>
                          <div className="text-xs font-mono font-bold text-white">{gap.position}</div>
                          <div className={`text-xs mt-0.5 ${
                            gap.gapSeverity === "Critical" ? "text-red-400" :
                            gap.gapSeverity === "Weak" ? "text-orange-400" :
                            gap.gapSeverity === "Adequate" ? "text-yellow-400" : "text-emerald-400"
                          }`}>
                            {gap.topPlayerAvg > 0 ? `${gap.topPlayerAvg} PPG` : "Empty"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Keeper Efficiency Tab */}
        <TabsContent value="keeper" className="mt-4">
          {keeperLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-14 bg-slate-700/50 rounded animate-pulse" />
              ))}
            </div>
          ) : (keeperEff ?? []).length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <div>No keeper data available for {season}.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase border-b border-slate-700">
                    <th className="text-left py-2 px-3">Player</th>
                    <th className="text-left py-2 px-3">Pos</th>
                    <th className="text-left py-2 px-3">Owner</th>
                    <th className="text-right py-2 px-3">Avg PPG</th>
                    <th className="text-right py-2 px-3">Keep Rd</th>
                    <th className="text-right py-2 px-3">ADP Rd</th>
                    <th className="text-right py-2 px-3">Savings</th>
                    <th className="text-left py-2 px-3">Label</th>
                    <th className="text-left py-2 px-3">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {(keeperEff ?? []).map(k => (
                    <tr key={k.playerId} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 px-3 text-white font-medium">{k.playerName}</td>
                      <td className="py-2 px-3">
                        <span className="text-xs font-mono text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded">{k.position}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-400 text-xs">{k.ownerName}</td>
                      <td className="py-2 px-3 text-right text-white">{k.avgPoints.toFixed(1)}</td>
                      <td className="py-2 px-3 text-right text-white">Rd {k.keeperRound}</td>
                      <td className="py-2 px-3 text-right text-slate-400">Rd {k.adpEquivRound}</td>
                      <td className={`py-2 px-3 text-right font-bold ${k.roundSavings >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {k.roundSavings > 0 ? "+" : ""}{k.roundSavings}
                      </td>
                      <td className="py-2 px-3">
                        <Badge className={`text-xs border ${EFFICIENCY_COLORS[k.efficiencyLabel] ?? ""}`}>
                          {k.efficiencyLabel}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-slate-400 text-xs max-w-48">{k.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
