/**
 * League Context Foundation — Step 1 (read-only consolidation).
 *
 * One canonical resolver that COMPOSES the three existing league resolvers into a
 * single LeagueContext object:
 *   - resolveLeaguePromptContext         (identity, scoring, teamCount, season coverage, focal owner/team, playoff teams)
 *   - buildLeagueCapabilities            (keepers, keeper slots, auction, draft-pick trading, dynasty best-effort, confidence)
 *   - resolveKeeperDraftGeometryForSeason (draft geometry: rounds, slot count)
 *
 * This module ADDS NOTHING to the pipeline: no DB writes, no ESPN fetch, and it does
 * not change any existing resolver or consumer. It reads the same cached payload those
 * resolvers already read and merges their outputs, plus one new read-only extraction
 * (roster starter slots) with a documented fallback.
 * Format is detected from ESPN, then overridden by a league-level declaration when
 * present (Step 2A). NOT wired into the Trade Analyzer.
 *
 * Architecture compliance: season ranges come from the existing prompt resolver's
 * discovery (never hardcoded here, §5); owner identity comes from that resolver
 * (teams.ownerId-based, §9) and is not recomputed.
 */

import { resolveLeaguePromptContext } from "./leaguePromptContext";
import { buildLeagueCapabilities, type LeagueCapabilities } from "./leagueCapabilities";
import { resolveKeeperDraftGeometryForSeason } from "./keeperDraftGeometry";
import { getCachedView } from "./db";
import { getDeclaredLeagueFormat } from "./leagueFormatStore";

export type FieldSource =
  | "declared" // set by a league-level declaration (Step 2A) — authoritative
  | "espn_reliable" // read directly from a dependable ESPN settings field
  | "inferred" // best-effort inference (dynasty by name match; keepers absent -> redraft)
  | "inferred_default" // a standard default used because the source field was missing
  | "default"; // neutral fallback because nothing was available

export type LeagueFormat = "redraft" | "keeper" | "dynasty" | "unknown";

/**
 * Starter + bench slot counts by canonical position.
 * REPLACEMENT-LEVEL SOURCE: the positional replacement baseline downstream =
 *   (starter slots for that position, i.e. EXCLUDING bench/IR) x teamCount.
 * FLEX/SUPERFLEX expand RB/WR/TE (and QB) replacement depth.
 */
export interface LeagueContextRosterSlots {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number; // RB/WR/TE flex (ESPN slots 3, 5, 23)
  SUPERFLEX: number; // QB-eligible flex / OP (ESPN slot 7)
  DST: number;
  K: number;
  BENCH: number; // NOT a starting slot
  IR: number; // NOT a starting slot
}

export interface LeagueContext {
  // -- Identity (from resolveLeaguePromptContext) --
  leagueId: string;
  leagueName: string;
  season: number;
  seasonCoverage: { start: number; end: number; count: number };
  focalOwnerName: string | null;
  focalTeamName: string | null;

  // -- Format (derived from capabilities; no declaration in Step 1) --
  format: LeagueFormat;
  formatSource: FieldSource;
  keeperSlotsPerTeam: number | null;
  auctionDraft: boolean;
  draftPickTrading: boolean;
  /** Best-effort ESPN dynasty flag (usually null — ESPN exposes no reliable signal). */
  dynastyFlag: boolean | null;

  // -- Settings / geometry --
  teamCount: number;
  scoring: { type: string };
  /** REPLACEMENT-LEVEL SOURCE (with teamCount). See LeagueContextRosterSlots. */
  rosterSlots: LeagueContextRosterSlots;
  draftGeometry: { roundCount: number; draftSlotCount: number };
  /**
   * Playoff structure. Use ONLY for championship pressure, playoff odds, and
   * trade-deadline leverage. NEVER use playoff.teamCount for replacement-level
   * baselines — replacement level is rosterSlots x teamCount (edge-case contract 3).
   */
  playoff: { teamCount: number | null; hasStructure: boolean };

  // -- Disclaimer support (Step 1 contract, edge case 2) --
  /**
   * True when downstream should warn that valuations may not fit the format:
   *   - format === "dynasty"
   *   - format === "keeper" && confidence !== "high"
   * The Trade Analyzer ALSO triggers a disclaimer when format === "unknown" AND the
   * trade involves picks — it owns the pick context, so it combines that with `format`.
   */
  requiresFormatDisclaimer: boolean;

  // -- Provenance --
  confidence: "high" | "medium" | "low";
  fieldSources: Record<string, FieldSource>;
  reasons: string[];

  /** Raw label from the prompt resolver, carried for parity/debug (superseded by `format`). */
  leagueTypeLabel: string;
}

// ESPN lineupSlotId -> canonical roster-slot label (mirrors server/draftRealitySimulator.ts).
const SLOT_ID_TO_LABEL: Record<number, keyof LeagueContextRosterSlots> = {
  0: "QB",
  1: "QB",
  2: "RB",
  4: "WR",
  6: "TE",
  7: "SUPERFLEX",
  3: "FLEX",
  5: "FLEX",
  23: "FLEX",
  15: "DST",
  16: "DST",
  17: "K",
  20: "BENCH",
  21: "IR",
  24: "IR",
};

function emptySlots(): LeagueContextRosterSlots {
  return { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPERFLEX: 0, DST: 0, K: 0, BENCH: 0, IR: 0 };
}

// Standard ESPN default lineup, used when the payload lacks lineupSlotCounts (edge case 1).
const STANDARD_DEFAULT_ROSTER_SLOTS: LeagueContextRosterSlots = {
  QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, DST: 1, K: 1, BENCH: 7, IR: 1,
};

/**
 * Extract starter/bench slot counts from the ESPN combined payload.
 * Edge case 1: when settings.rosterSettings.lineupSlotCounts is absent/empty, fall back
 * to a standard default lineup, mark the source "inferred_default", and record a reason.
 */
function extractRosterSlots(
  payload: Record<string, unknown> | null,
  teamCount: number,
): { slots: LeagueContextRosterSlots; source: FieldSource; reason?: string } {
  const settings = (payload?.settings as Record<string, unknown> | undefined) ?? undefined;
  const rosterSettings = (settings?.rosterSettings as Record<string, unknown> | undefined) ?? undefined;
  const counts = rosterSettings?.lineupSlotCounts as Record<string, unknown> | undefined;

  if (counts && typeof counts === "object" && Object.keys(counts).length > 0) {
    const slots = emptySlots();
    for (const [idStr, raw] of Object.entries(counts)) {
      const id = Number(idStr);
      const c = Number(raw);
      if (!Number.isFinite(id) || !Number.isFinite(c) || c <= 0) continue;
      const label = SLOT_ID_TO_LABEL[id];
      if (label) slots[label] += c;
      // Unmapped slot ids (P, HC, exotic variants) are intentionally ignored.
    }
    const starters =
      slots.QB + slots.RB + slots.WR + slots.TE + slots.FLEX + slots.SUPERFLEX + slots.DST + slots.K;
    if (starters > 0) return { slots, source: "espn_reliable" };
  }

  return {
    slots: { ...STANDARD_DEFAULT_ROSTER_SLOTS },
    source: "inferred_default",
    reason:
      "rosterSettings.lineupSlotCounts absent/empty in ESPN payload; using standard default lineup " +
      "(QB1/RB2/WR2/TE1/FLEX1/K1/DST1, BENCH7). Replacement levels derive from teamCount=" +
      (teamCount > 0 ? String(teamCount) : "unknown") + ".",
  };
}

/**
 * Derive the structured format from capabilities. Step 1 has no declaration, so:
 *   - no payload at all        -> "unknown" (we genuinely cannot tell)
 *   - ESPN dynasty name/type   -> "dynasty" (best-effort, inferred)
 *   - keeper slots > 0         -> "keeper"  (keeperCount is a reliable signal)
 *   - otherwise (payload seen) -> "redraft" (reliable when keeperCount was explicitly 0)
 */
function deriveFormat(
  caps: LeagueCapabilities,
  hasPayload: boolean,
): { format: LeagueFormat; formatSource: FieldSource } {
  if (!hasPayload) return { format: "unknown", formatSource: "default" };
  if (caps.dynasty === true) return { format: "dynasty", formatSource: "inferred" };
  if (caps.keepers === true) return { format: "keeper", formatSource: "espn_reliable" };
  return { format: "redraft", formatSource: caps.keeperSlotsPerTeam === 0 ? "espn_reliable" : "inferred" };
}

/**
 * Resolve the canonical LeagueContext for a user's active league (+ optional season).
 * Pure composition over existing resolvers: no DB writes, no ESPN fetch, no consumer
 * changes. Every field degrades to a neutral default; never throws on missing data.
 */
export async function resolveLeagueContext(
  userId: number | undefined,
  season?: number,
): Promise<LeagueContext> {
  // 1) Identity, scoring, teamCount, season coverage, focal owner/team, playoff teams.
  const prompt = await resolveLeaguePromptContext(userId, season);
  const leagueId = prompt.leagueId;

  // Effective season mirrors the prompt resolver: caller -> latest cached -> current year.
  const effectiveSeason =
    season != null && Number.isFinite(season)
      ? Number(season)
      : prompt.seasonRange.end > 0
        ? prompt.seasonRange.end
        : new Date().getFullYear();

  // 2) Combined cache payload — the same source the capability + geometry resolvers read.
  //    Read-only; on any miss/error we degrade to null (caps/geometry handle null safely).
  let payload: Record<string, unknown> | null = null;
  if (leagueId) {
    try {
      const row = await getCachedView(effectiveSeason, "combined", leagueId, { userId });
      payload = row?.payload ? (row.payload as Record<string, unknown>) : null;
    } catch {
      payload = null;
    }
  }
  const hasPayload = payload != null;

  // 3) Capabilities (pure over the payload) + draft geometry.
  const caps = buildLeagueCapabilities(leagueId, effectiveSeason, payload);
  const geometry = await resolveKeeperDraftGeometryForSeason(leagueId, effectiveSeason, userId, payload);

  // 4) Roster slots (new read-only extraction) with standard-default fallback (edge case 1).
  const rosterSlotsResult = extractRosterSlots(payload, prompt.teamCount);

  // 5) Format: ESPN detection (Step 1), then overridden by a league-level declaration (Step 2A).
  const detected = deriveFormat(caps, hasPayload);
  const declaredFormat = leagueId ? await getDeclaredLeagueFormat(leagueId) : null;
  const format: LeagueFormat = declaredFormat ?? detected.format;
  const formatSource: FieldSource = declaredFormat ? "declared" : detected.formatSource;
  const confidence: LeagueContext["confidence"] = hasPayload ? caps.confidence : "low";

  // Edge case 2: format disclaimer. A declaration makes the format authoritative, so it
  // clears the keeper "uncertainty" trigger; dynasty always disclaims (valuations are not
  // dynasty-aware) however the format was determined.
  const formatIsCertain = formatSource === "declared" || confidence === "high";
  const requiresFormatDisclaimer =
    format === "dynasty" || (format === "keeper" && !formatIsCertain);

  const reasons: string[] = [...caps.confidenceReasons];
  if (declaredFormat)
    reasons.push(
      detected.format !== declaredFormat
        ? `Format declared as "${declaredFormat}" — overrides detected "${detected.format}".`
        : `Format declared as "${declaredFormat}".`,
    );
  if (rosterSlotsResult.reason) reasons.push(rosterSlotsResult.reason);
  if (!hasPayload)
    reasons.push(
      "No combined ESPN cache payload for active league/season — context degraded (format unknown, low confidence).",
    );
  if (format === "dynasty" && formatSource !== "declared")
    reasons.push(
      "Dynasty inferred from ESPN name/type (best-effort, not authoritative) — a format declaration would raise confidence.",
    );

  const fieldSources: Record<string, FieldSource> = {
    leagueId: leagueId ? "espn_reliable" : "default",
    format: formatSource,
    keeperSlotsPerTeam: hasPayload
      ? caps.keeperSlotsPerTeam != null
        ? "espn_reliable"
        : "inferred"
      : "default",
    auctionDraft: hasPayload ? "espn_reliable" : "default",
    draftPickTrading: hasPayload ? "espn_reliable" : "default",
    rosterSlots: rosterSlotsResult.source,
    scoring: prompt.scoringType && prompt.scoringType !== "custom scoring" ? "espn_reliable" : "inferred",
    teamCount: prompt.teamCount > 0 ? "espn_reliable" : "default",
    draftGeometry: hasPayload ? "espn_reliable" : "inferred",
    playoff: prompt.playoffTeams != null ? "espn_reliable" : "default",
    seasonCoverage: prompt.seasonRange.count > 0 ? "espn_reliable" : "default",
  };

  return {
    leagueId,
    leagueName: prompt.leagueName,
    season: effectiveSeason,
    seasonCoverage: prompt.seasonRange,
    focalOwnerName: prompt.focalOwnerName,
    focalTeamName: prompt.focalTeamName,

    format,
    formatSource,
    keeperSlotsPerTeam: caps.keeperSlotsPerTeam,
    auctionDraft: caps.auctionDraft,
    draftPickTrading: caps.draftPickTrading,
    dynastyFlag: caps.dynasty,

    teamCount: prompt.teamCount,
    scoring: { type: prompt.scoringType },
    rosterSlots: rosterSlotsResult.slots,
    draftGeometry: { roundCount: geometry.roundCount, draftSlotCount: geometry.draftSlotCount },
    playoff: { teamCount: prompt.playoffTeams ?? null, hasStructure: caps.playoffData },

    requiresFormatDisclaimer,

    confidence,
    fieldSources,
    reasons,

    leagueTypeLabel: prompt.leagueType,
  };
}
