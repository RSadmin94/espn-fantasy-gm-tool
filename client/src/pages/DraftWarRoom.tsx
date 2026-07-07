import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { DraftWarRoomDesk } from "./DraftWarRoomDesk";
import {
  Zap, BarChart2, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, AlertTriangle, Info, Trophy, Target,
  ShieldCheck, TrendingUp, Activity, ArrowUpRight, ArrowDownRight,
  Flame, Lock, Gauge, Wind,
} from "lucide-react";

// ── Shared UI atoms ───────────────────────────────────────────────────────────

const POS_CFG: Record<string, { pill: string }> = {
  QB:  { pill: "bg-red-500/20 text-red-300 border-red-500/40" },
  RB:  { pill: "bg-lime-500/20 text-lime-300 border-lime-500/40" },
  WR:  { pill: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
  TE:  { pill: "bg-orange-500/20 text-orange-300 border-orange-500/40" },
  K:   { pill: "bg-zinc-700 text-zinc-300 border-zinc-600" },
  DEF: { pill: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
  "?": { pill: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
};

function PosPill({ pos }: { pos: string }) {
  const c = POS_CFG[pos] ?? POS_CFG["?"];
  return <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold border uppercase", c.pill)}>{pos}</span>;
}

function ConfBar({ value, small }: { value: number; small?: boolean }) {
  const color = value >= 80 ? "bg-violet-500" : value >= 60 ? "bg-amber-500" : "bg-zinc-500";
  const text  = value >= 80 ? "text-violet-400" : value >= 60 ? "text-amber-400" : "text-zinc-400";
  return (
    <div className="flex items-center gap-2">
      <div className={cn("flex-1 bg-zinc-800 rounded-full overflow-hidden", small ? "h-1" : "h-1.5")}>
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
      <span className={cn("font-bold tabular-nums w-7 text-right", small ? "text-[10px]" : "text-[11px]", text)}>{value}%</span>
    </div>
  );
}

function EvidenceList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-0.5 mt-1.5">
      {items.map((e, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-500">
          <span className="text-violet-600 shrink-0 mt-0.5">→</span>{e}
        </li>
      ))}
    </ul>
  );
}

function Section({ id, title, icon, badge, children, defaultOpen = true, accent }: {
  id?: string; title: string; icon: any; badge?: string | number; children: React.ReactNode;
  defaultOpen?: boolean; accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = icon;
  return (
    <div id={id} className="scroll-mt-24 rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,#1b131f,#140e17)] overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-2.5">
          <Icon className="h-5 w-5 text-lime-400" />
          <span className="font-extrabold tracking-tight text-zinc-50 text-[20px]">{title}</span>
          {badge !== undefined && (
            <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300 text-[11px] font-bold">{badge}</span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-600" /> : <ChevronDown className="h-4 w-4 text-zinc-600" />}
      </button>
      {open && <div className="border-t border-white/[0.06]">{children}</div>}
    </div>
  );
}

// ── Keeper tier badge (keeperValuationService: recommendation + round savings) ──

function KeeperTierBadge({ recommendation, valueTier, roundSavings }: { recommendation?: string; valueTier?: string; roundSavings?: number | null }) {
  const tier = (valueTier || "").toLowerCase();
  const color = tier === "elite"  ? "text-lime-300 bg-lime-500/15 border-lime-500/40"
              : tier === "strong" ? "text-violet-300 bg-violet-500/15 border-violet-500/40"
              : tier === "viable" ? "text-sky-300 bg-sky-500/15 border-sky-500/40"
              : tier === "pass"   ? "text-zinc-400 bg-white/[0.04] border-white/[0.12]"
              : "text-amber-300 bg-amber-500/15 border-amber-500/40"; // borderline / unrated
  return (
    <div className={cn("flex flex-col items-center px-2.5 py-1 rounded-lg border shrink-0", color)}>
      <span className="text-[11px] font-black uppercase tracking-wide leading-none text-center">{recommendation || "Unrated"}</span>
      {roundSavings != null && (
        <span className="text-[10px] font-bold tabular-nums opacity-80 mt-0.5">{roundSavings > 0 ? `+${roundSavings}` : roundSavings} rd</span>
      )}
    </div>
  );
}

// ── Confidence Dashboard ──────────────────────────────────────────────────────

function ConfidenceDashboard({ data, showKeeperInsights = true }: { data: any; showKeeperInsights?: boolean }) {
  if (!data) return null;

  const cardsAll = [
    {
      icon: ShieldCheck, label: "Most Predictable",
      title: data.mostPredictable?.teamName,
      sub: data.mostPredictable?.ownerName,
      value: `${data.mostPredictable?.score}%`,
      detail: data.mostPredictable?.reason,
      color: "border-lime-500/25 bg-lime-500/5",
      iconColor: "text-lime-400",
    },
    {
      icon: Activity, label: "Least Predictable",
      title: data.leastPredictable?.teamName,
      sub: data.leastPredictable?.ownerName,
      value: `${data.leastPredictable?.score}%`,
      detail: data.leastPredictable?.reason,
      color: "border-violet-500/25 bg-violet-500/5",
      iconColor: "text-violet-400",
    },
    {
      icon: ArrowUpRight, label: "Biggest Roster Hole",
      title: data.biggestRosterHole?.teamName ?? "—",
      sub: data.biggestRosterHole?.ownerName ?? "",
      value: data.biggestRosterHole?.position ?? "—",
      detail: data.biggestRosterHole?.reason ?? "No critical gaps found",
      color: "border-amber-500/25 bg-amber-500/5",
      iconColor: "text-amber-400",
    },
    {
      icon: Trophy, label: "Best Keeper Value",
      title: data.bestKeeperValue?.player ?? "—",
      sub: data.bestKeeperValue?.teamName ?? "",
      value: data.bestKeeperValue
        ? `${data.bestKeeperValue.recommendation ?? "—"}${data.bestKeeperValue.roundSavings != null ? ` · +${data.bestKeeperValue.roundSavings} rd` : ""}`
        : "—",
      detail: data.bestKeeperValue?.reason ?? "No keepers predicted",
      color: "border-violet-500/25 bg-violet-500/5",
      iconColor: "text-violet-400",
    },
    {
      icon: ArrowDownRight, label: "Projected Reach",
      title: data.biggestReach?.teamName ?? "—",
      sub: data.biggestReach?.ownerName ?? "",
      value: data.biggestReach?.position ?? "—",
      detail: data.biggestReach?.reason ?? "No clear reaches projected",
      color: "border-violet-500/25 bg-violet-500/5",
      iconColor: "text-violet-400",
    },
    {
      icon: TrendingUp, label: "Most Likely to Surprise",
      title: data.mostLikelyToChange?.teamName,
      sub: data.mostLikelyToChange?.ownerName,
      value: `${data.mostLikelyToChange?.score}% surprise`,
      detail: data.mostLikelyToChange?.reason,
      color: "border-orange-500/25 bg-orange-500/5",
      iconColor: "text-orange-400",
    },
  ];

  const cards = showKeeperInsights
    ? cardsAll
    : cardsAll.filter((c) => c.label !== "Best Keeper Value");

  return (
    <div
      className={cn(
        "grid grid-cols-2 md:grid-cols-3 gap-2 p-4",
        cards.length >= 6 ? "lg:grid-cols-6" : "lg:grid-cols-5",
      )}
    >
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div key={i} className={cn("rounded-xl border p-3 space-y-1.5", c.color)}>
            <div className="flex items-center gap-1.5">
              <Icon className={cn("h-3 w-3 shrink-0", c.iconColor)} />
              <span className={cn("text-[10px] font-black uppercase tracking-wider", c.iconColor)}>{c.label}</span>
            </div>
            <div className="font-black text-zinc-100 text-xs leading-tight line-clamp-1">{c.title}</div>
            <div className="text-[11px] text-zinc-500 truncate">{c.sub}</div>
            <div className={cn("text-sm font-black", c.iconColor)}>{c.value}</div>
            <p className="text-[10px] text-zinc-600 leading-relaxed line-clamp-2">{c.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Keeper section (keeperValuationService tiers) ──────────────────────────────

function KeeperSection({ predictions }: { predictions: any[] }) {
  if (!predictions.length) return (
    <div className="px-5 py-8 text-center text-zinc-500 text-sm">No keeper slots found for this season.</div>
  );

  return (
    <div className="divide-y divide-white/[0.06]">
      {predictions.map((k, i) => (
        <div key={i} className="px-5 py-4 space-y-2">
          {/* Header row */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-bold text-zinc-100">{k.teamName}</span>
                <span className="text-[11px] text-zinc-600">· {k.ownerName}</span>
                {k.status === "CONFIRMED"
                  ? <span className="flex items-center gap-1 text-[11px] font-bold text-lime-400 bg-lime-500/10 border border-lime-500/20 px-1.5 rounded"><CheckCircle className="h-2.5 w-2.5" />CONFIRMED</span>
                  : k.status === "HYPOTHETICAL"
                    ? <span className="text-[11px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 rounded">HYPOTHETICAL</span>
                    : <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 rounded">PREDICTED</span>
                }
                <span className="text-[11px] text-zinc-600 ml-auto tabular-nums">
                  {k.keeperSlotRound != null ? <>Slot Rd {k.keeperSlotRound} · </> : null}
                  Cost Rd {k.keeperRound}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-black text-zinc-100 text-base">{k.predictedPlayer}</span>
                <PosPill pos={k.position} />
                {k.projectedPoints > 0 && <span className="text-[11px] text-zinc-500">{k.projectedPoints.toFixed(0)} pts proj</span>}
              </div>
            </div>
            {/* Keeper tier + Confidence */}
            <div className="flex items-start gap-2 shrink-0">
              {k.recommendation && (
                <KeeperTierBadge recommendation={k.recommendation} valueTier={k.valueTier} roundSavings={k.roundSavings} />
              )}
              <div className="w-24">
                <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Confidence</div>
                <ConfBar value={k.confidence} small />
              </div>
            </div>
          </div>

          {/* Keeper value breakdown (keeperValuationService) */}
          {k.roundSavings != null && (
            <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-zinc-900/60 border border-white/[0.06] text-[11px]">
              <div><span className="text-zinc-600">Keeper cost:</span> <span className="text-zinc-200 font-bold">Rd {k.keeperRound}</span></div>
              {k.adpRound != null && <div><span className="text-zinc-600">ADP value:</span> <span className="text-zinc-200 font-bold">Rd {k.adpRound}{k.adp != null ? ` (ADP ${k.adp})` : ""}</span></div>}
              <div><span className="text-zinc-600">Rounds saved:</span> <span className={cn("font-bold", k.roundSavings > 0 ? "text-lime-400" : k.roundSavings < 0 ? "text-amber-400" : "text-zinc-300")}>{k.roundSavings > 0 ? "+" : ""}{k.roundSavings}</span></div>
              {k.marketValue != null && <div><span className="text-zinc-600">Market value:</span> <span className="text-zinc-200 font-bold">{Math.round(k.marketValue)}/100</span></div>}
            </div>
          )}

          <EvidenceList items={k.evidence} />

          {k.alternatives?.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Alternatives considered (by keeper value)</p>
              <div className="flex flex-wrap gap-1.5">
                {k.alternatives.map((a: any, j: number) => (
                  <span key={j} className="flex items-center gap-1 text-[11px] text-zinc-500 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded">
                    {a.player} <PosPill pos={a.position} />
                    {a.roundSavings != null && <span className="text-zinc-600">{a.recommendation ?? ""}{` (${a.roundSavings > 0 ? "+" : ""}${a.roundSavings} rd)`}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Roster needs ──────────────────────────────────────────────────────────────

const URG_CFG = {
  CRITICAL: { cls: "text-red-400 bg-red-500/10 border-red-500/30", icon: "🚨" },
  HIGH:     { cls: "text-amber-400 bg-amber-500/10 border-amber-500/30", icon: "⚠️" },
  MEDIUM:   { cls: "text-violet-400 bg-violet-500/10 border-violet-500/30", icon: "📋" },
  LOW:      { cls: "text-zinc-400 bg-zinc-800 border-zinc-700", icon: "✓" },
};

function RosterNeedsSection({ needs }: { needs: any[] }) {
  const [sel, setSel] = useState<number | null>(null);
  return (
    <div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {needs.map(n => (
          <button key={n.teamId} onClick={() => setSel(sel === n.teamId ? null : n.teamId)}
            className={cn("rounded-lg border p-2.5 text-left transition-all hover:scale-105",
              sel === n.teamId ? "border-violet-500/40 bg-violet-500/8 shadow-lg" : "border-white/[0.06] bg-white/[0.03] hover:border-zinc-700")}>
            <div className={cn("text-xl font-black tabular-nums", sel === n.teamId ? "text-violet-400" : "text-zinc-200")}>#{n.overallRank}</div>
            <div className="text-[11px] font-bold text-zinc-300 leading-tight mt-0.5 truncate">{n.teamName}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5">{n.projectedTotal?.toLocaleString()} pts</div>
            <div className="flex flex-wrap gap-0.5 mt-1.5">{n.draftPriority?.slice(0,3).map((p: string) => <PosPill key={p} pos={p} />)}</div>
          </button>
        ))}
      </div>
      {sel && (() => {
        const t = needs.find(n => n.teamId === sel);
        if (!t) return null;
        return (
          <div className="border-t border-white/[0.06] p-5 grid sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-bold">Roster Needs</p>
                <div className="flex gap-1">{t.draftPriority?.map((p: string) => <PosPill key={p} pos={p} />)}</div>
              </div>
              <div className="space-y-2">
                {t.needs?.map((n: any, i: number) => {
                  const u = URG_CFG[n.urgency as keyof typeof URG_CFG] ?? URG_CFG.LOW;
                  return (
                    <div key={i} className={cn("rounded-lg border p-2.5", u.cls)}>
                      <div className="flex items-center gap-2">
                        <span>{u.icon}</span><span className="text-xs font-bold">{n.position}</span>
                        <span className="text-[11px] ml-auto">{n.urgency}</span>
                      </div>
                      <p className="text-[11px] mt-1 opacity-80">Have {n.have}, need {n.need}. Best: {n.topPlayer}</p>
                      <EvidenceList items={n.evidence} />
                    </div>
                  );
                })}
                {!t.needs?.length && <p className="text-[11px] text-zinc-600">No critical needs identified.</p>}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-bold mb-2">Strengths</p>
              <div className="space-y-1.5">
                {t.strengths?.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-zinc-900/60 rounded-lg border border-white/[0.06] px-3 py-2">
                    <PosPill pos={s.position} />
                    <span className="text-zinc-300 font-semibold">{s.count}× {s.position}</span>
                    <span className="text-zinc-500 text-[11px] truncate ml-auto">{s.topPlayer}</span>
                  </div>
                ))}
                {!t.strengths?.length && <p className="text-[11px] text-zinc-600">No notable surplus positions.</p>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Draft Shock Meter ─────────────────────────────────────────────────────────

const SIGNAL_CFG = {
  PREDICTABLE:   "text-violet-400 bg-violet-500/10 border-violet-500/30",
  UNPREDICTABLE: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  NEUTRAL:       "text-zinc-400 bg-white/[0.04] border-white/[0.08]",
};

const CAPITAL_CFG = {
  ABOVE_AVERAGE: "text-violet-400",
  AVERAGE:       "text-zinc-400",
  BELOW_AVERAGE: "text-violet-400",
};

function ownerArchetype(m: any): { label: string; cls: string } {
  const pred = Number(m?.predictabilityScore ?? 0);
  const surp = Number(m?.surpriseProbability ?? 0);
  if (surp >= 55) return { label: "Panic Pivot", cls: "text-violet-300 border-violet-500/30 bg-violet-500/10" };
  if (pred >= 72) return { label: "By-the-Book", cls: "text-violet-300 border-violet-500/30 bg-violet-500/10" };
  if (pred >= 55) return { label: "Steady Hand", cls: "text-violet-300 border-violet-500/30 bg-violet-500/10" };
  return { label: "Wildcard", cls: "text-amber-300 border-amber-500/30 bg-amber-500/10" };
}

function ShockMeterSection({ meters }: { meters: any[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const sorted = useMemo(() => [...meters].sort((a, b) => b.surpriseProbability - a.surpriseProbability), [meters]);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 p-4">
        {sorted.map(m => {
          const isHighSurprise = m.surpriseProbability >= 50;
          return (
            <button key={m.teamId} onClick={() => setSel(sel === m.teamId ? null : m.teamId)}
              className={cn("rounded-lg border p-3 text-left transition-all hover:scale-105 space-y-1.5",
                sel === m.teamId ? "border-violet-500/40 bg-white/[0.04] shadow-lg" : "border-white/[0.06] bg-white/[0.03] hover:border-zinc-700")}>
              <div className="text-[10px] font-black uppercase tracking-wider text-zinc-600 truncate">{m.teamName}</div>
              <div className="text-[11px] text-zinc-500 truncate">{m.ownerName?.split(" ")[0]}</div>
              {(() => { const __a = ownerArchetype(m); return <span className={cn("inline-block text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border", __a.cls)}>{__a.label}</span>; })()}
              {/* Predict bar */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-zinc-600">PREDICT</span>
                  <span className={cn("text-[10px] font-bold", isHighSurprise ? "text-violet-400" : "text-violet-400")}>
                    {m.predictabilityScore}%
                  </span>
                </div>
                <ConfBar value={m.predictabilityScore} small />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-600">Likely: </span>
                <PosPill pos={m.mostLikelyPosition} />
              </div>
              <div className={cn("text-[10px] font-bold uppercase", isHighSurprise ? "text-violet-400/80" : "text-zinc-600")}>
                {m.surpriseProbability}% surprise
              </div>
            </button>
          );
        })}
      </div>

      {sel && (() => {
        const m = meters.find(x => x.teamId === sel);
        if (!m) return null;
        return (
          <div className="border-t border-white/[0.06] p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-zinc-100">{m.teamName}</h3>
                <p className="text-xs text-zinc-500">{m.ownerName}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-center px-3.5 py-2.5 rounded-xl bg-[#1b131f] border border-white/[0.07]">
                  <div className="text-lg font-black text-white">{m.predictabilityScore}%</div>
                  <div className="text-[10px] text-zinc-600 uppercase">Predictable</div>
                </div>
                <div className="text-center px-3.5 py-2.5 rounded-xl bg-[#1b131f] border border-white/[0.07]">
                  <div className={cn("text-lg font-black", m.surpriseProbability >= 50 ? "text-violet-400" : "text-zinc-300")}>{m.surpriseProbability}%</div>
                  <div className="text-[10px] text-zinc-600 uppercase">Surprise</div>
                </div>
                <div className="text-center px-3.5 py-2.5 rounded-xl bg-[#1b131f] border border-white/[0.07]">
                  <PosPill pos={m.mostLikelyPosition} />
                  <div className="text-[10px] text-zinc-600 uppercase mt-1">Likely Pick</div>
                </div>
                <div className="text-center px-3.5 py-2.5 rounded-xl bg-[#1b131f] border border-white/[0.07]">
                  <div className={cn("text-sm font-black uppercase", CAPITAL_CFG[m.draftCapital as keyof typeof CAPITAL_CFG] ?? "text-zinc-400")}>
                    {m.draftCapital?.replace("_", " ")}
                  </div>
                  <div className="text-[10px] text-zinc-600 uppercase">Capital</div>
                </div>
              </div>
            </div>

            {/* Signals */}
            <div>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-bold mb-2">Prediction Signals</p>
              <div className="grid grid-cols-2 gap-2">
                {m.signals?.map((s: any, i: number) => (
                  <div key={i} className={cn("rounded-lg border px-3 py-2 flex items-center justify-between gap-2", SIGNAL_CFG[s.impact as keyof typeof SIGNAL_CFG])}>
                    <div>
                      <div className="text-[11px] font-bold">{s.label}</div>
                      <div className="text-[10px] opacity-70">{s.value}</div>
                    </div>
                    <span className="text-[10px] font-black uppercase opacity-60 shrink-0">{s.impact}</span>
                  </div>
                ))}
              </div>
            </div>

            <EvidenceList items={m.evidence} />
          </div>
        );
      })()}
    </div>
  );
}

// ── Traded picks list ─────────────────────────────────────────────────────────

function TradedPicksBadge({ tradedPicks }: { tradedPicks: any[] }) {
  if (!tradedPicks?.length) return (
    <div className="px-5 py-6 text-center text-zinc-600 text-sm">No traded picks detected for this season.</div>
  );
  const acquired   = tradedPicks.filter((t: any) => t.type === "ACQUIRED");
  const tradedAway = tradedPicks.filter((t: any) => t.type === "TRADED_AWAY");
  return (
    <div className="p-4 space-y-4">
      {acquired.length > 0 && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-violet-400 mb-2 flex items-center gap-1.5">
            <ArrowUpRight className="h-3 w-3" /> Acquired Picks ({acquired.length})
          </p>
          <div className="space-y-1.5">
            {acquired.map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
                <span className="text-xs font-bold text-violet-300">Rd {t.round}</span>
                <span className="text-xs text-zinc-200">{t.teamName}</span>
                <span className="text-[11px] text-zinc-500">· {t.ownerName}</span>
                <span className="text-[11px] text-violet-500 ml-auto">Pick #{t.pickNumber}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tradedAway.length > 0 && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-violet-400 mb-2 flex items-center gap-1.5">
            <ArrowDownRight className="h-3 w-3" /> Traded Away ({tradedAway.length})
          </p>
          <div className="space-y-1.5">
            {tradedAway.map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
                <span className="text-xs font-bold text-violet-300">Rd {t.round}</span>
                <span className="text-xs text-zinc-200">{t.teamName}</span>
                <span className="text-[11px] text-zinc-500">· {t.ownerName}</span>
                <span className="text-[11px] text-violet-500 ml-auto">Missing pick</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mock draft board ──────────────────────────────────────────────────────────


// ── Mock Draft Board (with Live Draft, Board, By Team, Interactive Mode) ─────

interface KeeperOverride {
  teamId: number;
  playerName: string;
  position: string;
  /** Draft board round (matches `draft_picks.roundId` for keeper slot), not keeper cost round */
  keeperRound: number;
}

// ── Live Draft Engine (real, stateful: AI fills other teams, you take your picks) ──
function LiveDraftEngine({
  picks, teams, availablePool, yourTeamId,
}: {
  picks: any[]; teams: any[]; availablePool: any[]; yourTeamId: number | null;
}) {
  const keyOf = (p: any) => p?.id ?? `name:${String(p?.name ?? "").toLowerCase().trim()}`;
  const POS_CAPS: Record<string, number> = { QB: 2, RB: 6, WR: 6, TE: 2, K: 1, DEF: 1 };

  const schedule = useMemo(() => [...picks].sort((a, b) => a.pickNumber - b.pickNumber), [picks]);
  const totalRounds = useMemo(() => schedule.reduce((m, s) => Math.max(m, Number(s.round) || 0), 0), [schedule]);

  // Keeper slots are pre-filled before the draft starts
  const initialResults = useMemo(() => {
    const r: Record<number, any> = {};
    for (const s of schedule) {
      if (s.isKeeperSlot && s.player) {
        r[s.pickNumber] = {
          id: `keeper:${String(s.player).toLowerCase().trim()}`,
          name: s.player, position: s.position,
          projectedPoints: s.projectedPoints ?? 0, adp: null, marketValue: null, isKeeper: true,
        };
      }
    }
    return r;
  }, [schedule]);

  const [results, setResults] = useState<Record<number, any>>(initialResults);
  const [idx, setIdx]         = useState(0);
  const [running, setRunning] = useState(false);
  const [sort, setSort]       = useState<"adp" | "proj" | "value" | "pos" | "name">("adp");
  const [posFilter, setPos]   = useState<string>("ALL");
  const [searchQ, setSearchQ] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SPEED_MS = 450;

  useEffect(() => {
    setResults(initialResults); setIdx(0); setRunning(false);
    if (timer.current) clearTimeout(timer.current);
  }, [initialResults]);

  const byAdp = (p: any) => (p.adp != null ? Number(p.adp) : (p.rank ?? 9999));

  const draftedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const k of Object.keys(results)) s.add(keyOf(results[Number(k)]));
    return s;
  }, [results]);

  const available = useMemo(() => {
    let list = availablePool.filter((p: any) => !draftedKeys.has(keyOf(p)));
    if (posFilter !== "ALL") list = list.filter((p: any) => p.position === posFilter);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      list = list.filter((p: any) => p.name.toLowerCase().includes(q) || (p.position ?? "").toLowerCase().includes(q));
    }
    const s = [...list];
    if (sort === "adp") s.sort((a, b) => byAdp(a) - byAdp(b));
    else if (sort === "proj") s.sort((a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0));
    else if (sort === "value") s.sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1));
    else if (sort === "pos") s.sort((a, b) => (a.position ?? "").localeCompare(b.position ?? "") || byAdp(a) - byAdp(b));
    else s.sort((a, b) => a.name.localeCompare(b.name));
    return s;
  }, [availablePool, draftedKeys, posFilter, searchQ, sort]);

  const rostersByTeam = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const s of schedule) {
      const res = results[s.pickNumber];
      if (!res) continue;
      const tid = Number(s.teamId);
      if (!m.has(tid)) m.set(tid, []);
      m.get(tid)!.push({ ...res, round: s.round, pickNumber: s.pickNumber });
    }
    return m;
  }, [schedule, results]);

  // Draft grades (A–F) per team: value captured (players landed later than their ADP = steals,
  // vs reaches) blended with roster strength (avg market value of who they drafted). Scored 0–1
  // then graded on a curve relative to the rest of the league. Drafted players only (not keepers).
  const draftGrades = useMemo(() => {
    const raw = new Map<number, { score: number; avgDelta: number; strength: number; n: number }>();
    for (const [tid, roster] of rostersByTeam) {
      const drafted = roster.filter((r: any) => !r.isKeeper && r.marketValue != null);
      const withAdp = drafted.filter((r: any) => r.adp != null);
      const avgDelta = withAdp.length
        ? withAdp.reduce((s: number, r: any) => s + (Number(r.pickNumber) - Number(r.adp)), 0) / withAdp.length
        : 0;
      const strength = drafted.length
        ? drafted.reduce((s: number, r: any) => s + Number(r.marketValue || 0), 0) / drafted.length
        : 0;
      const valueScore = Math.max(0, Math.min(1, 0.5 + avgDelta / 50));
      const strengthScore = Math.max(0, Math.min(1, strength / 100));
      raw.set(tid, { score: 0.5 * valueScore + 0.5 * strengthScore, avgDelta, strength, n: drafted.length });
    }
    const ranked = [...raw.entries()].sort((a, b) => b[1].score - a[1].score);
    const total = ranked.length || 1;
    const out = new Map<number, { letter: string; avgDelta: number; strength: number }>();
    ranked.forEach(([tid, v], i) => {
      const p = i / total;
      const letter = v.n < 3 ? "—" : p < 0.14 ? "A" : p < 0.36 ? "B" : p < 0.68 ? "C" : p < 0.90 ? "D" : "F";
      out.set(tid, { letter, avgDelta: v.avgDelta, strength: v.strength });
    });
    return out;
  }, [rostersByTeam]);

  const slot = schedule[idx];
  const done = idx >= schedule.length;
  const awaitingUser = !!slot && !slot.isKeeperSlot && yourTeamId != null && Number(slot.teamId) === yourTeamId && !results[slot.pickNumber];
  const onClock = slot ? teams.find((t: any) => Number(t.teamId) === Number(slot.teamId)) : null;

  // Step engine: keeper slots auto-advance, AI auto-picks, your pick pauses
  useEffect(() => {
    if (!running || done) return;
    const cur = schedule[idx];
    if (!cur) return;
    if (cur.isKeeperSlot) { timer.current = setTimeout(() => setIdx(i => i + 1), 50); return () => clearTimeout(timer.current!); }
    // Your team pauses for a manual pick; every other team auto-plays the pre-computed board.
    if (yourTeamId != null && Number(cur.teamId) === yourTeamId) { setRunning(false); return; }
    timer.current = setTimeout(() => {
      setResults(prev => {
        if (prev[cur.pickNumber]) return prev;
        // Play back the ACTUAL pre-computed pick for this slot (souls behavioral or mock ADP)
        // instead of re-simulating — so the Live Draft shows the real board and runs straight
        // through all rounds without ever stalling on a user pick.
        const pl = availablePool.find((p: any) => p.name === cur.player);
        const chosen = pl ?? {
          name: cur.player ?? "—",
          position: cur.position,
          projectedPoints: cur.projectedPoints ?? 0,
          adp: cur.adp ?? null,
          marketValue: cur.marketValue ?? null,
        };
        return { ...prev, [cur.pickNumber]: { ...chosen, byAI: true } };
      });
      setIdx(i => i + 1);
    }, SPEED_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [running, idx, done, schedule, yourTeamId, totalRounds, availablePool]);

  function userDraft(p: any) {
    const cur = schedule[idx];
    if (!cur) return;
    setResults(prev => ({ ...prev, [cur.pickNumber]: { ...p, byUser: true } }));
    setIdx(i => i + 1);
    setSearchQ("");
    setRunning(true);
  }
  function reset() {
    if (timer.current) clearTimeout(timer.current);
    setResults(initialResults); setIdx(0); setRunning(false);
  }

  const SORTS: [typeof sort, string][] = [["adp","ADP"],["proj","Proj"],["value","Value"],["pos","Pos"],["name","Name"]];
  const POSES = ["ALL","QB","RB","WR","TE","K","DP"];

  return (
    <div className="p-4">
      {/* Control bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {!running && !done && <button onClick={() => setRunning(true)} className="px-4 py-1.5 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300 text-xs font-black hover:bg-violet-500/25">{idx === 0 ? "▶ Start Draft" : "▶ Resume"}</button>}
        {running && <button onClick={() => setRunning(false)} className="px-4 py-1.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-black">⏸ Pause</button>}
        {idx > 0 && <button onClick={reset} className="px-3 py-1.5 rounded text-zinc-500 text-xs hover:text-zinc-300 border border-zinc-700">↺ Reset</button>}
        <span className="text-[11px] text-zinc-500 tabular-nums ml-1">Pick {Math.min(idx, schedule.length)}/{schedule.length}</span>
        <span className="text-[11px] text-zinc-600 ml-auto">{yourTeamId == null ? "Spectating — AI drafts everyone" : "AI drafts other teams; you pick for your team"}</span>
      </div>

      {/* On the clock */}
      {!done && onClock && (
        <div className={cn("rounded-lg border px-4 py-2.5 mb-3 flex items-center gap-3 flex-wrap",
          awaitingUser ? "border-violet-500/50 bg-violet-500/10" : "border-zinc-800 bg-white/[0.03]")}>
          {awaitingUser ? <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" /> : null}
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider">{awaitingUser ? "Your pick" : "On the clock"}</span>
          <span className="font-black text-zinc-100">{onClock.teamName}</span>
          <span className="text-[11px] text-zinc-600">{onClock.ownerName}</span>
          <span className="text-[11px] text-zinc-600 ml-auto tabular-nums">Round {slot?.round} · Pick #{slot?.pickNumber}</span>
        </div>
      )}
      {done && <div className="rounded-lg border border-violet-500/40 bg-violet-500/5 px-4 py-3 mb-3 text-center text-violet-300 font-black text-sm">✓ Draft complete — {schedule.length} picks</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Available pool (sortable) */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-black text-zinc-300 uppercase tracking-wider">Available</span>
            <span className="text-[11px] text-zinc-600">{available.length} players</span>
            <div className="flex gap-1 ml-auto">
              {SORTS.map(([k, lbl]) => (
                <button key={k} onClick={() => setSort(k)} className={cn("px-2 py-0.5 rounded text-[11px] font-bold", sort === k ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>{lbl}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-1 mb-2 flex-wrap">
            {POSES.map(p => (
              <button key={p} onClick={() => setPos(p)} className={cn("px-2 py-0.5 rounded text-[11px] font-bold", posFilter === p ? "bg-violet-600/30 text-violet-200" : "text-zinc-500 hover:text-zinc-300 border border-white/[0.06]")}>{p}</button>
            ))}
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search…" className="ml-auto text-[11px] bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-200 placeholder-zinc-600" />
          </div>
          <div className="rounded-lg border border-white/[0.06] divide-y divide-white/[0.06] max-h-[460px] overflow-auto">
            {available.slice(0, 120).map((p: any) => (
              <button key={keyOf(p)} disabled={!awaitingUser}
                onClick={() => awaitingUser && userDraft(p)}
                className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-left",
                  awaitingUser ? "hover:bg-violet-500/10 cursor-pointer" : "cursor-default")}>
                <span className="text-[11px] text-zinc-600 w-8 tabular-nums shrink-0">{p.adp != null ? Number(p.adp).toFixed(1) : (p.rank ?? "—")}</span>
                <PosPill pos={p.position} />
                <span className="text-xs font-bold text-zinc-200 flex-1 truncate">{p.name}</span>
                <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">{Math.round(p.projectedPoints ?? 0)} pts</span>
                <span className="text-[11px] text-zinc-600 tabular-nums shrink-0 w-12 text-right">{p.marketValue != null ? `${Math.round(p.marketValue)}` : "—"}</span>
                {awaitingUser && <span className="text-[10px] font-black text-violet-400 shrink-0">DRAFT</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Live team rosters */}
        <div>
          <span className="text-xs font-black text-zinc-300 uppercase tracking-wider mb-2 block">Teams</span>
          <div className="space-y-2 max-h-[500px] overflow-auto pr-1">
            {teams.map((t: any) => {
              const tid = Number(t.teamId);
              const roster = (rostersByTeam.get(tid) ?? []).sort((a, b) => a.pickNumber - b.pickNumber);
              const grade = draftGrades.get(tid);
              const isOnClock = !done && slot && Number(slot.teamId) === tid;
              const isYou = yourTeamId === tid;
              return (
                <div key={tid} className={cn("rounded-lg border p-2", isOnClock ? "border-violet-500/50 bg-violet-500/5" : isYou ? "border-violet-500/30 bg-violet-500/5" : "border-white/[0.06] bg-white/[0.03]")}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[11px] font-black text-zinc-200 truncate">{t.teamName}</span>
                    {grade && grade.letter !== "—" && (
                      <span
                        title={`Draft grade ${grade.letter} — ${grade.avgDelta >= 0 ? "+" : ""}${grade.avgDelta.toFixed(0)} avg value vs ADP, ${grade.strength.toFixed(0)}/100 avg talent`}
                        className={cn("text-[10px] font-black px-1.5 rounded border shrink-0",
                          grade.letter === "A" ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" :
                          grade.letter === "B" ? "text-lime-300 bg-lime-500/15 border-lime-500/30" :
                          grade.letter === "C" ? "text-amber-300 bg-amber-500/15 border-amber-500/30" :
                          grade.letter === "D" ? "text-orange-300 bg-orange-500/15 border-orange-500/30" :
                          "text-red-300 bg-red-500/15 border-red-500/30")}>
                        {grade.letter}
                      </span>
                    )}
                    {isYou && <span className="text-[10px] font-black text-violet-300 bg-violet-500/15 px-1 rounded">YOU</span>}
                    <span className="text-[10px] text-zinc-600 ml-auto tabular-nums">{roster.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {roster.map((r: any) => (
                      <span key={r.pickNumber} className={cn("text-[10px] px-1.5 py-0.5 rounded border truncate max-w-[120px]",
                        r.isKeeper ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-zinc-700/60 bg-zinc-800/50 text-zinc-300")}
                        title={`${r.name} (${r.position}) R${r.round}`}>
                        <span className="text-zinc-500">{r.position}</span> {String(r.name ?? "—").split(" ").slice(-1)[0]}
                      </span>
                    ))}
                    {roster.length === 0 && <span className="text-[10px] text-zinc-600">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SoulsBoardView({ board }: {
  board: {
    picks: Array<{ overall: number; round: number; pickInRound: number; ownerName: string; playerName: string; position: string; lowConfidence: boolean }>;
    teamCount: number;
    rounds: number;
    picksCompleted: number;
  };
}) {
  const posColor = (p: string) =>
    p === "QB" ? "text-red-400"
      : p === "RB" ? "text-green-400"
      : p === "WR" ? "text-blue-400"
      : p === "TE" ? "text-amber-400"
      : p === "DP" ? "text-purple-400"
      : "text-zinc-400";
  const byRound = new Map<number, typeof board.picks>();
  for (const p of board.picks) {
    const arr = byRound.get(p.round) ?? [];
    arr.push(p);
    byRound.set(p.round, arr);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Behavioral simulation — {board.picksCompleted} picks · each of {board.teamCount} owners drafts in-character from their fitted personality.
      </p>
      {rounds.map((r) => (
        <div key={r}>
          <div className="text-xs font-semibold text-zinc-400 mb-1">Round {r}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {(byRound.get(r) ?? [])
              .slice()
              .sort((a, b) => a.pickInRound - b.pickInRound)
              .map((p) => (
                <div key={p.overall} className="flex items-center gap-2 rounded-md bg-zinc-800/40 px-2 py-1 text-xs">
                  <span className="text-zinc-600 w-9 shrink-0">{p.round}.{String(p.pickInRound).padStart(2, "0")}</span>
                  <span className="text-zinc-300 truncate max-w-[7rem]">{p.ownerName}</span>
                  <span className="text-zinc-600 shrink-0">→</span>
                  <span className="text-zinc-100 truncate flex-1">{p.playerName}</span>
                  <span className={`${posColor(p.position)} shrink-0 font-medium`}>{p.position}</span>
                  {p.lowConfidence && <span className="text-amber-600 shrink-0" title="thin signal — low confidence">~</span>}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MockDraftBoard({
  picks, teams, availablePool, keeperPredictions, rosterNeeds,
  onKeeperOverride, keeperOverrides, keepersEnabled = true,
}: {
  picks: any[]; teams: any[];
  availablePool: any[];
  keeperPredictions: any[];
  rosterNeeds: any[];
  onKeeperOverride: (overrides: KeeperOverride[]) => void;
  keeperOverrides: KeeperOverride[];
  keepersEnabled?: boolean;
}) {
  const [view, setView]           = useState<"board" | "team" | "live">("board");
  const [selTeam, setSelTeam]     = useState<number | null>(null);
  const [expandPick, setExp]      = useState<number | null>(null);
  // Live simulation state
  const [liveIdx, setLiveIdx]   = useState(0);
  const [simState, setSimState] = useState<"idle" | "running" | "done">("idle");
  const [myPick, setMyPick]     = useState<null | { pickNumber: number; round: number }>(null);
  const [searchQ, setSearchQ]   = useState("");
  const simRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SPEED_MS = 500;

  // Keeper setup state
  const [showKeeperSetup, setShowKeeperSetup] = useState(false);
  const [pendingOverrides, setPendingOverrides] = useState<any[]>(keeperOverrides);
  const [yourTeamId, setYourTeamId] = useState<number | null>(null);

  // Teams with an official keeper slot on the board (excludes hypothetical-only rows)
  const keeperTeams = keeperPredictions
    .filter((kp: any) => kp.status !== "HYPOTHETICAL" && kp.keeperSlotRound != null && Number(kp.keeperSlotRound) > 0)
    .map((kp: any) => ({
      teamId: kp.teamId,
      teamName: kp.teamName,
      keeperSlotRound: Number(kp.keeperSlotRound),
      keeperCostRound: Number(kp.keeperRound),
      currentPrediction: kp.predictedPlayer,
      position: kp.position,
      roster: rosterNeeds.find((n: any) => n.teamId === kp.teamId),
    }));

  function startSim() { setLiveIdx(0); setSimState("running"); }
  function pauseSim() { setSimState(s => s === "running" ? "idle" : "running"); }
  function skipSim()  { if (simRef.current) clearTimeout(simRef.current); setLiveIdx(picks.length); setSimState("done"); }
  function resetSim() { if (simRef.current) clearTimeout(simRef.current); setLiveIdx(0); setSimState("idle"); setMyPick(null); }

  useEffect(() => {
    if (simState !== "running") return;
    if (liveIdx >= picks.length) { setSimState("done"); return; }

    const nextPick = picks[liveIdx];
    // Pause if this is my pick (non-keeper)
    if (yourTeamId && Number(nextPick?.teamId) === yourTeamId && !nextPick?.isKeeperSlot) {
      setSimState("idle");
      setMyPick({ pickNumber: nextPick.pickNumber, round: nextPick.round });
      return;
    }
    simRef.current = setTimeout(() => setLiveIdx(i => i + 1), SPEED_MS);
    return () => { if (simRef.current) clearTimeout(simRef.current); };
  }, [simState, liveIdx, picks.length, yourTeamId]);

  // Roster lookup for keeper setup
  function getRosterForTeam(teamId: number): string[] {
    const nr = rosterNeeds.find((n: any) => n.teamId === teamId);
    if (!nr) return [];
    return Object.keys(nr.positionCounts ?? {}).length > 0
      ? (nr.draftPriority ?? []) // fallback
      : [];
  }

  // Get full roster from keeperTeams context
  const [rosterByTeam, setRosterByTeam] = useState<Map<number, any[]>>(new Map());

  // Filter players for picker
  const pickerPlayers = useMemo(() => {
    const drafted = new Set(picks.slice(0, liveIdx).map((p: any) => p.player));
    return availablePool.filter(p => !drafted.has(p.name) && (
      !searchQ || p.name.toLowerCase().includes(searchQ.toLowerCase()) || p.position.toLowerCase().includes(searchQ.toLowerCase())
    ));
  }, [availablePool, picks, liveIdx, searchQ]);

  const rounds = useMemo(() => {
    const r = new Map<number, any[]>();
    for (const p of picks) {
      if (!r.has(p.round)) r.set(p.round, []);
      r.get(p.round)!.push(p);
    }
    return [...r.entries()].sort(([a], [b]) => a - b);
  }, [picks]);

  const teamPicks = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const p of picks) {
      if (!m.has(p.teamId)) m.set(p.teamId, []);
      m.get(p.teamId)!.push(p);
    }
    return m;
  }, [picks]);

  return (
    <div>
      {/* Controls bar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06] flex-wrap">
        {(["board", "team", "live"] as const).map(v => (
          <button key={v} onClick={() => { setView(v); if (v === "live") resetSim(); }}
            className={cn("px-3 py-1.5 rounded text-xs font-bold transition-colors",
              view === v ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
            {v === "live" ? "⚡ Live Draft" : v === "board" ? "Draft Board" : "By Team"}
          </button>
        ))}

        {keepersEnabled && (
        <button onClick={() => setShowKeeperSetup(s => !s)}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border transition-colors",
            showKeeperSetup ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-zinc-700 text-zinc-500 hover:text-zinc-300")}>
          🔑 Keeper Setup {keeperOverrides.length > 0 && <span className="bg-amber-500/30 px-1 rounded">{keeperOverrides.length}</span>}
        </button>
        )}

        {/* Your team selector */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] text-zinc-600">Your team:</span>
          <select className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
            value={yourTeamId ?? ""} onChange={e => setYourTeamId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Spectate —</option>
            {teams.map((t: any) => <option key={t.teamId} value={t.teamId}>{t.teamName}</option>)}
          </select>
        </div>

        {view === "team" && (
          <select className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
            value={selTeam ?? ""} onChange={e => setSelTeam(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select team…</option>
            {teams.map((t: any) => <option key={t.teamId} value={t.teamId}>{t.teamName}</option>)}
          </select>
        )}

        {false && view === "live" && (
          <div className="flex items-center gap-2">
            {simState === "idle" && liveIdx === 0 && <button onClick={startSim} className="px-3 py-1.5 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300 text-xs font-bold hover:bg-violet-500/25">▶ Start</button>}
            {(simState === "running" || (simState === "idle" && liveIdx > 0)) && liveIdx < picks.length && !myPick && (
              <button onClick={pauseSim} className="px-3 py-1.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold">
                {simState === "running" ? "⏸ Pause" : "▶ Resume"}
              </button>
            )}
            {liveIdx < picks.length && liveIdx > 0 && !myPick && <button onClick={skipSim} className="px-2 py-1 text-zinc-500 text-xs hover:text-zinc-300">⏩ Skip</button>}
            {(simState === "done" || liveIdx > 0) && <button onClick={resetSim} className="px-2 py-1 text-zinc-500 text-xs hover:text-zinc-300">↺ Reset</button>}
            <span className="text-[11px] text-zinc-600 tabular-nums">Pick {Math.min(liveIdx, picks.length)}/{picks.length}</span>
          </div>
        )}
      </div>

      {/* Keeper Setup Panel */}
      {keepersEnabled && showKeeperSetup && (
        <div className="border-b border-white/[0.06] bg-white/[0.02]/40 px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-amber-400 uppercase tracking-wider">🔑 Manual Keeper Assignment</p>
            <button onClick={() => { onKeeperOverride(pendingOverrides); setShowKeeperSetup(false); }}
              className="px-3 py-1.5 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300 text-xs font-bold hover:bg-violet-500/25">
              ✓ Apply Overrides
            </button>
          </div>
          <p className="text-[11px] text-zinc-600">Override the AI keeper predictions. Select a player from each team's roster to keep at the assigned round.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {keeperTeams.map(kt => {
              const current = pendingOverrides.find(o => o.teamId === kt.teamId && o.keeperRound === kt.keeperSlotRound);
              return (
                <div key={`${kt.teamId}-${kt.keeperSlotRound}`} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-200">{kt.teamName}</span>
                    <span className="text-[11px] text-zinc-600 tabular-nums">Slot Rd {kt.keeperSlotRound} · Cost Rd {kt.keeperCostRound}</span>
                    {current && <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-1.5 rounded ml-auto">OVERRIDE</span>}
                  </div>
                  <p className="text-[11px] text-zinc-500">AI predicts: <span className="text-zinc-300 font-semibold">{kt.currentPrediction}</span></p>
                  {/* Show roster from availablePool + current roster */}
                  <div className="flex gap-2">
                    <select
                      className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300"
                      value={current?.playerName ?? ""}
                      onChange={e => {
                        const val = e.target.value;
                        const pool = availablePool;
                        const player = pool.find(p => p.name === val);
                        if (!val) {
                          setPendingOverrides(prev => prev.filter(o => !(o.teamId === kt.teamId && o.keeperRound === kt.keeperSlotRound)));
                        } else {
                          setPendingOverrides(prev => [
                            ...prev.filter(o => !(o.teamId === kt.teamId && o.keeperRound === kt.keeperSlotRound)),
                            {
                              teamId: kt.teamId,
                              playerName: val,
                              position: player?.position ?? "?",
                              keeperRound: kt.keeperSlotRound,
                            },
                          ]);
                        }
                      }}
                    >
                      <option value="">— Use AI prediction —</option>
                      {(() => {
                        const teamRoster = rosterNeeds.find((n: any) => n.teamId === kt.teamId);
                        const rosterPlayers: string[] = (teamRoster?.allPlayers ?? teamRoster?.draftPriority ?? []) as string[];
                        const options = rosterPlayers.length > 0
                          ? rosterPlayers.map((name: string) => {
                              const p = availablePool.find((ap: any) => ap.name === name);
                              return { name, position: p?.position ?? "?", pts: p?.projectedPoints ?? 0, adp: p?.adp ?? p?.rank };
                            })
                          : availablePool.slice(0, 80).map((p: any) => ({
                              name: p.name,
                              position: p.position,
                              pts: p.projectedPoints,
                              adp: p.adp ?? p.rank,
                            }));
                        return options.map((p: any) => (
                          <option key={p.name} value={p.name}>
                            {p.name} ({p.position ?? "?"}) · {Number(p.pts ?? 0).toFixed(0)} pts
                            {p.adp != null ? ` · ADP ${p.adp}` : ""}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive My Pick overlay */}
      {false && myPick && view === "live" && (
        <div className="border border-violet-500/40 bg-violet-500/5 px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            <span className="font-black text-violet-300 text-sm">YOUR PICK</span>
            <span className="text-zinc-400 text-xs">Round {myPick?.round} · Pick #{myPick?.pickNumber}</span>
            <button onClick={() => { setMyPick(null); setLiveIdx(i => i + 1); setSimState("running"); }}
              className="ml-auto px-2 py-1 text-zinc-500 text-xs hover:text-zinc-300">Skip (AI picks)</button>
          </div>
          <input
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 placeholder-zinc-600"
            placeholder="Search players by name or position…"
            value={searchQ} onChange={e => setSearchQ(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-auto">
            {pickerPlayers.slice(0, 30).map((p: any) => (
              <button key={p.name}
                onClick={() => {
                  // Override this pick in the simulation
                  setMyPick(null);
                  setSearchQ("");
                  // Mark as manually picked — advance simulation with this player
                  setLiveIdx(i => i + 1);
                  setSimState("running");
                }}
                className="text-left rounded-lg border border-zinc-700/60 bg-white/[0.04] hover:border-violet-500/40 hover:bg-violet-500/8 p-2 transition-all">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <PosPill pos={p.position} />
                  <span className="text-[10px] font-bold text-zinc-500">ADP {p.adp ?? p.rank}</span>
                </div>
                <div className="text-xs font-bold text-zinc-200 leading-tight truncate">{p.name}</div>
                <div className="text-[10px] text-zinc-500">{p.projectedPoints.toFixed(0)} pts · Val {p.marketValue != null ? Math.round(p.marketValue) : "—"}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Live Draft (new stateful engine) */}
      {view === "live" && (
        <LiveDraftEngine picks={picks} teams={teams} availablePool={availablePool} yourTeamId={yourTeamId} />
      )}

      {/* Old playback live view (disabled) */}
      {false && view === "live" && !myPick && (
        <div>
          {simState === "idle" && liveIdx === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-4">
              <div className="text-5xl">⚡</div>
              <h3 className="font-black text-zinc-200 text-lg">Live Mock Draft Simulator</h3>
              <p className="text-zinc-500 text-sm text-center max-w-md">
                Watch all 196 picks unfold. Select your team above to take over your own picks interactively.
              </p>
              <button onClick={startSim} className="px-6 py-3 rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-300 font-black text-sm hover:bg-violet-500/25">
                ▶ Start Draft Simulation
              </button>
            </div>
          ) : (
            <div>
              <div className="h-1 bg-zinc-800">
                <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${(liveIdx / picks.length) * 100}%` }} />
              </div>
              {liveIdx > 0 && (() => {
                const cur = picks[Math.min(liveIdx, picks.length) - 1];
                return (
                  <div className={cn("px-5 py-3 border-b border-white/[0.06]", simState === "running" ? "bg-violet-500/5" : "bg-zinc-900/20")}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[11px] text-zinc-500">On the clock:</span>
                      <span className="font-black text-zinc-100">{cur?.ownerName}</span>
                      <span className="text-zinc-600 text-[11px]">{cur?.teamName}</span>
                      <span className="text-[11px] text-zinc-600 ml-auto">Pick {cur?.pickNumber} · Rd {cur?.round}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="font-black text-xl text-white">{cur?.player}</span>
                      <PosPill pos={cur?.position} />
                      {cur?.projectedPoints > 0 && <span className="text-zinc-500 text-xs">{cur?.projectedPoints?.toFixed(0)} pts</span>}
                      {cur?.isKeeperSlot && <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 rounded">KEEPER</span>}
                    </div>
                  </div>
                );
              })()}
              <div className="max-h-[400px] overflow-auto">
                {picks.slice(0, liveIdx).reverse().map((p: any) => (
                  <div key={p.pickNumber} className={cn("flex items-center gap-3 px-5 py-2 hover:bg-zinc-800/20",
                    p.isKeeperSlot && "bg-amber-500/5",
                    p.pickNumber === liveIdx && "border-l-2 border-l-violet-500 bg-violet-500/5")}>
                    <span className="text-[11px] text-zinc-600 w-10 tabular-nums shrink-0">{p.round}.{String(p.roundPick).padStart(2,"0")}</span>
                    <PosPill pos={p.position} />
                    <span className="text-sm font-bold text-zinc-200 flex-1 truncate">{p.player}</span>
                    <span className="text-[11px] text-zinc-500 shrink-0 truncate max-w-[120px]">{p.ownerName}</span>
                    {p.projectedPoints > 0 && <span className="text-[11px] text-zinc-600 tabular-nums shrink-0">{p.projectedPoints?.toFixed(0)}</span>}
                    <div className="w-12 shrink-0"><ConfBar value={p.confidence} small /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Draft Board — grid by round with ADP column */}
      {view === "board" && (
        <div className="overflow-auto max-h-[700px]">
          {rounds.map(([round, rPicks]) => (
            <div key={round} className="border-b border-zinc-800/20">
              <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur px-4 py-1.5 flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Round {round}</span>
                <div className="flex-1 h-px bg-white/[0.03]" />
                <span className="text-[10px] text-zinc-700">{rPicks.length} picks</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-px bg-zinc-800/20">
                {rPicks.map((p: any) => {
                  // Real ADP for this player (carried on the pick, fallback to the board)
                  const adp = p.adp ?? availablePool.find(ap => ap.name === p.player)?.adp;
                  return (
                    <button key={p.pickNumber}
                      onClick={() => setExp(expandPick === p.pickNumber ? null : p.pickNumber)}
                      className={cn(
                        "text-left p-2.5 bg-zinc-900/60 hover:bg-white/[0.04] transition-colors",
                        p.isKeeperSlot && "border border-amber-500/20 bg-amber-500/5",
                        p.tradedPickContext && "border-t-2 border-t-violet-500/50",
                        yourTeamId && Number(p.teamId) === yourTeamId && "border border-violet-500/30 bg-violet-500/5",
                        expandPick === p.pickNumber && "ring-1 ring-violet-500/40"
                      )}>
                      <div className="flex items-center gap-1 mb-1 flex-wrap">
                        <span className="text-[10px] text-zinc-600 font-mono">{p.pickNumber}</span>
                        <PosPill pos={p.position} />
                        {p.isKeeperSlot && <span className="text-[10px] text-amber-400 font-bold">K</span>}
                        {p.tradedPickContext?.type === "ACQUIRED" && <span className="text-[10px] text-violet-400 font-bold">T↑</span>}
                        {yourTeamId && Number(p.teamId) === yourTeamId && <span className="text-[10px] text-violet-400 font-bold">YOU</span>}
                      </div>
                      <div className="text-[11px] font-bold text-zinc-200 leading-tight truncate">{p.player}</div>
                      <div className="text-[10px] text-zinc-500 truncate mt-0.5">{p.ownerName?.split(" ")[0]}</div>
                      {!p.isKeeperSlot && p.projectedPoints > 0 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-zinc-700 tabular-nums">{p.projectedPoints.toFixed(0)}</span>
                          {adp && <span className="text-[10px] text-zinc-700">ADP {adp}</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Expanded pick detail */}
              {rPicks.some((p: any) => p.pickNumber === expandPick) && (() => {
                const pk = rPicks.find((p: any) => p.pickNumber === expandPick)!;
                const adp = pk.adp ?? availablePool.find(ap => ap.name === pk.player)?.adp;
                const mv = pk.marketValue ?? availablePool.find(ap => ap.name === pk.player)?.marketValue;
                return (
                  <div className="mx-2 my-2 rounded-lg border border-zinc-700/60 bg-zinc-900/80 p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-zinc-100 text-base">{pk.player}</span>
                      <PosPill pos={pk.position} />
                      {pk.isKeeperSlot && <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 rounded">KEEPER SLOT</span>}
                      {pk.tradedPickContext && (
                        <span className={cn("text-[10px] font-bold px-1.5 rounded border",
                          pk.tradedPickContext.type === "ACQUIRED" ? "text-violet-400 bg-violet-500/10 border-violet-500/20" : "text-violet-400 bg-violet-500/10 border-violet-500/20")}>
                          {pk.tradedPickContext.type === "ACQUIRED" ? "↑ ACQUIRED PICK" : "↓ TRADED PICK"}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-3 text-[11px]">
                        {adp != null && <span className="text-zinc-500">ADP: <span className="text-zinc-300 font-bold">{adp}</span></span>}
                        {mv != null && <span className="text-zinc-500">Market value: <span className={cn("font-bold", mv >= 70 ? "text-violet-400" : mv >= 45 ? "text-amber-400" : "text-zinc-400")}>{Math.round(mv)}/100</span></span>}
                        <span className="text-zinc-600">Pick {pk.pickNumber} · Rd {pk.round}</span>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-400 italic">{pk.reasoning}</p>
                    <ConfBar value={pk.confidence} />
                    <EvidenceList items={pk.evidence} />
                    {pk.tradedPickContext && <EvidenceList items={pk.tradedPickContext.evidence} />}
                    {pk.alternatePicks?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Alternates</p>
                        <div className="flex flex-wrap gap-1.5">
                          {pk.alternatePicks.map((a: any, j: number) => {
                            const aAdp = a.adp ?? availablePool.find(ap => ap.name === a.player)?.adp;
                            return (
                              <span key={j} className="text-[11px] text-zinc-500 bg-white/[0.03] border border-white/[0.08] px-2 py-0.5 rounded">
                                {a.player} ({a.position}) · {a.projectedPoints?.toFixed(0)} pts{aAdp ? ` · ADP ${aAdp}` : ""}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {/* By Team view */}
      {view === "team" && selTeam && (
        <div className="divide-y divide-white/[0.06] max-h-[600px] overflow-auto">
          {/* Team summary */}
          {(() => {
            const tp = (teamPicks.get(selTeam) ?? []);
            const mvs = tp
              .map((p: any) => p.marketValue ?? availablePool.find(ap => ap.name === p.player)?.marketValue)
              .filter((v: any) => v != null) as number[];
            const avgVal = mvs.length ? Math.round(mvs.reduce((s: number, v: number) => s + v, 0) / mvs.length) : null;
            return (
              <div className="px-4 py-3 bg-white/[0.03] flex items-center gap-4">
                <span className="font-bold text-zinc-100 text-sm">{teams.find((t: any) => t.teamId === selTeam)?.teamName}</span>
                <span className="text-[11px] text-zinc-500">{tp.length} picks</span>
                <span className="text-[11px] text-violet-400 ml-auto">Avg market value: {avgVal != null ? `${avgVal}/100` : "—"}</span>
              </div>
            );
          })()}
          {(teamPicks.get(selTeam) ?? []).map((p: any) => {
            const adp = p.adp ?? availablePool.find(ap => ap.name === p.player)?.adp;
            const mv = p.marketValue ?? availablePool.find(ap => ap.name === p.player)?.marketValue;
            return (
              <div key={p.pickNumber} className={cn("flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/20",
                p.isKeeperSlot && "bg-amber-500/5",
                p.tradedPickContext?.type === "ACQUIRED" && "border-l-2 border-l-violet-500/60")}>
                <div className="w-14 text-center shrink-0">
                  <div className="text-[10px] text-zinc-600">Rd {p.round}</div>
                  <div className="text-[11px] font-bold text-zinc-400">#{p.pickNumber}</div>
                </div>
                <PosPill pos={p.position} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-zinc-200 truncate">{p.player}</div>
                  <div className="text-[11px] text-zinc-500 truncate">{p.reasoning}</div>
                </div>
                <div className="shrink-0 text-right space-y-0.5">
                  {p.projectedPoints > 0 && <div className="text-xs tabular-nums text-zinc-400">{p.projectedPoints.toFixed(0)} pts</div>}
                  {adp != null && <div className="text-[10px] text-zinc-600">ADP {adp}</div>}
                  {mv != null && <div className={cn("text-[10px] font-bold", mv >= 70 ? "text-violet-400" : "text-zinc-600")}>{Math.round(mv)}/100</div>}
                </div>
                <div className="w-14 shrink-0"><ConfBar value={p.confidence} small /></div>
                {p.isKeeperSlot && <span className="text-[10px] text-amber-400 font-bold shrink-0">KEEPER</span>}
                {p.tradedPickContext?.type === "ACQUIRED" && <span className="text-[10px] text-violet-400 font-bold shrink-0">TRADE↑</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


const GRADE_COLOR: Record<string, string> = {
  A: "text-lime-400 bg-lime-500/10 border-lime-500/40",
  B: "text-violet-400 bg-violet-500/10 border-violet-500/40",
  C: "text-amber-400 bg-amber-500/10 border-amber-500/40",
  D: "text-orange-400 bg-orange-500/10 border-orange-500/40",
  F: "text-red-400 bg-red-500/10 border-red-500/40",
};

function DraftEnvironmentSection({ env, showKeeperDistortion = true }: { env: any; showKeeperDistortion?: boolean }) {
  if (!env) return <div className="px-5 py-6 text-zinc-600 text-sm">No environment data.</div>;

  const envCardsAll = [
    { icon: TrendingUp,    label: "Strongest Position", val: env.strongestPosition?.position ?? "—", sub: env.strongestPosition?.reason, color: "text-violet-400", border: "border-violet-500/25 bg-violet-500/5" },
    { icon: Wind,          label: "Weakest Position",   val: env.weakestPosition?.position ?? "—",   sub: env.weakestPosition?.reason,   color: "text-violet-400",     border: "border-violet-500/25 bg-violet-500/5" },
    { icon: Flame,         label: "Biggest Run Risk",   val: env.biggestRunRisk?.position ?? "—",     sub: env.biggestRunRisk?.reason,    color: "text-amber-400",   border: "border-amber-500/25 bg-amber-500/5" },
    { icon: Target,        label: "Best Value Pocket",  val: env.biggestValuePocket?.position ?? "—", sub: env.biggestValuePocket?.reason, color: "text-violet-400",    border: "border-violet-500/25 bg-violet-500/5" },
    { icon: Lock,          label: "Keeper Distortion",  val: env.mostDistortedByKeepers?.position ?? "—", sub: env.mostDistortedByKeepers?.reason, color: "text-violet-400", border: "border-violet-500/25 bg-violet-500/5" },
  ];
  const envCards = showKeeperDistortion
    ? envCardsAll
    : envCardsAll.filter((c) => c.label !== "Keeper Distortion");

  return (
    <div className="p-4 space-y-4">
      {/* Stat cards row */}
      <div className={cn("grid grid-cols-2 sm:grid-cols-3 gap-2", envCards.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        {envCards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className={cn("rounded-xl border p-3 space-y-1", c.border)}>
              <div className="flex items-center gap-1.5">
                <Icon className={cn("h-3 w-3 shrink-0", c.color)} />
                <span className={cn("text-[10px] font-black uppercase tracking-wider", c.color)}>{c.label}</span>
              </div>
              <div className={cn("text-2xl font-black", c.color)}>{c.val}</div>
              <p className="text-[10px] text-zinc-600 leading-relaxed line-clamp-2">{c.sub}</p>
            </div>
          );
        })}
      </div>

      {/* League depth grade table */}
      {env.leagueDepthGrade && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-2">League Depth Grades</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(env.leagueDepthGrade).map(([pos, grade]) => (
              <div key={pos} className={cn("rounded-lg border px-3 py-2 flex items-center gap-2", GRADE_COLOR[grade as string] ?? "text-zinc-400 bg-zinc-800 border-zinc-700")}>
                <PosPill pos={pos} />
                <span className="text-sm font-black">{grade as string}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">Grade = elite supply vs. league-wide starters needed. A = deep, F = barren.</p>
        </div>
      )}
    </div>
  );
}

// ── Run Alerts Section (Phase 1.75) ──────────────────────────────────────────

function RunAlertsSection({ alerts }: { alerts: any[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!alerts.length) return <div className="px-5 py-6 text-zinc-600 text-sm text-center">No position run alerts detected.</div>;

  return (
    <div className="divide-y divide-white/[0.06]">
      {alerts.map((a, i) => (
        <div key={i} className="px-5 py-4">
          <button
            onClick={() => setExpanded(expanded === a.position ? null : a.position)}
            className="w-full text-left space-y-2"
          >
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-400" />
                <span className="font-black text-zinc-100 text-base">{a.position} Run</span>
                <PosPill pos={a.position} />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[11px] text-zinc-500">{a.roundWindow}</span>
                <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">{a.teamCount} teams</span>
                <span className="text-[11px] text-zinc-600">Rd {a.expectedRound}</span>
              </div>
            </div>
            <ConfBar value={a.confidence} />
          </button>

          {expanded === a.position && (
            <div className="mt-3 space-y-2">
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Affected Owners</p>
                <div className="flex flex-wrap gap-1.5">
                  {(a.affectedOwners ?? []).map((o: string, j: number) => (
                    <span key={j} className="text-[11px] text-zinc-300 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded">{o}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Mock Draft Triggers</p>
                <div className="space-y-0.5">
                  {(a.triggerPicks ?? []).map((tp: string, j: number) => (
                    <div key={j} className="text-[11px] text-zinc-500 flex items-start gap-1.5">
                      <span className="text-amber-600 shrink-0">→</span>{tp}
                    </div>
                  ))}
                </div>
              </div>
              <EvidenceList items={a.evidence} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Scarcity Section (Phase 1.75) ─────────────────────────────────────────────

const SCARCITY_COLORS = {
  CRITICAL: "border-red-500/40 bg-red-500/8 text-red-400",
  HIGH:     "border-amber-500/40 bg-amber-500/8 text-amber-400",
  MEDIUM:   "border-violet-500/40 bg-violet-500/8 text-violet-400",
  LOW:      "border-zinc-700 bg-white/[0.03] text-zinc-400",
};

function ScarcitySection({ alerts }: { alerts: any[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!alerts.length) return <div className="px-5 py-6 text-zinc-600 text-sm text-center">No scarcity data.</div>;

  return (
    <div className="p-4 space-y-3">
      {/* Visual scarcity bar grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-2">
        {alerts.map(a => {
          const urg = a.urgency as keyof typeof SCARCITY_COLORS;
          const fillPct = Math.min(100, Math.round(a.demandScore * 50));
          return (
            <button key={a.position}
              onClick={() => setExpanded(expanded === a.position ? null : a.position)}
              className={cn("rounded-xl border p-3 text-left transition-all hover:scale-105", SCARCITY_COLORS[urg] ?? SCARCITY_COLORS.LOW)}>
              <div className="flex items-center justify-between mb-1.5">
                <PosPill pos={a.position} />
                <span className="text-[10px] font-black uppercase">{a.urgency}</span>
              </div>
              <div className="text-xl font-black tabular-nums">{a.eliteSupply}</div>
              <div className="text-[10px] opacity-70">elite available</div>
              <div className="mt-2 h-1 bg-black/30 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-current opacity-70 transition-all" style={{ width: `${fillPct}%` }} />
              </div>
              <div className="text-[10px] mt-1 opacity-60">Demand: {a.demandScore.toFixed(2)}</div>
            </button>
          );
        })}
      </div>

      {/* Expanded detail */}
      {expanded && (() => {
        const a = alerts.find(x => x.position === expanded);
        if (!a) return null;
        return (
          <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <PosPill pos={a.position} />
              <span className="font-bold text-zinc-100">{a.position} Scarcity Analysis</span>
              <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded border ml-auto", SCARCITY_COLORS[a.urgency as keyof typeof SCARCITY_COLORS] ?? SCARCITY_COLORS.LOW)}>{a.urgency}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { l: "Total Pool",    v: a.totalPool },
                { l: "Elite Supply",  v: a.eliteSupply },
                { l: "Demand Score",  v: a.demandScore.toFixed(2) },
              ].map(s => (
                <div key={s.l} className="text-center bg-white/[0.03] rounded-lg p-2">
                  <div className="text-lg font-black text-white">{s.v}</div>
                  <div className="text-[10px] text-zinc-600 uppercase">{s.l}</div>
                </div>
              ))}
            </div>
            {/* Round-by-round remaining */}
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Projected Remaining Supply by Round</p>
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(a.remainingAfterRound ?? {}).slice(0, 10).map(([rd, rem]: [string, any]) => (
                  <div key={rd} className={cn("text-center rounded px-2 py-1 min-w-[32px]",
                    rem <= 0 ? "bg-red-500/20 text-red-400" : rem <= 3 ? "bg-amber-500/20 text-amber-400" : "bg-white/[0.04] text-zinc-300")}>
                    <div className="text-xs font-black">{rem}</div>
                    <div className="text-[10px] text-zinc-600">R{rd}</div>
                  </div>
                ))}
              </div>
            </div>
            <EvidenceList items={a.evidence} />
          </div>
        );
      })()}
    </div>
  );
}

// ── Compression Section (Phase 1.75) ─────────────────────────────────────────

const TIER_CONFIG = {
  HEAVY:    { color: "text-violet-400",    bg: "bg-violet-500/15 border-violet-500/40" },
  MODERATE: { color: "text-amber-400",  bg: "bg-amber-500/15 border-amber-500/40" },
  LIGHT:    { color: "text-violet-400",    bg: "bg-violet-500/15 border-violet-500/40" },
  NONE:     { color: "text-zinc-500",   bg: "bg-white/[0.04] border-white/[0.08]" },
};

function CompressionSection({ compression }: { compression: any[] }) {
  if (!compression.length) return <div className="px-5 py-6 text-zinc-600 text-sm text-center">No keeper compression data.</div>;

  return (
    <div className="p-4 space-y-3">
      {/* Summary bar chart */}
      <div className="space-y-2">
        {compression.map(c => {
          const cfg = TIER_CONFIG[c.effectiveTier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.NONE;
          const barW = Math.min(100, Math.round(c.compressionPct * 4));  // scale: 25% = full bar
          return (
            <div key={c.position} className="space-y-1">
              <div className="flex items-center gap-3">
                <PosPill pos={c.position} />
                <div className="flex-1 h-3 bg-white/[0.04] rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", cfg.color.replace("text-", "bg-"))} style={{ width: `${barW}%` }} />
                </div>
                <div className="w-28 shrink-0 flex items-center justify-between">
                  <span className={cn("text-xs font-black", cfg.color)}>{c.compressionPct}%</span>
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase", cfg.bg, cfg.color)}>{c.effectiveTier}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 pl-10 text-[10px] text-zinc-600">
                <span>{c.keepersAtPosition} locked / {c.totalPoolSize} pool</span>
                {c.draftInflation > 0 && <span className="text-amber-500">Draft {c.draftInflation} round(s) earlier</span>}
              </div>
              <EvidenceList items={c.evidence.slice(0,2)} />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-zinc-700 border-t border-white/[0.06] pt-2">
        Compression = % of position pool locked by keeper predictions. Higher compression = earlier draft urgency.
        Unknown-position keepers are estimated proportionally by round-1 draft rate.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DWR_NAV_ITEMS: { id: string; label: string; keeperOnly?: boolean }[] = [
  { id: "dwr-briefing", label: "Briefing" },
  { id: "dwr-keepers", label: "Keepers", keeperOnly: true },
  { id: "dwr-build", label: "Build Targets" },
  { id: "dwr-dna", label: "Owner DNA" },
  { id: "dwr-runs", label: "Run Windows" },
  { id: "dwr-value", label: "Value Windows" },
  { id: "dwr-compression", label: "Compression", keeperOnly: true },
  { id: "dwr-trades", label: "Trade Signals" },
  { id: "dwr-mock", label: "Mock Draft" },
];

function dwrScrollTo(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function DwrSectionNav({ keepersOn }: { keepersOn: boolean }) {
  const items = DWR_NAV_ITEMS.filter((i) => !i.keeperOnly || keepersOn);
  return (
    <nav
      aria-label="Draft War Room sections"
      className="sticky top-16 z-10 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#110c14]/95 px-2 py-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md"
    >
      <ul className="flex min-w-max gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => dwrScrollTo(item.id)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function DraftWarRoom() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { leagueContextKey } = useLeagueActiveGate();
  const season = new Date().getFullYear();
  const [keeperOverrides, setKeeperOverrides] = useState<any[]>([]);
  const leagueKeyReady =
    authLoaded && isSignedIn && !leagueContextKey.startsWith("__");

  const warRoomInput = useMemo(
    () =>
      withLeagueSalt(
        {
          season,
          ...(keeperOverrides.length > 0 ? { keeperOverrides } : {}),
        },
        leagueContextKey,
      ),
    [season, keeperOverrides, leagueContextKey],
  );

  const { data, isLoading, refetch } = trpc.draftWarRoom.getDraftWarRoomData.useQuery(
    warRoomInput,
    { enabled: leagueKeyReady },
  );
  const [draftEngine, setDraftEngine] = useState<"mock" | "souls">("mock");
  const soulsQ = trpc.soulsDraftBoard.useQuery(undefined, { enabled: leagueKeyReady && draftEngine === "souls" });

  if (isLoading) return (
    <div className="min-h-screen bg-[#110c14] flex items-center justify-center gap-2 text-zinc-500 text-sm">
      <RefreshCw className="h-4 w-4 animate-spin text-violet-400" />Building Draft War Room…
    </div>
  );

  if (!data?.ok) return (
    <div className="min-h-screen bg-[#110c14] flex items-center justify-center text-center px-6">
      <div>
        <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
        <p className="text-zinc-300 font-semibold">{data?.error ?? "Failed to load"}</p>
        <p className="text-zinc-600 text-sm mt-1">Sync league data from the extension first.</p>
      </div>
    </div>
  );

  const { keeperPredictions, rosterNeeds, tradedPicks, shockMeters, confidenceDashboard,
          keeperCompression, scarcityAlerts, positionRunAlerts, pressureByRound, draftEnvironment,
          mockDraft, availablePool, teamCount, totalPicks, draftBoardSummary, leagueCapabilities } = data;
  const keepersOn = leagueCapabilities?.keepers !== false;
  const keeperSlotsReported =
    typeof leagueCapabilities?.keeperSlotsPerTeam === "number" && Number.isFinite(leagueCapabilities.keeperSlotsPerTeam)
      ? leagueCapabilities.keeperSlotsPerTeam
      : 0;
  const maxRound = Math.max(...(mockDraft ?? []).map((p: any) => p.round), 0);
  const keeperRetainedSlots =
    draftBoardSummary != null
      ? Math.max(0, draftBoardSummary.boardSlotCount - draftBoardSummary.openDraftPickCount)
      : null;

  const headerChips = [
    { l: "TEAMS", v: teamCount },
    ...(keepersOn ? [{ l: "KEEPER PRED", v: keeperPredictions?.length ?? 0 }] as const : []),
    { l: "TRADE ROWS", v: tradedPicks?.length ?? 0 },
    { l: "ROUNDS", v: maxRound },
  ];

  return (
    <div className="-m-4 md:-m-6 p-5 md:p-7 min-h-full text-zinc-100" style={{ background: "radial-gradient(circle at 85% -10%,rgba(245,197,24,.06),transparent 45%),linear-gradient(180deg,#140e17,#0f0b11)" }}>

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
                <Zap className="h-4 w-4 text-amber-400" />
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white">Draft War Room</h1>
              <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-600 ml-1">{season} · Phase 1.75</span>
            </div>
            <p className="text-xs text-zinc-500 ml-10">
              League-specific behavioral prediction · {teamCount} teams · {totalPicks} picks · {maxRound} rounds
            </p>
            {draftBoardSummary != null && keeperRetainedSlots != null && (
              <p className="text-xs text-zinc-500 ml-10 mt-1">
                <span className="font-semibold text-zinc-400">Draft Truth</span>{" "}
                (synced board — same season as Draft History):{" "}
                {draftBoardSummary.boardSlotCount} slots
                {keepersOn ? (
                  <>
                    {" "}· {keeperRetainedSlots} keeper/retained ·{" "}
                  </>
                ) : (
                  " · "
                )}
                {draftBoardSummary.openDraftPickCount} open-draft.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {headerChips.map((s) => (
              <div key={s.l} className="text-center px-3.5 py-2.5 rounded-xl bg-[#1b131f] border border-white/[0.07]">
                <div className="text-xl font-black text-white">{s.v}</div>
                <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{s.l}</div>
              </div>
            ))}
            <button onClick={() => refetch()} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {!keepersOn && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
            <span className="font-semibold text-amber-200">Redraft league.</span>{" "}
            ESPN reports {keeperSlotsReported} keeper slot{keeperSlotsReported === 1 ? "" : "s"} per team.
            Keeper predictions, compression, and keeper valuations are hidden — they do not apply to this format.
          </div>
        )}

        {/* Editorial intelligence desk — mockup layout, real data */}
        <DraftWarRoomDesk data={data} />

        {/* Detailed analytics divider */}
        <div className="flex items-center gap-3 pt-1">
          <div className="h-px flex-1 bg-white/[0.08]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600">Detailed Analytics</span>
          <div className="h-px flex-1 bg-white/[0.08]" />
        </div>

        {/* Diagnostics hidden for clean UI */}

        {/* Disclaimer */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-900/60 border border-white/[0.06] text-[11px] text-zinc-500">
          <Info className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
          {keepersOn ? (
            <span>
              <span className="font-semibold text-zinc-400">KEEPER PRED</span> rows are model projections —{" "}
              <span className="font-bold text-amber-400 mx-0.5">NOT OFFICIAL</span> keeper slots unless you confirm them.
              Keeper tiers (Elite/Strong/Viable/Borderline/Pass) come from the keeper valuation service — round savings = keeper cost minus the player's ADP round.{" "}
              <span className="font-semibold text-zinc-400">TRADE ROWS</span> counts extra/missing{" "}
              <em>open-draft</em> slots per team×round vs “exactly one” (heuristic — not ESPN’s trade log or Draft History).{" "}
              <span className="font-semibold text-zinc-400">Mock Draft Board</span> badge = full board rows (keepers + open-draft).
              All signals are evidence-backed.
            </span>
          ) : (
            <span>
              <span className="font-semibold text-zinc-400">Redraft:</span> no hypothetical keepers or keeper valuations.
              <span className="font-semibold text-zinc-400 ml-1">TRADE ROWS</span> counts extra/missing{" "}
              <em>open-draft</em> slots (heuristic).{" "}
              <span className="font-semibold text-zinc-400">Mock Draft Board</span> shows synced draft slots only.
            </span>
          )}
        </div>

        <DwrSectionNav keepersOn={keepersOn} />

        {/* 1. Confidence Dashboard */}
        <Section id="dwr-briefing" title="Draft Briefing" icon={ShieldCheck}
          accent="border-amber-500/20 bg-white/[0.03]" defaultOpen={true}>
          <ConfidenceDashboard data={confidenceDashboard} showKeeperInsights={keepersOn} />
        </Section>

        {/* 2. Keeper Predictions */}
        {keepersOn && (
        <Section id="dwr-keepers" title="Keeper predictions" icon={Trophy} badge={keeperPredictions?.length}>
          <KeeperSection predictions={keeperPredictions ?? []} />
        </Section>
        )}

        {/* 3. Roster Construction */}
        <Section id="dwr-build" title="Build Targets" icon={BarChart2} badge={rosterNeeds?.length}>
          <RosterNeedsSection needs={rosterNeeds ?? []} />
        </Section>

        {/* 4. Draft Shock Meter */}
        <Section id="dwr-dna" title="Owner DNA Map" icon={Activity} badge={shockMeters?.length}>
          <ShockMeterSection meters={shockMeters ?? []} />
        </Section>

        {/* 5. Draft Environment Dashboard — PHASE 1.75 */}
        {/* League Context removed; format shown in header chips */}

        {/* 6. Position Run Alerts — PHASE 1.75 */}
        <Section id="dwr-runs" title="Position Run Windows" icon={Flame} badge={positionRunAlerts?.length ?? 0}>
          <RunAlertsSection alerts={positionRunAlerts ?? []} />
        </Section>

        {/* 7. Scarcity Detection — PHASE 1.75 */}
        <Section id="dwr-value" title="Value Windows" icon={Wind} badge={scarcityAlerts?.length ?? 0}>
          <ScarcitySection alerts={scarcityAlerts ?? []} />
        </Section>

        {/* 8. Keeper Compression — PHASE 1.75 */}
        {keepersOn && (
        <Section id="dwr-compression" title="Capital Compression" icon={Lock} badge={keeperCompression?.length ?? 0} defaultOpen={false}>
          <CompressionSection compression={keeperCompression ?? []} />
        </Section>
        )}

        {/* 9. Trade pick signals (open-slot heuristic rows) */}
        <Section id="dwr-trades" title="Trade pick signals" icon={TrendingUp} badge={tradedPicks?.length ?? 0} defaultOpen={false}>
          <TradedPicksBadge tradedPicks={tradedPicks ?? []} />
        </Section>

        {/* 10. Mock Draft Board */}
        <Section id="dwr-mock" title="Mock Draft Board" icon={Target} badge={totalPicks} defaultOpen={true}>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-zinc-500">Engine</span>
            <div className="inline-flex rounded-lg border border-zinc-700 overflow-hidden">
              {(["mock", "souls"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setDraftEngine(e)}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${draftEngine === e ? "bg-violet-600 text-white" : "bg-transparent text-zinc-400 hover:text-zinc-200"}`}
                >
                  {e === "mock" ? "Mock · ADP + tendencies" : "Souls · behavioral"}
                </button>
              ))}
            </div>
          </div>
          {draftEngine === "souls" && soulsQ.isLoading ? (
            <div className="py-10 text-center text-sm text-zinc-500">
              <RefreshCw className="h-4 w-4 animate-spin text-violet-400 mx-auto mb-2" />
              Building the board…
            </div>
          ) : draftEngine === "souls" && (!soulsQ.data?.supported || !soulsQ.data?.board) ? (
            <div className="py-10 text-center text-sm text-zinc-500">
              The souls engine is fitted to your primary league only — this league uses the mock.
            </div>
          ) : (
            <MockDraftBoard
              picks={
                draftEngine === "souls"
                  ? (() => {
                      const pool = (data?.availablePool ?? []) as any[];
                      const byName = new Map(pool.map((pp: any) => [pp.name, pp]));
                      // Overlay keepers: mark each team's keeper-slot round with the kept player,
                      // so the souls board reflects keepers in the same slots the mock does.
                      const keeperBySlot = new Map<string, { player: string; position: string }>();
                      for (const kp of (keeperPredictions ?? []) as any[]) {
                        const rnd = Number(kp.keeperSlotRound);
                        if (!rnd) continue;
                        const ov = (keeperOverrides ?? []).find((o: any) => o.teamId === kp.teamId && Number(o.keeperRound) === rnd);
                        keeperBySlot.set(`${kp.teamId}:${rnd}`, { player: ov?.playerName ?? kp.predictedPlayer, position: ov?.position ?? kp.position });
                      }
                      const usedKeeper = new Set<string>();
                      return (soulsQ.data?.board?.picks ?? []).map((p: any) => {
                        const slotKey = `${p.teamId}:${p.round}`;
                        const keeper = keepersOn && !usedKeeper.has(slotKey) ? keeperBySlot.get(slotKey) : undefined;
                        if (keeper) usedKeeper.add(slotKey);
                        const playerName = keeper?.player ?? p.playerName;
                        const position = keeper?.position ?? p.position;
                        const pl: any = byName.get(playerName);
                        return {
                          pickNumber: p.overall,
                          round: p.round,
                          roundPick: p.pickInRound,
                          teamId: p.teamId,
                          teamName: p.teamName,
                          ownerName: p.ownerName,
                          player: playerName,
                          position,
                          espnId: pl?.espnId ?? null,
                          projectedPoints: pl?.projectedPoints ?? 0,
                          marketValue: pl?.marketValue ?? null,
                          adp: pl?.adp ?? pl?.rank ?? null,
                          pickReason: keeper ? `Keeper — Round ${p.round} reserved` : p.reason,
                          alternatePicks: [],
                          isKeeperSlot: !!keeper,
                        };
                      });
                    })()
                  : (mockDraft ?? [])
              }
              teams={(rosterNeeds ?? []).map((n: any) => ({ teamId: n.teamId, teamName: n.teamName }))}
              availablePool={data?.availablePool ?? []}
              keeperPredictions={keeperPredictions ?? []}
              rosterNeeds={rosterNeeds ?? []}
              keeperOverrides={keeperOverrides}
              keepersEnabled={keepersOn}
              onKeeperOverride={(overrides) => {
                setKeeperOverrides(overrides);
              }}
            />
          )}
        </Section>

      </div>
    </div>
  );
}