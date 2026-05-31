import { useState, useMemo, Fragment, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";
import { RivalryDossierPanel, type RivalryPickerOption } from "@/components/RivalryDossierPanel";
import { buildDefaultRivalryEligibleOwnerKeys } from "@/lib/rivalryOwnerEligibility";
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
      "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold",
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
    <div className={cn(PROFILE_SURFACE, "flex flex-col overflow-hidden")}>
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
          {title}
          <Info className="h-3.5 w-3.5 text-zinc-600" aria-hidden />
        </h3>
        {right}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn(PROFILE_SURFACE, "overflow-hidden")}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-colors hover:bg-white/[0.04]">
        <span className="text-zinc-500">{icon}</span>
        <span className="text-sm font-semibold tracking-tight text-zinc-100 flex-1">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

// ─── Matchup tag styling ──────────────────────────────────────────────────────

const TAG_STYLES: Record<string, string> = {
  "Nemesis":      "border-red-700 bg-red-900/30 text-red-300",
  "Punching Bag": "border-emerald-700 bg-emerald-900/30 text-emerald-300",
  "Rival":        "border-amber-700 bg-amber-900/30 text-amber-300",
  "Favorable":    "border-blue-700 bg-blue-900/30 text-blue-300",
  "Difficult":    "border-orange-700 bg-orange-900/30 text-orange-300",
  "Normal":       "border-border bg-muted/30 text-muted-foreground",
};

/** Owner profile / Draft DNA surface — matches command-center mockup cards */
const PROFILE_SURFACE =
  "rounded-xl border border-white/[0.08] bg-[#0f131c]/95 shadow-[0_0_28px_-14px_rgba(0,0,0,0.65)]";

const POS_TEXT: Record<string, string> = {
  RB: "text-red-400",
  WR: "text-blue-400",
  QB: "text-emerald-400",
  TE: "text-purple-400",
  K: "text-orange-400",
  DEF: "text-zinc-400",
  DST: "text-zinc-400",
};

const POS_BAR: Record<string, string> = {
  RB: "bg-red-500",
  WR: "bg-blue-500",
  QB: "bg-emerald-500",
  TE: "bg-purple-500",
  K: "bg-orange-500",
  DEF: "bg-zinc-500",
  DST: "bg-zinc-500",
};

const EARLY_CONIC: Record<string, string> = {
  RB: "#ef4444",
  WR: "#3b82f6",
  QB: "#22c55e",
  TE: "#a855f7",
  K: "#f97316",
  DEF: "#71717a",
  DST: "#71717a",
};

function MatchupTag({ tag }: { tag: string }) {
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", TAG_STYLES[tag] ?? TAG_STYLES.Normal)}>
      {tag}
    </span>
  );
}

// ─── Owner card ───────────────────────────────────────────────────────────────

function OwnerCard({ o, selected, onClick }: { o: any; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "w-full rounded-xl border text-left px-4 py-3 transition-all",
        PROFILE_SURFACE,
        selected
          ? "border-red-500/45 ring-1 ring-red-500/25 shadow-[0_0_24px_-10px_rgba(239,68,68,0.35)]"
          : "border-white/[0.08] hover:border-red-500/20 hover:bg-white/[0.03]",
      )}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm text-zinc-100">{o.ownerName}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{o.currentTeam}</p>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {num(o.championships) > 0 && <Badge color="gold">🏆 {num(o.championships)}</Badge>}
          {num(o.runnerUps)     > 0 && <Badge color="silver">🥈 {num(o.runnerUps)}</Badge>}
        </div>
      </div>
      <div className="mt-2 flex gap-3 text-xs text-zinc-500">
        <span>{num(o.totalWins)}–{num(o.totalLosses)}</span>
        <span>{pct(num(o.winPct))} win</span>
        <span>{Array.isArray(o.seasons) ? o.seasons.length : 0} season{(Array.isArray(o.seasons) ? o.seasons.length : 0) !== 1 ? "s" : ""}</span>
      </div>
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
        tone === "win" && "border-emerald-500/30 bg-emerald-500/10 text-zinc-100",
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

function ProfilePanel({
  profileLookupKey,
  headerDisplayName,
  powerRankings,
  ownerAwards,
  availableOwnerKeysCount,
  dossierPickerOptions,
  dossierActiveSeason,
  rivalryEligibleOwnerKeysForDossier,
}: {
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
}) {
  const trpcAny = trpc as any;
  const [compareWith, setCompareWith] = useState("");
  const profileArgs = useMemo(() => {
    const base = compareWith ? { compareWith } : {};
    const k = profileLookupKey.trim();
    return { ownerKey: k, ...base };
  }, [profileLookupKey, compareWith]);

  const q = trpcAny.owners.ownerProfile.useQuery(profileArgs, { enabled: !!profileLookupKey.trim() });
  const p = q.data as any;
  const [intelExpanded, setIntelExpanded] = useState<string | null>(null);
  const [showRivalryDossier, setShowRivalryDossier] = useState(false);
  const [profileTab, setProfileTab] = useState<"snapshot" | "draft" | "keeper" | "activity">("draft");
  const [dataSourceOpen, setDataSourceOpen] = useState(false);

  useEffect(() => {
    setIntelExpanded(null);
    setCompareWith("");
    setShowRivalryDossier(false);
    setProfileTab("draft");
    setDataSourceOpen(false);
  }, [profileLookupKey]);

  if (q.isPending || q.isLoading) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading profile…
    </div>
  );
  if (q.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        <AlertTriangle className="mb-2 inline h-5 w-5" /> Could not load profile: {String((q.error as Error)?.message ?? q.error)}
        <div className="mt-3 font-mono text-xs text-foreground/80 space-y-1">
          <div>ownerKey (query input): {profileLookupKey}</div>
          <div>ownerList ownerKey count: {availableOwnerKeysCount}</div>
        </div>
      </div>
    );
  }
  if (!p) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 px-4 py-6 text-sm text-amber-100/90">
        <AlertTriangle className="mb-2 inline h-5 w-5 text-amber-400" /> Profile not found.
        <div className="mt-3 font-mono text-[11px] text-foreground/85 space-y-1">
          <div>
            <span className="text-muted-foreground">selectedOwnerKey:</span> {profileLookupKey}
          </div>
          <div>
            <span className="text-muted-foreground">available ownerKeys (from list):</span> {availableOwnerKeysCount}
          </div>
        </div>
      </div>
    );
  }

  // Destructure using the ACTUAL server field names
  const snap     = p.snapshot     ?? {};
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
      : { background: "conic-gradient(#27272a 0deg 360deg)" };

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

  return (
    <div className="space-y-6">
      {/* Profile header — mockup: avatar + name + meta + tab strip */}
      <div className={cn(PROFILE_SURFACE, "overflow-hidden")}>
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-red-500/50 bg-zinc-900 text-lg font-bold text-zinc-100 shadow-[0_0_28px_-6px_rgba(239,68,68,0.55)]"
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
                <h2 className="text-2xl font-bold tracking-tight text-zinc-50">{headerDisplayName}</h2>
                <p className="mt-0.5 text-sm text-zinc-500">{str(snap.currentTeam)}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {champSeasons.length > 0 && <Badge color="gold">🏆 {champSeasons.length}× Champ</Badge>}
                {runnerUpSeasons.length > 0 && <Badge color="silver">🥈 {runnerUpSeasons.length}× Finalist</Badge>}
                {thirdSeasons.length > 0 && <Badge color="bronze">🥉 {thirdSeasons.length}× 3rd</Badge>}
              </div>
            </div>
            <p className="mt-3 text-sm text-zinc-400">
              Active since {seasons.length > 0 ? String(seasons[0]) : "—"} · {champSeasons.length} Championships
              {(() => {
                const prMe = powerRankings.find((r: any) => listRowLookupKey(r) === profileLookupKey);
                const sc = prMe != null && prMe.score != null ? num(prMe.score) : null;
                return (
                  <>
                    {" "}
                    · Power Score:{" "}
                    {sc != null && sc > 0 ? (
                      <span
                        className="font-semibold text-red-400 tabular-nums"
                        title="From owners.ownerList powerRankings composite score"
                      >
                        {Math.round(sc)}
                      </span>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </>
                );
              })()}
            </p>
            {p.scoutingSummary && (
              <p className="mt-3 border-t border-white/[0.06] pt-3 text-sm italic leading-relaxed text-zinc-500">
                {p.scoutingSummary}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-0 border-t border-white/[0.06] px-2">
          {(
            [
              { id: "snapshot" as const, label: "Snapshot", Icon: Gauge },
              { id: "draft" as const, label: "Draft DNA", Icon: Dna },
              { id: "keeper" as const, label: "Keeper DNA", Icon: Shield },
              { id: "activity" as const, label: "Activity DNA", Icon: Activity },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = profileTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setProfileTab(id)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1.5 border-b-2 py-3 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:text-xs",
                  active
                    ? "border-red-500 text-red-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-300",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-red-400" : "text-zinc-600")} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Compare owners */}
      <div className={cn(PROFILE_SURFACE, "overflow-hidden")}>
        <div className="flex flex-col gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-blue-400/90" />
            <h2 className="text-sm font-semibold tracking-tight text-zinc-100">Compare Owners</h2>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
            <label className="shrink-0 text-xs text-zinc-500" htmlFor="owner-compare-select">
              vs
            </label>
            <select
              id="owner-compare-select"
              className="min-w-[160px] max-w-full rounded-md border border-white/[0.1] bg-[#0b0e14] px-2 py-1.5 text-sm text-zinc-100"
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
          </div>
        </div>
        {compareWith && !peer && (q.isFetching || q.isLoading) ? (
          <div className="flex items-center justify-center gap-2 py-10 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading comparison…</span>
          </div>
        ) : peer ? (
          <div className="overflow-x-auto p-4">
            <div className="grid min-w-[300px] grid-cols-[minmax(7.5rem,1fr)_1fr_1fr] gap-x-2 gap-y-1">
              <div className="py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Metric</div>
              <div
                className="truncate py-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90"
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
                const topL = topDraftedPosCount(draft as Record<string, unknown>);
                const topR = topDraftedPosCount(draftP as Record<string, unknown>);

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
                    w: cmp3(medalScore(snap as Record<string, unknown>), medalScore(snapP as Record<string, unknown>)),
                  },
                  { label: "Total draft picks", l: num(draft.totalPicks), r: num(draftP.totalPicks), w: cmp3(num(draft.totalPicks), num(draftP.totalPicks)) },
                  { label: "Most drafted (pos)", l: topL.label, r: topR.label, w: cmp3(topL.count, topR.count) },
                  { label: "Keeper rate", l: pct(num(keeper.keeperRate)), r: pct(num(keeperP.keeperRate)), w: cmp3(num(keeper.keeperRate), num(keeperP.keeperRate)) },
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
          <p className="px-4 py-5 text-sm text-zinc-500">Could not load comparison for that owner.</p>
        ) : (
          <p className="px-4 py-5 text-sm text-zinc-500">
            Pick another owner to see side-by-side career stats (same data as your profile).
          </p>
        )}
      </div>

      {/* Tab panels — layout matches Draft DNA mockup (dark cards, position colors, gold insights) */}
      {profileTab === "snapshot" && (
        <div className="space-y-4">
          <div className={cn(PROFILE_SURFACE, "overflow-hidden p-4 sm:p-5")}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-100">
              <Users className="h-4 w-4 text-zinc-500" aria-hidden />
              Owner snapshot
            </h3>
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <StatRow label="Seasons Active"     value={seasons.length > 0 ? `${seasons[0]}–${seasons[seasons.length - 1]} (${seasons.length})` : "—"} />
                <StatRow label="Career Record"      value={`${num(snap.totalWins)}–${num(snap.totalLosses)}${num(snap.totalTies) > 0 ? `–${num(snap.totalTies)}` : ""} (RS matchups)`} />
                <StatRow label="Win %"              value={pct(num(snap.winPct))} />
                <StatRow label="Championships"      value={champSeasons.length > 0 ? `${champSeasons.length} (${champSeasons.join(", ")})` : "—"} />
                <StatRow label="Finals Appearances" value={runnerUpSeasons.length > 0 ? `${runnerUpSeasons.length} (${runnerUpSeasons.join(", ")})` : "—"} />
                <StatRow label="3rd Place"          value={thirdSeasons.length > 0 ? `${thirdSeasons.length} (${thirdSeasons.join(", ")})` : "—"} />
              </div>
              <div>
                {snap.bestSeason?.season > 0 && (
                  <StatRow
                    label="Best Season"
                    value={`${snap.bestSeason.season}: ${snap.bestSeason.wins}–${snap.bestSeason.losses}${num(snap.bestSeason.ties) ? `–${num(snap.bestSeason.ties)}` : ""}`}
                  />
                )}
                {snap.worstSeason?.season > 0 && (
                  <StatRow
                    label="Worst Season"
                    value={`${snap.worstSeason.season}: ${snap.worstSeason.wins}–${snap.worstSeason.losses}${num(snap.worstSeason.ties) ? `–${num(snap.worstSeason.ties)}` : ""}`}
                  />
                )}
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-zinc-500">
                    <th className="py-1.5 pr-3 text-left">Season</th>
                    <th className="pr-3 text-left">Team</th>
                    <th className="pr-3 text-right">W–L–T</th>
                    <th className="pr-2 text-right" title="Completed regular-season matchups counted">RS</th>
                    <th className="pr-3 text-right">Seed</th>
                    <th className="text-right">Medal</th>
                  </tr>
                </thead>
                <tbody>
                  {[...seasonRecords].reverse().map((sr: any) => (
                    <tr key={sr.season} className="border-b border-white/[0.05] hover:bg-white/[0.03]">
                      <td className="py-1.5 pr-3 font-medium text-zinc-200">{sr.season}</td>
                      <td className="max-w-[120px] truncate pr-3 text-zinc-500">{sr.teamName}</td>
                      <td className="pr-3 text-right tabular-nums text-zinc-300">{sr.wins}–{sr.losses}{num(sr.ties) ? `–${num(sr.ties)}` : ""}</td>
                      <td className="pr-2 text-right tabular-nums text-zinc-500">{num(sr.matchupGames) || "—"}</td>
                      <td className="pr-3 text-right text-zinc-500">{sr.playoffSeed ?? "—"}</td>
                      <td className="text-right">{sr.isChampion ? "🏆" : sr.isRunnerUp ? "🥈" : sr.isThirdPlace ? "🥉" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Collapsible open={dataSourceOpen} onOpenChange={setDataSourceOpen} className={cn(PROFILE_SURFACE, "overflow-hidden")}>
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.03]">
              <span>Data source</span>
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
          </Collapsible>
        </div>
      )}

      {profileTab === "draft" && (
        <div className="space-y-4">
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
            <ProfileShellCard title="Early round tendencies (rounds 1–3)">
              {earlySorted.length > 0 ? (
                <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
                  <div className="relative h-44 w-44 shrink-0">
                    <div
                      className="absolute inset-0 rounded-full shadow-[inset_0_0_0_12px_#0b0e14]"
                      style={earlyConicStyle}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-white/[0.08] bg-[#0b0e14]/95 text-lg" aria-hidden>
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
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Draft DNA insights</h3>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3 sm:flex sm:gap-3">
                <div className="mx-auto mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/15 sm:mx-0 sm:mb-0">
                  <Crosshair className="h-5 w-5 text-amber-300" aria-hidden />
                </div>
                <div className="min-w-0 text-center sm:text-left">
                  <p className="text-sm font-semibold text-amber-200">Position share (draft DNA)</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {topSharePos
                      ? `${String(topSharePos[0]).toUpperCase()} has the largest recorded share at ${pct(num(topSharePos[1]))} of picks (draft DNA posShare).`
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
                <StatRow label="Total Picks"           value={num(draft.totalPicks)} />
                <StatRow label="Top Drafted Positions" value={mostDraftedPos.join(" › ") || "—"} />
              </div>
              <div>
                {mostDraftedPos.slice(0, 3).map((pos) => (
                  <StatRow key={pos} label={`Avg Round — ${pos}`} value={`Rd ${avgRoundByPos[pos] ?? "—"}`} />
                ))}
              </div>
            </div>
          </ProfileShellCard>
        </div>
      )}

      {profileTab === "keeper" && (
        <div className={cn(PROFILE_SURFACE, "overflow-hidden p-4 sm:p-5")}>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Trophy className="h-4 w-4 text-amber-500/80" aria-hidden />
            Keeper DNA
          </h3>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <StatRow label="Total Keepers"    value={num(keeper.totalKeepers)} />
              <StatRow label="Keeper Rate"      value={pct(num(keeper.keeperRate))} />
              <StatRow label="Avg Keeper Round" value={keeper.avgKeeperRound != null ? `Rd ${keeper.avgKeeperRound}` : "—"} />
            </div>
            <div>
              {sortedKPos.map(([pos, cnt]) => (
                <StatRow key={pos} label={`${pos} keepers`} value={cnt} />
              ))}
            </div>
          </div>
          {lastYearKeepers.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Most Recent Keepers</p>
              <div className="flex flex-wrap gap-2">
                {lastYearKeepers.map((k: any, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs">
                    <span className="font-semibold text-zinc-100">{k.playerName}</span>
                    <span className="text-zinc-500">{k.position} · Rd {k.round}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {profileTab === "activity" && (
        <div className={cn(PROFILE_SURFACE, "overflow-hidden p-4 sm:p-5")}>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Zap className="h-4 w-4 text-amber-500/80" aria-hidden />
            Activity DNA
          </h3>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <StatRow label="Total Acquisitions" value={num(activity.totalAcq)} />
              <StatRow label="Total Drops"         value={num(activity.totalDrops)} />
              <StatRow label="Total Trades"        value={num(activity.totalTrades)} />
              <StatRow label="IR Moves"            value={num(activity.totalIR)} />
            </div>
            <div>
              <StatRow label="Avg Txn / Season"   value={num(activity.avgTxnPerSeason)} />
              {activity.mostActiveSeason && (
                <StatRow label="Most Active Season"
                  value={`${(activity.mostActiveSeason as any).season} (${(activity.mostActiveSeason as any).total} moves)`} />
              )}
            </div>
          </div>
          {txnSeasons.filter((t: any) => t.total > 0).length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-zinc-500">
                    <th className="py-1 pr-2 text-left">Season</th>
                    <th className="pr-2 text-right">Acq</th>
                    <th className="pr-2 text-right">Drops</th>
                    <th className="pr-2 text-right">Trades</th>
                    <th className="text-right">IR</th>
                  </tr>
                </thead>
                <tbody>
                  {[...txnSeasons].reverse().filter((t: any) => t.total > 0).map((t: any) => (
                    <tr key={t.season} className="border-b border-white/[0.05] hover:bg-white/[0.03]">
                      <td className="py-1 pr-2 font-medium text-zinc-200">{t.season}</td>
                      <td className="pr-2 text-right text-zinc-500">{t.acquisitions}</td>
                      <td className="pr-2 text-right text-zinc-500">{t.drops}</td>
                      <td className="pr-2 text-right text-zinc-500">{t.trades}</td>
                      <td className="text-right text-zinc-500">{t.moveToIR}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 5. Matchup Intel */}
      <Section title="Matchup Intel" icon={<Swords className="h-4 w-4" />} defaultOpen={false}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-zinc-500">
            Intel uses matchup pipeline with cache fallback; dossier uses completed gmMatchups (RS + playoffs).
          </p>
          <button
            type="button"
            onClick={() => setShowRivalryDossier((v) => !v)}
            className="text-xs font-medium text-blue-400 underline-offset-2 hover:text-blue-300 hover:underline"
          >
            {showRivalryDossier ? "Hide rivalry dossier" : "Rivalry dossier (gmMatchups)"}
          </button>
        </div>
        {showRivalryDossier && (
          <div className="mb-4 rounded-xl border border-white/[0.08] bg-[#0b0e14]/80 p-4">
            <RivalryDossierPanel
              focalOwnerKey={profileLookupKey}
              pickerOptions={dossierPickerOptions}
              rivalryEligibleOwnerKeys={rivalryEligibleOwnerKeysForDossier}
              activeSeason={dossierActiveSeason}
            />
          </div>
        )}
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
                  <th className="text-left py-1.5 pr-3">Opponent</th>
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
                                ? "text-emerald-400"
                                : num(row.winPct) <= 40
                                  ? "text-red-400"
                                  : "text-foreground",
                            )}
                          >
                            {pct(num(row.winPct))}
                          </span>
                        </td>
                        <td className="text-right">
                          <MatchupTag tag={row.tag} />
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border/30 bg-muted/15">
                          <td colSpan={6} className="px-3 py-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              Last 5 meetings
                            </p>
                            {games.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No game rows on file for this opponent.</p>
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
                  {tag}
                </span>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* 6. Scouting Summary */}
      <Section title="Scouting Summary" icon={<FileText className="h-4 w-4" />} defaultOpen={false}>
        <p className="text-sm text-foreground leading-relaxed">{str(p.scoutingSummary)}</p>
      </Section>

    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function OwnerProfiles() {
  const trpcAny = trpc as any;
  const listQ = trpcAny.owners.ownerList.useQuery();
  const cachedSeasonsQ = trpc.espn.cachedSeasons.useQuery(undefined, { staleTime: 60_000 });

  const dossierActiveSeason = useMemo(() => {
    const c = cachedSeasonsQ.data ?? [];
    return c.length > 0 ? Math.max(...c) : new Date().getFullYear();
  }, [cachedSeasonsQ.data]);

  const rivalryEligibleOwnerKeysForDossier = useMemo(() => {
    const all = listQ.data?.allOwners ?? [];
    return buildDefaultRivalryEligibleOwnerKeys(
      all.map((o: { ownerKey: string; seasons?: number[]; championships?: number }) => ({
        ownerKey: o.ownerKey,
        seasons: Array.isArray(o.seasons) ? o.seasons : [],
        championships: typeof o.championships === "number" ? o.championships : 0,
      })),
      dossierActiveSeason,
    );
  }, [listQ.data?.allOwners, dossierActiveSeason]);
  const [selectedOwnerKey, setSelectedOwnerKey] = useState<string | null>(null);
  const [showGraveyard, setShowGraveyard] = useState(false);

  const active    = useMemo(() => (listQ.data?.active    ?? []) as any[], [listQ.data]);
  const graveyard = useMemo(() => (listQ.data?.graveyard ?? []) as any[], [listQ.data]);
  const powerRankings = useMemo(() => (listQ.data?.powerRankings ?? []) as any[], [listQ.data]);
  const ownerAwards = useMemo(() => (listQ.data?.ownerAwards ?? []) as any[], [listQ.data]);

  const availableOwnerKeysCount = useMemo(() => {
    const s = new Set<string>();
    for (const o of active) {
      const k = listRowLookupKey(o);
      if (k) s.add(k);
    }
    for (const o of graveyard) {
      const k = listRowLookupKey(o);
      if (k) s.add(k);
    }
    return s.size;
  }, [active, graveyard]);

  useEffect(() => {
    if (selectedOwnerKey != null && selectedOwnerKey !== "") return;
    const first =
      listRowLookupKey(active[0]) ||
      listRowLookupKey(graveyard[0]) ||
      "";
    if (first) setSelectedOwnerKey(first);
  }, [active, graveyard, selectedOwnerKey]);

  const headerDisplayName = useMemo(() => {
    if (!selectedOwnerKey) return "";
    const row = [...active, ...graveyard].find((o: any) => listRowLookupKey(o) === selectedOwnerKey);
    return (row?.ownerName as string) || selectedOwnerKey;
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

  if (listQ.isLoading) return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading owner profiles…
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl bg-[#0b0e14] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50">Owner Profiles</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {active.length} active owner{active.length !== 1 ? "s" : ""} · click to view full profile
        </p>
      </div>

      <div className="flex gap-6">
        <div className="w-72 shrink-0 space-y-2">
          {active.map((o: any, i: number) => (
            <OwnerCard
              key={listRowLookupKey(o) || `active-${i}`}
              o={o}
              selected={listRowLookupKey(o) !== "" && selectedOwnerKey === listRowLookupKey(o)}
              onClick={() => {
                const id = listRowLookupKey(o);
                if (id) setSelectedOwnerKey(id);
              }}
            />
          ))}

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
                      if (id) setSelectedOwnerKey(id);
                    }}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                        listRowLookupKey(o) !== "" && selectedOwnerKey === listRowLookupKey(o)
                          ? "border-red-500/40 bg-red-500/10 text-zinc-100"
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

        <div className="flex-1 min-w-0">
          {selectedOwnerKey ? (
            <ProfilePanel
              profileLookupKey={selectedOwnerKey}
              headerDisplayName={headerDisplayName}
              powerRankings={powerRankings}
              ownerAwards={ownerAwards}
              availableOwnerKeysCount={availableOwnerKeysCount}
              dossierPickerOptions={dossierPickerOptions}
              dossierActiveSeason={dossierActiveSeason}
              rivalryEligibleOwnerKeysForDossier={rivalryEligibleOwnerKeysForDossier}
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-white/[0.08] bg-[#0f131c]/50 text-sm text-zinc-500">
              Select an owner to view their profile.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
