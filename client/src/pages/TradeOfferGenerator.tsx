import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeftRight, Target, TrendingUp, Brain, MessageSquare,
  AlertTriangle, Clock, Star, Dna, Zap, ShieldAlert, BarChart3,
} from "lucide-react";

const DEAL_RATING_COLORS: Record<string, string> = {
  EXCELLENT: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  GOOD: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  FAIR: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  TOUGH: "bg-red-500/20 text-red-400 border-red-500/30",
};

const VALUE_RATIO_COLOR = (ratio: number) => {
  if (ratio >= 95 && ratio <= 110) return "text-emerald-400";
  if (ratio >= 85 && ratio < 95) return "text-yellow-400";
  if (ratio > 110) return "text-blue-400";
  return "text-red-400";
};

const VALUE_RATIO_LABEL = (ratio: number) => {
  if (ratio >= 95 && ratio <= 110) return "FAIR";
  if (ratio > 110 && ratio <= 125) return "SLIGHT OVERPAY";
  if (ratio > 125) return "OVERPAY";
  if (ratio >= 85) return "SLIGHT UNDERPAY";
  return "UNDERPAY";
};

const EXPLOIT_COLOR = (score: number) => {
  if (score >= 70) return { bar: "bg-red-500", text: "text-red-400", label: "HIGHLY EXPLOITABLE" };
  if (score >= 50) return { bar: "bg-orange-500", text: "text-orange-400", label: "MODERATELY EXPLOITABLE" };
  if (score >= 30) return { bar: "bg-yellow-500", text: "text-yellow-400", label: "MARKET-AWARE" };
  return { bar: "bg-emerald-500", text: "text-emerald-400", label: "SHARK" };
};

const TILT_COLOR = (label: string) => {
  if (label === "High Tilt Risk") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (label === "Moderate Tilt") return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (label === "Steady") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
};

export default function TradeOfferGenerator() {
  const [targetInput, setTargetInput] = useState("");
  const [targetType, setTargetType] = useState<"player" | "pick">("player");

  const mutation = trpc.tradeOfferGenerator.useMutation();

  const handleGenerate = () => {
    if (!targetInput.trim()) return;
    mutation.mutate({ targetInput: targetInput.trim(), targetType });
  };

  const result = mutation.data;
  const strategy = result?.strategy as any;
  const dna = result?.dnaProfile as any;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/20">
            <ArrowLeftRight className="h-6 w-6 text-orange-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Trade Offer Generator</h1>
              {dna && (
                <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs gap-1">
                  <Dna className="h-3 w-3" />
                  DNA-Powered
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              Enter a player or pick you want — get a fair offer, GM intel, and AI negotiation strategy
            </p>
          </div>
        </div>

        {/* Input Card */}
        <Card className="border-orange-500/20 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-orange-400" />
              What do you want to acquire?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={targetType === "player" ? "default" : "outline"}
                size="sm"
                onClick={() => setTargetType("player")}
                className={targetType === "player" ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
              >
                Player
              </Button>
              <Button
                variant={targetType === "pick" ? "default" : "outline"}
                size="sm"
                onClick={() => setTargetType("pick")}
                className={targetType === "pick" ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
              >
                Draft Pick
              </Button>
            </div>

            <div className="flex gap-3">
              <Input
                value={targetInput}
                onChange={e => setTargetInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleGenerate()}
                placeholder={targetType === "player" ? "e.g. Tyreek Hill, Lamar Jackson, Bijan Robinson..." : "e.g. 1.03, 2.07, round 3 pick 5..."}
                className="bg-background border-border text-foreground"
              />
              <Button
                onClick={handleGenerate}
                disabled={mutation.isPending || !targetInput.trim()}
                className="bg-orange-500 hover:bg-orange-600 text-white min-w-[140px]"
              >
                {mutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing...
                  </span>
                ) : "Generate Offer"}
              </Button>
            </div>

            {mutation.error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {mutation.error.message}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Uses 2025 ESPN fantasy stats, PPR scoring rules, pick value chart, GM behavioral profiles, and Phase 3 League DNA to build a targeted offer.
            </p>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Target Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-border bg-card/50 md:col-span-2">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-foreground">{result.targetName}</span>
                        {result.targetStats && (
                          <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-400">
                            {result.targetStats.position}
                          </Badge>
                        )}
                        {dna && (
                          <Badge className={`text-xs border ${TILT_COLOR(dna.tiltLabel)}`}>
                            {dna.tiltLabel}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">Owner: <span className="text-foreground font-medium">{result.targetOwner}</span></p>
                      {result.targetStats && (
                        <div className="mt-2 flex flex-wrap gap-3 text-sm">
                          <span className="text-muted-foreground">
                            2025 Pts: <span className="text-foreground font-semibold">{result.targetStats.seasonPoints}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Avg/Gm: <span className="text-foreground font-semibold">{result.targetStats.avgPoints}</span>
                          </span>
                          {result.targetStats.keeperValueFuture > 0 && (
                            <span className="text-muted-foreground">
                              Keeper Rd: <span className="text-yellow-400 font-semibold">{result.targetStats.keeperValueFuture}</span>
                            </span>
                          )}
                          <span className={`font-medium ${result.targetStats.injuryStatus === "ACTIVE" ? "text-emerald-400" : "text-yellow-400"}`}>
                            {result.targetStats.injuryStatus}
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">{result.scoringDesc}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-orange-400">{result.targetValue.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Est. Value</div>
                      {dna && (
                        <div className={`text-xs font-semibold mt-1 ${EXPLOIT_COLOR(dna.exploitabilityScore).text}`}>
                          Exploit: {dna.exploitabilityScore}/100
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {strategy && (
                <Card className={`border ${DEAL_RATING_COLORS[strategy.dealRating] || DEAL_RATING_COLORS.FAIR} bg-card/50`}>
                  <CardContent className="pt-4 text-center">
                    <div className="text-3xl font-black mb-1">{strategy.dealRating}</div>
                    <div className="text-xs text-muted-foreground">Deal Rating</div>
                    <div className="mt-3 text-xs text-muted-foreground leading-relaxed">
                      {strategy.targetAnalysis?.slice(0, 120)}...
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Main Tabs */}
            <Tabs defaultValue="offers">
              <TabsList className="bg-card border border-border flex-wrap h-auto">
                <TabsTrigger value="offers" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">
                  Offer Options
                </TabsTrigger>
                <TabsTrigger value="strategy" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">
                  AI Strategy
                </TabsTrigger>
                {dna && (
                  <TabsTrigger value="dna" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 gap-1">
                    <Dna className="h-3.5 w-3.5" />
                    DNA Intelligence
                  </TabsTrigger>
                )}
                {result.gmStyle && (
                  <TabsTrigger value="gm" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">
                    GM Profile
                  </TabsTrigger>
                )}
                <TabsTrigger value="analysis" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">
                  Full Analysis
                </TabsTrigger>
              </TabsList>

              {/* Offer Options Tab */}
              <TabsContent value="offers" className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  These offers are built from your 2025 roster using PPR fantasy point values and the 14-team pick chart.
                </p>
                {result.offerOptions.length === 0 ? (
                  <Card className="border-border bg-card/50">
                    <CardContent className="pt-4 text-center text-muted-foreground">
                      No offer options generated. You may need to build a custom offer.
                    </CardContent>
                  </Card>
                ) : (
                  result.offerOptions.map((offer, i) => (
                    <Card key={i} className={`border ${i === 0 ? "border-orange-500/40 bg-orange-500/5" : "border-border bg-card/50"}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-semibold text-foreground">Option {i + 1}</span>
                              {i === 0 && <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">Recommended</Badge>}
                            </div>
                            <div className="space-y-1">
                              {offer.players.map((p, j) => (
                                <div key={j} className="flex items-center gap-2 text-sm">
                                  <Badge variant="outline" className="text-xs w-8 text-center">{p.position}</Badge>
                                  <span className="text-foreground font-medium">{p.name}</span>
                                  <span className="text-muted-foreground">({p.seasonPoints} pts)</span>
                                </div>
                              ))}
                              {offer.picks.map((pick, j) => (
                                <div key={j} className="flex items-center gap-2 text-sm">
                                  <Badge variant="outline" className="text-xs">PICK</Badge>
                                  <span className="text-foreground font-medium">{pick}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-xl font-bold text-foreground">{offer.totalValue.toLocaleString()}</div>
                            <div className={`text-sm font-semibold ${VALUE_RATIO_COLOR(offer.valueRatio)}`}>
                              {offer.valueRatio}% — {VALUE_RATIO_LABEL(offer.valueRatio)}
                            </div>
                            <div className="mt-2 w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${offer.valueRatio >= 95 && offer.valueRatio <= 110 ? "bg-emerald-500" : offer.valueRatio > 110 ? "bg-blue-500" : "bg-yellow-500"}`}
                                style={{ width: `${Math.min(100, offer.valueRatio)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* AI Strategy Tab */}
              <TabsContent value="strategy" className="mt-4 space-y-4">
                {strategy ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card className="border-border bg-card/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Brain className="h-4 w-4 text-purple-400" />
                            Recommended Offer
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-foreground leading-relaxed">{strategy.recommendedOffer}</p>
                        </CardContent>
                      </Card>

                      <Card className="border-border bg-card/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-400" />
                            Timing
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-foreground leading-relaxed">{strategy.timing}</p>
                        </CardContent>
                      </Card>

                      <Card className="border-border bg-card/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-emerald-400" />
                            Negotiation Strategy
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-foreground leading-relaxed">{strategy.negotiationStrategy}</p>
                        </CardContent>
                      </Card>

                      <Card className="border-border bg-card/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-400" />
                            Red Flags
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-foreground leading-relaxed">{strategy.redFlags}</p>
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="border-emerald-500/30 bg-emerald-500/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-emerald-400" />
                          Message to Send
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <blockquote className="text-sm text-foreground italic border-l-2 border-emerald-500/50 pl-3 leading-relaxed">
                          "{strategy.closingLine}"
                        </blockquote>
                        <p className="text-xs text-muted-foreground mt-2">Copy this as your opening message to {result.targetOwner}</p>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-8">No strategy data available.</div>
                )}
              </TabsContent>

              {/* DNA Intelligence Tab */}
              {dna && (
                <TabsContent value="dna" className="mt-4 space-y-4">
                  {/* Header card */}
                  <Card className="border-purple-500/30 bg-purple-500/5">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Dna className="h-4 w-4 text-purple-400" />
                        {result.targetOwner} — League DNA Profile
                        <Badge variant="outline" className="text-xs ml-auto border-purple-500/30 text-purple-400">
                          {dna.seasonsAnalyzed} seasons analyzed
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {/* Archetype + Tilt */}
                      <div className="flex flex-wrap gap-2">
                        <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30 text-sm px-3 py-1">
                          {dna.gmArchetype}
                        </Badge>
                        <Badge className={`border text-sm px-3 py-1 ${TILT_COLOR(dna.tiltLabel)}`}>
                          {dna.tiltLabel}
                        </Badge>
                      </div>

                      {/* Exploitability bar */}
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Exploitability Score</span>
                          <span className={`text-sm font-bold ${EXPLOIT_COLOR(dna.exploitabilityScore).text}`}>
                            {dna.exploitabilityScore}/100 — {dna.exploitabilityLabel}
                          </span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${EXPLOIT_COLOR(dna.exploitabilityScore).bar}`}
                            style={{ width: `${dna.exploitabilityScore}%` }}
                          />
                        </div>
                      </div>

                      {/* Tilt score bar */}
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tilt Score</span>
                          <span className="text-sm font-bold text-foreground">{dna.tiltScore}/100</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${dna.tiltScore >= 70 ? "bg-red-500" : dna.tiltScore >= 40 ? "bg-orange-500" : "bg-blue-500"}`}
                            style={{ width: `${dna.tiltScore}%` }}
                          />
                        </div>
                      </div>

                      {/* Trade stats */}
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-xl font-bold text-foreground">{dna.avgTradesPerSeason.toFixed(1)}</div>
                          <div className="text-xs text-muted-foreground">Avg Trades/Season</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-xl font-bold text-orange-400">{dna.lossTradeRatio.toFixed(2)}x</div>
                          <div className="text-xs text-muted-foreground">Loss-Trade Ratio</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-xl font-bold text-foreground">
                            {dna.h2hVsRod.wins}W-{dna.h2hVsRod.losses}L
                          </div>
                          <div className="text-xs text-muted-foreground">H2H vs Rod</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Draft Bias Table */}
                  <Card className="border-border bg-card/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-blue-400" />
                        Draft Position Biases vs League Average
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground mb-3">
                        Negative = drafts earlier than league avg (overvalues). Positive = drafts later (undervalues).
                      </p>
                      <div className="space-y-2">
                        {(Object.entries(dna.biasVsLeague) as Array<[string, number]>)
                          .sort((a, b) => a[1] - b[1])
                          .map(([pos, bias]) => {
                            const isOver = bias < 0;
                            const pct = Math.min(100, Math.abs(bias) * 15);
                            return (
                              <div key={pos} className="flex items-center gap-3">
                                <span className="text-xs font-bold text-foreground w-8">{pos}</span>
                                <div className="flex-1 flex items-center gap-2">
                                  {isOver ? (
                                    <>
                                      <div className="flex-1 flex justify-end">
                                        <div
                                          className="h-2 rounded-full bg-red-500/70"
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <div className="w-px h-4 bg-border" />
                                      <div className="flex-1" />
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex-1" />
                                      <div className="w-px h-4 bg-border" />
                                      <div className="flex-1">
                                        <div
                                          className="h-2 rounded-full bg-emerald-500/70"
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>
                                <span className={`text-xs font-semibold w-20 text-right ${isOver ? "text-red-400" : "text-emerald-400"}`}>
                                  {bias > 0 ? "+" : ""}{bias.toFixed(1)} rds
                                </span>
                                <Badge variant="outline" className={`text-xs ${isOver ? "border-red-500/30 text-red-400" : "border-emerald-500/30 text-emerald-400"}`}>
                                  {isOver ? "OVERVALUES" : "UNDERVALUES"}
                                </Badge>
                              </div>
                            );
                          })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Exploit Windows */}
                  {dna.exploitWindows?.length > 0 && (
                    <Card className="border-yellow-500/30 bg-yellow-500/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Zap className="h-4 w-4 text-yellow-400" />
                          Exploit Windows
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {(dna.exploitWindows as string[]).map((window, i) => (
                          <div key={i} className="flex gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                            <ShieldAlert className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-foreground leading-relaxed">{window}</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* DNA Summary */}
                  {dna.dnaSummary && (
                    <Card className="border-border bg-card/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Brain className="h-4 w-4 text-purple-400" />
                          Full DNA Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-foreground leading-relaxed">{dna.dnaSummary}</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              )}

              {/* GM Profile Tab */}
              {result.gmStyle && (
                <TabsContent value="gm" className="mt-4 space-y-4">
                  <Card className="border-border bg-card/50">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-400" />
                        {result.targetOwner}'s GM Profile
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-sm px-3 py-1">
                          {result.gmStyle.archetype}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {result.gmStyle.draftStyleBadge}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-xl font-bold text-foreground">{result.gmStyle.avgTrades}</div>
                          <div className="text-xs text-muted-foreground">Avg Trades/Season</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-xl font-bold text-emerald-400">{result.gmStyle.h2hVsRod.wins}</div>
                          <div className="text-xs text-muted-foreground">Wins vs Rod</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-xl font-bold text-red-400">{result.gmStyle.h2hVsRod.losses}</div>
                          <div className="text-xs text-muted-foreground">Losses vs Rod</div>
                        </div>
                      </div>

                      {Array.isArray(result.gmStyle.strengthsWeaknesses) && result.gmStyle.strengthsWeaknesses.length > 0 && (
                        <div className="space-y-2">
                          {(result.gmStyle.strengthsWeaknesses as Array<{type: string; text: string}>)
                            .filter(sw => sw.type === "strength").slice(0, 1)
                            .map((sw, i) => (
                              <div key={i} className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                <div className="text-xs font-semibold text-emerald-400 mb-1">STRENGTH</div>
                                <p className="text-sm text-foreground">{sw.text}</p>
                              </div>
                            ))}
                          {(result.gmStyle.strengthsWeaknesses as Array<{type: string; text: string}>)
                            .filter(sw => sw.type === "weakness").slice(0, 1)
                            .map((sw, i) => (
                              <div key={i} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                <div className="text-xs font-semibold text-red-400 mb-1">WEAKNESS</div>
                                <p className="text-sm text-foreground">{sw.text}</p>
                              </div>
                            ))}
                          {(result.gmStyle.strengthsWeaknesses as Array<{type: string; text: string}>)
                            .filter(sw => sw.type === "blindspot").slice(0, 1)
                            .map((sw, i) => (
                              <div key={i} className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                <div className="text-xs font-semibold text-yellow-400 mb-1">BLIND SPOT</div>
                                <p className="text-sm text-foreground">{sw.text}</p>
                              </div>
                            ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              {/* Full Analysis Tab */}
              <TabsContent value="analysis" className="mt-4">
                <Card className="border-border bg-card/50">
                  <CardHeader>
                    <CardTitle className="text-sm">Full Target Analysis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {strategy && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Target Analysis</div>
                        <p className="text-sm text-foreground leading-relaxed">{strategy.targetAnalysis}</p>
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Value Basis</div>
                      <p className="text-sm text-foreground leading-relaxed">{result.targetValueBasis}</p>
                    </div>
                    {result.targetStats && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">2025 Stats Breakdown</div>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(result.targetStats.stats).slice(0, 8).map(([statId, val]) => (
                            <div key={statId} className="flex justify-between text-xs p-2 rounded bg-muted/20">
                              <span className="text-muted-foreground">Stat {statId}</span>
                              <span className="text-foreground font-medium">{String(val)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Empty state */}
        {!result && !mutation.isPending && (
          <Card className="border-dashed border-border bg-card/30">
            <CardContent className="py-12 text-center">
              <ArrowLeftRight className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-sm mb-1">Enter a player name or draft pick above to get started</p>
              <p className="text-xs text-muted-foreground">
                Try: "Tyreek Hill", "Lamar Jackson", "1.03", "2.07"
              </p>
              {/* DNA preview */}
              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-purple-400/70">
                <Dna className="h-3.5 w-3.5" />
                <span>Phase 3 DNA Intelligence will customize the AI strategy for the target owner's behavioral profile</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
