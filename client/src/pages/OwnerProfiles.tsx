// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Loader2, AlertTriangle, ChevronDown, ChevronRight,
  Trophy, Users, TrendingUp, Zap, FileText, Skull,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(n: number) { return `${n.toFixed(1)}%`; }
function dash(v: unknown) { return String(v ?? "—"); }
function num(v: unknown)  { return Number(v ?? 0); }

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
  // Use trpc.owners after moving to dedicated sub-router
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

  const snap    = p.snapshot    ?? {};
  const draft   = p.draftDNA    ?? {};
  const keeper  = p.keeperDNA   ?? {};
  const activity = p.activityDNA ?? {};
  const srecs   = Array.isArray(snap.srecs)    ? snap.srecs    : [];
  const champS  = Array.isArray(snap.champS)   ? snap.champS   : [];
  const runnerS = Array.isArray(snap.runnerS)  ? snap.runnerS  : [];
  const thirdS  = Array.isArray(snap.thirdS)   ? snap.thirdS   : [];
  const seasons = Array.isArray(snap.seasons)  ? snap.seasons  : [];
  const posShare   = (draft.posShare   ?? {}) as Record<string, number>;
  const earlyP     = (draft.earlyP     ?? {}) as Record<string, number>;
  const avgR       = (draft.avgR       ?? {}) as Record<string, number>;
  const topPos     = Array.isArray(draft.topPos) ? draft.topPos as string[] : [];
  const kPos       = (keeper.kPos      ?? {}) as Record<string, number>;
  const lastKept   = Array.isArray(keeper.lastKept) ? keeper.lastKept : [];
  const txn        = Array.isArray(activity.txn) ? activity.txn : [];

  const sortedPos  = Object.entries(posShare).sort((a, b) => b[1] - a[1]);
  const sortedKPos = Object.entries(kPos).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">{ownerName}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{dash(snap.curTeam)}</p>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {champS.length  > 0 && <Badge color="gold">🏆 {champS.length}× Champ</Badge>}
            {runnerS.length > 0 && <Badge color="silver">🥈 {runnerS.length}× Finalist</Badge>}
            {thirdS.length  > 0 && <Badge color="bronze">🥉 {thirdS.length}× 3rd</Badge>}
          </div>
        </div>
        {p.scouting && (
          <p className="mt-3 text-sm text-muted-foreground/80 italic leading-relaxed border-t border-border/50 pt-3">
            {p.scouting}
          </p>
        )}
      </div>

      {/* 1. Snapshot */}
      <Section title="Owner Snapshot" icon={<Users className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <StatRow label="Seasons Active"     value={seasons.length > 0 ? `${seasons[0]}–${seasons[seasons.length - 1]} (${seasons.length})` : "—"} />
            <StatRow label="Career Record"      value={`${num(snap.W)}–${num(snap.L)}${num(snap.Ti) > 0 ? `–${num(snap.Ti)}` : ""}`} />
            <StatRow label="Win %"              value={pct(num(snap.winPct))} />
            <StatRow label="Championships"      value={champS.length > 0 ? `${champS.length} (${champS.join(", ")})` : "—"} />
            <StatRow label="Finals Appearances" value={runnerS.length > 0 ? `${runnerS.length} (${runnerS.join(", ")})` : "—"} />
            <StatRow label="3rd Place"          value={thirdS.length > 0 ? `${thirdS.length} (${thirdS.join(", ")})` : "—"} />
          </div>
          <div>
            {snap.bestS  && <StatRow label="Best Season"  value={`${snap.bestS.season}: ${snap.bestS.wins}–${snap.bestS.losses}`} />}
            {snap.worstS && <StatRow label="Worst Season" value={`${snap.worstS.season}: ${snap.worstS.wins}–${snap.worstS.losses}`} />}
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
              {[...srecs].reverse().map((sr: any) => (
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
            <StatRow label="Total Picks"              value={num(draft.totalPicks)} />
            <StatRow label="Top Drafted Positions"    value={topPos.join(" › ") || "—"} />
          </div>
          <div>
            {topPos.slice(0, 3).map(pos => (
              <StatRow key={pos} label={`Avg Round — ${pos}`} value={`Rd ${avgR[pos] ?? "—"}`} />
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
        {Object.keys(earlyP).length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Early Rounds 1–3</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(earlyP).sort((a, b) => b[1] - a[1]).map(([pos, cnt]) => (
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
            <StatRow label="Total Keepers"    value={num(keeper.kTotal)} />
            <StatRow label="Keeper Rate"      value={pct(num(keeper.kRate))} />
            <StatRow label="Avg Keeper Round" value={keeper.avgKR != null ? `Rd ${keeper.avgKR}` : "—"} />
          </div>
          <div>
            {sortedKPos.map(([pos, cnt]) => (
              <StatRow key={pos} label={`${pos} keepers`} value={cnt} />
            ))}
          </div>
        </div>
        {lastKept.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Most Recent Keepers</p>
            <div className="flex flex-wrap gap-2">
              {lastKept.map((k: any, i: number) => (
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
            <StatRow label="Total Acquisitions" value={num(activity.tAcq)} />
            <StatRow label="Total Drops"         value={num(activity.tDrop)} />
            <StatRow label="Total Trades"        value={num(activity.tTrd)} />
            <StatRow label="IR Moves"            value={num(activity.tIR)} />
          </div>
          <div>
            <StatRow label="Avg Txn / Season"   value={num(activity.avgT)} />
            {activity.mostAct && (
              <StatRow label="Most Active Season" value={`${(activity.mostAct as any).season} (${(activity.mostAct as any).total} moves)`} />
            )}
          </div>
        </div>
        {txn.length > 0 && (
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
                {[...txn].reverse().filter((t: any) => t.total > 0).map((t: any) => (
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

      {/* 5. Scouting Summary */}
      <Section title="Scouting Summary" icon={<FileText className="h-4 w-4" />} defaultOpen={false}>
        <p className="text-sm text-foreground leading-relaxed">{dash(p.scouting)}</p>
        {p.diagnostics?.unresolvedLegacy > 0 && (
          <p className="mt-2 text-xs text-muted-foreground/60">
            ℹ {p.diagnostics.unresolvedLegacy} pre-2018 picks could not be attributed to any owner.
          </p>
        )}
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
        {/* Sidebar */}
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

        {/* Profile panel */}
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
