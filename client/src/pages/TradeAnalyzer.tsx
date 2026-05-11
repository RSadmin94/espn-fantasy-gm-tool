import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight, Plus, X, Brain, Scale, Loader2, TrendingUp, TrendingDown, Minus, Trophy, Info } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

// ─── Draft status gate ───────────────────────────────────────────────────────
// Flip this to false once the 2026 draft has been completed to unlock player trading.
const DRAFT_2026_COMPLETE = false;

const POS_COLORS: Record<string, string> = {
  QB: "text-red-400 border-red-500/30 bg-red-500/10",
  RB: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  WR: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  TE: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  "D/ST": "text-purple-400 border-purple-500/30 bg-purple-500/10",
  K: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  Pick: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
};

interface PickEntry { round: number; pick: number; label: string; }

interface TradeResult {
  sideAValues: ValueResult[];
  sideBValues: ValueResult[];
  totalA: number;
  totalB: number;
  pickValueA: number;
  pickValueB: number;
  ratio: number;
  fairnessGrade: string;
  aiVerdict: string;
  mathSummary: string;
  teamANeeds: Record<string, number>;
  teamBNeeds: Record<string, number>;
}

interface ValueResult {
  name: string;
  position: string;
  avgPoints: number;
  vorp: number;
  rosValue: number;
  keeperBonus: number;
  positionalScarcityBonus: number;
  compositeValue: number;
  valueBreakdown: string;
}

// ─── Verdict banner ───────────────────────────────────────────────────────────
function VerdictBanner({ grade, totalA, totalB, pickValueA, pickValueB }: {
  grade: string; totalA: number; totalB: number; pickValueA: number; pickValueB: number;
}) {
  const isAWins = grade.includes("A WINS") || (grade === "LOPSIDED" && totalA > totalB);
  const isBWins = grade.includes("B WINS") || (grade === "LOPSIDED" && totalB > totalA);
  const isFair = grade === "FAIR";
  const diff = Math.abs(totalA - totalB);
  const pct = totalB > 0 ? Math.round(Math.abs((totalA - totalB) / totalB) * 100) : 0;

  const color = isFair
    ? "border-blue-500/30 bg-blue-500/10"
    : isAWins
    ? "border-emerald-500/30 bg-emerald-500/10"
    : "border-red-500/30 bg-red-500/10";

  const icon = isFair
    ? <Scale className="w-5 h-5 text-blue-400" />
    : isAWins
    ? <TrendingUp className="w-5 h-5 text-emerald-400" />
    : <TrendingDown className="w-5 h-5 text-red-400" />;

  const label = isFair ? "Fair trade" : isAWins ? "Side A wins" : "Side B wins";
  const labelColor = isFair ? "text-blue-400" : isAWins ? "text-emerald-400" : "text-red-400";

  return (
    <div className={`rounded-xl border p-4 ${color} flex items-center justify-between flex-wrap gap-4`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className={`text-xl font-bold ${labelColor}`}>{label}</div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {grade} · {pct}% value gap · Δ{diff.toLocaleString()} pts
          </div>
        </div>
      </div>
      <div className="flex gap-6">
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">Side A pick value</div>
          <div className={`text-2xl font-bold ${isAWins ? "text-emerald-400" : "text-foreground"}`}>
            {(pickValueA).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center text-muted-foreground text-sm">vs</div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">Side B pick value</div>
          <div className={`text-2xl font-bold ${isBWins ? "text-emerald-400" : "text-foreground"}`}>
            {(pickValueB).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pick input panel ─────────────────────────────────────────────────────────
function PickTradePanel({
  label,
  picks,
  onAddPick,
  onRemovePick,
  accentClass,
}: {
  label: string;
  picks: PickEntry[];
  onAddPick: (p: PickEntry) => void;
  onRemovePick: (label: string) => void;
  accentClass: string;
}) {
  const [pickRound, setPickRound] = useState("1");
  const [pickSlot, setPickSlot] = useState("1");

  const addPick = () => {
    const r = parseInt(pickRound);
    const s = parseInt(pickSlot);
    if (isNaN(r) || isNaN(s) || r < 1 || r > 14 || s < 1 || s > 14) return;
    const lbl = `2026 Rd ${r}.${String(s).padStart(2, "0")}`;
    if (!picks.find(pk => pk.label === lbl)) onAddPick({ round: r, pick: s, label: lbl });
  };

  return (
    <Card className="card-glow bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${accentClass}`} />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Selected picks */}
        {picks.length > 0 ? (
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground font-medium">2026 picks in this side</div>
            {picks.map(pk => (
              <div key={pk.label} className="flex items-center justify-between gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30 bg-transparent">2026 Pick</Badge>
                  <span className="text-sm font-semibold text-cyan-300">{pk.label}</span>
                </div>
                <button onClick={() => onRemovePick(pk.label)} className="text-muted-foreground hover:text-red-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            No picks added yet — use the selector below
          </div>
        )}

        {/* Add pick */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium">Add a 2026 pick</div>
          <div className="flex items-center gap-2">
            <Select value={pickRound} onValueChange={setPickRound}>
              <SelectTrigger className="flex-1 h-9 text-xs border-border bg-input">
                <SelectValue placeholder="Round" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 14 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>Round {i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pickSlot} onValueChange={setPickSlot}>
              <SelectTrigger className="flex-1 h-9 text-xs border-border bg-input">
                <SelectValue placeholder="Pick" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 14 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>Pick {i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={addPick} className="h-9 px-3 border-border shrink-0">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TradeAnalyzer() {
  const [picksA, setPicksA] = useState<PickEntry[]>([]);
  const [picksB, setPicksB] = useState<PickEntry[]>([]);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [champDelta, setChampDelta] = useState<{ champProbabilityBefore: number; champProbabilityAfter: number; interpretation: string } | null>(null);
  const [champDeltaLoading, setChampDeltaLoading] = useState(false);

  const { isAuthenticated } = useAuth();
  const tradeAnalyzeMutation = trpc.tradeAnalyze.useMutation();
  const whatIfMutation = trpc.champ.whatIfDelta.useMutation();

  const clearAll = () => {
    setPicksA([]); setPicksB([]);
    setResult(null); setChampDelta(null);
  };

  const canAnalyze = picksA.length > 0 && picksB.length > 0;

  const analyzeTrade = async () => {
    if (!isAuthenticated) { window.location.href = getLoginUrl(); return; }
    if (!canAnalyze) { toast.error("Add at least one 2026 pick to each side"); return; }
    setLoading(true);
    setResult(null);
    setChampDelta(null);
    try {
      const res = await tradeAnalyzeMutation.mutateAsync({
        season: 2026,
        sideA: [],
        sideB: [],
        teamAId: 0,
        teamBId: 0,
        picksA: picksA.map(p => ({ round: p.round, pick: p.pick })),
        picksB: picksB.map(p => ({ round: p.round, pick: p.pick })),
      });
      setResult(res as unknown as TradeResult);

      // Phase 5: championship equity delta for pick trades
      setChampDeltaLoading(true);
      whatIfMutation.mutateAsync({
        season: 2026,
        beforeLineup: picksA.map((p, i) => ({
          playerId: i + 9000,
          playerName: p.label,
          position: "Pick",
          projectedPoints: Math.max(0, 200 - (p.round - 1) * 14),
          volatilityMultiplier: 1,
        })),
        afterLineup: picksB.map((p, i) => ({
          playerId: i + 9100,
          playerName: p.label,
          position: "Pick",
          projectedPoints: Math.max(0, 200 - (p.round - 1) * 14),
          volatilityMultiplier: 1,
        })),
        decisionDescription: `Pick trade: give ${picksA.map(p => p.label).join(", ")} for ${picksB.map(p => p.label).join(", ")}`,
        simCount: 500,
      }).then(d => setChampDelta(d as any)).catch(() => {}).finally(() => setChampDeltaLoading(false));

    } catch {
      toast.error("Trade analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout
      title="Trade Analyzer"
      subtitle="2026 draft pick trade evaluation — pick value, round scarcity, championship equity impact"
    >
      <div className="p-6 space-y-6">

        {/* Pre-draft notice banner */}
        {!DRAFT_2026_COMPLETE && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-200 leading-relaxed">
              <span className="font-semibold text-amber-300">Pre-draft mode — 2026 picks only.</span>{" "}
              Player trading will be unlocked once the 2026 draft is completed. Use this tool now to evaluate pick-for-pick swaps before draft day.
            </div>
          </div>
        )}

        {/* How it works */}
        <Card className="card-glow bg-card border-border border-blue-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
              {[
                ["Pick value", "Each round's historical draft value based on 18 seasons of your league's data"],
                ["Round scarcity", "Early picks carry exponentially more value — Rd 1 vs Rd 5 is not linear"],
                ["Slot adjustment", "Pick 1.01 vs 1.14 matters — later slots in early rounds are discounted"],
                ["Champ equity", "500-sim championship probability delta for the pick swap"],
              ].map(([label, desc]) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="font-semibold text-foreground shrink-0">{label}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-cyan-400 border-cyan-500/30 bg-cyan-500/10 text-xs px-3 py-1">
              2026 Draft Picks
            </Badge>
            <span className="text-xs text-muted-foreground">Select picks for each side of the trade</span>
          </div>
          {(picksA.length > 0 || picksB.length > 0) && (
            <Button variant="outline" size="sm" onClick={clearAll} className="text-xs border-border">
              <X className="w-3 h-3 mr-1" /> Clear all
            </Button>
          )}
        </div>

        {/* Pick panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PickTradePanel
            label="Side A — gives these picks"
            picks={picksA}
            onAddPick={p => setPicksA(prev => [...prev, p])}
            onRemovePick={lbl => setPicksA(prev => prev.filter(p => p.label !== lbl))}
            accentClass="bg-emerald-500"
          />
          <PickTradePanel
            label="Side B — gives these picks"
            picks={picksB}
            onAddPick={p => setPicksB(prev => [...prev, p])}
            onRemovePick={lbl => setPicksB(prev => prev.filter(p => p.label !== lbl))}
            accentClass="bg-blue-500"
          />
        </div>

        {/* Analyze button */}
        <Button
          className="w-full espn-gradient text-white font-semibold h-12 text-base disabled:opacity-50"
          onClick={analyzeTrade}
          disabled={!canAnalyze || loading}
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Evaluating pick values…</>
          ) : (
            <><Scale className="w-5 h-5 mr-2" /> Analyze pick trade</>
          )}
        </Button>

        {/* Results */}
        {result && (
          <div className="space-y-6">

            {/* Verdict banner */}
            <VerdictBanner
              grade={result.fairnessGrade}
              totalA={result.totalA}
              totalB={result.totalB}
              pickValueA={result.pickValueA}
              pickValueB={result.pickValueB}
            />

            {/* Pick value breakdown — side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Side A receives — {result.pickValueB.toLocaleString()} pick value
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {picksB.length > 0 && (
                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 flex justify-between items-center">
                      <div className="flex items-center gap-2 flex-wrap">
                        {picksB.map(p => (
                          <Badge key={p.label} variant="outline" className="text-xs text-cyan-300 border-cyan-500/30 bg-transparent">{p.label}</Badge>
                        ))}
                      </div>
                      <span className="text-lg font-bold text-cyan-400 shrink-0 ml-3">{result.pickValueB.toLocaleString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Side B receives — {result.pickValueA.toLocaleString()} pick value
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {picksA.length > 0 && (
                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 flex justify-between items-center">
                      <div className="flex items-center gap-2 flex-wrap">
                        {picksA.map(p => (
                          <Badge key={p.label} variant="outline" className="text-xs text-cyan-300 border-cyan-500/30 bg-transparent">{p.label}</Badge>
                        ))}
                      </div>
                      <span className="text-lg font-bold text-cyan-400 shrink-0 ml-3">{result.pickValueA.toLocaleString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Math scorecard */}
            <Card className="card-glow bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Scale className="w-4 h-4" /> Pick value scorecard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Total pick value", a: result.pickValueA, b: result.pickValueB },
                  { label: "Player value (picks only)", a: result.totalA, b: result.totalB },
                ].map(({ label, a, b }) => {
                  const max = Math.max(a, b, 1);
                  const pctA = Math.round((a / max) * 100);
                  const pctB = Math.round((b / max) * 100);
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{label}</span>
                        <span className="text-foreground font-medium">{a.toLocaleString()} vs {b.toLocaleString()}</span>
                      </div>
                      <div className="flex gap-1 h-2">
                        <div className="flex-1 bg-muted rounded-l overflow-hidden flex justify-end">
                          <div className="h-full bg-emerald-500 rounded-l" style={{ width: `${pctA}%` }} />
                        </div>
                        <div className="w-px bg-border" />
                        <div className="flex-1 bg-muted rounded-r overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-r" style={{ width: `${pctB}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-4 pt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-emerald-500 inline-block" /> Side A</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-blue-500 inline-block" /> Side B</span>
                </div>
              </CardContent>
            </Card>

            {/* AI verdict */}
            <Card className="card-glow bg-card border-border border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" /> AI verdict — pick trade analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {result.aiVerdict}
                </div>
              </CardContent>
            </Card>

            {/* Phase 5: Championship Equity Impact */}
            <Card className="card-glow bg-card border-border border-yellow-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" /> Championship Equity Impact
                  <span className="ml-auto text-[9px] bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 rounded px-1.5 py-0.5">Phase 5</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {champDeltaLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Simulating 500 season paths to calculate championship probability delta…
                  </div>
                )}
                {champDelta && (() => {
                  const d = champDelta;
                  const delta = d.champProbabilityAfter - d.champProbabilityBefore;
                  const isPositive = delta > 0.5;
                  const isNegative = delta < -0.5;
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="text-xs text-muted-foreground">Before trade</div>
                          <div className="text-2xl font-black text-foreground">{d.champProbabilityBefore.toFixed(1)}%</div>
                        </div>
                        <div className={`text-3xl font-black flex items-center gap-1 ${
                          isPositive ? "text-emerald-400" : isNegative ? "text-red-400" : "text-muted-foreground"
                        }`}>
                          {isPositive ? <TrendingUp className="w-6 h-6" /> : isNegative ? <TrendingDown className="w-6 h-6" /> : <Minus className="w-6 h-6" />}
                          {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                        </div>
                        <div className="space-y-0.5 text-right">
                          <div className="text-xs text-muted-foreground">After trade</div>
                          <div className="text-2xl font-black text-foreground">{d.champProbabilityAfter.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                        <p className="text-xs text-foreground leading-relaxed">{d.interpretation}</p>
                      </div>
                    </div>
                  );
                })()}
                {!champDeltaLoading && !champDelta && (
                  <p className="text-xs text-muted-foreground">Championship equity impact will appear after running trade analysis.</p>
                )}
              </CardContent>
            </Card>

          </div>
        )}
      </div>
    </AppLayout>
  );
}
