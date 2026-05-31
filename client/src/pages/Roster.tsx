import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ACTIVE:       "text-emerald-400",
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

function slotOrder(slot: string | undefined) {
  const idx = SLOT_ORDER.indexOf(slot ?? "");
  return idx === -1 ? 99 : idx;
}

function PosBadge({ pos }: { pos: string | undefined }) {
  const colors: Record<string, string> = {
    QB:   "border-red-500/30 bg-red-500/10 text-red-400",
    RB:   "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    WR:   "border-blue-500/30 bg-blue-500/10 text-blue-400",
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
    return <span className="text-xs text-muted-foreground italic">Bench</span>;
  }
  if (slot === "IR") {
    return <span className="text-xs text-red-400 font-medium">IR</span>;
  }
  return <span className="text-xs text-muted-foreground">{slot}</span>;
}

function AcqBadge({ type }: { type: string | undefined }) {
  if (!type) return null;
  const map: Record<string, string> = {
    DRAFT: "border-primary/20 bg-primary/5 text-primary/80",
    WAIVER: "border-blue-500/20 bg-blue-500/5 text-blue-400/80",
    FREE_AGENT: "border-slate-500/20 bg-slate-500/5 text-slate-400/80",
    TRADE: "border-orange-500/20 bg-orange-500/5 text-orange-400/80",
    KEEPER: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400/80",
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

function RosterTable({ players }: { players: RosterEntry[] }) {
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-20">Slot</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Player</th>
            <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground w-12">Pos</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-16">Avg</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-16">Total</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-16 hidden md:table-cell">Proj</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hidden lg:table-cell">Acq</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([slot, entries]) =>
            entries.map((p, i) => {
              const injColor = INJURY_COLORS[p.injuryStatus ?? ""] ?? "";
              return (
                <tr
                  key={`${slot}-${p.playerId}-${i}`}
                  className="border-b border-border/50 last:border-0 hover:bg-accent/20 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    {i === 0 ? <SlotBadge slot={slot} /> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("font-medium", injColor || "text-foreground")}>
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
                  <td className="px-4 py-2.5 text-right font-mono text-foreground">
                    {fmt(p.appliedAverage)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground">
                    {fmt(p.appliedTotal, 0)}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right font-mono text-muted-foreground md:table-cell">
                    {fmt(p.projectedTotal, 0)}
                  </td>
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

// ── Main page ─────────────────────────────────────────────────────────────────


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
  return kvs >= 70 ? "text-emerald-400" : kvs >= 48 ? "text-amber-400" : "text-red-400";
}
const KA_POS: Record<string, string> = {
  QB: "text-red-400", RB: "text-emerald-400", WR: "text-blue-400",
  TE: "text-orange-400", K: "text-zinc-400", "D/ST": "text-violet-400",
};
function RecBadge({ rec, last }: { rec: Recommendation; last: boolean }) {
  if (rec === "KEEP") return (
    <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border uppercase",
      last ? "border-amber-600 bg-amber-600/15 text-amber-300" : "border-emerald-600 bg-emerald-600/15 text-emerald-300")}>
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

export function Roster() {
  const allSeasonsQ = trpc.espn.allSeasons.useQuery();
  const cachedQ = trpc.espn.cachedSeasons.useQuery();

  const allSeasons: number[] = allSeasonsQ.data ?? [];
  const cachedSeasons: number[] = cachedQ.data ?? [];

  const defaultSeason = cachedSeasons.length > 0
    ? Math.max(...cachedSeasons)
    : allSeasons.length > 0 ? allSeasons[allSeasons.length - 1] : 2025;

  const [season, setSeason] = useState(defaultSeason);
  const [teamId, setTeamId] = useState<number | "ALL">("ALL");

  const isNotCached = !cachedSeasons.includes(season);

  const teamsQ = trpc.espn.teams.useQuery(
    { season },
    { enabled: !isNotCached }
  );
  const rosterQ = trpc.espn.rosters.useQuery(
    { season, teamId: teamId === "ALL" ? undefined : teamId },
    { enabled: !isNotCached }
  );
  const draftYear  = new Date().getFullYear();
  const [kaOpen,   setKaOpen]   = useState(false);
  const keeperPoolQ = trpc.espn.keeperPool.useQuery({ draftYear });
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
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Roster</h1>
          <p className="mt-1 text-muted-foreground">
            Team rosters and player details by season.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={rosterQ.isFetching || isNotCached}
          onClick={() => void rosterQ.refetch()}
        >
          {rosterQ.isFetching
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Season */}
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
                  {cachedSeasons.includes(s) && (
                    <span className="text-emerald-400 text-xs">✓</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Team */}
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

        {allPlayers.length > 0 && (
          <span className="self-center text-xs text-muted-foreground">
            {allPlayers.length} players
          </span>
        )}
      </div>

      {/* Not-cached notice */}
      {isNotCached && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Season {season} hasn't been synced yet.{" "}
          <a href="/sync" className="underline underline-offset-2">Sync it now</a>.
        </div>
      )}

      {/* Loading */}
      {rosterQ.isLoading && !isNotCached && (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading roster…
        </div>
      )}

      {/* Error */}
      {rosterQ.isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {rosterQ.error.message}
        </div>
      )}

      {/* Empty */}
      {!rosterQ.isLoading && !rosterQ.isError && !isNotCached && allPlayers.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          No roster data for {season}.
        </div>
      )}

      {/* Single team view */}
      {teamId !== "ALL" && allPlayers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              {selectedTeam
                ? `${selectedTeam.teamName}${selectedTeam.owners ? ` — ${selectedTeam.owners}` : ""}`
                : `Team ${teamId}`}
              <span className="text-sm font-normal text-muted-foreground">· {season}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RosterTable players={allPlayers} />
          </CardContent>
        </Card>
      )}

      {/* All teams view — one card per team */}
      {teamId === "ALL" && playersByTeam && playersByTeam.size > 0 && (
        <div className="space-y-4">
          {teams
            .filter(t => playersByTeam.has(t.teamId))
            .map(t => {
              const players = playersByTeam.get(t.teamId) ?? [];
              return (
                <Card key={t.teamId}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{t.teamName || `Team ${t.teamId}`}</span>
                        {t.owners && (
                          <span className="text-muted-foreground font-normal">— {t.owners}</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {players.length} players
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <RosterTable players={players} />
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      {/* ── Keeper Analysis (merged from KeeperAdvisor) ─────────────── */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden">
        <button
          onClick={() => setKaOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Key className="h-4 w-4 text-red-400" />
            <span className="font-bold text-zinc-100 text-sm">Keeper Advisor {draftYear}</span>
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
          {kaOpen ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
        </button>

        {kaOpen && (
          <div className="border-t border-zinc-800/60 divide-y divide-zinc-800/30">
            {keeperPoolQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-zinc-500 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Building keeper pool…
              </div>
            ) : keeperPool.length === 0 ? (
              <div className="px-5 py-10 text-center space-y-2">
                <AlertTriangle className="h-6 w-6 text-amber-400 mx-auto" />
                <p className="text-zinc-400 text-sm font-semibold">No keeper data found</p>
                <p className="text-zinc-600 text-xs">Run Full Import to load draft history.</p>
              </div>
            ) : (
              <>
                {/* Keeper table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-900/60 text-zinc-500 text-[10px] uppercase tracking-wider">
                        <th className="px-4 py-2.5 text-left">Player</th>
                        <th className="px-3 py-2.5 text-center">Pos</th>
                        <th className="px-3 py-2.5 text-center">Team</th>
                        <th className="px-3 py-2.5 text-center">Round Cost</th>
                        <th className="px-3 py-2.5 text-center">KVS</th>
                        <th className="px-4 py-2.5 text-center">Recommendation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {[...keeperPool].sort((a,b) => calcKVS(b) - calcKVS(a)).map((k, i) => {
                        const kvs  = calcKVS(k);
                        const rec  = kvsRec(kvs, k.isLastKeeperYear);
                        return (
                          <tr key={i} className={cn("transition-colors hover:bg-zinc-800/30", i%2===0?"bg-transparent":"bg-zinc-900/20")}>
                            <td className="px-4 py-2.5">
                              <div className="font-semibold text-zinc-100 text-xs leading-tight">{k.playerName}</div>
                              <div className="text-[10px] text-zinc-500">{k.ownerName}</div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("text-xs font-bold", KA_POS[k.position] ?? "text-zinc-400")}>{k.position}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">{k.nflTeam || "—"}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("text-xs font-bold tabular-nums",
                                k.keeperRoundCost <= 3 ? "text-emerald-400" : k.keeperRoundCost <= 6 ? "text-amber-400" : "text-zinc-300"
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
                <div className="px-4 py-2 flex items-center gap-1.5 bg-zinc-900/20">
                  <Info className="h-3 w-3 text-zinc-600" />
                  <span className="text-[10px] text-zinc-600">KVS = Keeper Value Score · * = Last eligible year for this player</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Keeper Non-Eligibility Tracker ───────────────────────────── */}
      {finalYearKeepers.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 overflow-hidden">
          <div className="px-5 py-3.5 flex items-center gap-2.5 border-b border-amber-500/20">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-amber-300 text-sm">Keeper Eligibility Expiring</span>
              <span className="text-amber-500/60 text-xs ml-2">— keep or lose forever after {draftYear}</span>
            </div>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
              {finalYearKeepers.length} players
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-4">
            {finalYearKeepers.map((k, i) => {
              const kvs = calcKVS(k);
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border",
                    "bg-zinc-800 border-zinc-700", KA_POS[k.position] ?? "text-zinc-400")}>
                    {k.playerName.split(" ").map((w: string) => w[0]).slice(0,2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-zinc-100 truncate">{k.playerName}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{k.ownerName} · Rd {k.keeperRoundCost}</div>
                  </div>
                  <span className={cn("text-base font-black tabular-nums shrink-0", kvsColor(kvs))}>{kvs}</span>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-2.5 bg-zinc-900/30 border-t border-amber-500/10 text-[10px] text-amber-600">
            These players cannot be kept in the {draftYear + 1} draft. Make your decision before the {draftYear} draft.
          </div>
        </div>
      )}

    </div>
  );
}
