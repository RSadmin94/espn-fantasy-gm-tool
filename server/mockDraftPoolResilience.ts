/**
 * War Room mock-pool resilience — skill-starvation detection + soft-include ADP.
 *
 * Used only when the ESPN offense feed misses while IDP still loads (DP-only boards).
 * Does not change healthy-path ordering or drafted-player exclusion.
 *
 * ## Starvation threshold invariant
 *
 * Pool membership is gated on `offenseMap ∪ idpMap`. The public offense feed is
 * effectively all-or-nothing (~1000 ranked players when healthy, 0 when empty/failed).
 * Observed healthy join for league 457622: ~217 QB/RB/WR/TE in the top-320 board.
 * Observed failure: 0–2 offense skill + ~143 DP (offense map empty, IDP still loaded).
 *
 * Therefore:
 *   skill ≤ 2  ∧  dp ≥ 40  ⇒  offense enrichment failed while IDP succeeded
 *
 * Why not 5/30 or 10/50?
 * - League type (dynasty, IDP-heavy, keepers) does not change getEspnPlayerInfoMap —
 *   a healthy offense feed always yields ≫10 skill after registry join.
 * - Keepers are stripped AFTER this check; they cannot create a ≤2-skill pre-keeper pool
 *   when the offense feed is healthy.
 * - Partial sync / missing cookies affect the authenticated IDP feed, not the public
 *   offense feed — so they cannot alone produce this shape.
 * - ≤2 maximizes specificity (only the proven “offense missing” band).
 * - ≥40 requires a real IDP flood (feed limit 400; healthy boards land ~100 DP), so we
 *   do not soft-include on a totally empty ESPN outage (handled by pool.length === 0).
 *
 * Soft-include must NEVER run on a healthy board — see tests.
 */

/** Offensive skill positions counted for starvation detection. */
export const OFFENSE_SKILL_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

/** Positions soft-included from the registry when starved. */
export const SOFT_INCLUDE_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K"]);

/**
 * Max offense skill after ESPN-gated merge that still counts as “offense missing”.
 * Healthy joins are ~200+; failure was 0–2. Gap is intentional.
 */
export const SKILL_STARVED_MAX_OFFENSE_SKILL = 2;

/**
 * Min DP count that confirms IDP path loaded (vs total ESPN outage).
 * Healthy IDP boards contribute ~40–150 DP into the merged/pre-slice pool.
 */
export const SKILL_STARVED_MIN_DP = 40;

/**
 * Documented healthy-floor for tests: a successful offense join is always far above
 * SKILL_STARVED_MAX_OFFENSE_SKILL (live 457622 ≈ 217 skill in availablePool).
 */
export const HEALTHY_OFFENSE_SKILL_FLOOR = 80;

/**
 * Soft-include ADP floor — worse than any elite ESPN ADP (~1–60) and behind a full
 * early/mid-draft of real ADP so fallbacks never occupy the early candidate band
 * when any real-ADP skill players remain.
 */
export const FALLBACK_ADP_FLOOR = 200;

/** Cap so values stay inside the ESPN ADP parse window (< 500). */
export const FALLBACK_ADP_CEILING = 499;

export type PoolPosRow = { position: string };

export function countOffenseSkillPlayers(pool: readonly PoolPosRow[]): number {
  return pool.filter((p) => OFFENSE_SKILL_POSITIONS.has(String(p.position || "").toUpperCase())).length;
}

export function countDpPlayers(pool: readonly PoolPosRow[]): number {
  return pool.filter((p) => String(p.position || "").toUpperCase() === "DP").length;
}

/**
 * Materially skill-starved merged pool (see file header invariant).
 */
export function isSkillStarvedMergedPool(pool: readonly PoolPosRow[]): boolean {
  const skill = countOffenseSkillPlayers(pool);
  const dp = countDpPlayers(pool);
  if (skill <= SKILL_STARVED_MAX_OFFENSE_SKILL && dp >= SKILL_STARVED_MIN_DP) return true;
  if (pool.length === 0) return true;
  return false;
}

/**
 * Deterministic fallback ADP from stable ESPN player id — independent of registry
 * walk order, sync reordering, or DB insertion order.
 * Always in [FALLBACK_ADP_FLOOR, FALLBACK_ADP_CEILING] — never 1.01.
 */
export function fallbackAdpForEspnPlayerId(espnId: string | number): number {
  const raw = String(espnId ?? "").trim();
  let n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    n = h >>> 0;
  }
  const span = FALLBACK_ADP_CEILING - FALLBACK_ADP_FLOOR + 1;
  return FALLBACK_ADP_FLOOR + (Math.floor(Math.abs(n)) % span);
}

export type RegistrySoftIncludeRow = {
  fullName: string;
  position: string;
  espnPlayerId: string | number | null | undefined;
};

export type SoftIncludePlayer = {
  name: string;
  position: string;
  espnId: string;
  playerId: number;
  adp: number | null;
  projection: number | null;
};

/**
 * Build soft-include skill players.
 * ADP comes from espnPlayerId (stable). Output is sorted by espnId for stable lists
 * across environments; changing SQL ORDER BY cannot reshuffle ADP values.
 */
export function buildSkillStarvationSoftIncludes(
  regRows: readonly RegistrySoftIncludeRow[],
  alreadySeenNamesLc: ReadonlySet<string>,
  normalizeDraftPos: (rawPos: string) => string = (p) => p,
): SoftIncludePlayer[] {
  const seen = new Set(alreadySeenNamesLc);
  const out: SoftIncludePlayer[] = [];
  for (const reg of regRows) {
    const rawPos = String(reg.position || "").toUpperCase();
    if (!SOFT_INCLUDE_POSITIONS.has(rawPos)) continue;
    const espnId = String(reg.espnPlayerId ?? "").trim();
    if (!espnId) continue;
    const nameLc = String(reg.fullName ?? "").toLowerCase().trim();
    if (!nameLc || seen.has(nameLc)) continue;
    seen.add(nameLc);
    const playerId = Number(espnId);
    if (!Number.isFinite(playerId)) continue;
    out.push({
      name: String(reg.fullName),
      position: normalizeDraftPos(rawPos),
      espnId,
      playerId,
      // Missing ADP stays null — never invent ~170 / soft-include numeric ranks.
      adp: null,
      projection: null,
    });
  }
  out.sort((a, b) => a.espnId.localeCompare(b.espnId, "en", { numeric: true }));
  return out;
}
