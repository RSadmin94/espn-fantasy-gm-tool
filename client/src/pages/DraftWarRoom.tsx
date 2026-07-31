import {
  applyNormalizedPickBatch,
  applyNormalizedPickEvent,
  computeDraftGradesFromRosters,
  computeScheduleCursor,
  createDraftSessionState,
  isDraftSessionComplete,
  normalizeRfsnLocalMockPick,
  type DraftSessionState,
  type NormalizedPickBatch,
  type NormalizedPickEvent,
} from "@shared/draftSource";
import { Link } from "react-router";
import { useState, useMemo, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { skipToken } from "@tanstack/react-query";
import { useAuth } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";
import { APP_VERSION } from "@/lib/version";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { DraftWarRoomDesk } from "./DraftWarRoomDesk";
import { useRfsnLiveLockedPickNotify } from "@/hooks/useRfsnLiveLockedPickNotify";
import { useDraftRunIdentity } from "@/hooks/useDraftRunIdentity";
import {
  buildConnectedLeagueDraftId,
  useConnectedLeagueLiveMonitor,
} from "@/lib/liveDraftConnectedLeague";
import {
  createRandomDraftSeed,
  formatDraftSeed,
  mulberry32,
  selectAiPick,
} from "@/lib/liveDraftSeed";
import { buildRfsnLiveDraftId } from "@/lib/rfsnLiveDraftId";
import {
  buildLiveDraftPosTabs,
  compareLiveDraftAvailableRows,
  defaultLiveDraftPosFilter,
  matchesLiveDraftPosFilter,
} from "@/lib/liveDraftPoolPresentation";
import {
  buildLiveDraftRecentPicks,
  formatLiveDraftMarketValue,
  formatLiveDraftPoolAdp,
  formatLiveDraftValueVsMarket,
} from "@/lib/liveDraftUx";
import { RfsnBroadcastPanel } from "@/components/rfsn/RfsnBroadcastPanel";
import {
  shouldEnableLegacyEspnLeagueFetch,
  shouldPreferEspnBookmarkletStatus,
} from "@/lib/espnBookmarkletLivePath";
import { isConnectedLeagueLiveActive } from "@/lib/liveDraftSurfaceActive";
import { isRfsnWarRoomBroadcastActive } from "@/lib/rfsnWarRoomBroadcastActive";
import { LiveDraftWrapUp } from "@/components/draft/LiveDraftWrapUp";
import {
  normalizeLiveDraftSource,
  normalizeMockDraftSource,
  type DraftControlSource,
  type LiveDraftSource,
  type MockDraftSource,
} from "@/lib/liveDraftSource";
import {
  LiveDraftControlPanel,
} from "@/components/draft/LiveDraftControlPanel";
import { FantasyProsMockControlPanel } from "@/components/draft/FantasyProsMockControlPanel";
import { useFantasyProsMockDraftMonitor } from "@/hooks/useFantasyProsMockDraftMonitor";
import { useEspnBookmarkletDraftMonitor } from "@/hooks/useEspnBookmarkletDraftMonitor";
import { buildFantasyProsSeatMapping } from "@/lib/fantasyProsSeatMapping";
import { postFantasyProsMockArm, postFantasyProsMockDisarm } from "@/lib/fantasyProsMockBridge";
import { LiveDraftRecentPicks } from "@/components/draft/LiveDraftRecentPicks";
import { DraftNightShow } from "@/components/draft/DraftNightShow";
import type { DraftNightShowPayload } from "@/lib/draftNightShowTypes";
import type { RfsnLivePublicPayload } from "@/lib/rfsnLiveState";
import { RfsnPickClock } from "@/components/rfsn/RfsnPickClock";
import {
  INITIAL_BROADCAST_HOLD,
  broadcastHoldRemainingMs,
  draftPaceFromTimerMs,
  isPickManual,
  reduceBroadcastHold,
  resolveClockState,
  type BroadcastHoldState,
} from "@/lib/draftClock";
import {
  Zap, BarChart2, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, AlertTriangle, Info, Trophy, Target,
  ShieldCheck, TrendingUp, Activity, ArrowUpRight, ArrowDownRight,
  Flame, Lock, Gauge, Wind,
} from "lucide-react";

/** RFSN-019: expand collapsed sections then scroll (sticky nav offset via scroll-mt). */
type DwrExpandToken = { id: string; n: number };
type DwrExpandCtx = {
  expandToken: DwrExpandToken | null;
  openSection: (id: string) => void;
};
const DwrExpandContext = createContext<DwrExpandCtx>({
  expandToken: null,
  openSection: () => {},
});

function dwrScrollTo(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openAndScrollTo(openSection: (id: string) => void, sectionId: string) {
  openSection(sectionId);
  window.setTimeout(() => dwrScrollTo(sectionId), 80);
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

const POS_CFG: Record<string, { pill: string }> = {
  QB:  { pill: "bg-red-500/20 text-red-300 border-red-500/40" },
  RB:  { pill: "bg-lime-500/20 text-lime-300 border-lime-500/40" },
  WR:  { pill: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
  TE:  { pill: "bg-orange-500/20 text-orange-300 border-orange-500/40" },
  K:   { pill: "bg-zinc-700 text-zinc-300 border-zinc-600" },
  DEF: { pill: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
  DST: { pill: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
  DP:  { pill: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40" },
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
  const { expandToken } = useContext(DwrExpandContext);
  const [open, setOpen] = useState(defaultOpen);
  const Icon = icon;
  useEffect(() => {
    if (id && expandToken?.id === id) setOpen(true);
  }, [expandToken, id]);
  void accent;
  return (
    <div id={id} className="scroll-mt-28 rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,#1b131f,#140e17)] overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
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

// ── Draft Briefing (RFSN-019 scan layer — opens detailed sections) ────────────

function briefingFirstName(name?: string | null) {
  const n = String(name ?? "").trim().split(/\s+/)[0];
  return n || "This GM";
}

function ConfidenceDashboard({
  data,
  showKeeperInsights = true,
  onOpenSection,
  positionRunAlerts = [],
  scarcityAlerts = [],
}: {
  data: any;
  showKeeperInsights?: boolean;
  onOpenSection?: (sectionId: string) => void;
  positionRunAlerts?: any[];
  scarcityAlerts?: any[];
}) {
  if (!data) return null;

  const holePos = data.biggestRosterHole?.position;
  const holeOwner = briefingFirstName(data.biggestRosterHole?.ownerName);
  const mostOwner = briefingFirstName(data.mostPredictable?.ownerName);
  const leastOwner = briefingFirstName(data.leastPredictable?.ownerName);
  const reachOwner = briefingFirstName(data.biggestReach?.ownerName);
  const keeperPlayer = data.bestKeeperValue?.player;

  // Preserve Decision Memo interest as Briefing scan synthesis (RFSN-027A) — not a second detail home.
  const decisionLines: string[] = [];
  if (holePos && data.biggestRosterHole?.urgency) {
    decisionLines.push(
      `Lock ${holePos} early — ${String(data.biggestRosterHole.urgency).toLowerCase()} hole${holeOwner ? ` on ${holeOwner}'s board` : ""}.`,
    );
  } else if (!holePos) {
    decisionLines.push("Roster outlook is balanced — take best available and bank value.");
  }
  const run = positionRunAlerts[0];
  if (run) {
    const who = (run.affectedOwners || []).slice(0, 2).join(" & ");
    decisionLines.push(
      `Pre-empt the ${run.position} run${who ? ` — ${who} circling` : ""} (Round ${run.expectedRound ?? run.roundWindow ?? "?"}).`,
    );
  }
  const sc = scarcityAlerts[0];
  if (sc?.position) {
    decisionLines.push(`Value window on ${sc.position} thinning — don't wait a full round.`);
  }

  const cardsAll = [
    {
      icon: ShieldCheck,
      label: "Most Predictable",
      headline: data.mostPredictable?.ownerName
        ? `${mostOwner} drafts by the book`
        : "No read yet",
      signal: data.mostPredictable?.score != null ? `${data.mostPredictable.score}% predictability` : "—",
      hint: data.mostPredictable?.teamName ?? "",
      sectionId: "dwr-dna",
      cta: "Open draft DNA",
      color: "border-lime-500/25 bg-lime-500/5",
      iconColor: "text-lime-400",
    },
    {
      icon: Activity,
      label: "Least Predictable",
      headline: data.leastPredictable?.ownerName
        ? `${leastOwner} is the league's wildcard`
        : "No wildcard yet",
      signal: data.leastPredictable?.score != null ? `${data.leastPredictable.score}% predictability` : "—",
      hint: data.leastPredictable?.teamName ?? "",
      sectionId: "dwr-dna",
      cta: "Open draft DNA",
      color: "border-violet-500/25 bg-violet-500/5",
      iconColor: "text-violet-400",
    },
    {
      icon: ArrowUpRight,
      label: "Roster Priority",
      headline: holePos
        ? `${holePos} scarcity detected — ${holeOwner}'s board is thin`
        : "No critical roster gaps",
      signal: data.biggestRosterHole?.teamName ?? "League-wide",
      hint: data.biggestRosterHole?.reason ?? "",
      sectionId: "dwr-build",
      cta: "View Roster Priorities",
      color: "border-amber-500/25 bg-amber-500/5",
      iconColor: "text-amber-400",
    },
    {
      icon: Trophy,
      label: "Best Keeper Value",
      headline: keeperPlayer
        ? `${keeperPlayer} is the steal keep`
        : "No keeper edge yet",
      signal: data.bestKeeperValue
        ? `${data.bestKeeperValue.recommendation ?? "—"}${data.bestKeeperValue.roundSavings != null ? ` · +${data.bestKeeperValue.roundSavings} rd` : ""}`
        : "—",
      hint: data.bestKeeperValue?.teamName ?? "",
      sectionId: "dwr-keepers",
      cta: "Open keeper read",
      color: "border-violet-500/25 bg-violet-500/5",
      iconColor: "text-violet-400",
    },
    {
      icon: ArrowDownRight,
      label: "Projected Reach",
      headline: data.biggestReach?.ownerName
        ? `${reachOwner} may reach early at ${data.biggestReach?.position ?? "need"}`
        : "No clear reach projected",
      signal: data.biggestReach?.teamName ?? "—",
      hint: data.biggestReach?.reason ?? "",
      sectionId: "dwr-dna",
      cta: "Open draft DNA",
      color: "border-violet-500/25 bg-violet-500/5",
      iconColor: "text-violet-400",
    },
    // "Most Likely to Surprise" removed — Duplicate Data of Least Predictable (insight remains in Owner DNA)
  ];

  const cards = showKeeperInsights
    ? cardsAll
    : cardsAll.filter((c) => c.label !== "Best Keeper Value");

  return (
    <div className="p-4 space-y-3">
      <p className="text-[11px] text-zinc-500 px-0.5">
        Analyst briefing — tap a card for the full intelligence read below.
      </p>
      {decisionLines.length > 0 && (
        <div
          className="rounded-xl border border-lime-500/20 bg-lime-500/5 px-3.5 py-3 space-y-2"
          data-briefing-decision-memo
        >
          <div className="text-[10px] font-black uppercase tracking-wider text-lime-400">
            Tonight&apos;s read
          </div>
          {decisionLines.slice(0, 3).map((line) => (
            <div key={line} className="flex items-start gap-2.5">
              <span className="mt-1.5 shrink-0 rounded-full bg-lime-400/80" style={{ width: 7, height: 7 }} />
              <span className="text-[13px] leading-snug text-zinc-200">{line}</span>
            </div>
          ))}
        </div>
      )}
      <div
        className={cn(
          "grid grid-cols-2 md:grid-cols-3 gap-2",
          cards.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4",
        )}
      >
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => onOpenSection?.(c.sectionId)}
              className={cn(
                "rounded-xl border p-3 space-y-1.5 text-left transition-all hover:scale-[1.02] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40",
                c.color,
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={cn("h-3 w-3 shrink-0", c.iconColor)} />
                <span className={cn("text-[10px] font-black uppercase tracking-wider", c.iconColor)}>{c.label}</span>
              </div>
              <div className="font-black text-zinc-100 text-xs leading-snug line-clamp-3">{c.headline}</div>
              <div className={cn("text-[11px] font-bold tabular-nums", c.iconColor)}>{c.signal}</div>
              {c.hint ? <div className="text-[10px] text-zinc-500 line-clamp-2">{c.hint}</div> : null}
              <div className={cn("text-[10px] font-bold pt-0.5", c.iconColor)}>{c.cta} →</div>
            </button>
          );
        })}
      </div>
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
  // Desk thresholds (higher interest differentiation) — kept as DNA home language.
  if (surp >= 72) return { label: "Panic Pivot", cls: "text-orange-300 border-orange-500/35 bg-orange-500/10" };
  if (pred >= 68 && surp < 38) return { label: "By the Book", cls: "text-lime-300 border-lime-500/35 bg-lime-500/10" };
  if (pred < 46 || surp >= 58) return { label: "Wildcard", cls: "text-amber-300 border-amber-500/35 bg-amber-500/10" };
  return { label: "Steady Hand", cls: "text-violet-300 border-violet-500/30 bg-violet-500/10" };
}

/** Primary archetype language; predictability stays visible (not hover-only). */
function draftBehaviorLabel(m: any): string {
  const pred = Number(m?.predictabilityScore ?? 0);
  const surp = Number(m?.surpriseProbability ?? 0);
  if (surp >= 55 || pred < 46) return "High variation";
  if (pred >= 72) return "Consistent patterns";
  return "Mixed tendencies";
}

function ShockMeterSection({ meters }: { meters: any[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const sorted = useMemo(() => [...meters].sort((a, b) => b.surpriseProbability - a.surpriseProbability), [meters]);
  const threats = sorted.slice(0, 3);
  const topThreat = threats[0] ?? null;

  return (
    <div>
      {/* Preserve Rival Threat + Historical Read interest inside DNA home (RFSN-027A) */}
      {topThreat && (
        <div className="px-4 pt-4 space-y-3" data-dna-threat-lead>
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-300/90 mb-2">
              Historical Read
            </div>
            <p className="text-[15px] leading-snug text-zinc-100">
              &ldquo;{topThreat.ownerName} reads as a{" "}
              <span className="font-bold text-amber-200">{ownerArchetype(topThreat).label}</span>
              {" "}— most likely to attack{" "}
              <span className="font-bold text-amber-200">{topThreat.mostLikelyPosition}</span>
              {" "}when the board breaks.&rdquo;
            </p>
            {(topThreat.evidence || []).slice(0, 2).map((e: string, i: number) => (
              <div key={i} className="flex items-start gap-2 mt-2">
                <span className="text-zinc-600 shrink-0">→</span>
                <span className="text-[13px] text-zinc-500">{e}</span>
              </div>
            ))}
            <div className="mt-3 text-[12px] font-bold uppercase tracking-wider text-lime-400">
              Receipt confidence: {Number(topThreat.predictabilityScore || 0) >= 60 ? "High" : "Moderate"}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2">
              Rival Threat Window
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {threats.map((t) => {
                const hot = Number(t.surpriseProbability || 0) >= 60;
                return (
                  <button
                    key={t.teamId}
                    type="button"
                    onClick={() => setSel(sel === t.teamId ? null : t.teamId)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-2.5 text-left transition-all",
                      sel === t.teamId
                        ? "border-violet-500/40 bg-violet-500/10"
                        : "border-white/[0.06] bg-white/[0.03] hover:border-zinc-600",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-zinc-100 truncate">{t.ownerName}</div>
                      <div className="text-[12px] text-zinc-500 truncate">
                        {t.teamName} · {t.mostLikelyPosition} threat
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn("text-[20px] font-black leading-none", hot ? "text-violet-300" : "text-zinc-200")}>
                        {Math.round(Number(t.surpriseProbability || 0))}%
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-zinc-600 mt-1">surprise</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 p-4">
        {sorted.map(m => {
          const arc = ownerArchetype(m);
          const behavior = draftBehaviorLabel(m);
          return (
            <button key={m.teamId} type="button" onClick={() => setSel(sel === m.teamId ? null : m.teamId)}
              title={`${m.ownerName} · ${m.predictabilityScore}% predictability`}
              className={cn("rounded-lg border p-3 text-left transition-all hover:scale-105 space-y-1.5",
                sel === m.teamId ? "border-violet-500/40 bg-white/[0.04] shadow-lg" : "border-white/[0.06] bg-white/[0.03] hover:border-zinc-700")}>
              <div className="text-[12px] font-bold text-zinc-100 truncate">{m.ownerName?.split(" ")[0] ?? m.ownerName}</div>
              <div className="text-[10px] text-zinc-600 truncate">{m.teamName}</div>
              <span className={cn("inline-block text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border", arc.cls)}>{arc.label}</span>
              <div className="text-[11px] text-zinc-400">Draft behavior: {behavior}</div>
              <div className="text-[11px] font-bold text-zinc-300 tabular-nums">
                {m.predictabilityScore}% predictability
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[10px] text-zinc-600">Likely</span>
                <PosPill pos={m.mostLikelyPosition} />
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
                <p className="text-[11px] text-zinc-400 mt-1">
                  {ownerArchetype(m).label} · Draft behavior: {draftBehaviorLabel(m)}
                </p>
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
  picks, teams, availablePool, positionCaps,
  leagueId, draftId, season,
  preferLiveDraft = false,
}: {
  picks: any[]; teams: any[]; availablePool: any[]; positionCaps: Record<string, number> | null;
  leagueId?: string | null;
  draftId: string;
  season: number;
  /** RFSN-013 — open Live Draft shell when landing from `/draft/live`. */
  preferLiveDraft?: boolean;
}) {
  // Match drafted players to the pool by NORMALIZED NAME (strip punctuation + Jr/Sr/III suffixes),
  // because the souls board and the available pool carry different ids/name spellings — id matching
  // was leaving already-drafted players showing as available.
  const norm = (n: any) => String(n ?? "").toLowerCase().replace(/[.'’`]/g, "").replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").trim();
  const keyOf = (p: any) => `name:${norm(p?.name)}`;
  // League-driven position caps (from THIS league's real lineup settings, superflex-aware) with a
  // safe fallback if the server didn't supply them.
  const POS_CAPS: Record<string, number> = positionCaps ?? { QB: 2, RB: 6, WR: 6, TE: 2, K: 1, DEF: 1, DP: 1 };

  const schedule = useMemo(() => [...picks].sort((a, b) => a.pickNumber - b.pickNumber), [picks]);
  // Content signature so the draft only resets when the ACTUAL board changes — not when a parent
  // re-render hands us a fresh-but-identical picks array (which was wiping the draft mid-pick).
  const scheduleSig = useMemo(() => schedule.map((s: any) => `${s.pickNumber}:${s.teamId}:${s.player ?? ""}`).join("|"), [schedule]);
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

  const [session, setSession] = useState<DraftSessionState>(() =>
    createDraftSessionState({
      sessionKey: "init",
      draftId,
      baselineResults: initialResults,
    }),
  );
  const results = session.results;
  const [idx, setIdx]         = useState(0);
  const [running, setRunning] = useState(false);
  const [sort, setSort]       = useState<"adp" | "proj" | "value" | "pos" | "name">("adp");
  const [posFilter, setPos]   = useState<string>("ALL");
  const [searchQ, setSearchQ] = useState("");
  const posDefaultApplied = useRef(false);
  const [liveDraftActive, setLiveDraftActive] = useState(preferLiveDraft);
  /** Live experience — real league only (ESPN today). */
  const [liveDraftSource, setLiveDraftSource] = useState<LiveDraftSource>("espn");
  /** Mock experience — RFSN Local Mock or FantasyPros Mock. */
  const [mockDraftSource, setMockDraftSource] = useState<MockDraftSource>("rfsn");
  /** RFSN-030C — FantasyPros solo mock connector (Mock surface + fantasypros source). */
  const [fpMockActive, setFpMockActive] = useState(false);
  const [fpUserOwnerPos, setFpUserOwnerPos] = useState(0);
  const [fpVoiceEnabled, setFpVoiceEnabled] = useState(true);
  const [fpCommentaryEnabled, setFpCommentaryEnabled] = useState(true);
  const [fpSessionEpoch, setFpSessionEpoch] = useState(0);
  /** Last FantasyPros provider draftId — base for run identity while FP is armed. */
  const [fpBaseDraftId, setFpBaseDraftId] = useState<string | null>(null);
  const liveSource = normalizeLiveDraftSource(liveDraftSource);
  const mockSource = normalizeMockDraftSource(mockDraftSource);
  /** Built-in RFSN local mock may generate picks only on Mock + RFSN source. */
  const allowInternalSimPicks = !preferLiveDraft && mockSource === "rfsn";
  const fpSessionArmed =
    !preferLiveDraft && mockSource === "fantasypros" && fpMockActive;
  const connectedLeagueLive = isConnectedLeagueLiveActive({
    liveDraftActive,
    preferLiveDraft,
    source: liveSource,
    fantasyProsSessionActive: fpSessionArmed,
  });

  const availablePoolRef = useRef(availablePool);
  useEffect(() => {
    availablePoolRef.current = availablePool;
  }, [availablePool]);

  const enrichFromPool = useCallback((event: NormalizedPickEvent) => {
    const target = norm(event.playerName);
    const hit = availablePoolRef.current.find((p: any) => norm(p?.name) === target);
    if (!hit) {
      return {
        adp: event.adp ?? null,
        nflTeam: event.nflTeam ?? null,
        isKeeper: Boolean(event.metadata?.isKeeper),
      };
    }
    return {
      adp: hit.adp ?? event.adp ?? null,
      marketValue: hit.marketValue ?? null,
      projectedPoints: hit.projectedPoints,
      nflTeam: hit.nflTeam ?? event.nflTeam ?? null,
      isKeeper: Boolean(event.metadata?.isKeeper),
    };
  }, []);

  const applyProjectionBatch = useCallback((batch: NormalizedPickBatch) => {
    console.info("[espn-bm-path]", "DraftWarRoom_applyNormalizedPickBatch", {
      hop: "applyNormalizedPickBatch",
      draftId: batch.draftId,
      batchSize: batch.picks.length,
      draftComplete: batch.draftComplete,
      provider: batch.provider,
    });
    setSession((prev) => applyNormalizedPickBatch(prev, batch, enrichFromPool).state);
  }, [enrichFromPool]);

  useEffect(() => {
    if (preferLiveDraft) {
      setLiveDraftActive(true);
      setLiveDraftSource("espn");
      setFpMockActive(false);
      setRunning(false);
    } else {
      // Entering Mock: stop ESPN Live; default to RFSN Local Mock.
      setLiveDraftActive(true);
      setRunning(false);
      setFpMockActive(false);
      setMockDraftSource((s) => normalizeMockDraftSource(s));
    }
  }, [preferLiveDraft]);

  // ESPN Live must not generate internal simulated picks.
  useEffect(() => {
    if (preferLiveDraft || mockSource === "fantasypros") setRunning(false);
  }, [preferLiveDraft, mockSource]);

  // Leaving FantasyPros mock source must tear down FantasyPros connector.
  useEffect(() => {
    if (preferLiveDraft || mockSource !== "fantasypros") {
      if (fpMockActive) {
        setFpMockActive(false);
        void postFantasyProsMockDisarm().catch(() => {});
      }
    }
  }, [preferLiveDraft, mockSource, fpMockActive]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pace between AI auto-picks. Default "Broadcast" gives the RFSN booth time to
  // generate + play a line before the next pick; Brisk/Turbo for quick sims.
  const PACE_OPTIONS = [
    { key: "broadcast", label: "Broadcast", ms: 9000 },
    { key: "brisk", label: "Brisk", ms: 3500 },
    { key: "turbo", label: "Turbo", ms: 450 },
  ] as const;
  const [paceMs, setPaceMs] = useState<number>(9000);

  // Seeded AI variation — fresh seed each new draft; replay keeps the same seed.
  const [draftSeed, setDraftSeed] = useState<number>(() => createRandomDraftSeed());
  const [replaySameSeed, setReplaySameSeed] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);
  const rngRef = useRef(mulberry32(draftSeed));
  const pickCounterRef = useRef(0);
  useEffect(() => {
    rngRef.current = mulberry32(draftSeed);
    pickCounterRef.current = 0;
  }, [draftSeed, scheduleSig]);

  // Authoritative clock + observational broadcast hold (capped; never permanently blocks).
  const TICK_MS = 250;
  const [remainingMs, setRemainingMs] = useState<number>(paceMs);
  const [holding, setHolding] = useState<boolean>(false); // paused for a broadcast moment
  const [broadcastBusy, setBroadcastBusy] = useState<boolean>(false); // reported by the booth panel
  const broadcastHoldRef = useRef<BroadcastHoldState>(INITIAL_BROADCAST_HOLD);

  const applyBroadcastHold = (next: BroadcastHoldState) => {
    broadcastHoldRef.current = next;
    setHolding(next.holding);
  };

  // ── Manual control (P6) — single source of truth `manualTeamIds`. ────────────
  // Default: the signed-in user's team. Zero selected = full AI; all selected = fully manual.
  const { myTeamId } = useLeagueContext();
  const buildDefaultManual = () =>
    myTeamId != null ? new Set<number>([myTeamId]) : new Set<number>();
  const [manualTeamIds, setManualTeamIds] = useState<Set<number>>(buildDefaultManual);
  // Reset selections to the user's team on league/season/schedule identity change (and seed
  // once myTeamId resolves). User toggles never hit this — myTeamId is stable within a league,
  // and scheduleSig only changes on a real board/league/season change (never on draft reset).
  useEffect(() => {
    setManualTeamIds(myTeamId != null ? new Set<number>([myTeamId]) : new Set<number>());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSig, myTeamId]);

  useEffect(() => {
    setIdx(0);
    setRunning(false);
    applyBroadcastHold(INITIAL_BROADCAST_HOLD);
    setRemainingMs(paceMs);
    if (timer.current) clearTimeout(timer.current);
    // Session board reset is owned by draftSessionIdentity (includes scheduleSig).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSig]);

  const draftedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const k of Object.keys(results)) s.add(keyOf(results[Number(k)]));
    return s;
  }, [results]);

  /** RFSN-014 — client belt-and-suspenders: hide positions the league does not roster.
   *  availablePool here is the shared eligible universe (RFSN-017), not mock residual.
   *  Live locked picks are subtracted via draftedKeys below. */
  const formatEligiblePool = useMemo(() => {
    const caps = POS_CAPS;
    return availablePool.filter((p: any) => {
      const pos = String(p.position ?? "").toUpperCase();
      if (pos === "DP") return (caps.DP ?? 0) > 0;
      if (pos === "DEF" || pos === "DST" || pos === "D/ST") return (caps.DEF ?? 0) > 0;
      return true;
    });
  }, [availablePool, POS_CAPS]);

  const available = useMemo(() => {
    let list = formatEligiblePool.filter((p: any) => !draftedKeys.has(keyOf(p)));
    list = list.filter((p: any) => matchesLiveDraftPosFilter(p.position, posFilter));
    if (searchQ) {
      const q = searchQ.toLowerCase();
      list = list.filter((p: any) => p.name.toLowerCase().includes(q) || (p.position ?? "").toLowerCase().includes(q));
    }
    const prioritizeOffenseInAll = posFilter === "OFFENSE";
    const s = [...list];
    s.sort((a, b) =>
      compareLiveDraftAvailableRows(a, b, sort, { prioritizeOffenseInAll }),
    );
    return s;
  }, [formatEligiblePool, draftedKeys, posFilter, searchQ, sort]);

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

  // Draft grades (A–F) — shared projector path (provider-agnostic).
  const draftGrades = useMemo(
    () => computeDraftGradesFromRosters(rostersByTeam),
    [rostersByTeam],
  );

  const projectedCursor = useMemo(
    () => computeScheduleCursor(schedule, results),
    [schedule, results],
  );
  const sessionDraftComplete = isDraftSessionComplete({
    draftCompleteFlag: session.draftComplete,
    scheduleLength: schedule.length,
    cursor: projectedCursor,
  });
  // Local mock keeps idx-driven completion (unchanged sim behavior); external sources use session.
  const done = allowInternalSimPicks
    ? idx >= schedule.length
    : sessionDraftComplete;
  const slot = schedule[allowInternalSimPicks ? idx : projectedCursor];
  const awaitingUser = !!slot && !slot.isKeeperSlot && isPickManual(manualTeamIds, slot?.teamId) && !results[slot.pickNumber];
  const onClock = slot ? teams.find((t: any) => Number(t.teamId) === Number(slot.teamId)) : null;

  const ownerNameByTeamId = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) {
      const tid = String(t.teamId ?? "");
      const name = String(t.ownerName ?? t.teamName ?? "").trim();
      if (tid && name) m.set(tid, name);
    }
    return m;
  }, [teams]);

  const fpSeatMapping = useMemo(() => {
    const userTeamId = myTeamId ?? teams[0]?.teamId ?? 1;
    return buildFantasyProsSeatMapping({
      teams: teams.map((t: any) => ({
        teamId: t.teamId,
        ownerName: t.ownerName,
        teamName: t.teamName,
        draftSlot: t.draftSlot ?? t.draftPosition ?? null,
      })),
      userOwnerPos: fpUserOwnerPos,
      userTeamId,
      teamCount: teams.length || 12,
    });
  }, [teams, myTeamId, fpUserOwnerPos]);

  const resetSession = (trpc as any).rfsnBroadcast.resetLiveSession.useMutation();

  /** Provider base id (may repeat across runs) — run suffix applied below for booth/wrap-up. */
  const providerBaseDraftId =
    fpSessionArmed && fpBaseDraftId
      ? fpBaseDraftId
      : connectedLeagueLive && leagueId
        ? buildConnectedLeagueDraftId(leagueId, season)
        : draftId;

  const lockedPicksForRun = useMemo(() => {
    const out: Array<{ overallPick: number; playerId?: string | null; playerName?: string | null }> =
      [];
    for (const [k, v] of Object.entries(results)) {
      if (!v?.name || (v as { isKeeper?: boolean }).isKeeper) continue;
      const overallPick = Number(k);
      if (!Number.isFinite(overallPick) || overallPick < 1) continue;
      out.push({
        overallPick,
        playerId: String((v as { playerId?: string }).playerId ?? ""),
        playerName: String(v.name ?? ""),
      });
    }
    return out;
  }, [results]);

  const newDraftEpoch = resetCounter + fpSessionEpoch * 1_000_000;

  const draftRun = useDraftRunIdentity({
    baseDraftId: providerBaseDraftId,
    enabled: Boolean(leagueId),
    lockedPicks: lockedPicksForRun,
    draftComplete: done,
    newDraftEpoch,
  });

  const boothDraftId = draftRun.boothDraftId;
  const prevBoothDraftIdRef = useRef(boothDraftId);
  useEffect(() => {
    const prev = prevBoothDraftIdRef.current;
    if (prev && prev !== boothDraftId && leagueId) {
      // Drop prior run's wrap-up / Draft Night Show so UI cannot keep stale awards.
      resetSession.mutate?.({ leagueId: String(leagueId), draftId: prev });
    }
    prevBoothDraftIdRef.current = boothDraftId;
  }, [boothDraftId, leagueId, resetSession]);

  useRfsnLiveLockedPickNotify({
    enabled: Boolean(leagueId) && allowInternalSimPicks && !connectedLeagueLive,
    leagueId,
    draftId: boothDraftId,
    schedule: schedule.map((s: any) => ({
      pickNumber: s.pickNumber,
      round: s.round,
      roundPick: s.roundPick,
      teamId: s.teamId,
      ownerName: teams.find((t: any) => Number(t.teamId) === Number(s.teamId))?.ownerName ?? s.ownerName,
      isKeeperSlot: s.isKeeperSlot,
    })),
    results,
    draftComplete: done,
    teamCount: teams.length || 14,
    draftPace: draftPaceFromTimerMs(paceMs),
    resetKey: scheduleSig,
    baselineResults: initialResults,
  });

  const fpMock = useFantasyProsMockDraftMonitor({
    enabled: Boolean(leagueId) && fpSessionArmed,
    leagueId,
    season,
    teamCount: teams.length || 12,
    seatNameByPos: fpSeatMapping.seatNameByPos,
    seatTeamIdByPos: fpSeatMapping.seatTeamIdByPos,
    draftPace: draftPaceFromTimerMs(paceMs),
    voiceEnabled: fpVoiceEnabled,
    commentaryEnabled: fpCommentaryEnabled,
    armExtension: true,
    notifyDraftId: boothDraftId,
    onNormalizedBatch: applyProjectionBatch,
    onSessionReset: () => {
      setFpSessionEpoch((n) => n + 1);
    },
  });

  useEffect(() => {
    if (fpMock.draftId) setFpBaseDraftId(fpMock.draftId);
  }, [fpMock.draftId]);

  /** Bookmarklet-primary ESPN live ingest (Phase 3). */
  const espnBookmarklet = useEspnBookmarkletDraftMonitor({
    enabled: Boolean(leagueId) && connectedLeagueLive,
    leagueId,
    season,
    teamCount: teams.length || 12,
    draftPace: draftPaceFromTimerMs(paceMs),
    armExtension: true,
    notifyDraftId: boothDraftId,
    onNormalizedBatch: applyProjectionBatch,
  });

  /**
   * Connected-league cookie/API fallback — only when the extension is missing.
   * Bookmarklet-primary path must never dual-poll legacy league fetch (shows "League fetch failed").
   */
  const legacyLeagueFetchEnabled = shouldEnableLegacyEspnLeagueFetch({
    connectedLeagueLive,
    bookmarkletConnectorStatus: espnBookmarklet.connectorStatus,
  });
  const leagueAdapter = useConnectedLeagueLiveMonitor({
    enabled: Boolean(leagueId) && legacyLeagueFetchEnabled,
    leagueId,
    season,
    draftPace: draftPaceFromTimerMs(paceMs),
    ownerNameByTeamId,
    notifyDraftId: boothDraftId,
    onNormalizedBatch: applyProjectionBatch,
  });

  const preferBookmarkletStatus = shouldPreferEspnBookmarkletStatus({
    connectedLeagueLive,
    bookmarkletTransportActive: espnBookmarklet.transportActive,
    bookmarkletConnectorStatus: espnBookmarklet.connectorStatus,
  });
  const espnLiveStatus = preferBookmarkletStatus
    ? {
        lastError: espnBookmarklet.lastError,
        notifiedCount: espnBookmarklet.notifiedCount,
        lockedCount: espnBookmarklet.lockedCount,
        extensionPresent: espnBookmarklet.extensionPresent,
        lastPollAt: espnBookmarklet.lastPollAt,
        transportActive: espnBookmarklet.transportActive,
        mirrorHandshake: espnBookmarklet.mirrorHandshake,
        connectorStatus: espnBookmarklet.connectorStatus,
        lastRevision: espnBookmarklet.lastRevision,
        sessionNonce: espnBookmarklet.sessionNonce,
      }
    : {
        lastError: leagueAdapter.lastError,
        notifiedCount: leagueAdapter.notifiedCount,
        lockedCount: leagueAdapter.lockedCount,
        extensionPresent: leagueAdapter.extensionPresent,
        lastPollAt: leagueAdapter.lastPollAt,
        transportActive: false,
        mirrorHandshake: false,
        connectorStatus: leagueAdapter.active ? "monitoring" : "idle",
        lastRevision: null as number | null,
        sessionNonce: null as string | null,
      };

  /** Source/session identity — changing this clears board/rosters/grades/wrap-up. */
  const draftSessionIdentity = useMemo(
    () =>
      [
        preferLiveDraft ? "live" : "mock",
        preferLiveDraft ? liveSource : mockSource,
        String(leagueId ?? ""),
        String(season),
        preferLiveDraft
          ? leagueId
            ? buildConnectedLeagueDraftId(leagueId, season)
            : draftId
          : mockSource === "fantasypros"
            ? `fp:${fpSessionEpoch}`
            : `rfsn:${resetCounter}`,
        // Local mock board is schedule-owned; ESPN/FP boards are source-owned (do not wipe on schedule hydrate).
        allowInternalSimPicks ? scheduleSig : "external",
      ].join("|"),
    [
      preferLiveDraft,
      liveSource,
      mockSource,
      leagueId,
      season,
      draftId,
      fpSessionEpoch,
      resetCounter,
      allowInternalSimPicks,
      scheduleSig,
    ],
  );

  useEffect(() => {
    setSession(
      createDraftSessionState({
        sessionKey: draftSessionIdentity,
        draftId: boothDraftId,
        provider: preferLiveDraft
          ? "espn-live"
          : mockSource === "fantasypros"
            ? "fantasypros-mock"
            : "rfsn-local-mock",
        baselineResults: initialResults,
      }),
    );
    setIdx(0);
    setRunning(false);
    applyBroadcastHold(INITIAL_BROADCAST_HOLD);
    setRemainingMs(paceMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSessionIdentity]);

  // External sources: merge keeper slots when schedule hydrates without wiping projected picks.
  useEffect(() => {
    if (allowInternalSimPicks) return;
    if (Object.keys(initialResults).length === 0) return;
    setSession((prev) => {
      let changed = false;
      const results = { ...prev.results };
      for (const [pn, keeper] of Object.entries(initialResults)) {
        const n = Number(pn);
        if (results[n]?.name) continue;
        results[n] = keeper as DraftSessionState["results"][number];
        changed = true;
      }
      return changed ? { ...prev, results } : prev;
    });
  }, [allowInternalSimPicks, scheduleSig, initialResults]);

  // External sources: keep idx aligned with projected board cursor for control chrome.
  useEffect(() => {
    if (allowInternalSimPicks) return;
    setIdx(projectedCursor);
  }, [allowInternalSimPicks, projectedCursor]);

  // Poll live session for Draft Night Show awards after wrap-up (same source as booth).
  const liveSnapQ = (trpc as any).rfsnBroadcast.getLiveSnapshot.useQuery(
    leagueId && done ? { leagueId, draftId: boothDraftId } : skipToken,
    { refetchInterval: done ? 2000 : false, staleTime: 1000 },
  );
  const livePayload = liveSnapQ.data as RfsnLivePublicPayload | undefined;
  const draftNightShow = livePayload?.draftNightShow as DraftNightShowPayload | null | undefined;
  const analystRecap =
    livePayload?.snapshot?.primary?.text ??
    livePayload?.snapshot?.secondary?.text ??
    null;

  // ── Authoritative clock engine (reactive broadcast pause; never extends routine picks) ──
  const onClockIsManual = awaitingUser;

  // Reset the countdown when the pick changes. Reads paceMs at that moment, so a pace change
  // applies to FUTURE picks without corrupting the current one.
  useEffect(() => {
    setRemainingMs(paceMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // Keeper slots auto-advance (no clock, no broadcast). Live RFSN source only.
  useEffect(() => {
    if (!allowInternalSimPicks || !running || done || holding) return;
    const cur = schedule[idx];
    if (cur && cur.isKeeperSlot) {
      const t = setTimeout(() => setIdx((i) => i + 1), 50);
      return () => clearTimeout(t);
    }
  }, [allowInternalSimPicks, running, done, holding, schedule, idx]);

  // Countdown tick — only while an AI pick is genuinely on the clock (never for a manual
  // team, a keeper, or while paused for a broadcast moment). Live RFSN source only.
  useEffect(() => {
    const cur = schedule[idx];
    const counting =
      allowInternalSimPicks &&
      running &&
      !done &&
      !holding &&
      !onClockIsManual &&
      !!cur &&
      !cur.isKeeperSlot;
    if (!counting) return;
    const iv = setInterval(() => setRemainingMs((ms) => Math.max(0, ms - TICK_MS)), TICK_MS);
    return () => clearInterval(iv);
  }, [allowInternalSimPicks, running, done, holding, onClockIsManual, schedule, idx]);

  // Fire the AI pick when the countdown hits 0, then advance IMMEDIATELY. The pause is
  // reactive (below), so routine picks incur no post-pick grace.
  useEffect(() => {
    if (remainingMs > 0) return;
    const cur = schedule[idx];
    const counting =
      allowInternalSimPicks &&
      running &&
      !done &&
      !holding &&
      !onClockIsManual &&
      !!cur &&
      !cur.isKeeperSlot;
    if (!counting) return;
    setSession((prev) => {
      if (prev.results[cur.pickNumber]) return prev;
      const taken = new Set<string>();
      const counts: Record<string, number> = {};
      for (const k of Object.keys(prev.results)) {
        const r = prev.results[Number(k)];
        taken.add(keyOf(r));
        const sd = schedule.find((s: any) => s.pickNumber === Number(k));
        if (sd && Number(sd.teamId) === Number(cur.teamId)) counts[r.position] = (counts[r.position] ?? 0) + 1;
      }
      const late = Number(cur.round) > totalRounds - 2;
      const pool = availablePool
        .filter((p: any) => !taken.has(keyOf(p)));
      const pick = selectAiPick({
        pool,
        teamId: Number(cur.teamId),
        round: Number(cur.round),
        positionCounts: counts,
        posCaps: POS_CAPS,
        lateRound: late,
        rng: () => {
          pickCounterRef.current += 1;
          return rngRef.current();
        },
      });
      if (!pick) return prev;
      const event = normalizeRfsnLocalMockPick(
        {
          overallPick: Number(cur.pickNumber),
          round: Number(cur.round),
          roundPick: Number(cur.roundPick ?? cur.pickNumber),
          teamId: String(cur.teamId),
          ownerName: String(
            teams.find((t: any) => Number(t.teamId) === Number(cur.teamId))?.ownerName ?? "",
          ),
          playerId: String(pick.id ?? `ai:${norm(pick.name)}`),
          playerName: String(pick.name),
          position: String(pick.position ?? "?"),
          nflTeam: pick.nflTeam ?? null,
          adp: pick.adp ?? null,
        },
        { leagueId: String(leagueId ?? ""), draftId },
      );
      return applyNormalizedPickEvent(prev, event, {
        enrich: {
          adp: pick.adp ?? null,
          marketValue: pick.marketValue ?? null,
          projectedPoints: pick.projectedPoints,
          nflTeam: pick.nflTeam ?? null,
          byAI: true,
        },
      }).state;
    });
    setIdx((i) => i + 1);
  }, [remainingMs, allowInternalSimPicks, running, done, holding, onClockIsManual, schedule, idx, totalRounds, availablePool, leagueId, draftId, teams]);

  // Reactive broadcast pause — freeze countdown + AI briefly while a moment is on air.
  // After the watchdog, suppressUntilIdle prevents a stuck booth from re-arming the hold.
  useEffect(() => {
    const next = reduceBroadcastHold(broadcastHoldRef.current, {
      type: "busy_changed",
      busy: broadcastBusy,
      now: Date.now(),
    });
    if (
      next.holding !== broadcastHoldRef.current.holding ||
      next.suppressUntilIdle !== broadcastHoldRef.current.suppressUntilIdle ||
      next.holdStartedAt !== broadcastHoldRef.current.holdStartedAt
    ) {
      applyBroadcastHold(next);
    }
  }, [broadcastBusy]);

  // Watchdog — draft continues after the cap even if the booth stays busy.
  useEffect(() => {
    if (!holding) return;
    const remaining = broadcastHoldRemainingMs(broadcastHoldRef.current, Date.now());
    const t = setTimeout(() => {
      applyBroadcastHold(
        reduceBroadcastHold(broadcastHoldRef.current, { type: "watchdog", now: Date.now() }),
      );
    }, remaining);
    return () => clearTimeout(t);
  }, [holding]);

  function userDraft(p: any) {
    if (!allowInternalSimPicks) return;
    const cur = schedule[idx];
    if (!cur) return;
    const event = normalizeRfsnLocalMockPick(
      {
        overallPick: Number(cur.pickNumber),
        round: Number(cur.round),
        roundPick: Number(cur.roundPick ?? cur.pickNumber),
        teamId: String(cur.teamId),
        ownerName: String(
          teams.find((t: any) => Number(t.teamId) === Number(cur.teamId))?.ownerName ?? "",
        ),
        playerId: String(p.id ?? `user:${norm(p.name)}`),
        playerName: String(p.name),
        position: String(p.position ?? "?"),
        nflTeam: p.nflTeam ?? null,
        adp: p.adp ?? null,
      },
      { leagueId: String(leagueId ?? ""), draftId },
    );
    setSession((prev) =>
      applyNormalizedPickEvent(prev, event, {
        enrich: {
          adp: p.adp ?? null,
          marketValue: p.marketValue ?? null,
          projectedPoints: p.projectedPoints,
          nflTeam: p.nflTeam ?? null,
          byUser: true,
        },
      }).state,
    );
    setSearchQ("");
    setRunning(true);
    setIdx((i) => i + 1); // advance immediately; the reactive pause holds if a moment fires
  }

  // Toggle a team's manual control (single source of truth). Checking the on-clock AI team
  // stops its clock instantly (counting halts). Unchecking the on-clock manual team starts a
  // fresh full countdown.
  function toggleManual(teamId: number) {
    const wasManual = manualTeamIds.has(teamId);
    setManualTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
    if (wasManual && slot && Number(slot.teamId) === Number(teamId)) setRemainingMs(paceMs);
  }

  function resetTeamControls() {
    setManualTeamIds(myTeamId != null ? new Set<number>([myTeamId]) : new Set<number>());
    if (slot && (myTeamId == null || Number(slot.teamId) !== myTeamId)) setRemainingMs(paceMs);
  }

  function reset(newSeed?: number) {
    if (timer.current) clearTimeout(timer.current);
    if (newSeed != null) {
      setDraftSeed(newSeed);
      setReplaySameSeed(false);
    } else if (!replaySameSeed) {
      setDraftSeed(createRandomDraftSeed());
    }
    setSession(
      createDraftSessionState({
        sessionKey: `rfsn-reset:${Date.now()}`,
        draftId,
        provider: "rfsn-local-mock",
        baselineResults: initialResults,
      }),
    );
    setIdx(0);
    setRunning(false);
    applyBroadcastHold(INITIAL_BROADCAST_HOLD); setRemainingMs(paceMs);
    // Manual-team choices (manualTeamIds) are intentionally PRESERVED through draft reset;
    // they reset only on league/season/schedule change or via "Reset team controls".
    if (leagueId) resetSession.mutate?.({ leagueId, draftId: boothDraftId });
    setResetCounter((n) => n + 1);
  }

  function newRandomDraft() {
    setReplaySameSeed(false);
    reset(createRandomDraftSeed());
  }

  function replayCurrentSeed() {
    setReplaySameSeed(true);
    reset(draftSeed);
  }

  const clockState = resolveClockState({ done, isManualPick: onClockIsManual, isHolding: holding, remainingMs });

  const lastLockedPlayerName = useMemo(() => {
    let maxPick = 0;
    let name: string | null = null;
    for (const [k, v] of Object.entries(results)) {
      const n = Number(k);
      if ((v as any)?.isKeeper) continue;
      const playerName = String((v as any)?.name ?? "").trim();
      if (!playerName || !Number.isFinite(n) || n <= maxPick) continue;
      maxPick = n;
      name = playerName;
    }
    return name;
  }, [results]);

  const recentPicks = useMemo(
    () =>
      buildLiveDraftRecentPicks({
        schedule,
        results,
        teams,
        limit: 8,
      }),
    [schedule, results, teams],
  );

  const currentOverallPick = slot && !done ? Number(slot.pickNumber) : null;

  const SORTS: [typeof sort, string][] = [["adp","ADP"],["proj","Proj"],["value","Value"],["pos","Pos"],["name","Name"]];
  // Position tabs: IDP leagues open on OFFENSE (RFSN-016); DP remains a first-class tab.
  const POSES = useMemo(() => {
    const up = (s: any) => String(s ?? "").toUpperCase();
    const hasDef = formatEligiblePool.some((p: any) => ["DEF", "DST", "D/ST"].includes(up(p.position)));
    const hasDp = formatEligiblePool.some((p: any) => up(p.position) === "DP");
    return buildLiveDraftPosTabs({ hasDef, hasDp });
  }, [formatEligiblePool]);

  useEffect(() => {
    if (posDefaultApplied.current) return;
    const hasDp = formatEligiblePool.some((p: any) => String(p.position ?? "").toUpperCase() === "DP");
    if (formatEligiblePool.length === 0) return;
    posDefaultApplied.current = true;
    setPos(defaultLiveDraftPosFilter(hasDp));
  }, [formatEligiblePool]);

  return (
    <div
      className="p-4 live-draft-surface text-[1.2rem] min-w-0 overflow-x-hidden"
      data-draft-surface={preferLiveDraft ? "live" : "mock"}
      data-live-draft-source={preferLiveDraft ? liveSource : mockSource}
    >
      {/* Shared control strip — Live = ESPN League; Mock = RFSN Local / FantasyPros */}
      <LiveDraftControlPanel
        experience={preferLiveDraft ? "live" : "mock"}
        status={{
          active: preferLiveDraft ? liveDraftActive : liveDraftActive || fpSessionArmed,
          source: preferLiveDraft ? liveSource : mockSource,
          monitoring: connectedLeagueLive
            ? preferBookmarkletStatus
              ? espnLiveStatus.transportActive && !espnLiveStatus.lastError
              : !espnLiveStatus.lastError
            : allowInternalSimPicks
              ? running || idx > 0
              : fpSessionArmed,
          boothOnAir: connectedLeagueLive
            ? espnLiveStatus.notifiedCount > 0 || espnLiveStatus.lockedCount > 0
            : allowInternalSimPicks
              ? running || idx > 0
              : fpSessionArmed && (fpMock.notifiedCount > 0 || fpMock.lockedCount > 0),
          lockedCount: connectedLeagueLive
            ? espnLiveStatus.lockedCount
            : allowInternalSimPicks
              ? Object.keys(results).length
              : fpMock.lockedCount,
          notifiedCount: connectedLeagueLive
            ? espnLiveStatus.notifiedCount
            : allowInternalSimPicks
              ? 0
              : fpMock.notifiedCount,
          draftComplete: done,
          lastError: connectedLeagueLive
            ? espnLiveStatus.lastError
            : fpSessionArmed
              ? fpMock.lastError
              : null,
          lastPollAt: connectedLeagueLive ? espnLiveStatus.lastPollAt : null,
          connectorReady: connectedLeagueLive
            ? preferBookmarkletStatus
              ? Boolean(espnLiveStatus.mirrorHandshake)
              : espnLiveStatus.extensionPresent
            : fpSessionArmed
              ? fpMock.extensionPresent
              : true,
          draftPaused: allowInternalSimPicks ? !running && !done && idx > 0 : false,
          transportKind: connectedLeagueLive && preferBookmarkletStatus ? "espn-mirror" : null,
          lastRevision:
            connectedLeagueLive && preferBookmarkletStatus
              ? espnLiveStatus.lastRevision
              : null,
          connectorStatus:
            connectedLeagueLive && preferBookmarkletStatus
              ? espnLiveStatus.connectorStatus
              : null,
        }}
        onToggleActive={() => {
          if (preferLiveDraft) setLiveDraftActive((v) => !v);
          else if (mockSource === "fantasypros") {
            if (fpMockActive) {
              setFpMockActive(false);
              void postFantasyProsMockDisarm().catch(() => {});
            } else {
              setFpMockActive(true);
              setRunning(false);
            }
          } else {
            setLiveDraftActive((v) => !v);
          }
        }}
        onSourceChange={(s: DraftControlSource) => {
          if (preferLiveDraft) {
            setLiveDraftSource(normalizeLiveDraftSource(s));
          } else {
            const next = normalizeMockDraftSource(s);
            setMockDraftSource(next);
            if (next === "fantasypros") {
              setRunning(false);
            } else {
              setFpMockActive(false);
              void postFantasyProsMockDisarm().catch(() => {});
            }
          }
        }}
        sessionActions={
          allowInternalSimPicks
            ? {
                canStart: !running && !done && idx === 0,
                canResume: !running && !done && idx > 0,
                canPause: running,
                canReset: idx > 0,
                canNewDraft: idx > 0 || done,
                pickLabel: `Pick ${Math.min(idx, schedule.length)}/${schedule.length}`,
                onStart: () => setRunning(true),
                onResume: () => setRunning(true),
                onPause: () => setRunning(false),
                onReset: () => reset(),
                onNewDraft: () => newRandomDraft(),
              }
            : null
        }
      />

      {/* Secondary RFSN Local Mock chrome — pace / seed (actions live in control panel) */}
      {allowInternalSimPicks && (
      <div className="flex items-center gap-2 mb-3 flex-wrap" data-live-sim-controls>
        <span className="text-[11px] text-zinc-400 tabular-nums border border-zinc-700/80 rounded px-2 py-0.5" title="Draft randomization seed">
          Seed {formatDraftSeed(draftSeed)}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Pace</span>
          {PACE_OPTIONS.map((p) => (
            <button key={p.key} onClick={() => setPaceMs(p.ms)}
              className={cn("px-2 py-0.5 rounded text-[11px] font-bold",
                paceMs === p.ms ? "bg-violet-600/30 text-violet-200" : "text-zinc-500 hover:text-zinc-300 border border-white/[0.06]")}>
              {p.label}
            </button>
          ))}
        </div>
        {idx > 0 && (
          <button onClick={replayCurrentSeed} className="px-3 py-1.5 rounded text-zinc-400 text-xs hover:text-zinc-200 border border-zinc-600">Replay same seed</button>
        )}
        <span className="text-[11px] text-zinc-500 ml-auto">{manualTeamIds.size === 0 ? "Spectating — AI drafts everyone" : manualTeamIds.size >= teams.length ? "Fully manual — you pick every team" : `You control ${manualTeamIds.size} team${manualTeamIds.size > 1 ? "s" : ""}; AI drafts the rest`}</span>
      </div>
      )}

      {!preferLiveDraft && mockSource === "fantasypros" && (
        <FantasyProsMockControlPanel
          active={fpMockActive}
          status={fpMock}
          leagueLabel={String(leagueId ?? "League")}
          season={season}
          userOwnerPos={fpUserOwnerPos}
          teamCount={teams.length || 12}
          voiceEnabled={fpVoiceEnabled}
          commentaryEnabled={fpCommentaryEnabled}
          onStart={() => {
            setFpMockActive(true);
            setRunning(false);
          }}
          onStop={() => {
            setFpMockActive(false);
            void postFantasyProsMockDisarm().catch(() => {});
          }}
          onNewDraft={() => {
            setFpSessionEpoch((n) => n + 1);
            if (leagueId && boothDraftId) {
              void resetSession
                .mutateAsync({ leagueId: String(leagueId), draftId: boothDraftId })
                .catch(() => {});
            }
            void postFantasyProsMockArm({
              leagueId: String(leagueId ?? ""),
              season,
              forceNewSession: true,
            }).catch(() => {});
          }}
          onUserOwnerPosChange={setFpUserOwnerPos}
          onVoiceChange={setFpVoiceEnabled}
          onCommentaryChange={setFpCommentaryEnabled}
        />
      )}
      {!done && (
        <RfsnPickClock
          state={clockState}
          round={Number(slot?.round ?? 0)}
          overallPick={Number(slot?.pickNumber ?? 0)}
          totalPicks={schedule.length}
          onClockTeam={onClock?.teamName ?? "—"}
          onClockOwner={onClock?.ownerName}
          remainingMs={remainingMs}
          lastLockedPlayerName={lastLockedPlayerName}
          className="mb-3"
        />
      )}
      {liveDraftActive && (
        <LiveDraftRecentPicks
          picks={recentPicks}
          currentPickNumber={currentOverallPick}
        />
      )}
      {done && (
        <LiveDraftWrapUp
          teams={teams}
          draftGrades={draftGrades}
          rostersByTeam={rostersByTeam}
          teamCount={teams.length || 14}
          className="mb-3"
        />
      )}
      {done && (
        <div className="rounded-lg border border-violet-500/40 bg-violet-500/5 px-4 py-3 mb-3 text-center text-violet-300 font-black text-sm">
          ✓ Draft complete — {Object.keys(results).length} picks
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Available pool (sortable) */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-black text-zinc-200 uppercase tracking-wider">Available</span>
            <span className="text-[11px] text-zinc-500">{available.length} players</span>
            <div className="flex gap-1 ml-auto">
              {SORTS.map(([k, lbl]) => (
                <button key={k} onClick={() => setSort(k)} className={cn("px-2 py-0.5 rounded text-[11px] font-bold", sort === k ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200")}>{lbl}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-1 mb-2 flex-wrap">
            {POSES.map(p => (
              <button key={p} onClick={() => setPos(p)} className={cn("px-2 py-0.5 rounded text-[11px] font-bold", posFilter === p ? "bg-violet-600/30 text-violet-200" : "text-zinc-400 hover:text-zinc-200 border border-white/[0.06]")}>{p}</button>
            ))}
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search…" className="ml-auto text-[11px] bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-200 placeholder-zinc-600" />
          </div>
          <div className="rounded-lg border border-white/[0.06] divide-y divide-white/[0.06] max-h-[min(560px,calc(100dvh-14rem))] overflow-auto">
            {available.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-zinc-500 italic" data-live-pool-empty>
                {formatEligiblePool.length === 0
                  ? "Waiting for live draft activity"
                  : searchQ || (posFilter !== "ALL" && posFilter !== "OFFENSE")
                    ? "No players match this filter"
                    : "Waiting for live draft activity"}
              </p>
            ) : (
              available.slice(0, 120).map((p: any) => {
                const adpDisp = formatLiveDraftPoolAdp(p.adp);
                const valueVs = formatLiveDraftValueVsMarket(p.adp, currentOverallPick);
                const mvLabel = formatLiveDraftMarketValue(p.marketValue);
                return (
                  <button
                    key={keyOf(p)}
                    disabled={!awaitingUser}
                    onClick={() => allowInternalSimPicks && awaitingUser && userDraft(p)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-left",
                      awaitingUser ? "hover:bg-violet-500/10 cursor-pointer" : "cursor-default",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <PosPill pos={String(p.position ?? "?").toUpperCase()} />
                        <span className="text-xs font-bold text-zinc-100 truncate">{p.name}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                        <span className={adpDisp.isReal ? "text-zinc-300 tabular-nums" : "text-zinc-600"}>
                          {adpDisp.label}
                        </span>
                        <span className="tabular-nums">{mvLabel}</span>
                        {valueVs ? (
                          <span
                            className={cn(
                              "tabular-nums font-semibold",
                              valueVs.startsWith("+")
                                ? "text-emerald-400"
                                : valueVs.startsWith("-")
                                  ? "text-amber-400"
                                  : "text-zinc-400",
                            )}
                          >
                            {valueVs}
                          </span>
                        ) : null}
                        <span className="tabular-nums text-zinc-600">
                          {Math.round(p.projectedPoints ?? 0)} pts
                        </span>
                      </div>
                    </div>
                    {allowInternalSimPicks && awaitingUser && (
                      <span className="text-[10px] font-black text-violet-400 shrink-0">DRAFT</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          {done && (
            <DraftNightShow
              show={draftNightShow}
              analystRecap={analystRecap}
              className="mt-3"
            />
          )}
        </div>

        {/* Live team rosters + per-team manual control (Live / RFSN source only) */}
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-black text-zinc-200 uppercase tracking-wider">
              {preferLiveDraft ? "Your Teams" : "League Rosters"}
            </span>
            {allowInternalSimPicks && (
              <>
                <span className="text-[10px] text-zinc-500">
                  {manualTeamIds.size === 0
                    ? "Full AI draft"
                    : manualTeamIds.size >= teams.length
                      ? "Fully manual"
                      : `${manualTeamIds.size} manual`}
                </span>
                <button
                  onClick={resetTeamControls}
                  className="ml-auto text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded px-1.5 py-0.5"
                >
                  Reset team controls
                </button>
              </>
            )}
          </div>
          <div className="space-y-2 max-h-[min(560px,calc(100dvh-14rem))] overflow-auto pr-1">
            {teams.map((t: any) => {
              const tid = Number(t.teamId);
              const roster = (rostersByTeam.get(tid) ?? []).sort((a, b) => a.pickNumber - b.pickNumber);
              const grade = draftGrades.get(tid);
              const isOnClock = (preferLiveDraft || allowInternalSimPicks) && !done && slot && Number(slot.teamId) === tid;
              const isYou = myTeamId === tid;
              const isManual = allowInternalSimPicks && manualTeamIds.has(tid);
              return (
                <div key={tid} className={cn("rounded-lg border p-2", isOnClock ? "border-violet-500/50 bg-violet-500/5" : isManual ? "border-violet-500/30 bg-violet-500/5" : "border-white/[0.06] bg-white/[0.03]")}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {allowInternalSimPicks ? (
                    <input
                      type="checkbox"
                      checked={isManual}
                      onChange={() => toggleManual(tid)}
                      className="accent-violet-500 h-3.5 w-3.5 shrink-0 cursor-pointer"
                      aria-label={`Manually control ${t.teamName}`}
                      title="Manually control this team"
                    />
                    ) : null}
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

        {/* RFSN booth + audio — compact right rail, same live session as RFSN Live. */}
        {leagueId && (
          <aside className="lg:col-span-1 min-w-0">
            <RfsnBroadcastPanel
              leagueId={leagueId}
              draftId={boothDraftId}
              active={isRfsnWarRoomBroadcastActive({
                liveDraftActive,
                preferLiveDraft,
                fantasyProsSessionActive: fpSessionArmed,
                rfsnLocalMockSessionActive: allowInternalSimPicks && liveDraftActive,
              })}
              sessionResetKey={`${boothDraftId}:${scheduleSig}:${resetCounter}:${fpSessionEpoch}:${connectedLeagueLive ? "live" : fpMockActive ? "fp" : "sim"}`}
              draftPaused={
                fpSessionArmed
                  ? !fpVoiceEnabled
                  : !running && !connectedLeagueLive
              }
              onBusyChange={setBroadcastBusy}
            />
          </aside>
        )}
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
  picks, teams, availablePool, eligiblePool, positionCaps, keeperPredictions, rosterNeeds,
  onKeeperOverride, keeperOverrides, keepersEnabled = true,
  leagueId, draftId, season,
  preferLiveDraft = false,
}: {
  picks: any[]; teams: any[];
  /** Mock residual board (shared − mock drafted). */
  availablePool: any[];
  /** RFSN-017 — shared eligible universe for Live Draft (not mock residual). */
  eligiblePool: any[];
  positionCaps: Record<string, number> | null;
  keeperPredictions: any[];
  rosterNeeds: any[];
  onKeeperOverride: (overrides: KeeperOverride[]) => void;
  keeperOverrides: KeeperOverride[];
  keepersEnabled?: boolean;
  leagueId?: string | null;
  draftId: string;
  season: number;
  preferLiveDraft?: boolean;
}) {
  const [view, setView]           = useState<"board" | "team" | "live">(preferLiveDraft ? "live" : "live");
  const [selTeam, setSelTeam]     = useState<number | null>(null);
  const [expandPick, setExp]      = useState<number | null>(null);
  // Live simulation state
  const [liveIdx, setLiveIdx]   = useState(0);
  const [simState, setSimState] = useState<"idle" | "running" | "done">("idle");
  const [myPick, setMyPick]     = useState<null | { pickNumber: number; round: number }>(null);
  const [searchQ, setSearchQ]   = useState("");
  const simRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SPEED_MS = 500;

  useEffect(() => {
    // Both surfaces default into the operating workspace (Live engine / FP follow).
    setView("live");
    if (!preferLiveDraft && simRef.current) {
      clearTimeout(simRef.current);
      simRef.current = null;
      setSimState("idle");
    }
  }, [preferLiveDraft]);

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
        {(["live", "board", "team"] as const).map(v => (
          <button key={v} onClick={() => { setView(v); if (v === "live" && preferLiveDraft) resetSim(); }}
            className={cn("px-3 py-1.5 rounded text-xs font-bold transition-colors",
              view === v ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
            {v === "live"
              ? (preferLiveDraft ? "Live Draft" : "FantasyPros")
              : v === "board"
                ? "Draft Board"
                : "By Team"}
          </button>
        ))}

        {preferLiveDraft && keepersEnabled && (
        <button onClick={() => setShowKeeperSetup(s => !s)}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border transition-colors",
            showKeeperSetup ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-zinc-700 text-zinc-500 hover:text-zinc-300")}>
          🔑 Keeper Setup {keeperOverrides.length > 0 && <span className="bg-amber-500/30 px-1 rounded">{keeperOverrides.length}</span>}
        </button>
        )}

        {/* Your team selector — Live Draft workspace */}
        {preferLiveDraft && (
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] text-zinc-600">Your team:</span>
          <select className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
            value={yourTeamId ?? ""} onChange={e => setYourTeamId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Spectate —</option>
            {teams.map((t: any) => <option key={t.teamId} value={t.teamId}>{t.teamName}</option>)}
          </select>
        </div>
        )}

        {view === "team" && (
          <select className={cn("text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300", !preferLiveDraft && "ml-auto")}
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

      {/* Live Draft uses shared eligiblePool (RFSN-017) — not mock residual availablePool */}
      {view === "live" && (
        <LiveDraftEngine
          picks={picks}
          teams={teams}
          availablePool={eligiblePool.length > 0 ? eligiblePool : availablePool}
          positionCaps={positionCaps}
          leagueId={leagueId}
          draftId={draftId}
          season={season}
          preferLiveDraft={preferLiveDraft}
        />
      )}

      {/* Old playback live view (disabled) */}
      {false && view === "live" && !myPick && (
        <div>
          {simState === "idle" && liveIdx === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-4">
              <div className="text-5xl">⚡</div>
              <h3 className="font-black text-zinc-200 text-lg">Mock Draft Simulator</h3>
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


// DraftEnvironmentSection removed (RFSN-027A) — value/run timing lives in dwr-value / dwr-runs

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

const DWR_NAV_ITEMS: { id: string; label: string; keeperOnly?: boolean; liveLabel?: string; mockLabel?: string }[] = [
  { id: "dwr-briefing", label: "Briefing" },
  { id: "dwr-keepers", label: "Keepers", keeperOnly: true },
  { id: "dwr-build", label: "Roster Priorities" },
  { id: "dwr-dna", label: "Owner DNA" },
  { id: "dwr-runs", label: "Run Windows" },
  { id: "dwr-value", label: "Value Windows" },
  { id: "dwr-compression", label: "Compression", keeperOnly: true },
  { id: "dwr-trades", label: "Trade Signals" },
  { id: "dwr-mock", label: "Draft Board", liveLabel: "Live Draft", mockLabel: "Mock Draft" },
];

function DwrSectionNav({
  keepersOn,
  preferLiveDraft,
  onOpenSection,
}: {
  keepersOn: boolean;
  preferLiveDraft: boolean;
  onOpenSection: (sectionId: string) => void;
}) {
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
              onClick={() => openAndScrollTo(onOpenSection, item.id)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            >
              {preferLiveDraft
                ? (item.liveLabel ?? item.label)
                : (item.mockLabel ?? item.label)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function DraftWarRoom({
  scrollToSection,
  preferLiveDraft = false,
  /** RFSN Live ops center — Live Draft controls first; hide War Room analytics chrome. */
  liveOpsOnly = false,
}: {
  scrollToSection?: string;
  preferLiveDraft?: boolean;
  liveOpsOnly?: boolean;
} = {}) {
  const forceLive = preferLiveDraft || liveOpsOnly;
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { leagueContextKey } = useLeagueActiveGate();
  const { season } = useLeagueContext();
  const [keeperOverrides, setKeeperOverrides] = useState<any[]>([]);
  const [expandToken, setExpandToken] = useState<DwrExpandToken | null>(null);
  const openSection = useCallback((id: string) => {
    setExpandToken({ id, n: Date.now() });
  }, []);
  const handleOpenSection = useCallback((id: string) => {
    openAndScrollTo(openSection, id);
  }, [openSection]);
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
  const activeLeagueQ = trpc.league.getActive.useQuery(undefined, { enabled: leagueKeyReady });
  const leagueId = leagueKeyReady && activeLeagueQ.data?.leagueId
    ? String(activeLeagueQ.data.leagueId)
    : null;
  const rfsnLiveDraftId = buildRfsnLiveDraftId(season);
  const soulsQ = { data: null as any, isLoading: false };
  void soulsQ;

  // Canonical `/draft/mock` shares this instance via layout — expand + scroll after data mounts.
  useEffect(() => {
    if (!scrollToSection || isLoading || !data?.ok) return;
    const t = window.setTimeout(() => openAndScrollTo(openSection, scrollToSection), 120);
    return () => window.clearTimeout(t);
  }, [scrollToSection, isLoading, data?.ok, openSection]);

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
          keeperCompression, scarcityAlerts, positionRunAlerts,
          mockDraft, availablePool, eligiblePool, teamCount, totalPicks, draftBoardSummary, leagueCapabilities } = data;
  const sharedEligiblePool = Array.isArray(eligiblePool) && eligiblePool.length > 0
    ? eligiblePool
    : (availablePool ?? []);
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

  const liveOrMockBoard = (
    <>
      <p className="mb-3 text-xs text-zinc-500" data-draft-surface-blurb>
        {forceLive
          ? "Choose a draft source, start or connect, then run the board. The RFSN booth is one section of this workspace."
          : "Connect RFSN to an external simulated draft."}
        {" "}
        {forceLive ? (
          <Link to="/draft/mock" className="text-sky-400 underline underline-offset-2 font-semibold">
            Switch to Mock Draft
          </Link>
        ) : (
          <Link to="/draft/live" className="text-sky-400 underline underline-offset-2 font-semibold">
            Switch to Live Draft
          </Link>
        )}
      </p>
      <MockDraftBoard
        picks={mockDraft ?? []}
        teams={(rosterNeeds ?? []).map((n: any) => ({ teamId: n.teamId, teamName: n.teamName, ownerName: n.ownerName }))}
        availablePool={data?.availablePool ?? []}
        eligiblePool={sharedEligiblePool}
        positionCaps={data?.positionCaps ?? null}
        keeperPredictions={keeperPredictions ?? []}
        rosterNeeds={rosterNeeds ?? []}
        keeperOverrides={keeperOverrides}
        keepersEnabled={keepersOn}
        leagueId={leagueId}
        draftId={rfsnLiveDraftId}
        season={season}
        preferLiveDraft={forceLive}
        onKeeperOverride={(overrides) => {
          setKeeperOverrides(overrides);
        }}
      />
    </>
  );

  /* /rfsn/live — operational control center (no War Room analytics chrome) */
  if (liveOpsOnly) {
    return (
      <DwrExpandContext.Provider value={{ expandToken, openSection }}>
        <div
          className="min-h-full text-zinc-100"
          data-live-draft-ops-page
          style={{
            background:
              "radial-gradient(circle at 85% -10%,rgba(163,230,53,.05),transparent 45%),linear-gradient(180deg,#0c1218,#080b10)",
          }}
        >
          <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">Live Draft</h1>
              <p className="mt-1 text-xs text-zinc-500 max-w-xl">
                Control center — pick RFSN Draft or Connected League, start or connect, pause/resume,
                and see what is driving the board. Broadcast booth stays on the board rail.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {headerChips.slice(0, 2).map((s) => (
                <div
                  key={s.l}
                  className="text-center px-3 py-2 rounded-xl bg-black/30 border border-white/[0.07]"
                >
                  <div className="text-lg font-black text-white">{s.v}</div>
                  <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{s.l}</div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => refetch()}
                className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label="Refresh draft data"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div data-live-draft-ops-board>{liveOrMockBoard}</div>
        </div>
      </DwrExpandContext.Provider>
    );
  }

  return (
    <DwrExpandContext.Provider value={{ expandToken, openSection }}>
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
              <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-600 ml-1">{season} · v{APP_VERSION}</span>
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

        {/* Live Draft first when landing from /draft/live */}
        {forceLive && (
          <Section
            id="dwr-mock"
            title="LIVE DRAFT"
            icon={Target}
            badge={totalPicks}
            defaultOpen={true}
          >
            {liveOrMockBoard}
          </Section>
        )}

        {/* 1. Draft Briefing — scan layer only (RFSN-027A) */}
        <Section id="dwr-briefing" title="Draft Briefing" icon={ShieldCheck}
          accent="border-amber-500/20 bg-white/[0.03]" defaultOpen={!forceLive}>
          <ConfidenceDashboard
            data={confidenceDashboard}
            showKeeperInsights={keepersOn}
            onOpenSection={handleOpenSection}
            positionRunAlerts={positionRunAlerts ?? []}
            scarcityAlerts={scarcityAlerts ?? []}
          />
        </Section>

        {/* Prep desk — Command Board / Upcoming / Reality Mode (no duplicate intel) */}
        <DraftWarRoomDesk data={data} />

        {/* Detailed analytics divider + section nav */}
        <div className="flex items-center gap-3 pt-1">
          <div className="h-px flex-1 bg-white/[0.08]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600">Detailed Analytics</span>
          <div className="h-px flex-1 bg-white/[0.08]" />
        </div>

        <DwrSectionNav keepersOn={keepersOn} preferLiveDraft={forceLive} onOpenSection={openSection} />

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

        {/* 2. Keeper Predictions */}
        {keepersOn && (
        <Section id="dwr-keepers" title="Keeper predictions" icon={Trophy} badge={keeperPredictions?.length}>
          <KeeperSection predictions={keeperPredictions ?? []} />
        </Section>
        )}

        {/* 3. Roster Priorities */}
        <Section id="dwr-build" title="Roster Priorities" icon={BarChart2} badge={rosterNeeds?.length}>
          <RosterNeedsSection needs={rosterNeeds ?? []} />
        </Section>

        {/* 4. Owner DNA */}
        <Section id="dwr-dna" title="Owner DNA Map" icon={Activity} badge={shockMeters?.length}>
          <ShockMeterSection meters={shockMeters ?? []} />
        </Section>

        {/* 5. Position Run Windows — position timing home */}
        <Section id="dwr-runs" title="Position Run Windows" icon={Flame} badge={positionRunAlerts?.length ?? 0}>
          <RunAlertsSection alerts={positionRunAlerts ?? []} />
        </Section>

        {/* 6. Value Windows — position timing home */}
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

        {/* 10. Live / Mock Draft board — only when not already shown first */}
        {!forceLive && (
        <Section
          id="dwr-mock"
          title="MOCK DRAFT"
          icon={Target}
          badge={totalPicks}
          defaultOpen={true}
        >
          {liveOrMockBoard}
        </Section>
        )}

      </div>
    </div>
    </DwrExpandContext.Provider>
  );
}