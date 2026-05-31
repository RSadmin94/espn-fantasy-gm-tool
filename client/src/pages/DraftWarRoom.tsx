import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Zap, BarChart2, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, AlertTriangle, Info, Trophy, Target,
  ShieldCheck, TrendingUp, Activity, ArrowUpRight, ArrowDownRight,
  Flame, Lock, Gauge, Wind,
} from "lucide-react";

// ── Shared UI atoms ───────────────────────────────────────────────────────────

const POS_CFG: Record<string, { pill: string }> = {
  QB:  { pill: "bg-red-500/20 text-red-300 border-red-500/40" },
  RB:  { pill: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  WR:  { pill: "bg-sky-500/20 text-sky-300 border-sky-500/40" },
  TE:  { pill: "bg-orange-500/20 text-orange-300 border-orange-500/40" },
  K:   { pill: "bg-zinc-700 text-zinc-300 border-zinc-600" },
  DEF: { pill: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
  "?": { pill: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
};

function PosPill({ pos }: { pos: string }) {
  const c = POS_CFG[pos] ?? POS_CFG["?"];
  return <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase", c.pill)}>{pos}</span>;
}

function ConfBar({ value, small }: { value: number; small?: boolean }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-zinc-500";
  const text  = value >= 80 ? "text-emerald-400" : value >= 60 ? "text-amber-400" : "text-zinc-400";
  return (
    <div className="flex items-center gap-2">
      <div className={cn("flex-1 bg-zinc-800 rounded-full overflow-hidden", small ? "h-1" : "h-1.5")}>
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
      <span className={cn("font-bold tabular-nums w-7 text-right", small ? "text-[9px]" : "text-[10px]", text)}>{value}%</span>
    </div>
  );
}

function EvidenceList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-0.5 mt-1.5">
      {items.map((e, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[10px] text-zinc-500">
          <span className="text-emerald-600 shrink-0 mt-0.5">→</span>{e}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, icon, badge, children, defaultOpen = true, accent }: {
  title: string; icon: any; badge?: string | number; children: React.ReactNode;
  defaultOpen?: boolean; accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = icon;
  return (
    <div className={cn("rounded-xl border overflow-hidden", accent ?? "border-zinc-800/60 bg-zinc-900/30")}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/20 transition-colors">
        <div className="flex items-center gap-2.5">
          <Icon className={cn("h-4 w-4", accent ? "text-amber-400" : "text-emerald-400")} />
          <span className="font-bold text-zinc-100 text-sm">{title}</span>
          {badge !== undefined && (
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-bold">{badge}</span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-600" /> : <ChevronDown className="h-4 w-4 text-zinc-600" />}
      </button>
      {open && <div className="border-t border-zinc-800/40">{children}</div>}
    </div>
  );
}

// ── KVS badge ─────────────────────────────────────────────────────────────────

function KvsBadge({ kvs, label }: { kvs: number; label?: string }) {
  const color = kvs >= 130 ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/40"
              : kvs >= 100 ? "text-sky-300 bg-sky-500/15 border-sky-500/40"
              : kvs >= 80  ? "text-amber-300 bg-amber-500/15 border-amber-500/40"
              : "text-red-300 bg-red-500/15 border-red-500/40";
  return (
    <div className={cn("flex flex-col items-center px-2 py-1 rounded-lg border shrink-0", color)}>
      <span className="text-sm font-black tabular-nums leading-none">{kvs}</span>
      <span className="text-[8px] font-bold uppercase tracking-wider opacity-70">KVS</span>
    </div>
  );
}

// ── Confidence Dashboard ──────────────────────────────────────────────────────

function ConfidenceDashboard({ data }: { data: any }) {
  if (!data) return null;

  const cards = [
    {
      icon: ShieldCheck, label: "Most Predictable",
      title: data.mostPredictable?.teamName,
      sub: data.mostPredictable?.ownerName,
      value: `${data.mostPredictable?.score}%`,
      detail: data.mostPredictable?.reason,
      color: "border-emerald-500/25 bg-emerald-500/5",
      iconColor: "text-emerald-400",
    },
    {
      icon: Activity, label: "Least Predictable",
      title: data.leastPredictable?.teamName,
      sub: data.leastPredictable?.ownerName,
      value: `${data.leastPredictable?.score}%`,
      detail: data.leastPredictable?.reason,
      color: "border-red-500/25 bg-red-500/5",
      iconColor: "text-red-400",
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
      value: data.bestKeeperValue ? `KVS ${data.bestKeeperValue.kvs}` : "—",
      detail: data.bestKeeperValue?.reason ?? "No keepers predicted",
      color: "border-sky-500/25 bg-sky-500/5",
      iconColor: "text-sky-400",
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

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 p-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div key={i} className={cn("rounded-xl border p-3 space-y-1.5", c.color)}>
            <div className="flex items-center gap-1.5">
              <Icon className={cn("h-3 w-3 shrink-0", c.iconColor)} />
              <span className={cn("text-[9px] font-black uppercase tracking-wider", c.iconColor)}>{c.label}</span>
            </div>
            <div className="font-black text-zinc-100 text-xs leading-tight line-clamp-1">{c.title}</div>
            <div className="text-[10px] text-zinc-500 truncate">{c.sub}</div>
            <div className={cn("text-sm font-black", c.iconColor)}>{c.value}</div>
            <p className="text-[9px] text-zinc-600 leading-relaxed line-clamp-2">{c.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Keeper section (with KVS) ─────────────────────────────────────────────────

function KeeperSection({ predictions }: { predictions: any[] }) {
  if (!predictions.length) return (
    <div className="px-5 py-8 text-center text-zinc-500 text-sm">No keeper slots found for this season.</div>
  );

  return (
    <div className="divide-y divide-zinc-800/30">
      {predictions.map((k, i) => (
        <div key={i} className="px-5 py-4 space-y-2">
          {/* Header row */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-bold text-zinc-100">{k.teamName}</span>
                <span className="text-[10px] text-zinc-600">· {k.ownerName}</span>
                {k.status === "CONFIRMED"
                  ? <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 rounded"><CheckCircle className="h-2.5 w-2.5" />CONFIRMED</span>
                  : <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 rounded">PREDICTED</span>
                }
                <span className="text-[9px] text-zinc-600 ml-auto">Rd {k.keeperRound}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-black text-zinc-100 text-base">{k.predictedPlayer}</span>
                <PosPill pos={k.position} />
                {k.projectedPoints > 0 && <span className="text-[10px] text-zinc-500">{k.projectedPoints.toFixed(0)} pts proj</span>}
              </div>
            </div>
            {/* KVS + Confidence */}
            <div className="flex items-start gap-2 shrink-0">
              {k.kvs !== undefined && k.kvs > 0 && (
                <div className="flex flex-col items-end gap-1">
                  <KvsBadge kvs={k.kvs} />
                  {k.surplusLabel && (
                    <span className={cn("text-[9px] font-bold uppercase",
                      k.surplus > 50 ? "text-emerald-400" : k.surplus > 0 ? "text-sky-400" : k.surplus > -30 ? "text-amber-400" : "text-red-400"
                    )}>{k.surplusLabel}</span>
                  )}
                </div>
              )}
              <div className="w-24">
                <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Confidence</div>
                <ConfBar value={k.confidence} small />
              </div>
            </div>
          </div>

          {/* KVS breakdown */}
          {k.kvs !== undefined && k.kvs > 0 && k.breakEven !== undefined && (
            <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-zinc-900/60 border border-zinc-800/40 text-[10px]">
              <div><span className="text-zinc-600">Projected:</span> <span className="text-zinc-200 font-bold">{k.projectedPoints?.toFixed(0)} pts</span></div>
              <div><span className="text-zinc-600">Break-even (Rd {k.keeperRound}):</span> <span className="text-zinc-200 font-bold">{k.breakEven} pts</span></div>
              <div><span className="text-zinc-600">Surplus:</span> <span className={cn("font-bold", k.surplus >= 0 ? "text-emerald-400" : "text-red-400")}>{k.surplus >= 0 ? "+" : ""}{k.surplus} pts</span></div>
            </div>
          )}

          <EvidenceList items={k.evidence} />

          {k.alternatives?.length > 0 && (
            <div>
              <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">Alternatives considered (by KVS)</p>
              <div className="flex flex-wrap gap-1.5">
                {k.alternatives.map((a: any, j: number) => (
                  <span key={j} className="flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-800/60 border border-zinc-700/40 px-2 py-0.5 rounded">
                    {a.player} <PosPill pos={a.position} />
                    {a.kvs !== undefined && <span className="text-zinc-600">KVS {a.kvs}</span>}
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
  MEDIUM:   { cls: "text-sky-400 bg-sky-500/10 border-sky-500/30", icon: "📋" },
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
              sel === n.teamId ? "border-emerald-500/40 bg-emerald-500/8 shadow-lg" : "border-zinc-800/60 bg-zinc-900/40 hover:border-zinc-700")}>
            <div className={cn("text-xl font-black tabular-nums", sel === n.teamId ? "text-emerald-400" : "text-zinc-200")}>#{n.overallRank}</div>
            <div className="text-[10px] font-bold text-zinc-300 leading-tight mt-0.5 truncate">{n.teamName}</div>
            <div className="text-[9px] text-zinc-600 mt-0.5">{n.projectedTotal?.toLocaleString()} pts</div>
            <div className="flex flex-wrap gap-0.5 mt-1.5">{n.draftPriority?.slice(0,3).map((p: string) => <PosPill key={p} pos={p} />)}</div>
          </button>
        ))}
      </div>
      {sel && (() => {
        const t = needs.find(n => n.teamId === sel);
        if (!t) return null;
        return (
          <div className="border-t border-zinc-800/40 p-5 grid sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Roster Needs</p>
                <div className="flex gap-1">{t.draftPriority?.map((p: string) => <PosPill key={p} pos={p} />)}</div>
              </div>
              <div className="space-y-2">
                {t.needs?.map((n: any, i: number) => {
                  const u = URG_CFG[n.urgency as keyof typeof URG_CFG] ?? URG_CFG.LOW;
                  return (
                    <div key={i} className={cn("rounded-lg border p-2.5", u.cls)}>
                      <div className="flex items-center gap-2">
                        <span>{u.icon}</span><span className="text-xs font-bold">{n.position}</span>
                        <span className="text-[10px] ml-auto">{n.urgency}</span>
                      </div>
                      <p className="text-[10px] mt-1 opacity-80">Have {n.have}, need {n.need}. Best: {n.topPlayer}</p>
                      <EvidenceList items={n.evidence} />
                    </div>
                  );
                })}
                {!t.needs?.length && <p className="text-[10px] text-zinc-600">No critical needs identified.</p>}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-2">Strengths</p>
              <div className="space-y-1.5">
                {t.strengths?.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-zinc-900/60 rounded-lg border border-zinc-800/40 px-3 py-2">
                    <PosPill pos={s.position} />
                    <span className="text-zinc-300 font-semibold">{s.count}× {s.position}</span>
                    <span className="text-zinc-500 text-[10px] truncate ml-auto">{s.topPlayer}</span>
                  </div>
                ))}
                {!t.strengths?.length && <p className="text-[10px] text-zinc-600">No notable surplus positions.</p>}
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
  PREDICTABLE:   "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  UNPREDICTABLE: "text-red-400 bg-red-500/10 border-red-500/30",
  NEUTRAL:       "text-zinc-400 bg-zinc-800/60 border-zinc-700/40",
};

const CAPITAL_CFG = {
  ABOVE_AVERAGE: "text-emerald-400",
  AVERAGE:       "text-zinc-400",
  BELOW_AVERAGE: "text-red-400",
};

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
                sel === m.teamId ? "border-emerald-500/40 bg-zinc-800/60 shadow-lg" : "border-zinc-800/60 bg-zinc-900/40 hover:border-zinc-700")}>
              <div className="text-[9px] font-black uppercase tracking-wider text-zinc-600 truncate">{m.teamName}</div>
              <div className="text-[10px] text-zinc-500 truncate">{m.ownerName?.split(" ")[0]}</div>
              {/* Predict bar */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[8px] text-zinc-600">PREDICT</span>
                  <span className={cn("text-[9px] font-bold", isHighSurprise ? "text-red-400" : "text-emerald-400")}>
                    {m.predictabilityScore}%
                  </span>
                </div>
                <ConfBar value={m.predictabilityScore} small />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-zinc-600">Likely: </span>
                <PosPill pos={m.mostLikelyPosition} />
              </div>
              <div className={cn("text-[9px] font-bold uppercase", isHighSurprise ? "text-red-400/80" : "text-zinc-600")}>
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
          <div className="border-t border-zinc-800/40 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-zinc-100">{m.teamName}</h3>
                <p className="text-xs text-zinc-500">{m.ownerName}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-center px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                  <div className="text-lg font-black text-white">{m.predictabilityScore}%</div>
                  <div className="text-[9px] text-zinc-600 uppercase">Predictable</div>
                </div>
                <div className="text-center px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                  <div className={cn("text-lg font-black", m.surpriseProbability >= 50 ? "text-red-400" : "text-zinc-300")}>{m.surpriseProbability}%</div>
                  <div className="text-[9px] text-zinc-600 uppercase">Surprise</div>
                </div>
                <div className="text-center px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                  <PosPill pos={m.mostLikelyPosition} />
                  <div className="text-[9px] text-zinc-600 uppercase mt-1">Likely Pick</div>
                </div>
                <div className="text-center px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                  <div className={cn("text-sm font-black uppercase", CAPITAL_CFG[m.draftCapital as keyof typeof CAPITAL_CFG] ?? "text-zinc-400")}>
                    {m.draftCapital?.replace("_", " ")}
                  </div>
                  <div className="text-[9px] text-zinc-600 uppercase">Capital</div>
                </div>
              </div>
            </div>

            {/* Signals */}
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-2">Prediction Signals</p>
              <div className="grid grid-cols-2 gap-2">
                {m.signals?.map((s: any, i: number) => (
                  <div key={i} className={cn("rounded-lg border px-3 py-2 flex items-center justify-between gap-2", SIGNAL_CFG[s.impact as keyof typeof SIGNAL_CFG])}>
                    <div>
                      <div className="text-[10px] font-bold">{s.label}</div>
                      <div className="text-[9px] opacity-70">{s.value}</div>
                    </div>
                    <span className="text-[8px] font-black uppercase opacity-60 shrink-0">{s.impact}</span>
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
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
            <ArrowUpRight className="h-3 w-3" /> Acquired Picks ({acquired.length})
          </p>
          <div className="space-y-1.5">
            {acquired.map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                <span className="text-xs font-bold text-emerald-300">Rd {t.round}</span>
                <span className="text-xs text-zinc-200">{t.teamName}</span>
                <span className="text-[10px] text-zinc-500">· {t.ownerName}</span>
                <span className="text-[10px] text-emerald-500 ml-auto">Pick #{t.pickNumber}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tradedAway.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-red-400 mb-2 flex items-center gap-1.5">
            <ArrowDownRight className="h-3 w-3" /> Traded Away ({tradedAway.length})
          </p>
          <div className="space-y-1.5">
            {tradedAway.map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                <span className="text-xs font-bold text-red-300">Rd {t.round}</span>
                <span className="text-xs text-zinc-200">{t.teamName}</span>
                <span className="text-[10px] text-zinc-500">· {t.ownerName}</span>
                <span className="text-[10px] text-red-500 ml-auto">Missing pick</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mock draft board ──────────────────────────────────────────────────────────

function MockDraftBoard({ picks, teams }: { picks: any[]; teams: any[] }) {
  const [view, setView]       = useState<"board" | "team">("board");
  const [selTeam, setSelTeam] = useState<number | null>(null);
  const [expandPick, setExp]  = useState<number | null>(null);

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
      <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-800/40">
        {["board", "team"].map(v => (
          <button key={v} onClick={() => setView(v as any)}
            className={cn("px-3 py-1.5 rounded text-xs font-bold transition-colors",
              view === v ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
            {v === "board" ? "Draft Board" : "By Team"}
          </button>
        ))}
        {view === "team" && (
          <select className="ml-2 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
            value={selTeam ?? ""} onChange={e => setSelTeam(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select team…</option>
            {teams.map((t: any) => <option key={t.teamId} value={t.teamId}>{t.teamName}</option>)}
          </select>
        )}
      </div>

      {/* Board view */}
      {view === "board" && (
        <div className="overflow-auto max-h-[600px]">
          {rounds.map(([round, rPicks]) => (
            <div key={round} className="border-b border-zinc-800/20">
              <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur px-4 py-1.5 flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Round {round}</span>
                <div className="flex-1 h-px bg-zinc-800/40" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-px bg-zinc-800/20">
                {rPicks.map((p: any) => (
                  <button key={p.pickNumber}
                    onClick={() => setExp(expandPick === p.pickNumber ? null : p.pickNumber)}
                    className={cn(
                      "text-left p-2.5 bg-zinc-900/60 hover:bg-zinc-800/60 transition-colors relative",
                      p.isKeeperSlot && "border border-amber-500/20 bg-amber-500/5",
                      p.tradedPickContext && "border-t-2 border-t-emerald-500/50",
                      expandPick === p.pickNumber && "ring-1 ring-emerald-500/40"
                    )}>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[9px] text-zinc-600 font-mono">{p.pickNumber}</span>
                      <PosPill pos={p.position} />
                      {p.isKeeperSlot && <span className="text-[8px] text-amber-400 font-bold">K</span>}
                      {p.tradedPickContext?.type === "ACQUIRED" && <span className="text-[8px] text-emerald-400 font-bold">T↑</span>}
                    </div>
                    <div className="text-[11px] font-bold text-zinc-200 leading-tight truncate">{p.player}</div>
                    <div className="text-[9px] text-zinc-500 truncate mt-0.5">{p.ownerName?.split(" ")[0]}</div>
                    {!p.isKeeperSlot && p.projectedPoints > 0 && (
                      <div className="text-[9px] text-zinc-700 mt-0.5 tabular-nums">{p.projectedPoints.toFixed(0)}</div>
                    )}
                  </button>
                ))}
              </div>
              {rPicks.some((p: any) => p.pickNumber === expandPick) && (() => {
                const pk = rPicks.find((p: any) => p.pickNumber === expandPick)!;
                return (
                  <div className="mx-2 my-2 rounded-lg border border-zinc-700/60 bg-zinc-900/80 p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-zinc-100 text-base">{pk.player}</span>
                      <PosPill pos={pk.position} />
                      {pk.isKeeperSlot && <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 rounded">KEEPER SLOT</span>}
                      {pk.tradedPickContext && (
                        <span className={cn("text-[9px] font-bold px-1.5 rounded border",
                          pk.tradedPickContext.type === "ACQUIRED"
                            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                            : "text-red-400 bg-red-500/10 border-red-500/20")}>
                          {pk.tradedPickContext.type === "ACQUIRED" ? "↑ ACQUIRED PICK" : "↓ TRADED PICK"}
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-zinc-600">Pick {pk.pickNumber} · Rd {pk.round}</span>
                    </div>
                    <p className="text-xs text-zinc-400 italic">{pk.reasoning}</p>
                    <ConfBar value={pk.confidence} />
                    <EvidenceList items={pk.evidence} />
                    {pk.tradedPickContext && <EvidenceList items={pk.tradedPickContext.evidence} />}
                    {pk.alternatePicks?.length > 0 && (
                      <div>
                        <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Alternates</p>
                        <div className="flex flex-wrap gap-1.5">
                          {pk.alternatePicks.map((a: any, j: number) => (
                            <span key={j} className="text-[10px] text-zinc-500 bg-zinc-800/40 border border-zinc-700/40 px-2 py-0.5 rounded">
                              {a.player} ({a.position}) · {a.projectedPoints?.toFixed(0)} pts
                            </span>
                          ))}
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

      {/* Team view */}
      {view === "team" && selTeam && (
        <div className="divide-y divide-zinc-800/30 max-h-[600px] overflow-auto">
          {(teamPicks.get(selTeam) ?? []).map((p: any) => (
            <div key={p.pickNumber} className={cn("flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/20",
              p.isKeeperSlot && "bg-amber-500/5",
              p.tradedPickContext?.type === "ACQUIRED" && "border-l-2 border-l-emerald-500/60")}>
              <div className="w-12 text-center">
                <div className="text-[9px] text-zinc-600">Rd {p.round}</div>
                <div className="text-[10px] font-bold text-zinc-400">#{p.pickNumber}</div>
              </div>
              <PosPill pos={p.position} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-zinc-200 truncate">{p.player}</div>
                <div className="text-[10px] text-zinc-500 truncate">{p.reasoning}</div>
              </div>
              {p.projectedPoints > 0 && <div className="text-xs tabular-nums text-zinc-400 shrink-0">{p.projectedPoints.toFixed(0)}</div>}
              <div className="w-16 shrink-0"><ConfBar value={p.confidence} small /></div>
              {p.isKeeperSlot && <span className="text-[9px] text-amber-400 font-bold shrink-0">KEEPER</span>}
              {p.tradedPickContext?.type === "ACQUIRED" && <span className="text-[9px] text-emerald-400 font-bold shrink-0">TRADE↑</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Draft Environment Section (Phase 1.75) ───────────────────────────────────

const GRADE_COLOR: Record<string, string> = {
  A: "text-emerald-400 bg-emerald-500/10 border-emerald-500/40",
  B: "text-sky-400 bg-sky-500/10 border-sky-500/40",
  C: "text-amber-400 bg-amber-500/10 border-amber-500/40",
  D: "text-orange-400 bg-orange-500/10 border-orange-500/40",
  F: "text-red-400 bg-red-500/10 border-red-500/40",
};

function DraftEnvironmentSection({ env }: { env: any }) {
  if (!env) return <div className="px-5 py-6 text-zinc-600 text-sm">No environment data.</div>;

  const envCards = [
    { icon: TrendingUp,    label: "Strongest Position", val: env.strongestPosition?.position ?? "—", sub: env.strongestPosition?.reason, color: "text-emerald-400", border: "border-emerald-500/25 bg-emerald-500/5" },
    { icon: Wind,          label: "Weakest Position",   val: env.weakestPosition?.position ?? "—",   sub: env.weakestPosition?.reason,   color: "text-red-400",     border: "border-red-500/25 bg-red-500/5" },
    { icon: Flame,         label: "Biggest Run Risk",   val: env.biggestRunRisk?.position ?? "—",     sub: env.biggestRunRisk?.reason,    color: "text-amber-400",   border: "border-amber-500/25 bg-amber-500/5" },
    { icon: Target,        label: "Best Value Pocket",  val: env.biggestValuePocket?.position ?? "—", sub: env.biggestValuePocket?.reason, color: "text-sky-400",    border: "border-sky-500/25 bg-sky-500/5" },
    { icon: Lock,          label: "Keeper Distortion",  val: env.mostDistortedByKeepers?.position ?? "—", sub: env.mostDistortedByKeepers?.reason, color: "text-violet-400", border: "border-violet-500/25 bg-violet-500/5" },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Stat cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {envCards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className={cn("rounded-xl border p-3 space-y-1", c.border)}>
              <div className="flex items-center gap-1.5">
                <Icon className={cn("h-3 w-3 shrink-0", c.color)} />
                <span className={cn("text-[9px] font-black uppercase tracking-wider", c.color)}>{c.label}</span>
              </div>
              <div className={cn("text-2xl font-black", c.color)}>{c.val}</div>
              <p className="text-[9px] text-zinc-600 leading-relaxed line-clamp-2">{c.sub}</p>
            </div>
          );
        })}
      </div>

      {/* League depth grade table */}
      {env.leagueDepthGrade && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2">League Depth Grades</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(env.leagueDepthGrade).map(([pos, grade]) => (
              <div key={pos} className={cn("rounded-lg border px-3 py-2 flex items-center gap-2", GRADE_COLOR[grade as string] ?? "text-zinc-400 bg-zinc-800 border-zinc-700")}>
                <PosPill pos={pos} />
                <span className="text-sm font-black">{grade as string}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-zinc-600 mt-2">Grade = elite supply vs. league-wide starters needed. A = deep, F = barren.</p>
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
    <div className="divide-y divide-zinc-800/30">
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
                <span className="text-[10px] text-zinc-500">{a.roundWindow}</span>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">{a.teamCount} teams</span>
                <span className="text-[10px] text-zinc-600">Rd {a.expectedRound}</span>
              </div>
            </div>
            <ConfBar value={a.confidence} />
          </button>

          {expanded === a.position && (
            <div className="mt-3 space-y-2">
              <div>
                <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Affected Owners</p>
                <div className="flex flex-wrap gap-1.5">
                  {(a.affectedOwners ?? []).map((o: string, j: number) => (
                    <span key={j} className="text-[10px] text-zinc-300 bg-zinc-800/60 border border-zinc-700/40 px-2 py-0.5 rounded">{o}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Mock Draft Triggers</p>
                <div className="space-y-0.5">
                  {(a.triggerPicks ?? []).map((tp: string, j: number) => (
                    <div key={j} className="text-[10px] text-zinc-500 flex items-start gap-1.5">
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
  MEDIUM:   "border-sky-500/40 bg-sky-500/8 text-sky-400",
  LOW:      "border-zinc-700 bg-zinc-900/40 text-zinc-400",
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
                <span className="text-[9px] font-black uppercase">{a.urgency}</span>
              </div>
              <div className="text-xl font-black tabular-nums">{a.eliteSupply}</div>
              <div className="text-[9px] opacity-70">elite available</div>
              <div className="mt-2 h-1 bg-black/30 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-current opacity-70 transition-all" style={{ width: `${fillPct}%` }} />
              </div>
              <div className="text-[9px] mt-1 opacity-60">Demand: {a.demandScore.toFixed(2)}</div>
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
              <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded border ml-auto", SCARCITY_COLORS[a.urgency as keyof typeof SCARCITY_COLORS] ?? SCARCITY_COLORS.LOW)}>{a.urgency}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { l: "Total Pool",    v: a.totalPool },
                { l: "Elite Supply",  v: a.eliteSupply },
                { l: "Demand Score",  v: a.demandScore.toFixed(2) },
              ].map(s => (
                <div key={s.l} className="text-center bg-zinc-800/40 rounded-lg p-2">
                  <div className="text-lg font-black text-white">{s.v}</div>
                  <div className="text-[9px] text-zinc-600 uppercase">{s.l}</div>
                </div>
              ))}
            </div>
            {/* Round-by-round remaining */}
            <div>
              <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1.5">Projected Remaining Supply by Round</p>
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(a.remainingAfterRound ?? {}).slice(0, 10).map(([rd, rem]: [string, any]) => (
                  <div key={rd} className={cn("text-center rounded px-2 py-1 min-w-[32px]",
                    rem <= 0 ? "bg-red-500/20 text-red-400" : rem <= 3 ? "bg-amber-500/20 text-amber-400" : "bg-zinc-800/60 text-zinc-300")}>
                    <div className="text-xs font-black">{rem}</div>
                    <div className="text-[8px] text-zinc-600">R{rd}</div>
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
  HEAVY:    { color: "text-red-400",    bg: "bg-red-500/15 border-red-500/40" },
  MODERATE: { color: "text-amber-400",  bg: "bg-amber-500/15 border-amber-500/40" },
  LIGHT:    { color: "text-sky-400",    bg: "bg-sky-500/15 border-sky-500/40" },
  NONE:     { color: "text-zinc-500",   bg: "bg-zinc-800/60 border-zinc-700/40" },
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
                <div className="flex-1 h-3 bg-zinc-800/60 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", cfg.color.replace("text-", "bg-"))} style={{ width: `${barW}%` }} />
                </div>
                <div className="w-28 shrink-0 flex items-center justify-between">
                  <span className={cn("text-xs font-black", cfg.color)}>{c.compressionPct}%</span>
                  <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase", cfg.bg, cfg.color)}>{c.effectiveTier}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 pl-10 text-[9px] text-zinc-600">
                <span>{c.keepersAtPosition} locked / {c.totalPoolSize} pool</span>
                {c.draftInflation > 0 && <span className="text-amber-500">Draft {c.draftInflation} round(s) earlier</span>}
              </div>
              <EvidenceList items={c.evidence.slice(0,2)} />
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-zinc-700 border-t border-zinc-800/40 pt-2">
        Compression = % of position pool locked by keeper predictions. Higher compression = earlier draft urgency.
        Unknown-position keepers are estimated proportionally by round-1 draft rate.
      </p>
    </div>
  );
}
// ── Main page ─────────────────────────────────────────────────────────────────

export function DraftWarRoom() {
  const _trpc  = trpc as any;
  const season = new Date().getFullYear();
  const { data, isLoading, refetch } = _trpc.draftWarRoom.getDraftWarRoomData.useQuery({ season });

  if (isLoading) return (
    <div className="min-h-screen bg-[#09090e] flex items-center justify-center gap-2 text-zinc-500 text-sm">
      <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />Building Draft War Room…
    </div>
  );

  if (!data?.ok) return (
    <div className="min-h-screen bg-[#09090e] flex items-center justify-center text-center px-6">
      <div>
        <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
        <p className="text-zinc-300 font-semibold">{data?.error ?? "Failed to load"}</p>
        <p className="text-zinc-600 text-sm mt-1">Sync league data from the extension first.</p>
      </div>
    </div>
  );

  const { keeperPredictions, rosterNeeds, tradedPicks, shockMeters, confidenceDashboard,
          keeperCompression, scarcityAlerts, positionRunAlerts, pressureByRound, draftEnvironment,
          mockDraft, teamCount, totalPicks } = data;
  const maxRound = Math.max(...(mockDraft ?? []).map((p: any) => p.round), 0);

  return (
    <div className="min-h-screen bg-[#09090e] text-zinc-100">

      {/* Header */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/50 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <Zap className="h-4 w-4 text-emerald-400" />
              </div>
              <h1 className="text-xl font-black tracking-tight text-white">Draft War Room</h1>
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 ml-1">{season} · Phase 1.75</span>
            </div>
            <p className="text-xs text-zinc-500 ml-10">
              League-specific behavioral prediction · {teamCount} teams · {totalPicks} picks · {maxRound} rounds
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { l: "TEAMS", v: teamCount },
              { l: "KEEPERS", v: keeperPredictions?.length ?? 0 },
              { l: "TRADED PICKS", v: tradedPicks?.length ?? 0 },
              { l: "ROUNDS", v: maxRound },
            ].map(s => (
              <div key={s.l} className="text-center px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                <div className="text-base font-black text-white">{s.v}</div>
                <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{s.l}</div>
              </div>
            ))}
            <button onClick={() => refetch()} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* Diagnostic strip */}
        <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800/40 text-[10px] font-mono text-zinc-600 flex-wrap">
          <span className="text-zinc-500 font-bold">DIAGNOSTICS</span>
          <span>Route: <span className="text-emerald-400">/draft-war-room ✓</span></span>
          <span>Data: <span className="text-emerald-400">{data?.ok ? "loaded ✓" : "error"}</span></span>
          <span>Teams: <span className="text-zinc-300">{teamCount}</span></span>
          <span>Keepers: <span className="text-zinc-300">{keeperPredictions?.length ?? 0}</span></span>
          <span>Players: <span className="text-zinc-300">{(rosterNeeds ?? []).reduce((s:number, n:any) => s + Object.values(n.positionCounts ?? {}).reduce((a:number,b:any) => a + (b as number), 0), 0)}</span></span>
          <span>Mock Picks: <span className={totalPicks > 0 ? "text-emerald-400" : "text-red-400"}>{totalPicks} {totalPicks > 0 ? "✓" : "⚠ EMPTY"}</span></span>
          <span>Build: <span className="text-amber-400">18fd312-fix</span></span>
        </div>

        {/* Disclaimer */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-[10px] text-zinc-500">
          <Info className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
          Keeper predictions are <span className="font-bold text-amber-400 mx-1">PREDICTED — NOT OFFICIAL</span> unless confirmed.
          KVS = Keeper Value Score (100 = break-even, &gt;100 = value, &lt;100 = overpay).
          Traded picks detected by counting picks-per-team-per-round vs expected 1. All signals are evidence-backed.
        </div>

        {/* 1. Confidence Dashboard */}
        <Section title="Draft Confidence Dashboard" icon={ShieldCheck}
          accent="border-amber-500/20 bg-zinc-900/40" defaultOpen={true}>
          <ConfidenceDashboard data={confidenceDashboard} />
        </Section>

        {/* 2. Keeper Predictions */}
        <Section title="Keeper Predictions" icon={Trophy} badge={keeperPredictions?.length}>
          <KeeperSection predictions={keeperPredictions ?? []} />
        </Section>

        {/* 3. Roster Construction */}
        <Section title="Roster Construction" icon={BarChart2} badge={rosterNeeds?.length}>
          <RosterNeedsSection needs={rosterNeeds ?? []} />
        </Section>

        {/* 4. Draft Shock Meter */}
        <Section title="Draft Shock Meter" icon={Activity} badge={shockMeters?.length}>
          <ShockMeterSection meters={shockMeters ?? []} />
        </Section>

        {/* 5. Draft Environment Dashboard — PHASE 1.75 */}
        <Section title="Draft Environment" icon={Gauge}
          accent="border-emerald-500/20 bg-zinc-900/40" defaultOpen={true}>
          <DraftEnvironmentSection env={draftEnvironment} />
        </Section>

        {/* 6. Position Run Alerts — PHASE 1.75 */}
        <Section title="Position Run Alerts" icon={Flame} badge={positionRunAlerts?.length ?? 0}>
          <RunAlertsSection alerts={positionRunAlerts ?? []} />
        </Section>

        {/* 7. Scarcity Detection — PHASE 1.75 */}
        <Section title="Scarcity Detection" icon={Wind} badge={scarcityAlerts?.length ?? 0}>
          <ScarcitySection alerts={scarcityAlerts ?? []} />
        </Section>

        {/* 8. Keeper Compression — PHASE 1.75 */}
        <Section title="Keeper Compression" icon={Lock} badge={keeperCompression?.length ?? 0} defaultOpen={false}>
          <CompressionSection compression={keeperCompression ?? []} />
        </Section>

        {/* 9. Draft Capital (Traded Picks) */}
        <Section title="Draft Capital" icon={TrendingUp} badge={tradedPicks?.length ?? 0} defaultOpen={false}>
          <TradedPicksBadge tradedPicks={tradedPicks ?? []} />
        </Section>

        {/* 10. Mock Draft Board */}
        <Section title="Mock Draft Board" icon={Target} badge={totalPicks} defaultOpen={true}>
          <MockDraftBoard picks={mockDraft ?? []}
            teams={(rosterNeeds ?? []).map((n: any) => ({ teamId: n.teamId, teamName: n.teamName }))} />
        </Section>

      </div>
    </div>
  );
}
