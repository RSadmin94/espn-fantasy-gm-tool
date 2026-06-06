/**
 * leaguePromptContext.ts
 *
 * Shared, ADDITIVE helper that resolves a neutral, league-agnostic context
 * object for LLM prompt builders, plus a pure formatter that turns it into the
 * boilerplate clauses prompts share.
 *
 * Design goals:
 *   - Resolve the ACTIVE league + focal owner for the current user.
 *   - Neutral fallbacks only. No hardcoded league name, id, team count, season
 *     range, owner, or team. No focal-owner/league-name/league-id defaults.
 *   - Pure computation for the formatter; the resolver reads cache/profile but
 *     performs NO writes.
 *
 * The `season` argument is optional: when omitted, the resolver uses the latest
 * cached season for the active league (falling back to the current calendar
 * year), so callers without a season still get accurate league context.
 */

import {
  resolveActiveLeagueId,
  resolveActiveProfile,
  getAllCachedSeasons,
  getCachedView,
} from "./db";
import { normalizeSettings, normalizeTeams } from "./espnService";
import { getLeagueScoringSettings } from "./leagueScoringService";

// -- Types ----------------------------------------------------------------------

export interface LeaguePromptContext {
  /** Resolved active league display name. Empty string when unknown (neutral). */
  leagueName: string;
  /** Resolved active league id. Empty string when unknown (neutral). */
  leagueId: string;
  /** Number of teams. 0 when unknown (neutral - never hardcoded). */
  teamCount: number;
  /** Discovered cached-season coverage. All zeros when unknown (neutral). */
  seasonRange: { start: number; end: number; count: number };
  /** Focal owner display name, or null when no profile/team is selected. */
  focalOwnerName: string | null;
  /** Focal team/franchise name, or null when not resolvable. */
  focalTeamName: string | null;
  /** Human-readable scoring type, or "custom scoring" when unavailable. */
  scoringType: string;
  /** League type, or "fantasy football league" when unavailable. */
  leagueType: string;
  /** Keepers per team, when known. */
  keeperCount?: number;
  /** Playoff team count, when known. */
  playoffTeams?: number;
}

// -- Internal helpers -----------------------------------------------------------

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function humanizeScoringType(raw: unknown): string | null {
  if (raw == null) return null;
  const up = String(raw).trim().toUpperCase();
  if (up === "") return null;
  if (up === "PPR") return "PPR";
  if (up === "HALF_PPR" || up === "HALFPPR" || up === "HALF") return "Half-PPR";
  if (up === "STANDARD" || up === "NON_PPR" || up === "NONPPR") return "Standard";
  return String(raw).trim();
}

/**
 * Classify scoring from reception points (the reliable signal): 1 -> PPR,
 * between 0 and 1 -> Half-PPR, 0 -> Standard. Returns null when not a number.
 */
function scoringTypeFromReceptionPoints(receptionPoints: unknown): string | null {
  const rp = Number(receptionPoints);
  if (!Number.isFinite(rp)) return null;
  if (rp >= 1) return "PPR";
  if (rp > 0) return "Half-PPR";
  return "Standard";
}

// -- Resolver -------------------------------------------------------------------

/**
 * Resolve a neutral LeaguePromptContext for the given user (+ optional season).
 * Reads the user active profile, the active league combined cache, the
 * discovered cached-season range, and league scoring settings. Never throws on
 * missing data - every field degrades to a neutral fallback.
 */
export async function resolveLeaguePromptContext(
  userId: number | undefined,
  season?: number,
): Promise<LeaguePromptContext> {
  // Active profile (league id/name + focal owner/team identity).
  const profile = await resolveActiveProfile(userId != null ? { id: userId } : null);

  // -- Active league id ---------------------------------------------------------
  // Prefer the profile resolved league id; only fall back to the canonical
  // resolver for an authenticated user. Never hardcode an id.
  let leagueId = profile.leagueId ?? "";
  if (!leagueId && userId != null) {
    try {
      const resolved = await resolveActiveLeagueId({ user: { id: userId } }, null, season);
      leagueId = resolved?.leagueId ?? "";
    } catch {
      leagueId = "";
    }
  }

  // -- Season range from discovered cached seasons (active league) --------------
  let seasonRange = { start: 0, end: 0, count: 0 };
  try {
    const seasons = (await getAllCachedSeasons(undefined, userId))
      .map((s) => Number(s))
      .filter((s) => Number.isFinite(s))
      .sort((a, b) => a - b);
    if (seasons.length > 0) {
      seasonRange = {
        start: seasons[0],
        end: seasons[seasons.length - 1],
        count: seasons.length,
      };
    }
  } catch {
    // Season coverage unavailable - keep neutral zeros.
  }

  // Effective season for cache/scoring lookups: caller-provided, else the latest
  // cached season, else the current calendar year. Never hardcoded to a league.
  const effectiveSeason =
    season != null && Number.isFinite(season)
      ? Number(season)
      : seasonRange.end > 0
        ? seasonRange.end
        : new Date().getFullYear();

  // -- Combined cache for the effective season (team count, scoring, settings) --
  let settings: ReturnType<typeof normalizeSettings> | null = null;
  let teams: ReturnType<typeof normalizeTeams> = [];
  let data: Record<string, unknown> | null = null;
  try {
    const row = await getCachedView(effectiveSeason, "combined", undefined, { userId });
    data = (row?.payload as Record<string, unknown>) || null;
    if (data) {
      settings = normalizeSettings(data);
      teams = normalizeTeams(data);
    }
  } catch {
    // Cache unavailable - fall through to neutral fallbacks.
  }

  // -- League name --------------------------------------------------------------
  let leagueName = (profile.leagueName ?? "").trim();
  if (!leagueName && settings && settings.leagueName != null) {
    leagueName = String(settings.leagueName).trim();
  }

  // -- Team count (settings.size -> team rows -> 0 neutral) ---------------------
  let teamCount = toFiniteNumber(settings?.size) ?? 0;
  if (teamCount <= 0 && teams.length > 0) teamCount = teams.length;
  if (teamCount < 0) teamCount = 0;

  // -- Focal owner + team (only when genuinely selected) -----------------------
  const focalOwnerName =
    profile.isSetupComplete && profile.selectedOwnerName ? profile.selectedOwnerName : null;

  let focalTeamName: string | null =
    profile.isSetupComplete && profile.selectedFranchiseName
      ? profile.selectedFranchiseName
      : null;
  if (!focalTeamName && profile.selectedTeamId != null && teams.length > 0) {
    const match = teams.find((t) => toFiniteNumber(t.teamId) === Number(profile.selectedTeamId));
    if (match && match.teamName) focalTeamName = String(match.teamName);
  }

  // -- Scoring type (live only; "custom scoring" otherwise) --------------------
  // Reception points are the reliable signal; the scoringType label upstream can
  // be mislabeled, so prefer receptionPoints and fall back to the label.
  let scoringType = "custom scoring";
  try {
    const scoring = await getLeagueScoringSettings(effectiveSeason, userId);
    if (scoring && scoring.scoringDataSource !== "fallback_defaults") {
      const fromRec = scoringTypeFromReceptionPoints(scoring.receptionPoints);
      const fromLabel = humanizeScoringType(scoring.scoringType);
      if (fromRec) scoringType = fromRec;
      else if (fromLabel) scoringType = fromLabel;
    }
  } catch {
    // Scoring unavailable - keep "custom scoring".
  }

  // -- League type + optional counts -------------------------------------------
  // ESPN stores keeper config under settings.draftSettings.keeperCount (the
  // top-level settings.keeperCount is usually absent), so read that first.
  const rawSettings = (data?.settings as Record<string, unknown>) || {};
  const rawDraft = (rawSettings.draftSettings as Record<string, unknown>) || {};
  const keeperCount = toFiniteNumber(rawDraft.keeperCount) ?? toFiniteNumber(settings?.keeperCount);
  const playoffTeams = toFiniteNumber(settings?.playoffTeamCount);
  const leagueType =
    keeperCount != null && keeperCount > 0 ? "keeper league" : "fantasy football league";

  const ctx: LeaguePromptContext = {
    leagueName,
    leagueId,
    teamCount,
    seasonRange,
    focalOwnerName,
    focalTeamName,
    scoringType,
    leagueType,
  };
  if (keeperCount != null) ctx.keeperCount = keeperCount;
  if (playoffTeams != null) ctx.playoffTeams = playoffTeams;
  return ctx;
}

// -- Formatter (pure) -----------------------------------------------------------

/**
 * Pure formatter: turn a LeaguePromptContext into the boilerplate clauses prompt
 * builders share. No I/O. Neutral wording when fields are missing.
 */
export function buildLeaguePromptContext(ctx: LeaguePromptContext): {
  leagueDescriptor: string;
  historyClause: string;
  focalClause: string;
} {
  const name = ctx.leagueName && ctx.leagueName.trim() ? ctx.leagueName.trim() : "this league";

  // descriptor: "<name> (<N>-team <scoring> <type>)" - pieces omitted when unknown.
  const inner: string[] = [];
  if (ctx.teamCount > 0) inner.push(`${ctx.teamCount}-team`);
  if (ctx.scoringType && ctx.scoringType.trim()) inner.push(ctx.scoringType.trim());
  if (ctx.leagueType && ctx.leagueType.trim()) inner.push(ctx.leagueType.trim());
  const leagueDescriptor = inner.length > 0 ? `${name} (${inner.join(" ")})` : name;

  // history: "<count>-season league (<start>-<end>)" when known, else generic.
  const { start, end, count } = ctx.seasonRange;
  const historyClause =
    count > 0 && start > 0 && end > 0
      ? `${count}-season league (${start}-${end})`
      : "this league history";

  const focalClause =
    ctx.focalOwnerName && ctx.focalOwnerName.trim() ? ctx.focalOwnerName.trim() : "the focal owner";

  return { leagueDescriptor, historyClause, focalClause };
}
