/**
 * Typed Yahoo connect UI states — customer-readable, never tokens or raw dumps.
 */

export type YahooConnectFailureCode =
  | "oauth_denied"
  | "oauth_callback_failed"
  | "not_configured"
  | "no_pending_auth"
  | "no_leagues"
  | "discovery_failed"
  | "import_failed"
  | "readback_failed"
  | "team_select_failed";

export type YahooConnectFailure = {
  code: YahooConnectFailureCode;
  message: string;
};

export type YahooDiscoverableLeague = {
  leagueKey: string;
  leagueId: string;
  name: string;
  season: string;
  teamCount: number;
};

export const YAHOO_CONNECT_MESSAGES: Record<YahooConnectFailureCode, string> = {
  oauth_denied: "Yahoo authorization was cancelled. You can try connecting again when ready.",
  oauth_callback_failed:
    "We couldn't finish Yahoo authorization. Please try connecting again.",
  not_configured:
    "Yahoo connect is not available on this server yet. Contact support if you need access.",
  no_pending_auth: "Yahoo authorization was not found. Please connect Yahoo again.",
  no_leagues: "No Yahoo Fantasy football leagues were found for this account.",
  discovery_failed: "We couldn't load your Yahoo leagues. Please try again.",
  import_failed: "We couldn't import one or more Yahoo leagues. Please try again.",
  readback_failed:
    "The league was imported but we couldn't confirm it in Connected Leagues yet. Refresh and check Connected Leagues.",
  team_select_failed: "We couldn't save your team selection. Please try again.",
};

export function failureFromOAuthQueryParam(
  yahooError: string | null | undefined,
): YahooConnectFailure | null {
  if (!yahooError) return null;
  if (yahooError === "denied") {
    return { code: "oauth_denied", message: YAHOO_CONNECT_MESSAGES.oauth_denied };
  }
  if (yahooError === "callback_failed") {
    return {
      code: "oauth_callback_failed",
      message: YAHOO_CONNECT_MESSAGES.oauth_callback_failed,
    };
  }
  return {
    code: "oauth_callback_failed",
    message: YAHOO_CONNECT_MESSAGES.oauth_callback_failed,
  };
}

export function oauthSuccessFromQueryParam(
  yahooAuth: string | null | undefined,
): boolean {
  return yahooAuth === "success";
}

/** After OAuth success flag, discovery should be enabled. */
export function shouldLoadYahooLeagues(args: {
  oauthSuccess: boolean;
  hasPendingAuth: boolean;
}): boolean {
  return args.oauthSuccess || args.hasPendingAuth;
}

export function selectableYahooLeagues(
  leagues: YahooDiscoverableLeague[] | null | undefined,
): YahooDiscoverableLeague[] {
  if (!Array.isArray(leagues)) return [];
  return leagues.filter(
    (l) => Boolean(l?.leagueId?.trim()) && Boolean(l?.name?.trim()),
  );
}

export function toggleLeagueSelection(
  selected: ReadonlySet<string>,
  leagueId: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(leagueId)) next.delete(leagueId);
  else next.add(leagueId);
  return next;
}

export function selectedLeaguesInOrder(
  leagues: YahooDiscoverableLeague[],
  selectedIds: ReadonlySet<string>,
): YahooDiscoverableLeague[] {
  return leagues.filter((l) => selectedIds.has(l.leagueId));
}

export function sanitizeCustomerError(raw: string | null | undefined, fallback: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  // Never surface token-looking material or stack fragments.
  if (/access[_-]?token|refresh[_-]?token|bearer\s+[a-z0-9._-]+/i.test(text)) {
    return fallback;
  }
  if (text.length > 240) return fallback;
  return text;
}
