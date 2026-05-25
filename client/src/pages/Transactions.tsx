import { useMemo, useState } from "react";
import { Link } from "react-router";
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
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  RefreshCw,
  Repeat2,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TxnRow {
  type: string;
  transactionId?: string;
  relatedTransactionId?: string;
  playerId?: number | null;
  playerName?: string | null;
  position?: string | null;
  teamId?: number | null;
  fromTeamId?: number | null;
  toTeamId?: number | null;
  proposedDate?: number | null;
  processedDate?: number | null;
  status?: string | null;
  bidAmount?: number | null;
  itemType?: string | null;
  overallPickNumber?: number | null;
  round?: number | null;
  pickInRound?: number | null;
  rawTransaction?: string | null;
}

interface TeamRow {
  teamId: number;
  teamName: string;
  owners?: string;
}

interface RosterRow {
  playerId?: number;
  position?: string;
  proTeam?: string;
}

type DisplayEntry =
  | { kind: "trade"; key: string; rows: TxnRow[] }
  | { kind: "simple"; row: TxnRow };

// ── Constants ─────────────────────────────────────────────────────────────────

const TX_TYPES = [
  { value: "ALL", label: "All types" },
  { value: "ADD", label: "Add" },
  { value: "DROP", label: "Drop" },
  { value: "WAIVER", label: "Waiver" },
  { value: "TRADES", label: "Trade" },
  { value: "TRADE", label: "Trade (legacy)" },
  { value: "TRADE_PROPOSAL", label: "Trade proposal" },
  { value: "TRADE_UPHOLD", label: "Trade accepted" },
  { value: "TRADE_ACCEPT", label: "Trade accepted (alt)" },
];

const TX_TYPE_LABELS: Record<string, string> = {
  ADD: "Add",
  DROP: "Drop",
  WAIVER: "Waiver",
  TRADES: "Trade",
  TRADE: "Trade",
  TRADE_PROPOSAL: "Trade",
  TRADE_UPHOLD: "Trade",
  TRADE_ACCEPT: "Trade",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isTradeType(type: string | undefined): boolean {
  const t = (type || "").toUpperCase();
  return t === "TRADE" || t.startsWith("TRADE_");
}

/** Canonical id so TRADE_PROPOSAL lines + TRADE_UPHOLD/ACCEPT merge into one card */
function tradeClusterKey(r: TxnRow): string {
  const t = r.type || "";
  if (t === "TRADE_UPHOLD" || t === "TRADE_ACCEPT") {
    return String(r.relatedTransactionId || r.transactionId || "");
  }
  return String(r.transactionId || "");
}

function eventMs(r: TxnRow): number {
  const p = r.processedDate != null ? Number(r.processedDate) : NaN;
  if (Number.isFinite(p) && p > 0) return p;
  const d = r.proposedDate != null ? Number(r.proposedDate) : 0;
  return Number.isFinite(d) ? d : 0;
}

function formatWhen(ms: number): { date: string; time: string } {
  if (!ms) return { date: "—", time: "" };
  const d = new Date(ms);
  return {
    date: d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function tryParseRaw(raw: string | null | undefined): Record<string, unknown> | null {
  if (raw == null || String(raw).trim() === "") return null;
  try {
    return JSON.parse(String(raw)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isDraftish(r: TxnRow): boolean {
  const it = String(r.itemType || "").toUpperCase();
  return it.includes("DRAFT") || r.overallPickNumber != null || (r.playerId == null && (r.round != null || r.pickInRound != null));
}

function formatPickBits(r: Pick<TxnRow, "round" | "pickInRound" | "overallPickNumber">): string {
  const rnd = r.round != null ? Number(r.round) : NaN;
  const pir = r.pickInRound != null ? Number(r.pickInRound) : NaN;
  const ov = r.overallPickNumber != null ? Number(r.overallPickNumber) : NaN;
  const parts: string[] = [];
  if (Number.isFinite(rnd)) parts.push(`Round ${rnd}`);
  if (Number.isFinite(pir)) parts.push(`Pick ${pir}`);
  if (Number.isFinite(ov)) parts.push(`#${ov} overall`);
  return parts.length ? `Draft pick (${parts.join(", ")})` : "Draft pick";
}

interface PlayerBits {
  position: string;
  proTeam: string;
}

function assetLabel(r: TxnRow, meta: Map<number, PlayerBits>): string {
  if (isDraftish(r)) return formatPickBits(r);
  const pid = r.playerId != null && r.playerId > 0 ? r.playerId : null;
  const m = pid != null ? meta.get(pid) : undefined;
  const pos = (r.position || m?.position || "?").trim();
  const tm = (m?.proTeam || "").trim();
  const name = (r.playerName || "Unknown player").trim();
  if (tm && tm !== "?") return `${name}, ${pos}, ${tm}`;
  return `${name}, ${pos}`;
}

interface TradeAsset {
  fromTeamId: number | null;
  toTeamId: number | null;
  playerId: number | null;
  playerName: string | null;
  position: string | null;
  itemType: string | null;
  overallPickNumber: number | null;
  round: number | null;
  pickInRound: number | null;
}

function rowToAsset(r: TxnRow): TradeAsset | null {
  const hasPlayer = r.playerId != null && r.playerId > 0;
  if (hasPlayer || isDraftish(r)) {
    return {
      fromTeamId: r.fromTeamId != null ? Number(r.fromTeamId) : null,
      toTeamId: r.toTeamId != null ? Number(r.toTeamId) : null,
      playerId: hasPlayer ? Number(r.playerId) : null,
      playerName: r.playerName ?? null,
      position: r.position ?? null,
      itemType: r.itemType != null ? String(r.itemType) : null,
      overallPickNumber: r.overallPickNumber != null ? Number(r.overallPickNumber) : null,
      round: r.round != null ? Number(r.round) : null,
      pickInRound: r.pickInRound != null ? Number(r.pickInRound) : null,
    };
  }
  return null;
}

function assetsFromRaw(rows: TxnRow[]): TradeAsset[] {
  for (const r of rows) {
    const p = tryParseRaw(r.rawTransaction ?? undefined);
    if (!p) continue;
    const items = (p.items as Record<string, unknown>[]) || [];
    const out: TradeAsset[] = [];
    for (const item of items) {
      const player = (item.player as Record<string, unknown>) || {};
      const pid = player.id != null ? Number(player.id) : item.playerId != null ? Number(item.playerId) : NaN;
      const hasPlayer = Number.isFinite(pid) && pid > 0;
      const it = String(item.type || "");
      const draftLike = it.toUpperCase().includes("DRAFT") || item.overallPickNumber != null;
      if (!hasPlayer && !draftLike) continue;
      out.push({
        fromTeamId: item.fromTeamId != null ? Number(item.fromTeamId) : null,
        toTeamId: item.toTeamId != null ? Number(item.toTeamId) : null,
        playerId: hasPlayer ? pid : null,
        playerName: (player.fullName as string) ?? (item.playerName as string) ?? null,
        position: null,
        itemType: item.type != null ? String(item.type) : null,
        overallPickNumber: item.overallPickNumber != null ? Number(item.overallPickNumber) : null,
        round: item.round != null ? Number(item.round) : item.roundId != null ? Number(item.roundId) : null,
        pickInRound:
          item.pickInRound != null
            ? Number(item.pickInRound)
            : item.roundPickNumber != null
              ? Number(item.roundPickNumber)
              : null,
      });
    }
    if (out.length) return out;
  }
  return [];
}

function collectTradeAssets(rows: TxnRow[]): TradeAsset[] {
  const fromRows: TradeAsset[] = [];
  for (const r of rows) {
    const a = rowToAsset(r);
    if (a) fromRows.push(a);
  }
  if (fromRows.length) return fromRows;
  return assetsFromRaw(rows);
}

function assetToLabel(a: TradeAsset, meta: Map<number, PlayerBits>): string {
  const draftLike =
    String(a.itemType || "").toUpperCase().includes("DRAFT") ||
    (a.playerId == null && (a.overallPickNumber != null || a.round != null));
  if (draftLike) {
    return formatPickBits({
      round: a.round,
      pickInRound: a.pickInRound,
      overallPickNumber: a.overallPickNumber,
    });
  }
  const pid = a.playerId != null && a.playerId > 0 ? a.playerId : null;
  const m = pid != null ? meta.get(pid) : undefined;
  const pos = (a.position || m?.position || "?").trim();
  const tm = (m?.proTeam || "").trim();
  const name = (a.playerName || "Unknown player").trim();
  if (tm && tm !== "?") return `${name}, ${pos}, ${tm}`;
  return `${name}, ${pos}`;
}

function listPhrase(items: string[]): string {
  if (items.length === 0) return "—";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]!} and ${items[1]!}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]!}`;
}

function describeTrade(rows: TxnRow[], teamMap: Map<number, string>, meta: Map<number, PlayerBits>): string {
  const assets = collectTradeAssets(rows);
  if (assets.length === 0) {
    const st = rows.map(r => r.status).find(Boolean);
    return st ? `Trade (${String(st)})` : "Trade (details unavailable — try re-syncing this season).";
  }

  const teamIds = new Set<number>();
  for (const a of assets) {
    if (a.fromTeamId != null && Number.isFinite(a.fromTeamId)) teamIds.add(a.fromTeamId);
    if (a.toTeamId != null && Number.isFinite(a.toTeamId)) teamIds.add(a.toTeamId);
  }
  const teams = [...teamIds].filter(n => n > 0);

  if (teams.length >= 2) {
    const [ta, tb] = teams.slice(0, 2);
    const aGives = assets
      .filter(a => a.fromTeamId === ta && a.toTeamId === tb)
      .map(a => assetToLabel(a, meta));
    const bGives = assets
      .filter(a => a.fromTeamId === tb && a.toTeamId === ta)
      .map(a => assetToLabel(a, meta));
    const nameA = teamMap.get(ta) || `Team ${ta}`;
    const nameB = teamMap.get(tb) || `Team ${tb}`;
    if (aGives.length || bGives.length) {
      const left = listPhrase(aGives);
      const right = listPhrase(bGives);
      if (aGives.length && bGives.length) {
        return `${nameA} traded ${left} to ${nameB} for ${right}`;
      }
      if (aGives.length) return `${nameA} traded ${left} to ${nameB}`;
      if (bGives.length) return `${nameB} traded ${right} to ${nameA}`;
    }
  }

  // Fallback: one line per asset with direction
  return assets
    .map(a => {
      const from = a.fromTeamId != null ? teamMap.get(a.fromTeamId) || `Team ${a.fromTeamId}` : "?";
      const to = a.toTeamId != null ? teamMap.get(a.toTeamId) || `Team ${a.toTeamId}` : "?";
      return `${from} → ${assetToLabel(a, meta)} → ${to}`;
    })
    .join(" · ");
}

function dominantTradeType(rows: TxnRow[]): string {
  const order = ["TRADE_UPHOLD", "TRADE_ACCEPT", "TRADE", "TRADE_PROPOSAL"];
  for (const t of order) {
    if (rows.some(r => r.type === t)) return t;
  }
  return rows[0]?.type || "TRADE";
}

/** Status line under a trade card — prefer completed-trade rows so grouped proposals match ESPN. */
function displayedTradeStatus(rows: TxnRow[]): string | null {
  const completed = rows.find(
    r => r.type === "TRADE_UPHOLD" || r.type === "TRADE_ACCEPT"
  );
  if (completed?.status != null && String(completed.status).trim() !== "") {
    return String(completed.status);
  }
  const any = rows.find(r => r.status != null && String(r.status).trim() !== "");
  return any?.status != null ? String(any.status) : null;
}

function isExecutedTradeStatus(status: string | null): boolean {
  if (status == null) return false;
  return status.trim().toLowerCase() === "executed";
}

function rowMatchesSearch(r: TxnRow, q: string): boolean {
  if (r.playerName?.toLowerCase().includes(q)) return true;
  if (r.rawTransaction?.toLowerCase().includes(q)) return true;
  return false;
}

function fantasyTeamForRow(r: TxnRow, teamMap: Map<number, string>): string {
  const tid = r.toTeamId ?? r.teamId ?? r.fromTeamId;
  if (tid == null) return "—";
  return teamMap.get(Number(tid)) || `Team ${tid}`;
}

function addDropLine(
  r: TxnRow,
  kind: "ADD" | "DROP" | "WAIVER",
  teamMap: Map<number, string>,
  meta: Map<number, PlayerBits>
): string {
  const ft = fantasyTeamForRow(r, teamMap);
  const label = assetLabel(r, meta);
  if (kind === "ADD") return `Added ${label} — ${ft}`;
  if (kind === "DROP") return `Dropped ${label} — ${ft}`;
  const bid = r.bidAmount != null ? Number(r.bidAmount) : 0;
  const bidPart = Number.isFinite(bid) && bid > 0 ? ` ($${bid.toFixed(0)} bid)` : "";
  return `Claimed ${label}${bidPart} — ${ft}`;
}

function involvedTeamIds(rows: TxnRow[]): number[] {
  const s = new Set<number>();
  for (const r of rows) {
    if (r.teamId != null && r.teamId > 0) s.add(Number(r.teamId));
    if (r.fromTeamId != null && r.fromTeamId > 0) s.add(Number(r.fromTeamId));
    if (r.toTeamId != null && r.toTeamId > 0) s.add(Number(r.toTeamId));
  }
  return [...s].sort((a, b) => a - b);
}

// ── Row styling (ESPN-like colors) ───────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const base = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium";
  if (type === "ADD")
    return (
      <span className={cn(base, "border-emerald-500/25 bg-emerald-500/10 text-emerald-400")}>
        <ArrowDownToLine className="h-3 w-3" />
        Add
      </span>
    );
  if (type === "DROP")
    return (
      <span className={cn(base, "border-red-500/25 bg-red-500/10 text-red-400")}>
        <ArrowUpFromLine className="h-3 w-3" />
        Drop
      </span>
    );
  if (type === "WAIVER")
    return (
      <span className={cn(base, "border-violet-500/25 bg-violet-500/10 text-violet-300")}>
        <Search className="h-3 w-3" />
        Waiver
      </span>
    );
  if (isTradeType(type))
    return (
      <span className={cn(base, "border-sky-500/25 bg-sky-500/10 text-sky-300")}>
        <Repeat2 className="h-3 w-3" />
        {TX_TYPE_LABELS[type] ?? "Trade"}
      </span>
    );
  return <span className={cn(base, "border-border bg-muted/30 text-muted-foreground")}>{type}</span>;
}

function RosterLinks({ season, teams }: { season: number; teams: { tid: number; name: string }[] }) {
  if (teams.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      {teams.map(({ tid, name }) => (
        <Link
          key={tid}
          to={`/roster?season=${season}&teamId=${tid}`}
          className="text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline"
        >
          {name} roster
        </Link>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Transactions() {
  const allSeasonsQ = trpc.espn.allSeasons.useQuery();
  const cachedQ = trpc.espn.cachedSeasons.useQuery();

  const allSeasons: number[] = allSeasonsQ.data ?? [];
  const cachedSeasons: number[] = cachedQ.data ?? [];

  const defaultSeason =
    cachedSeasons.length > 0
      ? Math.max(...cachedSeasons)
      : allSeasons.length > 0
        ? allSeasons[allSeasons.length - 1]!
        : 2025;

  const [season, setSeason] = useState<number>(defaultSeason);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [tradeOutcomeFilter, setTradeOutcomeFilter] = useState<"ALL" | "EXECUTED">("ALL");
  const [search, setSearch] = useState("");

  const enabled = cachedSeasons.includes(season);
  const teamIdArg = teamFilter !== "ALL" && Number.isFinite(Number(teamFilter)) ? Number(teamFilter) : undefined;
  const typeFilterArg = typeFilter !== "ALL" ? typeFilter : undefined;

  const txQ = trpc.espn.transactions.useQuery(
    { season, typeFilter: typeFilterArg, teamId: teamIdArg },
    { enabled, staleTime: 0 }
  );
  const teamsQ = trpc.espn.teams.useQuery({ season }, { enabled, staleTime: 0 });
  const rostersQ = trpc.espn.rosters.useQuery({ season }, { enabled, staleTime: 0 });

  const teams = (teamsQ.data as TeamRow[] | undefined) ?? [];
  const rawTxns = (txQ.data as TxnRow[] | undefined) ?? [];

  const teamMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of teams) m.set(t.teamId, t.teamName || t.owners || `Team ${t.teamId}`);
    return m;
  }, [teams]);

  const playerMeta = useMemo(() => {
    const m = new Map<number, PlayerBits>();
    for (const r of (rostersQ.data ?? []) as RosterRow[]) {
      const pid = r.playerId;
      if (pid == null || pid <= 0) continue;
      if (!m.has(pid)) {
        m.set(pid, {
          position: (r.position || "?").trim(),
          proTeam: (r.proTeam || "?").trim(),
        });
      }
    }
    return m;
  }, [rostersQ.data]);

  const displayList = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = rawTxns;
    if (q) {
      rows = rows.filter(r => rowMatchesSearch(r, q));
    }

    const tradeBuckets = new Map<string, TxnRow[]>();
    const simpleRows: TxnRow[] = [];
    for (const r of rows) {
      if (isTradeType(r.type)) {
        const k = tradeClusterKey(r);
        if (!k) continue;
        const arr = tradeBuckets.get(k) ?? [];
        arr.push(r);
        tradeBuckets.set(k, arr);
      } else {
        simpleRows.push(r);
      }
    }

    const entries: DisplayEntry[] = [];
    for (const [proposalKey, groupRows] of tradeBuckets) {
      entries.push({ kind: "trade", key: proposalKey, rows: groupRows });
    }
    for (const r of simpleRows) {
      entries.push({ kind: "simple", row: r });
    }

    const filtered = entries;
    filtered.sort((a, b) => {
      const ma =
        a.kind === "trade" ? Math.max(0, ...a.rows.map(eventMs)) : eventMs(a.row);
      const mb =
        b.kind === "trade" ? Math.max(0, ...b.rows.map(eventMs)) : eventMs(b.row);
      return mb - ma;
    });

    if (tradeOutcomeFilter === "EXECUTED") {
      return filtered.filter(
        e =>
          e.kind === "trade" && isExecutedTradeStatus(displayedTradeStatus(e.rows))
      );
    }

    return filtered;
  }, [rawTxns, search, tradeOutcomeFilter]);

  const isNotCached = !cachedSeasons.includes(season);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
          <p className="mt-1 text-muted-foreground">
            Recent activity — adds, drops, waivers, and trades (grouped like ESPN).
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={txQ.isFetching || isNotCached}
          onClick={() => void txQ.refetch()}
        >
          {txQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 py-4">
          <div className="w-28">
            <Select
              value={String(season)}
              onValueChange={v => {
                setSeason(Number(v));
                setTypeFilter("ALL");
                setTeamFilter("ALL");
                setTradeOutcomeFilter("ALL");
                setSearch("");
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...allSeasons].reverse().map(s => (
                  <SelectItem key={s} value={String(s)}>
                    <span className="flex items-center gap-1.5">
                      {s}
                      {cachedSeasons.includes(s) && <span className="text-emerald-400 text-xs">✓</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-44">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TX_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-48">
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All teams</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t.teamId} value={String(t.teamId)}>
                    {t.teamName || t.owners || `Team ${t.teamId}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-44">
            <Select
              value={tradeOutcomeFilter}
              onValueChange={v => setTradeOutcomeFilter(v as "ALL" | "EXECUTED")}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All transactions</SelectItem>
                <SelectItem value="EXECUTED">Trades Executed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="relative min-w-36 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-9 pl-8 text-sm"
              placeholder="Search player…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {!isNotCached && !txQ.isLoading && (
            <div className="ml-auto flex items-center self-center text-xs text-muted-foreground">
              {displayList.length} event{displayList.length === 1 ? "" : "s"} · {rawTxns.length} row{rawTxns.length === 1 ? "" : "s"}
            </div>
          )}
        </CardContent>
      </Card>

      {isNotCached && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Season {season} has not been synced yet. Go to{" "}
          <a href="/sync" className="underline underline-offset-2">
            Sync Data
          </a>{" "}
          to fetch it.
        </div>
      )}

      {txQ.isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading transactions…
        </div>
      )}

      {txQ.isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {txQ.error.message}
        </div>
      )}

      {!txQ.isLoading && !txQ.isError && !isNotCached && displayList.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          {rawTxns.length === 0
            ? "No transactions found for this season."
            : "No transactions match the current filters."}
        </div>
      )}

      {displayList.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{season} recent activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/60">
              {displayList.map((entry, idx) => {
                if (entry.kind === "trade") {
                  const ms = Math.max(0, ...entry.rows.map(eventMs));
                  const { date, time } = formatWhen(ms);
                  const dtype = dominantTradeType(entry.rows);
                  const detail = describeTrade(entry.rows, teamMap, playerMeta);
                  const teamsCol = involvedTeamIds(entry.rows);
                  const rosterTeams = teamsCol.map(tid => ({
                    tid,
                    name: teamMap.get(tid) || `Team ${tid}`,
                  }));
                  const tradeStatusLine = displayedTradeStatus(entry.rows);
                  return (
                    <div
                      key={`trade-${entry.key}-${idx}`}
                      className="grid gap-3 px-4 py-4 sm:grid-cols-[5.5rem_minmax(0,auto)_1fr_minmax(0,7rem)] sm:items-start"
                    >
                      <div className="text-xs text-muted-foreground sm:pt-0.5">
                        <div className="font-medium text-foreground">{date}</div>
                        {time ? <div>{time}</div> : null}
                      </div>
                      <div className="sm:pt-0.5">
                        <TypeBadge type={dtype} />
                      </div>
                      <div className="min-w-0 space-y-1 text-sm text-foreground">
                        <p className="leading-snug">{detail}</p>
                        {tradeStatusLine ? (
                          <p className="text-xs text-muted-foreground">Status: {tradeStatusLine}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-start gap-1 sm:items-end">
                        <RosterLinks season={season} teams={rosterTeams} />
                      </div>
                    </div>
                  );
                }

                const r = entry.row;
                const ms = eventMs(r);
                const { date, time } = formatWhen(ms);
                const t = r.type || "";
                let detail = "";
                if (t === "ADD") detail = addDropLine(r, "ADD", teamMap, playerMeta);
                else if (t === "DROP") detail = addDropLine(r, "DROP", teamMap, playerMeta);
                else if (t === "WAIVER") detail = addDropLine(r, "WAIVER", teamMap, playerMeta);
                else {
                  const raw = tryParseRaw(r.rawTransaction ?? undefined);
                  const memo = raw && typeof raw.memo === "string" ? raw.memo : null;
                  detail =
                    memo ||
                    [assetLabel(r, playerMeta), r.status ? `(${String(r.status)})` : ""].filter(Boolean).join(" ");
                }

                const teamsCol = involvedTeamIds([r]);

                return (
                  <div
                    key={`${r.transactionId}-${r.playerId}-${idx}`}
                    className="grid gap-3 px-4 py-4 sm:grid-cols-[5.5rem_minmax(0,auto)_1fr_minmax(0,7rem)] sm:items-start"
                  >
                    <div className="text-xs text-muted-foreground sm:pt-0.5">
                      <div className="font-medium text-foreground">{date}</div>
                      {time ? <div>{time}</div> : null}
                    </div>
                    <div className="sm:pt-0.5">
                      <TypeBadge type={t} />
                    </div>
                    <div className="min-w-0 text-sm leading-snug text-foreground">{detail}</div>
                    <div className="flex flex-col items-start gap-1 sm:items-end">
                      <RosterLinks
                        season={season}
                        teams={teamsCol.map(tid => ({
                          tid,
                          name: teamMap.get(tid) || `Team ${tid}`,
                        }))}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
