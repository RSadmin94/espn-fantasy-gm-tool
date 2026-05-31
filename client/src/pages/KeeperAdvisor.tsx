import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Loader2, AlertTriangle, CheckCircle, XCircle, MinusCircle,
  HelpCircle, Dna, Brain, Sparkles, ChevronDown, Info,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

type KeeperEntry = {
  ownerName:           string;
  teamName:            string;
  playerName:          string;
  nflTeam:             string;
  position:            string;
  slot:                string;
  acquisitionType:     string;
  keepYear:            0 | 1;
  isLastKeeperYear:    boolean;
  keeperRoundCost:     number;
  costSource:          "espn_stored" | "draft_history_round" | "fa_fixed";
  originalDraftRound:  number | null;
  originalDraftSeason: number | null;
  lastKeptSeason:      number | null;
  lastKeptRound:       number | null;
};

type Confidence = "ELITE" | "HIGH" | "MEDIUM" | "LOW";
type Recommendation = "KEEP" | "CONSIDER" | "SKIP" | "DROP";

// ─── KVS Formula (deterministic — no player stats required) ──────────────────
// Based on draft round cost. Lower cost round = higher value.
// Round 1 = 93, Round 2 = 86, Round 3 = 79 ... degrading by ~7 per round.
// Last-year keepers get +6 urgency bonus.

function calcKVS(entry: KeeperEntry): number {
  const base = Math.max(10, Math.min(95, 100 - (entry.keeperRoundCost - 1) * 7));
  const urgency = entry.isLastKeeperYear ? 6 : 0;
  return Math.min(98, base + urgency);
}

function kvsToConfidence(kvs: number): Confidence {
  if (kvs >= 80) return "ELITE";
  if (kvs >= 65) return "HIGH";
  if (kvs >= 45) return "MEDIUM";
  return "LOW";
}

function kvsToRecommendation(kvs: number, isLastYear: boolean): Recommendation {
  if (isLastYear || kvs >= 70) return "KEEP";
  if (kvs >= 48) return "CONSIDER";
  if (kvs >= 32) return "SKIP";
  return "DROP";
}

// ─── Position colors ──────────────────────────────────────────────────────────

const POS_STYLE: Record<string, string> = {
  QB:   "text-red-400 font-bold",
  RB:   "text-emerald-400 font-bold",
  WR:   "text-blue-400 font-bold",
  TE:   "text-orange-400 font-bold",
  K:    "text-zinc-400 font-bold",
  "D/ST": "text-violet-400 font-bold",
};

function kvsColor(kvs: number) {
  if (kvs >= 70) return "text-emerald-400";
  if (kvs >= 48) return "text-amber-400";
  return "text-red-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceBadge({ conf }: { conf: Confidence }) {
  const styles: Record<Confidence, string> = {
    ELITE:  "text-emerald-400 font-semibold",
    HIGH:   "text-emerald-300 font-semibold",
    MEDIUM: "text-amber-400 font-semibold",
    LOW:    "text-red-400 font-semibold",
  };
  return <span className={cn("text-xs uppercase tracking-wide", styles[conf])}>{conf}</span>;
}

function RecButton({ rec, isLastYear }: { rec: Recommendation; isLastYear: boolean }) {
  const base = "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide border transition-opacity";
  if (rec === "KEEP") return (
    <span className={cn(base, isLastYear
      ? "border-amber-600 bg-amber-600/20 text-amber-300"
      : "border-emerald-600 bg-emerald-600/20 text-emerald-300")}>
      <CheckCircle className="h-3 w-3" /> {isLastYear ? "KEEP*" : "KEEP"}
    </span>
  );
  if (rec === "CONSIDER") return (
    <span className={cn(base, "border-amber-600 bg-amber-600/15 text-amber-400")}>
      <HelpCircle className="h-3 w-3" /> CONSIDER
    </span>
  );
  if (rec === "SKIP") return (
    <span className={cn(base, "border-zinc-600 bg-zinc-700/40 text-zinc-400")}>
      <MinusCircle className="h-3 w-3" /> SKIP
    </span>
  );
  return (
    <span className={cn(base, "border-red-700 bg-red-700/15 text-red-400")}>
      <XCircle className="h-3 w-3" /> DROP
    </span>
  );
}

// ─── Keeper DNA sidebar ───────────────────────────────────────────────────────

function KeeperDNA({ pool, ownerFilter }: { pool: KeeperEntry[]; ownerFilter: string }) {
  const subset = ownerFilter === "all" ? pool : pool.filter(p => p.ownerName === ownerFilter);
  const total = subset.length;

  const keeperPicks = subset.filter(p => p.keepYear === 1 || p.isLastKeeperYear);
  const keeperRate = total > 0 ? Math.round((keeperPicks.length / total) * 100) : 0;

  const avgRound = total > 0
    ? (subset.reduce((s, p) => s + p.keeperRoundCost, 0) / total).toFixed(1)
    : "—";

  const posDist: Record<string, number> = {};
  for (const p of subset) posDist[p.position] = (posDist[p.position] ?? 0) + 1;
  const topPos = Object.entries(posDist).sort((a, b) => b[1] - a[1])[0];
  const topPosPct = topPos && total > 0 ? Math.round((topPos[1] / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-[#0f131c] p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-900/40">
          <Dna className="h-4 w-4 text-emerald-400" />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-100">Your Keeper DNA</h3>
      </div>
      <p className="mb-4 text-[11px] text-zinc-500">Insights from your historical keeper patterns.</p>

      <div className="space-y-3">
        {[
          { icon: "📊", label: "Keeper Rate", value: total > 0 ? `${keeperRate}%` : "—" },
          { icon: "📅", label: "Avg Keeper Round", value: avgRound },
          { icon: "👥", label: "Most Kept Position", value: topPos ? `${topPos[0]} (${topPosPct}%)` : "—" },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between gap-2 border-t border-zinc-800/60 pt-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base">{row.icon}</span>
              <span className="text-xs text-zinc-400">{row.label}</span>
            </div>
            <span className="text-sm font-bold text-zinc-100">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Insight sidebar ───────────────────────────────────────────────────────

function AIInsight({ pool, ownerFilter }: { pool: KeeperEntry[]; ownerFilter: string }) {
  const subset = ownerFilter === "all" ? pool : pool.filter(p => p.ownerName === ownerFilter);

  const posDist: Record<string, number> = {};
  for (const p of subset) posDist[p.position] = (posDist[p.position] ?? 0) + 1;
  const topPos = Object.entries(posDist).sort((a, b) => b[1] - a[1])[0];

  // Find highest KVS player
  const ranked = [...subset].sort((a, b) => calcKVS(b) - calcKVS(a));
  const topPlayer = ranked[0];

  let insight = "Run a Full Import to generate keeper insights for your roster.";

  if (topPlayer && topPos) {
    const kvs = calcKVS(topPlayer);
    const topPosName = topPos[0];
    if (topPosName === "RB" && topPlayer.position !== "RB") {
      insight = `Based on your Draft DNA, you tend to overvalue RBs. Consider keeping ${topPlayer.playerName} (${topPlayer.position}, Rd ${topPlayer.keeperRoundCost}) over a RB this year.`;
    } else if (kvs >= 70) {
      insight = `${topPlayer.playerName} is your top keeper value at Round ${topPlayer.keeperRoundCost} — strong hold${topPlayer.isLastKeeperYear ? " (last eligible year)" : ""}. ${topPosName} heavy this year at ${posDist[topPosName] ?? 0} eligible.`;
    } else {
      insight = `No standout keeper values this season. Your best option is ${topPlayer.playerName} at Round ${topPlayer.keeperRoundCost}. Consider letting high-cost players re-enter the draft pool.`;
    }
  }

  return (
    <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-800/50">
            <Brain className="h-4 w-4 text-amber-400" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">AI Insight</h3>
        </div>
        <Sparkles className="h-4 w-4 text-amber-400/60" />
      </div>
      <p className="text-sm leading-relaxed text-amber-100/90">{insight}</p>
      <p className="mt-2 text-[10px] text-amber-700/80">Deterministic analysis · No LLM · Based on draft history</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function KeeperAdvisor() {
  const draftYear    = new Date().getFullYear();
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [posFilter,   setPosFilter]   = useState<string>("all");
  const [maxKeepers,  setMaxKeepers]  = useState<string>("all");

  const poolQ = trpc.espn.keeperPool.useQuery({ draftYear });

  const pool = useMemo((): KeeperEntry[] => {
    const raw = (poolQ.data as { pool?: KeeperEntry[] } | undefined)?.pool;
    return Array.isArray(raw) ? (raw as KeeperEntry[]) : [];
  }, [poolQ.data]);

  const errorMsg = (poolQ.data as { error?: string } | undefined)?.error;
  const hintMsg  = (poolQ.data as { hint?: string }  | undefined)?.hint;

  const owners    = useMemo(() => [...new Set(pool.map(p => p.ownerName))].sort(), [pool]);
  const positions = useMemo(() => [...new Set(pool.map(p => p.position).filter(Boolean))].sort(), [pool]);

  // Sort by KVS descending, then apply filters
  const sorted = useMemo(() => [...pool].sort((a, b) => calcKVS(b) - calcKVS(a)), [pool]);

  const filtered = useMemo(() => {
    let rows = sorted.filter(p => {
      if (ownerFilter !== "all" && p.ownerName !== ownerFilter) return false;
      if (posFilter   !== "all" && p.position   !== posFilter)   return false;
      return true;
    });
    if (maxKeepers !== "all") {
      const max = parseInt(maxKeepers, 10);
      const ownerCounts = new Map<string, number>();
      rows = rows.filter(p => {
        const c = ownerCounts.get(p.ownerName) ?? 0;
        if (c >= max) return false;
        ownerCounts.set(p.ownerName, c + 1);
        return true;
      });
    }
    return rows;
  }, [sorted, ownerFilter, posFilter, maxKeepers]);

  // Loading
  if (poolQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Building keeper pool…
      </div>
    );
  }

  // Error
  if (errorMsg) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <p className="text-lg font-semibold text-zinc-100">No draft data found</p>
        <p className="mt-1 text-sm text-zinc-400">{hintMsg ?? errorMsg}</p>
        <p className="mt-4 text-xs text-zinc-500">
          Open the extension popup → Import Historical League Data → <strong>FULL IMPORT</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090e] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1400px]">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-red-600 bg-red-900/30">
            <span className="text-2xl font-black text-red-400">K</span>
          </div>
          <div>
            <h1 className="text-3xl font-black text-zinc-50">
              Keeper Advisor {draftYear}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Recommendations based on your league history and player performance
            </p>
            <p className="mt-0.5 text-xs text-zinc-600">
              {pool.length} eligible players across {owners.length} teams · {draftYear - 1} season draft history
            </p>
          </div>
        </div>

        {/* ── Filter bar ───────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800 bg-[#0d1017] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Owner:</span>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-8 w-44 border-zinc-700 bg-zinc-800 text-xs text-zinc-200">
                <SelectValue placeholder="All Owners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Position:</span>
            <Select value={posFilter} onValueChange={setPosFilter}>
              <SelectTrigger className="h-8 w-28 border-zinc-700 bg-zinc-800 text-xs text-zinc-200">
                <SelectValue placeholder="All Pos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Pos</SelectItem>
                {positions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Max Keepers:</span>
            <Select value={maxKeepers} onValueChange={setMaxKeepers}>
              <SelectTrigger className="h-8 w-24 border-zinc-700 bg-zinc-800 text-xs text-zinc-200">
                <SelectValue placeholder="No limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">No limit</SelectItem>
                {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-600">
            <Info className="h-3 w-3" />
            Costs based on {draftYear - 1} draft data · KVS calculated from round value
          </div>
        </div>

        {/* ── Main grid: table + sidebar ───────────────────────────────── */}
        <div className="flex gap-5">

          {/* Table */}
          <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-[#0d1017]">
            {filtered.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-zinc-500">
                No players match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/60">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Player Name</th>
                      <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Position</th>
                      <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">NFL Team</th>
                      <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Draft Round Cost</th>
                      <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Proj Points</th>
                      <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Keeper Value Score (KVS) <ChevronDown className="ml-1 inline h-3 w-3" />
                      </th>
                      <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Confidence</th>
                      <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((entry, i) => {
                      const kvs  = calcKVS(entry);
                      const conf = kvsToConfidence(kvs);
                      const rec  = kvsToRecommendation(kvs, entry.isLastKeeperYear);
                      const posStyle = POS_STYLE[entry.position] ?? "text-zinc-400 font-bold";
                      return (
                        <tr
                          key={`${entry.ownerName}-${entry.playerName}-${i}`}
                          className={cn(
                            "border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/20",
                            i % 2 === 0 ? "" : "bg-zinc-900/20"
                          )}
                        >
                          {/* Player name + owner */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[11px] font-bold text-zinc-300">
                                {entry.playerName.split(" ").map(w => w[0]).slice(0, 2).join("")}
                              </div>
                              <div>
                                <div className="font-semibold text-zinc-100">{entry.playerName}</div>
                                <div className="text-[11px] text-zinc-500">{entry.ownerName}</div>
                              </div>
                            </div>
                          </td>

                          {/* Position */}
                          <td className="px-3 py-3 text-center">
                            <span className={posStyle}>{entry.position || "—"}</span>
                          </td>

                          {/* NFL Team */}
                          <td className="px-3 py-3 text-center">
                            <span className="rounded border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-xs font-medium text-zinc-300">
                              {entry.nflTeam || "—"}
                            </span>
                          </td>

                          {/* Draft Round Cost */}
                          <td className="px-3 py-3 text-center">
                            <span className={cn(
                              "text-sm font-semibold",
                              entry.keeperRoundCost <= 3 ? "text-emerald-400" :
                              entry.keeperRoundCost <= 6 ? "text-amber-400" : "text-zinc-300"
                            )}>
                              Round {entry.keeperRoundCost}
                            </span>
                            {entry.isLastKeeperYear && (
                              <div className="mt-0.5 text-[9px] font-bold uppercase text-amber-500 tracking-wide">Last Year</div>
                            )}
                          </td>

                          {/* Projected Points */}
                          <td className="px-3 py-3 text-center">
                            <span className="text-xs text-zinc-600" title="Requires gmWeeklyPlayerStats pipeline">—</span>
                          </td>

                          {/* KVS */}
                          <td className="px-3 py-3 text-center">
                            <span className={cn("text-2xl font-black tabular-nums", kvsColor(kvs))}>
                              {kvs}
                            </span>
                          </td>

                          {/* Confidence */}
                          <td className="px-3 py-3 text-center">
                            <ConfidenceBadge conf={conf} />
                          </td>

                          {/* Recommendation */}
                          <td className="px-4 py-3 text-center">
                            <RecButton rec={rec} isLastYear={entry.isLastKeeperYear} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Table footer */}
            <div className="flex items-center gap-2 border-t border-zinc-800/60 px-4 py-2.5">
              <Info className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
              <p className="text-[11px] text-zinc-600">
                KVS = Keeper Value Score. Higher scores indicate more value for your specific league and roster context.
                Projected Points require the gmWeeklyPlayerStats pipeline (Phase 2).
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-72 shrink-0 space-y-4">
            <KeeperDNA pool={pool} ownerFilter={ownerFilter} />
            <AIInsight pool={pool} ownerFilter={ownerFilter} />

            {/* Keep rules card */}
            <div className="rounded-xl border border-zinc-800 bg-[#0d1017] p-4 text-xs text-zinc-500 space-y-1.5">
              <p className="font-semibold uppercase tracking-wide text-zinc-400">League Rules</p>
              <p>Max keeper duration: <span className="text-zinc-300">2 consecutive years</span></p>
              <p>FA pickup cost: <span className="text-zinc-300">Round 7</span></p>
              <p>Cost method: <span className="text-zinc-300">Drafted round − 1</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
