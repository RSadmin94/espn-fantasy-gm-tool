import { SlotClass, type DraftTruthRow } from "./types";

export const CLASSIFICATION_REASON = {
  BOTH_TRUE: "keeper=true;reservedForKeeper=true",
  KEEPER_TRUE: "keeper=true",
  RESERVED_TRUE: "reservedForKeeper=true",
  DRAFTED: "keeper=false,reservedForKeeper=false",
  MALFORMED: "malformed_or_missing_rawPick",
} as const;

/** Strict ESPN boolean: only `true` counts as true. */
function espnBool(v: unknown): boolean {
  return v === true;
}

export type SlotClassification = {
  slotClass: SlotClass;
  classificationReason: string;
  keeperStrict: boolean;
  retained: boolean;
  keeperSlot: boolean;
  draftedForAnalytics: boolean;
  espnKeeper: boolean;
  espnReservedForKeeper: boolean;
};

/**
 * Phase 3 slot rules (order matters):
 * 1) keeper === true  -> KEEPER (including both true)
 * 2) reservedForKeeper === true -> RETAINED
 * 3) else -> DRAFTED
 */
export function classifyEspnDraftSlot(keeper: unknown, reservedForKeeper: unknown): SlotClassification {
  const k = espnBool(keeper);
  const r = espnBool(reservedForKeeper);

  if (k) {
    const classificationReason = r ? CLASSIFICATION_REASON.BOTH_TRUE : CLASSIFICATION_REASON.KEEPER_TRUE;
    return {
      slotClass: SlotClass.KEEPER,
      classificationReason,
      keeperStrict: true,
      retained: false,
      keeperSlot: true,
      draftedForAnalytics: false,
      espnKeeper: true,
      espnReservedForKeeper: r,
    };
  }
  if (r) {
    return {
      slotClass: SlotClass.RETAINED,
      classificationReason: CLASSIFICATION_REASON.RESERVED_TRUE,
      keeperStrict: false,
      retained: true,
      keeperSlot: true,
      draftedForAnalytics: false,
      espnKeeper: false,
      espnReservedForKeeper: true,
    };
  }
  return {
    slotClass: SlotClass.DRAFTED,
    classificationReason: CLASSIFICATION_REASON.DRAFTED,
    keeperStrict: false,
    retained: false,
    keeperSlot: false,
    draftedForAnalytics: true,
    espnKeeper: false,
    espnReservedForKeeper: false,
  };
}

/**
 * True when this row occupies a **keeper or retained** board slot (not an open-draft pick).
 * Prefer normalized `keeperSlot` from {@link normalizeDraftPicks}; otherwise classify from
 * strict ESPN `keeper` / `reservedForKeeper` booleans.
 *
 * Use for: two-year keeper signals, keeper history, excluding players from the **open** draft pool.
 * For **round cost** on the full ledger, still iterate all board rows — do not use this to drop
 * rows needed for slot/round accounting.
 */
export function isDraftKeeperSlotPick(p: unknown): boolean {
  if (p == null || typeof p !== "object" || Array.isArray(p)) return false;
  const o = p as Record<string, unknown>;
  if (typeof o.keeperSlot === "boolean") return o.keeperSlot;
  return classifyEspnDraftSlot(o.keeper, o.reservedForKeeper).keeperSlot;
}

/** Parse `rawPick` JSON from `draft_picks` / ingest; returns UNKNOWN if not an object. */
export function classifyDraftPickRawPick(rawPick: unknown): SlotClassification {
  if (rawPick == null || typeof rawPick !== "object" || Array.isArray(rawPick)) {
    return {
      slotClass: SlotClass.UNKNOWN,
      classificationReason: CLASSIFICATION_REASON.MALFORMED,
      keeperStrict: false,
      retained: false,
      keeperSlot: false,
      draftedForAnalytics: false,
      espnKeeper: false,
      espnReservedForKeeper: false,
    };
  }
  const o = rawPick as Record<string, unknown>;
  return classifyEspnDraftSlot(o.keeper, o.reservedForKeeper);
}

/** Merge classification into a partial DraftTruthRow-shaped object (for builders in later phases). */
export function applySlotClassification<T extends Partial<DraftTruthRow>>(
  row: T,
  rawPick: unknown,
): T & Pick<
  DraftTruthRow,
  | "slotClass"
  | "classificationReason"
  | "keeperStrict"
  | "retained"
  | "keeperSlot"
  | "draftedForAnalytics"
  | "espnKeeper"
  | "espnReservedForKeeper"
> {
  const c = classifyDraftPickRawPick(rawPick);
  return {
    ...row,
    espnKeeper: c.espnKeeper,
    espnReservedForKeeper: c.espnReservedForKeeper,
    slotClass: c.slotClass,
    classificationReason: c.classificationReason,
    keeperStrict: c.keeperStrict,
    retained: c.retained,
    keeperSlot: c.keeperSlot,
    draftedForAnalytics: c.draftedForAnalytics,
  };
}
