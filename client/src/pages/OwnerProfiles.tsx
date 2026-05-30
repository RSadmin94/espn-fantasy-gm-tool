import { useState, useMemo, Fragment, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Loader2, AlertTriangle, ChevronDown, ChevronRight,
  Trophy, Users, TrendingUp, Zap, FileText, Skull, Swords, GitCompare, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(n: number) { return `${Number(n ?? 0).toFixed(1)}%`; }
function num(v: unknown)  { return Number(v ?? 0); }
function str(v: unknown)  { return String(v ?? "—"); }

function Badge({ children, color = "default" }: { children: ReactNode; color?: "gold" | "silver" | "bronze" | "default" }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold",
      color === "gold"    && "border-yellow-600 bg-yellow-900/30 text-yellow-300",
      color === "silver"  && "border-slate-500  bg-slate-800/40  text-slate-300",
      color === "bronze"  && "border-orange-700 bg-orange-900/30 text-orange-300",
      color === "default" && "border-border bg-muted/40 text-foreground",
    )}>
      {children}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-2 last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 bg-muted/30 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
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
        "w-full rounded-lg border text-left px-4 py-3 transition-colors",
        selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-muted/30",
      )}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground text-sm">{o.ownerName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{o.currentTeam}</p>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {num(o.championships) > 0 && <Badge color="gold">🏆 {num(o.championships)}</Badge>}
          {num(o.runnerUps)     > 0 && <Badge color="silver">🥈 {num(o.runnerUps)}</Badge>}
        </div>
      </div>
      <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
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
        tone === "win" && "border-emerald-600/50 bg-emerald-950/25 text-foreground",
        tone === "lose" && "border-border/60 bg-muted/10 text-muted-foreground opacity-80",
        tone === "tie" && "border-border/50 bg-muted/5 text-foreground",
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
}: {
  /** Canonical `owners.ownerList` row id — sent as `ownerKey` on `owners.ownerProfile`. */
  profileLookupKey: string;
  headerDisplayName: string;
  powerRankings: any[];
  ownerAwards: any[];
  /** Distinct ownerKey count from ownerList (active + graveyard). */
  availableOwnerKeysCount: number;
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

  useEffect(() => {
    setIntelExpanded(null);
    setCompareWith("");
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

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] font-mono text-muted-foreground space-y-0.5">
        <div>
          <span className="text-muted-foreground/80">selectedOwnerKey:</span>{" "}
          <span className="text-foreground">{profileLookupKey}</span>
        </div>
        <div>
          <span className="text-muted-foreground/80">returned ownerKey:</span>{" "}
          <span className="text-foreground">{str((p.dataSourceDiagnostics as any)?.ownerKey ?? "—")}</span>
        </div>
        <div>
          <span className="text-muted-foreground/80">serviceVersion:</span>{" "}
          <span className="text-foreground">{str((p.dataSourceDiagnostics as any)?.serviceVersion ?? "—")}</span>
        </div>
      </div>
      {/* Header */}
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">{headerDisplayName}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{str(snap.currentTeam)}</p>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {champSeasons.length   > 0 && <Badge color="gold">🏆 {champSeasons.length}× Champ</Badge>}
            {runnerUpSeasons.length > 0 && <Badge color="silver">🥈 {runnerUpSeasons.length}× Finalist</Badge>}
            {thirdSeasons.length   > 0 && <Badge color="bronze">🥉 {thirdSeasons.length}× 3rd</Badge>}
          </div>
        </div>
        {p.scoutingSummary && (
          <p className="mt-3 text-sm text-muted-foreground/80 italic leading-relaxed border-t border-border/50 pt-3">
            {p.scoutingSummary}
          </p>
        )}
      </div>

      {/* Compare owners */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-sky-400/90" />
            <h2 className="text-sm font-semibold text-foreground">Compare Owners</h2>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
            <label className="text-xs text-muted-foreground shrink-0" htmlFor="owner-compare-select">vs</label>
            <select
              id="owner-compare-select"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground min-w-[160px] max-w-full"
              value={compareWith}
              onChange={(e) => setCompareWith(e.target.value)}
            >
              <option value="">— Select owner —</option>
              {candidates.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        {compareWith && !peer && (q.isFetching || q.isLoading) ? (
          <div className="flex justify-center items-center py-10 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading comparison…</span>
          </div>
        ) : peer ? (
          <div className="p-4 overflow-x-auto">
            <div className="grid grid-cols-[minmax(7.5rem,1fr)_1fr_1fr] gap-x-2 gap-y-1 min-w-[300px]">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-2">Metric</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500/90 py-2 truncate" title={headerDisplayName}>{headerDisplayName}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/90 py-2 truncate" title={compareWith}>{compareWith}</div>

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
                      <div className="text-xs text-muted-foreground py-2 pr-1 border-b border-border/40 flex items-center leading-snug">{row.label}</div>
                      <div className="border-b border-border/40 py-1">
                        <CompareCell tone={tones.left}><span className="font-medium">{row.l}</span></CompareCell>
                      </div>
                      <div className="border-b border-border/40 py-1">
                        <CompareCell tone={tones.right}><span className="font-medium">{row.r}</span></CompareCell>
                      </div>
                    </Fragment>
                  );
                });
              })()}
            </div>
            {(!h2h || h2h.games === 0) && (
              <p className="mt-3 text-xs text-muted-foreground">No regular-season head-to-head matchups on file for this pair.</p>
            )}
          </div>
        ) : compareWith ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">Could not load comparison for that owner.</p>
        ) : (
          <p className="px-4 py-5 text-sm text-muted-foreground">Pick another owner to see side-by-side career stats (same data as your profile).</p>
        )}
      </div>

      {/* 1. Snapshot */}
      <Section title="Owner Snapshot" icon={<Users className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
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
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-1.5 pr-3">Season</th>
                <th className="text-left pr-3">Team</th>
                <th className="text-right pr-3">W–L–T</th>
                <th className="text-right pr-2" title="Completed regular-season matchups counted">RS</th>
                <th className="text-right pr-3">Seed</th>
                <th className="text-right">Medal</th>
              </tr>
            </thead>
            <tbody>
              {[...seasonRecords].reverse().map((sr: any) => (
                <tr key={sr.season} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="py-1.5 pr-3 font-medium">{sr.season}</td>
                  <td className="pr-3 text-muted-foreground truncate max-w-[120px]">{sr.teamName}</td>
                  <td className="text-right pr-3 tabular-nums">{sr.wins}–{sr.losses}{num(sr.ties) ? `–${num(sr.ties)}` : ""}</td>
                  <td className="text-right pr-2 text-muted-foreground tabular-nums">{num(sr.matchupGames) || "—"}</td>
                  <td className="text-right pr-3 text-muted-foreground">{sr.playoffSeed ?? "—"}</td>
                  <td className="text-right">{sr.isChampion ? "🏆" : sr.isRunnerUp ? "🥈" : sr.isThirdPlace ? "🥉" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {(() => {
        const unSeas = Array.isArray(profDiag.unresolvedSeasonTeams) ? profDiag.unresolvedSeasonTeams as { season: number; reason: string }[] : [];
        const missRec = Array.isArray(profDiag.missingRecordSeasons) ? profDiag.missingRecordSeasons as number[] : [];
        const missMed = Array.isArray(profDiag.missingMedalJoinSeasons) ? profDiag.missingMedalJoinSeasons as { season: number; slot: string; raw: string }[] : [];
        const unDraft = Array.isArray(profDiag.unresolvedTeamNames) ? profDiag.unresolvedTeamNames as string[] : [];
        const hasDiag = unSeas.length + missRec.length + missMed.length + unDraft.length > 0;
        if (!hasDiag) return null;
        return (
          <Section title="Profile data diagnostics" icon={<AlertCircle className="h-4 w-4 text-amber-500/90" />} defaultOpen={false}>
            <div className="space-y-3 text-xs text-muted-foreground">
              {unSeas.length > 0 && (
                <div>
                  <p className="font-semibold text-foreground mb-1">Unresolved season teams (expected 2010–2026 coverage)</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {unSeas.map((u) => (
                      <li key={u.season}><span className="text-foreground">{u.season}</span>: {str(u.reason)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {missRec.length > 0 && (
                <div>
                  <p className="font-semibold text-foreground mb-1">Missing matchup record (gmTeams row but 0 RS games)</p>
                  <p className="font-mono">{missRec.join(", ")}</p>
                </div>
              )}
              {missMed.length > 0 && (
                <div>
                  <p className="font-semibold text-foreground mb-1">Medal rows that did not join to a team</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {missMed.map((m, i) => (
                      <li key={`${m.season}-${m.slot}-${i}`}>{m.season} · {str(m.slot)} · {str(m.raw)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {unDraft.length > 0 && (
                <div>
                  <p className="font-semibold text-foreground mb-1">Draft pick owner resolution</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {unDraft.map((n) => (<li key={n} className="font-mono">{str(n)}</li>))}
                  </ul>
                </div>
              )}
            </div>
          </Section>
        );
      })()}

      {/* 2. Draft DNA */}
      <Section title="Draft DNA" icon={<TrendingUp className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <StatRow label="Total Picks"           value={num(draft.totalPicks)} />
            <StatRow label="Top Drafted Positions" value={mostDraftedPos.join(" › ") || "—"} />
          </div>
          <div>
            {mostDraftedPos.slice(0, 3).map(pos => (
              <StatRow key={pos} label={`Avg Round — ${pos}`} value={`Rd ${avgRoundByPos[pos] ?? "—"}`} />
            ))}
          </div>
        </div>
        {sortedPos.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Position Share</p>
            <div className="flex flex-wrap gap-2">
              {sortedPos.map(([pos, share]) => (
                <span key={pos} className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-1 text-xs">
                  <span className="font-semibold text-foreground">{pos}</span>
                  <span className="text-muted-foreground">{pct(share)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {Object.keys(earlyPos).length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Early Rounds 1–3</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(earlyPos).sort((a, b) => b[1] - a[1]).map(([pos, cnt]) => (
                <span key={pos} className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-1 text-xs">
                  <span className="font-semibold text-foreground">{pos}</span>
                  <span className="text-muted-foreground">{cnt} picks</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* 3. Keeper DNA */}
      <Section title="Keeper DNA" icon={<Trophy className="h-4 w-4" />} defaultOpen={false}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Most Recent Keepers</p>
            <div className="flex flex-wrap gap-2">
              {lastYearKeepers.map((k: any, i: number) => (
                <span key={i} className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-1 text-xs">
                  <span className="font-semibold text-foreground">{k.playerName}</span>
                  <span className="text-muted-foreground">{k.position} · Rd {k.round}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* 4. Activity DNA */}
      <Section title="Activity DNA" icon={<Zap className="h-4 w-4" />} defaultOpen={false}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
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
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-1 pr-2">Season</th>
                  <th className="text-right pr-2">Acq</th>
                  <th className="text-right pr-2">Drops</th>
                  <th className="text-right pr-2">Trades</th>
                  <th className="text-right">IR</th>
                </tr>
              </thead>
              <tbody>
                {[...txnSeasons].reverse().filter((t: any) => t.total > 0).map((t: any) => (
                  <tr key={t.season} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="py-1 pr-2 font-medium">{t.season}</td>
                    <td className="text-right pr-2 text-muted-foreground">{t.acquisitions}</td>
                    <td className="text-right pr-2 text-muted-foreground">{t.drops}</td>
                    <td className="text-right pr-2 text-muted-foreground">{t.trades}</td>
                    <td className="text-right text-muted-foreground">{t.moveToIR}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 5. Matchup Intel */}
      <Section title="Matchup Intel" icon={<Swords className="h-4 w-4" />} defaultOpen={false}>
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

  if (listQ.isLoading) return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading owner profiles…
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Owner Profiles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
                className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/20 transition-colors">
                <Skull className="h-3.5 w-3.5" />
                <span className="flex-1 text-left font-semibold">The Graveyard ({graveyard.length})</span>
                {showGraveyard ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {showGraveyard && (
                <div className="mt-1.5 rounded-lg border border-dashed border-border/50 p-3 space-y-1.5 bg-muted/5">
                  <p className="text-[10px] text-muted-foreground/60 mb-2 italic">
                    One-season owners. They came, they lost, they left.
                  </p>
                  {graveyard.map((o: any, gi: number) => (
                    <button key={listRowLookupKey(o) || `grave-${gi}`} type="button" onClick={() => {
                      const id = listRowLookupKey(o);
                      if (id) setSelectedOwnerKey(id);
                    }}
                      className={cn(
                        "w-full rounded border text-left px-3 py-2 text-xs transition-colors",
                        listRowLookupKey(o) !== "" && selectedOwnerKey === listRowLookupKey(o) ? "border-primary/40 bg-primary/5" : "border-border/40 hover:bg-muted/20",
                      )}>
                      <span className="text-muted-foreground font-medium">{o.ownerName}</span>
                      <span className="ml-2 text-muted-foreground/50">{Array.isArray(o.seasons) ? o.seasons[0] : ""}</span>
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
            />
          ) : (
            <div className="flex items-center justify-center h-64 rounded-lg border border-border text-muted-foreground text-sm">
              Select an owner to view their profile.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
