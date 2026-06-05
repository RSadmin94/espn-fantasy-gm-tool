/**
 * League History Discovery
 * -------------------------
 * Determines which seasons a league has actually played (availableSeasons) versus
 * which have been synced into our cache (syncedSeasons), for the ACTIVE league only.
 *
 * Source of truth, in priority order:
 *   1. `status.previousSeasons` read from the already-cached "combined" payload
 *      (no network, no credentials, no DB writes).
 *   2. A single live ESPN fetch of the reference season's status (only if the cache
 *      lacked previousSeasons).
 *   3. Graceful degrade: availableSeasons = syncedSeasons, confidence "low".
 *
 * No DB writes. No schema changes. No cross-league fallback. No LLM.
 */
import { getAllCachedSeasons, getCachedView, resolveActiveLeagueId } from "./db";
import { resolveEspnCreds, fetchEspnViews } from "./espnService";

export type DiscoveryConfidence = "high" | "medium" | "low";

export interface LeagueHistoryDiscovery {
  leagueId: string;
  leagueName: string;
  detectedStartYear: number | null;
  availableSeasons: number[]; // newest-first
  syncedSeasons: number[]; // newest-first
  missingSeasons: number[]; // newest-first
  confidence: DiscoveryConfidence;
  warnings: string[];
}

/** NFL season year currently in play (rolls over in late summer). */
function currentNflSeasonYear(now: Date = new Date()): number {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

function sanitizeYears(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const out: number[] = [];
  for (const v of input) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 1990 && n <= 2100) out.push(Math.floor(n));
  }
  return out;
}

function extractPreviousSeasons(payload: Record<string, unknown> | null | undefined): number[] {
  if (!payload) return [];
  const status = payload.status as Record<string, unknown> | undefined;
  return sanitizeYears(status?.previousSeasons);
}

function extractSeasonId(payload: Record<string, unknown> | null | undefined): number | null {
  if (!payload) return null;
  const n = Number(payload.seasonId);
  return Number.isFinite(n) && n >= 1990 ? Math.floor(n) : null;
}

function extractLeagueName(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return "";
  const settings = payload.settings as Record<string, unknown> | undefined;
  const name = settings?.name;
  return typeof name === "string" ? name : "";
}

const descUnique = (nums: number[]): number[] =>
  Array.from(new Set(nums)).sort((a, b) => b - a);

export async function discoverLeagueHistory(
  leagueId?: string,
  userId?: number,
): Promise<LeagueHistoryDiscovery> {
  const warnings: string[] = [];

  // Active league only — no cross-league fallback.
  const { leagueId: resolved } = await resolveActiveLeagueId(
    { user: userId != null ? { id: userId } : undefined },
    leagueId ?? null,
  );
  const lid = String(resolved ?? "");

  if (!lid || lid === "default") {
    warnings.push("No active league connected.");
    return {
      leagueId: lid,
      leagueName: "",
      detectedStartYear: null,
      availableSeasons: [],
      syncedSeasons: [],
      missingSeasons: [],
      confidence: "low",
      warnings,
    };
  }

  // Synced seasons come straight from the league-aware cache helper.
  const syncedSeasons = descUnique(await getAllCachedSeasons(lid, userId));

  // Reference season for reading status.previousSeasons: newest synced, else current NFL year.
  const refSeason = syncedSeasons[0] ?? currentNflSeasonYear();

  let leagueName = "";
  let previousSeasons: number[] = [];
  let seasonId: number | null = null;
  let confidence: DiscoveryConfidence = "low";

  // 1) Cached payload first (no network, no creds, no writes).
  try {
    const cached = await getCachedView(refSeason, "combined", lid, { userId });
    const payload = cached?.payload as Record<string, unknown> | undefined;
    if (payload) {
      previousSeasons = extractPreviousSeasons(payload);
      seasonId = extractSeasonId(payload) ?? refSeason;
      leagueName = extractLeagueName(payload);
      if (previousSeasons.length > 0) confidence = "high";
    }
  } catch (e) {
    warnings.push(`Could not read cached payload for ${refSeason}: ${(e as Error).message}`);
  }

  // 2) Live ESPN fetch fallback — only if the cache lacked previousSeasons.
  if (previousSeasons.length === 0) {
    try {
      const creds = await resolveEspnCreds(undefined, userId);
      if (creds?.swid && creds?.espnS2) {
        const live = await fetchEspnViews(refSeason, ["mStatus", "mSettings"], creds);
        previousSeasons = extractPreviousSeasons(live);
        seasonId = extractSeasonId(live) ?? seasonId ?? refSeason;
        if (!leagueName) leagueName = extractLeagueName(live);
        if (previousSeasons.length > 0) confidence = "medium";
      } else {
        warnings.push("No ESPN credentials available for live history lookup.");
      }
    } catch (e) {
      warnings.push(`Live ESPN history lookup failed for ${refSeason}: ${(e as Error).message}`);
    }
  }

  // 3) Assemble available seasons. A synced season is, by definition, available.
  const availableSeasons = descUnique([
    ...previousSeasons,
    ...(seasonId != null ? [seasonId] : []),
    ...syncedSeasons,
  ]);

  // Graceful degrade: if ESPN gave us no prior-season signal, fall back to what we know.
  if (previousSeasons.length === 0) {
    confidence = "low";
    if (availableSeasons.length > 0) {
      warnings.push("Could not determine full league history from ESPN; showing synced seasons only.");
    }
  }

  const syncedSet = new Set(syncedSeasons);
  const missingSeasons = availableSeasons.filter((s) => !syncedSet.has(s));

  return {
    leagueId: lid,
    leagueName,
    detectedStartYear: availableSeasons.length > 0 ? Math.min(...availableSeasons) : null,
    availableSeasons,
    syncedSeasons,
    missingSeasons,
    confidence,
    warnings,
  };
}
