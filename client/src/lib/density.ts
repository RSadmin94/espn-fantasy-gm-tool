/**
 * RFSN-054 density rhythm (4px base). Prefer these over one-off py-0.5 / gap-px.
 *
 * Predictable whitespace: same component type → same inset.
 * This is not typography (051) and not “more space.”
 *
 *  6px  chip     — filter chips, compact controls, badges
 *  8px  cluster  — related metadata groups
 * 12px  row      — list rows, table cells, label-under-value
 * 16px  card     — card inset + tile grids
 * 20px  section  — major section cards / stat tiles
 */
export const SPACE_CHIP = "px-2.5 py-1.5";
export const SPACE_CHIP_GAP = "gap-1.5";
export const SPACE_CLUSTER = "gap-2";
export const SPACE_META = "mt-2";
export const SPACE_ROW = "px-3.5 py-3";
export const SPACE_ROW_Y = "py-3";
export const SPACE_ROW_GAP = "gap-3";
export const SPACE_ROW_STACK = "space-y-3";
export const SPACE_CARD = "p-4";
export const SPACE_CARD_GAP = "gap-3";
export const SPACE_SECTION = "gap-4";
export const SPACE_SECTION_Y = "space-y-4";
export const SPACE_SECTION_INSET = "p-5";
