/**
 * Phase 3 — Draft Truth canonical types (contract only).
 * Row persistence and API mapping land in later phases.
 */

/** Mutually exclusive slot classification for a single draft board row. */
export const SlotClass = {
  DRAFTED: "DRAFTED",
  KEEPER: "KEEPER",
  RETAINED: "RETAINED",
  UNKNOWN: "UNKNOWN",
} as const;

export type SlotClass = (typeof SlotClass)[keyof typeof SlotClass];

/**
 * Canonical draft-truth row (blueprint subset for 3A).
 * Additional fields (team, player, overall, etc.) attach when building from payloads/DB.
 */
export type DraftTruthRow = {
  /** League identifier (internal or ESPN id per deployment). */
  leagueId: string;
  season: number;
  overallPick: number;
  roundId: number;
  roundPick: number;
  teamId: number;
  playerId: number | null;
  playerName: string;
  position: string;
  espnKeeper: boolean;
  espnReservedForKeeper: boolean;
  slotClass: SlotClass;
  /** Human-readable audit trail — why `slotClass` was chosen (never omit). */
  classificationReason: string;
  keeperStrict: boolean;
  retained: boolean;
  keeperSlot: boolean;
  draftedForAnalytics: boolean;
};
