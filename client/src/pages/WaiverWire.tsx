import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SeasonSelector from "@/components/SeasonSelector";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { Search, TrendingUp, Brain, Loader2, Star, Zap, DollarSign } from "lucide-react";

const POS_FILTER_OPTIONS = ["All", "QB", "RB", "WR", "TE", "K", "D/ST"];
const POS_ID_MAP: Record<string, number[]> = { QB: [1], RB: [2], WR: [3], TE: [4], K: [5], "D/ST": [16] };
const POS_COLORS: Record<string, string> = {
  QB: "text-red-400 border-red-500/30 bg-red-500/10",
  RB: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  WR: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  TE: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  "D/ST": "text-purple-400 border-purple-500/30 bg-purple-500/10",
  K: "text-orange-400 border-orange-500/30 bg-orange-500/10",
};
const POS_MAP: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };

const BLIND_SPOTS = [
  { name: "Streaming RB with clear path to starts", pos: "RB", note: "Handcuff with starter injury", priority: "HIGH" },
  { name: "Slot WR with 8+ targets per game", pos: "WR", note: "PPR gold — high floor", priority: "HIGH" },
  { name: "Streaming QB vs weak pass defense", pos: "QB", note: "14-team leagues run out of QBs fast", priority: "MEDIUM" },
  { name: "TE with red zone role and 4+ targets", pos: "TE", note: "Even 4-5 targets/game is elite in 14-team", priority: "MEDIUM" },
  { name: "Emerging RB2 change-of-pace back", pos: "RB", note: "Injury insurance + upside", priority: "MEDIUM" },
  { name: "Kicker on high-scoring offense", pos: "K", note: "Streaming K on dome team", priority: "LOW" },
  { name: "D/ST vs turnover-prone QB", pos: "D/ST", note: "Week-to-week streaming based on matchup", priority: "LOW" },
];

const FAAB_GUIDE = [
  { tier: "Starter Upgrade (RB1/WR1)", range: "$40–$60", note: "Bid aggressively — starters win leagues" },
  { tier: "Handcuff / RB2 Upgrade", range: "$20–$35", note: "High value, bid confidently" },
  { tier: "WR2 / Flex Upgrade", range: "$15–$25", note: "Solid contributor, don't overpay" },
  { tier: "Streaming QB / TE", range: "$5–$15", note: "Weekly streaming, keep budget" },
  { tier: "Lottery Ticket / Flier", range: "$1–$5", note: "High upside, minimal cost" },
  { tier: "Handcuff / Stash", range: "$1–$3", note: "Injury insurance, minimal spend" },
];

export default function WaiverWire() {
  const { isAuthenticated } = useAuth();
  const [season, setSeason] = useState(2025);
  const [posFilter, setPosFilter] = useState("All");
  const [playerQuery, setPlayerQuery] = useState("");
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeBlindSpot, setActiveBlindSpot] = useState<string | null>(null);

  const { data: freeAgents, isLoading: faLoading } = trpc.espn.freeAgents.useQuery({ season });
  const chatMutation = trpc.advisor.chat.useMutation();

  const allFAs = ((freeAgents as Record<string, unknown>[]) || []).filter(Boolean);
  const filtered = posFilter === "All"
    ? allFAs
    : allFAs.filter((p) => (POS_ID_MAP[posFilter] || []).includes(Number(p.position || 0)));
  const sorted = [...filtered].sort((a, b) => Number(b.percentOwned || 0) - Number(a.percentOwned || 0));

  const analyzePlayer = async (playerName?: string) => {
    const query = playerName ?? playerQuery.trim();
    if (!query) { toast.error("Enter a player name to analyze."); return; }
    if (!isAuthenticated) { toast.error("Please sign in to use the AI Advisor."); return; }
    setLoading(true);
    setReport(null);
    setActiveBlindSpot(playerName ?? null);
    const prompt = `WAIVER WIRE SCOUTING REPORT — PPR 14-Team League (ATLANTAS FINEST FF)

Player/Target: ${query}

Generate a comprehensive waiver wire scouting report for this player in a 14-team PPR keeper league. Include:

1. **Current Role & Usage** — snap count, target share, carry share, red zone usage
2. **PPR Value Assessment** — floor, ceiling, weekly consistency
3. **Matchup Analysis** — upcoming schedule quality (next 3 weeks)
4. **Roster Fit** — which roster types benefit most from adding this player
5. **FAAB Bid Recommendation** — suggested bid range with justification
6. **Keeper Potential** — is this player worth stashing for future seasons?
7. **Verdict** — ADD NOW / ADD IF AVAILABLE / MONITOR / PASS

Be specific and decisive. This is a 14-team PPR keeper league where depth is critical.`;
    try {
      const res = await chatMutation.mutateAsync({ message: prompt, season: 2025 });
      setReport(res.message);
    } catch {
      toast.error("Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout title="Waiver Wire Tracker" subtitle="AI scouting reports, FAAB strategy, and league blind spots">
      <div className="p-6 space-y-6">
        {/* Player search */}
        <Card className="card-glow bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" />
              AI Player Scouting Report
              <Badge className="ml-1 text-[9px] px-1.5 espn-gradient text-white border-0">AI</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={playerQuery}
                onChange={(e) => setPlayerQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") analyzePlayer(); }}
                placeholder="Enter any player name for a full AI scouting report with FAAB bid recommendation..."
                className="flex-1 bg-accent border-border text-sm"
              />
              <Button onClick={() => analyzePlayer()} disabled={loading || !playerQuery.trim()} className="espn-gradient text-white border-0 flex-shrink-0">
                {loading && !activeBlindSpot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span className="ml-2 hidden sm:inline">Analyze</span>
              </Button>
            </div>
            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground mt-2">
                <button className="text-primary underline" onClick={() => window.location.href = getLoginUrl()}>Sign in</button> to use AI scouting reports
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="space-y-4">
            {/* League blind spots */}
            <Card className="card-glow bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  League Blind Spots
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {BLIND_SPOTS.map((bs) => (
                  <button
                    key={bs.name}
                    onClick={() => analyzePlayer(bs.name)}
                    disabled={loading}
                    className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all group"
                  >
                    <Badge variant="outline" className={`text-[9px] px-1 border flex-shrink-0 mt-0.5 ${bs.priority === "HIGH" ? "border-red-500/30 text-red-400" : bs.priority === "MEDIUM" ? "border-yellow-500/30 text-yellow-400" : "border-slate-500/30 text-slate-400"}`}>{bs.pos}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{bs.name}</p>
                      <p className="text-[10px] text-muted-foreground">{bs.note}</p>
                    </div>
                    {loading && activeBlindSpot === bs.name && <Loader2 className="w-3 h-3 animate-spin text-primary flex-shrink-0 mt-0.5" />}
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Available free agents */}
            <Card className="card-glow bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Free Agents
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <SeasonSelector value={season} onChange={setSeason} className="w-28" />
                    <Select value={posFilter} onValueChange={setPosFilter}>
                      <SelectTrigger className="w-20 h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{POS_FILTER_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {faLoading ? (
                  <div className="px-4 pb-3 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : sorted.length > 0 ? (
                  <div className="divide-y divide-border max-h-72 overflow-y-auto">
                    {sorted.slice(0, 30).map((player, i) => {
                      const posId = Number(player.position || 0);
                      const pos = POS_MAP[posId] || "?";
                      const colorClass = POS_COLORS[pos] || "text-muted-foreground border-border";
                      return (
                        <button key={i} onClick={() => analyzePlayer(String(player.playerName || ""))} className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-accent/50 transition-colors group">
                          <Badge variant="outline" className={`text-[9px] px-1 border flex-shrink-0 ${colorClass}`}>{pos}</Badge>
                          <p className="text-xs text-foreground group-hover:text-primary transition-colors truncate flex-1">{String(player.playerName || "")}</p>
                          <p className="text-[10px] text-muted-foreground flex-shrink-0">{Number(player.percentOwned || 0).toFixed(0)}%</p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-4 py-4 text-xs text-muted-foreground">No free agent data. Refresh season data first.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Report + FAAB guide */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="card-glow bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  AI Scouting Report
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
                ) : report ? (
                  <div className="prose prose-sm prose-invert max-w-none"><Streamdown>{report}</Streamdown></div>
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center text-center gap-3">
                    <Search className="w-10 h-10 text-primary/30" />
                    <p className="text-sm font-medium text-foreground">Search for a Player</p>
                    <p className="text-xs text-muted-foreground max-w-xs">Enter any player name or click a League Blind Spot to get a full AI scouting report with FAAB bid recommendation.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="card-glow bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  FAAB Bid Strategy Guide
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 text-muted-foreground font-semibold">Player Tier</th>
                        <th className="text-left py-2 pr-4 text-muted-foreground font-semibold">Bid Range</th>
                        <th className="text-left py-2 text-muted-foreground font-semibold">Strategy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {FAAB_GUIDE.map((r) => (
                        <tr key={r.tier} className="hover:bg-accent/30 transition-colors">
                          <td className="py-2.5 pr-4 font-medium text-foreground">{r.tier}</td>
                          <td className="py-2.5 pr-4"><Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">{r.range}</Badge></td>
                          <td className="py-2.5 text-muted-foreground">{r.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 p-2.5 rounded-lg bg-accent/40 border border-border">
                  <p className="text-[10px] text-muted-foreground">
                    <Zap className="w-3 h-3 inline mr-1 text-yellow-400" />
                    <strong className="text-foreground">14-Team Rule:</strong> Budget scarcity is real. Spend big on starters, save $1–$3 bids for speculative adds. Never go $0 on a player you actually want.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
