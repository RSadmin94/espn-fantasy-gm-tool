/**
 * Stored `league_connections.provider` values used by the app today.
 * Keep in sync with connect / workbook / ESPN connect writers.
 */
export const LEAGUE_PROVIDERS = ["espn", "sleeper", "sleeper_workbook"] as const;

export type LeagueProvider = (typeof LEAGUE_PROVIDERS)[number];

/** Normalized provider for UI gates; never invent ESPN when unknown. */
export type LeagueProviderKind = LeagueProvider | "unknown";

export function normalizeLeagueProvider(
  raw: string | null | undefined,
): LeagueProviderKind | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "espn") return "espn";
  if (trimmed === "sleeper") return "sleeper";
  if (trimmed === "sleeper_workbook") return "sleeper_workbook";
  return "unknown";
}

/** Sync Data hub is ESPN-only (matches Connected Leagues Sync button). */
export function isEspnSyncProvider(
  provider: LeagueProviderKind | null | undefined,
): provider is "espn" {
  return provider === "espn";
}

/** AppShell / ConnectedLeagues: show Sync Data only for ESPN active leagues. */
export function shouldShowSyncDataNav(
  provider: LeagueProviderKind | null | undefined,
): boolean {
  return isEspnSyncProvider(provider);
}
