/**
 * Merges `activeLeagueKey` into tRPC query inputs so React Query cache keys
 * change when the active league changes. Server procedures must `void` this
 * field — it is cache-participation only, not authorization.
 */
export function withLeagueSalt<T extends Record<string, unknown>>(
  input: T,
  leagueContextKey: string
): T & { activeLeagueKey: string } {
  return { ...input, activeLeagueKey: leagueContextKey };
}
