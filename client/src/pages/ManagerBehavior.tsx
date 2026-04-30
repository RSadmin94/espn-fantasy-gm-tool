import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, TrendingUp, TrendingDown, Zap, RefreshCw, Target } from "lucide-react";

const ARCHETYPE_COLORS: Record<string, string> = {
  "Trade Shark": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "Waiver Hawk": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Keeper Loyalist": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Passive Manager": "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "Balanced": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "Aggressive": "bg-red-500/20 text-red-300 border-red-500/30",
  "Reactive": "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const STAT_BAR_COLOR = (val: number, max: number) => {
  const pct = max > 0 ? val / max : 0;
  if (pct >= 0.8) return "bg-red-500";
  if (pct >= 0.6) return "bg-orange-500";
  if (pct >= 0.4) return "bg-yellow-500";
  return "bg-emerald-500";
};

export default function ManagerBehavior() {
  const { data: managers, isLoading } = trpc.analytics.managerBehavior.useQuery({});

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-slate-700/50 rounded animate-pulse w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 bg-slate-700/50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!managers || managers.length === 0) {
    return (
      <div className="p-6 text-center py-20">
        <Users className="w-16 h-16 mx-auto mb-4 text-slate-600" />
        <div className="text-xl text-slate-400">No manager data available</div>
        <div className="text-slate-500 text-sm mt-2">Refresh ESPN data for multiple seasons to build manager profiles</div>
      </div>
    );
  }

  const maxTrades = Math.max(...managers.map(m => m.avgTradesPerSeason));
  const maxWaivers = Math.max(...managers.map(m => m.avgWaiverAddsPerSeason));
  const maxDrops = Math.max(...managers.map(m => m.avgDropsPerSeason));

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-red-400" />
          Opponent Intel
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          GM profiles calculated from actual transaction history, draft behavior, and keeper decisions — not narrative labels
        </p>
      </div>

      {/* Summary Table */}
      <Card className="bg-slate-800/60 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-sm uppercase tracking-wide">All Managers — Calculated Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase border-b border-slate-700">
                  <th className="text-left py-2 px-3">Manager</th>
                  <th className="text-right py-2 px-3">Trades/Yr</th>
                  <th className="text-right py-2 px-3">Waivers/Yr</th>
                  <th className="text-right py-2 px-3">Drop Err%</th>
                  <th className="text-right py-2 px-3">Keeper Eff</th>
                  <th className="text-right py-2 px-3">QB Reach%</th>
                  <th className="text-right py-2 px-3">Seasons</th>
                  <th className="text-left py-2 px-3">Archetype</th>
                </tr>
              </thead>
              <tbody>
                {managers.map(m => (
                  <tr key={m.teamId} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 px-3 text-white font-medium">{m.ownerName}</td>
                    <td className="py-2 px-3 text-right text-white">{m.avgTradesPerSeason.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right text-white">{m.avgWaiverAddsPerSeason.toFixed(1)}</td>
                    <td className={`py-2 px-3 text-right ${m.avgDropsPerSeason > 10 ? "text-orange-400" : "text-emerald-400"}`}>
                      {m.avgDropsPerSeason.toFixed(1)}/yr
                    </td>
                    <td className={`py-2 px-3 text-right ${m.keeperEfficiencyAvg >= 2 ? "text-emerald-400" : m.keeperEfficiencyAvg >= 0 ? "text-yellow-400" : "text-red-400"}`}>
                      {m.keeperEfficiencyAvg > 0 ? "+" : ""}{m.keeperEfficiencyAvg.toFixed(1)} rds
                    </td>
                    <td className={`py-2 px-3 text-right ${m.earlyQbTendency ? "text-orange-400" : "text-slate-400"}`}>
                      {m.earlyQbTendency ? "Yes" : "No"}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">{m.seasonsAnalyzed}</td>
                    <td className="py-2 px-3">
                      <Badge className={`text-xs border ${ARCHETYPE_COLORS[m.gmArchetype] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30"}`}>
                        {m.gmArchetype}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Individual Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {managers.map(m => (
          <Card key={m.teamId} className="bg-slate-800/60 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="font-bold text-white text-lg">{m.ownerName}</div>
                  <div className="text-slate-400 text-xs mt-0.5">{m.seasonsAnalyzed} seasons analyzed</div>
                </div>
                <Badge className={`text-xs border ${ARCHETYPE_COLORS[m.gmArchetype] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30"}`}>
                  {m.gmArchetype}
                </Badge>
              </div>

              <div className="space-y-3">
                {/* Trade Activity */}
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Trade Activity</span>
                    <span className="text-white">{m.avgTradesPerSeason.toFixed(1)}/yr (score: {m.tradeFrequencyScore})</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${STAT_BAR_COLOR(m.avgTradesPerSeason, maxTrades)}`}
                      style={{ width: `${maxTrades > 0 ? (m.avgTradesPerSeason / maxTrades) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Waiver Activity */}
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Waiver Activity</span>
                    <span className="text-white">{m.avgWaiverAddsPerSeason.toFixed(1)}/yr (score: {m.waiverAggressionScore})</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${STAT_BAR_COLOR(m.avgWaiverAddsPerSeason, maxWaivers)}`}
                      style={{ width: `${maxWaivers > 0 ? (m.avgWaiverAddsPerSeason / maxWaivers) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Keeper Efficiency */}
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Keeper Efficiency</span>
                    <span className={m.keeperEfficiencyAvg >= 2 ? "text-emerald-400" : m.keeperEfficiencyAvg >= 0 ? "text-yellow-400" : "text-red-400"}>
                      {m.keeperEfficiencyAvg > 0 ? "+" : ""}{m.keeperEfficiencyAvg.toFixed(1)} rounds avg
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${m.keeperEfficiencyAvg >= 2 ? "bg-emerald-500" : m.keeperEfficiencyAvg >= 0 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(100, Math.max(0, (m.keeperEfficiencyAvg + 5) * 10))}%` }}
                    />
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="bg-slate-900/40 rounded p-2 text-center">
                    <div className="text-slate-400 text-xs">Drops/Yr</div>
                    <div className={`font-bold text-sm ${m.avgDropsPerSeason > 15 ? "text-orange-400" : "text-slate-300"}`}>
                      {m.avgDropsPerSeason.toFixed(1)}
                    </div>
                  </div>
                  <div className="bg-slate-900/40 rounded p-2 text-center">
                    <div className="text-slate-400 text-xs">Early QB</div>
                    <div className={`font-bold text-sm ${m.earlyQbTendency ? "text-orange-400" : "text-slate-300"}`}>
                      {m.earlyQbTendency ? "Yes" : "No"}
                    </div>
                  </div>
                  <div className="bg-slate-900/40 rounded p-2 text-center">
                    <div className="text-slate-400 text-xs">Early TE</div>
                    <div className={`font-bold text-sm ${m.earlyTeTendency ? "text-blue-400" : "text-slate-300"}`}>
                      {m.earlyTeTendency ? "Yes" : "No"}
                    </div>
                  </div>
                </div>

                {/* Archetype description */}
                {m.gmArchetypeDesc && (
                  <div className="text-slate-400 text-xs mt-2 italic">{m.gmArchetypeDesc}</div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
