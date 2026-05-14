import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, X, Brain, Scale, Loader2, TrendingUp, TrendingDown, Minus,
  Trophy, Info, ArrowRight, Target, Package, Sparkles, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { LogDecisionButton } from "@/components/LogDecisionButton";
import { toast } from "sonner";

// ─── Draft status gate ────────────────────────────────────────────────────────
// Flip to true once the 2026 draft is completed to unlock player trading.
const DRAFT_2026_COMPLETE = false;

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_PICKS_PER_SIDE = 5;

// ─── Types ────────────────────────────────────────────────────────────────────
interface PickEntry { round: number; pick: number; label: string; }

interface TradeResult {
  sideAValues: { name: string; compositeValue: number; valueBreakdown: string }[];
  sideBValues: { name: string; compositeValue: number; valueBreakdown: string }[];
  totalA: number; totalB: number;
  pickValueA: number; pickValueB: number;
  ratio: number; fairnessGrade: string;
  aiVerdict: string; mathSummary: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pickLabel(round: number, pick: number) {
  return `2026 Rd ${round}.${String(pick).padStart(2, "0")}`;
}

// Canonical pick value formula matching the server (14-team, PPR)
function clientPickValue(round: number, pick: number): number {
  const overall = (round - 1) * 14 + pick;
  const BASE = 3000;
  const K = 0.065;
  return Math.round(BASE * Math.exp(-K * (overall - 1)));
}

// ─── Pick selector widget ─────────────────────────────────────────────────────
function PickSelector({
  picks, onAdd, onRemove,
  accentClass, badgeClass, rowClass,
  placeholder,
}: {
  picks: PickEntry[];
  onAdd: (p: PickEntry) => void;
  onRemove: (label: string) => void;
  accentClass: string;
  badgeClass: string;
  rowClass: string;
  placeholder: string;
}) {
  const [round, setRound] = useState("1");
  const [slot, setSlot] = useState("1");
  const atMax = picks.length >= MAX_PICKS_PER_SIDE;

  const add = () => {
    if (atMax) { toast.error(`Max ${MAX_PICKS_PER_SIDE} picks per side`); return; }
    const r = parseInt(round), s = parseInt(slot);
    const lbl = pickLabel(r, s);
    if (picks.find(p => p.label === lbl)) {
      toast.error(`${lbl} is already added to this side`);
      return;
    }
    onAdd({ round: r, pick: s, label: lbl });
  };

  return (
    <div className="space-y-3">
      {/* Selected picks */}
      {picks.length > 0 ? (
        <div className="space-y-1.5">
          {picks.map(pk => (
            <div key={pk.label} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 ${rowClass}`}>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] border bg-transparent ${badgeClass}`}>2026 Pick</Badge>
                <span className={`text-sm font-semibold ${accentClass}`}>{pk.label}</span>
                <span className="text-xs text-muted-foreground">≈ {clientPickValue(pk.round, pk.pick).toLocaleString()} pts</span>
              </div>
              <button onClick={() => onRemove(pk.label)} className="text-muted-foreground hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className={atMax ? "text-amber-400 font-medium" : ""}>
              {picks.length}/{MAX_PICKS_PER_SIDE} picks{atMax ? " — max reached" : ""}
            </span>
            <span>Total: <span className="text-foreground font-semibold">{picks.reduce((s, p) => s + clientPickValue(p.round, p.pick), 0).toLocaleString()} pts</span></span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-center text-xs text-muted-foreground">
          {placeholder}
        </div>
      )}

      {/* Add row — hidden when at max */}
      {!atMax && (
        <div className="flex items-center gap-2">
          <Select value={round} onValueChange={setRound}>
            <SelectTrigger className="flex-1 h-9 text-xs border-border bg-input">
              <SelectValue placeholder="Round" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 14 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>Round {i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={slot} onValueChange={setSlot}>
            <SelectTrigger className="flex-1 h-9 text-xs border-border bg-input">
              <SelectValue placeholder="Pick slot" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 14 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>Pick {i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={add} className={`h-9 px-3 border-border shrink-0 ${accentClass}`}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Verdict banner ───────────────────────────────────────────────────────────
function VerdictBanner({ grade, targetValue, offerValue }: {
  grade: string; targetValue: number; offerValue: number;
}) {
  const diff = Math.abs(targetValue - offerValue);
  const pct = targetValue > 0 ? Math.round((diff / targetValue) * 100) : 0;
  const isFair = pct <= 10;
  const youWin = offerValue < targetValue; // you give less than you get

  const color = isFair
    ? "border-blue-500/30 bg-blue-500/10"
    : youWin
    ? "border-emerald-500/30 bg-emerald-500/10"
    : "border-amber-500/30 bg-amber-500/10";

  const icon = isFair
    ? <Scale className="w-5 h-5 text-blue-400" />
    : youWin
    ? <TrendingUp className="w-5 h-5 text-emerald-400" />
    : <TrendingDown className="w-5 h-5 text-amber-400" />;

  const label = isFair ? "Fair trade" : youWin ? "You win this trade" : "You overpay slightly";
  const labelColor = isFair ? "text-blue-400" : youWin ? "text-emerald-400" : "text-amber-400";

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
          <div className="text-xs text-muted-foreground mb-1">You receive</div>
          <div className="text-2xl font-bold text-cyan-400">{targetValue.toLocaleString()}</div>
        </div>
        <div className="flex items-center text-muted-foreground text-sm">vs</div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">You give</div>
          <div className={`text-2xl font-bold ${youWin ? "text-emerald-400" : "text-amber-400"}`}>{offerValue.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TradeAnalyzer() {
  // Picks the user WANTS to acquire
  const [targetPicks, setTargetPicks] = useState<PickEntry[]>([]);
  // Picks the user is OFFERING in return
  const [offerPicks, setOfferPicks] = useState<PickEntry[]>([]);

  const [result, setResult] = useState<TradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [champDelta, setChampDelta] = useState<{
    champProbabilityBefore: number;
    champProbabilityAfter: number;
    interpretation: string;
  } | null>(null);
  const [champDeltaLoading, setChampDeltaLoading] = useState(false);

  const { isAuthenticated } = useAuth();
  const tradeAnalyzeMutation = trpc.tradeAnalyze.useMutation();
  const whatIfMutation = trpc.champ.whatIfDelta.useMutation();

  const clearAll = () => {
    setTargetPicks([]); setOfferPicks([]);
    setResult(null); setChampDelta(null);
  };

  const canAnalyze = targetPicks.length > 0 && offerPicks.length > 0;

  // ─── Auto-suggest: tries 1-pick, 2-pick, then 3-pick combos ─────────────────
  const autoSuggestOffer = () => {
    if (targetPicks.length === 0) { toast.error("Add the pick(s) you want to acquire first"); return; }
    const targetTotal = targetPicks.reduce((s, p) => s + clientPickValue(p.round, p.pick), 0);
    const targetSet = new Set(targetPicks.map(p => p.label));

    // Build all candidate picks not already in the target side
    const candidates: PickEntry[] = [];
    for (let r = 1; r <= 14; r++) {
      for (let s = 1; s <= 14; s++) {
        const lbl = pickLabel(r, s);
        if (!targetSet.has(lbl)) candidates.push({ round: r, pick: s, label: lbl });
      }
    }

    const threshold = targetTotal * 0.15; // ±15% is "fair enough"

    // 1-pick search
    let best1: PickEntry | null = null;
    let best1Diff = Infinity;
    for (const c of candidates) {
      const diff = Math.abs(clientPickValue(c.round, c.pick) - targetTotal);
      if (diff < best1Diff) { best1Diff = diff; best1 = c; }
    }
    if (best1 && best1Diff <= threshold) {
      setOfferPicks([best1]);
      toast.success(`Suggested: ${best1.label} (≈ ${clientPickValue(best1.round, best1.pick).toLocaleString()} pts)`);
      return;
    }

    // 2-pick search
    let best2: [PickEntry, PickEntry] | null = null;
    let best2Diff = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const total = clientPickValue(candidates[i].round, candidates[i].pick)
          + clientPickValue(candidates[j].round, candidates[j].pick);
        const diff = Math.abs(total - targetTotal);
        if (diff < best2Diff) { best2Diff = diff; best2 = [candidates[i], candidates[j]]; }
      }
    }
    if (best2 && best2Diff <= threshold) {
      setOfferPicks(best2);
      const total = best2.reduce((s, p) => s + clientPickValue(p.round, p.pick), 0);
      toast.success(`Suggested: ${best2.map(p => p.label).join(" + ")} (≈ ${total.toLocaleString()} pts)`);
      return;
    }

    // 3-pick search (cap candidates for performance)
    const cap = Math.min(candidates.length, 50);
    let best3: [PickEntry, PickEntry, PickEntry] | null = null;
    let best3Diff = Infinity;
    for (let i = 0; i < cap; i++) {
      for (let j = i + 1; j < cap; j++) {
        for (let k = j + 1; k < cap; k++) {
          const total = clientPickValue(candidates[i].round, candidates[i].pick)
            + clientPickValue(candidates[j].round, candidates[j].pick)
            + clientPickValue(candidates[k].round, candidates[k].pick);
          const diff = Math.abs(total - targetTotal);
          if (diff < best3Diff) { best3Diff = diff; best3 = [candidates[i], candidates[j], candidates[k]]; }
        }
      }
    }
    if (best3) {
      setOfferPicks(best3);
      const total = best3.reduce((s, p) => s + clientPickValue(p.round, p.pick), 0);
      toast.success(`Suggested: ${best3.map(p => p.label).join(" + ")} (≈ ${total.toLocaleString()} pts)`);
      return;
    }

    // Absolute fallback: single best pick
    if (best1) {
      setOfferPicks([best1]);
      toast.success(`Suggested: ${best1.label} (≈ ${clientPickValue(best1.round, best1.pick).toLocaleString()} pts)`);
    }
  };

  const analyze = async () => {
    if (!isAuthenticated) { window.location.href = getLoginUrl(); return; }
    if (!canAnalyze) { toast.error("Add picks to both sides before analyzing"); return; }
    setLoading(true); setResult(null); setChampDelta(null);
    try {
      const res = await tradeAnalyzeMutation.mutateAsync({
        season: 2026,
        sideA: [],
        sideB: [],
        teamAId: 0,
        teamBId: 0,
        // Side A = what Rod gives (offer), Side B = what Rod gets (target)
        picksA: offerPicks.map(p => ({ round: p.round, pick: p.pick })),
        picksB: targetPicks.map(p => ({ round: p.round, pick: p.pick })),
      });
      setResult(res as unknown as TradeResult);

      // Phase 5: championship equity delta
      setChampDeltaLoading(true);
      whatIfMutation.mutateAsync({
        season: 2026,
        beforeLineup: offerPicks.map((p, i) => ({
          playerId: i + 9000,
          playerName: p.label,
          position: "Pick",
          projectedPoints: Math.max(0, 200 - (p.round - 1) * 14),
          volatilityMultiplier: 1,
        })),
        afterLineup: targetPicks.map((p, i) => ({
          playerId: i + 9100,
          playerName: p.label,
          position: "Pick",
          projectedPoints: Math.max(0, 200 - (p.round - 1) * 14),
          volatilityMultiplier: 1,
        })),
        decisionDescription: `Acquire ${targetPicks.map(p => p.label).join(", ")} by giving ${offerPicks.map(p => p.label).join(", ")}`,
        simCount: 500,
      }).then(d => setChampDelta(d as any)).catch(() => {}).finally(() => setChampDeltaLoading(false));

    } catch {
      toast.error("Trade analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const targetTotal = targetPicks.reduce((s, p) => s + clientPickValue(p.round, p.pick), 0);
  const offerTotal = offerPicks.reduce((s, p) => s + clientPickValue(p.round, p.pick), 0);
  const valueDiff = targetTotal - offerTotal;
  const diffPct = targetTotal > 0 ? Math.round(Math.abs(valueDiff) / targetTotal * 100) : 0;

  return (
    <AppLayout
      title="Trade Analyzer"
      subtitle="2026 draft pick trade builder — add up to 5 picks per side, get a full AI recommendation"
    >
      <div className="p-6 space-y-6">

        {/* Pre-draft notice */}
        {!DRAFT_2026_COMPLETE && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-200 leading-relaxed">
              <span className="font-semibold text-amber-300">Pre-draft mode — 2026 picks only.</span>{" "}
              Player trading unlocks after the 2026 draft. Build complex multi-pick swap offers now before draft day.
              You can add up to {MAX_PICKS_PER_SIDE} picks on each side.
            </div>
          </div>
        )}

        {/* Step 1 — Target picks */}
        <Card className="card-glow bg-card border-border border-cyan-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              Step 1 — Picks you want to acquire
              {targetPicks.length > 0 && (
                <Badge variant="outline" className="ml-auto text-xs text-cyan-400 border-cyan-500/30 bg-cyan-500/10">
                  {targetPicks.length} pick{targetPicks.length > 1 ? "s" : ""} · {targetTotal.toLocaleString()} pts
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PickSelector
              picks={targetPicks}
              onAdd={p => setTargetPicks(prev => [...prev, p])}
              onRemove={lbl => setTargetPicks(prev => prev.filter(p => p.label !== lbl))}
              accentClass="text-cyan-400"
              badgeClass="text-cyan-400 border-cyan-500/30"
              rowClass="border-cyan-500/20 bg-cyan-500/10"
              placeholder="Add up to 5 picks you want to trade for"
            />
          </CardContent>
        </Card>

        {/* Step 2 — Offer picks */}
        <Card className="card-glow bg-card border-border border-emerald-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              Step 2 — Picks you will offer in return
              {offerPicks.length > 0 && (
                <Badge variant="outline" className={`ml-auto text-xs border ${
                  diffPct <= 10
                    ? "text-blue-400 border-blue-500/30 bg-blue-500/10"
                    : offerTotal < targetTotal
                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                    : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                }`}>
                  {offerPicks.length} pick{offerPicks.length > 1 ? "s" : ""} · {offerTotal.toLocaleString()} pts
                  {targetTotal > 0 && ` · ${valueDiff >= 0 ? "+" : ""}${(-valueDiff).toLocaleString()} vs target`}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PickSelector
              picks={offerPicks}
              onAdd={p => setOfferPicks(prev => [...prev, p])}
              onRemove={lbl => setOfferPicks(prev => prev.filter(p => p.label !== lbl))}
              accentClass="text-emerald-400"
              badgeClass="text-emerald-400 border-emerald-500/30"
              rowClass="border-emerald-500/20 bg-emerald-500/10"
              placeholder="Add up to 5 picks you will give up"
            />
            {targetPicks.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={autoSuggestOffer}
                className="w-full text-xs border-border text-muted-foreground hover:text-foreground"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-yellow-400" />
                Auto-suggest a fair offer for {targetPicks.map(p => p.label).join(" + ")}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Live value balance bar */}
        {targetPicks.length > 0 && offerPicks.length > 0 && (
          <Card className="card-glow bg-card border-border">
            <CardContent className="pt-4 pb-4 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>You receive <span className="text-cyan-400 font-semibold">{targetTotal.toLocaleString()}</span></span>
                <span className={`font-semibold ${diffPct <= 10 ? "text-blue-400" : valueDiff > 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {diffPct <= 10 ? "Fair" : valueDiff > 0 ? `You win +${valueDiff.toLocaleString()}` : `You overpay ${(-valueDiff).toLocaleString()}`}
                </span>
                <span>You give <span className="text-emerald-400 font-semibold">{offerTotal.toLocaleString()}</span></span>
              </div>
              <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full bg-cyan-500 rounded-l transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round(targetTotal / Math.max(targetTotal, offerTotal) * 100))}%` }}
                />
                <div
                  className="absolute right-0 top-0 h-full bg-emerald-500 rounded-r transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round(offerTotal / Math.max(targetTotal, offerTotal) * 100))}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-cyan-500 inline-block" /> Receive</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-emerald-500 inline-block" /> Give</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action row */}
        <div className="flex gap-3">
          <Button
            className="flex-1 espn-gradient text-white font-semibold h-12 text-base disabled:opacity-50"
            onClick={analyze}
            disabled={!canAnalyze || loading}
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating recommendation…</>
            ) : (
              <><Brain className="w-5 h-5 mr-2" /> Get full trade recommendation</>
            )}
          </Button>
          {(targetPicks.length > 0 || offerPicks.length > 0) && (
            <Button variant="outline" size="icon" onClick={clearAll} className="h-12 w-12 border-border shrink-0" title="Clear all">
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* ── Results ── */}
        {result && (
          <div className="space-y-6">

            {/* Verdict banner */}
            <VerdictBanner
              grade={result.fairnessGrade}
              targetValue={result.pickValueB}
              offerValue={result.pickValueA}
            />

            {/* Trade summary */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-center">
              <Card className="card-glow bg-card border-border border-emerald-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">You give up</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {offerPicks.map(p => (
                    <div key={p.label} className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
                      <span className="text-sm font-semibold text-emerald-300">{p.label}</span>
                      <span className="text-xs text-muted-foreground">{clientPickValue(p.round, p.pick).toLocaleString()} pts</span>
                    </div>
                  ))}
                  <div className="text-right text-xs text-muted-foreground pt-1">
                    Total: <span className="text-emerald-400 font-bold">{result.pickValueA.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-center">
                <ArrowRight className="w-8 h-8 text-muted-foreground" />
              </div>

              <Card className="card-glow bg-card border-border border-cyan-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">You receive</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {targetPicks.map(p => (
                    <div key={p.label} className="flex items-center justify-between rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
                      <span className="text-sm font-semibold text-cyan-300">{p.label}</span>
                      <span className="text-xs text-muted-foreground">{clientPickValue(p.round, p.pick).toLocaleString()} pts</span>
                    </div>
                  ))}
                  <div className="text-right text-xs text-muted-foreground pt-1">
                    Total: <span className="text-cyan-400 font-bold">{result.pickValueB.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* AI full recommendation */}
            <Card className="card-glow bg-card border-border border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" /> Full trade recommendation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {result.aiVerdict}
                </div>
              </CardContent>
            </Card>

            {/* Value scorecard */}
            <Card className="card-glow bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Scale className="w-4 h-4" /> Pick value scorecard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Pick value", a: result.pickValueA, b: result.pickValueB, aLabel: "You give", bLabel: "You get" },
                  { label: "Composite value", a: result.totalA, b: result.totalB, aLabel: "Your cost", bLabel: "Your gain" },
                ].map(({ label, a, b, aLabel, bLabel }) => {
                  const max = Math.max(a, b, 1);
                  const pctA = Math.round((a / max) * 100);
                  const pctB = Math.round((b / max) * 100);
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{label}</span>
                        <span className="text-foreground font-medium">{a.toLocaleString()} → {b.toLocaleString()}</span>
                      </div>
                      <div className="flex gap-1 h-2">
                        <div className="flex-1 bg-muted rounded-l overflow-hidden flex justify-end">
                          <div className="h-full bg-emerald-500 rounded-l" style={{ width: `${pctA}%` }} />
                        </div>
                        <div className="w-px bg-border" />
                        <div className="flex-1 bg-muted rounded-r overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-r" style={{ width: `${pctB}%` }} />
                        </div>
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded bg-emerald-500 inline-block" /> {aLabel}</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded bg-cyan-500 inline-block" /> {bLabel}</span>
                      </div>
                    </div>
                  );
                })}
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
                    Simulating 500 season paths…
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
                  <p className="text-xs text-muted-foreground">Championship equity impact will appear after analysis.</p>
                )}
              </CardContent>
            </Card>

            {/* Log decision */}
            <div className="flex justify-end">
              <LogDecisionButton
                toolSource="trade_analyzer"
                decisionType="trade_accept"
                description={`Trade: Give ${offerPicks.map(p => p.label).join(", ")} | Receive ${targetPicks.map(p => p.label).join(", ")} | Grade: ${result.fairnessGrade}`}
                playersInvolved={[...offerPicks.map(p => p.label), ...targetPicks.map(p => p.label)]}
                season={2026}
              />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
