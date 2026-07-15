/**
 * rivalryStoryReceipts.ts
 *
 * Resolves rivalry story receipt IDs into structured evidence objects.
 * Consumes H2H, championship, and completed-trade authorities only — no
 * story classification changes and no narrative prose.
 */
import { getDb } from "./db";
import { buildH2HAuthority, type H2HMeeting, type H2HResult } from "./h2hAuthority";
import { buildChampionshipAuthority, type ChampionshipAuthority } from "./championshipAuthority";
import {
  loadCompletedTradeIntelligence,
  type CompletedTradeIntel,
} from "./completedTradeAuthority";
import {
  meetingReceiptId,
  normalizeOwnerKey,
  type DocumentaryFactKey,
  type RivalryStoryResult,
} from "./rivalryStoryAuthority";

// ── Public types ──────────────────────────────────────────────────────────────

export type RivalryReceiptType =
  | "game"
  | "season"
  | "trade"
  | "championship"
  | "unknown";

export type RivalryReceiptSource =
  | "gmMatchups"
  | "completedTradeAuthority"
  | "championshipAuthority"
  | "derived";

export interface RivalryStoryReceipt {
  receiptId: string;
  type: RivalryReceiptType;
  season: number;
  week?: number;
  isPlayoff?: boolean;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  winnerOwnerKey?: string;
  loserOwnerKey?: string;
  focalScore?: number;
  rivalScore?: number;
  /** Signed from focal perspective (positive = focal ahead / focal won). */
  margin?: number;
  factKeys: string[];
  source: RivalryReceiptSource;
}

export interface RivalryStoryReceiptContext {
  focalOwnerKey: string;
  rivalOwnerKey: string;
  h2h: H2HResult;
  pairTrades: CompletedTradeIntel[];
  championship: ChampionshipAuthority;
}

// ── Receipt ID parsing ────────────────────────────────────────────────────────

const GM_RECEIPT_RE = /^gm:(\d+):(\d+)$/;
const TRADE_RECEIPT_RE = /^trade:(.+)$/;
const TITLE_RECEIPT_RE = /^title:(focal|rival):(\d+)$/;

export type ParsedReceiptId =
  | { kind: "game"; season: number; matchupPeriodId: number }
  | { kind: "trade"; clusterId: string }
  | { kind: "title"; side: "focal" | "rival"; titleCount: number }
  | { kind: "unknown" };

export function parseReceiptId(receiptId: string): ParsedReceiptId {
  const gm = receiptId.match(GM_RECEIPT_RE);
  if (gm) {
    return {
      kind: "game",
      season: Number(gm[1]),
      matchupPeriodId: Number(gm[2]),
    };
  }
  const trade = receiptId.match(TRADE_RECEIPT_RE);
  if (trade) {
    return { kind: "trade", clusterId: trade[1]! };
  }
  const title = receiptId.match(TITLE_RECEIPT_RE);
  if (title) {
    return {
      kind: "title",
      side: title[1] as "focal" | "rival",
      titleCount: Number(title[2]),
    };
  }
  return { kind: "unknown" };
}

// ── Story receipt collection ──────────────────────────────────────────────────

export function collectStoryReceiptIds(story: RivalryStoryResult): {
  receiptIds: string[];
  factKeysByReceiptId: Map<string, DocumentaryFactKey[]>;
} {
  const factKeysByReceiptId = new Map<string, DocumentaryFactKey[]>();
  const seen = new Set<string>();
  const receiptIds: string[] = [];

  const track = (id: string, factKey?: DocumentaryFactKey) => {
    if (!seen.has(id)) {
      seen.add(id);
      receiptIds.push(id);
    }
    if (factKey) {
      const list = factKeysByReceiptId.get(id) ?? [];
      if (!list.includes(factKey)) list.push(factKey);
      factKeysByReceiptId.set(id, list);
    }
  };

  for (const id of story.headline.receiptIds) track(id);
  for (const fact of story.documentaryFacts) {
    for (const id of fact.supportingGameIds) track(id, fact.factKey);
  }

  return { receiptIds, factKeysByReceiptId };
}

// ── Pure resolver ─────────────────────────────────────────────────────────────

function meetingByReceiptId(h2h: H2HResult): Map<string, H2HMeeting> {
  const map = new Map<string, H2HMeeting>();
  for (const m of h2h.meetings) {
    map.set(meetingReceiptId(m), m);
  }
  return map;
}

function tradeByClusterId(trades: CompletedTradeIntel[]): Map<string, CompletedTradeIntel> {
  const map = new Map<string, CompletedTradeIntel>();
  for (const t of trades) map.set(t.clusterId, t);
  return map;
}

function focalTradeMargin(trade: CompletedTradeIntel, focalOwnerKey: string): number {
  const focal = normalizeOwnerKey(focalOwnerKey);
  const winner = trade.winnerOwnerKey ? normalizeOwnerKey(trade.winnerOwnerKey) : null;
  if (!winner || trade.margin === 0) return 0;
  return winner === focal ? trade.margin : -trade.margin;
}

function resolveGameReceipt(args: {
  receiptId: string;
  meeting: H2HMeeting;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  factKeys: string[];
}): RivalryStoryReceipt {
  const { receiptId, meeting, focalOwnerKey, rivalOwnerKey, factKeys } = args;
  const winner = meeting.winner;
  const loser =
    winner === focalOwnerKey
      ? rivalOwnerKey
      : winner === rivalOwnerKey
        ? focalOwnerKey
        : undefined;

  return {
    receiptId,
    type: "game",
    season: meeting.season,
    week: meeting.week,
    isPlayoff: meeting.isPlayoff,
    focalOwnerKey,
    rivalOwnerKey,
    winnerOwnerKey: winner ?? undefined,
    loserOwnerKey: loser,
    focalScore: meeting.scoreA,
    rivalScore: meeting.scoreB,
    margin: meeting.marginA,
    factKeys,
    source: "gmMatchups",
  };
}

function resolveTradeReceipt(args: {
  receiptId: string;
  trade: CompletedTradeIntel;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  factKeys: string[];
}): RivalryStoryReceipt {
  const { receiptId, trade, focalOwnerKey, rivalOwnerKey, factKeys } = args;
  return {
    receiptId,
    type: "trade",
    season: trade.season,
    focalOwnerKey,
    rivalOwnerKey,
    winnerOwnerKey: trade.winnerOwnerKey ?? undefined,
    loserOwnerKey: trade.loserOwnerKey ?? undefined,
    margin: focalTradeMargin(trade, focalOwnerKey),
    factKeys,
    source: "completedTradeAuthority",
  };
}

function resolveTitleReceipt(args: {
  receiptId: string;
  side: "focal" | "rival";
  focalOwnerKey: string;
  rivalOwnerKey: string;
  championship: ChampionshipAuthority;
  factKeys: string[];
}): RivalryStoryReceipt {
  const { receiptId, side, focalOwnerKey, rivalOwnerKey, championship, factKeys } = args;
  const ownerKey = side === "focal" ? focalOwnerKey : rivalOwnerKey;
  const norm = normalizeOwnerKey(ownerKey);
  let seasons: number[] = [];
  for (const [k, list] of championship.championSeasonsByKey) {
    if (normalizeOwnerKey(k) === norm) {
      seasons = [...list].sort((a, b) => a - b);
      break;
    }
  }
  const latestSeason = seasons.length > 0 ? seasons[seasons.length - 1]! : 0;

  return {
    receiptId,
    type: "championship",
    season: latestSeason,
    focalOwnerKey,
    rivalOwnerKey,
    factKeys,
    source: "championshipAuthority",
  };
}

function unknownReceipt(args: {
  receiptId: string;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  factKeys: string[];
}): RivalryStoryReceipt {
  return {
    receiptId: args.receiptId,
    type: "unknown",
    season: 0,
    focalOwnerKey: args.focalOwnerKey,
    rivalOwnerKey: args.rivalOwnerKey,
    factKeys: args.factKeys,
    source: "derived",
  };
}

export function resolveRivalryStoryReceiptsPure(args: {
  focalOwnerKey: string;
  rivalOwnerKey: string;
  receiptIds: string[];
  context: RivalryStoryReceiptContext;
  factKeysByReceiptId?: Map<string, string[]>;
}): RivalryStoryReceipt[] {
  const { focalOwnerKey, rivalOwnerKey, receiptIds, context, factKeysByReceiptId } = args;
  const meetings = meetingByReceiptId(context.h2h);
  const trades = tradeByClusterId(context.pairTrades);
  const seen = new Set<string>();
  const out: RivalryStoryReceipt[] = [];

  for (const receiptId of receiptIds) {
    if (seen.has(receiptId)) continue;
    seen.add(receiptId);

    const factKeys = [...(factKeysByReceiptId?.get(receiptId) ?? [])];
    const parsed = parseReceiptId(receiptId);

    if (parsed.kind === "game") {
      const meeting = meetings.get(receiptId);
      if (meeting) {
        out.push(
          resolveGameReceipt({
            receiptId,
            meeting,
            focalOwnerKey,
            rivalOwnerKey,
            factKeys,
          }),
        );
      } else {
        out.push(unknownReceipt({ receiptId, focalOwnerKey, rivalOwnerKey, factKeys }));
      }
      continue;
    }

    if (parsed.kind === "trade") {
      const trade = trades.get(parsed.clusterId);
      if (trade) {
        out.push(
          resolveTradeReceipt({ receiptId, trade, focalOwnerKey, rivalOwnerKey, factKeys }),
        );
      } else {
        out.push(unknownReceipt({ receiptId, focalOwnerKey, rivalOwnerKey, factKeys }));
      }
      continue;
    }

    if (parsed.kind === "title") {
      out.push(
        resolveTitleReceipt({
          receiptId,
          side: parsed.side,
          focalOwnerKey,
          rivalOwnerKey,
          championship: context.championship,
          factKeys,
        }),
      );
      continue;
    }

    out.push(unknownReceipt({ receiptId, focalOwnerKey, rivalOwnerKey, factKeys }));
  }

  return out;
}

export function resolveReceiptsForStoryPure(
  story: RivalryStoryResult,
  context: RivalryStoryReceiptContext,
): RivalryStoryReceipt[] {
  const { receiptIds, factKeysByReceiptId } = collectStoryReceiptIds(story);
  return resolveRivalryStoryReceiptsPure({
    focalOwnerKey: story.focalOwnerKey,
    rivalOwnerKey: story.rivalOwnerKey,
    receiptIds,
    context,
    factKeysByReceiptId,
  });
}

// ── Async builder ─────────────────────────────────────────────────────────────

function filterPairTrades(
  trades: CompletedTradeIntel[],
  focalOwnerKey: string,
  rivalOwnerKey: string,
): CompletedTradeIntel[] {
  const focal = normalizeOwnerKey(focalOwnerKey);
  const rival = normalizeOwnerKey(rivalOwnerKey);
  return trades.filter((t) => {
    const a = t.sideA.ownerKey ? normalizeOwnerKey(t.sideA.ownerKey) : null;
    const b = t.sideB.ownerKey ? normalizeOwnerKey(t.sideB.ownerKey) : null;
    return (a === focal && b === rival) || (a === rival && b === focal);
  });
}

export async function buildRivalryStoryReceiptContext(args: {
  leagueId: string;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  seasons?: number[];
}): Promise<RivalryStoryReceiptContext> {
  const db = await getDb();
  if (!db) throw new Error("rivalryStoryReceipts: no database connection");

  const h2hAuth = await buildH2HAuthority(args.leagueId);
  const h2h = h2hAuth.getH2H(args.focalOwnerKey, args.rivalOwnerKey);
  const championship = await buildChampionshipAuthority({ db, leagueId: args.leagueId });

  const seasons =
    args.seasons ?? [...new Set(h2h.meetings.map((m) => m.season))].sort((a, b) => a - b);
  const allTrades =
    seasons.length > 0
      ? await loadCompletedTradeIntelligence({ db, leagueId: args.leagueId, seasons })
      : [];
  const pairTrades = filterPairTrades(allTrades, args.focalOwnerKey, args.rivalOwnerKey);

  return {
    focalOwnerKey: args.focalOwnerKey,
    rivalOwnerKey: args.rivalOwnerKey,
    h2h,
    pairTrades,
    championship,
  };
}

export async function resolveRivalryStoryReceipts(args: {
  leagueId: string;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  receiptIds: string[];
  factKeysByReceiptId?: Map<string, string[]>;
  seasons?: number[];
}): Promise<RivalryStoryReceipt[]> {
  const context = await buildRivalryStoryReceiptContext({
    leagueId: args.leagueId,
    focalOwnerKey: args.focalOwnerKey,
    rivalOwnerKey: args.rivalOwnerKey,
    seasons: args.seasons,
  });
  return resolveRivalryStoryReceiptsPure({
    focalOwnerKey: args.focalOwnerKey,
    rivalOwnerKey: args.rivalOwnerKey,
    receiptIds: args.receiptIds,
    context,
    factKeysByReceiptId: args.factKeysByReceiptId,
  });
}

export async function resolveReceiptsForStory(args: {
  leagueId: string;
  story: RivalryStoryResult;
  seasons?: number[];
}): Promise<RivalryStoryReceipt[]> {
  const context = await buildRivalryStoryReceiptContext({
    leagueId: args.leagueId,
    focalOwnerKey: args.story.focalOwnerKey,
    rivalOwnerKey: args.story.rivalOwnerKey,
    seasons: args.seasons,
  });
  return resolveReceiptsForStoryPure(args.story, context);
}
