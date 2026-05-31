import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Zap, Users, BarChart2, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, AlertTriangle, Info, Trophy, Target, TrendingUp,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface KeeperPrediction {
  teamId: number; teamName: string; ownerName: string;
  keeperRound: number; keeperRoundPick: number;
  predictedPlayer: string; position: string;
  projectedPoints: number; confidence: number;
  evidence: string[]; status: "PREDICTED" | "CONFIRMED";
  alternatives: Array<{ player: string; position: string; projectedPoints: number; reason: string }>;
}

interface RosterNeed {
  teamId: number; teamName: string; ownerName: string;
  projectedTotal: number; positionCounts: Record<string, number>;
  overallRank: number; draftPriority: string[];
  needs: Array<{ position: string; urgency: string; have: number; need: number; gap: number; topPlayer: string; topProj: number; evidence: string[] }>;
  strengths: Array<{ position: string; count: number; topPlayer: string }>;
}

interface MockPick {
  pickNumber: number; round: number; roundPick: number;
  teamId: number; teamName: string; ownerName: string;
  player: string; position: string; espnId: string | null;
  projectedPoints: number; confidence: number;
  reasoning: string; evidence: string[];
  alternatePicks: Array<{ player: string; position: string; projectedPoints: number }>;
  isKeeperSlot: boolean;
}

// ── Position config ───────────────────────────────────────────────────────────

const POS_CFG: Record<string, { pill: string; text: string }> = {
  QB:  { pill: "bg-red-500/20 text-red-300 border-red-500/40",       text: "text-red-400"     },
  RB:  { pill: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", text: "text-emerald-400" },
  WR:  { pill: "bg-sky-500/20 text-sky-300 border-sky-500/40",       text: "text-sky-400"     },
  TE:  { pill: "bg-orange-500/20 text-orange-300 border-orange-500/40", text: "text-orange-400"  },
  K:   { pill: "bg-zinc-700 text-zinc-300 border-zinc-600",           text: "text-zinc-400"    },
  DEF: { pill: "bg-violet-500/20 text-violet-300 border-violet-500/40", text: "text-violet-400"  },
  "?": { pill: "bg-amber-500/20 text-amber-300 border-amber-500/40",  text: "text-amber-400"  },
};

function PosPill({ pos }: { pos: string }) {
  const c = POS_CFG[pos] ?? POS_CFG["?"];
  return <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase", c.pill)}>{pos}</span>;
}

// ── Confidence bar ─────────────────────────────────────────────────────────────

function ConfBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-zinc-500";
  const text  = value >= 80 ? "text-emerald-400" : value >= 60 ? "text-amber-400" : "text-zinc-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
      <span className={cn("text-[10px] font-bold tabular-nums w-7 text-right", text)}>{value}%</span>
    </div>
  );
}

// ── Evidence card ─────────────────────────────────────────────────────────────

function EvidenceList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-0.5 mt-1.5">
      {items.map((e, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[10px] text-zinc-500">
          <span className="text-emerald-600 shrink-0 mt-0.5">→</span>
          {e}
        </li>
      ))}
    </ul>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon, count, children, defaultOpen = true }: {
  title: string; icon: any; count?: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = icon;
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/20 transition-colors">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-emerald-400" />
          <span className="font-bold text-zinc-100 text-sm">{title}</span>
          {count !== undefined && (
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-bold">{count}</span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-600" /> : <ChevronDown className="h-4 w-4 text-zinc-600" />}
      </button>
      {open && <div className="border-t border-zinc-800/40">{children}</div>}
    </div>
  );
}

// ── Keeper section ────────────────────────────────────────────────────────────

function KeeperSection({ predictions }: { predictions: KeeperPrediction[] }) {
  return (
    <div className="divide-y divide-zinc-800/30">
      {predictions.length === 0 && (
        <div className="px-5 py-8 text-center text-zinc-500 text-sm">No keeper slots found for this season.</div>
      )}
      {predictions.map((k, i) => (
        <div key={i} className="px-5 py-4 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold text-zinc-100">{k.teamName}</span>
                <span className="text-[10px] text-zinc-600">· {k.ownerName}</span>
                {k.status === "CONFIRMED" ? (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 rounded">
                    <CheckCircle className="h-2.5 w-2.5" />CONFIRMED
                  </span>
                ) : (
                  <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 rounded">PREDICTED</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-black text-zinc-100 text-base">{k.predictedPlayer}</span>
                <PosPill pos={k.position} />
                <span className="text-[10px] text-zinc-500">Rd {k.keeperRound}</span>
              </div>
              {k.projectedPoints > 0 && (
                <span className="text-[10px] text-zinc-500">{k.projectedPoints.toFixed(0)} pts projected</span>
              )}
            </div>
            <div className="w-28 shrink-0">
              <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Confidence</div>
              <ConfBar value={k.confidence} />
            </div>
          </div>
          <EvidenceList items={k.evidence} />
          {k.alternatives.length > 0 && (
            <div className="mt-2">
              <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Alternatives considered</p>
              <div className="flex flex-wrap gap-1.5">
                {k.alternatives.map((a, j) => (
                  <span key={j} className="text-[10px] text-zinc-500 bg-zinc-800/60 border border-zinc-700/40 px-2 py-0.5 rounded">
                    {a.player} ({a.position}) — {a.projectedPoints.toFixed(0)} pts
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

// ── Roster needs section ──────────────────────────────────────────────────────

const URGENCY_CFG = {
  CRITICAL: { cls: "text-red-400 bg-red-500/10 border-red-500/30",     icon: "🚨" },
  HIGH:     { cls: "text-amber-400 bg-amber-500/10 border-amber-500/30", icon: "⚠️" },
  MEDIUM:   { cls: "text-sky-400 bg-sky-500/10 border-sky-500/30",      icon: "📋" },
  LOW:      { cls: "text-zinc-400 bg-zinc-800 border-zinc-700",          icon: "✓" },
};

function RosterNeedsSection({ needs }: { needs: RosterNeed[] }) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div>
      {/* Team grid */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {needs.map(n => (
          <button
            key={n.teamId}
            onClick={() => setSelected(selected === n.teamId ? null : n.teamId)}
            className={cn(
              "rounded-lg border p-2.5 text-left transition-all hover:scale-105",
              selected === n.teamId
                ? "border-emerald-500/40 bg-emerald-500/8 shadow-lg"
                : "border-zinc-800/60 bg-zinc-900/40 hover:border-zinc-700"
            )}
          >
            <div className={cn("text-xl font-black tabular-nums", selected === n.teamId ? "text-emerald-400" : "text-zinc-200")}>
              #{n.overallRank}
            </div>
            <div className="text-[10px] font-bold text-zinc-300 leading-tight mt-0.5 truncate">{n.teamName}</div>
            <div className="text-[9px] text-zinc-600 mt-0.5">{n.projectedTotal.toLocaleString()} pts</div>
            <div className="flex flex-wrap gap-0.5 mt-1.5">
              {n.draftPriority.slice(0,3).map(pos => <PosPill key={pos} pos={pos} />)}
            </div>
          </button>
        ))}
      </div>

      {/* Detail panel */}
      {selected && (() => {
        const team = needs.find(n => n.teamId === selected);
        if (!team) return null;
        return (
          <div className="border-t border-zinc-800/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-zinc-100">{team.teamName}</h3>
                <p className="text-xs text-zinc-500">{team.ownerName} · {team.projectedTotal.toLocaleString()} pts projected</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {team.draftPriority.map(p => <PosPill key={p} pos={p} />)}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {/* Needs */}
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-2">Roster Needs</p>
                <div className="space-y-2">
                  {team.needs.map((n, i) => {
                    const urg = URGENCY_CFG[n.urgency as keyof typeof URGENCY_CFG] ?? URGENCY_CFG.LOW;
                    return (
                      <div key={i} className={cn("rounded-lg border p-2.5", urg.cls)}>
                        <div className="flex items-center gap-2">
                          <span>{urg.icon}</span>
                          <span className="text-xs font-bold">{n.position}</span>
                          <span className="text-[10px] ml-auto">{n.urgency}</span>
                        </div>
                        <p className="text-[10px] mt-1 opacity-80">Have {n.have}, need {n.need}. Best: {n.topPlayer}</p>
                        <EvidenceList items={n.evidence} />
                      </div>
                    );
                  })}
                  {team.needs.length === 0 && <p className="text-[10px] text-zinc-600">No critical needs identified.</p>}
                </div>
              </div>

              {/* Strengths */}
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-2">Strengths</p>
                <div className="space-y-1.5">
                  {team.strengths.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-zinc-900/60 rounded-lg border border-zinc-800/40 px-3 py-2">
                      <PosPill pos={s.position} />
                      <span className="text-zinc-300 font-semibold">{s.count}× {s.position}</span>
                      <span className="text-zinc-500 text-[10px] truncate ml-auto">{s.topPlayer}</span>
                    </div>
                  ))}
                  {team.strengths.length === 0 && <p className="text-[10px] text-zinc-600">No notable surplus positions.</p>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Mock draft board ──────────────────────────────────────────────────────────

function MockDraftBoard({ picks, teams }: { picks: MockPick[]; teams: any[] }) {
  const [viewMode, setViewMode]     = useState<"board" | "team">("board");
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [expandPick, setExpandPick] = useState<number | null>(null);

  const rounds = useMemo(() => {
    const r = new Map<number, MockPick[]>();
    for (const p of picks) {
      if (!r.has(p.round)) r.set(p.round, []);
      r.get(p.round)!.push(p);
    }
    return [...r.entries()].sort((a, b) => a[0] - b[0]);
  }, [picks]);

  const teamPicks = useMemo(() => {
    const m = new Map<number, MockPick[]>();
    for (const p of picks) {
      if (!m.has(p.teamId)) m.set(p.teamId, []);
      m.get(p.teamId)!.push(p);
    }
    return m;
  }, [picks]);

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-800/40">
        <button onClick={() => setViewMode("board")}
          className={cn("px-3 py-1.5 rounded text-xs font-bold transition-colors",
            viewMode === "board" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
          Draft Board
        </button>
        <button onClick={() => setViewMode("team")}
          className={cn("px-3 py-1.5 rounded text-xs font-bold transition-colors",
            viewMode === "team" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
          By Team
        </button>
        {viewMode === "team" && (
          <select
            className="ml-2 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
            value={selectedTeam ?? ""}
            onChange={e => setSelectedTeam(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select team...</option>
            {teams.map((t: any) => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* Board view — rounds */}
      {viewMode === "board" && (
        <div className="overflow-auto max-h-[600px]">
          {rounds.map(([round, roundPicks]) => (
            <div key={round} className="border-b border-zinc-800/30">
              <div className="sticky top-0 bg-zinc-900/95 backdrop-blur px-4 py-1.5 flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Round {round}</span>
                <div className="flex-1 h-px bg-zinc-800/60" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-px bg-zinc-800/20">
                {roundPicks.map(p => (
                  <button
                    key={p.pickNumber}
                    onClick={() => setExpandPick(expandPick === p.pickNumber ? null : p.pickNumber)}
                    className={cn(
                      "text-left p-2.5 bg-zinc-900/60 hover:bg-zinc-800/60 transition-colors",
                      p.isKeeperSlot && "border border-amber-500/20 bg-amber-500/5",
                      expandPick === p.pickNumber && "ring-1 ring-emerald-500/40"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] text-zinc-600 font-mono tabular-nums">{p.pickNumber}</span>
                      <PosPill pos={p.position} />
                      {p.isKeeperSlot && <span className="text-[8px] text-amber-400 font-bold">K</span>}
                    </div>
                    <div className="text-[11px] font-bold text-zinc-200 leading-tight truncate">{p.player}</div>
                    <div className="text-[9px] text-zinc-500 truncate mt-0.5">{p.ownerName?.split(" ")[0]}</div>
                    {!p.isKeeperSlot && p.projectedPoints > 0 && (
                      <div className="text-[9px] text-zinc-600 mt-0.5 tabular-nums">{p.projectedPoints.toFixed(0)} pts</div>
                    )}
                  </button>
                ))}
              </div>
              {/* Expanded pick detail */}
              {roundPicks.some(p => p.pickNumber === expandPick) && (() => {
                const pick = roundPicks.find(p => p.pickNumber === expandPick)!;
                return (
                  <div className="mx-2 my-2 rounded-lg border border-zinc-700/60 bg-zinc-900/80 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-zinc-100 text-base">{pick.player}</span>
                      <PosPill pos={pick.position} />
                      <span className="ml-auto text-[10px] text-zinc-500">Pick {pick.pickNumber} · Rd {pick.round}</span>
                    </div>
                    <p className="text-xs text-zinc-400 italic">{pick.reasoning}</p>
                    <ConfBar value={pick.confidence} />
                    <EvidenceList items={pick.evidence} />
                    {pick.alternatePicks.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Alternates</p>
                        <div className="flex flex-wrap gap-1.5">
                          {pick.alternatePicks.map((a, j) => (
                            <span key={j} className="text-[10px] text-zinc-500 bg-zinc-800/40 border border-zinc-700/40 px-2 py-0.5 rounded">
                              {a.player} ({a.position}) · {a.projectedPoints.toFixed(0)} pts
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
      {viewMode === "team" && selectedTeam && (() => {
        const tp = teamPicks.get(selectedTeam) ?? [];
        return (
          <div className="divide-y divide-zinc-800/30 max-h-[600px] overflow-auto">
            {tp.map(p => (
              <div key={p.pickNumber} className={cn("flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/20 transition-colors", p.isKeeperSlot && "bg-amber-500/5")}>
                <div className="w-12 text-center">
                  <div className="text-[9px] text-zinc-600">Rd {p.round}</div>
                  <div className="text-[10px] font-bold text-zinc-400">#{p.pickNumber}</div>
                </div>
                <PosPill pos={p.position} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-zinc-200 truncate">{p.player}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{p.reasoning}</div>
                </div>
                {p.projectedPoints > 0 && (
                  <div className="text-xs tabular-nums text-zinc-400 shrink-0">{p.projectedPoints.toFixed(0)}</div>
                )}
                <div className="w-16 shrink-0"><ConfBar value={p.confidence} /></div>
                {p.isKeeperSlot && <span className="text-[9px] text-amber-400 font-bold shrink-0">KEEPER</span>}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DraftWarRoom() {
  const _trpc = trpc as any;
  const season = new Date().getFullYear();

  const { data, isLoading, error, refetch } = _trpc.draftWarRoom.getDraftWarRoomData.useQuery({ season });

  if (isLoading) return (
    <div className="min-h-screen bg-[#09090e] flex items-center justify-center gap-2 text-zinc-500">
      <RefreshCw className="h-5 w-5 animate-spin text-emerald-400" />
      Building Draft War Room…
    </div>
  );

  if (!data?.ok) return (
    <div className="min-h-screen bg-[#09090e] flex items-center justify-center text-center px-6 space-y-3">
      <div>
        <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
        <p className="text-zinc-300 font-semibold">{data?.error ?? "Failed to load Draft War Room"}</p>
        <p className="text-zinc-600 text-sm mt-1">Sync league data first from the extension.</p>
      </div>
    </div>
  );

  const { keeperPredictions, rosterNeeds, mockDraft, teamCount, totalPicks } = data;

  return (
    <div className="min-h-screen bg-[#09090e] text-zinc-100">

      {/* Header */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/50 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <Zap className="h-4 w-4 text-emerald-400" />
              </div>
              <h1 className="text-xl font-black tracking-tight text-white">Draft War Room</h1>
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 ml-1">{season}</span>
            </div>
            <p className="text-xs text-zinc-500 ml-10">
              League-specific behavioral prediction · {teamCount} teams · {totalPicks} picks
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Stats strip */}
            {[
              { label: "TEAMS", val: teamCount },
              { label: "KEEPERS", val: keeperPredictions.length },
              { label: "ROUNDS", val: Math.max(...mockDraft.map((p: MockPick) => p.round), 0) },
            ].map(s => (
              <div key={s.label} className="text-center px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                <div className="text-lg font-black text-white">{s.val}</div>
                <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{s.label}</div>
              </div>
            ))}
            <button onClick={() => refetch()} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Data availability disclaimer */}
      {!data.dataAvailability?.playerRegistry && (
        <div className="max-w-7xl mx-auto px-6 mt-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Player registry is empty. Populate it via the extension for more accurate mock draft results.
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* Predicted — NOT OFFICIAL banner */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-[10px] text-zinc-500">
          <Info className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
          All keeper predictions are <span className="font-bold text-amber-400">PREDICTED — NOT OFFICIAL</span> unless confirmed by the draft data.
          Every mock draft pick is a behavioral estimate based on roster needs and historical patterns. No fabricated ADP or external rankings used.
        </div>

        {/* Phase 1: Keeper Predictions */}
        <Section title="Keeper Predictions" icon={Trophy} count={keeperPredictions.length}>
          <KeeperSection predictions={keeperPredictions} />
        </Section>

        {/* Phase 2: Roster Construction */}
        <Section title="Roster Construction" icon={BarChart2} count={rosterNeeds.length}>
          <RosterNeedsSection needs={rosterNeeds} />
        </Section>

        {/* Phase 3: Mock Draft Board */}
        <Section title="Mock Draft Board" icon={Target} count={totalPicks} defaultOpen={false}>
          <MockDraftBoard picks={mockDraft} teams={data.rosterNeeds.map((n: RosterNeed) => ({ teamId: n.teamId, name: n.teamName }))} />
        </Section>

      </div>
    </div>
  );
}
