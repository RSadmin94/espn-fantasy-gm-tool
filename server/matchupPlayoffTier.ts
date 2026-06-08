/**
 * ESPN schedule: regular season uses `playoffTierType: "NONE"` (or the field omitted).
 * Playoff and consolation brackets use non-NONE tier strings.
 * Same boolean rule as `buildUniversalLeague` in `server/providers/espnAdapter.ts`.
 */
export function matchupIsPlayoffFromEspnTier(playoffTierType: unknown): boolean {
  return (playoffTierType as string) !== "NONE" && Boolean(playoffTierType);
}
