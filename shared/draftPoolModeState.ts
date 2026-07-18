/**
 * RFSN-017 — Shared eligible pool vs per-mode Available derivation.
 *
 * Shared: registry × ESPN ADP × RFSN-014 eligibility (keepers optionally removed upstream).
 * Mock / Live / Reality each subtract only their own consumption.
 */

export type DraftPoolIdentity = {
  name: string;
  espnId?: string | number | null;
};

export type DraftPoolRowLike = DraftPoolIdentity & {
  position?: string;
  adp?: number | null;
};

function normName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function draftPoolIdentityKeys(p: DraftPoolIdentity): string[] {
  const keys: string[] = [`name:${normName(p.name)}`];
  const id = p.espnId != null && String(p.espnId).trim() !== "" ? String(p.espnId).trim() : "";
  if (id) keys.push(`espn:${id}`);
  return keys;
}

/** Shared − mode consumption. Does not mutate shared. */
export function deriveModeAvailablePool<T extends DraftPoolRowLike>(
  sharedEligiblePool: readonly T[],
  consumed: readonly DraftPoolIdentity[],
): T[] {
  if (!consumed.length) return [...sharedEligiblePool];
  const banned = new Set<string>();
  for (const c of consumed) {
    for (const k of draftPoolIdentityKeys(c)) banned.add(k);
  }
  return sharedEligiblePool.filter((p) => {
    for (const k of draftPoolIdentityKeys(p)) {
      if (banned.has(k)) return false;
    }
    return true;
  });
}

/**
 * Regression helpers — prove mock consumption cannot change a Live-derived list
 * when Live consumption is independent.
 */
export function assertLivePoolIndependentOfMock(args: {
  shared: DraftPoolRowLike[];
  mockConsumed: DraftPoolIdentity[];
  liveConsumed: DraftPoolIdentity[];
}): { mockAvailable: DraftPoolRowLike[]; liveAvailable: DraftPoolRowLike[] } {
  const mockAvailable = deriveModeAvailablePool(args.shared, args.mockConsumed);
  const liveAvailable = deriveModeAvailablePool(args.shared, args.liveConsumed);
  return { mockAvailable, liveAvailable };
}
