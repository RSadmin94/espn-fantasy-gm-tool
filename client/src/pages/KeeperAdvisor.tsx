import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, AlertTriangle, Info, Shield, ShieldAlert } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ──────────────────────────────────────────────────────────────────

type KeeperEntry = {
  ownerName:           string;
  teamName:            string;
  playerName:          string;
  nflTeam:             string;
  position:            string;
  slot:                string;
  acquisitionType:     string;
  keepYear:            0 | 1;
  isLastKeeperYear:    boolean;
  keeperRoundCost:     number;
  costSource:          "espn_stored" | "draft_history_round" | "fa_fixed";
  originalDraftRound:  number | null;
  originalDraftSeason: number | null;
  lastKeptSeason:      number | null;
  lastKeptRound:       number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const POS_COLORS: Record<string, string> = {
  QB: "bg-red-900/40 text-red-300 border-red-800",
  RB: "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  WR: "bg-blue-900/40 text-blue-300 border-blue-800",
  TE: "bg-orange-900/40 text-orange-300 border-orange-800",
  K:  "bg-zinc-800 text-zinc-300 border-zinc-700",
  "D/ST": "bg-violet-900/40 text-violet-300 border-violet-800",
};

function posChip(pos: string) {
  const cls = POS_COLORS[pos] ?? "bg-zinc-800 text-zinc-300 border-zinc-700";
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", cls)}>
      {pos || "—"}
    </span>
  );
}

function roundBadge(round: number, isLastYear: boolean) {
  const isRound1 = round === 1;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold",
      isLastYear
        ? "border-amber-700 bg-amber-900/40 text-amber-300"
        : isRound1
          ? "border-rose-700 bg-rose-900/40 text-rose-300"
          : "border-border bg-muted/40 text-foreground",
    )}>
      Rd {round}
      {isLastYear && <ShieldAlert className="h-3 w-3" />}
      {isRound1 && !isLastYear && <AlertTriangle className="h-3 w-3 text-rose-400" />}
    </span>
  );
}

function statusBadge(entry: KeeperEntry) {
  if (entry.isLastKeeperYear) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-700 bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-amber-300">
        <ShieldAlert className="h-3 w-3" /> LAST YEAR
      </span>
    );
  }
  if (entry.acquisitionType === "Free Agency") {
    return (
      <span className="inline-flex items-center rounded border border-blue-700 bg-blue-900/30 px-2 py-0.5 text-xs font-semibold text-blue-300">
        FA KEEP
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-emerald-700 bg-emerald-900/30 px-2 py-0.5 text-xs font-semibold text-emerald-300">
      <Shield className="h-3 w-3" /> KEEP
    </span>
  );
}

function costSourceTooltip(src: KeeperEntry["costSource"]) {
  if (src === "espn_stored") return "Cost from stored draft history (ESPN keeper round)";
  if (src === "draft_history_round") return "Cost from stored draft history (draft round)";
  return "Not in stored draft history: fixed Round 7";
}

function tierConfidenceLine(round: number, isLast: boolean): string {
  let tier = "C";
  if (round <= 3) tier = "S";
  else if (round <= 6) tier = "A";
  else if (round <= 10) tier = "B";
  const conf = isLast ? "High — last keeper year" : round <= 5 ? "High" : round <= 10 ? "Medium" : "Low";
  return `Tier ${tier} · ${conf}`;
}

function rankKeeperCandidates(players: KeeperEntry[]): KeeperEntry[] {
  return [...players].sort((a, b) => {
    if (a.isLastKeeperYear !== b.isLastKeeperYear) return a.isLastKeeperYear ? -1 : 1;
    if (a.keeperRoundCost !== b.keeperRoundCost) return a.keeperRoundCost - b.keeperRoundCost;
    return a.playerName.localeCompare(b.playerName);
  });
}

function recommendedKeeperReason(pick: KeeperEntry): string {
  const costSrc =
    pick.costSource === "espn_stored"
      ? "ESPN-stored keeper round"
      : pick.costSource === "draft_history_round"
        ? "cost from last draft round"
        : "FA keep (default Rd 7)";
  if (pick.isLastKeeperYear) {
    return `Last year of keeper eligibility — keep now or return to the pool. Rd ${pick.keeperRoundCost} (${costSrc}).`;
  }
  return `Lowest effective cost among your eligible players (Rd ${pick.keeperRoundCost}, ${costSrc}). Year ${pick.keepYear + 1} of 2 on the keeper clock.`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function KeeperAdvisor() {
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [posFilter,   setPosFilter]   = useState<string>("all");
  const [yearFilter,  setYearFilter]  = useState<string>("all");

  const poolQ = trpc.espn.keeperPool.useQuery({ draftYear: new Date().getFullYear() });

  const pool = useMemo((): KeeperEntry[] => {
    const raw = (poolQ.data as { pool?: KeeperEntry[] } | undefined)?.pool;
    if (!Array.isArray(raw)) return [];
    return raw as KeeperEntry[];
  }, [poolQ.data]);

  const owners = useMemo(() => {
    const set = new Set(pool.map(p => p.ownerName));
    return Array.from(set).sort();
  }, [pool]);

  const positions = useMemo(() => {
    const set = new Set(pool.map(p => p.position).filter(Boolean));
    return Array.from(set).sort();
  }, [pool]);

  const filtered = useMemo(() => {
    return pool.filter(p => {
      if (ownerFilter !== "all" && p.ownerName !== ownerFilter) return false;
      if (posFilter   !== "all" && p.position   !== posFilter)   return false;
      if (yearFilter === "last" && !p.isLastKeeperYear)           return false;
      if (yearFilter === "first" && p.keepYear !== 0)             return false;
      return true;
    });
  }, [pool, ownerFilter, posFilter, yearFilter]);

  // Group by owner for display
  const byOwner = useMemo(() => {
    const map = new Map<string, KeeperEntry[]>();
    for (const e of filtered) {
      if (!map.has(e.ownerName)) map.set(e.ownerName, []);
      map.get(e.ownerName)!.push(e);
    }
    return map;
  }, [filtered]);

  const draftYear = new Date().getFullYear();
  const prevSeason = draftYear - 1;
  const errorMsg = (poolQ.data as { error?: string; hint?: string } | undefined)?.error;
  const hintMsg  = (poolQ.data as { hint?: string } | undefined)?.hint;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (poolQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Building keeper pool…
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <p className="text-lg font-semibold text-foreground">No 2025 draft data</p>
        <p className="mt-1 text-sm text-muted-foreground">{hintMsg ?? errorMsg}</p>
        <p className="mt-4 text-xs text-muted-foreground">
          Open the extension popup → Import Historical League Data → <strong>FULL IMPORT</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Keeper Advisor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {draftYear} Draft · Based on {prevSeason} end-of-season rosters ·{" "}
          <span className="font-medium text-foreground">{pool.length}</span> eligible players
          across <span className="font-medium text-foreground">{owners.length}</span> teams
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs">
        <span className="font-semibold text-muted-foreground uppercase tracking-wide">Legend</span>
        <span className="inline-flex items-center gap-1 rounded border border-emerald-700 bg-emerald-900/30 px-2 py-0.5 font-semibold text-emerald-300">
          <Shield className="h-3 w-3" /> KEEP
        </span>
        <span className="text-muted-foreground">Year 1 — eligible 2026 &amp; 2027</span>
        <span className="inline-flex items-center gap-1 rounded border border-amber-700 bg-amber-900/30 px-2 py-0.5 font-semibold text-amber-300">
          <ShieldAlert className="h-3 w-3" /> LAST YEAR
        </span>
        <span className="text-muted-foreground">Year 2 — keep now or lose to draft pool</span>
        <span className="inline-flex items-center rounded border border-blue-700 bg-blue-900/30 px-2 py-0.5 font-semibold text-blue-300">
          FA KEEP
        </span>
        <span className="text-muted-foreground">Free agent pickup · Rd 7 cost</span>
        <span className="inline-flex items-center gap-1 rounded border border-rose-700 bg-rose-900/30 px-2 py-0.5 font-semibold text-rose-300">
          <AlertTriangle className="h-3 w-3" /> Rd 1
        </span>
        <span className="text-muted-foreground">High cost — uses first-round pick</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All Owners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Owners</SelectItem>
            {owners.map(o => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={posFilter} onValueChange={setPosFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All Positions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pos</SelectItem>
            {positions.map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Keep Years" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Keep Years</SelectItem>
            <SelectItem value="first">Year 1 only</SelectItem>
            <SelectItem value="last">Last Year only</SelectItem>
          </SelectContent>
        </Select>

        {(ownerFilter !== "all" || posFilter !== "all" || yearFilter !== "all") && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => { setOwnerFilter("all"); setPosFilter("all"); setYearFilter("all"); }}
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} player{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Tables — one per owner */}
      {byOwner.size === 0 ? (
        <div className="rounded-lg border border-border py-12 text-center text-sm text-muted-foreground">
          No players match the current filters.
        </div>
      ) : (
        Array.from(byOwner.entries()).map(([owner, players]) => {
          const ranked = rankKeeperCandidates(players);
          const top = ranked[0];
          const alternatives = ranked.slice(1);

          return (
          <div key={owner} className="overflow-hidden rounded-lg border border-border">
            {/* Owner header */}
            <div className="flex items-baseline justify-between border-b border-border bg-muted/30 px-4 py-2.5">
              <span className="font-semibold text-foreground">{owner}</span>
              <span className="text-xs text-muted-foreground">
                {players.length} keeper{players.length !== 1 ? "s" : ""} eligible
                {players.filter(p => p.isLastKeeperYear).length > 0 && (
                  <span className="ml-2 text-amber-400">
                    · {players.filter(p => p.isLastKeeperYear).length} last year
                  </span>
                )}
              </span>
            </div>

            {top && (
              <div className="border-b border-border bg-emerald-950/15 px-4 py-3 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">Recommended keeper</div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-lg font-semibold text-foreground">{top.playerName}</span>
                  {posChip(top.position)}
                  <span className="text-sm text-muted-foreground">{top.nflTeam || "—"}</span>
                  {roundBadge(top.keeperRoundCost, top.isLastKeeperYear)}
                </div>
                <p className="text-sm text-muted-foreground leading-snug">{recommendedKeeperReason(top)}</p>
                <p className="text-xs text-emerald-400/90">{tierConfidenceLine(top.keeperRoundCost, top.isLastKeeperYear)}</p>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[200px]">
                    {alternatives.length > 0 ? "Other eligible keepers" : "Alternatives"}
                  </TableHead>
                  <TableHead className="w-16">Pos</TableHead>
                  <TableHead className="w-16">NFL</TableHead>
                  <TableHead className="w-24">Cost</TableHead>
                  <TableHead className="w-28">Keep Yr</TableHead>
                  <TableHead className="w-28">Acquired</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8 text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alternatives.length > 0 ? (
                  alternatives.map((p, idx) => (
                    <TableRow
                      key={`${p.playerName}-${idx}`}
                      className={cn(
                        p.isLastKeeperYear && "bg-amber-950/20 hover:bg-amber-950/30",
                      )}
                    >
                      <TableCell className="font-medium text-foreground">
                        {p.playerName}
                      </TableCell>
                      <TableCell>{posChip(p.position)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.nflTeam || "—"}</TableCell>
                      <TableCell>{roundBadge(p.keeperRoundCost, p.isLastKeeperYear)}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "text-xs font-medium",
                          p.keepYear === 1 ? "text-amber-400" : "text-muted-foreground",
                        )}>
                          {p.keepYear === 1 ? "Year 2 of 2" : "Year 1 of 2"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {p.acquisitionType || "—"}
                        </span>
                      </TableCell>
                      <TableCell>{statusBadge(p)}</TableCell>
                      <TableCell className="text-right">
                        <span title={costSourceTooltip(p.costSource)}>
                          <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                      No other eligible keepers for this team under the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          );
        })
      )}
    </div>
  );
}
