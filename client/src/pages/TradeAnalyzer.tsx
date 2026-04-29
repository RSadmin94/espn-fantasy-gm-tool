import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SeasonSelector from "@/components/SeasonSelector";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Streamdown } from "streamdown";
import { ArrowLeftRight, Plus, X, Minus, Brain, Scale, Loader2, ChevronRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

const POS_MAP: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };
const POS_COLORS: Record<string, string> = {
  QB: "text-red-400 border-red-500/30", RB: "text-emerald-400 border-emerald-500/30",
  WR: "text-blue-400 border-blue-500/30", TE: "text-yellow-400 border-yellow-500/30",
  "D/ST": "text-purple-400 border-purple-500/30", K: "text-orange-400 border-orange-500/30",
};

const QUICK_TRADES = [
  { label: "RB for WR swap", descA: "RB1 + WR3", descB: "WR1 + RB3" },
  { label: "Star for depth", descA: "Elite WR1", descB: "WR2 + RB2 + TE1" },
  { label: "QB + pick for RB", descA: "QB1 + 2026 pick", descB: "RB1" },
];

export default function TradeAnalyzer() {
  const [season, setSeason] = useState(2025);
  const [teamA, setTeamA] = useState<number | undefined>(undefined);
  const [teamB, setTeamB] = useState<number | undefined>(undefined);
  const [sideA, setSideA] = useState<Record<string, unknown>[]>([]);
  const [sideB, setSideB] = useState<Record<string, unknown>[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { isAuthenticated } = useAuth();
  const { data: teams } = trpc.espn.teams.useQuery({ season });
  const { data: rostersA } = trpc.espn.rosters.useQuery({ season, teamId: teamA! }, { enabled: teamA !== undefined });
  const { data: rostersB } = trpc.espn.rosters.useQuery({ season, teamId: teamB! }, { enabled: teamB !== undefined });
  const chatMutation = trpc.advisor.chat.useMutation();

  const teamList = (teams as Record<string, unknown>[]) || [];
  const playersA = (rostersA as Record<string, unknown>[]) || [];
  const playersB = (rostersB as Record<string, unknown>[]) || [];

  const togglePlayer = (player: Record<string, unknown>, side: "A" | "B") => {
    const setter = side === "A" ? setSideA : setSideB;
    const current = side === "A" ? sideA : sideB;
    const exists = current.find((p) => p.playerId === player.playerId);
    setter(exists ? current.filter((p) => p.playerId !== player.playerId) : [...current, player]);
  };

  const analyzeTrade = async () => {
    if (!isAuthenticated) { window.location.href = getLoginUrl(); return; }
    if (sideA.length === 0 || sideB.length === 0) { toast.error("Select at least one player from each side"); return; }
    setLoading(true);
    setAnalysis(null);
    const teamAName = String(teamList.find((t) => t.teamId === teamA)?.teamName || "Team A");
    const teamBName = String(teamList.find((t) => t.teamId === teamB)?.teamName || "Team B");
    const prompt = `TRADE ANALYSIS — PPR 14-Team Keeper League (ATLANTAS FINEST FF, ${season} Season)

**${teamAName} gives:**
${sideA.map((p) => `- ${p.playerName} (${POS_MAP[p.defaultPositionId as number] || "?"})`).join("\n")}

**${teamBName} gives:**
${sideB.map((p) => `- ${p.playerName} (${POS_MAP[p.defaultPositionId as number] || "?"})`).join("\n")}

Provide a comprehensive trade analysis including:

1. **Trade Fairness Score** — Rate each side's value (1-10) with a brief justification
2. **Winner Analysis** — Who wins this trade and why (be decisive)
3. **Positional Impact** — How does this affect each team's roster construction?
4. **PPR Scoring Impact** — How does this trade affect weekly PPR scoring for each team?
5. **Keeper Value** — Any long-term keeper implications for either team?
6. **Roster Fit** — Does this trade address each team's actual needs?
7. **Verdict** — Should either team make this trade? Clear YES/NO for each side.

This is a 14-team PPR keeper league. Positional scarcity and keeper value matter significantly.`;
    try {
      const res = await chatMutation.mutateAsync({ message: prompt, season });
      setAnalysis(res.message);
    } catch {
      toast.error("Trade analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => { setSideA([]); setSideB([]); setAnalysis(null); };

  return (
    <AppLayout title="Trade Analyzer" subtitle="AI-powered trade evaluation with fairness scoring and keeper value analysis">
      <div className="p-6 space-y-6">
        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <SeasonSelector value={season} onChange={(s) => { setSeason(s); setTeamA(undefined); setTeamB(undefined); clearAll(); }} />
          <div className="ml-auto flex items-center gap-2">
            {(sideA.length > 0 || sideB.length > 0) && (
              <Button variant="outline" size="sm" onClick={clearAll} className="text-xs border-border">
                <X className="w-3 h-3 mr-1" /> Clear Trade
              </Button>
            )}
          </div>
        </div>

        {/* Quick trade templates */}
        <Card className="card-glow bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trade Templates</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {QUICK_TRADES.map((t) => (
              <div key={t.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-accent/30 text-xs">
                <span className="text-foreground font-medium">{t.label}:</span>
                <span className="text-muted-foreground">{t.descA}</span>
                <ArrowLeftRight className="w-3 h-3 text-primary" />
                <span className="text-muted-foreground">{t.descB}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Team panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TeamTradePanel
            label="Team A — Gives"
            teams={teamList}
            selectedTeamId={teamA}
            onSelectTeam={(id) => { setTeamA(id); setSideA([]); }}
            players={playersA}
            selected={sideA}
            onToggle={(p) => togglePlayer(p, "A")}
          />
          <TeamTradePanel
            label="Team B — Gives"
            teams={teamList}
            selectedTeamId={teamB}
            onSelectTeam={(id) => { setTeamB(id); setSideB([]); }}
            players={playersB}
            selected={sideB}
            onToggle={(p) => togglePlayer(p, "B")}
          />
        </div>

        {/* Trade summary + analyze button */}
        {(sideA.length > 0 || sideB.length > 0) && (
          <Card className="card-glow bg-card border-border border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Scale className="w-4 h-4 text-primary" />
                Trade Summary
                <Badge className="ml-auto text-[9px] px-1.5 espn-gradient text-white border-0">
                  {sideA.length}v{sideB.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6 mb-4">
                {[{ side: sideA, label: teamList.find((t) => t.teamId === teamA)?.teamName || "Team A", toggle: (p: Record<string, unknown>) => togglePlayer(p, "A") },
                  { side: sideB, label: teamList.find((t) => t.teamId === teamB)?.teamName || "Team B", toggle: (p: Record<string, unknown>) => togglePlayer(p, "B") }].map(({ side, label, toggle }) => (
                  <div key={String(label)}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{String(label)} sends</p>
                    {side.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No players selected</p>
                    ) : (
                      <div className="space-y-1">
                        {side.map((p, i) => {
                          const pos = POS_MAP[p.defaultPositionId as number] || "?";
                          return (
                            <div key={i} className="flex items-center gap-2 py-1">
                              <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 border ${POS_COLORS[pos] || "border-border text-muted-foreground"}`}>{pos}</Badge>
                              <span className="text-sm text-foreground flex-1">{String(p.playerName || "")}</span>
                              <button onClick={() => toggle(p)} className="text-muted-foreground hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button onClick={analyzeTrade} disabled={loading || sideA.length === 0 || sideB.length === 0} className="espn-gradient text-white border-0">
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</> : <><Brain className="w-4 h-4 mr-2" /> Analyze with AI</>}
                </Button>
                <Button variant="outline" onClick={clearAll} className="border-border">Clear</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Analysis */}
        {(loading || analysis) && (
          <Card className="card-glow bg-card border-border border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                AI Trade Analysis
                <Badge className="ml-1 text-[9px] px-1.5 espn-gradient text-white border-0">AI</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
              ) : analysis ? (
                <div className="prose prose-sm prose-invert max-w-none">
                  <Streamdown>{analysis}</Streamdown>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {sideA.length === 0 && sideB.length === 0 && !analysis && (
          <Card className="card-glow bg-card border-border">
            <CardContent className="py-12 flex flex-col items-center justify-center text-center gap-3">
              <ArrowLeftRight className="w-12 h-12 text-primary/30" />
              <p className="text-sm font-medium text-foreground">Build Your Trade</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Select two teams above, then click players from each roster to add them to the trade. The AI will evaluate fairness, positional impact, and keeper value.
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <ChevronRight className="w-3 h-3 text-primary" />
                <span>Select Team A</span>
                <ChevronRight className="w-3 h-3 text-primary" />
                <span>Select Team B</span>
                <ChevronRight className="w-3 h-3 text-primary" />
                <span>Pick players</span>
                <ChevronRight className="w-3 h-3 text-primary" />
                <span>Analyze</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function TeamTradePanel({ label, teams, selectedTeamId, onSelectTeam, players, selected, onToggle }: {
  label: string;
  teams: Record<string, unknown>[];
  selectedTeamId: number | undefined;
  onSelectTeam: (id: number) => void;
  players: Record<string, unknown>[];
  selected: Record<string, unknown>[];
  onToggle: (p: Record<string, unknown>) => void;
}) {
  const starters = players.filter((p) => { const slot = p.lineupSlotId as number; return slot !== 20 && slot !== 21; });
  return (
    <Card className="card-glow bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{label}</CardTitle>
        <Select value={selectedTeamId ? String(selectedTeamId) : ""} onValueChange={(v) => onSelectTeam(Number(v))}>
          <SelectTrigger className="w-full mt-2"><SelectValue placeholder="Select a team..." /></SelectTrigger>
          <SelectContent>
            {teams.map((t) => <SelectItem key={String(t.teamId)} value={String(t.teamId)}>{String(t.teamName || "")}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-0 max-h-80 overflow-y-auto">
        {starters.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            {selectedTeamId ? "No roster data available" : "Select a team above"}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {starters.map((player, i) => {
              const isSelected = selected.some((p) => p.playerId === player.playerId);
              const pos = POS_MAP[player.defaultPositionId as number] || "?";
              const colorClass = POS_COLORS[pos] || "border-border text-muted-foreground";
              return (
                <button key={i} onClick={() => onToggle(player)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isSelected ? "bg-primary/15 border-l-2 border-l-primary" : "hover:bg-accent/40"}`}>
                  <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 flex-shrink-0 border ${colorClass}`}>{pos}</Badge>
                  <span className="flex-1 text-sm text-foreground truncate">{String(player.playerName || "Unknown")}</span>
                  {isSelected ? <Minus className="w-3.5 h-3.5 text-primary flex-shrink-0" /> : <Plus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
