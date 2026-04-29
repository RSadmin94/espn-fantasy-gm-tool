import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SeasonSelector from "@/components/SeasonSelector";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Swords } from "lucide-react";

export default function Matchups() {
  const [season, setSeason] = useState(2025);
  const [week, setWeek] = useState<number | undefined>(undefined);

  const { data: matchups, isLoading } = trpc.espn.matchups.useQuery({ season, matchupPeriodId: week });
  const { data: teams } = trpc.espn.teams.useQuery({ season });

  const teamList = (teams as Record<string, unknown>[]) || [];
  const allMatchups = (matchups as Record<string, unknown>[]) || [];

  // Build team name map
  const teamMap: Record<number, string> = {};
  teamList.forEach((t) => { teamMap[t.teamId as number] = String(t.teamName || ""); });

  // Get unique weeks
  const weekSet = new Set(allMatchups.map((m) => Number(m.matchupPeriodId || 0)));
  const weeks = Array.from(weekSet).sort((a, b) => a - b);

  // Group by week
  const byWeek: Record<number, Record<string, unknown>[]> = {};
  for (const m of allMatchups) {
    const w = Number(m.matchupPeriodId || 0);
    if (!byWeek[w]) byWeek[w] = [];
    byWeek[w].push(m);
  }

  return (
    <AppLayout title="Matchup Scoreboard" subtitle="Weekly head-to-head results and schedule">
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <SeasonSelector value={season} onChange={(s) => { setSeason(s); setWeek(undefined); }} />
          <Select value={week !== undefined ? String(week) : "all"} onValueChange={(v) => setWeek(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All Weeks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Weeks</SelectItem>
              {weeks.map((w) => (
                <SelectItem key={w} value={String(w)}>Week {w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
          </div>
        ) : allMatchups.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Swords className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No matchup data for {season}. Use Data Refresh to load this season.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byWeek).sort(([a], [b]) => Number(a) - Number(b)).map(([weekNum, weekMatchups]) => (
              <Card key={weekNum} className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Swords className="w-4 h-4 text-primary" />
                    Week {weekNum}
                    {Number(weekNum) > 14 && <Badge variant="outline" className="text-[10px] border-yellow-500/40 text-yellow-400">Playoffs</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {(weekMatchups as Record<string, unknown>[]).map((m, i) => {
                      const homeId = m.homeTeamId as number;
                      const awayId = m.awayTeamId as number;
                      const homeScore = Number(m.homeScore || m.homeTotal || 0);
                      const awayScore = Number(m.awayScore || m.awayTotal || 0);
                      const homeWon = homeScore > awayScore;
                      const awayWon = awayScore > homeScore;
                      const homeName = teamMap[homeId] || `Team ${homeId}`;
                      const awayName = teamMap[awayId] || `Team ${awayId}`;
                      const isPlayoff = Boolean(m.playoffTierType);

                      return (
                        <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-accent/30 transition-colors">
                          {isPlayoff && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-yellow-500/40 text-yellow-400 flex-shrink-0">PO</Badge>}
                          <div className={`flex-1 min-w-0 text-right ${homeWon ? "text-foreground" : "text-muted-foreground"}`}>
                            <p className="text-sm font-medium truncate">{homeName}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-base font-bold font-mono w-14 text-right ${homeWon ? "text-foreground" : "text-muted-foreground"}`}>
                              {homeScore > 0 ? homeScore.toFixed(2) : "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">vs</span>
                            <span className={`text-base font-bold font-mono w-14 text-left ${awayWon ? "text-foreground" : "text-muted-foreground"}`}>
                              {awayScore > 0 ? awayScore.toFixed(2) : "—"}
                            </span>
                          </div>
                          <div className={`flex-1 min-w-0 ${awayWon ? "text-foreground" : "text-muted-foreground"}`}>
                            <p className="text-sm font-medium truncate">{awayName}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
