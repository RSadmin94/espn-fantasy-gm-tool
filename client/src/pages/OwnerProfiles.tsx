import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Loader2, AlertTriangle, ChevronDown, ChevronRight,
  Trophy, Users, TrendingUp, Zap, FileText, Skull, Swords,
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

// ─── Profile panel ────────────────────────────────────────────────────────────

function ProfilePanel({ ownerName }: { ownerName: string }) {
  const trpcAny = trpc as any;
  const q = trpcAny.owners.ownerProfile.useQuery({ ownerName });
  const p = q.data as any;

  if (q.isLoading) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading profile…
    </div>
  );
  if (!p) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <AlertTriangle className="mr-2 h-5 w-5" /> Profile not found.
    </div>
  );

  // Destructure using the ACTUAL server field names
  const snap     = p.snapshot     ?? {};
  const draft    = p.draftDNA     ?? {};
  const keeper   = p.keeperDNA    ?? {};
  const activity = p.activityDNA  ?? {};
  const intel    = Array.isArray(p.matchupIntel) ? p.matchupIntel as any[] : [];
  const intelDiag = p.matchupIntelDiagnostics ?? {};

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
      {/* Header */}
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">{ownerName}</h2>
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

      {/* 1. Snapshot */}
      <Section title="Owner Snapshot" icon={<Users className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <StatRow label="Seasons Active"     value={seasons.length > 0 ? `${seasons[0]}–${seasons[seasons.length - 1]} (${seasons.length})` : "—"} />
            <StatRow label="Career Record"      value={`${num(snap.totalWins)}–${num(snap.totalLosses)}${num(snap.totalTies) > 0 ? `–${num(snap.totalTies)}` : ""}`} />
            <StatRow label="Win %"              value={pct(num(snap.winPct))} />
            <StatRow label="Championships"      value={champSeasons.length > 0 ? `${champSeasons.length} (${champSeasons.join(", ")})` : "—"} />
            <StatRow label="Finals Appearances" value={runnerUpSeasons.length > 0 ? `${runnerUpSeasons.length} (${runnerUpSeasons.join(", ")})` : "—"} />
            <StatRow label="3rd Place"          value={thirdSeasons.length > 0 ? `${thirdSeasons.length} (${thirdSeasons.join(", ")})` : "—"} />
          </div>
          <div>
            {snap.bestSeason  && <StatRow label="Best Season"  value={`${snap.bestSeason.season}: ${snap.bestSeason.wins}–${snap.bestSeason.losses}`} />}
            {snap.worstSeason && <StatRow label="Worst Season" value={`${snap.worstSeason.season}: ${snap.worstSeason.wins}–${snap.worstSeason.losses}`} />}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-1.5 pr-3">Season</th>
                <th className="text-left pr-3">Team</th>
                <th className="text-right pr-3">W–L</th>
                <th className="text-right pr-3">Seed</th>
                <th className="text-right">Medal</th>
              </tr>
            </thead>
            <tbody>
              {[...seasonRecords].reverse().map((sr: any) => (
                <tr key={sr.season} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="py-1.5 pr-3 font-medium">{sr.season}</td>
                  <td className="pr-3 text-muted-foreground truncate max-w-[120px]">{sr.teamName}</td>
                  <td className="text-right pr-3">{sr.wins}–{sr.losses}</td>
                  <td className="text-right pr-3 text-muted-foreground">{sr.playoffSeed ?? "—"}</td>
                  <td className="text-right">{sr.isChampion ? "🏆" : sr.isRunnerUp ? "🥈" : sr.isThirdPlace ? "🥉" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

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
                  <th className="text-left py-1.5 pr-3">Opponent</th>
                  <th className="text-right pr-3">Games</th>
                  <th className="text-right pr-3">W–L–T</th>
                  <th className="text-right pr-3">Win %</th>
                  <th className="text-right">Tag</th>
                </tr>
              </thead>
              <tbody>
                {intel.map((row: any) => (
                  <tr key={row.opponentOwner} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="py-1.5 pr-3 font-medium text-foreground">{row.opponentOwner}</td>
                    <td className="text-right pr-3 text-muted-foreground">{num(row.games)}</td>
                    <td className="text-right pr-3 text-muted-foreground">
                      {num(row.wins)}–{num(row.losses)}{num(row.ties) > 0 ? `–${num(row.ties)}` : ""}
                    </td>
                    <td className="text-right pr-3">
                      <span className={cn(
                        "font-medium",
                        num(row.winPct) >= 60 ? "text-emerald-400" :
                        num(row.winPct) <= 40 ? "text-red-400" : "text-foreground",
                      )}>
                        {pct(num(row.winPct))}
                      </span>
                    </td>
                    <td className="text-right"><MatchupTag tag={row.tag} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {num(intelDiag.unresolvedMatchups) > 0 && (
              <p className="mt-2 text-xs text-muted-foreground/60">
                ℹ {num(intelDiag.unresolvedMatchups)} games excluded — opponent owner could not be resolved.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
              {Object.entries(TAG_STYLES).map(([tag, cls]) => (
                <span key={tag} className={cn("rounded border px-1.5 py-0.5 font-semibold uppercase tracking-wide", cls)}>{tag}</span>
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
  const [selected, setSelected] = useState<string | null>(null);
  const [showGraveyard, setShowGraveyard] = useState(false);

  const active    = useMemo(() => (listQ.data?.active    ?? []) as any[], [listQ.data]);
  const graveyard = useMemo(() => (listQ.data?.graveyard ?? []) as any[], [listQ.data]);

  useMemo(() => {
    if (!selected && active.length > 0) setSelected(active[0].ownerName);
  }, [active, selected]);

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
          {active.map((o: any) => (
            <OwnerCard key={o.ownerName} o={o} selected={selected === o.ownerName} onClick={() => setSelected(o.ownerName)} />
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
                  {graveyard.map((o: any) => (
                    <button key={o.ownerName} type="button" onClick={() => setSelected(o.ownerName)}
                      className={cn(
                        "w-full rounded border text-left px-3 py-2 text-xs transition-colors",
                        selected === o.ownerName ? "border-primary/40 bg-primary/5" : "border-border/40 hover:bg-muted/20",
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
          {selected ? (
            <ProfilePanel ownerName={selected} />
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
