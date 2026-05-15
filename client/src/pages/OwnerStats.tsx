import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TxnSeason {
  season: number;
  acquisitions: number;
  drops: number;
  trades: number;
  moveToActive: number;
  moveToIR: number;
}

interface SeasonRecord {
  season: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  rank: number;
  playoffSeed: number;
  madePlayoffs: boolean;
  isChampion: boolean;
  isRunnerUp: boolean;
}

interface H2HEntry {
  opponentMemberId: string;
  wins: number;
  losses: number;
  ties: number;
}

interface Owner {
  memberId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  fullName: string;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  totalGames: number;
  winPct: number;
  totalPF: number;
  totalPA: number;
  avgPF: number;
  avgPA: number;
  pointDiff: number;
  playoffAppearances: number;
  championships: number;
  runnerUps: number;
  seasonsActive: number;
  playoffRate: number;
  seasonRecords: SeasonRecord[];
  h2h: H2HEntry[];
  bestSeason: SeasonRecord | null;
  worstSeason: SeasonRecord | null;
  txnSeasons: TxnSeason[];
  totalAcquisitions: number;
  totalDrops: number;
  totalTrades: number;
  totalRosterMoves: number;
  avgAcquisitions: number;
  avgTrades: number;
  waiverAggression: number;
  tradeFrequency: number;
  rosterStability: number;
  gmArchetype: string;
  gmArchetypeDesc: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function winPctColor(pct: number) {
  if (pct >= 60) return "text-emerald-400";
  if (pct >= 50) return "text-green-400";
  if (pct >= 40) return "text-yellow-400";
  return "text-red-400";
}

function tierLabel(owner: Owner) {
  if (owner.championships >= 2) return { label: "Dynasty", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" };
  if (owner.championships === 1) return { label: "Champion", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" };
  if (owner.winPct >= 55) return { label: "Elite", color: "bg-purple-500/20 text-purple-300 border-purple-500/40" };
  if (owner.winPct >= 48) return { label: "Contender", color: "bg-blue-500/20 text-blue-300 border-blue-500/40" };
  if (owner.winPct >= 40) return { label: "Rebuilding", color: "bg-slate-500/20 text-slate-300 border-slate-500/40" };
  return { label: "Cellar Dweller", color: "bg-red-500/15 text-red-400 border-red-500/30" };
}

function archetypeColor(archetype: string) {
  switch (archetype) {
    case "Dealmaker": return "bg-orange-500/20 text-orange-300 border-orange-500/40";
    case "Waiver Grinder": return "bg-blue-500/20 text-blue-300 border-blue-500/40";
    case "Trade Shark": return "bg-purple-500/20 text-purple-300 border-purple-500/40";
    case "Patient Builder": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    case "Opportunist": return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
    default: return "bg-slate-500/20 text-slate-300 border-slate-500/40";
  }
}

function dangerColor(rating: string) {
  switch (rating) {
    case "ELITE": return "bg-red-600/30 text-red-300 border-red-500/50";
    case "HIGH": return "bg-orange-500/20 text-orange-300 border-orange-500/40";
    case "MEDIUM": return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
    default: return "bg-slate-500/20 text-slate-300 border-slate-500/40";
  }
}

// ── Stat Bar ──────────────────────────────────────────────────────────────────
function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-medium text-slate-300">{value}/100</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ── Activity Sparkline ────────────────────────────────────────────────────────
function ActivitySparkline({ txnSeasons }: { txnSeasons: TxnSeason[] }) {
  if (!txnSeasons.length) return null;
  const maxAcq = Math.max(...txnSeasons.map((t) => t.acquisitions), 1);
  return (
    <div className="flex items-end gap-1 h-10">
      {txnSeasons.map((t) => (
        <div key={t.season} className="flex flex-col items-center gap-0.5 flex-1">
          <div
            className="w-full rounded-sm bg-blue-500/60 min-h-[2px]"
            style={{ height: `${Math.max(4, (t.acquisitions / maxAcq) * 36)}px` }}
            title={`${t.season}: ${t.acquisitions} adds, ${t.trades} trades`}
          />
          <span className="text-[8px] text-slate-600 rotate-90 origin-center" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '7px' }}>
            {String(t.season).slice(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Prediction Types ────────────────────────────────────────────────────────
interface PredictionResult {
  ownerSummary: string;
  strengths: string[];
  weaknesses: string[];
  predictedBehavior2026: {
    draftStrategy: string;
    waiverApproach: string;
    tradeApproach: string;
    keeperPrediction: string;
    overallOutlook: string;
  };
  dangerRating: string;
  dangerRationale: string;
  rivalryAlert: string;
}

// ── 2026 Prediction Panel ─────────────────────────────────────────────────────
function PredictionPanel({ owner }: { owner: Owner }) {
  const [loaded, setLoaded] = useState(false);
  const { data, isLoading, error, refetch } = trpc.ownerPredictions.useQuery(
    { memberId: owner.memberId },
    { enabled: loaded, staleTime: 1000 * 60 * 10 }
  );

  if (!loaded) {
    return (
      <div className="text-center py-8">
        <div className="text-3xl mb-3">🔮</div>
        <div className="text-sm font-medium text-slate-300 mb-1">2026 AI Prediction Report</div>
        <div className="text-xs text-slate-500 mb-4">
          Generates a behavioral forecast using {owner.seasonsActive} seasons of career data + GM style metrics
        </div>
        <Button
          onClick={() => setLoaded(true)}
          className="bg-purple-600 hover:bg-purple-500 text-white text-sm px-6"
        >
          Generate Prediction
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-purple-300">
          <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          Analyzing {owner.fullName || owner.displayName}'s career patterns...
        </div>
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    );
  }

  if (error || !data?.prediction) {
    return (
      <div className="text-center py-6 text-red-400">
        <div className="text-2xl mb-2">⚠️</div>
        <div className="text-sm">Failed to generate prediction</div>
        <button onClick={() => refetch()} className="text-xs text-blue-400 mt-2 underline">Try again</button>
      </div>
    );
  }

  const p = data.prediction as PredictionResult;
  return (
    <div className="space-y-5">
      {/* Danger Rating */}
      <div className="flex items-start gap-3">
        <div className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold border ${dangerColor(p.dangerRating)}`}>
          {p.dangerRating === "ELITE" ? "🔥" : p.dangerRating === "HIGH" ? "⚡" : p.dangerRating === "MEDIUM" ? "⚠️" : "💤"} {p.dangerRating} THREAT
        </div>
        <p className="text-xs text-slate-400 flex-1 leading-relaxed">{p.dangerRationale}</p>
      </div>

      {/* Career Summary */}
      <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Career Profile</div>
        <p className="text-sm text-slate-300 leading-relaxed">{p.ownerSummary}</p>
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-4">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-2">Strengths</div>
          <ul className="space-y-1">
            {p.strengths.map((s: string, i: number) => (
              <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>{s}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4">
          <div className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Weaknesses</div>
          <ul className="space-y-1">
            {p.weaknesses.map((w: string, i: number) => (
              <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                <span className="text-red-400 mt-0.5 flex-shrink-0">✗</span>{w}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 2026 Predicted Behavior */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 space-y-4">
        <div className="text-xs font-semibold text-purple-400 uppercase tracking-wide">2026 Predicted Behavior</div>
        {[
          { icon: "📋", label: "Draft Strategy", value: p.predictedBehavior2026.draftStrategy },
          { icon: "🔄", label: "Waiver Wire", value: p.predictedBehavior2026.waiverApproach },
          { icon: "🤝", label: "Trade Approach", value: p.predictedBehavior2026.tradeApproach },
          { icon: "🔒", label: "Keeper Strategy", value: p.predictedBehavior2026.keeperPrediction },
          { icon: "🎯", label: "Overall Outlook", value: p.predictedBehavior2026.overallOutlook },
        ].map((item) => (
          <div key={item.label}>
            <div className="text-xs font-medium text-slate-400 mb-1">{item.icon} {item.label}</div>
            <p className="text-sm text-slate-300 leading-relaxed">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Rivalry Alert */}
      {p.rivalryAlert && (
        <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl p-4">
          <div className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-2">⚔️ Rivalry Alert</div>
          <p className="text-sm text-slate-300 leading-relaxed">{p.rivalryAlert}</p>
        </div>
      )}
    </div>
  );
}

// ── Owner Detail Panel ────────────────────────────────────────────────────────
function OwnerDetailPanel({ owner, allOwners }: { owner: Owner; allOwners: Owner[] }) {
  const [detailTab, setDetailTab] = useState("overview");

  const memberIdToName = useMemo(() => {
    const m = new Map<string, string>();
    allOwners.forEach((o) => m.set(o.memberId, o.fullName || o.displayName));
    return m;
  }, [allOwners]);

  const tier = tierLabel(owner);
  const archColor = archetypeColor(owner.gmArchetype);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
          {owner.firstName?.[0] || owner.displayName?.[0] || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-white">{owner.fullName || owner.displayName}</h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${tier.color}`}>{tier.label}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${archColor}`}>{owner.gmArchetype}</span>
          </div>
          <div className="text-sm text-slate-400 mt-0.5">@{owner.displayName} · {owner.seasonsActive} seasons</div>
          <div className="flex flex-wrap gap-3 mt-2 text-sm">
            <span className={`font-bold ${winPctColor(owner.winPct)}`}>{owner.winPct}% win rate</span>
            <span className="text-slate-400">{owner.totalWins}–{owner.totalLosses} all-time</span>
            {owner.championships > 0 && <span className="text-yellow-400">🏆 {owner.championships}× Champion</span>}
          </div>
        </div>
      </div>

      {/* Detail sub-tabs */}
      <Tabs value={detailTab} onValueChange={setDetailTab}>
        <TabsList className="bg-slate-800/60 border border-slate-700/50 h-8">
          {[
            { value: "overview", label: "Overview" },
            { value: "gmstyle", label: "GM Style" },
            { value: "seasons", label: "Seasons" },
            { value: "h2h", label: "H2H" },
            { value: "prediction", label: "2026 Prediction 🔮" },
          ].map((t) => (
            <TabsTrigger key={t.value} value={t.value}
              className="text-xs data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400 h-7 px-3">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-3">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "Win %", value: `${owner.winPct}%`, color: winPctColor(owner.winPct) },
              { label: "Record", value: `${owner.totalWins}–${owner.totalLosses}`, color: "text-white" },
              { label: "Avg PF/Szn", value: owner.avgPF.toLocaleString(), color: "text-blue-400" },
              { label: "Playoff Apps", value: owner.playoffAppearances, color: "text-purple-400" },
              { label: "Playoff Rate", value: `${owner.playoffRate}%`, color: "text-purple-300" },
              { label: "Championships", value: owner.championships, color: "text-yellow-400" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 text-center">
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          {owner.bestSeason && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3">
                <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide mb-1">Best Season</div>
                <div className="text-sm font-bold text-white">{owner.bestSeason.season} — {owner.bestSeason.wins}–{owner.bestSeason.losses}</div>
                <div className="text-xs text-slate-400">{owner.bestSeason.teamName}</div>
              </div>
              {owner.worstSeason && (
                <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-1">Worst Season</div>
                  <div className="text-sm font-bold text-white">{owner.worstSeason.season} — {owner.worstSeason.wins}–{owner.worstSeason.losses}</div>
                  <div className="text-xs text-slate-400">{owner.worstSeason.teamName}</div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* GM Style */}
        <TabsContent value="gmstyle" className="mt-3 space-y-4">
          {/* Archetype card */}
          <div className={`border rounded-xl p-4 ${archColor.replace('text-', 'border-').replace('/40', '/30')} bg-slate-800/40`}>
            <div className="flex items-center gap-3 mb-2">
              <span className={`text-2xl font-bold border px-3 py-1 rounded-lg ${archColor}`}>{owner.gmArchetype}</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{owner.gmArchetypeDesc}</p>
          </div>

          {/* Style meters */}
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">GM Style Metrics</div>
            <StatBar label="Waiver Aggression" value={owner.waiverAggression} color="bg-blue-500" />
            <StatBar label="Trade Frequency" value={owner.tradeFrequency} color="bg-purple-500" />
            <StatBar label="Roster Stability" value={owner.rosterStability} color="bg-emerald-500" />
          </div>

          {/* Career activity totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Adds", value: owner.totalAcquisitions, sub: `~${owner.avgAcquisitions}/season`, color: "text-blue-400" },
              { label: "Total Drops", value: owner.totalDrops, sub: `~${Math.round(owner.totalDrops / (owner.seasonsActive || 1))}/season`, color: "text-slate-400" },
              { label: "Total Trades", value: owner.totalTrades, sub: `~${owner.avgTrades}/season`, color: "text-purple-400" },
              { label: "Roster Moves", value: owner.totalRosterMoves, sub: `Active/IR activations`, color: "text-yellow-400" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                <div className="text-[9px] text-slate-600">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Per-season activity sparkline */}
          {owner.txnSeasons.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Waiver Activity by Season (Adds)</div>
              <div className="flex items-end gap-1.5 h-16">
                {owner.txnSeasons.map((t) => {
                  const maxAcq = Math.max(...owner.txnSeasons.map((x) => x.acquisitions), 1);
                  const barH = Math.max(4, (t.acquisitions / maxAcq) * 48);
                  return (
                    <div key={t.season} className="flex flex-col items-center gap-1 flex-1">
                      <div className="text-[8px] text-slate-500">{t.acquisitions}</div>
                      <div
                        className="w-full rounded-t bg-blue-500/70 hover:bg-blue-400 transition-colors cursor-default"
                        style={{ height: `${barH}px` }}
                        title={`${t.season}: ${t.acquisitions} adds, ${t.trades} trades`}
                      />
                      <div className="text-[8px] text-slate-600">{String(t.season).slice(2)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-end gap-1.5 h-10 mt-2">
                {owner.txnSeasons.map((t) => {
                  const maxTrades = Math.max(...owner.txnSeasons.map((x) => x.trades), 1);
                  const barH = Math.max(2, (t.trades / maxTrades) * 32);
                  return (
                    <div key={t.season} className="flex flex-col items-center gap-1 flex-1">
                      <div
                        className="w-full rounded-t bg-purple-500/60 hover:bg-purple-400 transition-colors cursor-default"
                        style={{ height: `${barH}px` }}
                        title={`${t.season}: ${t.trades} trades`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-2 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-blue-500/70 inline-block" /> Adds (top)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-purple-500/60 inline-block" /> Trades (bottom)</span>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Season-by-Season */}
        <TabsContent value="seasons" className="mt-3">
          <div className="overflow-x-auto rounded-xl border border-slate-700/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700/40">
                  {["Season", "Team", "Record", "PF", "Adds", "Trades", "Playoff", "Result"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {owner.seasonRecords.map((sr) => {
                  const txn = owner.txnSeasons.find((t) => t.season === sr.season);
                  const resultColor = sr.isChampion ? "text-yellow-400" : sr.isRunnerUp ? "text-slate-300" : sr.madePlayoffs ? "text-blue-300" : "text-slate-600";
                  const resultLabel = sr.isChampion ? "🏆 Champion" : sr.isRunnerUp ? "🥈 Runner-Up" : sr.madePlayoffs ? `✓ Seed #${sr.playoffSeed}` : "✗ Missed";
                  return (
                    <tr key={sr.season} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-medium text-slate-300">{sr.season}</td>
                      <td className="px-3 py-2 text-slate-400 text-xs max-w-28 truncate">{sr.teamName}</td>
                      <td className="px-3 py-2 text-white font-medium">{sr.wins}–{sr.losses}</td>
                      <td className="px-3 py-2 text-blue-300">{sr.pf > 0 ? sr.pf.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "—"}</td>
                      <td className="px-3 py-2 text-blue-400">{txn?.acquisitions ?? "—"}</td>
                      <td className="px-3 py-2 text-purple-400">{txn?.trades ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{sr.madePlayoffs ? `Seed #${sr.playoffSeed}` : "—"}</td>
                      <td className={`px-3 py-2 text-xs font-medium ${resultColor}`}>{resultLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* H2H */}
        <TabsContent value="h2h" className="mt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {owner.h2h
              .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))
              .map((h) => {
                const oppName = memberIdToName.get(h.opponentMemberId) || h.opponentMemberId;
                const total = h.wins + h.losses + h.ties;
                const pct = total > 0 ? Math.round((h.wins / total) * 100) : 0;
                return (
                  <div key={h.opponentMemberId} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/30 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-300 truncate">{oppName}</div>
                      <div className="text-xs text-slate-500">{h.wins}–{h.losses}{h.ties > 0 ? `–${h.ties}` : ""} · {total} games</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${winPctColor(pct)}`}>{pct}%</div>
                    </div>
                    <div className="w-16 h-2 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
                      <div
                        className={`h-full rounded-full ${pct >= 60 ? "bg-emerald-500" : pct >= 50 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </TabsContent>

        {/* 2026 Prediction */}
        <TabsContent value="prediction" className="mt-3">
          <PredictionPanel owner={owner} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── H2H Matrix ────────────────────────────────────────────────────────────────
function H2HMatrix({ owners }: { owners: Owner[] }) {
  const lookup = useMemo(() => {
    const m = new Map<string, Map<string, { wins: number; losses: number; ties: number }>>();
    owners.forEach((o) => {
      const inner = new Map<string, { wins: number; losses: number; ties: number }>();
      o.h2h.forEach((h) => inner.set(h.opponentMemberId, h));
      m.set(o.memberId, inner);
    });
    return m;
  }, [owners]);

  const shortName = (o: Owner) => o.firstName || o.displayName.slice(0, 8);

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-2 text-left text-slate-500 font-medium w-32">vs →</th>
            {owners.map((o) => (
              <th key={o.memberId} className="px-1 py-2 text-center text-slate-400 font-medium w-16 max-w-16">
                <div className="truncate w-14">{shortName(o)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {owners.map((rowOwner) => (
            <tr key={rowOwner.memberId} className="border-t border-slate-800">
              <td className="px-2 py-1.5 text-slate-300 font-medium">{shortName(rowOwner)}</td>
              {owners.map((colOwner) => {
                if (rowOwner.memberId === colOwner.memberId) {
                  return <td key={colOwner.memberId} className="px-1 py-1.5 text-center bg-slate-800/60 text-slate-600">—</td>;
                }
                const rec = lookup.get(rowOwner.memberId)?.get(colOwner.memberId);
                if (!rec) return <td key={colOwner.memberId} className="px-1 py-1.5 text-center text-slate-700">·</td>;
                const total = rec.wins + rec.losses + rec.ties;
                const pct = total > 0 ? rec.wins / total : 0;
                const bg = pct >= 0.6 ? "bg-emerald-900/40 text-emerald-300" :
                           pct >= 0.5 ? "bg-green-900/30 text-green-300" :
                           pct >= 0.4 ? "bg-yellow-900/30 text-yellow-300" :
                           "bg-red-900/30 text-red-300";
                return (
                  <td key={colOwner.memberId} className={`px-1 py-1.5 text-center font-medium rounded ${bg}`}
                    title={`${rowOwner.fullName} vs ${colOwner.fullName}: ${rec.wins}-${rec.losses}`}>
                    {rec.wins}–{rec.losses}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-500">
        <span>Read as: row owner's record against column owner</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-900/60 inline-block" /> ≥60% win rate</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-900/40 inline-block" /> &lt;40% win rate</span>
      </div>
    </div>
  );
}

// ── Leaderboard Row ───────────────────────────────────────────────────────────
function LeaderboardRow({ owner, rank, onClick, selected }: {
  owner: Owner; rank: number; onClick: () => void; selected: boolean;
}) {
  const tier = tierLabel(owner);
  const archColor = archetypeColor(owner.gmArchetype);
  return (
    <tr
      className={`border-b border-slate-700/40 cursor-pointer transition-colors ${selected ? "bg-blue-900/30" : "hover:bg-slate-800/60"}`}
      onClick={onClick}
    >
      <td className="px-4 py-3 text-center">
        <span className={`font-bold text-lg ${rank === 1 ? "text-yellow-400" : rank === 2 ? "text-slate-300" : rank === 3 ? "text-orange-400" : "text-slate-500"}`}>
          {rank === 1 ? "🏆" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {owner.firstName?.[0] || owner.displayName?.[0] || "?"}
          </div>
          <div>
            <div className="font-semibold text-white text-sm">{owner.fullName || owner.displayName}</div>
            <div className="text-[10px] text-slate-500">@{owner.displayName}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`font-bold text-sm ${winPctColor(owner.winPct)}`}>{owner.winPct}%</span>
      </td>
      <td className="px-4 py-3 text-center text-sm text-slate-300">
        {owner.totalWins}–{owner.totalLosses}
      </td>
      <td className="px-4 py-3 text-center text-sm text-blue-300 font-medium">{owner.avgPF.toLocaleString()}</td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${archColor}`}>
          {owner.gmArchetype}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          {owner.championships > 0 && <span className="text-yellow-400 font-bold text-sm">🏆×{owner.championships}</span>}
          {owner.championships === 0 && <span className="text-slate-600 text-xs">—</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${tier.color}`}>
          {tier.label}
        </span>
      </td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OwnerStats() {
  const { data, isLoading, error } = trpc.ownerCareerStats.useQuery(undefined, { staleTime: 10 * 60_000 });
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("leaderboard");

  const owners: Owner[] = (data?.owners as Owner[]) || [];

  const selected = useMemo(
    () => owners.find((o) => o.memberId === selectedOwner) ?? owners[0] ?? null,
    [owners, selectedOwner]
  );

  const leagueStats = useMemo(() => {
    if (!owners.length) return null;
    const mostChamps = [...owners].sort((a, b) => b.championships - a.championships)[0];
    const highestWinPct = [...owners].sort((a, b) => b.winPct - a.winPct)[0];
    const mostPlayoffs = [...owners].sort((a, b) => b.playoffAppearances - a.playoffAppearances)[0];
    const mostActive = [...owners].sort((a, b) => b.avgAcquisitions - a.avgAcquisitions)[0];
    return { mostChamps, highestWinPct, mostPlayoffs, mostActive };
  }, [owners]);

  return (
    <AppLayout title="Owner Career Stats" subtitle="ATLANTAS FINEST FF — All-Time Historical Records & GM Profiles">
      <div className="space-y-6">

        {/* League Honors */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : leagueStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Most Championships", value: leagueStats.mostChamps.fullName || leagueStats.mostChamps.displayName, sub: `${leagueStats.mostChamps.championships} title${leagueStats.mostChamps.championships !== 1 ? "s" : ""}`, color: "text-yellow-400", icon: "🏆" },
              { label: "All-Time Win %", value: leagueStats.highestWinPct.fullName || leagueStats.highestWinPct.displayName, sub: `${leagueStats.highestWinPct.winPct}% win rate`, color: "text-emerald-400", icon: "📈" },
              { label: "Most Playoff Apps", value: leagueStats.mostPlayoffs.fullName || leagueStats.mostPlayoffs.displayName, sub: `${leagueStats.mostPlayoffs.playoffAppearances} appearances`, color: "text-purple-400", icon: "🎯" },
              { label: "Most Active GM", value: leagueStats.mostActive.fullName || leagueStats.mostActive.displayName, sub: `~${leagueStats.mostActive.avgAcquisitions} adds/season`, color: "text-blue-400", icon: "⚡" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                <div className="text-xl mb-1">{s.icon}</div>
                <div className={`text-sm font-bold ${s.color} truncate`}>{s.value}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800/60 border border-slate-700/50">
            <TabsTrigger value="leaderboard" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">Career Leaderboard</TabsTrigger>
            <TabsTrigger value="profile" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-slate-400">Owner Profile</TabsTrigger>
            <TabsTrigger value="h2h" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white text-slate-400">H2H Matrix</TabsTrigger>
          </TabsList>

          {/* Leaderboard */}
          <TabsContent value="leaderboard" className="mt-4">
            {isLoading ? (
              <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : error ? (
              <div className="text-center py-16 text-red-400">
                <div className="text-4xl mb-3">⚠️</div>
                <div className="font-semibold">Failed to load owner stats</div>
              </div>
            ) : (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-800/80 border-b border-slate-700/50">
                        {["#", "Owner", "Win %", "Record", "Avg PF", "GM Style", "Hardware", "Tier"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {owners.map((owner, i) => (
                        <LeaderboardRow
                          key={owner.memberId}
                          owner={owner}
                          rank={i + 1}
                          selected={selectedOwner === owner.memberId}
                          onClick={() => { setSelectedOwner(owner.memberId); setActiveTab("profile"); }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-slate-700/40 text-[10px] text-slate-500">
                  Click any row to view full owner profile with GM Style analysis and 2026 AI predictions.
                </div>
              </div>
            )}
          </TabsContent>

          {/* Owner Profile */}
          <TabsContent value="profile" className="mt-4">
            {isLoading ? <Skeleton className="h-96 rounded-xl" /> : !selected ? (
              <div className="text-center py-16 text-slate-500">
                <div className="text-4xl mb-3">👤</div>
                <div className="font-semibold text-slate-400">Select an owner from the leaderboard</div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {owners.map((o) => (
                    <button
                      key={o.memberId}
                      onClick={() => setSelectedOwner(o.memberId)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        (selectedOwner === o.memberId || (!selectedOwner && o === owners[0]))
                          ? "bg-blue-600 text-white border-blue-500"
                          : "bg-slate-800/60 text-slate-400 border-slate-600/40 hover:border-slate-500"
                      }`}
                    >
                      {o.firstName || o.displayName}{o.championships > 0 && " 🏆"}
                    </button>
                  ))}
                </div>
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
                  <OwnerDetailPanel owner={selected} allOwners={owners} />
                </div>
              </div>
            )}
          </TabsContent>

          {/* H2H Matrix */}
          <TabsContent value="h2h" className="mt-4">
            {isLoading ? <Skeleton className="h-96 rounded-xl" /> : (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
                <div className="text-sm font-semibold text-slate-300 mb-4">All-Time Regular Season Head-to-Head Records</div>
                <H2HMatrix owners={owners} />
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Data Notes */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Data Notes</div>
          <div className="text-xs text-slate-500 space-y-1">
            <div>Records compiled from ESPN API data for seasons 2018–2025 (8 seasons). Seasons 2009–2017 are not available via the ESPN v3 API.</div>
            <div>Transaction counters (adds, drops, trades) are season-end totals from ESPN — individual transaction details are not available for historical seasons.</div>
            <div>GM Style archetypes and 2026 predictions are AI-generated based on career patterns and should be treated as analytical insights, not guarantees.</div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
