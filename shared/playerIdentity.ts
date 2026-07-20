/**
 * Canonical player identity resolver for Rivals + ESPN bookmarklet.
 *
 * Resolution cascade (first unique hit wins):
 *   1. Sleeper ID
 *   2. ESPN ID
 *   3. exact normalized name + NFL team + position
 *   4. exact normalized name + NFL team
 *   5. exact normalized name + position
 *   6. unique exact normalized name only
 *   7. unresolved
 *
 * Lookup data comes from a versioned compact artifact (not the full Sleeper catalog).
 * Do not fetch the Sleeper players endpoint at runtime from this module.
 *
 * Presentation policy (intentional — not duplicate identity logic):
 *   - ESPN board mirror: Sleeper-first headshots when sleeper id resolves
 *   - Rivals Player Database: ESPN-first, Sleeper on image error, then initials
 * See shared/data/README.md.
 */
import {
  espnPlayerHeadshotUrl,
  resolvePlayerHeadshotUrl,
  sleeperPlayerHeadshotUrl,
} from "./playerHeadshot";

export const PLAYER_IDENTITY_ARTIFACT_VERSION = 1 as const;

/** Compact row: [sleeperId, espnId|"", displayName, team|"", position|""] */
export type CompactPlayerRow = [string, string, string, string, string];

export type CompactPlayerLookupArtifact = {
  v: typeof PLAYER_IDENTITY_ARTIFACT_VERSION;
  source: "sleeper:v1/players/nfl";
  sourcePlayerCount: number;
  includedPlayerCount: number;
  /** Stable content fingerprint of the filtered player rows (not a wall-clock timestamp). */
  contentHash: string;
  players: CompactPlayerRow[];
};

export type PlayerIdentityMatchSource =
  | "sleeper_id"
  | "espn_id"
  | "name_team_pos"
  | "name_team"
  | "name_pos"
  | "name_unique"
  | "unresolved";

export type PlayerIdentityUnresolvedReason =
  | "missing_input"
  | "ambiguous_name_team_pos"
  | "ambiguous_name_team"
  | "ambiguous_name_pos"
  | "ambiguous_name"
  | "no_match"
  | null;

export type PlayerIdentityConfidence = "exact" | "high" | "medium" | "low" | "none";

export type PlayerIdentityQuery = {
  sleeperPlayerId?: string | null;
  espnPlayerId?: string | null;
  playerName?: string | null;
  nflTeam?: string | null;
  position?: string | null;
};

export type PlayerIdentityResult = {
  sleeperPlayerId: string | null;
  espnPlayerId: string | null;
  canonicalName: string | null;
  matchSource: PlayerIdentityMatchSource;
  confidence: PlayerIdentityConfidence;
  headshotUrl: string | null;
  unresolvedReason: PlayerIdentityUnresolvedReason;
};

export type IndexedPlayer = {
  sleeperPlayerId: string;
  espnPlayerId: string | null;
  canonicalName: string;
  normalizedName: string;
  nflTeam: string | null;
  position: string | null;
};

export type PlayerIdentityIndex = {
  artifactVersion: number;
  playerCount: number;
  bySleeperId: Map<string, IndexedPlayer>;
  byEspnId: Map<string, IndexedPlayer>;
  byNameTeamPos: Map<string, IndexedPlayer[]>;
  byNameTeam: Map<string, IndexedPlayer[]>;
  byNamePos: Map<string, IndexedPlayer[]>;
  byName: Map<string, IndexedPlayer[]>;
};

const FANTASY_POSITIONS = new Set([
  "QB",
  "RB",
  "WR",
  "TE",
  "K",
  "DEF",
  "DST",
  "DL",
  "LB",
  "DB",
]);

/**
 * Canonical name normalizer shared by Rivals + bookmarklet identity matching.
 */
export function normalizePlayerName(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\bjr\.?\b|\bsr\.?\b|\bii+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeNflTeam(raw: string | null | undefined): string | null {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!t || t === "FA" || t === "NONE") return null;
  return t;
}

export function normalizePosition(raw: string | null | undefined): string | null {
  const p = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!p) return null;
  if (p === "D/ST" || p === "DST" || p === "DEF") return "DEF";
  return p;
}

function key2(a: string, b: string): string {
  return `${a}|${b}`;
}

function key3(a: string, b: string, c: string): string {
  return `${a}|${b}|${c}`;
}

function pushMap(map: Map<string, IndexedPlayer[]>, key: string, player: IndexedPlayer): void {
  const list = map.get(key);
  if (list) list.push(player);
  else map.set(key, [player]);
}

function uniqueOrNull(list: IndexedPlayer[] | undefined): IndexedPlayer | null {
  if (!list || list.length !== 1) return null;
  return list[0]!;
}

function ambiguous(list: IndexedPlayer[] | undefined): boolean {
  return Boolean(list && list.length > 1);
}

function toResult(
  player: IndexedPlayer,
  matchSource: Exclude<PlayerIdentityMatchSource, "unresolved">,
  confidence: PlayerIdentityConfidence,
  queryEspnId?: string | null,
): PlayerIdentityResult {
  const espnPlayerId = player.espnPlayerId || (queryEspnId && /^\d+$/.test(queryEspnId) ? queryEspnId : null);
  return {
    sleeperPlayerId: player.sleeperPlayerId,
    espnPlayerId,
    canonicalName: player.canonicalName,
    matchSource,
    confidence,
    headshotUrl: resolvePlayerHeadshotUrl({
      espnPlayerId,
      sleeperPlayerId: player.sleeperPlayerId,
    }),
    unresolvedReason: null,
  };
}

function unresolved(
  reason: Exclude<PlayerIdentityUnresolvedReason, null>,
  partial?: Partial<PlayerIdentityResult>,
): PlayerIdentityResult {
  return {
    sleeperPlayerId: partial?.sleeperPlayerId ?? null,
    espnPlayerId: partial?.espnPlayerId ?? null,
    canonicalName: partial?.canonicalName ?? null,
    matchSource: "unresolved",
    confidence: "none",
    headshotUrl:
      partial?.headshotUrl ??
      resolvePlayerHeadshotUrl({
        espnPlayerId: partial?.espnPlayerId,
        sleeperPlayerId: partial?.sleeperPlayerId,
      }),
    unresolvedReason: reason,
  };
}

export function createPlayerIdentityIndex(
  artifact: CompactPlayerLookupArtifact,
): PlayerIdentityIndex {
  if (!artifact || artifact.v !== PLAYER_IDENTITY_ARTIFACT_VERSION) {
    throw new Error(`unsupported_player_identity_artifact_v:${artifact?.v}`);
  }
  const bySleeperId = new Map<string, IndexedPlayer>();
  const byEspnId = new Map<string, IndexedPlayer>();
  const byNameTeamPos = new Map<string, IndexedPlayer[]>();
  const byNameTeam = new Map<string, IndexedPlayer[]>();
  const byNamePos = new Map<string, IndexedPlayer[]>();
  const byName = new Map<string, IndexedPlayer[]>();

  for (const row of artifact.players) {
    const sleeperPlayerId = String(row[0] ?? "").trim();
    if (!sleeperPlayerId) continue;
    const espnRaw = String(row[1] ?? "").trim();
    const espnPlayerId = /^\d+$/.test(espnRaw) ? espnRaw : null;
    const canonicalName = String(row[2] ?? "").trim();
    if (!canonicalName) continue;
    const nflTeam = normalizeNflTeam(row[3]);
    const position = normalizePosition(row[4]);
    const normalizedName = normalizePlayerName(canonicalName);
    if (!normalizedName) continue;

    const player: IndexedPlayer = {
      sleeperPlayerId,
      espnPlayerId,
      canonicalName,
      normalizedName,
      nflTeam,
      position,
    };

    if (!bySleeperId.has(sleeperPlayerId)) bySleeperId.set(sleeperPlayerId, player);
    if (espnPlayerId && !byEspnId.has(espnPlayerId)) byEspnId.set(espnPlayerId, player);

    pushMap(byName, normalizedName, player);
    if (nflTeam) pushMap(byNameTeam, key2(normalizedName, nflTeam), player);
    if (position) pushMap(byNamePos, key2(normalizedName, position), player);
    if (nflTeam && position) {
      pushMap(byNameTeamPos, key3(normalizedName, nflTeam, position), player);
    }
  }

  return {
    artifactVersion: artifact.v,
    playerCount: bySleeperId.size,
    bySleeperId,
    byEspnId,
    byNameTeamPos,
    byNameTeam,
    byNamePos,
    byName,
  };
}

/**
 * Resolve a player against the compact identity index.
 * Does not fetch remote catalogs.
 */
export function resolvePlayerIdentity(
  query: PlayerIdentityQuery,
  index: PlayerIdentityIndex,
): PlayerIdentityResult {
  const sleeperId = String(query.sleeperPlayerId ?? "").trim();
  const espnId = String(query.espnPlayerId ?? "").trim();
  const name = normalizePlayerName(String(query.playerName ?? ""));
  const team = normalizeNflTeam(query.nflTeam);
  const pos = normalizePosition(query.position);

  if (!sleeperId && !espnId && !name) {
    return unresolved("missing_input");
  }

  // 1. Sleeper ID
  if (sleeperId) {
    const hit = index.bySleeperId.get(sleeperId);
    if (hit) return toResult(hit, "sleeper_id", "exact", espnId);
  }

  // 2. ESPN ID
  if (espnId && /^\d+$/.test(espnId)) {
    const hit = index.byEspnId.get(espnId);
    if (hit) return toResult(hit, "espn_id", "exact", espnId);
    // ESPN id known but not in compact index — still usable for ESPN CDN headshot.
    const espnOnlyUrl = espnPlayerHeadshotUrl(espnId);
    if (espnOnlyUrl && !name) {
      return unresolved("no_match", {
        espnPlayerId: espnId,
        headshotUrl: espnOnlyUrl,
      });
    }
  }

  if (!name) {
    return unresolved("no_match", {
      sleeperPlayerId: sleeperId || null,
      espnPlayerId: /^\d+$/.test(espnId) ? espnId : null,
      headshotUrl: resolvePlayerHeadshotUrl({
        espnPlayerId: /^\d+$/.test(espnId) ? espnId : null,
        sleeperPlayerId: sleeperId || null,
      }),
    });
  }

  const espnFallback = /^\d+$/.test(espnId) ? espnId : null;
  const espnFallbackUrl = espnPlayerHeadshotUrl(espnFallback);

  // 3. name + team + position — unique only; ambiguous → reject (do not guess)
  if (team && pos) {
    const list = index.byNameTeamPos.get(key3(name, team, pos));
    const hit = uniqueOrNull(list);
    if (hit) return toResult(hit, "name_team_pos", "high", espnFallback);
    if (ambiguous(list)) {
      return unresolved("ambiguous_name_team_pos", {
        espnPlayerId: espnFallback,
        headshotUrl: espnFallbackUrl,
      });
    }
  }

  // 4. name + team
  if (team) {
    const list = index.byNameTeam.get(key2(name, team));
    const hit = uniqueOrNull(list);
    if (hit) return toResult(hit, "name_team", "high", espnFallback);
    if (ambiguous(list)) {
      return unresolved("ambiguous_name_team", {
        espnPlayerId: espnFallback,
        headshotUrl: espnFallbackUrl,
      });
    }
  }

  // 5. name + position
  if (pos) {
    const list = index.byNamePos.get(key2(name, pos));
    const hit = uniqueOrNull(list);
    if (hit) return toResult(hit, "name_pos", "medium", espnFallback);
    if (ambiguous(list)) {
      return unresolved("ambiguous_name_pos", {
        espnPlayerId: espnFallback,
        headshotUrl: espnFallbackUrl,
      });
    }
  }

  // 6. unique exact normalized name only
  {
    const list = index.byName.get(name);
    const hit = uniqueOrNull(list);
    if (hit) return toResult(hit, "name_unique", "low", espnFallback);
    if (ambiguous(list)) {
      return unresolved("ambiguous_name", {
        espnPlayerId: espnFallback,
        headshotUrl: espnFallbackUrl,
      });
    }
  }

  // 7. unresolved — preserve ESPN fallback headshot when id present
  return unresolved("no_match", {
    sleeperPlayerId: sleeperId || null,
    espnPlayerId: /^\d+$/.test(espnId) ? espnId : null,
    headshotUrl: resolvePlayerHeadshotUrl({
      espnPlayerId: /^\d+$/.test(espnId) ? espnId : null,
      sleeperPlayerId: sleeperId || null,
    }),
  });
}

export type SleeperCatalogRowLike = {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string | null;
  team?: string | null;
  espn_id?: string | number | null;
  status?: string | null;
  active?: boolean | null;
  fantasy_positions?: string[] | null;
  search_rank?: number | null;
};

function catalogDisplayName(row: SleeperCatalogRowLike): string {
  const full = String(row.full_name ?? "").trim();
  if (full) return full;
  return `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim();
}

function catalogPosition(row: SleeperCatalogRowLike): string | null {
  const primary = normalizePosition(row.position);
  if (primary && FANTASY_POSITIONS.has(primary)) return primary === "DST" ? "DEF" : primary;
  for (const fp of row.fantasy_positions ?? []) {
    const n = normalizePosition(fp);
    if (n && FANTASY_POSITIONS.has(n)) return n === "DST" ? "DEF" : n;
  }
  return primary;
}

function shouldIncludeCatalogRow(row: SleeperCatalogRowLike, sleeperId: string): boolean {
  if (!sleeperId) return false;
  const name = catalogDisplayName(row);
  if (!name) return false;
  const pos = catalogPosition(row);
  const isTeamDef = /^[A-Z]{2,3}$/.test(sleeperId) && (pos === "DEF" || !pos);
  if (!pos && !isTeamDef) return false;
  if (pos && !FANTASY_POSITIONS.has(pos) && !isTeamDef) return false;

  const status = String(row.status ?? "").toLowerCase();
  const inactive =
    row.active === false ||
    status === "inactive" ||
    status === "retired" ||
    status === "na" ||
    status === "ex";
  const hasEspn =
    row.espn_id != null && String(row.espn_id).trim() !== "" && /^\d+$/.test(String(row.espn_id).trim());

  // Team defenses always (small N).
  if (isTeamDef) return true;
  if (!pos || !FANTASY_POSITIONS.has(pos)) return false;
  if (inactive) return false;

  const isIdp = pos === "DL" || pos === "LB" || pos === "DB";
  const team = normalizeNflTeam(row.team);

  // IDP: require current team. Prefer ESPN-mapped rows; also keep top-ranked
  // IDP without espn_id (Sleeper often omits espn_id for stars like Parsons).
  if (isIdp) {
    if (!team) return false;
    if (hasEspn) return true;
    const rank = Number(row.search_rank);
    return Number.isFinite(rank) && rank > 0 && rank <= 400;
  }

  // Offense/K: keep ESPN-mapped rows; also keep active rostered players without espn_id.
  // Free-agent actives without espn_id stay out to protect bookmarklet size.
  if (hasEspn) return true;
  return Boolean(team);
}

/**
 * Pure compact-artifact builder. Call from the offline generator script — never from bookmarklet runtime.
 * Output is deterministic for a given catalog (stable sort, no wall-clock timestamps).
 */
export function buildCompactLookupFromCatalog(
  catalog: Record<string, SleeperCatalogRowLike>,
): CompactPlayerLookupArtifact {
  const players: CompactPlayerRow[] = [];
  const seenSleeper = new Set<string>();

  for (const [rawId, row] of Object.entries(catalog)) {
    const sleeperId = String(row.player_id ?? rawId).trim();
    if (!shouldIncludeCatalogRow(row, sleeperId)) continue;
    if (seenSleeper.has(sleeperId)) continue;
    seenSleeper.add(sleeperId);

    const espnRaw = row.espn_id;
    const espnId =
      espnRaw != null && String(espnRaw).trim() !== "" && /^\d+$/.test(String(espnRaw).trim())
        ? String(espnRaw).trim()
        : "";
    const name = catalogDisplayName(row);
    const team = normalizeNflTeam(row.team) ?? "";
    const pos = catalogPosition(row) ?? (/^[A-Z]{2,3}$/.test(sleeperId) ? "DEF" : "");
    players.push([sleeperId, espnId, name, team, pos]);
  }

  // Stable ordering: sleeperId ASC, then espnId, then name.
  players.sort((a, b) => {
    const c0 = a[0].localeCompare(b[0]);
    if (c0 !== 0) return c0;
    const c1 = a[1].localeCompare(b[1]);
    if (c1 !== 0) return c1;
    return a[2].localeCompare(b[2]);
  });

  return {
    v: PLAYER_IDENTITY_ARTIFACT_VERSION,
    source: "sleeper:v1/players/nfl",
    sourcePlayerCount: Object.keys(catalog).length,
    includedPlayerCount: players.length,
    contentHash: fnv1aHex(JSON.stringify(players)),
    players,
  };
}

/** Deterministic non-crypto fingerprint for artifact content (browser-safe). */
export function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/** Re-export headshot helpers so callers can stay on one import surface. */
export { espnPlayerHeadshotUrl, sleeperPlayerHeadshotUrl, resolvePlayerHeadshotUrl };
