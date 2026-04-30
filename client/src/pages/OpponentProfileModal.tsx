import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Streamdown } from "streamdown";
import {
  Trophy, TrendingUp, TrendingDown, Minus, Activity, Brain,
  Target, AlertTriangle, CheckCircle, Loader2, Zap, BarChart2,
  Swords, Shield, Star
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  LineChart, Line
} from "recharts";

interface OpponentProfileModalProps {
  memberId: string | null;
  ownerName: string;
  onClose: () => void;
}

const ARCHETYPE_COLORS: Record<string, string> = {
  "Waiver Grinder": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Trade Shark": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Active Trader": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Hyper-Active GM": "bg-red-500/20 text-red-400 border-red-500/30",
  "Consistent Contender": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Patient Builder": "bg-teal-500/20 text-teal-400 border-teal-500/30",
  "Steady Manager": "bg-slate-500/20 text-slate-400 border-slate-500/30",
  "Passive Drafter": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  "Balanced Manager": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "Struggling Manager": "bg-red-500/20 text-red-400 border-red-500/30",
  "Boom-or-Bust": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "Rising Threat": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Steady Climber": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Trade-First Builder": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Frustrated Seller": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Waiver Dependent": "bg-red-500/20 text-red-400 border-red-500/30",
  "Complete Manager": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Set-It-and-Forget-It": "bg-slate-500/20 text-slate-400 border-slate-500/30",
  "Draft-and-Hold": "bg-slate-500/20 text-slate-400 border-slate-500/30",
  "Pure Drafter": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  "Steady Operator": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "Buy-Low Target": "bg-green-500/20 text-green-400 border-green-500/30",
  "Volatile Drafter": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "Aggressive Improver": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Improving Manager": "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export function OpponentProfileModal({ memberId, ownerName, onClose }: OpponentProfileModalProps) {
  const [scoutingReport, setScoutingReport] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data, isLoading } = trpc.opponentProfile.useQuery(
    { memberId: memberId! },
    { enabled: !!memberId }
  );

  const scoutMutation = trpc.opponentScoutingReport.useMutation({
    onSuccess: (result) => {
      setScoutingReport(typeof result.report === "string" ? result.report : String(result.report));
      setIsGenerating(false);
    },
    onError: () => {
      setScoutingReport("Scouting report generation failed. Please try again.");
      setIsGenerating(false);
    },
  });

  const handleGenerateReport = () => {
    if (!memberId) return;
    setIsGenerating(true);
    setScoutingReport(null);
    scoutMutation.mutate({ memberId });
  };

  const winPct = data ? Math.round((data.career.wins / (data.career.wins + data.career.losses)) * 100) : 0;
  const h2hEdge = data ? (data.h2hVsRod.losses > data.h2hVsRod.wins ? "ROD LEADS" : data.h2hVsRod.wins > data.h2hVsRod.losses ? "THEY LEAD" : "TIED") : "";
  const h2hColor = h2hEdge === "ROD LEADS" ? "text-emerald-400" : h2hEdge === "THEY LEAD" ? "text-red-400" : "text-yellow-400";

  const archetypeColor = data ? (ARCHETYPE_COLORS[data.gmArchetype] ?? "bg-slate-500/20 text-slate-400 border-slate-500/30") : "";

  const activityData = data?.seasons.map(s => ({
    season: String(s.season).slice(2),
    adds: s.acquisitions,
    trades: s.trades,
    wins: s.wins,
  })) ?? [];

  const recordData = data?.seasons.map(s => ({
    season: String(s.season).slice(2),
    wins: s.wins,
    losses: s.losses,
    pf: Math.round(s.pf),
  })) ?? [];

  return (
    <Dialog open={!!memberId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-foreground">
                {ownerName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-base font-bold text-foreground">{ownerName}</p>
              <p className="text-xs text-muted-foreground font-normal">Opponent Scouting Profile</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Loading profile...</span>
          </div>
        )}

        {data && (
          <Tabs defaultValue="career" className="w-full">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 mb-4">
              <TabsTrigger value="career" className="text-xs">Career Record</TabsTrigger>
              <TabsTrigger value="activity" className="text-xs">GM Activity</TabsTrigger>
              <TabsTrigger value="strengths" className="text-xs">Strengths & Weaknesses</TabsTrigger>
              <TabsTrigger value="scouting" className="text-xs">AI Scouting Report</TabsTrigger>
            </TabsList>

            {/* -- CAREER RECORD TAB -- */}
            <TabsContent value="career" className="space-y-4">
              {/* Career header stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xl font-bold text-foreground">{data.career.wins}W–{data.career.losses}L</p>
                    <p className="text-xs text-muted-foreground">Career Record</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xl font-bold text-primary">{winPct}%</p>
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className={`text-xl font-bold ${h2hColor}`}>{data.h2hVsRod.wins}–{data.h2hVsRod.losses}</p>
                    <p className="text-xs text-muted-foreground">H2H vs Rod</p>
                    <p className={`text-[10px] font-semibold ${h2hColor}`}>{h2hEdge}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xl font-bold text-yellow-400">{data.career.playoffSeasons}/{data.seasons.length}</p>
                    <p className="text-xs text-muted-foreground">Playoff Seasons</p>
                  </CardContent>
                </Card>
              </div>

              {/* Season-by-season record chart */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-primary" />
                    Season-by-Season Record
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={recordData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="season" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                        labelFormatter={(v) => `20${v}`}
                      />
                      <Bar dataKey="wins" name="Wins" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="losses" name="Losses" fill="hsl(var(--muted-foreground))" radius={[2, 2, 0, 0]} opacity={0.5} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Season table */}
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Season</th>
                          <th className="text-center px-3 py-2 text-muted-foreground font-medium">Record</th>
                          <th className="text-center px-3 py-2 text-muted-foreground font-medium">PF</th>
                          <th className="text-center px-3 py-2 text-muted-foreground font-medium">Seed</th>
                          <th className="text-center px-3 py-2 text-muted-foreground font-medium">Adds</th>
                          <th className="text-center px-3 py-2 text-muted-foreground font-medium">Trades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.seasons.slice().reverse().map((s) => (
                          <tr key={s.season} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                            <td className="px-3 py-2 font-medium text-foreground">{s.season}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`font-semibold ${s.wins > s.losses ? "text-emerald-400" : s.wins < s.losses ? "text-red-400" : "text-yellow-400"}`}>
                                {s.wins}–{s.losses}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{s.pf.toLocaleString()}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`${s.seed <= 3 ? "text-yellow-400 font-semibold" : s.seed <= 7 ? "text-emerald-400" : "text-muted-foreground"}`}>
                                #{s.seed}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{s.acquisitions}</td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{s.trades}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* -- GM ACTIVITY TAB -- */}
            <TabsContent value="activity" className="space-y-4">
              {/* Archetype */}
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                      <Activity className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-foreground">GM Archetype</p>
                        <Badge variant="outline" className={`text-[10px] px-2 ${archetypeColor}`}>
                          {data.gmArchetype}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{data.gmArchetypeDesc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Activity stats */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xl font-bold text-blue-400">{data.avgAcquisitions}</p>
                    <p className="text-xs text-muted-foreground">Adds/Season</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xl font-bold text-purple-400">{data.avgTrades}</p>
                    <p className="text-xs text-muted-foreground">Trades/Season</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm font-bold text-foreground">{data.draftStyleBadge}</p>
                    <p className="text-xs text-muted-foreground">Draft Style</p>
                  </CardContent>
                </Card>
              </div>

              {/* Draft style description */}
              <Card className="bg-accent/30 border-border">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground leading-relaxed">{data.draftStyleDesc}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Activity chart */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <BarChart2 className="w-3.5 h-3.5 text-primary" />
                    Season Activity — Adds & Trades
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={activityData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="season" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                        labelFormatter={(v) => `20${v}`}
                      />
                      <Bar dataKey="adds" name="Adds" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="trades" name="Trades" fill="#a855f7" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            {/* -- STRENGTHS & WEAKNESSES TAB -- */}
            <TabsContent value="strengths" className="space-y-3">
              {/* Strengths */}
              <div>
                <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Strengths
                </p>
                <div className="space-y-2">
                  {data.strengthsWeaknesses.filter(s => s.type === "strength").map((s, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground leading-relaxed">{s.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weaknesses */}
              <div>
                <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Weaknesses
                </p>
                <div className="space-y-2">
                  {data.strengthsWeaknesses.filter(s => s.type === "weakness").map((s, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground leading-relaxed">{s.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Blind spots */}
              <div>
                <p className="text-xs font-semibold text-yellow-400 mb-2 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Blind Spots
                </p>
                <div className="space-y-2">
                  {data.strengthsWeaknesses.filter(s => s.type === "blindspot").map((s, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground leading-relaxed">{s.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* H2H summary */}
              <Card className={`border ${data.h2hVsRod.losses > data.h2hVsRod.wins ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Swords className={`w-4 h-4 flex-shrink-0 ${data.h2hVsRod.losses > data.h2hVsRod.wins ? "text-emerald-400" : "text-red-400"}`} />
                    <div>
                      <p className={`text-xs font-semibold ${data.h2hVsRod.losses > data.h2hVsRod.wins ? "text-emerald-400" : "text-red-400"}`}>
                        Head-to-Head vs Rod: {data.h2hVsRod.losses}–{data.h2hVsRod.wins} ({h2hEdge})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {data.h2hVsRod.losses > data.h2hVsRod.wins
                          ? "You have the historical edge in this matchup."
                          : data.h2hVsRod.wins > data.h2hVsRod.losses
                          ? "They have the historical edge — study their tendencies."
                          : "Even matchup historically — every game matters."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* -- AI SCOUTING REPORT TAB -- */}
            <TabsContent value="scouting" className="space-y-4">
              {!scoutingReport && !isGenerating && (
                <Card className="bg-card border-border">
                  <CardContent className="p-6 text-center">
                    <Brain className="w-10 h-10 text-primary mx-auto mb-3" />
                    <p className="text-sm font-semibold text-foreground mb-1">AI Scouting Report</p>
                    <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
                      Generate a detailed tactical scouting report on {ownerName} — threat level, career narrative, how to beat them, trade strategy, draft day intel, and a 2026 prediction.
                    </p>
                    <Button onClick={handleGenerateReport} className="espn-gradient text-white border-0 text-xs">
                      <Brain className="w-3.5 h-3.5 mr-1.5" />
                      Generate Scouting Report
                    </Button>
                  </CardContent>
                </Card>
              )}

              {isGenerating && (
                <Card className="bg-card border-border">
                  <CardContent className="p-6 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Analyzing {ownerName}'s career data...</p>
                  </CardContent>
                </Card>
              )}

              {scoutingReport && (
                <div className="space-y-3">
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-primary" />
                        Scouting Report — {ownerName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed">
                        <Streamdown>{scoutingReport}</Streamdown>
                      </div>
                    </CardContent>
                  </Card>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateReport}
                    className="w-full text-xs"
                  >
                    <Brain className="w-3.5 h-3.5 mr-1.5" />
                    Regenerate Report
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
