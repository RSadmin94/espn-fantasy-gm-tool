// FILE: client/src/components/SimulationResultsViz.tsx
/**
 * Monte Carlo Simulation Visualization Components
 *
 * Three composable pieces:
 *   SimulationDistributionBar   — animated P10→P90 range bar with median marker
 *   PlayerOutcomeCard           — single player floor/median/ceiling card
 *   StartSitComparisonViz       — side-by-side comparison with win-prob gauge
 *
 * All components are purely presentational — they accept typed props that
 * match the shapes returned by simulation.playerOutcome and simulation.startSit.
 */

import React, { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  Zap,
  Activity,
} from "lucide-react";

// ─── Shared types (mirror monteCarloService.ts output shapes) ─────────────────

export interface ScoreRange {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface PlayerOutcome {
  playerId: number;
  playerName: string;
  position: string;
  projectedPoints: number;
  adjustedProjection: number;
  stdDev: number;
  scoreRange: ScoreRange;
  bustProbability: number;
  ceilingProbability: number;
  volatilityMultiplier: number;
  confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
}

export interface StartSitSimResult {
  playerA: PlayerOutcome;
  playerB: PlayerOutcome;
  winProbWithA: number;
  winProbWithB: number;
  winProbDelta: number;
  recommendation: "START_A" | "START_B" | "COIN_FLIP";
  confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
  summaryText: string;
}

// ─── SimulationDistributionBar ────────────────────────────────────────────────

interface DistributionBarProps {
  scoreRange: ScoreRange;
  adjustedProjection: number;
  bustProbability: number;
  ceilingProbability: number;
  /** Colour accent for this player — "emerald" | "blue" */
  accent?: "emerald" | "blue";
  animated?: boolean;
}

export function SimulationDistributionBar({
  scoreRange,
  adjustedProjection,
  bustProbability,
  ceilingProbability,
  accent = "emerald",
  animated = true,
}: DistributionBarProps) {
  const [ready, setReady] = useState(!animated);
  useEffect(() => {
    if (animated) {
      const t = setTimeout(() => setReady(true), 80);
      return () => clearTimeout(t);
    }
  }, [animated]);

  // Compute bar geometry — scale everything relative to p90 + 10% headroom
  const maxVal = scoreRange.p90 * 1.12;
  const pct = (v: number) => `${Math.min(100, (v / maxVal) * 100).toFixed(2)}%`;

  const floorLeft = pct(scoreRange.p10);
  const midLeft = pct(scoreRange.p25);
  const midWidth = `${(((scoreRange.p75 - scoreRange.p25) / maxVal) * 100).toFixed(2)}%`;
  const ceilLeft = pct(scoreRange.p75);
  const ceilWidth = `${(((scoreRange.p90 - scoreRange.p75) / maxVal) * 100).toFixed(2)}%`;
  const medianLeft = pct(scoreRange.p50);
  const projLeft = pct(adjustedProjection);

  const accentMid = accent === "emerald"
    ? "bg-emerald-500/40"
    : "bg-blue-500/40";
  const accentCeil = accent === "emerald"
    ? "bg-emerald-400/70"
    : "bg-blue-400/70";
  const accentMedian = accent === "emerald"
    ? "bg-emerald-300"
    : "bg-blue-300";
  const accentProj = accent === "emerald"
    ? "bg-emerald-500"
    : "bg-blue-500";

  return (
    <div className="space-y-2">
      {/* Range bar */}
      <div className="relative h-8 rounded-lg bg-muted/30 overflow-hidden border border-border/50">
        {/* Floor zone: p10 → p25 */}
        <div
          className={`absolute top-0 h-full bg-red-500/25 transition-all duration-700 ease-out`}
          style={{
            left: floorLeft,
            width: `${(((scoreRange.p25 - scoreRange.p10) / maxVal) * 100).toFixed(2)}%`,
            opacity: ready ? 1 : 0,
          }}
        />
        {/* Mid zone: p25 → p75 */}
        <div
          className={`absolute top-0 h-full ${accentMid} transition-all duration-700 ease-out`}
          style={{
            left: midLeft,
            width: midWidth,
            opacity: ready ? 1 : 0,
          }}
        />
        {/* Ceiling zone: p75 → p90 */}
        <div
          className={`absolute top-0 h-full ${accentCeil} transition-all duration-700 ease-out`}
          style={{
            left: ceilLeft,
            width: ceilWidth,
            opacity: ready ? 1 : 0,
          }}
        />
        {/* Median marker */}
        <div
          className={`absolute top-0 h-full w-0.5 ${accentMedian} transition-all duration-700 ease-out`}
          style={{ left: medianLeft, opacity: ready ? 1 : 0 }}
        />
        {/* Adjusted projection marker (diamond) */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 ${accentProj} border border-background transition-all duration-700 ease-out`}
          style={{ left: projLeft, opacity: ready ? 1 : 0 }}
        />
        {/* Percentile labels */}
        <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
          <span className="text-[9px] text-red-400 font-mono font-semibold">{scoreRange.p10}</span>
          <span className="text-[9px] text-muted-foreground font-mono">{scoreRange.p50}</span>
          <span className="text-[9px] text-emerald-400 font-mono font-semibold">{scoreRange.p90}</span>
        </div>
      </div>

      {/* Legend row */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-red-500/50 inline-block" />
          Floor (P10)
        </span>
        <span className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-sm ${accentMid} inline-block`} />
          Core range
        </span>
        <span className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-sm ${accentCeil} inline-block`} />
          Ceiling (P90)
        </span>
        <span className="flex items-center gap-1">
          <span className={`w-2 h-2 rotate-45 ${accentProj} inline-block`} />
          Projection
        </span>
      </div>

      {/* Bust / Ceiling probability pills */}
      <div className="flex gap-2">
        <span className="flex items-center gap-1 text-[10px] bg-red-500/15 text-red-400 border border-red-500/25 rounded-full px-2 py-0.5">
          <AlertTriangle className="w-2.5 h-2.5" />
          Bust {bustProbability}%
        </span>
        <span className={`flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 border ${
          accent === "emerald"
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
            : "bg-blue-500/15 text-blue-400 border-blue-500/25"
        }`}>
          <Zap className="w-2.5 h-2.5" />
          Ceiling {ceilingProbability}%
        </span>
      </div>
    </div>
  );
}

// ─── ConfidenceBadge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ label }: { label: "HIGH" | "MEDIUM" | "LOW" }) {
  if (label === "HIGH") return (
    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border text-[10px] px-1.5 py-0 gap-1">
      <CheckCircle className="w-2.5 h-2.5" /> HIGH
    </Badge>
  );
  if (label === "MEDIUM") return (
    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 border text-[10px] px-1.5 py-0 gap-1">
      <Minus className="w-2.5 h-2.5" /> MEDIUM
    </Badge>
  );
  return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 border text-[10px] px-1.5 py-0 gap-1">
      <AlertTriangle className="w-2.5 h-2.5" /> LOW
    </Badge>
  );
}

// ─── VolatilityIndicator ──────────────────────────────────────────────────────

function VolatilityIndicator({ multiplier }: { multiplier: number }) {
  const label =
    multiplier >= 0.9 ? "Healthy" :
    multiplier >= 0.7 ? "Questionable" :
    multiplier >= 0.5 ? "Doubtful" : "OUT risk";
  const color =
    multiplier >= 0.9 ? "text-emerald-400" :
    multiplier >= 0.7 ? "text-yellow-400" :
    multiplier >= 0.5 ? "text-orange-400" : "text-red-400";
  const dots = Math.round(multiplier * 5);
  return (
    <span className={`flex items-center gap-1 text-[10px] ${color}`}>
      <Activity className="w-2.5 h-2.5" />
      {label}
      <span className="flex gap-0.5 ml-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${i < dots ? color.replace("text-", "bg-") : "bg-muted/40"}`}
          />
        ))}
      </span>
    </span>
  );
}

// ─── PlayerOutcomeCard ────────────────────────────────────────────────────────

interface PlayerOutcomeCardProps {
  outcome: PlayerOutcome;
  label?: string;
  accent?: "emerald" | "blue";
  highlighted?: boolean;
}

export function PlayerOutcomeCard({
  outcome,
  label,
  accent = "emerald",
  highlighted = false,
}: PlayerOutcomeCardProps) {
  const borderClass = highlighted
    ? accent === "emerald"
      ? "border-emerald-500/50 ring-1 ring-emerald-500/20"
      : "border-blue-500/50 ring-1 ring-blue-500/20"
    : "border-border";

  const projDiff = outcome.adjustedProjection - outcome.projectedPoints;
  const projDiffStr = projDiff === 0
    ? null
    : projDiff > 0
    ? `+${projDiff.toFixed(1)} injury adj.`
    : `${projDiff.toFixed(1)} injury adj.`;

  return (
    <Card className={`bg-card ${borderClass} transition-all duration-200`}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            {label && (
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                accent === "emerald" ? "text-emerald-400" : "text-blue-400"
              }`}>
                {label}
              </span>
            )}
            <div className="font-semibold text-sm text-foreground leading-tight">
              {outcome.playerName}
            </div>
            <div className="text-[11px] text-muted-foreground">{outcome.position}</div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-xl font-bold tabular-nums ${
              accent === "emerald" ? "text-emerald-400" : "text-blue-400"
            }`}>
              {outcome.adjustedProjection.toFixed(1)}
            </div>
            <div className="text-[10px] text-muted-foreground">proj pts</div>
            {projDiffStr && (
              <div className={`text-[10px] ${projDiff < 0 ? "text-red-400" : "text-emerald-400"}`}>
                {projDiffStr}
              </div>
            )}
          </div>
        </div>

        {/* Distribution bar */}
        <SimulationDistributionBar
          scoreRange={outcome.scoreRange}
          adjustedProjection={outcome.adjustedProjection}
          bustProbability={outcome.bustProbability}
          ceilingProbability={outcome.ceilingProbability}
          accent={accent}
        />

        {/* Footer metadata */}
        <div className="flex items-center justify-between pt-1">
          <VolatilityIndicator multiplier={outcome.volatilityMultiplier} />
          <ConfidenceBadge label={outcome.confidenceLabel} />
        </div>

        {/* Percentile table */}
        <div className="grid grid-cols-5 gap-1 pt-1 border-t border-border/50">
          {(["p10", "p25", "p50", "p75", "p90"] as const).map((k, i) => (
            <div key={k} className="text-center">
              <div className={`text-xs font-mono font-semibold tabular-nums ${
                i === 0 ? "text-red-400" :
                i === 4 ? (accent === "emerald" ? "text-emerald-400" : "text-blue-400") :
                i === 2 ? "text-foreground" : "text-muted-foreground"
              }`}>
                {outcome.scoreRange[k]}
              </div>
              <div className="text-[9px] text-muted-foreground/60 uppercase">
                {k.replace("p", "P")}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── WinProbabilityGauge ──────────────────────────────────────────────────────

interface WinProbGaugeProps {
  probA: number;
  probB: number;
  nameA: string;
  nameB: string;
  recommendation: "START_A" | "START_B" | "COIN_FLIP";
}

function WinProbabilityGauge({ probA, probB, nameA, nameB, recommendation }: WinProbGaugeProps) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 120);
    return () => clearTimeout(t);
  }, []);

  // SVG arc gauge — semicircle, 0° = left (A), 180° = right (B)
  const R = 60;
  const cx = 80;
  const cy = 72;
  const strokeWidth = 12;
  const circumference = Math.PI * R; // half circle

  // Fraction of the arc for A
  const fracA = probA / 100;
  const dashA = circumference * fracA;
  const dashB = circumference * (1 - fracA);

  // Needle angle: 0° = full A, 180° = full B
  const needleAngle = animated ? 180 - probA * 1.8 : 90; // 90° = center
  const needleRad = (needleAngle * Math.PI) / 180;
  const nx = cx + (R - 4) * Math.cos(needleRad);
  const ny = cy - (R - 4) * Math.sin(needleRad);

  const delta = Math.abs(probA - probB);
  const isCoinFlip = recommendation === "COIN_FLIP";

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="160" height="90" viewBox="0 0 160 90" className="overflow-visible">
        {/* Background track */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* A arc (emerald) */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none"
          stroke={isCoinFlip ? "hsl(var(--muted-foreground))" : "#10b981"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${animated ? dashA : 0} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)" }}
        />
        {/* B arc (blue) */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none"
          stroke={isCoinFlip ? "hsl(var(--muted-foreground))" : "#3b82f6"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`0 ${animated ? dashA : circumference} ${animated ? dashB : 0} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)" }}
        />
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="hsl(var(--foreground))"
          strokeWidth={2}
          strokeLinecap="round"
          style={{ transition: "x2 0.8s cubic-bezier(0.4,0,0.2,1), y2 0.8s cubic-bezier(0.4,0,0.2,1)" }}
        />
        <circle cx={cx} cy={cy} r={4} fill="hsl(var(--foreground))" />
        {/* Labels */}
        <text x={cx - R - 4} y={cy + 16} textAnchor="middle" fontSize="9" fill="#10b981" fontWeight="600">
          {probA}%
        </text>
        <text x={cx + R + 4} y={cy + 16} textAnchor="middle" fontSize="9" fill="#3b82f6" fontWeight="600">
          {probB}%
        </text>
      </svg>

      {/* Delta label */}
      <div className="text-center">
        {isCoinFlip ? (
          <div className="text-xs text-yellow-400 font-semibold flex items-center gap-1 justify-center">
            <Minus className="w-3 h-3" /> Coin Flip — &lt;3% difference
          </div>
        ) : (
          <div className={`text-xs font-semibold flex items-center gap-1 justify-center ${
            recommendation === "START_A" ? "text-emerald-400" : "text-blue-400"
          }`}>
            {recommendation === "START_A" ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            +{delta}% win probability advantage
          </div>
        )}
      </div>
    </div>
  );
}

// ─── StartSitComparisonViz ────────────────────────────────────────────────────

interface StartSitComparisonVizProps {
  simResult: StartSitSimResult;
  /** Display names for the two players (fallback to simResult player names) */
  labelA?: string;
  labelB?: string;
}

export function StartSitComparisonViz({
  simResult,
  labelA,
  labelB,
}: StartSitComparisonVizProps) {
  const { playerA, playerB, winProbWithA, winProbWithB, recommendation, confidenceLabel } = simResult;

  const recBannerClass =
    recommendation === "COIN_FLIP"
      ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
      : recommendation === "START_A"
      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
      : "bg-blue-500/10 border-blue-500/30 text-blue-400";

  const recText =
    recommendation === "COIN_FLIP"
      ? `⚖ Too close to call — within 3% either way`
      : recommendation === "START_A"
      ? `▶ Start ${labelA ?? playerA.playerName}`
      : `▶ Start ${labelB ?? playerB.playerName}`;

  return (
    <div className="space-y-4">
      {/* Recommendation banner */}
      <div className={`rounded-lg border px-4 py-2.5 flex items-center justify-between ${recBannerClass}`}>
        <span className="text-sm font-semibold">{recText}</span>
        <ConfidenceBadge label={confidenceLabel} />
      </div>

      {/* Win probability gauge */}
      <div className="flex flex-col items-center gap-1">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
          Win Probability (10,000 simulations)
        </div>
        <WinProbabilityGauge
          probA={winProbWithA}
          probB={winProbWithB}
          nameA={labelA ?? playerA.playerName}
          nameB={labelB ?? playerB.playerName}
          recommendation={recommendation}
        />
        <div className="flex gap-6 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            {labelA ?? playerA.playerName}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            {labelB ?? playerB.playerName}
          </span>
        </div>
      </div>

      {/* Side-by-side player cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PlayerOutcomeCard
          outcome={playerA}
          label={labelA ?? "Player A"}
          accent="emerald"
          highlighted={recommendation === "START_A"}
        />
        <PlayerOutcomeCard
          outcome={playerB}
          label={labelB ?? "Player B"}
          accent="blue"
          highlighted={recommendation === "START_B"}
        />
      </div>

      {/* Simulation summary text */}
      <div className="rounded-lg bg-muted/20 border border-border/50 px-3 py-2.5">
        <p className="text-[11px] text-muted-foreground font-mono leading-relaxed whitespace-pre-line">
          {simResult.summaryText}
        </p>
      </div>
    </div>
  );
}

// ─── SimulationLoadingSkeleton ────────────────────────────────────────────────

export function SimulationLoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 rounded-lg bg-muted/40" />
      <div className="flex flex-col items-center gap-2">
        <div className="h-4 w-32 rounded bg-muted/40" />
        <div className="h-20 w-40 rounded-full bg-muted/30" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-52 rounded-lg bg-muted/30" />
        <div className="h-52 rounded-lg bg-muted/30" />
      </div>
    </div>
  );
}
