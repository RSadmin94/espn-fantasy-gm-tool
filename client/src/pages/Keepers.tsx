import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star } from "lucide-react";

const POS_MAP: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };
const POS_COLORS: Record<string, string> = {
  QB: "text-red-400 border-red-500/30 bg-red-500/10",
  RB: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  WR: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  TE: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  "D/ST": "text-purple-400 border-purple-500/30 bg-purple-500/10",
  K: "text-orange-400 border-orange-500/30 bg-orange-500/10",
};

export default function Keepers() {
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterSeason, setFilterSeason] = useState<string>("all");

  const { data: keepers, isLoading } = trpc.espn.keeperHistory.useQuery();

  const allKeepers = (keepers as Record<string, unknown>[]) || [];

  // Get unique teams and seasons
  const teamNames = Array.from(new Set(allKeepers.map((k) => String(k.teamName || "")))).sort();
  const seasons = Array.from(new Set(allKeepers.map((k) => Number(k.season || 0)))).sort((a, b) => b - a);

  const filtered = allKeepers.filter((k) => {
    if (filterTeam !== "all" && String(k.teamName || "") !== filterTeam) return false;
    if (filterSeason !== "all" && Number(k.season || 0) !== Number(filterSeason)) return false;
    return true;
  });

  // Group by season
  const bySeason: Record<number, Record<string, unknown>[]> = {};
  for (const k of filtered) {
    const s = Number(k.season || 0);
    if (!bySeason[s]) bySeason[s] = [];
    bySeason[s].push(k);
  }

  return (
    <AppLayout title="Keeper Tracker" subtitle="Keeper selections across all 18 seasons">
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Select value={filterSeason} onValueChange={setFilterSeason}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Seasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Seasons</SelectItem>
              {seasons.map((s) => (
                <SelectItem key={s} value={String(s)}>{s} Season</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterTeam} onValueChange={setFilterTeam}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teamNames.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-sm text-muted-foreground">
            {filtered.length} keeper{filtered.length !== 1 ? "s" : ""} found
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No keeper data found. Load season data via Data Refresh.</p>
            <p className="text-xs mt-1">Keepers are identified from draft picks marked as keeper selections.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(bySeason).sort(([a], [b]) => Number(b) - Number(a)).map(([season, seasonKeepers]) => (
              <Card key={season} className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    {season} Keepers
                    <Badge variant="outline" className="ml-auto text-xs">{seasonKeepers.length} total</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 divide-y sm:divide-y-0 border-t border-border">
                    {(seasonKeepers as Record<string, unknown>[]).map((k, i) => {
                      const pos = POS_MAP[k.defaultPositionId as number] || "—";
                      const colorClass = POS_COLORS[pos] || "text-muted-foreground border-border bg-muted/20";
                      const round = Number(k.roundId || k.round || 0);
                      const pick = Number(k.roundPickNumber || k.pickInRound || 0);
                      return (
                        <div key={i} className="flex items-start gap-3 p-4 hover:bg-accent/30 transition-colors border-b border-border last:border-b-0 sm:border-r">
                          <div className="flex-shrink-0">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${colorClass}`}>{pos}</Badge>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{String(k.playerName || k.name || "Unknown")}</p>
                            <p className="text-xs text-muted-foreground truncate">{String(k.teamName || "")}</p>
                            {round > 0 && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">Kept at Rd {round}, Pk {pick}</p>
                            )}
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
