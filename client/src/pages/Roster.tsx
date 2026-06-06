import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Users,
  Key,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MinusCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

// ── theme (matches Command Dashboard) ───────────────────────────────────────
const TEXT = "#f3f8ff",
  MUTED = "#8b97a8",
  GOLD = "#f5c518",
  ACCENT = "#a3e635",
  RED = "#ef4444",
  LINE = "rgba(255,255,255,.07)";
const PAGEBG: React.CSSProperties = {
  background:
    "radial-gradient(circle at 80% -10%,rgba(139,92,246,.20),transparent 42%),linear-gradient(180deg,#0e0a10,#080609)",
  color: TEXT,
};
const PANEL: React.CSSProperties = {
  background: "linear-gradient(180deg,#1b131f,#140e17)",
  border: `1px solid ${LINE}`,
  borderRadius: 15,
};
const SUB: React.CSSProperties = {
  background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(255,255,255,.06)",
  borderRadius: 10,
};

function Pill({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span
      className="px-4 py-2.5 rounded-[10px] text-[13px] font-extrabold inline-flex items-center"
      style={
        gold
          ? { color: GOLD, border: "1px solid rgba(245,198,90,.46)", background: "rgba(245,198,90,.10)" }
          : { border: `1px solid ${LINE}`, background: "rgba(255,255,255,.04)", color: TEXT }
      }
    >
      {children}
    </span>
  );
}

function SectionHead({
  icon: Icon,
  title,
  right,
  iconColor = ACCENT,
}: {
  icon: any;
  title: React.ReactNode;
  right?: React.ReactNode;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[18px] md:text-[20px] font-extrabold tracking-tight flex items-center gap-2 min-w-0">
        <Icon className="h-5 w-5 shrink-0" style={{ color: iconColor }} /> <span className="truncate">{title}</span>
      </h3>
      {right}
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section style={PANEL} className={`overflow-hidden ${className}`}>
      <div className="p-[18px] md:p-5">{children}</div>
    </section>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamRow {
  teamId: number;
  teamName: string;
  owners?: string;
}

interface RosterEntry {
  teamId: number;
  teamName?: string;
  playerId?: number;
  playerName?: string;
  position?: string;
  lineupSlot?: string;
  acquisitionType?: string;
  injuryStatus?: string;
  appliedTotal?: number | null;
  appliedAverage?: number | null;
  projectedTotal?: number | null;
  keeperValue?: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Display order for lineup slots
const SLOT_ORDER = [
  "QB", "RB", "RB/WR", "WR", "TE", "FLEX", "RB/WR/TE", "K", "D/ST",
  "Bench", "IR", "BE",
];

const INJURY_COLORS: Record<string, string> = {
  ACTIVE:       "text-lime-400",
  QUESTIONABLE: "text-yellow-400",
  DOUBTFUL:     "text-orange-400",
  OUT:          "text-red-400",
  IR:           "text-red-500",
  SUSPENSION:   "text-red-500",
  PUP:          "text-orange-400",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 1) {
  if (n == null) return "—";
  return Number(n).toFixed(decimals);
}

function warRoomKvsForPlayer(keeperPredictions: any[] | undefined, teamId: number, playerName: string | undefined) {
  if (!keeperPredictions?.length || !playerName) return null;
  const key = playerName.toLowerCase().trim();
  for (const k of keeperPredictions) {
    if (Number(k.teamId) !== teamId) continue;
    const topName = (k.predictedPlayer as string | undefined)?.toLowerCase().trim();
    if (topName === key && typeof k.kvs === "number") return { kvs: k.kvs, isTop: true };
    const alt = (k.alternatives as any[] | undefined)?.find(
      (a: any) => (a.player as string | undefined)?.toLowerCase().trim() === key,
    );
    if (alt && typeof alt.kvs === "number") return { kvs: alt.kvs, isTop: false };
  }
  return null;
}

function kvsRecStyle(kvs: number) {
  if (kvs >= 150) return { label: "Keep", cls: "bg-lime-500/15 text-lime-300 border-lime-500/30" };
  if (kvs >= 100) return { label: "Consider", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  return { label: "Pass", cls: "bg-zinc-800/60 text-zinc-500 border-zinc-700/40" };
}

function slotOrder(slot: string | undefined) {
  const idx = SLOT_ORDER.indexOf(slot ?? "");
  return idx === -1 ? 99 : idx;
}

function PosBadge({ pos }: { pos: string | undefined }) {
  const colors: Record<string, string> = {
    QB:   "border-red-500/30 bg-red-500/10 text-red-400",
    RB:   "border-lime-500/30 bg-lime-500/10 text-lime-400",
    WR:   "border-violet-500/30 bg-violet-500/10 text-violet-400",
    TE:   "border-orange-500/30 bg-orange-500/10 text-orange-400",
    K:    "border-purple-500/30 bg-purple-500/10 text-purple-400",
    "D/ST": "border-slate-500/30 bg-slate-500/10 text-slate-400",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded border px-1.5 py-0 text-xs font-semibold",
      colors[pos ?? ""] ?? "border-border bg-muted/30 text-muted-foreground"
    )}>
      {pos ?? "?"}
    </span>
  );
}

function SlotBadge({ slot }: { slot: string | undefined }) {
  if (!slot || slot === "Bench" || slot === "BE") {
    return <span className="text-xs italic" style={{ color: MUTED }}>Bench</span>;
  }
  if (slot === "IR") {
    return <span className="text-xs text-red-400 font-medium">IR</span>;
  }
  return <span className="text-xs" style={{ color: MUTED }}>{slot}</span>;
}

function AcqBadge({ type }: { type: string | undefined }) {
  if (!type) return null;
  const map: Record<string, string> = {
    DRAFT: "border-lime-500/20 bg-lime-500/5 text-lime-400/80",
    WAIVER: "border-violet-500/20 bg-violet-500/5 text-violet-400/80",
    FREE_AGENT: "border-slate-500/20 bg-slate-500/5 text-slate-400/80",
    TRADE: "border-orange-500/20 bg-orange-500/5 text-orange-400/80",
    KEEPER: "border-lime-500/20 bg-lime-500/5 text-lime-400/80",
  };
  const label: Record<string, string> = {
    DRAFT: "Draft",
    WAIVER: "Waiver",
    FREE_AGENT: "FA",
    TRADE: "Trade",
    KEEPER: "Keeper",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded border px-1.5 py-0 text-xs",
      map[type] ?? "border-border bg-muted/30 text-muted-foreground"
    )}>
      {label[type] ?? type}
    </span>
  );
}

// ── Roster grouped by slot ────────────────────────────────────────────────────

function RosterTable({
  players,
  keeperPredictions,
  warRoomColumns,
  warRoomLoading,
  warRoomFailed,
}: {
  players: RosterEntry[];
  keeperPredictions?: any[];
  /** When true, show Keeper Value / Recommendation columns (synced seasons only). */
  warRoomColumns: boolean;
  warRoomLoading?: boolean;
  warRoomFailed?: boolean;
}) {
  // Group by lineup slot, sorted by slot order
  const groups = useMemo(() => {
    const map = new Map<string, RosterEntry[]>();
    for (const p of players) {
      const slot = p.lineupSlot ?? "Bench";
      const arr = map.get(slot) ?? [];
      arr.push(p);
      map.set(slot, arr);
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => slotOrder(a) - slotOrder(b)
    );
  }, [players]);

  const hasPred = keeperPredictions != null && keeperPredictions.length > 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide w-20" style={{ color: MUTED }}>Slot</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>Player</th>
            <th className="px-4 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide w-12" style={{ color: MUTED }}>Pos</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide w-16" style={{ color: MUTED }}>Avg</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide w-16" style={{ color: MUTED }}>Total</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide w-16 hidden md:table-cell" style={{ color: MUTED }}>Proj</th>
            {warRoomColumns && (
              <>
                <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide w-24" style={{ color: MUTED }}>
                  War Room KVS
                </th>
                <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide w-28" style={{ color: MUTED }}>
                  Rec.
                </th>
              </>
            )}
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide hidden lg:table-cell" style={{ color: MUTED }}>Acq</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([slot, entries]) =>
            entries.map((p, i) => {
              const injColor = INJURY_COLORS[p.injuryStatus ?? ""] ?? "";
              const wr =
                warRoomColumns && hasPred && !warRoomLoading && !warRoomFailed
                  ? warRoomKvsForPlayer(keeperPredictions, p.teamId, p.playerName)
                  : null;
              return (
                <tr
                  key={`${slot}-${p.playerId}-${i}`}
                  className="hover:bg-white/[0.03] transition-colors"
                  style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}
                >
                  <td className="px-4 py-2.5">
                    {i === 0 ? <SlotBadge slot={slot} /> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("text-sm font-medium", injColor)} style={injColor ? undefined : { color: TEXT }}>
                      {p.playerName ?? "Unknown"}
                    </span>
                    {p.injuryStatus && p.injuryStatus !== "ACTIVE" && (
                      <span className={cn("ml-1.5 text-xs", injColor)}>
                        {p.injuryStatus}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <PosBadge pos={p.position} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono" style={{ color: TEXT }}>
                    {fmt(p.appliedAverage)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono" style={{ color: TEXT }}>
                    {fmt(p.appliedTotal, 0)}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right font-mono md:table-cell" style={{ color: MUTED }}>
                    {fmt(p.projectedTotal, 0)}
                  </td>
                  {warRoomColumns && (
                    <>
                      <td className="px-3 py-2.5 text-right">
                        {warRoomLoading ? (
                          <span className="text-xs tabular-nums" style={{ color: MUTED }}>…</span>
                        ) : warRoomFailed ? (
                          <span className="text-xs" style={{ color: MUTED }} title="Draft War Room unavailable">
                            —
                          </span>
                        ) : !hasPred ? (
                          <span className="text-xs" style={{ color: MUTED }} title="No keeper predictions for this season">
                            —
                          </span>
                        ) : !wr ? (
                          <span className="text-xs" style={{ color: MUTED }}>—</span>
                        ) : (
                          (() => {
                            const colorClass =
                              wr.kvs >= 150
                                ? "text-lime-500"
                                : wr.kvs >= 100
                                  ? "text-amber-500"
                                  : wr.kvs >= 70
                                    ? "text-foreground"
                                    : "text-red-500";
                            return (
                              <span className={cn("text-xs font-bold tabular-nums", colorClass)}>{wr.kvs}</span>
                            );
                          })()
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {warRoomLoading || warRoomFailed || !hasPred ? null : !wr?.isTop ? null : (
                          (() => {
                            const { label, cls } = kvsRecStyle(wr.kvs);
                            return (
                              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", cls)}>
                                {label}
                              </span>
                            );
                          })()
                        )}
                      </td>
                    </>
                  )}
                  <td className="hidden px-4 py-2.5 lg:table-cell">
                    <AcqBadge type={p.acquisitionType} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Keeper types & logic (merged from KeeperAdvisor) ─────────────────────────

type KeeperEntry = {
  ownerName: string; teamName: string; playerName: string;
  nflTeam: string; position: string; slot: string;
  acquisitionType: string; keepYear: 0 | 1; isLastKeeperYear: boolean;
  keeperRoundCost: number; costSource: string;
  originalDraftRound: number | null; originalDraftSeason: number | null;
  lastKeptSeason: number | null; lastKeptRound: number | null;
};
type Confidence = "ELITE" | "HIGH" | "MEDIUM" | "LOW";
type Recommendation = "KEEP" | "CONSIDER" | "SKIP" | "DROP";

function calcKVS(e: KeeperEntry): number {
  const base = Math.max(10, Math.min(95, 100 - (e.keeperRoundCost - 1) * 7));
  return Math.min(98, base + (e.isLastKeeperYear ? 6 : 0));
}
function kvsConf(kvs: number): Confidence {
  return kvs >= 80 ? "ELITE" : kvs >= 65 ? "HIGH" : kvs >= 45 ? "MEDIUM" : "LOW";
}
function kvsRec(kvs: number, last: boolean): Recommendation {
  if (last || kvs >= 70) return "KEEP";
  if (kvs >= 48) return "CONSIDER";
  if (kvs >= 32) return "SKIP";
  return "DROP";
}
function kvsColor(kvs: number) {
  return kvs >= 70 ? "text-lime-400" : kvs >= 48 ? "text-amber-400" : "text-red-400";
}
const KA_POS: Record<string, string> = {
  QB: "text-red-400", RB: "text-lime-400", WR: "text-violet-400",
  TE: "text-orange-400", K: "text-zinc-400", "D/ST": "text-violet-400",
};
function RecBadge({ rec, last }: { rec: Recommendation; last: boolean }) {
  if (rec === "KEEP") return (
    <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border uppercase",
      last ? "border-amber-600 bg-amber-600/15 text-amber-300" : "border-lime-600 bg-lime-600/15 text-lime-300")}>
      <CheckCircle className="h-2.5 w-2.5" />{last ? "KEEP*" : "KEEP"}
    </span>
  );
  if (rec === "CONSIDER") return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border uppercase border-amber-600 bg-amber-600/10 text-amber-400">
      <HelpCircle className="h-2.5 w-2.5" />CONSIDER
    </span>
  );
  if (rec === "SKIP") return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border uppercase border-zinc-600 bg-zinc-700/30 text-zinc-400">
      <MinusCircle className="h-2.5 w-2.5" />SKIP
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border uppercase border-red-700 bg-red-700/10 text-red-400">
      <XCircle className="h-2.5 w-2.5" />DROP
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Roster() {
  const { leagueContextKey } = useLeagueActiveGate();
  const allSeasonsQ = trpc.espn.allSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
  );
  const cachedQ = trpc.espn.cachedSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
  );

  const allSeasons: number[] = allSeasonsQ.data ?? [];
  const cachedSeasons: number[] = cachedQ.data ?? [];

  const defaultSeason = cachedSeasons.length > 0
    ? Math.max(...cachedSeasons)
    : allSeasons.length > 0 ? allSeasons[allSeasons.length - 1] : 2025;

  const [season, setSeason] = useState(defaultSeason);
  const [teamId, setTeamId] = useState<number | "ALL">("ALL");

  useEffect(() => {
    if (cachedSeasons.length > 0) {
      const maxS = Math.max(...cachedSeasons);
      setSeason((s) => (cachedSeasons.includes(s) ? s : maxS));
    }
  }, [cachedSeasons, leagueContextKey]);

  const isNotCached = !cachedSeasons.includes(season);

  const teamsQ = trpc.espn.teams.useQuery(
    withLeagueSalt({ season }, leagueContextKey),
    { enabled: !isNotCached }
  );
  const rosterQ = trpc.espn.rosters.useQuery(
    withLeagueSalt(
      { season, teamId: teamId === "ALL" ? undefined : teamId },
      leagueContextKey,
    ),
    { enabled: !isNotCached }
  );
  const warRoomQ = trpc.draftWarRoom.getDraftWarRoomData.useQuery(
    withLeagueSalt({ season }, leagueContextKey),
    {
      enabled:
        !isNotCached &&
        !leagueContextKey.startsWith("__"),
      staleTime: 5 * 60 * 1000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      gcTime: 10 * 60 * 1000,
    },
  );
  const keeperPredWar =
    warRoomQ.data?.ok === true && Array.isArray(warRoomQ.data.keeperPredictions)
      ? (warRoomQ.data.keeperPredictions as any[])
      : undefined;
  const warRoomFailed =
    warRoomQ.isError ||
    (warRoomQ.data != null &&
      typeof warRoomQ.data === "object" &&
      (warRoomQ.data as { ok?: boolean }).ok === false);
  const draftYear  = new Date().getFullYear();
  const [kaOpen,   setKaOpen]   = useState(false);
  const keeperPoolQ = trpc.espn.keeperPool.useQuery(
    withLeagueSalt({ draftYear }, leagueContextKey),
  );
  const keeperPool = useMemo((): KeeperEntry[] => {
    const raw = (keeperPoolQ.data as { pool?: KeeperEntry[] } | undefined)?.pool;
    return Array.isArray(raw) ? (raw as KeeperEntry[]) : [];
  }, [keeperPoolQ.data]);
  const finalYearKeepers = useMemo(() => keeperPool.filter(k => k.isLastKeeperYear), [keeperPool]);
  const keeperPoolByName = useMemo(() => {
    const m = new Map<string, KeeperEntry>();
    for (const k of keeperPool) m.set(k.playerName.toLowerCase(), k);
    return m;
  }, [keeperPool]);


  const teams = (teamsQ.data as TeamRow[] | undefined) ?? [];
  const allPlayers = (rosterQ.data as RosterEntry[] | undefined) ?? [];

  // Group by team when showing ALL
  const playersByTeam = useMemo(() => {
    if (teamId !== "ALL") return null;
    const map = new Map<number, RosterEntry[]>();
    for (const p of allPlayers) {
      const arr = map.get(p.teamId) ?? [];
      arr.push(p);
      map.set(p.teamId, arr);
    }
    return map;
  }, [allPlayers, teamId]);

  const selectedTeam = teamId !== "ALL"
    ? teams.find(t => t.teamId === teamId)
    : null;

  return (
    <div style={PAGEBG} className="-m-4 md:-m-6 p-5 md:p-7 min-h-full">
      {/* ── Header (dashboard style) ─────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-none">Roster</h2>
          <p className="mt-2 text-sm" style={{ color: MUTED }}>
            Team rosters, scoring, projections and keeper value by season.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Pill gold>{season} Season</Pill>
          {allPlayers.length > 0 && <Pill>{allPlayers.length} Players</Pill>}
          <button
            disabled={rosterQ.isFetching || isNotCached}
            onClick={() => void rosterQ.refetch()}
            className="px-3 py-2.5 rounded-[10px] text-[13px] font-extrabold inline-flex items-center gap-2 disabled:opacity-60"
            style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,.04)", color: MUTED }}
          >
            {rosterQ.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-3">
        <Select
          value={String(season)}
          onValueChange={v => {
            setSeason(Number(v));
            setTeamId("ALL");
          }}
        >
          <SelectTrigger className="w-32 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...allSeasons].reverse().map(s => (
              <SelectItem key={s} value={String(s)}>
                <span className="flex items-center gap-1.5">
                  {s}
                  {cachedSeasons.includes(s) && <span className="text-lime-400 text-xs">&#10003;</span>}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={teamId === "ALL" ? "ALL" : String(teamId)}
          onValueChange={v => setTeamId(v === "ALL" ? "ALL" : Number(v))}
          disabled={isNotCached || teamsQ.isLoading}
        >
          <SelectTrigger className="w-52 h-9 text-sm">
            <SelectValue placeholder="All teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All teams</SelectItem>
            {teams.map(t => (
              <SelectItem key={t.teamId} value={String(t.teamId)}>
                {t.teamName || `Team ${t.teamId}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Not-cached notice */}
      {isNotCached && (
        <div style={SUB} className="flex items-center gap-3 p-4 text-sm mb-3">
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
          <span style={{ color: "#e7c46b" }}>
            Season {season} hasn't been synced yet.{" "}
            <a href="/sync" className="underline underline-offset-2">Sync it now</a>.
          </span>
        </div>
      )}

      {/* Loading */}
      {rosterQ.isLoading && !isNotCached && (
        <Panel>
          <div className="flex items-center justify-center py-20 gap-2" style={{ color: MUTED }}>
            <Loader2 className="h-5 w-5 animate-spin" /> Loading roster&hellip;
          </div>
        </Panel>
      )}

      {/* Error */}
      {rosterQ.isError && (
        <div style={{ ...SUB, borderColor: "rgba(239,68,68,.3)" }} className="flex items-center gap-3 p-4 text-sm mb-3">
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: RED }} />
          <span style={{ color: "#f3a3a3" }}>{rosterQ.error.message}</span>
        </div>
      )}

      {/* Empty */}
      {!rosterQ.isLoading && !rosterQ.isError && !isNotCached && allPlayers.length === 0 && (
        <Panel>
          <div className="py-16 text-center text-sm" style={{ color: MUTED }}>
            No roster data for {season}.
          </div>
        </Panel>
      )}

      <div className="space-y-3">
        {/* Single team view */}
        {teamId !== "ALL" && allPlayers.length > 0 && (
          <Panel>
            <SectionHead
              icon={Users}
              title={
                <>
                  {selectedTeam
                    ? `${selectedTeam.teamName}${selectedTeam.owners ? ` — ${selectedTeam.owners}` : ""}`
                    : `Team ${teamId}`}
                  <span className="ml-2 text-sm font-normal" style={{ color: MUTED }}>&middot; {season}</span>
                </>
              }
            />
            <div className="mt-4 -mx-[18px] md:-mx-5">
              <RosterTable
                players={allPlayers}
                keeperPredictions={keeperPredWar}
                warRoomColumns={!isNotCached}
                warRoomLoading={warRoomQ.isFetching}
                warRoomFailed={warRoomFailed}
              />
            </div>
          </Panel>
        )}

        {/* All teams view — one panel per team */}
        {teamId === "ALL" && playersByTeam && playersByTeam.size > 0 && (
          <>
            {teams
              .filter(t => playersByTeam.has(t.teamId))
              .map(t => {
                const players = playersByTeam.get(t.teamId) ?? [];
                return (
                  <Panel key={t.teamId}>
                    <SectionHead
                      icon={Users}
                      title={
                        <>
                          {t.teamName || `Team ${t.teamId}`}
                          {t.owners && (
                            <span className="ml-2 text-sm font-normal" style={{ color: MUTED }}>&mdash; {t.owners}</span>
                          )}
                        </>
                      }
                      right={
                        <span className="text-xs font-normal shrink-0" style={{ color: MUTED }}>
                          {players.length} players
                        </span>
                      }
                    />
                    <div className="mt-4 -mx-[18px] md:-mx-5">
                      <RosterTable
                        players={players}
                        keeperPredictions={keeperPredWar}
                        warRoomColumns={!isNotCached}
                        warRoomLoading={warRoomQ.isFetching}
                        warRoomFailed={warRoomFailed}
                      />
                    </div>
                  </Panel>
                );
              })}
          </>
        )}

        {/* ── Keeper Advisor (merged from KeeperAdvisor) ─────────────── */}
        <section style={PANEL} className="overflow-hidden">
          <button
            onClick={() => setKaOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Key className="h-4 w-4" style={{ color: RED }} />
              <span className="font-bold text-sm" style={{ color: TEXT }}>Keeper Advisor {draftYear}</span>
              {keeperPool.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold">
                  {keeperPool.length} eligible
                </span>
              )}
              {finalYearKeepers.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold">
                  {finalYearKeepers.length} last-year
                </span>
              )}
            </div>
            {kaOpen ? <ChevronUp className="h-4 w-4" style={{ color: MUTED }} /> : <ChevronDown className="h-4 w-4" style={{ color: MUTED }} />}
          </button>

          {kaOpen && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}>
              {keeperPoolQ.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm" style={{ color: MUTED }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Building keeper pool&hellip;
                </div>
              ) : keeperPool.length === 0 ? (
                <div className="px-5 py-10 text-center space-y-2">
                  <AlertTriangle className="h-6 w-6 text-amber-400 mx-auto" />
                  <p className="text-sm font-semibold" style={{ color: TEXT }}>No keeper data found</p>
                  <p className="text-xs" style={{ color: MUTED }}>Run Full Import to load draft history.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider" style={{ background: "rgba(255,255,255,.03)", color: MUTED }}>
                          <th className="px-4 py-2.5 text-left">Player</th>
                          <th className="px-3 py-2.5 text-center">Pos</th>
                          <th className="px-3 py-2.5 text-center">Team</th>
                          <th className="px-3 py-2.5 text-center">Round Cost</th>
                          <th className="px-3 py-2.5 text-center">KVS</th>
                          <th className="px-4 py-2.5 text-center">Recommendation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...keeperPool].sort((a,b) => calcKVS(b) - calcKVS(a)).map((k, i) => {
                          const kvs  = calcKVS(k);
                          const rec  = kvsRec(kvs, k.isLastKeeperYear);
                          return (
                            <tr key={i} className="transition-colors hover:bg-white/[0.03]" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                              <td className="px-4 py-2.5">
                                <div className="font-semibold text-xs leading-tight" style={{ color: TEXT }}>{k.playerName}</div>
                                <div className="text-[10px]" style={{ color: MUTED }}>{k.ownerName}</div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={cn("text-xs font-bold", KA_POS[k.position] ?? "text-zinc-400")}>{k.position}</span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: MUTED, background: "rgba(255,255,255,.06)" }}>{k.nflTeam || "—"}</span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={cn("text-xs font-bold tabular-nums",
                                  k.keeperRoundCost <= 3 ? "text-lime-400" : k.keeperRoundCost <= 6 ? "text-amber-400" : "text-zinc-300"
                                )}>Rd {k.keeperRoundCost}</span>
                                {k.isLastKeeperYear && <div className="text-[9px] text-amber-500 font-bold uppercase mt-0.5">Last Year</div>}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={cn("text-xl font-black tabular-nums", kvsColor(kvs))}>{kvs}</span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <RecBadge rec={rec} last={k.isLastKeeperYear} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 flex items-center gap-1.5" style={{ background: "rgba(255,255,255,.02)", borderTop: "1px solid rgba(255,255,255,.06)" }}>
                    <Info className="h-3 w-3" style={{ color: MUTED }} />
                    <span className="text-[10px]" style={{ color: MUTED }}>KVS = Keeper Value Score &middot; * = Last eligible year for this player</span>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── Keeper Eligibility Expiring ──────────────────────────── */}
        {finalYearKeepers.length > 0 && (
          <div className="rounded-[15px] border border-amber-500/25 bg-amber-500/5 overflow-hidden">
            <div className="px-5 py-3.5 flex items-center gap-2.5 border-b border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-amber-300 text-sm">Keeper Eligibility Expiring</span>
                <span className="text-amber-500/60 text-xs ml-2">&mdash; keep or lose forever after {draftYear}</span>
              </div>
              <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
                {finalYearKeepers.length} players
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-4">
              {finalYearKeepers.map((k, i) => {
                const kvs = calcKVS(k);
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={SUB}>
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border border-white/10",
                      KA_POS[k.position] ?? "text-zinc-400")} style={{ background: "rgba(255,255,255,.05)" }}>
                      {k.playerName.split(" ").map((w: string) => w[0]).slice(0,2).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate" style={{ color: TEXT }}>{k.playerName}</div>
                      <div className="text-[10px] truncate" style={{ color: MUTED }}>{k.ownerName} &middot; Rd {k.keeperRoundCost}</div>
                    </div>
                    <span className={cn("text-base font-black tabular-nums shrink-0", kvsColor(kvs))}>{kvs}</span>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-2.5 border-t border-amber-500/10 text-[10px] text-amber-600/90" style={{ background: "rgba(255,255,255,.02)" }}>
              These players cannot be kept in the {draftYear + 1} draft. Make your decision before the {draftYear} draft.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
