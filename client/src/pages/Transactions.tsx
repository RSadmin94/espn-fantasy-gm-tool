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
  ArrowLeftRight,
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
  logoUrl?: string;
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

function normalizeStatusForMatch(status: string | null | undefined): string {
  return String(status ?? "").trim().toUpperCase();
}

/** Parent trade status from one row only: raw ESPN parent first, then row.status (never grouped peers). */
function parentTradeStatusFromRow(r: TxnRow): string | null {
  const raw = tryParseRaw(r.rawTransaction ?? undefined);
  if (raw) {
    const st = raw.status;
    if (st != null && String(st).trim() !== "") return String(st);
    const typ = raw.type;
    if (typ != null && String(typ).trim() !== "") return String(typ);
  }
  if (r.status != null && String(r.status).trim() !== "") return String(r.status);
  return null;
}

function parentStatusMatchesFilter(
  statusRaw: string | null,
  filter: "EXECUTED" | "PROPOSED" | "CANCELED"
): boolean {
  const n = normalizeStatusForMatch(statusRaw);
  if (n === "") return false;
  if (filter === "EXECUTED") return n === "EXECUTED";
  if (filter === "PROPOSED") return n === "PROPOSED" || n === "PENDING";
  return n === "CANCELED" || n === "CANCELLED";
}

/** Prefer parent-like trade rows (no player leg) for status reads; deprioritize draft legs and asset legs when possible. */
function scorePrimaryTradeRowForStatusPick(r: TxnRow): number {
  const t = (r.type || "").toUpperCase();
  let s = 0;
  if (t === "TRADE_UPHOLD") s += 40;
  else if (t === "TRADE_ACCEPT") s += 30;
  else if (t === "TRADE") s += 20;
  else if (t === "TRADE_PROPOSAL") s += 10;
  const pid = r.playerId != null ? Number(r.playerId) : NaN;
  if (!Number.isFinite(pid) || pid <= 0) s += 5;
  return s;
}

/**
 * One row whose rawTransaction / status defines the parent trade for filter eligibility.
 * Excludes draft-pick transfer legs and player asset legs when a header-style row exists in the cluster.
 */
function pickRowForParentTradeStatus(group: TxnRow[]): TxnRow | null {
  const trades = group.filter(r => isTradeType(r.type));
  if (trades.length === 0) return null;

  const notDraftLeg = trades.filter(r => !isDraftish(r));
  const primaryLike = notDraftLeg.filter(r => {
    const pid = r.playerId != null ? Number(r.playerId) : NaN;
    return !Number.isFinite(pid) || pid <= 0;
  });

  const pool =
    primaryLike.length > 0 ? primaryLike : notDraftLeg.length > 0 ? notDraftLeg : trades;
  return (
    [...pool].sort(
      (a, b) => scorePrimaryTradeRowForStatusPick(b) - scorePrimaryTradeRowForStatusPick(a)
    )[0] ?? null
  );
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

// ── Trade recap (ESPN-style comparison) ─────────────────────────────────────

interface TradeReceivePlayer {
  key: string;
  name: string;
  position: string;
  nflTeam: string;
}

interface TradeReceivePick {
  key: string;
  label: string;
}

interface TradeSideView {
  id: number;
  name: string;
  logoUrl?: string;
  players: TradeReceivePlayer[];
  picks: TradeReceivePick[];
}

interface TradeSidesModel {
  sideA: TradeSideView;
  sideB: TradeSideView;
}

function ordinal(n: number): string {
  const v = Math.floor(Math.abs(n)) * Math.sign(n || 1);
  const j = v % 10;
  const k = v % 100;
  if (j === 1 && k !== 11) return `${v}st`;
  if (j === 2 && k !== 12) return `${v}nd`;
  if (j === 3 && k !== 13) return `${v}rd`;
  return `${v}th`;
}

function isDraftAsset(a: TradeAsset): boolean {
  return (
    String(a.itemType || "").toUpperCase().includes("DRAFT") ||
    (a.playerId == null && (a.overallPickNumber != null || a.round != null))
  );
}

function formatDraftPickLine(season: number, a: TradeAsset): string {
  const rnd = a.round != null ? Number(a.round) : NaN;
  const pir = a.pickInRound != null ? Number(a.pickInRound) : NaN;
  const ov = a.overallPickNumber != null ? Number(a.overallPickNumber) : NaN;
  if (Number.isFinite(rnd) && Number.isFinite(pir)) {
    return `${season} ${ordinal(rnd)} Round Pick (Round ${rnd} Pick ${pir})`;
  }
  if (Number.isFinite(ov)) {
    return `${season} Draft Pick (#${ov} overall)`;
  }
  return `${season} Draft pick`;
}

function buildTradeSidesModel(
  rows: TxnRow[],
  season: number,
  teamMap: Map<number, string>,
  teamLogoById: Map<number, string>,
  meta: Map<number, PlayerBits>
): TradeSidesModel | null {
  const assets = collectTradeAssets(rows);
  if (assets.length === 0) return null;

  const teamIds = new Set<number>();
  for (const a of assets) {
    if (a.fromTeamId != null && Number.isFinite(a.fromTeamId) && a.fromTeamId > 0) teamIds.add(a.fromTeamId);
    if (a.toTeamId != null && Number.isFinite(a.toTeamId) && a.toTeamId > 0) teamIds.add(a.toTeamId);
  }
  const sorted = [...teamIds].sort((a, b) => a - b);
  if (sorted.length < 2) return null;

  const ta = sorted[0]!;
  const tb = sorted[1]!;

  const sideA: TradeSideView = {
    id: ta,
    name: teamMap.get(ta) || `Team ${ta}`,
    logoUrl: teamLogoById.get(ta),
    players: [],
    picks: [],
  };
  const sideB: TradeSideView = {
    id: tb,
    name: teamMap.get(tb) || `Team ${tb}`,
    logoUrl: teamLogoById.get(tb),
    players: [],
    picks: [],
  };

  const pushPick = (tid: number, label: string, idx: number) => {
    const key = `p-${tid}-${idx}-${label}`;
    if (tid === ta) sideA.picks.push({ key, label });
    else if (tid === tb) sideB.picks.push({ key, label });
  };

  const pushPlayer = (tid: number, p: TradeReceivePlayer) => {
    if (tid === ta) sideA.players.push(p);
    else if (tid === tb) sideB.players.push(p);
  };

  let pickIdx = 0;
  for (const a of assets) {
    const to = a.toTeamId != null && a.toTeamId > 0 ? a.toTeamId : null;
    if (to == null) continue;

    if (isDraftAsset(a)) {
      pushPick(to, formatDraftPickLine(season, a), pickIdx++);
      continue;
    }
    if (a.playerId != null && a.playerId > 0) {
      const m = meta.get(a.playerId);
      const name = (a.playerName || "Unknown player").trim();
      const pos = (a.position || m?.position || "?").trim();
      const nflRaw = (m?.proTeam || "").trim();
      const nfl = nflRaw && nflRaw !== "?" ? nflRaw : "—";
      pushPlayer(to, {
        key: `pl-${a.playerId}-${to}-${name}`,
        name,
        position: pos,
        nflTeam: nfl,
      });
    }
  }

  return { sideA, sideB };
}

function statusBadgeClasses(statusRaw: string | null): string {
  const n = normalizeStatusForMatch(statusRaw);
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide";
  if (n === "EXECUTED") return cn(base, "border-emerald-500/40 bg-emerald-500/15 text-emerald-300");
  if (n === "PROPOSED" || n === "PENDING")
    return cn(base, "border-amber-500/40 bg-amber-500/15 text-amber-200");
  if (n === "CANCELED" || n === "CANCELLED") return cn(base, "border-red-500/40 bg-red-500/15 text-red-300");
  return cn(base, "border-border/80 bg-muted/25 text-muted-foreground");
}

function TradeStatusBadge({ status }: { status: string | null }) {
  const label = status != null && String(status).trim() !== "" ? String(status).trim() : "—";
  return <span className={statusBadgeClasses(status)}>{label}</span>;
}

function ReceivesPanel({
  title,
  players,
  picks,
}: {
  title: string;
  players: TradeReceivePlayer[];
  picks: TradeReceivePick[];
}) {
  const hasPlayers = players.length > 0;
  const hasPicks = picks.length > 0;
  if (!hasPlayers && !hasPicks) {
    return (
      <div
        className={cn(
          "rounded-lg border border-sky-500/25 bg-sky-500/[0.06] p-3 text-center text-xs text-muted-foreground",
          "shadow-[0_0_14px_rgba(56,189,248,0.12)]"
        )}
      >
        No assets listed for this side.
      </div>
    );
  }
  return (
    <div
      className={cn(
        "space-y-2.5 rounded-lg border border-sky-500/25 bg-sky-500/[0.06] p-3",
        "shadow-[0_0_14px_rgba(56,189,248,0.12)]"
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-300/90">{title}</div>
      {hasPlayers ? (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Players ({players.length})
          </div>
          <ul className="space-y-1.5">
            {players.map(p => (
              <li key={p.key} className="text-sm leading-tight text-foreground">
                • <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {p.position} · {p.nflTeam}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hasPicks ? (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Draft Picks ({picks.length})
          </div>
          <ul className="space-y-1.5">
            {picks.map(pk => (
              <li key={pk.key} className="text-sm leading-tight text-foreground">
                • {pk.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

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

function TeamHeaderBlock({ name, logoUrl }: { name: string; logoUrl?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded-lg border border-border/70 bg-background object-cover shadow-sm"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/25 text-[11px] font-bold uppercase text-muted-foreground">
          {name.trim().slice(0, 2) || "—"}
        </div>
      )}
      <div className="text-sm font-bold leading-snug text-foreground">{name}</div>
    </div>
  );
}

function TradeComparisonCard({
  entry,
  idx,
  season,
  teamMap,
  teamLogoById,
  playerMeta,
}: {
  entry: { kind: "trade"; key: string; rows: TxnRow[] };
  idx: number;
  season: number;
  teamMap: Map<number, string>;
  teamLogoById: Map<number, string>;
  playerMeta: Map<number, PlayerBits>;
}) {
  const rows = entry.rows;
  const ms = Math.max(0, ...rows.map(eventMs));
  const { date, time } = formatWhen(ms);
  const dtype = dominantTradeType(rows);
  const tradeStatusLine = displayedTradeStatus(rows);
  const narrative = describeTrade(rows, teamMap, playerMeta);
  const sides = buildTradeSidesModel(rows, season, teamMap, teamLogoById, playerMeta);
  const teamsCol = involvedTeamIds(rows);
  const rosterTeams = teamsCol.map(tid => ({
    tid,
    name: teamMap.get(tid) || `Team ${tid}`,
  }));
  const safeId = `trade-recap-${String(entry.key).replace(/[^a-zA-Z0-9_-]/g, "-")}-${idx}`;

  return (
    <div
      id={safeId}
      className="border-b border-border/60 bg-gradient-to-b from-card/40 to-transparent px-3 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">{date}</div>
          {time ? <div>{time}</div> : null}
        </div>
        <details className="group text-right">
          <summary className="cursor-pointer list-none text-xs font-medium text-sky-400 hover:text-sky-300 [&::-webkit-details-marker]:hidden">
            View Details
          </summary>
          <div className="mt-2 max-w-prose space-y-2 rounded-md border border-border/60 bg-muted/15 p-2.5 text-left text-xs text-muted-foreground">
            <p className="leading-relaxed text-foreground/90">{narrative}</p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 pt-2">
              <RosterLinks season={season} teams={rosterTeams} />
            </div>
          </div>
        </details>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TypeBadge type={dtype} />
        <TradeStatusBadge status={tradeStatusLine} />
      </div>

      {sides ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_minmax(2.25rem,auto)_1fr] lg:items-start">
            <div className="flex min-w-0 flex-col gap-2">
              <TeamHeaderBlock name={sides.sideA.name} logoUrl={sides.sideA.logoUrl} />
              <ReceivesPanel title="Receives" players={sides.sideA.players} picks={sides.sideA.picks} />
            </div>

            <div className="flex justify-center py-1 lg:items-start lg:justify-center lg:pt-12">
              <div className="rounded-full border border-sky-500/30 bg-sky-500/10 p-2 text-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.25)]">
                <ArrowLeftRight className="h-5 w-5" aria-hidden />
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <TeamHeaderBlock name={sides.sideB.name} logoUrl={sides.sideB.logoUrl} />
              <ReceivesPanel title="Receives" players={sides.sideB.players} picks={sides.sideB.picks} />
            </div>
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{sides.sideA.name}</span> traded with{" "}
            <span className="font-semibold text-foreground">{sides.sideB.name}</span>
          </p>
          <p className="mt-0.5 text-center text-[11px] text-muted-foreground">
            Status:{" "}
            <span
              className={cn(
                "font-medium",
                normalizeStatusForMatch(tradeStatusLine) === "EXECUTED" && "text-emerald-400",
                (normalizeStatusForMatch(tradeStatusLine) === "PROPOSED" ||
                  normalizeStatusForMatch(tradeStatusLine) === "PENDING") &&
                  "text-amber-300",
                (normalizeStatusForMatch(tradeStatusLine) === "CANCELED" ||
                  normalizeStatusForMatch(tradeStatusLine) === "CANCELLED") &&
                  "text-red-400"
              )}
            >
              {tradeStatusLine ?? "—"}
            </span>
          </p>
        </>
      ) : (
        <div className="mt-3 space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
          <p className="text-sm leading-snug text-foreground">{narrative}</p>
          {tradeStatusLine ? (
            <p className="text-xs text-muted-foreground">
              Status: <span className="font-medium text-foreground">{tradeStatusLine}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <RosterLinks season={season} teams={rosterTeams} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Row styling (ESPN-like colors) ───────────────────────────────────────────

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
  const [tradeStatusFilter, setTradeStatusFilter] = useState<
    "ALL" | "EXECUTED" | "PROPOSED" | "CANCELED"
  >("ALL");
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

  const teamLogoById = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of teams) {
      const u = t.logoUrl != null ? String(t.logoUrl).trim() : "";
      if (u) m.set(t.teamId, u);
    }
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

    if (tradeStatusFilter !== "ALL") {
      const preBuckets = new Map<string, TxnRow[]>();
      for (const r of rows) {
        if (!isTradeType(r.type)) continue;
        const k = tradeClusterKey(r);
        if (!k) continue;
        const arr = preBuckets.get(k) ?? [];
        arr.push(r);
        preBuckets.set(k, arr);
      }
      const allowedKeys = new Set<string>();
      for (const [key, group] of preBuckets) {
        const rep = pickRowForParentTradeStatus(group);
        if (!rep) continue;
        const st = parentTradeStatusFromRow(rep);
        if (!parentStatusMatchesFilter(st, tradeStatusFilter)) continue;
        allowedKeys.add(key);
      }
      rows = rows.filter(r => {
        if (!isTradeType(r.type)) return false;
        const k = tradeClusterKey(r);
        if (!k) return false;
        return allowedKeys.has(k);
      });
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

    return filtered;
  }, [rawTxns, search, tradeStatusFilter]);

  const isNotCached = !cachedSeasons.includes(season);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="w-28">
            <Select
              value={String(season)}
              onValueChange={v => {
                setSeason(Number(v));
                setTypeFilter("ALL");
                setTeamFilter("ALL");
                setTradeStatusFilter("ALL");
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

          <div className="flex w-44 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Type</span>
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

          <div className="flex w-40 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Trade Status</span>
            <Select
              value={tradeStatusFilter}
              onValueChange={v =>
                setTradeStatusFilter(v as "ALL" | "EXECUTED" | "PROPOSED" | "CANCELED")
              }
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="EXECUTED">Executed</SelectItem>
                <SelectItem value="PROPOSED">Proposed</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex w-48 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Team</span>
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

          <div className="relative flex min-w-36 flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-9 pl-8 text-sm"
                placeholder="Search player…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
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
          {tradeStatusFilter === "EXECUTED"
            ? "No more Executed trades to show."
            : tradeStatusFilter === "PROPOSED"
              ? "No more Proposed trades to show."
              : tradeStatusFilter === "CANCELED"
                ? "No more Canceled trades to show."
                : rawTxns.length === 0
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
                  return (
                    <TradeComparisonCard
                      key={`trade-${entry.key}-${idx}`}
                      entry={entry}
                      idx={idx}
                      season={season}
                      teamMap={teamMap}
                      teamLogoById={teamLogoById}
                      playerMeta={playerMeta}
                    />
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
