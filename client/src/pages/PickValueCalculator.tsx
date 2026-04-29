import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PickEntry { round: number; pickInRound: number }

// ── Helpers ───────────────────────────────────────────────────────────────────
const TEAMS = 14;
const ROUNDS = 15;

function verdictStyle(v: string) {
  if (v === "WIN") return "bg-emerald-600/30 text-emerald-300 border-emerald-500/50";
  if (v === "FAIR") return "bg-yellow-600/20 text-yellow-300 border-yellow-500/40";
  return "bg-red-600/20 text-red-300 border-red-500/40";
}

function verdictIcon(v: string) {
  if (v === "WIN") return "✅";
  if (v === "FAIR") return "🤝";
  return "❌";
}

function valueColor(value: number) {
  if (value >= 2000) return "text-red-400";
  if (value >= 1000) return "text-orange-400";
  if (value >= 500) return "text-yellow-400";
  if (value >= 200) return "text-blue-400";
  return "text-slate-400";
}

function valueBg(value: number) {
  if (value >= 2000) return "bg-red-900/30 border-red-700/40";
  if (value >= 1000) return "bg-orange-900/20 border-orange-700/30";
  if (value >= 500) return "bg-yellow-900/20 border-yellow-700/30";
  if (value >= 200) return "bg-blue-900/20 border-blue-700/30";
  return "bg-slate-800/40 border-slate-700/30";
}

// ── Pick Selector ─────────────────────────────────────────────────────────────
function PickSelector({
  label,
  picks,
  onAdd,
  onRemove,
  chart,
}: {
  label: string;
  picks: PickEntry[];
  onAdd: (p: PickEntry) => void;
  onRemove: (i: number) => void;
  chart: Array<{ overall: number; round: number; pickInRound: number; label: string; value: number }>;
}) {
  const [selRound, setSelRound] = useState("1");
  const [selPick, setSelPick] = useState("1");

  const picksForRound = useMemo(() => {
    const r = parseInt(selRound);
    return chart.filter((p) => p.round === r).sort((a, b) => a.pickInRound - b.pickInRound);
  }, [selRound, chart]);

  const totalValue = useMemo(() => {
    return picks.reduce((sum, p) => {
      const entry = chart.find((c) => c.round === p.round && c.pickInRound === p.pickInRound);
      return sum + (entry?.value ?? 0);
    }, 0);
  }, [picks, chart]);

  const isYou = label === "YOU GET";

  return (
    <div className={`flex-1 rounded-2xl border p-5 space-y-4 ${isYou ? "border-emerald-700/50 bg-emerald-950/20" : "border-red-700/50 bg-red-950/20"}`}>
      <div className={`text-xs font-bold uppercase tracking-widest ${isYou ? "text-emerald-400" : "text-red-400"}`}>{label}</div>

      {/* Add pick controls */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <div className="text-xs text-slate-500 mb-1">Round</div>
          <Select value={selRound} onValueChange={setSelRound}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: ROUNDS }, (_, i) => i + 1).map((r) => (
                <SelectItem key={r} value={String(r)}>Round {r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <div className="text-xs text-slate-500 mb-1">Pick</div>
          <Select value={selPick} onValueChange={setSelPick}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {picksForRound.map((p) => (
                <SelectItem key={p.label} value={String(p.pickInRound)}>
                  {p.label} <span className="text-slate-500 ml-1">({p.value})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          className={`h-9 px-4 ${isYou ? "bg-emerald-700 hover:bg-emerald-600" : "bg-red-700 hover:bg-red-600"} text-white`}
          onClick={() => onAdd({ round: parseInt(selRound), pickInRound: parseInt(selPick) })}
        >
          + Add
        </Button>
      </div>

      {/* Added picks */}
      <div className="space-y-2 min-h-[80px]">
        {picks.length === 0 && (
          <div className="text-xs text-slate-600 text-center py-6">No picks added yet</div>
        )}
        {picks.map((p, i) => {
          const entry = chart.find((c) => c.round === p.round && c.pickInRound === p.pickInRound);
          return (
            <div key={i} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${valueBg(entry?.value ?? 0)}`}>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-white">{entry?.label ?? `${p.round}.${p.pickInRound}`}</span>
                <span className={`text-xs font-semibold ${valueColor(entry?.value ?? 0)}`}>{entry?.value ?? "—"} pts</span>
              </div>
              <button onClick={() => onRemove(i)} className="text-slate-500 hover:text-red-400 text-xs px-1">✕</button>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className={`flex justify-between items-center pt-3 border-t ${isYou ? "border-emerald-800/50" : "border-red-800/50"}`}>
        <span className="text-xs text-slate-400">Total Value</span>
        <span className={`text-xl font-bold ${isYou ? "text-emerald-300" : "text-red-300"}`}>{totalValue.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ── Verdict Panel ─────────────────────────────────────────────────────────────
function VerdictPanel({ sideA, sideB, chart }: { sideA: PickEntry[]; sideB: PickEntry[]; chart: Array<{ round: number; pickInRound: number; value: number }> }) {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading } = trpc.pickTradeEval.useQuery(
    { sideA, sideB },
    { enabled: enabled && sideA.length > 0 && sideB.length > 0 }
  );

  if (sideA.length === 0 || sideB.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        Add picks to both sides to evaluate the trade
      </div>
    );
  }

  // Compute locally for instant feedback
  const valueA = sideA.reduce((s, p) => {
    const e = chart.find((c) => c.round === p.round && c.pickInRound === p.pickInRound);
    return s + (e?.value ?? 0);
  }, 0);
  const valueB = sideB.reduce((s, p) => {
    const e = chart.find((c) => c.round === p.round && c.pickInRound === p.pickInRound);
    return s + (e?.value ?? 0);
  }, 0);
  const pct = valueB > 0 ? Math.round((valueA / valueB) * 100) : 0;
  const verdict = pct >= 110 ? "WIN" : pct >= 90 ? "FAIR" : "LOSS";
  const diff = valueA - valueB;

  return (
    <div className="space-y-4">
      {/* Main verdict */}
      <div className={`rounded-2xl border p-6 text-center ${verdictStyle(verdict)}`}>
        <div className="text-5xl mb-2">{verdictIcon(verdict)}</div>
        <div className="text-3xl font-black tracking-tight">{verdict}</div>
        <div className="text-sm mt-1 opacity-80">
          {verdict === "WIN" && "You're getting the better end of this deal"}
          {verdict === "FAIR" && "This trade is roughly even in pick value"}
          {verdict === "LOSS" && "You're giving up more value than you're receiving"}
        </div>
      </div>

      {/* Value breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-4 text-center">
          <div className="text-xs text-emerald-400 uppercase tracking-wide mb-1">You Get</div>
          <div className="text-2xl font-bold text-emerald-300">{valueA.toLocaleString()}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Difference</div>
          <div className={`text-2xl font-bold ${diff >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {diff >= 0 ? "+" : ""}{diff.toLocaleString()}
          </div>
        </div>
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-center">
          <div className="text-xs text-red-400 uppercase tracking-wide mb-1">You Give</div>
          <div className="text-2xl font-bold text-red-300">{valueB.toLocaleString()}</div>
        </div>
      </div>

      {/* Percentage bar */}
      <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4">
        <div className="flex justify-between text-xs text-slate-400 mb-2">
          <span>Trade Ratio</span>
          <span className={`font-semibold ${pct >= 110 ? "text-emerald-400" : pct >= 90 ? "text-yellow-400" : "text-red-400"}`}>{pct}%</span>
        </div>
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 110 ? "bg-emerald-500" : pct >= 90 ? "bg-yellow-500" : "bg-red-500"}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>LOSS (&lt;90%)</span>
          <span>FAIR (90–110%)</span>
          <span>WIN (&gt;110%)</span>
        </div>
      </div>
    </div>
  );
}

// ── Full Value Chart Table ────────────────────────────────────────────────────
function ValueChartTable({ chart }: { chart: Array<{ overall: number; round: number; pickInRound: number; label: string; value: number }> }) {
  const [filterRound, setFilterRound] = useState<number | null>(null);
  const filtered = filterRound ? chart.filter((p) => p.round === filterRound) : chart;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={filterRound === null ? "default" : "outline"}
          onClick={() => setFilterRound(null)}
          className="text-xs h-7"
        >All Rounds</Button>
        {Array.from({ length: ROUNDS }, (_, i) => i + 1).map((r) => (
          <Button
            key={r}
            size="sm"
            variant={filterRound === r ? "default" : "outline"}
            onClick={() => setFilterRound(r)}
            className="text-xs h-7"
          >Rd {r}</Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/60">
              <th className="text-left px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">Pick</th>
              <th className="text-left px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">Overall</th>
              <th className="text-right px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">Value</th>
              <th className="text-right px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">Tier</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.overall} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-2.5 font-bold text-white">{p.label}</td>
                <td className="px-4 py-2.5 text-slate-400">#{p.overall}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${valueColor(p.value)}`}>{p.value.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right">
                  {p.value >= 2000 && <Badge className="bg-red-600/30 text-red-300 border-red-500/50 text-xs">Elite</Badge>}
                  {p.value >= 1000 && p.value < 2000 && <Badge className="bg-orange-600/20 text-orange-300 border-orange-500/40 text-xs">Premium</Badge>}
                  {p.value >= 500 && p.value < 1000 && <Badge className="bg-yellow-600/20 text-yellow-300 border-yellow-500/40 text-xs">Solid</Badge>}
                  {p.value >= 200 && p.value < 500 && <Badge className="bg-blue-600/20 text-blue-300 border-blue-500/40 text-xs">Value</Badge>}
                  {p.value < 200 && <Badge className="bg-slate-700/50 text-slate-400 border-slate-600/40 text-xs">Filler</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PickValueCalculator() {
  const { data: chart, isLoading } = trpc.pickValueChart.useQuery();
  const [sideA, setSideA] = useState<PickEntry[]>([]);
  const [sideB, setSideB] = useState<PickEntry[]>([]);

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">Pick Value Calculator</h1>
            <Badge className="bg-blue-600/30 text-blue-300 border-blue-500/50 text-xs">14-Team PPR</Badge>
          </div>
          <p className="text-sm text-slate-400">
            Jimmy Johnson-style pick value chart calibrated for a 14-team PPR keeper league.
            Add picks to each side to instantly evaluate any draft pick trade.
          </p>
        </div>

        <Tabs defaultValue="calculator">
          <TabsList className="bg-slate-800/60 border border-slate-700/40">
            <TabsTrigger value="calculator" className="data-[state=active]:bg-slate-700">Trade Calculator</TabsTrigger>
            <TabsTrigger value="chart" className="data-[state=active]:bg-slate-700">Full Value Chart</TabsTrigger>
            <TabsTrigger value="methodology" className="data-[state=active]:bg-slate-700">Methodology</TabsTrigger>
          </TabsList>

          {/* ── Calculator Tab ── */}
          <TabsContent value="calculator" className="space-y-6 mt-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : chart ? (
              <>
                <div className="flex gap-4">
                  <PickSelector
                    label="YOU GET"
                    picks={sideA}
                    onAdd={(p) => setSideA((prev) => [...prev, p])}
                    onRemove={(i) => setSideA((prev) => prev.filter((_, idx) => idx !== i))}
                    chart={chart}
                  />
                  <div className="flex items-center justify-center text-2xl text-slate-600 font-bold px-2">⇄</div>
                  <PickSelector
                    label="YOU GIVE"
                    picks={sideB}
                    onAdd={(p) => setSideB((prev) => [...prev, p])}
                    onRemove={(i) => setSideB((prev) => prev.filter((_, idx) => idx !== i))}
                    chart={chart}
                  />
                </div>

                <Card className="bg-slate-900/60 border-slate-700/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Trade Verdict</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <VerdictPanel sideA={sideA} sideB={sideB} chart={chart} />
                  </CardContent>
                </Card>

                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSideA([]); setSideB([]); }}
                    className="text-slate-400 border-slate-700 hover:bg-slate-800"
                  >
                    Clear All Picks
                  </Button>
                </div>
              </>
            ) : null}
          </TabsContent>

          {/* ── Chart Tab ── */}
          <TabsContent value="chart" className="mt-4">
            {isLoading ? (
              <Skeleton className="h-96 rounded-xl" />
            ) : chart ? (
              <ValueChartTable chart={chart} />
            ) : null}
          </TabsContent>

          {/* ── Methodology Tab ── */}
          <TabsContent value="methodology" className="mt-4">
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="pt-6 space-y-5 text-sm text-slate-300 leading-relaxed">
                <div>
                  <div className="text-base font-semibold text-white mb-2">How This Chart Was Built</div>
                  <p>
                    The original Jimmy Johnson chart was designed for 32-team NFL drafts. This chart is recalibrated
                    for a <strong>14-team PPR keeper league</strong> using an exponential decay formula:
                  </p>
                  <div className="bg-slate-800/80 rounded-lg p-3 mt-3 font-mono text-xs text-blue-300">
                    value(overall) = 3000 × e^(−0.028 × (overall − 1))
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-white mb-2">Key Calibration Points</div>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-2 text-slate-400">Pick</th>
                        <th className="text-right py-2 text-slate-400">Value</th>
                        <th className="text-right py-2 text-slate-400">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="space-y-1">
                      {[
                        { pick: "1.01", value: "3,000", note: "Anchor — top overall pick" },
                        { pick: "1.07", value: "2,536", note: "Mid-first round" },
                        { pick: "1.14", value: "2,085", note: "End of round 1" },
                        { pick: "2.01", value: "1,409", note: "Turn of round 2 (snake)" },
                        { pick: "3.14", value: "952", note: "End of round 3" },
                        { pick: "5.14", value: "435", note: "End of round 5" },
                        { pick: "10.01", value: "61", note: "Late round — filler territory" },
                      ].map((r) => (
                        <tr key={r.pick} className="border-b border-slate-800/60">
                          <td className="py-2 font-bold text-white">{r.pick}</td>
                          <td className="py-2 text-right text-blue-300">{r.value}</td>
                          <td className="py-2 text-right text-slate-500">{r.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <div className="font-semibold text-white mb-2">Verdict Thresholds</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-4 py-2">
                      <span className="text-emerald-400 font-bold text-sm">WIN</span>
                      <span className="text-slate-400 text-xs">You receive ≥ 110% of the value you give up</span>
                    </div>
                    <div className="flex items-center gap-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-4 py-2">
                      <span className="text-yellow-400 font-bold text-sm">FAIR</span>
                      <span className="text-slate-400 text-xs">Trade ratio is between 90% and 110%</span>
                    </div>
                    <div className="flex items-center gap-3 bg-red-900/20 border border-red-700/30 rounded-lg px-4 py-2">
                      <span className="text-red-400 font-bold text-sm">LOSS</span>
                      <span className="text-slate-400 text-xs">You receive &lt; 90% of the value you give up</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-white mb-2">Keeper League Adjustments</div>
                  <p className="text-slate-400">
                    In a keeper league, early picks carry a premium because elite players are often retained,
                    making the top of the board more unpredictable. The exponential decay rate (k = 0.028)
                    is slightly steeper than a standard redraft chart, reflecting the higher variance and
                    scarcity of top-end talent in rounds 1–3. PPR scoring compresses the gap between
                    round 1 and round 2 picks slightly by elevating WR and TE values throughout the board.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
