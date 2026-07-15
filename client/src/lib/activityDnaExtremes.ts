/**
 * Commissioner Hub: pick "most" vs "least" high-activity owners without assigning
 * the same franchise to both slots.
 *
 * Contract:
 * - Eligible rows require a non-blank string ownerId and an `ok` highActivity score
 *   that is non-null and finite (NaN / Infinity excluded).
 * - 0 eligible owners -> { most: null, least: null }.
 * - exactly 1 eligible owner -> { most: owner, least: null } (never duplicated).
 * - 2+ eligible owners -> most = highest score, least = lowest score, always distinct.
 * - Ties are deterministic: equal scores break by ownerId ascending (localeCompare),
 *   so the same input always yields the same output.
 */
export type HighActivityPickRow = {
  ownerId: string;
  archetypes?: Record<string, { score: number | null; status: string } | undefined>;
};

export function pickMostAndLeastHighActivity<T extends HighActivityPickRow>(rows: T[]): {
  most: T | null;
  least: T | null;
} {
  const scored = rows
    .map((row) => {
      // Exclude rows with a missing/blank ownerId (null, undefined, empty, or whitespace-only).
      const id = row.ownerId as unknown;
      const hasValidOwnerId = typeof id === "string" && id.trim() !== "";
      const ha = row.archetypes?.highActivity;
      // Exclude non-"ok" status, null/undefined scores, and NaN/non-finite values.
      const score = ha?.status === "ok" && ha.score != null && Number.isFinite(ha.score) ? ha.score : null;
      return hasValidOwnerId && score != null ? { row, score } : null;
    })
    .filter((x): x is { row: T; score: number } => x != null);

  if (scored.length === 0) return { most: null, least: null };

  const byDesc = [...scored].sort((a, b) => b.score - a.score || a.row.ownerId.localeCompare(b.row.ownerId));
  const most = byDesc[0]!.row;

  const byAsc = [...scored].sort((a, b) => a.score - b.score || a.row.ownerId.localeCompare(b.row.ownerId));
  const leastEntry = byAsc.find((x) => x.row.ownerId !== most.ownerId);
  // Never duplicate an owner into both slots: when only one eligible owner exists,
  // `least` is null and the UI should render an "Insufficient Activity Data" state.
  const least = leastEntry?.row ?? null;

  return { most, least };
}
