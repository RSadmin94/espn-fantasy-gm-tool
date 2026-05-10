// SavedDrafts.tsx — Review and compare saved mock draft results
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, ChevronDown, Trophy, Calendar, Target, TrendingUp, GitCompare, X, ArrowLeft, CheckSquare, Square, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const POS_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  WR: "bg-green-500/20 text-green-300 border-green-500/30",
  TE: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  K: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  DST: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "D/ST": "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const POS_BAR_COLORS: Record<string, string> = {
  QB: "bg-red-500",
  RB: "bg-blue-500",
  WR: "bg-green-500",
  TE: "bg-purple-500",
  K: "bg-slate-500",
  DST: "bg-orange-500",
  "D/ST": "bg-orange-500",
};

const GRADE_COLORS: Record<string, string> = {
  "A+": "text-yellow-300", A: "text-yellow-400", "A-": "text-yellow-500",
  "B+": "text-green-300", B: "text-green-400", "B-": "text-green-500",
  "C+": "text-blue-300", C: "text-blue-400", "C-": "text-blue-500",
  "D+": "text-orange-300", D: "text-orange-400",
  F: "text-red-400",
};

const GRADE_ORDER = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","F"];

type SavedDraft = {
  id: number;
  label: string;
  draftSlot: number;
  totalTeams: number;
  totalRounds: number;
  grade: string;
  avgEcr: number;
  totalVbd: number;
  createdAt: Date;
};

type PickEntry = {
  round: number;
  pick: number;
  overall: number;
  owner: string;
  player: { name: string; position: string; team: string; ecrRank: number; adp?: number };
};

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function GradeDisplay({ grade, size = "lg" }: { grade: string; size?: "sm" | "lg" }) {
  return (
    <span className={cn(
      "font-black",
      size === "lg" ? "text-5xl" : "text-3xl",
      GRADE_COLORS[grade] ?? "text-foreground"
    )}>{grade}</span>
  );
}

// ─── Positional construction bar ─────────────────────────────────────────────

function PositionBar({ picks }: { picks: PickEntry[] }) {
  const counts: Record<string, number> = {};
  for (const p of picks) {
    const pos = p.player.position;
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  const total = picks.length;
  const positions = ["QB", "RB", "WR", "TE", "K", "DST", "D/ST"];
  const present = positions.filter(pos => counts[pos]);

  return (
    <div className="space-y-1.5">
      {present.map(pos => {
        const cnt = counts[pos] ?? 0;
        const pct = total > 0 ? (cnt / total) * 100 : 0;
        return (
          <div key={pos} className="flex items-center gap-2">
            <span className="text-xs w-8 text-muted-foreground font-medium">{pos}</span>
            <div className="flex-1 h-2 bg-slate-700/60 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", POS_BAR_COLORS[pos] ?? "bg-slate-500")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">{cnt}×</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Metric comparison row ────────────────────────────────────────────────────

function MetricRow({
  label,
  valA,
  valB,
  higherIsBetter = true,
  format = "number",
}: {
  label: string;
  valA: number;
  valB: number;
  higherIsBetter?: boolean;
  format?: "number" | "grade";
}) {
  const aWins = higherIsBetter ? valA > valB : valA < valB;
  const bWins = higherIsBetter ? valB > valA : valB < valA;

  const fmt = (v: number) => {
    if (format === "grade") return v.toFixed(1);
    return v % 1 === 0 ? v.toString() : v.toFixed(1);
  };

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5 border-b border-slate-700/30 last:border-0">
      <div className={cn("text-right text-sm font-semibold", aWins ? "text-emerald-400" : bWins ? "text-muted-foreground" : "text-foreground")}>
        {fmt(valA)}
        {aWins && <span className="ml-1 text-xs text-emerald-500">▲</span>}
      </div>
      <div className="text-xs text-muted-foreground text-center px-2 min-w-[90px]">{label}</div>
      <div className={cn("text-left text-sm font-semibold", bWins ? "text-emerald-400" : aWins ? "text-muted-foreground" : "text-foreground")}>
        {bWins && <span className="mr-1 text-xs text-emerald-500">▲</span>}
        {fmt(valB)}
      </div>
    </div>
  );
}

// ─── Side-by-side comparison view ────────────────────────────────────────────

function ComparisonView({
  draftAId,
  draftBId,
  onClose,
}: {
  draftAId: number;
  draftBId: number;
  onClose: () => void;
}) {
  const { data: draftA, isLoading: loadA } = trpc.draftBoard.getDraft.useQuery({ id: draftAId });
  const { data: draftB, isLoading: loadB } = trpc.draftBoard.getDraft.useQuery({ id: draftBId });
  const [activeTab, setActiveTab] = useState<"overview" | "picks" | "teams">("overview");

  if (loadA || loadB) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        Loading drafts for comparison…
      </div>
    );
  }
  if (!draftA || !draftB) {
    return (
      <div className="p-8 text-center text-red-400 text-sm">
        Could not load one or both drafts.
      </div>
    );
  }

  const rodPicksA = (draftA.rodPicksJson as PickEntry[]) ?? [];
  const rodPicksB = (draftB.rodPicksJson as PickEntry[]) ?? [];
  const allPicksA = (draftA.allPicksJson as PickEntry[]) ?? [];
  const allPicksB = (draftB.allPicksJson as PickEntry[]) ?? [];

  // Grade numeric score for comparison (A+ = 0, F = 11)
  const gradeScoreA = GRADE_ORDER.indexOf(draftA.grade);
  const gradeScoreB = GRADE_ORDER.indexOf(draftB.grade);
  const aGradeWins = gradeScoreA < gradeScoreB;
  const bGradeWins = gradeScoreB < gradeScoreA;

  // Avg surplus (pick overall - ECR rank; higher = better value)
  const avgSurplusA = rodPicksA.length > 0
    ? rodPicksA.reduce((s, p) => s + (p.overall - p.player.ecrRank), 0) / rodPicksA.length
    : 0;
  const avgSurplusB = rodPicksB.length > 0
    ? rodPicksB.reduce((s, p) => s + (p.overall - p.player.ecrRank), 0) / rodPicksB.length
    : 0;

  // Positional counts
  const posCountsA: Record<string, number> = {};
  for (const p of rodPicksA) posCountsA[p.player.position] = (posCountsA[p.player.position] ?? 0) + 1;
  const posCountsB: Record<string, number> = {};
  for (const p of rodPicksB) posCountsB[p.player.position] = (posCountsB[p.player.position] ?? 0) + 1;

  // All positions present in either draft
  const allPositions = Array.from(new Set([...Object.keys(posCountsA), ...Object.keys(posCountsB)]));

  // Value picks (gap > 0 = went later than ADP)
  const valuePicksA = rodPicksA.filter(p => p.player.adp != null && p.player.adp - p.overall > 3).length;
  const valuePicksB = rodPicksB.filter(p => p.player.adp != null && p.player.adp - p.overall > 3).length;

  // Reaches (gap < -3)
  const reachesA = rodPicksA.filter(p => p.player.adp != null && p.overall - p.player.adp > 3).length;
  const reachesB = rodPicksB.filter(p => p.player.adp != null && p.overall - p.player.adp > 3).length;

  // Build round-by-round comparison (Rod's picks only)
  const maxRounds = Math.max(
    rodPicksA.length > 0 ? Math.max(...rodPicksA.map(p => p.round)) : 0,
    rodPicksB.length > 0 ? Math.max(...rodPicksB.map(p => p.round)) : 0,
  );
  const rounds = Array.from({ length: maxRounds }, (_, i) => i + 1);

  // All teams from allPicks
  const teamMapA: Record<string, PickEntry[]> = {};
  for (const p of allPicksA) {
    if (!teamMapA[p.owner]) teamMapA[p.owner] = [];
    teamMapA[p.owner].push(p);
  }
  const teamMapB: Record<string, PickEntry[]> = {};
  for (const p of allPicksB) {
    if (!teamMapB[p.owner]) teamMapB[p.owner] = [];
    teamMapB[p.owner].push(p);
  }

  // Advantage summary
  let aAdvantages = 0;
  let bAdvantages = 0;
  if (aGradeWins) aAdvantages++; else if (bGradeWins) bAdvantages++;
  if (draftA.avgEcr < draftB.avgEcr) aAdvantages++; else if (draftB.avgEcr < draftA.avgEcr) bAdvantages++;
  if (draftA.totalVbd > draftB.totalVbd) aAdvantages++; else if (draftB.totalVbd > draftA.totalVbd) bAdvantages++;
  if (avgSurplusA > avgSurplusB) aAdvantages++; else if (avgSurplusB > avgSurplusA) bAdvantages++;
  if (valuePicksA > valuePicksB) aAdvantages++; else if (valuePicksB > valuePicksA) bAdvantages++;
  if (reachesA < reachesB) aAdvantages++; else if (reachesB < reachesA) bAdvantages++;

  const winner = aAdvantages > bAdvantages ? "A" : bAdvantages > aAdvantages ? "B" : "TIE";

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onClose} className="gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to List
          </Button>
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-primary" />
              Draft Comparison
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Side-by-side analysis of your two mock drafts</p>
          </div>
        </div>
        {/* Winner banner */}
        {winner !== "TIE" ? (
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold",
            winner === "A"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-blue-500/40 bg-blue-500/10 text-blue-300"
          )}>
            <Trophy className="w-4 h-4" />
            {winner === "A" ? draftA.label : draftB.label} wins ({winner === "A" ? aAdvantages : bAdvantages}/{aAdvantages + bAdvantages} metrics)
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-sm font-semibold">
            <Trophy className="w-4 h-4" /> Even match — tied on metrics
          </div>
        )}
      </div>

      {/* Draft labels + grades */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { draft: draftA, picks: rodPicksA, label: "Draft A", wins: aGradeWins, color: "emerald" },
          { draft: draftB, picks: rodPicksB, label: "Draft B", wins: bGradeWins, color: "blue" },
        ].map(({ draft, picks, label, wins, color }) => (
          <Card key={draft.id} className={cn(
            "border",
            wins ? `border-${color}-500/40 bg-${color}-500/5` : "border-slate-700/50 bg-slate-800/30"
          )}>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5 leading-tight">{draft.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(draft.createdAt)} · Slot {draft.draftSlot}</p>
                </div>
                <GradeDisplay grade={draft.grade} size="lg" />
              </div>
              <div className="flex gap-1 flex-wrap mt-2">
                {Object.entries(
                  picks.reduce<Record<string, number>>((acc, p) => {
                    acc[p.player.position] = (acc[p.player.position] ?? 0) + 1;
                    return acc;
                  }, {})
                ).map(([pos, cnt]) => (
                  <span key={pos} className={cn("text-xs px-1.5 py-0.5 rounded border", POS_COLORS[pos] ?? "")}>
                    {pos}×{cnt}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-slate-700/50">
        {(["overview", "picks", "teams"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "overview" ? "Overview" : tab === "picks" ? "Pick-by-Pick" : "All Teams"}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Metric comparison table */}
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-foreground">Head-to-Head Metrics</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pb-2 mb-1 border-b border-slate-700/50">
                <div className="text-right text-xs font-semibold text-emerald-400 truncate">{draftA.label}</div>
                <div className="text-xs text-muted-foreground text-center px-2 min-w-[90px]">Metric</div>
                <div className="text-left text-xs font-semibold text-blue-400 truncate">{draftB.label}</div>
              </div>

              {/* Grade row (special — lower index = better) */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5 border-b border-slate-700/30">
                <div className={cn("text-right", aGradeWins ? "text-emerald-400" : bGradeWins ? "text-muted-foreground" : "text-foreground")}>
                  <span className={cn("text-lg font-black", GRADE_COLORS[draftA.grade] ?? "")}>{draftA.grade}</span>
                  {aGradeWins && <span className="ml-1 text-xs text-emerald-500">▲</span>}
                </div>
                <div className="text-xs text-muted-foreground text-center px-2 min-w-[90px]">Grade</div>
                <div className={cn("text-left", bGradeWins ? "text-emerald-400" : aGradeWins ? "text-muted-foreground" : "text-foreground")}>
                  {bGradeWins && <span className="mr-1 text-xs text-emerald-500">▲</span>}
                  <span className={cn("text-lg font-black", GRADE_COLORS[draftB.grade] ?? "")}>{draftB.grade}</span>
                </div>
              </div>

              <MetricRow label="Avg ECR" valA={draftA.avgEcr} valB={draftB.avgEcr} higherIsBetter={false} />
              <MetricRow label="Total VBD" valA={draftA.totalVbd} valB={draftB.totalVbd} higherIsBetter={true} />
              <MetricRow label="Avg Value Surplus" valA={avgSurplusA} valB={avgSurplusB} higherIsBetter={true} />
              <MetricRow label="Value Picks (ADP+3)" valA={valuePicksA} valB={valuePicksB} higherIsBetter={true} />
              <MetricRow label="Reaches (ADP−3)" valA={reachesA} valB={reachesB} higherIsBetter={false} />
              <MetricRow label="Total Picks" valA={rodPicksA.length} valB={rodPicksB.length} higherIsBetter={true} />
            </CardContent>
          </Card>

          {/* Positional construction side-by-side */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: draftA.label, picks: rodPicksA, color: "emerald" },
              { label: draftB.label, picks: rodPicksB, color: "blue" },
            ].map(({ label, picks, color }) => (
              <Card key={label} className="border-slate-700/50 bg-slate-800/30">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                    {label} — Positional Construction
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <PositionBar picks={picks} />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Positional count comparison table */}
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-foreground">Positional Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pb-2 mb-1 border-b border-slate-700/50">
                <div className="text-right text-xs font-semibold text-emerald-400 truncate">{draftA.label}</div>
                <div className="text-xs text-muted-foreground text-center px-2 min-w-[60px]">Pos</div>
                <div className="text-left text-xs font-semibold text-blue-400 truncate">{draftB.label}</div>
              </div>
              {allPositions.map(pos => {
                const cntA = posCountsA[pos] ?? 0;
                const cntB = posCountsB[pos] ?? 0;
                return (
                  <div key={pos} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1 border-b border-slate-700/20 last:border-0">
                    <div className={cn("text-right text-sm font-semibold", cntA > cntB ? "text-emerald-400" : cntA < cntB ? "text-muted-foreground" : "text-foreground")}>
                      {cntA > 0 ? `${cntA}×` : "—"}
                      {cntA > cntB && <span className="ml-1 text-xs text-emerald-500">▲</span>}
                    </div>
                    <div className="text-center">
                      <span className={cn("text-xs px-2 py-0.5 rounded border", POS_COLORS[pos] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30")}>
                        {pos}
                      </span>
                    </div>
                    <div className={cn("text-left text-sm font-semibold", cntB > cntA ? "text-emerald-400" : cntB < cntA ? "text-muted-foreground" : "text-foreground")}>
                      {cntB > cntA && <span className="mr-1 text-xs text-emerald-500">▲</span>}
                      {cntB > 0 ? `${cntB}×` : "—"}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Advantage summary */}
          <Card className={cn(
            "border",
            winner === "A" ? "border-emerald-500/30 bg-emerald-500/5"
              : winner === "B" ? "border-blue-500/30 bg-blue-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          )}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <Trophy className={cn("w-5 h-5", winner === "A" ? "text-emerald-400" : winner === "B" ? "text-blue-400" : "text-amber-400")} />
                <p className="text-sm font-semibold text-foreground">
                  {winner === "TIE"
                    ? "These drafts are evenly matched across all metrics."
                    : `${winner === "A" ? draftA.label : draftB.label} is the stronger draft.`}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-emerald-400 font-semibold">{draftA.label}</p>
                  <p className="text-muted-foreground">{aAdvantages} metric advantage{aAdvantages !== 1 ? "s" : ""}</p>
                  {draftA.avgEcr < draftB.avgEcr && <p className="text-xs text-emerald-300">✓ Better avg ECR ({draftA.avgEcr.toFixed(1)} vs {draftB.avgEcr.toFixed(1)})</p>}
                  {draftA.totalVbd > draftB.totalVbd && <p className="text-xs text-emerald-300">✓ Higher total VBD ({draftA.totalVbd} vs {draftB.totalVbd})</p>}
                  {avgSurplusA > avgSurplusB && <p className="text-xs text-emerald-300">✓ Better value surplus ({avgSurplusA.toFixed(1)} vs {avgSurplusB.toFixed(1)})</p>}
                  {valuePicksA > valuePicksB && <p className="text-xs text-emerald-300">✓ More value picks ({valuePicksA} vs {valuePicksB})</p>}
                  {reachesA < reachesB && <p className="text-xs text-emerald-300">✓ Fewer reaches ({reachesA} vs {reachesB})</p>}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-blue-400 font-semibold">{draftB.label}</p>
                  <p className="text-muted-foreground">{bAdvantages} metric advantage{bAdvantages !== 1 ? "s" : ""}</p>
                  {draftB.avgEcr < draftA.avgEcr && <p className="text-xs text-blue-300">✓ Better avg ECR ({draftB.avgEcr.toFixed(1)} vs {draftA.avgEcr.toFixed(1)})</p>}
                  {draftB.totalVbd > draftA.totalVbd && <p className="text-xs text-blue-300">✓ Higher total VBD ({draftB.totalVbd} vs {draftA.totalVbd})</p>}
                  {avgSurplusB > avgSurplusA && <p className="text-xs text-blue-300">✓ Better value surplus ({avgSurplusB.toFixed(1)} vs {avgSurplusA.toFixed(1)})</p>}
                  {valuePicksB > valuePicksA && <p className="text-xs text-blue-300">✓ More value picks ({valuePicksB} vs {valuePicksA})</p>}
                  {reachesB < reachesA && <p className="text-xs text-blue-300">✓ Fewer reaches ({reachesB} vs {reachesA})</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Pick-by-Pick tab ── */}
      {activeTab === "picks" && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Comparing Rod's picks round-by-round. Gap = ADP − Overall pick (positive = value, negative = reach).
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/60">
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium w-10">Rd</th>
                  <th className="text-left px-3 py-2 text-emerald-400 font-medium">{draftA.label}</th>
                  <th className="text-right px-2 py-2 text-emerald-400 font-medium text-xs">Gap A</th>
                  <th className="w-4"></th>
                  <th className="text-left px-3 py-2 text-blue-400 font-medium">{draftB.label}</th>
                  <th className="text-right px-2 py-2 text-blue-400 font-medium text-xs">Gap B</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map(rd => {
                  const pickA = rodPicksA.find(p => p.round === rd);
                  const pickB = rodPicksB.find(p => p.round === rd);
                  const gapA = pickA?.player.adp != null ? Math.round(pickA.player.adp - pickA.overall) : null;
                  const gapB = pickB?.player.adp != null ? Math.round(pickB.player.adp - pickB.overall) : null;
                  return (
                    <tr key={rd} className="border-b border-slate-700/20 hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-2.5 text-muted-foreground font-medium">{rd}</td>
                      {/* Draft A pick */}
                      <td className="px-3 py-2.5">
                        {pickA ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn("text-xs px-1.5 py-0 h-5 shrink-0", POS_COLORS[pickA.player.position] ?? "")}>
                              {pickA.player.position}
                            </Badge>
                            <span className="text-foreground font-medium">{pickA.player.name}</span>
                            <span className="text-xs text-muted-foreground">#{pickA.overall}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className={cn("px-2 py-2.5 text-right text-xs font-semibold",
                        gapA == null ? "text-muted-foreground"
                          : gapA > 3 ? "text-emerald-400"
                          : gapA < -3 ? "text-red-400"
                          : "text-muted-foreground"
                      )}>
                        {gapA == null ? "—" : gapA > 0 ? `+${gapA}` : `${gapA}`}
                      </td>
                      <td className="text-center text-slate-600 text-xs">|</td>
                      {/* Draft B pick */}
                      <td className="px-3 py-2.5">
                        {pickB ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn("text-xs px-1.5 py-0 h-5 shrink-0", POS_COLORS[pickB.player.position] ?? "")}>
                              {pickB.player.position}
                            </Badge>
                            <span className="text-foreground font-medium">{pickB.player.name}</span>
                            <span className="text-xs text-muted-foreground">#{pickB.overall}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className={cn("px-2 py-2.5 text-right text-xs font-semibold",
                        gapB == null ? "text-muted-foreground"
                          : gapB > 3 ? "text-emerald-400"
                          : gapB < -3 ? "text-red-400"
                          : "text-muted-foreground"
                      )}>
                        {gapB == null ? "—" : gapB > 0 ? `+${gapB}` : `${gapB}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── All Teams tab ── */}
      {activeTab === "teams" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {[
            { label: draftA.label, teamMap: teamMapA, rodPicks: rodPicksA, color: "emerald" },
            { label: draftB.label, teamMap: teamMapB, rodPicks: rodPicksB, color: "blue" },
          ].map(({ label, teamMap, rodPicks: rp, color }) => (
            <div key={label} className="space-y-3">
              <h3 className={cn("text-sm font-semibold", color === "emerald" ? "text-emerald-400" : "text-blue-400")}>
                {label} — All Teams
              </h3>
              {Object.entries(teamMap).map(([owner, picks]) => {
                const posCnt: Record<string, number> = {};
                for (const p of picks) posCnt[p.player.position] = (posCnt[p.player.position] ?? 0) + 1;
                const isRod = owner === (rp[0]?.owner ?? "");
                return (
                  <Card key={owner} className={cn("border", isRod ? "border-primary/40 bg-primary/5" : "border-slate-700/50 bg-slate-800/30")}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground truncate">{owner}</span>
                        {isRod && <span className="text-xs text-primary font-semibold shrink-0 ml-2">YOU</span>}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {Object.entries(posCnt).map(([pos, cnt]) => (
                          <span key={pos} className={cn("text-xs px-1.5 py-0.5 rounded border", POS_COLORS[pos] ?? "")}>
                            {pos}×{cnt}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single draft detail view ─────────────────────────────────────────────────

function DraftDetailView({ draftId, onClose }: { draftId: number; onClose: () => void }) {
  const { data, isLoading } = trpc.draftBoard.getDraft.useQuery({ id: draftId });

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Loading draft details…</div>;
  if (!data) return <div className="p-6 text-muted-foreground text-sm">Draft not found.</div>;

  const rodPicks = (data.rodPicksJson as PickEntry[]) ?? [];
  const allPicks = (data.allPicksJson as PickEntry[]) ?? [];

  const teamMap: Record<string, PickEntry[]> = {};
  for (const p of allPicks) {
    if (!teamMap[p.owner]) teamMap[p.owner] = [];
    teamMap[p.owner].push(p);
  }

  const posCounts: Record<string, number> = {};
  for (const p of rodPicks) {
    posCounts[p.player.position] = (posCounts[p.player.position] ?? 0) + 1;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">{data.label}</h2>
          <p className="text-sm text-muted-foreground">{formatDate(data.createdAt)} · Slot {data.draftSlot} · {data.totalRounds} rounds</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>← Back to List</Button>
      </div>

      <Card className="border-emerald-500/30 bg-emerald-500/10">
        <CardContent className="p-5 flex items-center gap-6 flex-wrap">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Grade</p>
            <GradeDisplay grade={data.grade} />
          </div>
          <div className="space-y-1">
            <p className="text-emerald-300 font-semibold">Your Draft Results</p>
            <p className="text-sm text-muted-foreground">Avg ECR: <span className="text-foreground font-medium">{data.avgEcr.toFixed(1)}</span></p>
            <p className="text-sm text-muted-foreground">Total VBD: <span className="text-foreground font-medium">{data.totalVbd}</span></p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(posCounts).map(([pos, cnt]) => (
              <span key={pos} className={cn("text-xs px-2 py-1 rounded border", POS_COLORS[pos] ?? "")}>
                {pos} ×{cnt}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Your Picks</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/50">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Rd</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Pick</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Overall</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Pos</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Player</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Team</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">ECR</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">ADP</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">Gap</th>
              </tr>
            </thead>
            <tbody>
              {rodPicks.map((p) => {
                const gap = p.player.adp != null ? Math.round(p.player.adp - p.overall) : null;
                return (
                  <tr key={p.overall} className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground">{p.round}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.pick}</td>
                    <td className="px-3 py-2 text-muted-foreground">#{p.overall}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={cn("text-xs px-1.5 py-0 h-5", POS_COLORS[p.player.position] ?? "")}>
                        {p.player.position}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-foreground font-medium">{p.player.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.player.team}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">#{p.player.ecrRank}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {p.player.adp != null ? p.player.adp.toFixed(1) : "—"}
                    </td>
                    <td className={cn("px-3 py-2 text-right font-medium", gap == null ? "text-muted-foreground" : gap > 0 ? "text-emerald-400" : gap < 0 ? "text-red-400" : "text-muted-foreground")}>
                      {gap == null ? "—" : gap > 0 ? `+${gap}` : `${gap}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Gap = ADP − Overall pick. Positive = value (went later than expected), negative = reach.</p>
      </div>

      {Object.keys(teamMap).length > 1 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" /> All Teams
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Object.entries(teamMap).map(([owner, picks]) => {
              const posCnt: Record<string, number> = {};
              for (const p of picks) posCnt[p.player.position] = (posCnt[p.player.position] ?? 0) + 1;
              const isRod = owner === (rodPicks[0]?.owner ?? "");
              return (
                <Card key={owner} className={cn("border", isRod ? "border-primary/40 bg-primary/5" : "border-slate-700/50 bg-slate-800/30")}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground truncate">{owner}</span>
                      {isRod && <span className="text-xs text-primary font-semibold shrink-0 ml-2">YOU</span>}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {Object.entries(posCnt).map(([pos, cnt]) => (
                        <span key={pos} className={cn("text-xs px-1.5 py-0.5 rounded border", POS_COLORS[pos] ?? "")}>
                          {pos}×{cnt}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main SavedDrafts page ────────────────────────────────────────────────────

export default function SavedDrafts() {
  const utils = trpc.useUtils();
  const { data: drafts = [], isLoading } = trpc.draftBoard.listDrafts.useQuery();
  const deleteMutation = trpc.draftBoard.deleteDraft.useMutation({
    onSuccess: () => {
      utils.draftBoard.listDrafts.invalidate();
      toast.success("Draft deleted.");
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const [view, setView] = useState<
    | { mode: "list" }
    | { mode: "detail"; draftId: number }
    | { mode: "compare"; draftAId: number; draftBId: number }
  >({ mode: "list" });

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  };

  const canCompare = selectedIds.length === 2;

  const bestGrade = useMemo(() => drafts.reduce<SavedDraft | null>((best, d) => {
    if (!best) return d;
    return GRADE_ORDER.indexOf(d.grade) < GRADE_ORDER.indexOf(best.grade) ? d : best;
  }, null), [drafts]);

  if (view.mode === "detail") {
    return <DraftDetailView draftId={view.draftId} onClose={() => setView({ mode: "list" })} />;
  }

  if (view.mode === "compare") {
    return (
      <ComparisonView
        draftAId={view.draftAId}
        draftBId={view.draftBId}
        onClose={() => setView({ mode: "list" })}
      />
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Saved Mock Drafts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review and compare your completed mock draft simulations.
          </p>
        </div>
        {drafts.length >= 2 && (
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {selectedIds.length}/2 selected
              </span>
            )}
            <Button
              variant={canCompare ? "default" : "outline"}
              size="sm"
              disabled={!canCompare}
              onClick={() => {
                if (canCompare) {
                  setView({ mode: "compare", draftAId: selectedIds[0], draftBId: selectedIds[1] });
                }
              }}
              className="gap-1.5"
            >
              <GitCompare className="w-4 h-4" />
              Compare Selected
            </Button>
            {selectedIds.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} className="gap-1">
                <X className="w-3.5 h-3.5" /> Clear
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Selection hint */}
      {drafts.length >= 2 && selectedIds.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-slate-800/40 border border-slate-700/40 rounded-lg px-4 py-2.5">
          <GitCompare className="w-3.5 h-3.5 shrink-0" />
          Select any 2 drafts to compare them side-by-side — grades, positional construction, ECR, VBD, and pick-by-pick analysis.
        </div>
      )}
      {drafts.length >= 2 && selectedIds.length === 1 && (
        <div className="flex items-center gap-2 text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2.5">
          <CheckSquare className="w-3.5 h-3.5 shrink-0" />
          1 draft selected — pick one more to enable comparison.
        </div>
      )}

      {/* Summary stats */}
      {drafts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Trophy className="w-8 h-8 text-amber-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Total Mocks</p>
                <p className="text-2xl font-bold text-foreground">{drafts.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Target className="w-8 h-8 text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Best Grade</p>
                <p className={cn("text-2xl font-bold", GRADE_COLORS[bestGrade?.grade ?? ""] ?? "text-foreground")}>
                  {bestGrade?.grade ?? "—"}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-blue-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Avg ECR (best)</p>
                <p className="text-2xl font-bold text-foreground">
                  {bestGrade ? bestGrade.avgEcr.toFixed(1) : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="w-8 h-8 text-purple-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Latest</p>
                <p className="text-sm font-semibold text-foreground">
                  {drafts[0] ? new Date(drafts[0].createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Draft list */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">Loading saved drafts…</div>
      ) : drafts.length === 0 ? (
        <Card className="border-slate-700/50 bg-slate-800/30">
          <CardContent className="p-12 text-center">
            <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="text-foreground font-medium mb-1">No saved drafts yet</p>
            <p className="text-muted-foreground text-sm">
              Complete a mock draft in the Mock Draft Simulator tab and click "Save Draft Results" to save it here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => {
            const isSelected = selectedIds.includes(d.id);
            const selectionIndex = selectedIds.indexOf(d.id);
            return (
              <Card
                key={d.id}
                className={cn(
                  "border transition-colors cursor-pointer",
                  isSelected
                    ? selectionIndex === 0
                      ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/30"
                      : "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/30"
                    : bestGrade?.id === d.id
                    ? "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/8"
                    : "border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50"
                )}
                onClick={() => toggleSelect(d.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Selection checkbox */}
                    <div className="shrink-0" onClick={e => { e.stopPropagation(); toggleSelect(d.id); }}>
                      {isSelected ? (
                        <div className={cn(
                          "w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold",
                          selectionIndex === 0 ? "bg-emerald-500" : "bg-blue-500"
                        )}>
                          {selectionIndex + 1}
                        </div>
                      ) : (
                        <Square className="w-5 h-5 text-slate-600" />
                      )}
                    </div>

                    {/* Grade */}
                    <div className="text-center w-12 shrink-0">
                      <span className={cn("text-3xl font-black", GRADE_COLORS[d.grade] ?? "text-foreground")}>{d.grade}</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">{d.label}</p>
                        {bestGrade?.id === d.id && (
                          <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400 bg-amber-500/10">Best</Badge>
                        )}
                        {isSelected && (
                          <Badge variant="outline" className={cn(
                            "text-xs",
                            selectionIndex === 0 ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" : "border-blue-500/40 text-blue-400 bg-blue-500/10"
                          )}>
                            {selectionIndex === 0 ? "Draft A" : "Draft B"}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>Slot {d.draftSlot}</span>
                        <span>·</span>
                        <span>Avg ECR {d.avgEcr.toFixed(1)}</span>
                        <span>·</span>
                        <span>VBD {d.totalVbd}</span>
                        <span>·</span>
                        <span>{formatDate(d.createdAt)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setView({ mode: "detail", draftId: d.id })}
                        className="gap-1.5 text-xs"
                      >
                        View Details <ChevronDown className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletingId === d.id || deleteMutation.isPending}
                        onClick={() => {
                          setDeletingId(d.id);
                          deleteMutation.mutate({ id: d.id }, {
                            onSettled: () => setDeletingId(null),
                            onSuccess: () => setSelectedIds(prev => prev.filter(x => x !== d.id)),
                          });
                        }}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
