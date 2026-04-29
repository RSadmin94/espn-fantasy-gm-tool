import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SeasonSelector from "@/components/SeasonSelector";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Star } from "lucide-react";

const POS_MAP: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };
const POS_COLORS: Record<string, string> = {
  QB: "text-red-400 border-red-500/30 bg-red-500/10",
  RB: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  WR: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  TE: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  "D/ST": "text-purple-400 border-purple-500/30 bg-purple-500/10",
  K: "text-orange-400 border-orange-500/30 bg-orange-500/10",
};

export default function DraftHistory() {
  const [season, setSeason] = useState(2025);
  const [filterTeamId, setFilterTeamId] = useState<number | undefined>(undefined);
  const [filterRound, setFilterRound] = useState<number | undefined>(undefined);

  const { data: picks, isLoading } = trpc.espn.draftPicks.useQuery({ season, teamId: filterTeamId });
  const { data: teams } = trpc.espn.teams.useQuery({ season });

  const teamList = (teams as Record<string, unknown>[]) || [];
  const allPicks = (picks as Record<string, unknown>[]) || [];

  // Get unique rounds
  const roundSet = new Set(allPicks.map((p) => Number(p.roundId || p.round || 0)));
  const rounds = Array.from(roundSet).sort((a, b) => a - b);

  // Filter by round
  const filteredPicks = filterRound !== undefined
    ? allPicks.filter((p) => Number(p.roundId || p.round || 0) === filterRound)
    : allPicks;

  // Group by round for display
  const byRound: Record<number, Record<string, unknown>[]> = {};
  for (const pick of filteredPicks) {
    const r = Number(pick.roundId || pick.round || 0);
    if (!byRound[r]) byRound[r] = [];
    byRound[r].push(pick);
  }

  // Build team name map
  const teamMap: Record<number, string> = {};
  teamList.forEach((t) => { teamMap[t.teamId as number] = String(t.teamName || ""); });

  return (
    <AppLayout title="Draft History" subtitle="Pick-by-pick draft recaps for all seasons">
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <SeasonSelector value={season} onChange={(s) => { setSeason(s); setFilterTeamId(undefined); setFilterRound(undefined); }} />
          <Select value={filterTeamId ? String(filterTeamId) : "all"} onValueChange={(v) => setFilterTeamId(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teamList.map((t) => (
                <SelectItem key={String(t.teamId)} value={String(t.teamId)}>
                  {String(t.teamName || "")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterRound !== undefined ? String(filterRound) : "all"} onValueChange={(v) => setFilterRound(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All Rounds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rounds</SelectItem>
              {rounds.map((r) => (
                <SelectItem key={r} value={String(r)}>Round {r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
          </div>
        ) : filteredPicks.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No draft data for {season}. Use Data Refresh to load this season.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byRound).sort(([a], [b]) => Number(a) - Number(b)).map(([round, roundPicks]) => (
              <Card key={round} className="card-glow bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Round {round}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border">
                    {(roundPicks as Record<string, unknown>[]).sort((a, b) => Number(a.pickInRound || a.roundPickNumber || 0) - Number(b.pickInRound || b.roundPickNumber || 0)).map((pick, i) => {
                      const pos = POS_MAP[pick.defaultPositionId as number] || "—";
                      const colorClass = POS_COLORS[pos] || "text-muted-foreground border-border bg-muted/20";
                      const isKeeper = Boolean(pick.keeper);
                      const overallPick = Number(pick.overallPickNumber || pick.id || 0);
                      const pickInRound = Number(pick.pickInRound || pick.roundPickNumber || i + 1);
                      const teamName = teamMap[pick.teamId as number] || `Team ${pick.teamId}`;

                      return (
                        <div key={i} className="flex items-start gap-3 p-4 hover:bg-accent/30 transition-colors">
                          <div className="flex-shrink-0 text-center">
                            <p className="text-xs font-bold text-foreground">{overallPick > 0 ? overallPick : `${round}.${pickInRound}`}</p>
                            <p className="text-[10px] text-muted-foreground">#{pickInRound}</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 flex-shrink-0 ${colorClass}`}>{pos}</Badge>
                              {isKeeper && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 flex-shrink-0 border-yellow-500/40 text-yellow-400"><Star className="w-2 h-2 mr-0.5 inline" />K</Badge>}
                            </div>
                            <p className="text-sm font-medium text-foreground truncate">{String(pick.playerName || pick.name || "Unknown")}</p>
                            <p className="text-xs text-muted-foreground truncate">{teamName}</p>
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
