import React, { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SeasonSelector from "@/components/SeasonSelector";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react";

const RATING_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactElement; }> = {
  "Brutal":   { color: "text-red-400",     bg: "border-red-500/30 bg-red-500/10",     icon: <TrendingDown className="w-3.5 h-3.5 text-red-400" /> },
  "Hard":     { color: "text-orange-400",  bg: "border-orange-500/30 bg-orange-500/10", icon: <TrendingDown className="w-3.5 h-3.5 text-orange-400" /> },
  "Average":  { color: "text-blue-400",    bg: "border-blue-500/30 bg-blue-500/10",   icon: <Minus className="w-3.5 h-3.5 text-blue-400" /> },
  "Easy":     { color: "text-emerald-400", bg: "border-emerald-500/30 bg-emerald-500/10", icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> },
  "Cupcake":  { color: "text-yellow-400",  bg: "border-yellow-500/30 bg-yellow-500/10", icon: <TrendingUp className="w-3.5 h-3.5 text-yellow-400" /> },
};

interface SOSResult {
  teamId: number;
  ownerName: string;
  avgOpponentPF: number;
  scheduleRating: string;
  scheduleScore: number;
  playoffScheduleRating: string;
  sosTradingMultiplier: number;
  remainingMatchups: { week: number; opponentId: number; opponentOwner: string; }[];
}

export default function StrengthOfSchedule() {
  const [season, setSeason] = useState(2025);
  const [currentWeek, setCurrentWeek] = useState("8");
  const [sortBy, setSortBy] = useState<"hardest" | "easiest" | "playoff">("hardest");

  const { data: sosData, isLoading } = trpc.analytics.strengthOfSchedule.useQuery({
    season,
    currentWeek: parseInt(currentWeek),
    playoffStartWeek: 15,
  });

  const allTeams = (sosData as SOSResult[] | undefined) || [];

  const sorted = [...allTeams].sort((a, b) => {
    if (sortBy === "hardest") return b.scheduleScore - a.scheduleScore;
    if (sortBy === "easiest") return a.scheduleScore - b.scheduleScore;
    // playoff: sort by playoff schedule difficulty
    const ratingOrder: Record<string, number> = { Brutal: 5, Hard: 4, Average: 3, Easy: 2, Cupcake: 1 };
    return (ratingOrder[b.playoffScheduleRating] || 3) - (ratingOrder[a.playoffScheduleRating] || 3);
  });

  return (
    <AppLayout title="Strength of Schedule" subtitle="Remaining and playoff schedule difficulty — use for trade value adjustments">
      <div className="p-6 space-y-6">

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <SeasonSelector value={season} onChange={setSeason} />
          <Select value={currentWeek} onValueChange={setCurrentWeek}>
            <SelectTrigger className="w-32 h-9 text-sm border-border bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 17 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>Week {i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-44 h-9 text-sm border-border bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hardest">Hardest remaining</SelectItem>
              <SelectItem value="easiest">Easiest remaining</SelectItem>
              <SelectItem value="playoff">Playoff difficulty</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Trade value note */}
        <Card className="card-glow bg-card border-border border-blue-500/20">
          <CardContent className="pt-4 pb-4 text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Trade value adjustment: </strong>
            Easy schedule teams get a ×1.05–1.15 multiplier on player values in the Trade Analyzer — more wins = more playoff relevance.
            Brutal schedule teams get a ×0.85–0.95 discount. These multipliers are applied automatically when SOS data is available.
          </CardContent>
        </Card>

        {/* Data freshness warning */}
        <div className="text-xs text-yellow-400 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          SOS is derived from historical scoring — refresh ESPN data weekly for accuracy
        </div>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        )}

        {!isLoading && sorted.length === 0 && (
          <Card className="card-glow bg-card border-border">
            <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
              No schedule data available for {season}. Sync ESPN data first.
            </CardContent>
          </Card>
        )}

        {!isLoading && sorted.map((team, i) => {
          const cfg = RATING_CONFIG[team.scheduleRating] || RATING_CONFIG.Average;
          const playCfg = RATING_CONFIG[team.playoffScheduleRating] || RATING_CONFIG.Average;
          const multiplierColor = team.sosTradingMultiplier > 1
            ? "text-emerald-400"
            : team.sosTradingMultiplier < 1
            ? "text-red-400"
            : "text-muted-foreground";

          return (
            <Card key={team.teamId} className="card-glow bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-lg font-bold text-muted-foreground w-6 shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{team.ownerName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {team.remainingMatchups.length} games remaining · avg opponent {team.avgOpponentPF.toFixed(1)} ppg
                    </div>
                  </div>

                  {/* Remaining schedule rating */}
                  <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${cfg.bg}`}>
                    {cfg.icon}
                    <div>
                      <div className={`text-xs font-semibold ${cfg.color}`}>{team.scheduleRating}</div>
                      <div className="text-[10px] text-muted-foreground">Remaining</div>
                    </div>
                  </div>

                  {/* Playoff schedule rating */}
                  <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${playCfg.bg}`}>
                    {playCfg.icon}
                    <div>
                      <div className={`text-xs font-semibold ${playCfg.color}`}>{team.playoffScheduleRating}</div>
                      <div className="text-[10px] text-muted-foreground">Playoffs</div>
                    </div>
                  </div>

                  {/* Trading multiplier */}
                  <div className="text-center shrink-0">
                    <div className={`text-base font-bold ${multiplierColor}`}>
                      ×{team.sosTradingMultiplier.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Trade adj.</div>
                  </div>
                </div>

                {/* Score bar */}
                <div className="mt-3">
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        team.scheduleScore >= 70 ? "bg-red-500"
                        : team.scheduleScore >= 55 ? "bg-orange-500"
                        : team.scheduleScore >= 40 ? "bg-blue-500"
                        : "bg-emerald-500"
                      }`}
                      style={{ width: `${team.scheduleScore}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>Easy</span>
                    <span>Difficulty score {team.scheduleScore}/100</span>
                    <span>Brutal</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppLayout>
  );
}
