// FILE: client/src/pages/StartSit.tsx
import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { Brain, Zap, CheckCircle, XCircle, Loader2, ChevronRight } from "lucide-react";

const QUICK_SCENARIOS = [
  {
    label: "RB1 vs Tough Run Defense",
    player1: "My RB1 (elite back, 15+ ppg average)",
    player2: "Handcuff RB (starter's backup, good matchup)",
    context: "My RB1 is facing a top-5 run defense this week. His handcuff is starting due to injury and faces a weak run D. PPR 14-team league, Week 8.",
  },
  {
    label: "WR1 vs CB Shutdown Corner",
    player1: "My WR1 (elite receiver, 18+ ppg average)",
    player2: "WR2 (slot receiver, high target share, soft matchup)",
    context: "My WR1 is being shadowed by a shutdown CB. My WR2 is a slot receiver with a high target share against a weak secondary. PPR scoring.",
  },
  {
    label: "Streaming QB Decision",
    player1: "Backup QB (high upside, home game vs weak pass D)",
    player2: "Handcuff QB (safe floor, road game vs average D)",
    context: "I need to stream a QB this week. One has a great matchup at home, the other is safer but lower ceiling. 14-team PPR, must-win week.",
  },
];


type AnalyticsRecord = Record<string, unknown>;

type PlayerFact = {
  playerName: string;
  avgPoints: number | null;
  vorp: number | null;
  vorpTier: string;
  rosAdjusted: number | null;
  injuryRisk: string;
  scheduleStrength: string;
};

const toRecords = (value: unknown): AnalyticsRecord[] => Array.isArray(value) ? value.filter((item): item is AnalyticsRecord => Boolean(item) && typeof item === "object") : [];
const toNumberOrNull = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const toDisplayNumber = (value: number | null): string => value === null ? "—" : value.toFixed(1);
const toName = (value: unknown): string => typeof value === "string" ? value : "";
const normalizeName = (value: string): string => value.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9\s.'-]/g, " ").replace(/\s+/g, " ").trim();

const findByPlayerName = (records: AnalyticsRecord[], input: string): AnalyticsRecord | undefined => {
  const normalizedInput = normalizeName(input);
  if (!normalizedInput) return undefined;
  return records.find((record) => {
    const normalizedRecord = normalizeName(toName(record.playerName));
    return Boolean(normalizedRecord) && (normalizedRecord.includes(normalizedInput) || normalizedInput.includes(normalizedRecord));
  });
};

const getPlayerFact = (playerName: string, vorpData: unknown, rosData: unknown): PlayerFact | null => {
  const vorpRecord = findByPlayerName(toRecords(vorpData), playerName);
  const rosRecord = findByPlayerName(toRecords(rosData), playerName);
  if (!vorpRecord && !rosRecord) return null;

  return {
    playerName: toName(vorpRecord?.playerName ?? rosRecord?.playerName) || playerName,
    avgPoints: toNumberOrNull(vorpRecord?.avgPoints ?? rosRecord?.avgPoints),
    vorp: toNumberOrNull(vorpRecord?.vorp),
    vorpTier: toName(vorpRecord?.vorpTier) || "—",
    rosAdjusted: toNumberOrNull(rosRecord?.rosAdjusted),
    injuryRisk: toName(rosRecord?.injuryRisk) || "—",
    scheduleStrength: toName(rosRecord?.scheduleStrength) || "—",
  };
};

const formatFactLine = (label: string, fact: PlayerFact | null): string => {
  if (!fact) return `${label}: no matching calculated VORP/ROS record found`;
  const vorpPrefix = fact.vorp === null || fact.vorp < 0 ? "" : "+";
  return `${fact.playerName}: avg PPG=${toDisplayNumber(fact.avgPoints)}, VORP=${vorpPrefix}${toDisplayNumber(fact.vorp)} (Tier: ${fact.vorpTier}), ROS adjusted=${toDisplayNumber(fact.rosAdjusted)}, injury risk=${fact.injuryRisk}, schedule=${fact.scheduleStrength}`;
};

const PPR_RULES = [
  { position: "QB", scoring: "4 pts/TD pass, 1 pt/25 yds passing, 6 pts/rush TD, 1 pt/10 rush yds" },
  { position: "RB", scoring: "6 pts/rush TD, 1 pt/10 rush yds, 1 pt/reception, 6 pts/rec TD" },
  { position: "WR", scoring: "6 pts/rec TD, 1 pt/10 rec yds, 1 pt/reception" },
  { position: "TE", scoring: "6 pts/rec TD, 1 pt/10 rec yds, 1 pt/reception" },
  { position: "K", scoring: "3 pts/FG (0-39 yds), 4 pts/FG (40-49 yds), 5 pts/FG (50+ yds)" },
  { position: "D/ST", scoring: "Points allowed tiers, sacks (1 pt), INTs (2 pts), TDs (6 pts)" },
];

export default function StartSit() {
  const { isAuthenticated } = useAuth();
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState<"START_1" | "START_2" | "TOSS_UP" | null>(null);

  const chatMutation = trpc.advisor.chat.useMutation();
  const { data: vorpData } = trpc.analytics.vorp.useQuery({ season: 2025 });
  const { data: rosData } = trpc.analytics.rosValues.useQuery({ season: 2025, weeksRemaining: 8 });

  const player1Name = player1.trim();
  const player2Name = player2.trim();
  const player1Fact = getPlayerFact(player1Name, vorpData, rosData);
  const player2Fact = getPlayerFact(player2Name, vorpData, rosData);
  const factContext = `CALCULATED FACTS (do not contradict these):
${formatFactLine(player1Name || "Player 1", player1Fact)}
${formatFactLine(player2Name || "Player 2", player2Fact)}`;
  const showFactsPanel = Boolean(player1Name && player2Name && vorpData);

  const analyze = async () => {
    if (!player1.trim() || !player2.trim()) {
      toast.error("Please enter both players to compare.");
      return;
    }
    if (!isAuthenticated) {
      toast.error("Please sign in to use the AI Advisor.");
      return;
    }
    setLoading(true);
    setResult(null);
    setVerdict(null);
    const prompt = `${factContext}

START/SIT DECISION — PPR 14-Team League (ATLANTAS FINEST FF)

Player 1: ${player1}
Player 2: ${player2}
${context ? `Additional Context: ${context}` : ""}

Analyze this start/sit decision for a PPR 14-team keeper league. Consider:
1. Projected points and floor/ceiling
2. Matchup quality (opponent defense rank vs position)
3. Target share / usage rate / snap count
4. Injury concerns or weather factors
5. PPR scoring impact (receptions matter heavily)

End your response with a clear verdict on its own line:
VERDICT: START [Player Name] — [one sentence reason]

Be specific, data-driven, and decisive. Give a clear recommendation.`;

    try {
      const res = await chatMutation.mutateAsync({ message: prompt, season: 2025 });
      setResult(res.message);
      // Parse verdict
      const lower = res.message.toLowerCase();
      if (lower.includes("verdict: start") && lower.includes(player1.toLowerCase().split(" ")[0]?.toLowerCase() || "player 1")) {
        setVerdict("START_1");
      } else if (lower.includes("verdict: start") && lower.includes(player2.toLowerCase().split(" ")[0]?.toLowerCase() || "player 2")) {
        setVerdict("START_2");
      } else if (lower.includes("toss-up") || lower.includes("toss up") || lower.includes("coin flip")) {
        setVerdict("TOSS_UP");
      } else if (lower.includes("verdict: start")) {
        setVerdict("START_1"); // default to player 1 if mentioned
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
  };

  return (
    <AppLayout title="Start/Sit Advisor" subtitle="AI-powered weekly lineup decisions — PPR 14-team analysis">
      <div className="p-6 space-y-6">
        {/* Quick scenarios */}
        <Card className="card-glow bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              Quick-Load Scenarios
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {QUICK_SCENARIOS.map((s) => (
              <Button
                key={s.label}
                variant="outline"
                size="sm"
                className="text-xs border-border hover:border-primary/40 hover:bg-primary/5"
                onClick={() => loadScenario(s)}
              >
                {s.label}
                <ChevronRight className="w-3 h-3 ml-1 text-muted-foreground" />
              </Button>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input panel */}
          <Card className="card-glow bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                Player Comparison
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Player 1 — Option A
                </label>
                <Textarea
                  value={player1}
                  onChange={(e) => setPlayer1(e.target.value)}
                  placeholder="e.g. Saquon Barkley, RB, PHI — vs NYG (weak run D), home game"
                  className="bg-accent border-border text-sm resize-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Player 2 — Option B
                </label>
                <Textarea
                  value={player2}
                  onChange={(e) => setPlayer2(e.target.value)}
                  placeholder="e.g. Derrick Henry, RB, BAL — vs KC (top-3 run D), road game"
                  className="bg-accent border-border text-sm resize-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Additional Context <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="e.g. Must-win week, my opponent has a strong RB stack, weather concerns, injury updates..."
                  className="bg-accent border-border text-sm resize-none"
                  rows={2}
                />
              </div>
              {showFactsPanel && (
                <Card className="bg-accent/30 border-border">
                  <CardHeader className="py-3">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">Facts passed to AI</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-1.5 pr-3 text-muted-foreground font-semibold">Player</th>
                            <th className="text-left py-1.5 pr-3 text-muted-foreground font-semibold">Avg PPG</th>
                            <th className="text-left py-1.5 pr-3 text-muted-foreground font-semibold">VORP</th>
                            <th className="text-left py-1.5 pr-3 text-muted-foreground font-semibold">VORP Tier</th>
                            <th className="text-left py-1.5 pr-3 text-muted-foreground font-semibold">ROS Value</th>
                            <th className="text-left py-1.5 text-muted-foreground font-semibold">Injury Risk</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {[player1Fact, player2Fact].map((fact, index) => (
                            <tr key={index}>
                              <td className="py-1.5 pr-3 text-foreground">{fact?.playerName ?? (index === 0 ? player1Name : player2Name)}</td>
                              <td className="py-1.5 pr-3 text-muted-foreground">{toDisplayNumber(fact?.avgPoints ?? null)}</td>
                              <td className="py-1.5 pr-3 text-muted-foreground">{toDisplayNumber(fact?.vorp ?? null)}</td>
                              <td className="py-1.5 pr-3 text-muted-foreground">{fact?.vorpTier ?? "—"}</td>
                              <td className="py-1.5 pr-3 text-muted-foreground">{toDisplayNumber(fact?.rosAdjusted ?? null)}</td>
                              <td className="py-1.5 text-muted-foreground">{fact?.injuryRisk ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Button
                onClick={analyze}
                disabled={loading || !player1.trim() || !player2.trim()}
                className="w-full espn-gradient text-white border-0"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                ) : (
                  <><Brain className="w-4 h-4 mr-2" /> Get Start/Sit Decision</>
                )}
              </Button>
              {!isAuthenticated && (
                <p className="text-xs text-muted-foreground text-center">
                  <button className="text-primary underline" onClick={() => window.location.href = getLoginUrl()}>Sign in</button> to use the AI Advisor
                </p>
              )}
            </CardContent>
          </Card>

          {/* Result panel */}
          <Card className="card-glow bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                AI Decision
                {verdict && (
                  <Badge className={`ml-auto text-xs px-2 ${
                    verdict === "START_1" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border" :
                    verdict === "START_2" ? "bg-blue-500/20 text-blue-400 border-blue-500/30 border" :
                    "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 border"
                  }`}>
                    {verdict === "START_1" ? `▶ START Player 1` : verdict === "START_2" ? `▶ START Player 2` : "⚖ TOSS-UP"}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
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
                    Enter two players and click "Get Start/Sit Decision" for an AI-powered recommendation with full matchup analysis.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* PPR Rules Reference */}
        <Card className="card-glow bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              PPR Scoring Reference — ATLANTAS FINEST FF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-semibold">Position</th>
                    <th className="text-left py-2 text-muted-foreground font-semibold">Scoring Rules</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {PPR_RULES.map((r) => (
                    <tr key={r.position} className="hover:bg-accent/30 transition-colors">
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">{r.position}</Badge>
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
