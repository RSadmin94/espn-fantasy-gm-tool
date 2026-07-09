/**
 * Blank draft-pick resolver (Souls v2 — behavioral engine only).
 *
 * Some leagues' normalized draft_picks rows arrived with no player name/position (position "?").
 * This resolves those blanks AT READ TIME for the souls / choice-ledger / terrain pipeline only.
 * It does NOT mutate draft_picks and does NOT backfill — the enrichment lives in memory.
 *
 * Resolution, per blank pick (keyed by season:overallPick):
 *   1. authoritative ESPN playerId = normalized column if present, else the RAW cached draftDetail
 *      pick's playerId (which still carries ids the normalized table dropped, incl. negative D/ST).
 *   2. positive id  -> gm_player_registry (skill players).
 *   3. negative id  -> ESPN team-D/ST map (slot 16, ids like -16034 = Texans D/ST).
 *   4. no id anywhere -> left unresolved (explicitly missing, never invented).
 *
 * Cached per league for the process. Reused by loadChoiceLedgerInputs + loadSeasonTerrainInputs.
 */
import { sql } from "drizzle-orm";
import type { AppDb } from "../db";

export type ResolvedIdentity = {
  playerName: string;
  position: string;      // normalized ("DST" for team defenses)
  playerId: number | null;
  source: "registry" | "espn_dst";
  confidence: "high" | "low";
};

const _resolverCache = new Map<string, Map<string, ResolvedIdentity>>();
let _dstMap: Map<number, string> | null = null;

/** ESPN team-D/ST id -> "<Team> D/ST" from the public leaguedefaults feed (slot 16). Ids are
 *  negative and constant across seasons, so one current-season fetch resolves all history. */
async function loadEspnDstMap(): Promise<Map<number, string>> {
  if (_dstMap) return _dstMap;
  const year = new Date().getFullYear();
  const filter = JSON.stringify({
    players: {
      limit: 1500,
      sortAdp: { sortPriority: 1, sortAsc: true },
      filterRanksForScoringPeriodIds: { value: [1] },
      filterRanksForRankTypes: { value: ["PPR"] },
      filterSlotIds: { value: [0, 2, 4, 6, 16, 17, 23] },
    },
  });
  const m = new Map<number, string>();
  try {
    const resp = await fetch(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId=1`,
      { headers: { "X-Fantasy-Filter": filter } },
    );
    if (resp.ok) {
      const d = await resp.json();
      for (const e of (d?.players ?? [])) {
        if (Number(e?.player?.defaultPositionId) === 16 && e?.player?.fullName) m.set(Number(e.id), e.player.fullName);
      }
    }
  } catch { /* offline -> empty; D/ST simply stay unresolved (no fake) */ }
  _dstMap = m;
  return m;
}

export type BlankResolverStats = {
  blanks: number;
  recoveredSkill: number;
  recoveredDst: number;
  unresolved: number;
};

/** Build (once per league, cached) the season:overallPick -> identity map for blank picks. */
export async function getBlankPickResolver(
  db: AppDb,
  leagueId: string,
): Promise<{ map: Map<string, ResolvedIdentity>; stats: BlankResolverStats }> {
  const cached = _resolverCache.get(leagueId);
  if (cached) return { map: cached, stats: statsFor(cached) };

  const out = new Map<string, ResolvedIdentity>();

  const [blanks] = (await db.execute(sql`
    SELECT season, overallPick, playerId
    FROM draft_picks
    WHERE leagueId = ${leagueId}
      AND (playerName = '' OR playerName IS NULL OR position = '?' OR position IS NULL)
  `)) as unknown as [Array<{ season: unknown; overallPick: unknown; playerId: unknown }>];

  if (blanks.length === 0) { _resolverCache.set(leagueId, out); return { map: out, stats: statsFor(out) }; }

  // registry: espnPlayerId -> {name, position}
  const [reg] = (await db.execute(sql`
    SELECT espnPlayerId, fullName, position FROM gm_player_registry WHERE fullName IS NOT NULL AND fullName <> ''
  `)) as unknown as [Array<{ espnPlayerId: unknown; fullName: unknown; position: unknown }>];
  const regMap = new Map<string, { name: string; pos: string }>();
  for (const r of reg) regMap.set(String(r.espnPlayerId), { name: String(r.fullName), pos: String(r.position ?? "") });

  // per-season raw draftDetail: overallPick -> playerId (recovers ids the normalized table lost)
  const seasons = [...new Set(blanks.map((b) => Number(b.season)))];
  const ddBySeason = new Map<number, Map<number, number | null>>();
  for (const s of seasons) {
    const [rows] = (await db.execute(sql`
      SELECT payload FROM espn_raw_cache WHERE leagueId = ${leagueId} AND season = ${s} AND viewName = 'combined' LIMIT 1
    `)) as unknown as [Array<{ payload: unknown }>];
    const m = new Map<number, number | null>();
    const payload = rows[0]?.payload;
    if (payload) {
      const p = typeof payload === "string" ? JSON.parse(payload) : payload;
      for (const pk of (p?.draftDetail?.picks ?? [])) {
        m.set(Number(pk.overallPickNumber), pk.playerId == null ? null : Number(pk.playerId));
      }
    }
    ddBySeason.set(s, m);
  }

  const dstMap = await loadEspnDstMap();

  for (const b of blanks) {
    const season = Number(b.season);
    const overall = Number(b.overallPick);
    const colId = b.playerId != null && Number(b.playerId) !== 0 ? Number(b.playerId) : null;
    const pid = colId ?? ddBySeason.get(season)?.get(overall) ?? null;
    if (pid == null) continue; // no id anywhere -> stays missing
    const key = `${season}:${overall}`;
    if (pid < 0) {
      const name = dstMap.get(pid);
      if (name) out.set(key, { playerName: name, position: "DST", playerId: null, source: "espn_dst", confidence: "high" });
      // negative id not in ESPN map -> leave unresolved (no fake)
    } else {
      const hit = regMap.get(String(pid));
      if (hit?.name) out.set(key, { playerName: hit.name, position: hit.pos || "?", playerId: pid, source: "registry", confidence: "high" });
    }
  }

  _resolverCache.set(leagueId, out);
  return { map: out, stats: { ...statsFor(out), blanks: blanks.length, unresolved: blanks.length - out.size } };
}

function statsFor(map: Map<string, ResolvedIdentity>): BlankResolverStats {
  let recoveredSkill = 0, recoveredDst = 0;
  for (const v of map.values()) v.source === "espn_dst" ? recoveredDst++ : recoveredSkill++;
  return { blanks: map.size, recoveredSkill, recoveredDst, unresolved: 0 };
}
