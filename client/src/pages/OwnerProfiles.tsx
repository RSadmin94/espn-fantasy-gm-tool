import { useState, useMemo, Fragment, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { ownerKeysEqual, resolveDirectoryOwnerKey, rivalsOwnerDossierPath } from "@/lib/ownerIdentity";
import {
  buildSelfIdentityTendencies,
  isSelfMode,
  matchupTagLabel,
  ownerProfilesLensCopy,
  type OwnerProfilesMode,
} from "@/lib/ownerProfilesLens";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Trophy,
  Users,
  Zap,
  FileText,
  Skull,
  Swords,
  GitCompare,
  Gauge,
  Dna,
  Shield,
  Activity,
  Info,
  Crosshair,
  Ban,
  Award,
  ScrollText,
  History,
  Clapperboard,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { displayOwnerName } from "@/lib/ownerName";
import type { CSSProperties, ReactNode } from "react";
import {
  CinematicPageHeader,
  IntelPageShell,
  IntelPanel,
  PageError,
  PageLoading,
  SectionLoading,
  EmptyState,
} from "@/components/layout";
import { RivalryDossierPanel, type RivalryPickerOption } from "@/components/RivalryDossierPanel";
import { ActivityDnaCard } from "@/components/ActivityDnaCard";
import { buildDefaultRivalryEligibleOwnerKeys } from "@/lib/rivalryOwnerEligibility";
import { setLastFreeFeature } from "@/lib/lastFreeFeature";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(n: number) { return `${Number(n ?? 0).toFixed(1)}%`; }
function num(v: unknown)  { return Number(v ?? 0); }
function str(v: unknown)  { return String(v ?? "—"); }

function Badge({ children, color = "default" }: { children: ReactNode; color?: "gold" | "silver" | "bronze" | "default" }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded border px-1.5 py-0.5 text-[12px] font-semibold",
      color === "gold"    && "border-amber-500/40 bg-amber-500/10 text-amber-200",
      color === "silver"  && "border-slate-500/40  bg-slate-500/10  text-slate-200",
      color === "bronze"  && "border-orange-600/40 bg-orange-500/10 text-orange-200",
      color === "default" && "border-white/[0.1] bg-white/[0.04] text-zinc-300",
    )}>
      {children}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/[0.06] py-2 last:border-0 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-right text-zinc-100">{value}</span>
    </div>
  );
}

function ProfileShellCard({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <IntelPanel variant="warm" className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight text-[#f3f8ff]">
          {title}
          <Info className="h-3.5 w-3.5 text-[#8b97a8]" aria-hidden />
        </h3>
        {right}
      </div>
      <div className="px-4 py-4">{children}</div>
    </IntelPanel>
  );
}

function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <IntelPanel variant="warm" className="overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-colors hover:bg-white/[0.04]">
        <span className="text-[#a3e635]">{icon}</span>
        <span className="text-[15px] font-extrabold tracking-tight text-[#f3f8ff] flex-1">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </IntelPanel>
  );
}

function formatTradeProcessedDate(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function tradeAssetLabels(side: { assetsReceived?: { displayLabel?: string }[] } | null | undefined): string[] {
  const assets = Array.isArray(side?.assetsReceived) ? side.assetsReceived : [];
  return assets.map((a) => String(a.displayLabel ?? "").trim()).filter(Boolean);
}

function tradeOpponentName(trade: {
  sideA: { ownerName?: string; teamId?: number };
  sideB: { ownerName?: string; teamId?: number };
}, ownerSide: "A" | "B"): string {
  return ownerSide === "A"
    ? String(trade.sideB.ownerName ?? "Trade partner")
    : String(trade.sideA.ownerName ?? "Trade partner");
}

function tradeResultClasses(result: string): string {
  if (result === "win") return "border-lime-500/30 bg-lime-500/10 text-lime-300";
  if (result === "loss") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-white/[0.1] bg-white/[0.04] text-zinc-300";
}

function OwnerTradeHistoryCard({
  profileLookupKey,
  leagueContextKey,
  leagueKeyReady,
  dossierActiveSeason,
  mode = "scout",
}: {
  profileLookupKey: string;
  leagueContextKey: string;
  leagueKeyReady: boolean;
  dossierActiveSeason: number;
  mode?: OwnerProfilesMode;
}) {
  const lens = ownerProfilesLensCopy(mode);
  const tradeQ = (trpc as any).completedTradeIntel.ownerTradeHistory.useQuery(
    withLeagueSalt(
      {
        leagueId: leagueContextKey,
        season: dossierActiveSeason,
        ownerKey: profileLookupKey,
      },
      leagueContextKey,
    ),
    {
      enabled: leagueKeyReady && !!profileLookupKey.trim(),
      staleTime: 60_000,
    },
  );

  const hist = tradeQ.data;

  return (
    <ProfileShellCard
      title="Trade History"
      right={
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {dossierActiveSeason} season
        </span>
      }
    >
      {tradeQ.isLoading ? (
        <SectionLoading message="Loading trade history…" size="sm" />
      ) : tradeQ.isError ? (
        <p className="text-sm text-red-300">Could not load trade history.</p>
      ) : !hist || hist.tradeCount === 0 ? (
        <EmptyState
          panelVariant="warm"
          className="p-6"
          title={lens.tradeHistoryEmpty}
          description="Completed trades become part of your permanent league history. They will appear here after league sync."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Trade record</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-zinc-100">
                {hist.wins}–{hist.losses}{hist.ties > 0 ? `–${hist.ties}` : ""}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{hist.tradeCount} completed trade{hist.tradeCount === 1 ? "" : "s"}</div>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Net value</div>
              <div
                className={cn(
                  "mt-1 text-lg font-bold tabular-nums",
                  hist.netValue > 0 ? "text-lime-300" : hist.netValue < 0 ? "text-red-300" : "text-zinc-200",
                )}
              >
                {hist.netValue > 0 ? "+" : ""}
                {hist.netValue}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Pick {hist.pickOnlyCount} · Player {hist.playerOnlyCount} · Mixed {hist.mixedCount}
              </div>
            </div>
          </div>

          {(hist.biggestWin || hist.biggestLoss) && (
            <div className="space-y-2 text-sm">
              {hist.biggestWin && (
                <div className="rounded-lg border border-lime-500/20 bg-lime-500/5 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-lime-400/90">Biggest win</div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                    +{Math.round(hist.biggestWin.margin)} value vs{" "}
                    {tradeOpponentName(hist.biggestWin, hist.biggestWin.sideA.ownerKey === profileLookupKey ? "A" : "B")}
                  </p>
                </div>
              )}
              {hist.biggestLoss && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-red-400/90">Biggest loss</div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                    −{Math.round(hist.biggestLoss.margin)} value vs{" "}
                    {tradeOpponentName(hist.biggestLoss, hist.biggestLoss.sideA.ownerKey === profileLookupKey ? "A" : "B")}
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Recent completed trades</p>
            <div className="space-y-2">
              {(hist.recentTrades ?? hist.trades ?? []).map((entry: any) => {
                const trade = entry.trade;
                const ownerSide = entry.ownerSide as "A" | "B";
                const mine = ownerSide === "A" ? trade.sideA : trade.sideB;
                const opp = ownerSide === "A" ? trade.sideB : trade.sideA;
                const received = tradeAssetLabels(mine);
                const sent = tradeAssetLabels(opp);
                return (
                  <div
                    key={trade.clusterId ?? trade.tradeId}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-zinc-100">
                        {trade.season} · {formatTradeProcessedDate(trade.processedDate)}
                      </div>
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          tradeResultClasses(entry.result),
                        )}
                      >
                        {entry.result === "win" ? "Win" : entry.result === "loss" ? "Loss" : "Even"}
                      </span>
                    </div>
                    <div className="mt-1 text-zinc-400">vs {tradeOpponentName(trade, ownerSide)}</div>
                    <div className="mt-2 space-y-1 text-zinc-300">
                      <div>
                        <span className="font-semibold text-zinc-400">Received:</span>{" "}
                        {received.length ? received.join(", ") : "—"}
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-400">Sent:</span>{" "}
                        {sent.length ? sent.join(", ") : "—"}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                      <span>
                        Margin:{" "}
                        <span className="font-semibold tabular-nums text-zinc-300">
                          {entry.netReceived > 0 ? "+" : ""}
                          {Math.round(entry.netReceived)}
                        </span>
                      </span>
                      {trade.verdictLabel ? (
                        <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-zinc-400">
                          {trade.verdictLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </ProfileShellCard>
  );
}

// ─── Matchup tag styling ──────────────────────────────────────────────────────

const TAG_STYLES: Record<string, string> = {
  "Nemesis":      "border-red-700 bg-red-900/30 text-red-300",
  "Punching Bag": "border-lime-700 bg-lime-900/30 text-lime-300",
  "Rival":        "border-amber-700 bg-amber-900/30 text-amber-300",
  "Favorable":    "border-violet-700 bg-violet-900/30 text-violet-300",
  "Difficult":    "border-orange-700 bg-orange-900/30 text-orange-300",
  "Normal":       "border-border bg-muted/30 text-muted-foreground",
  // Self-lens remapped labels (style keyed by display when needed)
  "Primary Rival": "border-red-700 bg-red-900/30 text-red-300",
  "Comfort Matchup": "border-lime-700 bg-lime-900/30 text-lime-300",
  "Favorable Matchup": "border-violet-700 bg-violet-900/30 text-violet-300",
  "Difficult Matchup": "border-orange-700 bg-orange-900/30 text-orange-300",
};

const POS_TEXT: Record<string, string> = {
  RB: "text-red-400",
  WR: "text-violet-400",
  QB: "text-lime-400",
  TE: "text-purple-400",
  K: "text-orange-400",
  DEF: "text-zinc-400",
  DST: "text-zinc-400",
};

const POS_BAR: Record<string, string> = {
  RB: "bg-red-500",
  WR: "bg-violet-500",
  QB: "bg-lime-500",
  TE: "bg-purple-500",
  K: "bg-orange-500",
  DEF: "bg-zinc-500",
  DST: "bg-zinc-500",
};

const EARLY_CONIC: Record<string, string> = {
  RB: "#ef4444",
  WR: "#8b5cf6",
  QB: "#a3e635",
  TE: "#a855f7",
  K: "#f97316",
  DEF: "#71717a",
  DST: "#71717a",
};

function MatchupTag({ tag, mode = "scout" }: { tag: string; mode?: OwnerProfilesMode }) {
  const label = matchupTagLabel(tag, mode);
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", TAG_STYLES[tag] ?? TAG_STYLES.Normal)}>
      {label}
    </span>
  );
}

// ─── Owner card ───────────────────────────────────────────────────────────────

function ScoutingLock({ title, blurb, onUnlock, pending }: { title: string; blurb: string; onUnlock: () => void; pending: boolean }) {
  return (
    <div className="rounded-2xl border border-[#a3e635]/30 bg-[#a3e635]/[0.05] p-6 text-center sm:p-8">
      <Crosshair className="mx-auto mb-3 h-8 w-8 text-[#a3e635]" aria-hidden />
      <h3 className="text-xl font-black tracking-tight text-zinc-50 sm:text-2xl">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-400">{blurb}</p>
      <p className="mx-auto mt-3 max-w-md text-[11px] uppercase tracking-[0.14em] text-zinc-500">
        Draft tendencies - Keeper strategy - Activity DNA - Matchup intel - Scouting report - Owner comparison
      </p>
      <button type="button" onClick={onUnlock} disabled={pending}
        className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-[#a3e635] px-6 py-3 text-sm font-extrabold text-[#1e1623] transition-opacity disabled:opacity-60">
        {pending ? "Opening..." : "Unlock the Scouting Report"} <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function OwnerCard({ o, selected, onClick, onLockedClick }: { o: any; selected: boolean; onClick: () => void; onLockedClick?: () => void }) {
  const isLocked = Boolean(o.locked);
  const isPreview = Boolean(o.preview);
  return (
    <button
      type="button"
      onClick={isLocked ? onLockedClick ?? onClick : onClick}
      className="w-full text-left"
    >
      <IntelPanel
        variant="warm"
        className={cn(
          "px-4 py-3 transition-all",
          selected
            ? "border-[#a3e635]/50 ring-1 ring-[#a3e635]/25 shadow-[0_0_24px_-10px_rgba(139,92,246,0.35)]"
            : "hover:border-[#a3e635]/25 hover:bg-white/[0.03]",
          isLocked && "opacity-80",
        )}
      >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-sm text-[#f3f8ff]">{o.ownerName}</p>
          {!isLocked && o.currentTeam ? (
            <p className="text-xs text-[#8b97a8] mt-0.5">{o.currentTeam}</p>
          ) : null}
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {isLocked ? (
            <Badge color="silver">Locked</Badge>
          ) : (
            <>
              {num(o.championships) > 0 && <Badge color="gold">🏆 {num(o.championships)}</Badge>}
              {num(o.runnerUps) > 0 && <Badge color="silver">🥈 {num(o.runnerUps)}</Badge>}
            </>
          )}
        </div>
      </div>
      {!isLocked ? (
        <div className="mt-2 flex gap-3 text-xs text-zinc-500">
          {!isPreview && (
            <>
              <span>{num(o.totalWins)}–{num(o.totalLosses)}</span>
              <span>{pct(num(o.winPct))} win</span>
            </>
          )}
          <span>{Array.isArray(o.seasons) ? o.seasons.length : 0} season{(Array.isArray(o.seasons) ? o.seasons.length : 0) !== 1 ? "s" : ""}</span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Unlock Rivals Pro to scout this manager.</p>
      )}
      </IntelPanel>
    </button>
  );
}

function medalScore(snap: Record<string, unknown>) {
  return (
    num(snap.championships) * 10000 +
    num(snap.runnerUps) * 100 +
    num(snap.thirdPlace)
  );
}

function topDraftedPosCount(draft: Record<string, unknown>) {
  const tops = Array.isArray(draft.mostDraftedPos) ? (draft.mostDraftedPos as string[]) : [];
  const top = tops[0];
  if (!top) return { label: "—", count: 0 };
  const share = num((draft.posShare as Record<string, number> | undefined)?.[top]);
  const tp = num(draft.totalPicks);
  const count = Math.round((tp * share) / 100);
  return { label: `${top} (${count})`, count };
}

function cmp3(a: number, b: number): "left" | "right" | "tie" {
  if (a > b) return "left";
  if (b > a) return "right";
  return "tie";
}

function CompareCell({ tone, children }: { tone: "win" | "lose" | "tie"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm tabular-nums",
        tone === "win" && "border-lime-500/30 bg-lime-500/10 text-zinc-100",
        tone === "lose" && "border-white/[0.06] bg-white/[0.02] text-zinc-500",
        tone === "tie" && "border-white/[0.08] bg-white/[0.03] text-zinc-200",
      )}
    >
      {children}
    </div>
  );
}

function rowTones(w: "left" | "right" | "tie"): { left: "win" | "lose" | "tie"; right: "win" | "lose" | "tie" } {
  if (w === "tie") return { left: "tie", right: "tie" };
  if (w === "left") return { left: "win", right: "lose" };
  return { left: "lose", right: "win" };
}

function cmpRankLowerWins(a: number, b: number): "left" | "right" | "tie" {
  const ar = a >= 999 ? Infinity : a;
  const br = b >= 999 ? Infinity : b;
  if (ar < br) return "left";
  if (br < ar) return "right";
  return "tie";
}

/** Stable id for ownerList rows: canonical `ownerKey` when present, else display name. */
function listRowLookupKey(o: { ownerKey?: string; ownerName?: string } | null | undefined): string {
  const k = typeof o?.ownerKey === "string" ? o.ownerKey.trim() : "";
  if (k) return k;
  return String(o?.ownerName ?? "").trim();
}

// ─── Dynasty Identity badge ───────────────────────────────────────────────────
// Presentational only. The badge identity (key/label/icon/explanation) and the
// Now/Later percentiles are consumed verbatim from the dynasty.powerRankings
// payload — NO recompute, NO classification logic here. The maps below are pure
// cosmetics (accent + axis colors), matched to the Power Rankings page.
const DYN_BADGE_ACCENT: Record<string, string> = {
  built_to_last: "#34d399",
  win_now_window: "#f5c518",
  rising_empire: "#8b5cf6",
  crossroads: "#94a3b8",
  ground_floor: "#f7902f",
};
const DYN_NOW_COLOR = "#a3e635"; // lime — win-now axis
const DYN_LATER_COLOR = "#38bdf8"; // sky — long-term axis

type DynastyIdentityRow = {
  ownerKey: string;
  badge: { key: string; label: string; icon: string; explanation: string };
  nowPct: number;
  laterPct: number;
};

function DynastyIdentityStrip({ row }: { row: DynastyIdentityRow | null | undefined }) {
  if (!row || !row.badge) return null; // no matching ownerKey → render nothing
  const accent = DYN_BADGE_ACCENT[row.badge.key] ?? "#94a3b8";
  const bar = (label: string, value: number, color: string) => (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, num(value)))}%`, background: color }} />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-zinc-400">{Math.round(num(value))}</span>
    </div>
  );
  return (
    <div className="border-t border-white/[0.06] px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-start gap-3 sm:flex-1">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl"
            style={{ background: `color-mix(in oklch, ${accent} 16%, transparent)`, border: `1px solid color-mix(in oklch, ${accent} 45%, transparent)` }}
            aria-hidden
          >
            {row.badge.icon}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Dynasty Identity</div>
            <div className="text-sm font-bold tracking-tight" style={{ color: accent }}>{row.badge.label}</div>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{row.badge.explanation}</p>
          </div>
        </div>
        <div className="w-full space-y-1.5 sm:w-64 sm:shrink-0">
          {bar("Now", row.nowPct, DYN_NOW_COLOR)}
          {bar("Later", row.laterPct, DYN_LATER_COLOR)}
        </div>
      </div>
    </div>
  );
}

type CareerTimelineEvent = { season: number; label: string; detail: string; sortKey: number };

function buildCareerTimelineEvents(
  champSeasons: number[],
  runnerUpSeasons: number[],
  thirdSeasons: number[],
  seasonRecords: any[],
  tradeHist?: { biggestWin?: any; biggestLoss?: any } | null,
): CareerTimelineEvent[] {
  const events: CareerTimelineEvent[] = [];
  for (const s of champSeasons) {
    events.push({ season: s, label: "Championship", detail: `Title · ${s}`, sortKey: s * 100 });
  }
  for (const s of runnerUpSeasons) {
    events.push({ season: s, label: "Finals", detail: `Runner-up · ${s}`, sortKey: s * 100 + 1 });
  }
  for (const s of thirdSeasons) {
    events.push({ season: s, label: "Podium", detail: `3rd place · ${s}`, sortKey: s * 100 + 2 });
  }
  if (tradeHist?.biggestWin) {
    const t = tradeHist.biggestWin;
    const season = Number(t.season) || 0;
    events.push({
      season,
      label: "Major trade",
      detail: `Biggest win · +${Math.round(num(t.margin))} value`,
      sortKey: season * 100 + 3,
    });
  }
  if (tradeHist?.biggestLoss) {
    const t = tradeHist.biggestLoss;
    const season = Number(t.season) || 0;
    events.push({
      season,
      label: "Major trade",
      detail: `Biggest loss · −${Math.round(num(t.margin))} value`,
      sortKey: season * 100 + 4,
    });
  }
  for (const sr of seasonRecords) {
    const season = Number(sr.season);
    if (!season) continue;
    if (sr.isChampion || sr.isRunnerUp || sr.isThirdPlace) continue;
    events.push({
      season,
      label: "Season",
      detail: `${sr.wins}–${sr.losses}${num(sr.ties) ? `–${num(sr.ties)}` : ""} · ${str(sr.teamName)}`,
      sortKey: season * 100 + 5,
    });
  }
  return events.sort((a, b) => a.sortKey - b.sortKey);
}

function resolveOpponentOwnerKey(name: string, pickers: RivalryPickerOption[]): string {
  const n = name.trim().toLowerCase();
  const hit = pickers.find((p) => p.label.trim().toLowerCase() === n);
  return hit?.ownerKey ?? "";
}

function pickRivalryHighlights(intel: any[]) {
  if (!intel.length) return { topRival: null as any, biggestThreat: null as any };
  const byGames = [...intel].sort((a, b) => num(b.games) - num(a.games));
  const nemesis = intel.filter((r) => r.tag === "Nemesis").sort((a, b) => num(b.games) - num(a.games))[0];
  const rival = intel.find((r) => r.tag === "Rival");
  const topRival = nemesis ?? rival ?? byGames[0] ?? null;
  const biggestThreat =
    nemesis ??
    [...intel].filter((r) => num(r.games) >= 3).sort((a, b) => num(a.winPct) - num(b.winPct))[0] ??
    null;
  return { topRival, biggestThreat };
}

function DossierSectionHeader({
  icon,
  title,
  accent = "#a3e635",
}: {
  icon: ReactNode;
  title: string;
  accent?: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
      <span style={{ color: accent }}>{icon}</span>
      {title}
    </div>
  );
}

function dossierNavItems(mode: OwnerProfilesMode) {
  const copy = ownerProfilesLensCopy(mode);
  return [
    { id: "dossier-summary", label: "Summary" },
    { id: "dossier-gm", label: copy.navGm },
    { id: "dossier-building", label: copy.navBuilding },
    { id: "dossier-trading", label: copy.navTrading },
    { id: "dossier-matchups", label: copy.navMatchups },
    { id: "dossier-rivalries", label: copy.navRivalries },
    { id: "dossier-highlights", label: copy.navHighlights },
  ] as const;
}

function dossierScrollTo(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function DossierSectionNav({ mode }: { mode: OwnerProfilesMode }) {
  const items = dossierNavItems(mode);
  return (
    <nav
      aria-label={mode === "self" ? "My GM sections" : "Dossier sections"}
      className="sticky top-16 z-10 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#110c14]/95 px-2 py-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md"
    >
      <ul className="flex min-w-max gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => dossierScrollTo(item.id)}
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

function CompareOwnersPanel({
  compareWith,
  headerDisplayName,
  profileLookupKey,
  powerRankings,
  ownerAwards,
  peer,
  isLoadingComparison,
  snap,
  snapP,
  draft,
  draftP,
  keeper,
  keeperP,
  activity,
  activityP,
  h2h,
}: {
  compareWith: string;
  headerDisplayName: string;
  profileLookupKey: string;
  powerRankings: any[];
  ownerAwards: any[];
  peer: Record<string, unknown> | null | undefined;
  isLoadingComparison: boolean;
  snap: Record<string, unknown>;
  snapP: Record<string, unknown>;
  draft: Record<string, unknown>;
  draftP: Record<string, unknown>;
  keeper: Record<string, unknown>;
  keeperP: Record<string, unknown>;
  activity: Record<string, unknown>;
  activityP: Record<string, unknown>;
  h2h: { games: number; winsForOwner: number; lossesForOwner: number; ties?: number } | null | undefined;
}) {
  if (!compareWith) return null;

  return (
    <IntelPanel id="dossier-compare" variant="warm" className="scroll-mt-24 overflow-hidden p-4 sm:p-5">
      <DossierSectionHeader icon={<GitCompare className="h-4 w-4" />} title={`Compare · ${headerDisplayName} vs ${compareWith}`} accent="#c4b5fd" />
      {compareWith && !peer && isLoadingComparison ? (
        <SectionLoading message="Loading comparison…" className="justify-center py-10 text-zinc-500" />
      ) : peer ? (
        <div className="overflow-x-auto p-4">
          <div className="grid min-w-[300px] grid-cols-[minmax(7.5rem,1fr)_1fr_1fr] gap-x-2 gap-y-1">
            <div className="py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Metric</div>
            <div
              className="truncate py-2 text-[10px] font-semibold uppercase tracking-wide text-lime-400/90"
              title={headerDisplayName}
            >
              {headerDisplayName}
            </div>
            <div
              className="truncate py-2 text-[10px] font-semibold uppercase tracking-wide text-amber-400/90"
              title={compareWith}
            >
              {compareWith}
            </div>

            {(() => {
              const prL = powerRankings.find((r: any) => listRowLookupKey(r) === profileLookupKey);
              const prR = powerRankings.find((r: any) => r.ownerName === compareWith);
              const rankL = prL ? num(prL.rank) : 999;
              const rankR = prR ? num(prR.rank) : 999;
              const awardsL = ownerAwards.filter((a: any) => listRowLookupKey(a) === profileLookupKey).length;
              const awardsR = ownerAwards.filter((a: any) => a.ownerName === compareWith).length;
              const topL = topDraftedPosCount(draft);
              const topR = topDraftedPosCount(draftP);

              const rows: Array<{
                label: string;
                l: ReactNode;
                r: ReactNode;
                w: "left" | "right" | "tie";
              }> = [
                {
                  label: "Power rank #",
                  l: rankL >= 999 ? "—" : `#${rankL}`,
                  r: rankR >= 999 ? "—" : `#${rankR}`,
                  w: cmpRankLowerWins(rankL, rankR),
                },
                { label: "Owner awards", l: awardsL, r: awardsR, w: cmp3(awardsL, awardsR) },
                {
                  label: "Career record",
                  l: `${num(snap.totalWins)}–${num(snap.totalLosses)}${num(snap.totalTies) ? `–${num(snap.totalTies)}` : ""}`,
                  r: `${num(snapP.totalWins)}–${num(snapP.totalLosses)}${num(snapP.totalTies) ? `–${num(snapP.totalTies)}` : ""}`,
                  w: cmp3(num(snap.winPct), num(snapP.winPct)),
                },
                { label: "Win %", l: pct(num(snap.winPct)), r: pct(num(snapP.winPct)), w: cmp3(num(snap.winPct), num(snapP.winPct)) },
                {
                  label: "Medals (🏆 / 🥈+🥉)",
                  l: `${num(snap.championships)} / ${num(snap.runnerUps) + num(snap.thirdPlace)}`,
                  r: `${num(snapP.championships)} / ${num(snapP.runnerUps) + num(snapP.thirdPlace)}`,
                  w: cmp3(medalScore(snap), medalScore(snapP)),
                },
                { label: "Open-draft picks", l: num(draft.totalPicks), r: num(draftP.totalPicks), w: cmp3(num(draft.totalPicks), num(draftP.totalPicks)) },
                { label: "Most drafted (pos)", l: topL.label, r: topR.label, w: cmp3(topL.count, topR.count) },
                { label: "Keeper slot rate", l: pct(num(keeper.keeperRate)), r: pct(num(keeperP.keeperRate)), w: cmp3(num(keeper.keeperRate), num(keeperP.keeperRate)) },
                { label: "Acquisitions", l: num(activity.totalAcq), r: num(activityP.totalAcq), w: cmp3(num(activity.totalAcq), num(activityP.totalAcq)) },
                { label: "Trades", l: num(activity.totalTrades), r: num(activityP.totalTrades), w: cmp3(num(activity.totalTrades), num(activityP.totalTrades)) },
                { label: "Drops", l: num(activity.totalDrops), r: num(activityP.totalDrops), w: cmp3(num(activity.totalDrops), num(activityP.totalDrops)) },
              ];

              if (h2h && h2h.games > 0) {
                rows.push({
                  label: "Head-to-head",
                  l: `${h2h.winsForOwner}–${h2h.lossesForOwner}${h2h.ties ? `–${h2h.ties}` : ""} (you)`,
                  r: `${h2h.lossesForOwner}–${h2h.winsForOwner}${h2h.ties ? `–${h2h.ties}` : ""} (them)`,
                  w: cmp3(h2h.winsForOwner, h2h.lossesForOwner),
                });
              }

              return rows.map((row) => {
                const tones = rowTones(row.w);
                return (
                  <Fragment key={row.label}>
                    <div className="flex items-center border-b border-white/[0.06] py-2 pr-1 text-xs leading-snug text-zinc-500">
                      {row.label}
                    </div>
                    <div className="border-b border-white/[0.06] py-1">
                      <CompareCell tone={tones.left}>
                        <span className="font-medium">{row.l}</span>
                      </CompareCell>
                    </div>
                    <div className="border-b border-white/[0.06] py-1">
                      <CompareCell tone={tones.right}>
                        <span className="font-medium">{row.r}</span>
                      </CompareCell>
                    </div>
                  </Fragment>
                );
              });
            })()}
          </div>
          {(!h2h || h2h.games === 0) && (
            <p className="mt-3 text-xs text-zinc-500">
              No regular-season head-to-head matchups on file for this pair.
            </p>
          )}
        </div>
      ) : compareWith ? (
        <p className="text-sm text-zinc-500">Could not load comparison for that owner.</p>
      ) : null}
    </IntelPanel>
  );
}

function ProfilePanel({
  mode,
  profileLookupKey,
  headerDisplayName,
  powerRankings,
  ownerAwards,
  availableOwnerKeysCount,
  dossierPickerOptions,
  dossierActiveSeason,
  rivalryEligibleOwnerKeysForDossier,
  leagueContextKey,
  leagueKeyReady,
}: {
  mode: OwnerProfilesMode;
  /** Canonical `owners.ownerList` row id — sent as `ownerKey` on `owners.ownerProfile`. */
  profileLookupKey: string;
  headerDisplayName: string;
  powerRankings: any[];
  ownerAwards: any[];
  /** Distinct ownerKey count from ownerList (active + graveyard). */
  availableOwnerKeysCount: number;
  dossierPickerOptions: RivalryPickerOption[];
  dossierActiveSeason: number;
  rivalryEligibleOwnerKeysForDossier: string[];
  leagueContextKey: string;
  leagueKeyReady: boolean;
}) {
  const trpcAny = trpc as any;
  const lens = ownerProfilesLensCopy(mode);
  const selfLens = isSelfMode(mode);
  const [compareWith, setCompareWith] = useState("");
  const profileArgs = useMemo(() => {
    const base = compareWith ? { compareWith } : {};
    const k = profileLookupKey.trim();
    return { ownerKey: k, ...base, expectedLeagueId: leagueContextKey };
  }, [profileLookupKey, compareWith, leagueContextKey]);

  const q = trpcAny.owners.ownerProfile.useQuery(withLeagueSalt({ ...profileArgs }, leagueContextKey), {
    enabled: leagueKeyReady && !!profileLookupKey.trim(),
    refetchInterval: (query: any) => {
      const d = query.state.data;
      if (query.state.status !== "success" || query.state.fetchStatus === "fetching") return false;
      if (!d || d.ownerProfileLeagueMismatch === true) return 2500;
      const dl = d.leagueId != null ? String(d.leagueId) : "";
      if (dl && dl !== leagueContextKey) return 2500;
      return false;
    },
  });
  const p = q.data as any;
  const [intelExpanded, setIntelExpanded] = useState<string | null>(null);
  const [showRivalryDossier, setShowRivalryDossier] = useState(false);
  const [rivalryDocOpponentKey, setRivalryDocOpponentKey] = useState("");
  const [dataSourceOpen, setDataSourceOpen] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);

  // RFSN-023: self lens never applies scouting paywalls; scout lens keeps server gating.
  const gated = selfLens ? false : Boolean(p?.gated);
  const profileLocked = selfLens ? false : Boolean(p?.locked);
  const draftUnlocked = !gated;
  const scoutCheckout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (r) => {
      if (r?.url) window.open(r.url, "_blank", "noopener,noreferrer");
      else toast.error("Checkout did not return a link. Try again or contact support.");
    },
    onError: (err) => {
      toast.error(err.message || "Could not start checkout. Please try again.");
    },
  });
  const scoutLog = (trpc as any).usageMonitor.logUIEvent.useMutation();
  const scoutSnapSeen = useRef(false);
  const scoutPaySeen = useRef(false);
  useEffect(() => { if (!scoutSnapSeen.current && p) { scoutSnapSeen.current = true; setLastFreeFeature("owner_profile"); scoutLog.mutate({ eventType: "feature_open", featureName: "owner_profile_snapshot_viewed" }); } }, [p]);
  useEffect(() => { if (gated && !scoutPaySeen.current) { scoutPaySeen.current = true; scoutLog.mutate({ eventType: "feature_open", featureName: "owner_profile_paywall_viewed" }); } }, [gated]);
  const startScoutCheckout = () => {
    if (typeof window === "undefined") return;
    scoutLog.mutate({ eventType: "cta_click", featureName: "owner_profile_unlock_clicked" });
    scoutCheckout.mutate({ origin: window.location.origin });
  };

  useEffect(() => {
    setIntelExpanded(null);
    setCompareWith("");
    setShowRivalryDossier(false);
    setRivalryDocOpponentKey("");
    setDataSourceOpen(false);
    setDeveloperOpen(false);
  }, [profileLookupKey, leagueContextKey]);

  useEffect(() => {
    if (!compareWith) return;
    const t = window.setTimeout(() => dossierScrollTo("dossier-compare"), 80);
    return () => window.clearTimeout(t);
  }, [compareWith]);
  const allSeasonsQ2 = trpcAny.espn.allSeasons.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: leagueKeyReady,
  });
  // Dynasty Identity badge — consume the existing dynasty.powerRankings payload for the
  // active league (same query the Power Rankings page uses). No recompute.
  const dynastyPowerQ = trpcAny.dynasty.powerRankings.useQuery(
    withLeagueSalt({ season: 2026 }, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  const acqImpactQ = trpc.leagueIntel.acquisitionImpact.useQuery(
    withLeagueSalt({ ownerKey: profileLookupKey }, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady && !!profileLookupKey.trim() },
  );
  const tradeHistoryQ = (trpc as any).completedTradeIntel.ownerTradeHistory.useQuery(
    withLeagueSalt(
      {
        leagueId: leagueContextKey,
        season: dossierActiveSeason,
        ownerKey: profileLookupKey,
      },
      leagueContextKey,
    ),
    {
      enabled: leagueKeyReady && !!profileLookupKey.trim(),
      staleTime: 60_000,
    },
  );
  const draftSeasonList: number[] = Array.isArray(allSeasonsQ2.data) ? (allSeasonsQ2.data as number[]) : [];
  const draftSeasonQueries = (trpc as any).useQueries((t: any) =>
    draftSeasonList.map((s: number) =>
      s >= 2010 && s <= 2017
        ? t.espn.legacyDraftPicks(withLeagueSalt({ season: s }, leagueContextKey), {
            staleTime: 300_000,
            enabled: leagueKeyReady,
          })
        : t.espn.draftPicks(withLeagueSalt({ season: s }, leagueContextKey), {
            staleTime: 300_000,
            enabled: leagueKeyReady,
          }),
    ),
  );

  if (q.isPending || q.isLoading) return (
    <SectionLoading message="Loading profile…" className="justify-center py-20" />
  );
  const profileLeagueId = typeof p?.leagueId === "string" ? p.leagueId : null;
  const profileLeagueGuardOk =
    q.isSuccess &&
    profileLeagueId === leagueContextKey &&
    p?.ownerProfileLeagueMismatch !== true;
  if (q.isSuccess && p != null && !profileLeagueGuardOk) {
    return (
      <SectionLoading message="Resolving profile for active league…" className="justify-center py-20" />
    );
  }
  if (q.isError) {
    return (
      <IntelPanel variant="warm" className="rounded-lg border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        <AlertTriangle className="mb-2 inline h-5 w-5" /> Could not load profile: {String((q.error as Error)?.message ?? q.error)}
        <div className="mt-3 font-mono text-xs text-foreground/80 space-y-1">
          <div>ownerKey (query input): {profileLookupKey}</div>
          <div>ownerList ownerKey count: {availableOwnerKeysCount}</div>
        </div>
      </IntelPanel>
    );
  }
  if (!p) {
    return (
      <IntelPanel variant="warm" className="rounded-lg border-amber-500/40 bg-amber-950/20 px-4 py-6 text-sm text-amber-100/90">
        <AlertTriangle className="mb-2 inline h-5 w-5 text-amber-400" /> Profile not found.
        <div className="mt-3 font-mono text-[11px] text-foreground/85 space-y-1">
          <div>
            <span className="text-muted-foreground">selectedOwnerKey:</span> {profileLookupKey}
          </div>
          <div>
            <span className="text-muted-foreground">available ownerKeys (from list):</span> {availableOwnerKeysCount}
          </div>
        </div>
      </IntelPanel>
    );
  }

  if (profileLocked) {
    return (
      <IntelPanel variant="warm" className="scroll-mt-24 overflow-hidden p-6 sm:p-8">
        <ScoutingLock
          title={`${headerDisplayName}'s Opponent Scout Report`}
          blurb="Scout how this manager drafts, trades, and builds rosters — unlock Rivals Pro for the full scouting report."
          onUnlock={startScoutCheckout}
          pending={scoutCheckout.isPending}
        />
      </IntelPanel>
    );
  }

  // Destructure using the ACTUAL server field names
  const snap     = p.snapshot     ?? {};
  // Dynasty Identity — match the selected owner to its dynasty.powerRankings row by
  // ownerKey ONLY (the canonical key both sides share). No ownerName fallback.
  const dynastyIdentityRow: DynastyIdentityRow | null =
    (Array.isArray(dynastyPowerQ.data?.teams) ? (dynastyPowerQ.data.teams as any[]) : [])
      .find((r: any) => typeof r?.ownerKey === "string" && r.ownerKey === profileLookupKey) ?? null;
  const draft    = p.draftDNA     ?? {};
  const keeper   = p.keeperDNA    ?? {};
  const activity = p.activityDNA  ?? {};
  const intel    = Array.isArray(p.matchupIntel) ? p.matchupIntel as any[] : [];
  const intelDiag = p.matchupIntelDiagnostics ?? {};
  const profDiag = (p.ownerResolutionDiagnostics ?? {}) as Record<string, unknown>;
  const peer = p.comparison as Record<string, unknown> | null | undefined;
  const snapP = (peer?.snapshot ?? {}) as Record<string, unknown>;
  const draftP = (peer?.draftDNA ?? {}) as Record<string, unknown>;
  const keeperP = (peer?.keeperDNA ?? {}) as Record<string, unknown>;
  const activityP = (peer?.activityDNA ?? {}) as Record<string, unknown>;
  const h2h = p.headToHead as {
    games: number;
    winsForOwner: number;
    lossesForOwner: number;
    ties: number;
    recordVs: string;
  } | null;
  const candidates = (Array.isArray(p.comparisonCandidates) ? p.comparisonCandidates : []) as string[];

  const seasons        = Array.isArray(snap.seasons)        ? snap.seasons        : [];
  const champSeasons   = Array.isArray(snap.champSeasons)   ? snap.champSeasons   : [];
  const runnerUpSeasons = Array.isArray(snap.runnerUpSeasons) ? snap.runnerUpSeasons : [];
  const thirdSeasons   = Array.isArray(snap.thirdSeasons)   ? snap.thirdSeasons   : [];
  const seasonRecords  = Array.isArray(snap.seasonRecords)  ? snap.seasonRecords  : [];
  const posShare    = (draft.posShare     ?? {}) as Record<string, number>;
  const earlyPos    = (draft.earlyPos     ?? {}) as Record<string, number>;
  const avgRoundByPos = (draft.avgRoundByPos ?? {}) as Record<string, number>;
  const mostDraftedPos = Array.isArray(draft.mostDraftedPos) ? draft.mostDraftedPos as string[] : [];
  const byRound = Array.isArray((draft as any).byRound) ? ((draft as any).byRound as any[]) : [];
  const ownerTeamBySeason: Record<number, string> = {};
  for (const sr of (seasonRecords as any[])) { const yr = Number(sr.season); if (yr) ownerTeamBySeason[yr] = String(sr.teamName || "").trim().toLowerCase(); }
  const liveOwnerPicks: Array<{ season: number; round: number; position: string; playerName: string; isKeeper: boolean }> = [];
  const ownerNameNorm = String(headerDisplayName || "").trim().toLowerCase();
  draftSeasonList.forEach((s: number, idx: number) => {
    const raw = (draftSeasonQueries as any[])[idx]?.data;
    const picks = (Array.isArray(raw) ? raw : (raw?.picks ?? [])) as any[];
    const myTeam = ownerTeamBySeason[Number(s)];
    for (const pk of picks) {
      const byOwner = pk.ownerName ? String(pk.ownerName).trim().toLowerCase() === ownerNameNorm : false;
      const byTeam = myTeam ? String(pk.teamName || "").trim().toLowerCase() === myTeam : false;
      if (byOwner || byTeam) {
        liveOwnerPicks.push({ season: Number(s), round: Number(pk.roundId) || 0, position: String(pk.position || "UNK"), playerName: String(pk.playerName || ""), isKeeper: Boolean(pk.isKeeper) });
      }
    }
  });
  const liveByRoundMap = new Map<number, any[]>();
  for (const pk of liveOwnerPicks) { if (pk.round <= 0) continue; if (!liveByRoundMap.has(pk.round)) liveByRoundMap.set(pk.round, []); liveByRoundMap.get(pk.round)!.push(pk); }
  const liveByRound = [...liveByRoundMap.entries()].sort((a, b) => a[0] - b[0]).map(([round, picks]) => { const sorted = [...picks].sort((a, b) => b.season - a.season); const posCounts: Record<string, number> = {}; for (const p2 of sorted) posCounts[p2.position] = (posCounts[p2.position] ?? 0) + 1; const top = Object.entries(posCounts).sort((a, b) => b[1] - a[1])[0]; return { round, seasons: sorted.length, topPosition: top?.[0] ?? "UNK", topCount: top?.[1] ?? 0, posCounts, picks: sorted }; });
  const effectiveByRound = liveByRound.length ? liveByRound : byRound;
  const draftSeasonsCovered = [...new Set((effectiveByRound as any[]).flatMap((r: any) => (Array.isArray(r.picks) ? r.picks : []).map((pk: any) => Number(pk.season))))].filter((n: number) => n > 0).sort((a: number, b: number) => a - b);
  const keeperPosDist = (keeper.keeperPosDist ?? {}) as Record<string, number>;
  const lastYearKeepers = Array.isArray(keeper.lastYearKeepers) ? keeper.lastYearKeepers : [];
  const txnSeasons  = Array.isArray(activity.txnSeasons)    ? activity.txnSeasons  : [];

  const sortedPos  = Object.entries(posShare).sort((a, b) => b[1] - a[1]);
  const sortedKPos = Object.entries(keeperPosDist).sort((a, b) => b[1] - a[1]);

  const earlySorted = Object.entries(earlyPos).sort((a, b) => b[1] - a[1]);
  const earlyTotal = earlySorted.reduce((s, [, v]) => s + num(v), 0);
  let earlyDeg = 0;
  const earlyConicParts: string[] = [];
  for (const [pos, cnt] of earlySorted) {
    const slice = earlyTotal > 0 ? (num(cnt) / earlyTotal) * 360 : 0;
    const col = EARLY_CONIC[pos.toUpperCase()] ?? "#52525b";
    earlyConicParts.push(`${col} ${earlyDeg}deg ${earlyDeg + slice}deg`);
    earlyDeg += slice;
  }
  const earlyConicStyle: CSSProperties =
    earlyConicParts.length > 0
      ? { background: `conic-gradient(${earlyConicParts.join(", ")})` }
      : { background: "conic-gradient(#241a2a 0deg 360deg)" };

  const tablePositions = [...new Set([...Object.keys(avgRoundByPos), ...Object.keys(posShare)])].sort(
    (a, b) => num(posShare[b] ?? 0) - num(posShare[a] ?? 0),
  );

  const unSeas = Array.isArray(profDiag.unresolvedSeasonTeams)
    ? (profDiag.unresolvedSeasonTeams as { season: number; reason: string }[])
    : [];
  const missRec = Array.isArray(profDiag.missingRecordSeasons) ? (profDiag.missingRecordSeasons as number[]) : [];
  const missMed = Array.isArray(profDiag.missingMedalJoinSeasons)
    ? (profDiag.missingMedalJoinSeasons as { season: number; slot: string; raw: string }[])
    : [];
  const unDraft = Array.isArray(profDiag.unresolvedTeamNames) ? (profDiag.unresolvedTeamNames as string[]) : [];
  const hasProfileResolutionDiag = unSeas.length + missRec.length + missMed.length + unDraft.length > 0;

  const topSharePos = sortedPos[0];
  const earliestAvgPos = (() => {
    let best: { pos: string; r: number } | null = null;
    for (const [pos, r] of Object.entries(avgRoundByPos)) {
      const rv = num(r);
      if (!Number.isFinite(rv) || rv <= 0) continue;
      if (!best || rv < best.r) best = { pos, r: rv };
    }
    return best;
  })();
  const earlyLead = earlySorted[0];

  const prMe = powerRankings.find((r: any) => listRowLookupKey(r) === profileLookupKey);
  const legacyRank = prMe != null && prMe.rank != null && num(prMe.rank) < 999 ? num(prMe.rank) : null;
  const intelligenceRaw = prMe != null && prMe.score != null ? num(prMe.score) : null;
  // Formula A — normalize the raw power-ranking composite to 0–100 relative to the
  // league's top score (top owner = 100). The raw score is an unbounded internal
  // metric, so this presents it as a clear, league-relative rating rather than an
  // absolute universal number.
  const maxLeagueScore = Math.max(
    0,
    ...powerRankings.map((r: any) => num(r?.score)).filter((n: number) => Number.isFinite(n)),
  );
  const intelligenceScore =
    intelligenceRaw != null && intelligenceRaw > 0 && maxLeagueScore > 0
      ? Math.max(0, Math.min(100, Math.round((intelligenceRaw / maxLeagueScore) * 100)))
      : null;
  const currentSeasonRow = seasonRecords.length > 0 ? (seasonRecords as any[])[seasonRecords.length - 1] : null;
  const draftStyle = str((draft as Record<string, unknown>).draftStyleBadge ?? "");
  const { topRival, biggestThreat } = pickRivalryHighlights(intel);
  const selfTendencies = selfLens
    ? buildSelfIdentityTendencies({
        draftStyle: draftStyle || undefined,
        mostDraftedPos,
        earliestAvgPos,
        earlyLead: earlyLead ? [earlyLead[0], earlyLead[1]] : null,
      })
    : [];
  const careerTimeline = buildCareerTimelineEvents(
    champSeasons,
    runnerUpSeasons,
    thirdSeasons,
    seasonRecords as any[],
    tradeHistoryQ.data as any,
  );
  const acqFocal = (acqImpactQ.data as any)?.focal ?? (acqImpactQ.data as any)?.owner ?? null;

  const openRivalryDocumentary = (opponentName: string) => {
    const key = resolveOpponentOwnerKey(opponentName, dossierPickerOptions);
    if (key) setRivalryDocOpponentKey(key);
    setShowRivalryDossier(true);
  };

  return (
    <div className="space-y-4" data-owner-profiles-mode={mode}>
      {/* ── 1. Executive Summary ───────────────────────────────────────────── */}
      <IntelPanel id="dossier-summary" variant="warm" className="scroll-mt-24 overflow-hidden" style={{ borderTop: "3px solid #f5c65a" }}>
        <div className="border-b border-white/[0.06] px-4 py-3">
          <DossierSectionHeader icon={<ScrollText className="h-4 w-4" />} title="Executive Summary" accent="#f5c65a" />
        </div>
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-start">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-[#a3e635]/50 bg-zinc-900 text-2xl font-bold text-zinc-100 shadow-[0_0_28px_-6px_rgba(163,230,53,0.35)]"
            aria-hidden
          >
            {headerDisplayName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((s) => s[0])
              .join("")
              .toUpperCase() || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-zinc-50 md:text-3xl">{headerDisplayName}</h2>
                <p className="mt-1 text-sm text-zinc-500">{str(snap.currentTeam)}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {champSeasons.length > 0 && <Badge color="gold">🏆 {champSeasons.length}× Champ</Badge>}
                {runnerUpSeasons.length > 0 && <Badge color="silver">🥈 {runnerUpSeasons.length}× Finalist</Badge>}
                {thirdSeasons.length > 0 && <Badge color="bronze">🥉 {thirdSeasons.length}× 3rd</Badge>}
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Legacy rank</div>
                <div className="mt-1 text-xl font-extrabold tabular-nums text-zinc-100">
                  {legacyRank != null ? `#${legacyRank}` : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Intelligence score</div>
                <div className="mt-1 text-xl font-extrabold tabular-nums text-zinc-100">
                  {intelligenceScore != null ? intelligenceScore : "—"}
                  {intelligenceScore != null && (
                    <span className="text-sm font-semibold text-zinc-500"> / 100</span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {intelligenceScore != null ? "Relative to league leader" : "Not enough data"}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Overall record</div>
                <div className="mt-1 text-xl font-extrabold tabular-nums text-zinc-100">
                  {num(snap.totalWins)}–{num(snap.totalLosses)}
                  {num(snap.totalTies) > 0 ? `–${num(snap.totalTies)}` : ""}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">{pct(num(snap.winPct))} win · RS matchups</div>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 sm:col-span-2 lg:col-span-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Current season snapshot</div>
                <div className="mt-1 text-sm font-semibold text-zinc-100">
                  {currentSeasonRow
                    ? `${currentSeasonRow.season} · ${str(currentSeasonRow.teamName)} · ${currentSeasonRow.wins}–${currentSeasonRow.losses}${num(currentSeasonRow.ties) ? `–${num(currentSeasonRow.ties)}` : ""}`
                    : "—"}
                </div>
                {currentSeasonRow?.playoffSeed != null ? (
                  <div className="mt-0.5 text-[11px] text-zinc-500">Playoff seed: {currentSeasonRow.playoffSeed}</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        {!gated ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-5 py-3">
            <GitCompare className="h-4 w-4 shrink-0 text-violet-400/90" aria-hidden />
            <span className="text-xs font-semibold text-zinc-400">{lens.compareLabel}</span>
            <select
              id="owner-compare-hero-select"
              aria-label="Compare with another owner"
              className="min-w-[160px] max-w-full rounded-md border border-violet-500/25 bg-[#110c14] px-2 py-1.5 text-sm text-zinc-100"
              value={compareWith}
              onChange={(e) => setCompareWith(e.target.value)}
            >
              <option value="">— Select owner —</option>
              {candidates.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {compareWith ? (
              <button
                type="button"
                onClick={() => dossierScrollTo("dossier-compare")}
                className="text-xs font-medium text-violet-300 underline-offset-2 hover:text-violet-200 hover:underline"
              >
                Jump to comparison
              </button>
            ) : null}
          </div>
        ) : null}
        <DynastyIdentityStrip row={dynastyIdentityRow} />
      </IntelPanel>

      <DossierSectionNav mode={mode} />

      {!gated ? (
        <CompareOwnersPanel
          compareWith={compareWith}
          headerDisplayName={headerDisplayName}
          profileLookupKey={profileLookupKey}
          powerRankings={powerRankings}
          ownerAwards={ownerAwards}
          peer={peer}
          isLoadingComparison={q.isFetching || q.isLoading}
          snap={snap as Record<string, unknown>}
          snapP={snapP}
          draft={draft as Record<string, unknown>}
          draftP={draftP as Record<string, unknown>}
          keeper={keeper as Record<string, unknown>}
          keeperP={keeperP as Record<string, unknown>}
          activity={activity as Record<string, unknown>}
          activityP={activityP as Record<string, unknown>}
          h2h={h2h}
        />
      ) : null}

      {/* ── 2. GM Identity / GM Profile ────────────────────────────────────── */}
      <IntelPanel id="dossier-gm" variant="warm" className="scroll-mt-24 overflow-hidden p-4 sm:p-5">
        <DossierSectionHeader icon={<Dna className="h-4 w-4" />} title={lens.sectionGm} />
        {gated ? (
          <ScoutingLock title="GM Profile" blurb="Draft DNA, trade tendencies, activity patterns, and matchup intel unlock with Rivals Pro." onUnlock={startScoutCheckout} pending={scoutCheckout.isPending} />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{lens.dnaEyebrow}</p>
                {selfLens ? (
                  <>
                    <p className="mt-2 text-lg font-extrabold tracking-tight text-zinc-50">
                      {draftStyle || "GM Style forming"}
                    </p>
                    {selfTendencies.length > 0 ? (
                      <div className="mt-3">
                        <p className="text-[11px] font-semibold text-zinc-400">You tend to:</p>
                        <ul className="mt-1.5 space-y-1">
                          {selfTendencies.map((t) => (
                            <li key={t.text} className="flex items-start gap-1.5 text-sm text-zinc-300">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-lime-400/80" aria-hidden />
                              {t.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-500">Not enough draft history yet for identity bullets.</p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">{p.scoutingSummary || "—"}</p>
                )}
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{lens.draftDnaEyebrow}</p>
                <StatRow label="Draft style" value={draftStyle || "—"} />
                <StatRow label="Open-draft picks" value={num(draft.totalPicks)} />
                <StatRow label="Top positions" value={mostDraftedPos.slice(0, 3).join(" › ") || "—"} />
              </div>
            </div>
            <ActivityDnaCard ownerKey={profileLookupKey} />
          </div>
        )}
      </IntelPanel>

      {/* ── 3. Team Building / Draft Pattern ───────────────────────────────── */}
      <IntelPanel id="dossier-building" variant="warm" className="scroll-mt-24 overflow-hidden p-4 sm:p-5">
        <DossierSectionHeader icon={<Shield className="h-4 w-4" />} title={lens.sectionBuilding} accent="#f5c65a" />
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <StatRow label="Acquisitions" value={num(activity.totalAcq)} />
          <StatRow label="Trades" value={num(activity.totalTrades)} />
          <StatRow label="Drops" value={num(activity.totalDrops)} />
        </div>

      {!draftUnlocked && (
        <ScoutingLock title="Draft DNA" blurb="See exactly how this manager drafts - round-by-round tendencies, position bias, reaches and value - so you can predict and counter their board." onUnlock={startScoutCheckout} pending={scoutCheckout.isPending} />
      )}
      {draftUnlocked && (
        <div className="space-y-4">
          <ProfileShellCard title={lens.tendenciesByRoundTitle}>
            {draftSeasonsCovered.length > 0 && (
              <p className="mb-3 text-[11px] text-zinc-500">Drafts analyzed: <span className="font-semibold text-zinc-300">{draftSeasonsCovered[0]}{draftSeasonsCovered.length > 1 ? `-${draftSeasonsCovered[draftSeasonsCovered.length - 1]}` : ""}</span> ({draftSeasonsCovered.length} season{draftSeasonsCovered.length === 1 ? "" : "s"})</p>
            )}
            {effectiveByRound.length === 0 ? (
              <p className="text-sm text-zinc-500">No draft history yet.</p>
            ) : (
              <div className="space-y-2">
                {effectiveByRound.map((r: any) => {
                  const pu = String(r.topPosition || "UNK").toUpperCase();
                  return (
                    <div key={r.round} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <div className="flex items-start gap-3">
                        <div className="grid shrink-0 place-items-center rounded-md bg-white/[0.05] text-[11px] font-black text-zinc-300" style={{ width: 36, height: 36 }}>R{r.round}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm leading-tight">
                            <span className={cn("font-bold", POS_TEXT[pu] ?? "text-zinc-200")}>{pu === "UNK" ? "Mixed" : pu}</span>
                            <span className="text-zinc-500"> in </span>
                            <span className="font-semibold text-zinc-100">{r.topCount} of {r.seasons}</span>
                            <span className="text-zinc-500"> {r.seasons === 1 ? "year" : "years"}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {(r.picks ?? []).map((pk: any, i: number) => (
                              <span key={i} className="inline-flex items-center gap-1 rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[10px]">
                                <span className="tabular-nums text-zinc-500">{pk.season}</span>
                                <span className={cn("font-bold", POS_TEXT[String(pk.position || "UNK").toUpperCase()] ?? "text-zinc-300")}>{String(pk.position || "UNK").toUpperCase()}</span>
                                <span className="max-w-[130px] truncate text-zinc-400">{pk.playerName}</span>
                                {pk.isKeeper && <span className="font-bold text-amber-400/90">K</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ProfileShellCard>

          <div className="grid gap-3 lg:grid-cols-2">
            <ProfileShellCard title="Position distribution">
              {sortedPos.length > 0 ? (
                <div className="space-y-3">
                  {sortedPos.map(([pos, share]) => {
                    const pu = pos.toUpperCase();
                    const bar = POS_BAR[pu] ?? "bg-zinc-500";
                    return (
                      <div key={pos}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className={cn("font-semibold", POS_TEXT[pu] ?? "text-zinc-300")}>{pu}</span>
                          <span className="tabular-nums text-zinc-400">{pct(share)}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={cn("h-full rounded-full transition-all", bar)}
                            style={{ width: `${Math.min(100, Math.max(0, num(share)))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No position share data.</p>
              )}
            </ProfileShellCard>

            <ProfileShellCard title="Average draft round by position">
              {tablePositions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[240px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        <th className="py-2 pr-2">Position</th>
                        <th className="py-2 pr-2">Avg round</th>
                        <th className="py-2 text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tablePositions.map((pos) => {
                        const pu = pos.toUpperCase();
                        const ar = avgRoundByPos[pos];
                        const sh = posShare[pos];
                        return (
                          <tr key={pos} className="border-b border-white/[0.05] last:border-0">
                            <td className={cn("py-2 pr-2 font-semibold", POS_TEXT[pu] ?? "text-zinc-200")}>{pu}</td>
                            <td className="py-2 pr-2 tabular-nums text-zinc-200">{ar != null ? num(ar).toFixed(1) : "—"}</td>
                            <td className="py-2 text-right tabular-nums text-zinc-400">
                              {sh != null && Number.isFinite(num(sh)) ? pct(num(sh)) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No average-round data.</p>
              )}
            </ProfileShellCard>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <ProfileShellCard title={lens.earlyTendenciesTitle}>
              {earlySorted.length > 0 ? (
                <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
                  <div className="relative h-44 w-44 shrink-0">
                    <div
                      className="absolute inset-0 rounded-full shadow-[inset_0_0_0_12px_#110c14]"
                      style={earlyConicStyle}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-white/[0.08] bg-[#110c14]/95 text-lg" aria-hidden>
                        🏈
                      </div>
                    </div>
                  </div>
                  <div className="w-full max-w-xs space-y-2">
                    {earlySorted.map(([pos, cnt]) => {
                      const pu = pos.toUpperCase();
                      const tot = earlyTotal > 0 ? (num(cnt) / earlyTotal) * 100 : 0;
                      const dot = EARLY_CONIC[pu] ?? "#71717a";
                      return (
                        <div key={pos} className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-2 text-zinc-300">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
                            <span className={cn("font-semibold", POS_TEXT[pu] ?? "text-zinc-200")}>{pu}</span>
                          </span>
                          <span className="tabular-nums text-zinc-400">{pct(tot)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No early-round (1–3) pick breakdown.</p>
              )}
            </ProfileShellCard>

            <div className="flex flex-col gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">{lens.draftInsightsTitle}</h3>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3 sm:flex sm:gap-3">
                <div className="mx-auto mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/15 sm:mx-0 sm:mb-0">
                  <Crosshair className="h-5 w-5 text-amber-300" aria-hidden />
                </div>
                <div className="min-w-0 text-center sm:text-left">
                  <p className="text-sm font-semibold text-amber-200">{lens.positionShareTitle}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {topSharePos
                      ? `${String(topSharePos[0]).toUpperCase()} has the largest recorded share at ${pct(num(topSharePos[1]))} of picks.`
                      : "No position share values on file for this profile."}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3 sm:flex sm:gap-3">
                <div className="mx-auto mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/15 sm:mx-0 sm:mb-0">
                  <Ban className="h-5 w-5 text-amber-300" aria-hidden />
                </div>
                <div className="min-w-0 text-center sm:text-left">
                  <p className="text-sm font-semibold text-amber-200">Most-drafted order</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {mostDraftedPos.length > 0
                      ? `Profile mostDraftedPos order: ${mostDraftedPos.join(" → ")}.`
                      : earliestAvgPos
                        ? `Lowest avgRoundByPos value: ${String(earliestAvgPos.pos).toUpperCase()} at ${earliestAvgPos.r.toFixed(1)}.`
                        : "No mostDraftedPos ordering or avgRoundByPos values to list."}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3 sm:flex sm:gap-3">
                <div className="mx-auto mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/15 sm:mx-0 sm:mb-0">
                  <Award className="h-5 w-5 text-amber-300" aria-hidden />
                </div>
                <div className="min-w-0 text-center sm:text-left">
                  <p className="text-sm font-semibold text-amber-200">Rounds 1–3 (earlyPos)</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {earlyLead && earlyTotal > 0
                      ? `${String(earlyLead[0]).toUpperCase()}: ${num(earlyLead[1])} pick(s) in rounds 1–3 out of ${earlyTotal} early-round picks (earlyPos).`
                      : "No early-round (1–3) pick counts in earlyPos."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <ProfileShellCard title="Draft summary">
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <StatRow label="Open-draft picks"           value={num(draft.totalPicks)} />
                <StatRow label="Draft board slots (all)"   value={num((draft as Record<string, unknown>).boardSlotCount)} />
                <StatRow label="Keeper + retained slots"   value={num((draft as Record<string, unknown>).keeperSlotCount)} />
                <StatRow label="Retained-only slots"       value={num((draft as Record<string, unknown>).retainedSlotCount)} />
                <StatRow label="Top Drafted Positions" value={mostDraftedPos.join(" › ") || "—"} />
              </div>
              <div>
                {mostDraftedPos.slice(0, 3).map((pos) => (
                  <StatRow key={pos} label={`Avg Round — ${pos}`} value={`Rd ${avgRoundByPos[pos] ?? "—"}`} />
                ))}
              </div>
            </div>
          </ProfileShellCard>

          {gated ? (
            <ScoutingLock title="Keeper DNA" blurb="Keeper rate, average keeper round, and protected positions." onUnlock={startScoutCheckout} pending={scoutCheckout.isPending} />
          ) : (
            <ProfileShellCard title={lens.keeperTitle}>
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <div>
                  <StatRow label="Keeper / retained slots" value={num(keeper.totalKeepers)} />
                  <StatRow label="Strict keeper rows (ESPN)" value={num((keeper as Record<string, unknown>).strictKeeperCount)} />
                  <StatRow label="Retained-only rows" value={num((keeper as Record<string, unknown>).retainedSlotCount)} />
                  <StatRow label="% of board (keeper + retained)" value={pct(num(keeper.keeperRate))} />
                  <StatRow label="Avg keeper round" value={keeper.avgKeeperRound != null ? `Rd ${keeper.avgKeeperRound}` : "—"} />
                </div>
                <div>
                  {sortedKPos.map(([pos, cnt]) => (
                    <StatRow key={pos} label={`${pos} (keeper+retained)`} value={cnt} />
                  ))}
                </div>
              </div>
              {lastYearKeepers.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Most recent keeper / retained</p>
                  <div className="flex flex-wrap gap-2">
                    {lastYearKeepers.map((k: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs">
                        <span className="font-semibold text-zinc-100">{k.playerName}</span>
                        <span className="text-zinc-500">{k.position} · Rd {k.round}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </ProfileShellCard>
          )}
        </div>
      )}
      </IntelPanel>

      {/* ── 4. Trading Profile ─────────────────────────────────────────────── */}
      {!gated ? (
        <IntelPanel id="dossier-trading" variant="warm" className="scroll-mt-24 overflow-hidden p-4 sm:p-5">
          <DossierSectionHeader icon={<ArrowLeftRight className="h-4 w-4" />} title={lens.sectionTrading} accent="#c4b5fd" />
          {acqFocal ? (
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Acquisition impact</div>
                <div className="mt-1 text-lg font-extrabold tabular-nums text-lime-300">{num(acqFocal.acquisitionImpactScore)}</div>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Points per start</div>
                <div className="mt-1 text-lg font-extrabold tabular-nums text-zinc-100">
                  {acqFocal.pointsPerStart != null ? num(acqFocal.pointsPerStart).toFixed(1) : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Qualified seasons</div>
                <div className="mt-1 text-lg font-extrabold tabular-nums text-zinc-100">{num(acqFocal.qualifiedSeasons)}</div>
              </div>
            </div>
          ) : null}
          <OwnerTradeHistoryCard
            profileLookupKey={profileLookupKey}
            leagueContextKey={leagueContextKey}
            leagueKeyReady={leagueKeyReady}
            dossierActiveSeason={dossierActiveSeason}
            mode={mode}
          />
        </IntelPanel>
      ) : (
        <ScoutingLock title="Trading Profile" blurb="Trade history, completed trade intelligence, and acquisition impact." onUnlock={startScoutCheckout} pending={scoutCheckout.isPending} />
      )}

      {/* ── 5. Matchup / Rivalry History ───────────────────────────────────── */}
      {!gated ? (
        <IntelPanel id="dossier-matchups" variant="warm" className="scroll-mt-24 overflow-hidden p-4 sm:p-5">
          <DossierSectionHeader icon={<Swords className="h-4 w-4" />} title={lens.sectionMatchups} accent="#c4b5fd" />
            <p className="mb-3 text-[11px] text-zinc-500">
            {lens.matchupIntelCaption}
          </p>
          {intel.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {num(intelDiag.unresolvedMatchups) > 0
              ? `Matchup data found but ${num(intelDiag.unresolvedMatchups)} games could not be attributed to known owners.`
              : "No completed regular-season matchup data available yet. Run Sync to populate."}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border text-xs">
                  <th className="w-8 py-1.5 pr-1" aria-hidden />
                  <th className="text-left py-1.5 pr-3">{lens.opponentColumn}</th>
                  <th className="text-right pr-3">Games</th>
                  <th className="text-right pr-3">W–L–T</th>
                  <th className="text-right pr-3">Win %</th>
                  <th className="text-right">Tag</th>
                </tr>
              </thead>
              <tbody>
                {intel.map((row: any) => {
                  const open = intelExpanded === row.opponentOwner;
                  const games = Array.isArray(row.recentGames) ? row.recentGames : [];
                  return (
                    <Fragment key={row.opponentOwner}>
                      <tr className="border-b border-border/30 hover:bg-muted/20">
                        <td className="py-1.5 pr-1 align-middle">
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-label={open ? "Collapse game history" : "Expand game history"}
                            className="rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            onClick={() =>
                              setIntelExpanded((cur) => (cur === row.opponentOwner ? null : row.opponentOwner))
                            }
                          >
                            {open ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-1.5 pr-3 font-medium text-foreground">{row.opponentOwner}</td>
                        <td className="text-right pr-3 text-muted-foreground">{num(row.games)}</td>
                        <td className="text-right pr-3 text-muted-foreground">
                          {num(row.wins)}–{num(row.losses)}
                          {num(row.ties) > 0 ? `–${num(row.ties)}` : ""}
                        </td>
                        <td className="text-right pr-3">
                          <span
                            className={cn(
                              "font-medium",
                              num(row.winPct) >= 60
                                ? "text-lime-400"
                                : num(row.winPct) <= 40
                                  ? "text-red-400"
                                  : "text-foreground",
                            )}
                          >
                            {pct(num(row.winPct))}
                          </span>
                        </td>
                        <td className="text-right">
                          <MatchupTag tag={row.tag} mode={mode} />
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border/30 bg-muted/15">
                          <td colSpan={6} className="px-3 py-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              Last 5 meetings
                            </p>
                            {games.length === 0 ? (
                              <p className="text-xs text-muted-foreground">{lens.matchupEmpty}</p>
                            ) : (
                              <div className="overflow-x-auto rounded border border-border/40">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground border-b border-border/60 bg-muted/30">
                                      <th className="text-left py-1.5 px-2">Season</th>
                                      <th className="text-right py-1.5 px-2">Week</th>
                                      <th className="text-right py-1.5 px-2">Score (you–opp)</th>
                                      <th className="text-center py-1.5 px-2">Result</th>
                                      <th className="text-right py-1.5 px-2">Margin</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {games.map((g: any, i: number) => {
                                      const hasScores =
                                        g.ownerScore !== undefined && g.opponentScore !== undefined;
                                      const scoreStr = hasScores
                                        ? `${num(g.ownerScore)}–${num(g.opponentScore)}`
                                        : "—";
                                      const marginStr =
                                        g.margin !== undefined ? `${num(g.margin) > 0 ? "+" : ""}${num(g.margin).toFixed(2)}` : "—";
                                      return (
                                        <tr key={`${g.season}-${g.week}-${i}`} className="border-b border-border/30 last:border-0">
                                          <td className="py-1.5 px-2 font-medium">{g.season}</td>
                                          <td className="text-right py-1.5 px-2 text-muted-foreground">{g.week}</td>
                                          <td className="text-right py-1.5 px-2 tabular-nums">{scoreStr}</td>
                                          <td className="text-center py-1.5 px-2 font-semibold">{str(g.result)}</td>
                                          <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                                            {marginStr}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {num(intelDiag.unresolvedMatchups) > 0 && (
              <p className="mt-2 text-xs text-muted-foreground/60">
                ℹ {num(intelDiag.unresolvedMatchups)} games excluded — opponent owner could not be resolved.
              </p>
            )}
            {num(intelDiag.recentGamesOmittedScores) > 0 && (
              <p className="mt-1 text-xs text-amber-200/80">
                ℹ {num(intelDiag.recentGamesOmittedScores)} recent meeting
                {num(intelDiag.recentGamesOmittedScores) !== 1 ? "s" : ""} omit box scores (0–0 in DB); result still shown
                where available.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
              {Object.entries(TAG_STYLES).map(([tag, cls]) => (
                <span key={tag} className={cn("rounded border px-1.5 py-0.5 font-semibold uppercase tracking-wide", cls)}>
                  {matchupTagLabel(tag, mode)}
                </span>
              ))}
            </div>
          </>
        )}
        </IntelPanel>
      ) : (
        <ScoutingLock title="Matchup Intelligence" blurb="Head-to-head records, nemesis tags, and opponent tendencies." onUnlock={startScoutCheckout} pending={scoutCheckout.isPending} />
      )}

      {/* ── 6. Rivalries ───────────────────────────────────────────────────── */}
      {!gated ? (
        <IntelPanel id="dossier-rivalries" variant="warm" className="scroll-mt-24 overflow-hidden p-4 sm:p-5">
          <DossierSectionHeader icon={<Clapperboard className="h-4 w-4" />} title={lens.sectionRivalries} accent="#f472b6" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{lens.topRivalLabel}</div>
              {topRival ? (
                <>
                  <div className="mt-1 text-lg font-bold text-zinc-100">{topRival.opponentOwner}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {num(topRival.wins)}–{num(topRival.losses)}
                    {num(topRival.ties) > 0 ? `–${num(topRival.ties)}` : ""} · {pct(num(topRival.winPct))} · {num(topRival.games)} games
                  </div>
                  {topRival.tag ? (
                    <div className="mt-2">
                      <MatchupTag tag={topRival.tag} mode={mode} />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">
                  {lens.rivalriesEmpty}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{lens.toughestLabel}</div>
              {biggestThreat ? (
                <>
                  <div className="mt-1 text-lg font-bold text-zinc-100">{biggestThreat.opponentOwner}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {num(biggestThreat.wins)}–{num(biggestThreat.losses)}
                    {num(biggestThreat.ties) > 0 ? `–${num(biggestThreat.ties)}` : ""} · {pct(num(biggestThreat.winPct))} · {num(biggestThreat.games)} games
                  </div>
                  {biggestThreat.tag ? (
                    <div className="mt-2">
                      <MatchupTag tag={biggestThreat.tag} mode={mode} />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No tough H2H profile yet.</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {topRival ? (
              <button
                type="button"
                onClick={() => openRivalryDocumentary(topRival.opponentOwner)}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-500/35 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 transition-colors hover:bg-violet-500/20"
              >
                <Clapperboard className="h-3.5 w-3.5" aria-hidden />
                {lens.openRivalriesCta} · {topRival.opponentOwner}
              </button>
            ) : null}
            {biggestThreat && biggestThreat.opponentOwner !== topRival?.opponentOwner ? (
              <button
                type="button"
                onClick={() => openRivalryDocumentary(biggestThreat.opponentOwner)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06]"
              >
                <Clapperboard className="h-3.5 w-3.5" aria-hidden />
                {lens.openRivalriesCta} · {biggestThreat.opponentOwner}
              </button>
            ) : null}
          </div>
          {showRivalryDossier ? (
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#110c14]/80 p-4">
              <RivalryDossierPanel
                focalOwnerKey={profileLookupKey}
                pickerOptions={dossierPickerOptions}
                rivalryEligibleOwnerKeys={rivalryEligibleOwnerKeysForDossier}
                activeSeason={dossierActiveSeason}
                initialOpponentKey={rivalryDocOpponentKey || undefined}
              />
            </div>
          ) : null}
        </IntelPanel>
      ) : null}

      {/* ── 7. Career Highlights / Legacy ──────────────────────────────────── */}
      <IntelPanel id="dossier-highlights" variant="warm" className="scroll-mt-24 overflow-hidden p-4 sm:p-5">
        <DossierSectionHeader icon={<History className="h-4 w-4" />} title={lens.sectionHighlights} accent="#f5c65a" />
        {careerTimeline.length === 0 ? (
          <p className="text-sm text-zinc-500">No career highlights on file yet.</p>
        ) : (
          <div className="relative space-y-0 border-l border-white/[0.08] pl-4">
            {[...careerTimeline].reverse().map((ev, i) => (
              <div key={`${ev.season}-${ev.label}-${i}`} className="relative pb-4 last:pb-0">
                <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-[#f5c65a]/80 ring-2 ring-[#110c14]" aria-hidden />
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{ev.season}</div>
                <div className="text-sm font-semibold text-zinc-100">{ev.label}</div>
                <div className="text-xs text-zinc-500">{ev.detail}</div>
              </div>
            ))}
          </div>
        )}
      </IntelPanel>

      {/* ── 8. Developer ─────────────────────────────────────────────────────── */}
      <Collapsible open={developerOpen} onOpenChange={setDeveloperOpen}>
        <IntelPanel variant="warm" className="overflow-hidden">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-zinc-600 transition-colors hover:bg-white/[0.03]">
            <span>Developer sections</span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", developerOpen && "rotate-180")}
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4 border-t border-white/[0.06] px-4 py-4">
              <Collapsible open={dataSourceOpen} onOpenChange={setDataSourceOpen}>
                <IntelPanel variant="warm" className="overflow-hidden">
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.03]">
                    <span>Data source & diagnostics</span>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", dataSourceOpen && "rotate-180")}
                      aria-hidden
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-4 border-t border-white/[0.06] px-4 py-4">
                      <div className="space-y-1 text-[11px] font-mono text-zinc-500">
                        <div>
                          <span className="text-zinc-600">selectedOwnerKey:</span>{" "}
                          <span className="text-zinc-200">{profileLookupKey}</span>
                        </div>
                        <div>
                          <span className="text-zinc-600">returned ownerKey:</span>{" "}
                          <span className="text-zinc-200">{str((p.dataSourceDiagnostics as any)?.ownerKey ?? "—")}</span>
                        </div>
                        <div>
                          <span className="text-zinc-600">serviceVersion:</span>{" "}
                          <span className="text-zinc-200">{str((p.dataSourceDiagnostics as any)?.serviceVersion ?? "—")}</span>
                        </div>
                      </div>

                      {hasProfileResolutionDiag ? (
                        <div className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-3 text-xs text-zinc-500">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">Profile resolution</p>
                          {unSeas.length > 0 && (
                            <div>
                              <p className="mb-1 font-semibold text-zinc-200">Unresolved season teams (expected 2010–2026 coverage)</p>
                              <ul className="list-disc space-y-0.5 pl-4">
                                {unSeas.map((u) => (
                                  <li key={u.season}>
                                    <span className="text-zinc-200">{u.season}</span>: {str(u.reason)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {missRec.length > 0 && (
                            <div>
                              <p className="mb-1 font-semibold text-zinc-200">Missing matchup record (gmTeams row but 0 RS games)</p>
                              <p className="font-mono text-zinc-400">{missRec.join(", ")}</p>
                            </div>
                          )}
                          {missMed.length > 0 && (
                            <div>
                              <p className="mb-1 font-semibold text-zinc-200">Medal rows that did not join to a team</p>
                              <ul className="list-disc space-y-0.5 pl-4">
                                {missMed.map((m, i) => (
                                  <li key={`${m.season}-${m.slot}-${i}`}>
                                    {m.season} · {str(m.slot)} · {str(m.raw)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {unDraft.length > 0 && (
                            <div>
                              <p className="mb-1 font-semibold text-zinc-200">Draft pick owner resolution</p>
                              <ul className="list-disc space-y-0.5 pl-4">
                                {unDraft.map((n) => (
                                  <li key={n} className="font-mono">
                                    {str(n)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-600">No profile resolution diagnostics for this owner.</p>
                      )}
                    </div>
                  </CollapsibleContent>
                </IntelPanel>
              </Collapsible>
            </div>
          </CollapsibleContent>
        </IntelPanel>
      </Collapsible>

    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export type OwnerProfilesProps = {
  /**
   * RFSN-023 lens — source of truth.
   * `self` = My GM (auth-bound, no scouting paywall / opponent language).
   * `scout` = Owner Dossier (directory + premium scouting gates).
   */
  mode?: OwnerProfilesMode;
  /** Canonical dossier owner id from `/rivals/owners/:ownerId`. Ignored when mode is `self`. */
  routeOwnerId?: string | null;
  /** When true, selecting an owner navigates to `/rivals/owners/:ownerId`. Ignored when mode is `self`. */
  syncSelectionToRoute?: boolean;
  pageEyebrow?: string;
  pageTitle?: string;
  pageSubtitle?: string;
};

export function OwnerProfiles({
  mode = "scout",
  routeOwnerId = null,
  syncSelectionToRoute = false,
  pageEyebrow = "League Intelligence Desk",
  pageTitle,
  pageSubtitle,
}: OwnerProfilesProps = {}) {
  const trpcAny = trpc as any;
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  // Mode is source of truth — never allow scout directory behavior in self lens.
  const authenticatedOwnerOnly = mode === "self";
  const lens = ownerProfilesLensCopy(mode);
  const resolvedTitle =
    pageTitle ?? (mode === "self" ? "My GM" : "Owner Dossier");
  const resolvedSubtitle = pageSubtitle ?? lens.defaultSubtitle;

  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const listQ = trpcAny.owners.ownerList.useQuery(withLeagueSalt({ expectedLeagueId: leagueContextKey }, leagueContextKey), {
    staleTime: 60_000,
    enabled: leagueKeyReady,
    refetchInterval: (query: any) => {
      const d = query.state.data;
      if (query.state.status !== "success" || query.state.fetchStatus === "fetching") return false;
      const dl = d?.leagueId != null ? String(d.leagueId) : "";
      if (dl && dl !== leagueContextKey) return 2500;
      return false;
    },
  });
  const cachedSeasonsQ = trpc.espn.cachedSeasons.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: leagueKeyReady,
  });
  const ownerHomeQ = trpc.me.ownerHome.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: leagueKeyReady,
  });
  // Scout directory paywall banner only — never on My GM self lens.
  const listGated = mode === "scout" && Boolean(listQ.data?.gated);
  const scoutCheckout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (r) => {
      if (r?.url) window.open(r.url, "_blank", "noopener,noreferrer");
      else toast.error("Checkout did not return a link. Try again or contact support.");
    },
    onError: (err) => toast.error(err.message || "Could not start checkout. Please try again."),
  });
  const startScoutCheckout = () => {
    if (typeof window === "undefined") return;
    scoutCheckout.mutate({ origin: window.location.origin });
  };

  const [selectedOwnerKey, setSelectedOwnerKey] = useState<string | null>(null);
  const [showGraveyard, setShowGraveyard] = useState(false);
  const [routeOwnerMissing, setRouteOwnerMissing] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const selectOwner = (id: string) => {
    if (!id) return;
    if (authenticatedOwnerOnly) {
      // My GM never switches to another owner via UI or URL.
      return;
    }
    setSelectedOwnerKey(id);
    setRouteOwnerMissing(false);
    if (syncSelectionToRoute) {
      navigate(rivalsOwnerDossierPath(id), { replace: true });
    }
    setTimeout(() => profileRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  useEffect(() => {
    setSelectedOwnerKey(null);
    setShowGraveyard(false);
    setRouteOwnerMissing(false);
    void utils.owners.ownerList.invalidate();
    void utils.owners.ownerProfile.invalidate();
  }, [leagueContextKey, utils]);

  /** List is trustworthy only when the server-stamped `leagueId` matches the client active league (guards session lag vs `getActive`). */
  const ownerListHydrated = Boolean(
    leagueKeyReady &&
      listQ.isSuccess &&
      !listQ.isFetching &&
      listQ.data?.leagueId != null &&
      String(listQ.data.leagueId) === leagueContextKey,
  );

  const rawActive = (listQ.data?.active ?? []) as any[];
  const rawGraveyard = (listQ.data?.graveyard ?? []) as any[];
  const active = ownerListHydrated ? rawActive : [];
  const graveyard = ownerListHydrated ? rawGraveyard : [];

  const dossierActiveSeason = useMemo(() => {
    const c = cachedSeasonsQ.data ?? [];
    return c.length > 0 ? Math.max(...c) : new Date().getFullYear();
  }, [cachedSeasonsQ.data]);

  const rivalryEligibleOwnerKeysForDossier = useMemo(() => {
    const all = ownerListHydrated ? (listQ.data?.allOwners ?? []) : [];
    return buildDefaultRivalryEligibleOwnerKeys(
      all.map((o: { ownerKey: string; seasons?: number[]; championships?: number }) => ({
        ownerKey: o.ownerKey,
        seasons: Array.isArray(o.seasons) ? o.seasons : [],
        championships: typeof o.championships === "number" ? o.championships : 0,
      })),
      dossierActiveSeason,
    );
  }, [ownerListHydrated, listQ.data?.allOwners, dossierActiveSeason]);

  const powerRankings = useMemo(
    () => (ownerListHydrated ? (listQ.data?.powerRankings ?? []) : []) as any[],
    [ownerListHydrated, listQ.data],
  );
  const ownerAwards = useMemo(
    () => (ownerListHydrated ? (listQ.data?.ownerAwards ?? []) : []) as any[],
    [ownerListHydrated, listQ.data],
  );

  const currentLeagueOwnerKeys = useMemo(() => {
    const s = new Set<string>();
    for (const o of active) {
      const k = listRowLookupKey(o);
      if (k) s.add(k);
    }
    for (const o of graveyard) {
      const k = listRowLookupKey(o);
      if (k) s.add(k);
    }
    return s;
  }, [active, graveyard]);

  const availableOwnerKeysCount = ownerListHydrated ? currentLeagueOwnerKeys.size : 0;

  const viewerOwnerKey = useMemo(() => {
    const fromHome = ownerHomeQ.data?.owner?.ownerKey;
    if (fromHome) return String(fromHome).trim();
    const preview = active.find((o: any) => o.preview);
    return preview ? listRowLookupKey(preview) : null;
  }, [ownerHomeQ.data?.owner?.ownerKey, active]);

  useEffect(() => {
    if (authenticatedOwnerOnly) return;
    if (!ownerListHydrated) return;
    const requested = typeof routeOwnerId === "string" ? routeOwnerId.trim() : "";
    if (!requested) {
      setRouteOwnerMissing(false);
      return;
    }
    const directoryKeys = [...active, ...graveyard]
      .map((o: any) => listRowLookupKey(o))
      .filter(Boolean);
    const resolved = resolveDirectoryOwnerKey(requested, directoryKeys);
    if (resolved) {
      setSelectedOwnerKey(resolved);
      setRouteOwnerMissing(false);
      if (syncSelectionToRoute && resolved !== requested) {
        navigate(rivalsOwnerDossierPath(resolved), { replace: true });
      }
      return;
    }
    setRouteOwnerMissing(true);
  }, [
    authenticatedOwnerOnly,
    ownerListHydrated,
    routeOwnerId,
    active,
    graveyard,
    syncSelectionToRoute,
    navigate,
  ]);

  /** My GM: always bind to me.ownerHome — never URL, never first roster row. */
  useEffect(() => {
    if (!authenticatedOwnerOnly) return;
    if (!ownerListHydrated) return;
    const focal = ownerHomeQ.data?.owner?.ownerKey?.trim() ?? "";
    if (!focal) {
      setSelectedOwnerKey(null);
      setRouteOwnerMissing(false);
      return;
    }
    const directoryKeys = [...active, ...graveyard]
      .map((o: any) => listRowLookupKey(o))
      .filter(Boolean);
    const resolved = resolveDirectoryOwnerKey(focal, directoryKeys) ?? focal;
    setSelectedOwnerKey(resolved);
    setRouteOwnerMissing(false);
  }, [authenticatedOwnerOnly, ownerListHydrated, ownerHomeQ.data?.owner?.ownerKey, active, graveyard]);

  useEffect(() => {
    if (authenticatedOwnerOnly) return;
    if (routeOwnerId) return;
    if (!ownerListHydrated || !listGated || !viewerOwnerKey) return;
    if (!selectedOwnerKey) setSelectedOwnerKey(viewerOwnerKey);
  }, [
    authenticatedOwnerOnly,
    ownerListHydrated,
    listGated,
    viewerOwnerKey,
    selectedOwnerKey,
    routeOwnerId,
  ]);

  useEffect(() => {
    if (!ownerListHydrated) return;
    if (!selectedOwnerKey) return;
    if (authenticatedOwnerOnly) {
      // Keep focal key even if list lag temporarily omits it — profile fetch still uses ownerKey.
      return;
    }
    if (!currentLeagueOwnerKeys.has(selectedOwnerKey)) {
      setSelectedOwnerKey(null);
    }
  }, [ownerListHydrated, selectedOwnerKey, currentLeagueOwnerKeys, authenticatedOwnerOnly]);

  useEffect(() => {
    if (authenticatedOwnerOnly) return;
    if (routeOwnerId) return;
    if (!ownerListHydrated) return;
    if (selectedOwnerKey != null && selectedOwnerKey !== "") return;

    const focalKey = ownerHomeQ.data?.owner?.ownerKey?.trim();
    if (focalKey) {
      for (const o of [...active, ...graveyard] as any[]) {
        const rowKey = listRowLookupKey(o);
        if (rowKey && ownerKeysEqual(rowKey, focalKey)) {
          setSelectedOwnerKey(rowKey);
          return;
        }
      }
    }

    const first =
      listRowLookupKey(active[0]) ||
      listRowLookupKey(graveyard[0]) ||
      "";
    if (first) setSelectedOwnerKey(first);
  }, [
    authenticatedOwnerOnly,
    ownerListHydrated,
    active,
    graveyard,
    selectedOwnerKey,
    ownerHomeQ.data?.owner?.ownerKey,
    routeOwnerId,
  ]);

  const profileKeyValid = Boolean(
    selectedOwnerKey &&
      ownerListHydrated &&
      (authenticatedOwnerOnly || currentLeagueOwnerKeys.has(selectedOwnerKey)),
  );
  const profileShouldRender = profileKeyValid;

  const headerDisplayName = useMemo(() => {
    if (!selectedOwnerKey) return "";
    const row = [...active, ...graveyard].find((o: any) => listRowLookupKey(o) === selectedOwnerKey);
    return displayOwnerName(selectedOwnerKey, row?.ownerName as string);
  }, [active, graveyard, selectedOwnerKey]);

  const dossierPickerOptions = useMemo((): RivalryPickerOption[] => {
    const out: RivalryPickerOption[] = [];
    for (const o of [...active, ...graveyard] as any[]) {
      const ownerKey = listRowLookupKey(o);
      if (!ownerKey) continue;
      out.push({ ownerKey, label: String(o.ownerName ?? ownerKey) });
    }
    return out;
  }, [active, graveyard]);

  if (!leagueKeyReady) {
    return (
      <IntelPageShell bleed minHeight="full" background="cinematic-owner" padding="default" className="text-zinc-100">
        <PageLoading message="Loading league…" />
      </IntelPageShell>
    );
  }

  if (listQ.isError && !listQ.isFetching) {
    return (
      <IntelPageShell bleed minHeight="full" background="cinematic-owner" padding="default" className="text-zinc-100">
        <PageError message={`Could not load owner list for this league. ${String((listQ.error as Error)?.message ?? listQ.error)}`} />
      </IntelPageShell>
    );
  }

  if (!ownerListHydrated) {
    return (
      <IntelPageShell bleed minHeight="full" background="cinematic-owner" padding="default" className="text-zinc-100">
        <PageLoading message="Loading owner profiles…" />
      </IntelPageShell>
    );
  }

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-owner" padding="default" className="text-zinc-100" data-owner-profiles-mode={mode}>
      <CinematicPageHeader
        eyebrowMono={pageEyebrow}
        icon={Users}
        iconAccent="purple"
        title={resolvedTitle}
        subtitle={
          listGated
            ? "Your identity preview — unlock Rivals Pro to scout every manager in your league."
            : resolvedSubtitle
        }
        className="mb-5"
      />

      {listGated ? (
        <IntelPanel variant="warm" className="mb-4 border-[#a3e635]/20 bg-[#a3e635]/[0.04] px-4 py-3 text-sm text-zinc-300">
          Free includes your basic profile and locked previews of other managers. Upgrade to unlock full GM scouting reports.
        </IntelPanel>
      ) : null}

      {routeOwnerMissing ? (
        <IntelPanel variant="warm" className="mb-4 border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm text-zinc-300">
          Owner not found in this league. Pick someone from the directory.
        </IntelPanel>
      ) : null}

      <div className="flex gap-6">
        {!authenticatedOwnerOnly ? (
        <div className="w-72 shrink-0 space-y-2">
          {(() => {
            const renderCard = (o: any, key: string) => (
              <OwnerCard
                key={key}
                o={o}
                selected={listRowLookupKey(o) !== "" && selectedOwnerKey === listRowLookupKey(o)}
                onClick={() => selectOwner(listRowLookupKey(o))}
                onLockedClick={startScoutCheckout}
              />
            );

            if (listGated) {
              // Free tier: just YOU + YOUR BIGGEST RIVAL, then the unlock CTA.
              const rows = active as any[];
              const viewerRow = rows.find((r) => listRowLookupKey(r) === viewerOwnerKey) ?? rows[0] ?? null;
              const rivalRow = rows.find((r) => r !== viewerRow) ?? null;
              const totalOwners = Number((listQ.data as any)?.totalOwners ?? rows.length);
              const remaining = Number((listQ.data as any)?.lockedOwners ?? Math.max(0, totalOwners - rows.length));
              return (
                <>
                  <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">You</div>
                  {viewerRow && renderCard(viewerRow, "gated-you")}
                  {rivalRow && (
                    <>
                      <div className="mt-4 px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a3e635]">Your Biggest Rival</div>
                      {renderCard(rivalRow, "gated-rival")}
                    </>
                  )}
                  {remaining > 0 && (
                    <button
                      type="button"
                      onClick={startScoutCheckout}
                      className="mt-4 w-full rounded-xl border border-[#a3e635]/30 bg-[#a3e635]/[0.06] px-3 py-3 text-center text-xs font-semibold text-[#a3e635] transition-colors hover:bg-[#a3e635]/[0.12]"
                    >
                      Unlock the remaining {remaining} owner{remaining !== 1 ? "s" : ""}
                    </button>
                  )}
                </>
              );
            }

            return active.map((o: any, i: number) => renderCard(o, listRowLookupKey(o) || `active-${i}`));
          })()}

          {graveyard.length > 0 && (
            <div className="mt-4">
              <button type="button" onClick={() => setShowGraveyard(v => !v)}
                className="flex w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-white/[0.04]">
                <Skull className="h-3.5 w-3.5" />
                <span className="flex-1 text-left font-semibold">The Graveyard ({graveyard.length})</span>
                {showGraveyard ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {showGraveyard && (
                <div className="mt-1.5 space-y-1.5 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-3">
              <p className="mb-2 text-[10px] italic text-zinc-600">
                One-season owners. They came, they lost, they left.
              </p>
                  {graveyard.map((o: any, gi: number) => (
                    <button key={listRowLookupKey(o) || `grave-${gi}`} type="button" onClick={() => {
                      const id = listRowLookupKey(o);
                      if (id) selectOwner(id);
                    }}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                        listRowLookupKey(o) !== "" && selectedOwnerKey === listRowLookupKey(o)
                          ? "border-[#a3e635]/45 bg-[#a3e635]/10 text-zinc-100"
                          : "border-white/[0.06] text-zinc-400 hover:bg-white/[0.04]",
                      )}>
                      <span className="font-medium">{o.ownerName}</span>
                      <span className="ml-2 text-zinc-600">{Array.isArray(o.seasons) ? o.seasons[0] : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        ) : null}

        <div ref={profileRef} className="flex-1 min-w-0">
          {profileKeyValid ? (
            <ProfilePanel
              key={`${leagueContextKey}:${selectedOwnerKey}`}
              mode={mode}
              profileLookupKey={selectedOwnerKey!}
              headerDisplayName={headerDisplayName}
              powerRankings={powerRankings}
              ownerAwards={ownerAwards}
              availableOwnerKeysCount={availableOwnerKeysCount}
              dossierPickerOptions={dossierPickerOptions}
              dossierActiveSeason={dossierActiveSeason}
              rivalryEligibleOwnerKeysForDossier={rivalryEligibleOwnerKeysForDossier}
              leagueContextKey={leagueContextKey}
              leagueKeyReady={leagueKeyReady}
            />
          ) : (
            <IntelPanel variant="warm" className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <SectionLoading
                message={
                  authenticatedOwnerOnly
                    ? selectedOwnerKey
                      ? "Loading your GM profile…"
                      : "Finish team setup in Settings to load My GM."
                    : selectedOwnerKey
                      ? "Resolving selection…"
                      : "Select an owner to view their profile."
                }
                className="justify-center"
              />
            </IntelPanel>
          )}
        </div>
      </div>
    </IntelPageShell>
  );
}
