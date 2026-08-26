import { eq, inArray } from "drizzle-orm";
import { fantasyDataCache, gmPlayerRegistry } from "../drizzle/schema";
import { getDb, getCachedView } from "./db";
import { getDraftBoard } from "./fantasyDataService";
import {
  pdeSeasonPolicy,
  rankingQualityForPolicy,
  pdeLeagueOrderProxyRank,
  type PdeRankingKind,
} from "../client/src/lib/postDraftEval/historicalIntegrity";
import {
  resolvePickDisplayIdentity,
  UNAVAILABLE_PLAYER_LABEL,
} from "../client/src/lib/postDraftEval/playerDisplay";

export type PdeBoardPlayer = {
  playerId: number | null;
  fpId: number | null;
  name: string;
  position: string;
  ecrRank: number | null;
  adp: number | null;
  tier: number | null;
  projectedPoints: number | null;
  marketValue: number | null;
};

export type PdePickRow = {
  overallPick: number;
  round: number;
  roundPick: number;
  teamId: number;
  playerId: number | null;
  playerName: string;
  position: string | null;
  isKeeper: boolean;
};

function normalizePos(position: string | null | undefined): string {
  const p = String(position || "").toUpperCase().trim();
  if (p === "D/ST" || p === "DST" || p === "DEF") return "DEF";
  if (p === "PK") return "K";
  return p;
}

function nameKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’.]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function espnSlotToPos(slot: number): string {
  if (slot === 1) return "QB";
  if (slot === 2) return "RB";
  if (slot === 3) return "WR";
  if (slot === 4) return "TE";
  if (slot === 5) return "K";
  if (slot === 16) return "DEF";
  return "";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** ESPN publishes 170 as a "no ADP" sentinel on historical seasons that still have draft ranks. */
const ESPN_ADP_SENTINEL = 170;

export function espnOffenseAdpCacheKey(season: number): string {
  return `espn:offense-adp:${season}`;
}

export function usableEspnAdp(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n >= ESPN_ADP_SENTINEL - 0.5) return null;
  return Math.round(n * 100) / 100;
}

export function usableEspnRank(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 400) return null;
  return Math.round(n);
}

function pushRankedPlayer(
  out: PdeBoardPlayer[],
  args: { playerId: number | null; name: string; position: string; adp: number | null; ecrRank: number | null; tier?: number | null },
) {
  if (args.adp == null && args.ecrRank == null) return;
  out.push({
    playerId: args.playerId,
    fpId: null,
    name: args.name,
    position: args.position || "UNK",
    ecrRank: args.ecrRank ?? args.adp,
    adp: args.adp,
    tier: args.tier ?? null,
    projectedPoints: null,
    marketValue: null,
  });
}

function parseEspnPlayerRow(item: unknown, index: number): PdeBoardPlayer | null {
  const rec = asRecord(item);
  if (!rec) return null;
  const nested = asRecord(rec.player) ?? rec;
  const name = String(
    nested.fullName ?? nested.playerName ?? nested.name ?? rec.fullName ?? rec.playerName ?? rec.name ?? "",
  ).trim();
  const idRaw = nested.id ?? nested.playerId ?? rec.id ?? rec.playerId;
  const playerId = Number(idRaw) > 0 ? Number(idRaw) : null;
  const pos =
    normalizePos(String(nested.defaultPosition ?? nested.position ?? rec.position ?? "")) ||
    espnSlotToPos(Number(nested.defaultPositionId ?? rec.defaultPositionId ?? 0));
  const own = asRecord(nested.ownership) ?? asRecord(rec.ownership);
  const ranks = asRecord(nested.draftRanksByRankType) ?? asRecord(rec.draftRanksByRankType);
  const ppr = asRecord(ranks?.PPR) ?? asRecord(ranks?.STANDARD);
  const adp =
    usableEspnAdp(nested.adp) ??
    usableEspnAdp(rec.adp) ??
    usableEspnAdp(own?.averageDraftPosition);
  const ecr =
    usableEspnRank(nested.ecrRank) ??
    usableEspnRank(rec.ecrRank) ??
    usableEspnRank(rec.rank) ??
    usableEspnRank(ppr?.rank) ??
    adp;
  if (adp == null && ecr == null) return null;
  if (!name && playerId == null) return null;
  return {
    playerId,
    fpId: null,
    name,
    position: pos || "UNK",
    ecrRank: ecr,
    adp,
    tier: Number(nested.tier ?? rec.tier) || null,
    projectedPoints: null,
    marketValue: null,
  };
}

function parseEspnAdpIdMap(players: Record<string, unknown>): PdeBoardPlayer[] {
  const out: PdeBoardPlayer[] = [];
  for (const [id, val] of Object.entries(players)) {
    const playerId = Number(id) > 0 ? Number(id) : null;
    const rec = asRecord(val) ?? {};
    const adp = usableEspnAdp(rec.adp);
    const ecr = usableEspnRank(rec.rank) ?? usableEspnRank(rec.ecrRank) ?? adp;
    const name = String(rec.name ?? rec.fullName ?? rec.playerName ?? "").trim();
    const pos = normalizePos(String(rec.position ?? rec.defaultPosition ?? "")) || "UNK";
    pushRankedPlayer(out, { playerId, name, position: pos, adp, ecrRank: ecr });
  }
  return out;
}

/** Exported for unit tests. Accepts ESPN arrays and the stored `{ players: { [espnId]: { adp } } }` map. */
export function parseEspnAdpPayload(raw: unknown): PdeBoardPlayer[] {
  if (Array.isArray(raw)) {
    return raw.map((item, i) => parseEspnPlayerRow(item, i)).filter((p): p is PdeBoardPlayer => p != null);
  }
  const rec = asRecord(raw);
  if (!rec) return [];
  if (rec.players && typeof rec.players === "object" && !Array.isArray(rec.players)) {
    return parseEspnAdpIdMap(rec.players as Record<string, unknown>);
  }
  const list = (Array.isArray(rec.players) ? rec.players : null) ??
    (Array.isArray(rec.data) ? rec.data : null) ??
    (Array.isArray(rec.rankings) ? rec.rankings : null) ??
    [];
  return list.map((item, i) => parseEspnPlayerRow(item, i)).filter((p): p is PdeBoardPlayer => p != null);
}

function extractCombinedIdentities(payload: unknown): Map<number, { name: string; position: string | null }> {
  const map = new Map<number, { name: string; position: string | null }>();
  const rec = asRecord(payload);
  if (!rec) return map;
  const players = Array.isArray(rec.players) ? rec.players : [];
  for (const item of players) {
    const row = asRecord(item);
    const nested = asRecord(row?.player) ?? row;
    if (!nested) continue;
    const id = Number(nested.id ?? row?.id ?? nested.playerId);
    const name = String(nested.fullName ?? nested.name ?? "").trim();
    if (!(id > 0) || !name) continue;
    const pos =
      normalizePos(String(nested.defaultPosition ?? nested.position ?? "")) ||
      espnSlotToPos(Number(nested.defaultPositionId ?? 0)) ||
      null;
    map.set(id, { name, position: pos });
  }
  const draftDetail = asRecord(rec.draftDetail);
  const picks = Array.isArray(draftDetail?.picks) ? draftDetail.picks : [];
  for (const item of picks) {
    const row = asRecord(item);
    if (!row) continue;
    const id = Number(row.playerId);
    const name = String(row.playerName ?? row.fullName ?? "").trim();
    if (!(id > 0) || !name || map.has(id)) continue;
    map.set(id, { name, position: normalizePos(String(row.position ?? "")) || null });
  }
  return map;
}

export async function resolvePdePickIdentities(leagueId: string, season: number, picks: PdePickRow[]): Promise<PdePickRow[]> {
  const missingIds = [
    ...new Set(
      picks
        .filter((p) => Number(p.playerId) > 0 && !String(p.playerName || "").trim())
        .map((p) => String(p.playerId)),
    ),
  ];
  const registry = new Map<number, { name: string; position: string | null }>();
  if (missingIds.length > 0) {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select({
          espnPlayerId: gmPlayerRegistry.espnPlayerId,
          fullName: gmPlayerRegistry.fullName,
          position: gmPlayerRegistry.position,
        })
        .from(gmPlayerRegistry)
        .where(inArray(gmPlayerRegistry.espnPlayerId, missingIds));
      for (const row of rows) {
        const id = Number(row.espnPlayerId);
        const name = String(row.fullName || "").trim();
        if (id > 0 && name) {
          registry.set(id, { name, position: normalizePos(row.position) || null });
        }
      }
    }
  }
  let combined = new Map<number, { name: string; position: string | null }>();
  const stillMissing = picks.some(
    (p) => Number(p.playerId) > 0 && !String(p.playerName || "").trim() && !registry.has(Number(p.playerId)),
  );
  if (stillMissing) {
    try {
      const cached = await getCachedView(season, "combined", leagueId);
      combined = extractCombinedIdentities(cached?.payload ?? null);
    } catch {
      combined = new Map();
    }
  }
  return picks.map((pick) => {
    const lookupId = Number(pick.playerId) > 0 ? Number(pick.playerId) : null;
    const fromRegistry = lookupId ? registry.get(lookupId) : null;
    const fromCombined = lookupId ? combined.get(lookupId) : null;
    const lookup = fromRegistry
      ? { name: fromRegistry.name, position: fromRegistry.position, source: "registry" as const }
      : fromCombined
        ? { name: fromCombined.name, position: fromCombined.position, source: "espn_cache" as const }
        : null;
    const resolved = resolvePickDisplayIdentity(
      { playerId: pick.playerId, playerName: pick.playerName, position: pick.position },
      lookup,
    );
    return {
      ...pick,
      playerName: resolved.unresolved ? UNAVAILABLE_PLAYER_LABEL : resolved.name,
      position: resolved.position,
    };
  });
}

const ESPN_KONA_FILTER = JSON.stringify({
  players: {
    limit: 1500,
    sortAdp: { sortPriority: 1, sortAsc: true },
    filterRanksForScoringPeriodIds: { value: [1] },
    filterRanksForRankTypes: { value: ["PPR"] },
    filterSlotIds: { value: [0, 2, 4, 6, 17, 16, 23] },
  },
});

function konaToCachePlayers(rows: PdeBoardPlayer[]): Record<string, { adp: number | null; rank: number | null; name: string; position: string }> {
  const players: Record<string, { adp: number | null; rank: number | null; name: string; position: string }> = {};
  for (const row of rows) {
    if (!row.playerId) continue;
    players[String(row.playerId)] = {
      adp: row.adp,
      rank: row.ecrRank,
      name: row.name,
      position: row.position,
    };
  }
  return players;
}

async function fetchEspnKonaSeason(season: number): Promise<PdeBoardPlayer[]> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId=1`;
  const resp = await fetch(url, { headers: { "X-Fantasy-Filter": ESPN_KONA_FILTER } });
  if (!resp.ok) return [];
  const raw: unknown = await resp.json();
  return parseEspnAdpPayload(raw);
}

async function persistEspnOffenseAdp(season: number, ranked: PdeBoardPlayer[]): Promise<void> {
  const usable = ranked.filter((p) => p.playerId && (p.adp != null || p.ecrRank != null));
  if (usable.length < 50) return;
  const db = await getDb();
  if (!db) return;
  const key = espnOffenseAdpCacheKey(season);
  const body = JSON.stringify({
    season,
    fetchedAt: new Date().toISOString(),
    source: "espn_kona_player_info",
    players: konaToCachePlayers(usable),
  });
  const now = new Date();
  await db
    .insert(fantasyDataCache)
    .values({ cacheKey: key, payload: body, fetchedAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { payload: body, fetchedAt: now, updatedAt: now } });
}

async function hydrateNamesFromRegistry(players: PdeBoardPlayer[]): Promise<PdeBoardPlayer[]> {
  const missing = players.filter((p) => Number(p.playerId) > 0 && !String(p.name || "").trim());
  if (missing.length === 0) return players;
  const db = await getDb();
  if (!db) return players;
  const ids = [...new Set(missing.map((p) => String(p.playerId)))];
  const rows = await db
    .select({
      espnPlayerId: gmPlayerRegistry.espnPlayerId,
      fullName: gmPlayerRegistry.fullName,
      position: gmPlayerRegistry.position,
    })
    .from(gmPlayerRegistry)
    .where(inArray(gmPlayerRegistry.espnPlayerId, ids));
  const names = new Map<number, { name: string; position: string | null }>();
  for (const row of rows) {
    const id = Number(row.espnPlayerId);
    const name = String(row.fullName || "").trim();
    if (id > 0 && name) names.set(id, { name, position: normalizePos(row.position) || null });
  }
  return players.map((p) => {
    if (String(p.name || "").trim() || !p.playerId) return p;
    const hit = names.get(p.playerId);
    if (!hit) return p;
    return {
      ...p,
      name: hit.name,
      position: p.position === "UNK" && hit.position ? hit.position : p.position,
    };
  });
}

async function loadEspnSeasonAdp(season: number): Promise<PdeBoardPlayer[]> {
  const db = await getDb();
  const key = espnOffenseAdpCacheKey(season);
  if (db) {
    const rows = await db.select().from(fantasyDataCache).where(eq(fantasyDataCache.cacheKey, key)).limit(1);
    const payload = rows[0]?.payload;
    if (payload) {
      try {
        const parsed = parseEspnAdpPayload(typeof payload === "string" ? JSON.parse(payload) : payload);
        if (parsed.length > 0) return hydrateNamesFromRegistry(parsed);
      } catch {
        /* fall through to live fetch */
      }
    }
  }
  const live = await fetchEspnKonaSeason(season);
  if (live.length >= 50) {
    await persistEspnOffenseAdp(season, live);
    return hydrateNamesFromRegistry(live);
  }
  return [];
}

async function loadCurrentBoard(): Promise<PdeBoardPlayer[]> {
  try {
    const board = await getDraftBoard(false);
    return board.players.map((p) => ({
      playerId: null,
      fpId: p.fpId,
      name: p.name,
      position: normalizePos(p.position),
      ecrRank: p.ecrRank,
      adp: p.adp,
      tier: p.tier,
      projectedPoints: null,
      marketValue: null,
    }));
  } catch {
    return [];
  }
}

export async function loadPdeRankingBoard(
  season: number,
  picks: PdePickRow[],
): Promise<{
  board: PdeBoardPlayer[];
  rankingSource: "fantasypros_current" | "espn_season_adp" | "historical_draft_order_proxy" | "mixed";
  rankingEvidenceQuality: "season_cache" | "current_cache" | "league_order" | "none";
  rankingKind: PdeRankingKind;
}> {
  const policy = pdeSeasonPolicy(season);
  let ranked: PdeBoardPlayer[] = [];
  if (policy.rankingKind === "current_board") {
    ranked = await loadCurrentBoard();
  } else if (policy.rankingKind === "espn_season_adp") {
    ranked = await loadEspnSeasonAdp(season);
  }

  const byId = new Map<number, PdeBoardPlayer>();
  for (const p of ranked) {
    if (Number(p.playerId) > 0) byId.set(Number(p.playerId), { ...p });
  }
  for (const pick of picks) {
    const id = Number(pick.playerId);
    if (!(id > 0) || !byId.has(id)) continue;
    const existing = byId.get(id)!;
    const pickName = String(pick.playerName || "").trim();
    byId.set(id, {
      ...existing,
      name: pickName || existing.name,
      position: normalizePos(pick.position) || existing.position,
    });
  }
  ranked = ranked.map((p) => (Number(p.playerId) > 0 && byId.has(Number(p.playerId)) ? byId.get(Number(p.playerId))! : p));

  const seen = new Set<string>();
  const board: PdeBoardPlayer[] = [];
  for (const p of ranked) {
    const idKey = Number(p.playerId) > 0 ? `id:${p.playerId}` : "";
    const nameKeyStr = `${nameKey(p.name)}|${p.position}`;
    if (idKey && seen.has(idKey)) continue;
    if (!idKey && (nameKeyStr.startsWith("|") || seen.has(nameKeyStr))) continue;
    if (idKey) seen.add(idKey);
    if (!nameKeyStr.startsWith("|")) seen.add(nameKeyStr);
    board.push(p);
  }
  let proxyAdded = 0;
  for (const pick of picks) {
    const name = String(pick.playerName || "").trim();
    if (!name || name === UNAVAILABLE_PLAYER_LABEL) continue;
    const idKey = Number(pick.playerId) > 0 ? `id:${pick.playerId}` : "";
    const k = `${nameKey(name)}|${normalizePos(pick.position)}`;
    if (idKey && seen.has(idKey)) continue;
    if (seen.has(k)) continue;
    if (idKey) seen.add(idKey);
    seen.add(k);
    proxyAdded += 1;
    const proxyRank = pdeLeagueOrderProxyRank(policy.rankingKind, pick.overallPick);
    board.push({
      playerId: pick.playerId,
      fpId: null,
      name,
      position: normalizePos(pick.position) || "UNK",
      ecrRank: proxyRank.ecrRank,
      adp: proxyRank.adp,
      tier: null,
      projectedPoints: null,
      marketValue: null,
    });
  }

  const quality = rankingQualityForPolicy(policy.rankingKind);
  let rankingSource: "fantasypros_current" | "espn_season_adp" | "historical_draft_order_proxy" | "mixed";
  if (policy.rankingKind === "current_board" && ranked.length > 0) {
    rankingSource = proxyAdded > 0 ? "mixed" : "fantasypros_current";
  } else if (policy.rankingKind === "espn_season_adp" && ranked.length > 0) {
    rankingSource = proxyAdded > 0 ? "mixed" : "espn_season_adp";
  } else {
    rankingSource = "historical_draft_order_proxy";
  }

  const rankingEvidenceQuality =
    rankingSource === "historical_draft_order_proxy"
      ? "league_order"
      : quality === "archived" || quality === "none"
        ? "league_order"
        : quality;

  return {
    board,
    rankingSource,
    rankingEvidenceQuality,
    rankingKind: policy.rankingKind,
  };
}

export function pdeRankingNote(
  source: "fantasypros_current" | "espn_season_adp" | "historical_draft_order_proxy" | "mixed",
  season: number,
): string {
  if (source === "espn_season_adp") {
    return `Season-labeled ESPN ADP/ranks for ${season}. This is not a proven draft-week archive, so recommendation confidence is capped at medium.`;
  }
  if (source === "fantasypros_current") {
    return `FantasyPros ECR/ADP is the current in-app cache, not a proven draft-week archive for ${season}. Treat it as season-appropriate ranking evidence, not contemporaneous.`;
  }
  if (source === "mixed") {
    return "Matched players use season-appropriate ranking caches (not a draft-week archive). Unmatched names prove availability only and are not treated as talent rankings.";
  }
  return "Rivals can reconstruct who was available from this league's draft history, but reliable draft-time rankings are unavailable for this season. Recommendations are shown with reduced confidence.";
}
