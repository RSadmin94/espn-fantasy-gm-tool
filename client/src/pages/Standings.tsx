import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SeasonSelector from "@/components/SeasonSelector";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

export default function Standings() {
  const [season, setSeason] = useState(2025);
  const { data: standings, isLoading } = trpc.espn.standings.useQuery({ season });
  const { data: allStandings } = trpc.espn.allStandings.useQuery();

  // Build multi-season wins chart for top teams
  const seasons = Object.keys(allStandings || {}).map(Number).sort();
  const topTeamNames: string[] = [];
  if (allStandings) {
    const latest = allStandings[Math.max(...seasons)];
    if (latest) {
      (latest as Record<string, unknown>[]).slice(0, 5).forEach((t) => {
        const name = String(t.teamName || "").split(" ").slice(-1)[0];
        if (name) topTeamNames.push(name);
      });
    }
  }
  const trendData = seasons.map((s) => {
    const row: Record<string, unknown> = { season: s };
    const sData = (allStandings as Record<number, Record<string, unknown>[]>)?.[s] || [];
    sData.forEach((t) => {
      const name = String(t.teamName || "").split(" ").slice(-1)[0];
      if (topTeamNames.includes(name)) row[name] = t.wins;
    });
    return row;
  });

  const COLORS = ["oklch(0.65 0.22 25)", "oklch(0.60 0.18 200)", "oklch(0.70 0.18 150)", "oklch(0.65 0.20 280)", "oklch(0.72 0.18 60)"];

  return (
    <AppLayout title="Standings" subtitle="Season-over-season records and rankings">
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-4">
          <SeasonSelector value={season} onChange={setSeason} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Standings table */}
          <div className="lg:col-span-2">
            <Card className="card-glow bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  {season} Final Standings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="px-6 pb-4 space-y-2">
                    {[...Array(14)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : standings?.length === 0 ? (
                  <div className="px-6 py-8 text-center text-muted-foreground text-sm">
                    No data for {season}. Use Data Refresh to load this season.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-12 px-6 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                      <span className="col-span-1">#</span>
                      <span className="col-span-4">Team</span>
                      <span className="col-span-2 text-center">W-L-T</span>
                      <span className="col-span-2 text-right">PF</span>
                      <span className="col-span-2 text-right">PA</span>
                      <span className="col-span-1 text-right">+/-</span>
                    </div>
                    <div className="divide-y divide-border">
                      {standings?.map((team: Record<string, unknown>, i: number) => {
                        const pf = Number(team.pointsFor || 0);
                        const pa = Number(team.pointsAgainst || 0);
                        const diff = pf - pa;
                        const isPlayoff = i < 7;
                        return (
                          <div key={i} className="grid grid-cols-12 items-center px-6 py-3 hover:bg-accent/40 transition-colors">
                            <span className={`col-span-1 text-sm font-bold ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                              {i + 1}
                            </span>
                            <div className="col-span-4 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-foreground truncate">{String(team.teamName || "")}</p>
                                {isPlayoff && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-emerald-500/40 text-emerald-400 flex-shrink-0">PO</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{String(team.owners || "")}</p>
                            </div>
                            <span className="col-span-2 text-sm text-center font-mono">
                              {String(team.wins || 0)}-{String(team.losses || 0)}-{String(team.ties || 0)}
                            </span>
                            <span className="col-span-2 text-sm text-right font-mono">{pf.toFixed(1)}</span>
                            <span className="col-span-2 text-sm text-right font-mono text-muted-foreground">{pa.toFixed(1)}</span>
                            <span className={`col-span-1 text-xs text-right font-mono flex items-center justify-end gap-0.5 ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {diff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {Math.abs(diff).toFixed(0)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Season summary */}
          <div className="space-y-4">
            <Card className="card-glow bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Season Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {standings && standings.length > 0 ? (
                  <>
                    <SumRow label="Total Teams" value={String(standings.length)} />
                    <SumRow label="Playoff Spots" value="7" />
                    <SumRow label="Avg PF/Team" value={
                      (standings.reduce((acc: number, t: Record<string, unknown>) => acc + Number(t.pointsFor || 0), 0) / standings.length).toFixed(1)
                    } />
                    <SumRow label="Highest PF" value={
                      Math.max(...standings.map((t: Record<string, unknown>) => Number(t.pointsFor || 0))).toFixed(1)
                    } />
                    <SumRow label="Lowest PF" value={
                      Math.min(...standings.map((t: Record<string, unknown>) => Number(t.pointsFor || 0))).toFixed(1)
                    } />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Load season data first.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Multi-season wins trend */}
        {trendData.length > 0 && (
          <Card className="card-glow bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Multi-Season Win Trend (Top 5 Teams)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData} margin={{ top: 4, right: 16, bottom: 4, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 240)" />
                  <XAxis dataKey="season" tick={{ fontSize: 11, fill: "oklch(0.55 0.015 240)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.015 240)" }} />
                  <Tooltip contentStyle={{ background: "oklch(0.14 0.018 240)", border: "1px solid oklch(0.22 0.02 240)", borderRadius: "6px" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  {topTeamNames.map((name, i) => (
                    <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}
