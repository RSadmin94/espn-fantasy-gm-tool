import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SeasonSelector from "@/components/SeasonSelector";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { Brain, Zap, CheckCircle, XCircle, Loader2, ChevronRight, BarChart2 } from "lucide-react";

const QUICK_SCENARIOS = [
  {
    label: "RB1 vs tough run D",
    player1: "Saquon Barkley",
    player2: "Derrick Henry",
    context: "Week 8 PPR. Barkley vs top-5 run D, road game. Henry vs weak run D, home game.",
  },
  {
    label: "WR vs shutdown CB",
    player1: "CeeDee Lamb",
    player2: "Amon-Ra St. Brown",
    context: "Lamb is being shadowed by shutdown CB. St. Brown is slot receiver with high target share vs soft secondary.",
  },
  {
    label: "Streaming TE",
    player1: "Trey McBride",
    player2: "Tyler Warren",
    context: "PPR TE decision. Both are solid starters. Which has the better floor this week?",
  },
];

const PPR_RULES = [
  { position: "QB", scoring: "4 pts/TD pass, 1 pt/25 yds passing, 6 pts/rush TD, 1 pt/10 rush yds" },
  { position: "RB", scoring: "6 pts/rush TD, 1 pt/10 rush yds, 1 pt/reception, 6 pts/rec TD" },
  { position: "WR", scoring: "6 pts/rec TD, 1 pt/10 rec yds, 1 pt/reception" },
  { position: "TE", scoring: "6 pts/rec TD, 1 pt/10 rec yds, 1 pt/reception" },
  { position: "K", scoring: "3 pts/FG (0-39 yds), 4 pts/FG (40-49 yds), 5 pts/FG (50+ yds)" },
  { position: "D/ST", scoring: "Points allowed tiers, sacks (1 pt), INTs (2 pts), TDs (6 pts)" },
];

const POS_COLORS: Record<string, string> = {
  QB: "text-red-400 border-red-500/30 bg-red-500/10",
  RB: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  WR: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  TE: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
};

export default function StartSit() {
  const { isAuthenticated } = useAuth();
  const [season, setSeason] = useState(2025);
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState<"START_1" | "START_2" | "TOSS_UP" | null>(null);
  const [mathContext, setMathContext] = useState<{
    p1Vorp?: number; p2Vorp?: number;
    p1Ros?: number; p2Ros?: number;
    p1Pos?: string; p2Pos?: string;
  } | null>(null);

  const chatMutation = trpc.advisor.chat.useMutation();
  const { data: vorpData } = trpc.analytics.vorp.useQuery({ season });
  const { data: rosData } = trpc.analytics.rosValues.useQuery({ season });

  const findPlayerFacts = (name: string) => {
    const nameLower = name.toLowerCase().trim();
    const vorp = (vorpData as Record<string, unknown>[] | undefined)?.find(v =>
      String(v.playerName || "").toLowerCase().includes(nameLower.split(" ")[0] || "")
    );
    const ros = (rosData as Record<string, unknown>[] | undefined)?.find(r =>
      String(r.playerName || "").toLowerCase().includes(nameLower.split(" ")[0] || "")
    );
    return {
      vorp: vorp ? (vorp.vorp as number) : null,
      vorpTier: vorp ? (vorp.vorpTier as string) : null,
      avgPoints: vorp ? (vorp.avgPoints as number) : null,
      rosValue: ros ? (ros.rosAdjusted as number) : null,
      injuryRisk: ros ? (ros.injuryRisk as string) : null,
      position: vorp ? (vorp.position as string) : null,
    };
  };

  const analyze = async () => {
    if (!player1.trim() || !player2.trim()) {
      toast.error("Enter both players to compare.");
      return;
    }
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }

    setLoading(true);
    setResult(null);
    setVerdict(null);
    setMathContext(null);

    // Pull calculated facts from analytics layer
    const p1Facts = findPlayerFacts(player1);
    const p2Facts = findPlayerFacts(player2);

    setMathContext({
      p1Vorp: p1Facts.vorp ?? undefined,
      p2Vorp: p2Facts.vorp ?? undefined,
      p1Ros: p1Facts.rosValue ?? undefined,
      p2Ros: p2Facts.rosValue ?? undefined,
      p1Pos: p1Facts.position ?? undefined,
      p2Pos: p2Facts.position ?? undefined,
    });

    // Build math-enriched prompt
    const mathBlock = (p1Facts.vorp !== null || p2Facts.vorp !== null) ? `
CALCULATED FACTS FROM LEAGUE DATA (${season} season — use these numbers, do not recalculate):
Player 1 (${player1}):
  - Avg PPG: ${p1Facts.avgPoints?.toFixed(1) ?? "unknown"}
  - VORP: ${p1Facts.vorp?.toFixed(1) ?? "unknown"} (${p1Facts.vorpTier ?? "unknown"} tier)
  - ROS projected total: ${p1Facts.rosValue?.toFixed(0) ?? "unknown"}
  - Injury status: ${p1Facts.injuryRisk ?? "unknown"}

Player 2 (${player2}):
  - Avg PPG: ${p2Facts.avgPoints?.toFixed(1) ?? "unknown"}
  - VORP: ${p2Facts.vorp?.toFixed(1) ?? "unknown"} (${p2Facts.vorpTier ?? "unknown"} tier)
  - ROS projected total: ${p2Facts.rosValue?.toFixed(0) ?? "unknown"}
  - Injury status: ${p2Facts.injuryRisk ?? "unknown"}

` : "";

    const prompt = `START/SIT DECISION — PPR 14-Team Keeper League (ATLANTAS FINEST FF, ${season})

${mathBlock}Player 1: ${player1}
Player 2: ${player2}
${context ? `Context: ${context}` : ""}

The math has already been calculated above. Your job:
1. START or SIT verdict for each player — be decisive
2. The key reason in 1-2 sentences per player, referencing the VORP and ROS numbers where available
3. Final recommendation: which one starts if you can only play one

End with exactly this line:
VERDICT: START [full player name] — [one sentence reason]`;

    try {
      const res = await chatMutation.mutateAsync({ message: prompt, season });
      setResult(res.message);
      const lower = res.message.toLowerCase();
      const p1Key = player1.toLowerCase().split(" ")[0] || "";
      const p2Key = player2.toLowerCase().split(" ")[0] || "";
      if (lower.includes("verdict: start")) {
        const afterVerdict = lower.split("verdict: start")[1] || "";
        if (p1Key && afterVerdict.startsWith(" " + p1Key)) setVerdict("START_1");
        else if (p2Key && afterVerdict.startsWith(" " + p2Key)) setVerdict("START_2");
        else if (lower.includes(p1Key) && !lower.includes(p2Key)) setVerdict("START_1");
        else setVerdict("START_2");
      } else if (lower.includes("toss-up") || lower.includes("coin flip")) {
        setVerdict("TOSS_UP");
      }
    } catch {
      toast.error("Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadScenario = (s: typeof QUICK_SCENARIOS[0]) => {
    setPlayer1(s.player1);
    setPlayer2(s.player2);
    setContext(s.context);
    setResult(null);
    setVerdict(null);
    setMathContext(null);
  };

  return (
    <AppLayout title="Start/Sit Advisor" subtitle="Math-enriched lineup decisions — VORP and ROS facts passed to AI before analysis">
      <div className="p-6 space-y-6">

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <SeasonSelector value={season} onChange={setSeason} />
          <span className="text-xs text-muted-foreground">Analytics pulled from {season} ESPN data</span>
        </div>

        {/* Quick scenarios */}
        <Card className="card-glow bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" /> Quick scenarios
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {QUICK_SCENARIOS.map(s => (
              <Button key={s.label} variant="outline" size="sm"
                className="text-xs border-border hover:border-primary/40"
                onClick={() => loadScenario(s)}>
                {s.label} <ChevronRight className="w-3 h-3 ml-1 text-muted-foreground" />
              </Button>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input */}
          <Card className="card-glow bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" /> Player comparison
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">Player 1 — option A</label>
                <Input value={player1} onChange={e => setPlayer1(e.target.value)}
                  placeholder="e.g. Saquon Barkley"
                  className="bg-accent border-border text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">Player 2 — option B</label>
                <Input value={player2} onChange={e => setPlayer2(e.target.value)}
                  placeholder="e.g. Derrick Henry"
                  className="bg-accent border-border text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Matchup context <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea value={context} onChange={e => setContext(e.target.value)}
                  placeholder="Week number, opponent defense, injury news, weather..."
                  className="bg-accent border-border text-sm resize-none" rows={2} />
              </div>

              {/* Math preview */}
              {(player1 || player2) && (
                <div className="rounded-lg border border-border bg-accent/10 p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <BarChart2 className="w-3.5 h-3.5" /> Facts being passed to AI
                  </div>
                  {[{ label: player1, facts: findPlayerFacts(player1) }, { label: player2, facts: findPlayerFacts(player2) }]
                    .filter(p => p.label)
                    .map(p => (
                      <div key={p.label} className="flex items-center gap-3 flex-wrap text-xs">
                        <span className="text-foreground font-medium truncate max-w-24">{p.label.split(" ")[0]}</span>
                        {p.facts.position && <Badge variant="outline" className={`text-[10px] ${POS_COLORS[p.facts.position] || ""}`}>{p.facts.position}</Badge>}
                        {p.facts.avgPoints !== null ? (
                          <span className="text-muted-foreground">{p.facts.avgPoints?.toFixed(1)} ppg</span>
                        ) : <span className="text-muted-foreground italic">no data</span>}
                        {p.facts.vorp !== null && (
                          <span className={p.facts.vorp >= 0 ? "text-emerald-400" : "text-red-400"}>
                            VORP {p.facts.vorp >= 0 ? "+" : ""}{p.facts.vorp?.toFixed(1)}
                          </span>
                        )}
                        {p.facts.rosValue !== null && (
                          <span className="text-blue-400">ROS {p.facts.rosValue?.toFixed(0)}</span>
                        )}
                      </div>
                    ))}
                </div>
              )}

              <Button onClick={analyze} disabled={loading || !player1.trim() || !player2.trim()}
                className="w-full espn-gradient text-white border-0">
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing with data...</>
                ) : (
                  <><Brain className="w-4 h-4 mr-2" /> Get start/sit decision</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Result */}
          <Card className="card-glow bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" /> Decision
                {verdict && (
                  <Badge className={`ml-auto text-xs px-2 ${
                    verdict === "START_1" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : verdict === "START_2" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                  }`}>
                    {verdict === "START_1" ? `Start ${player1.split(" ")[0]}` : verdict === "START_2" ? `Start ${player2.split(" ")[0]}` : "Toss-up"}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
                </div>
              ) : result ? (
                <div className="prose prose-sm prose-invert max-w-none">
                  <Streamdown>{result}</Streamdown>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-center gap-3">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div className="text-muted-foreground text-xl font-light">vs</div>
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                      <XCircle className="w-6 h-6 text-red-400" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Enter two players. The AI will receive their VORP, ROS value, and injury status from your league data before analyzing.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* PPR Rules */}
        <Card className="card-glow bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> PPR scoring reference — ATLANTAS FINEST FF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-semibold">Position</th>
                    <th className="text-left py-2 text-muted-foreground font-semibold">Scoring rules</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {PPR_RULES.map(r => (
                    <tr key={r.position} className="hover:bg-accent/30 transition-colors">
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className={`text-[10px] ${POS_COLORS[r.position] || "text-foreground border-border"}`}>{r.position}</Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{r.scoring}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}
