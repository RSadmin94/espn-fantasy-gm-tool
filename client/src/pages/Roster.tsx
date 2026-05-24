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
    </div>
  );
}
