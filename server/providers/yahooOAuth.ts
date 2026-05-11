/**
 * Yahoo OAuth2 Helper
 *
 * Handles the full Yahoo Fantasy Sports OAuth2 Authorization Code flow:
 *   1. Build the authorization URL (redirect user to Yahoo)
 *   2. Exchange the authorization code for access + refresh tokens
 *   3. Refresh an expired access token using the refresh token
 *
 * Yahoo OAuth2 endpoints:
 *   Authorization: https://api.login.yahoo.com/oauth2/request_auth
 *   Token:         https://api.login.yahoo.com/oauth2/get_token
 *
 * Access tokens expire after 3600 seconds (1 hour).
 * Refresh tokens are long-lived (valid until revoked).
 *
 * Required environment variables:
 *   YAHOO_CLIENT_ID     — Yahoo Developer App consumer key
 *   YAHOO_CLIENT_SECRET — Yahoo Developer App consumer secret
 *
 * The redirect URI must match exactly what is registered in the Yahoo
 * Developer Console. We use: {origin}/api/yahoo/oauth/callback
 */

const YAHOO_AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth";
const YAHOO_TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";

// ─── Config ───────────────────────────────────────────────────────────────────

export function getYahooClientId(): string {
  return process.env.YAHOO_CLIENT_ID ?? "";
}

export function getYahooClientSecret(): string {
  return process.env.YAHOO_CLIENT_SECRET ?? "";
}

export function isYahooConfigured(): boolean {
  return Boolean(getYahooClientId() && getYahooClientSecret());
}

// ─── Authorization URL ────────────────────────────────────────────────────────

/**
 * Build the Yahoo OAuth2 authorization URL.
 * The user is redirected to this URL to grant access.
 *
 * @param redirectUri  The callback URL registered in Yahoo Developer Console
 * @param state        Opaque state string for CSRF protection (base64 JSON)
 */
export function buildYahooAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: getYahooClientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "fspt-r",   // Fantasy Sports read scope
    state,
  });
  return `${YAHOO_AUTH_URL}?${params.toString()}`;
}

// ─── Token shapes ─────────────────────────────────────────────────────────────

export interface YahooTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;   // Unix ms
  tokenType: string;
  xoauthYahooGuid?: string;
}

interface YahooRawTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  xoauth_yahoo_guid?: string;
  error?: string;
  error_description?: string;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeYahooCode(
  code: string,
  redirectUri: string
): Promise<YahooTokenResponse> {
  const clientId = getYahooClientId();
  const clientSecret = getYahooClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("Yahoo OAuth is not configured. Set YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(YAHOO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  const data = await res.json() as YahooRawTokenResponse;

  if (!res.ok || data.error) {
    throw new Error(
      `Yahoo token exchange failed: ${data.error ?? res.status} — ${data.error_description ?? ""}`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    xoauthYahooGuid: data.xoauth_yahoo_guid,
  };
}

// ─── Token refresh ────────────────────────────────────────────────────────────

/**
 * Refresh an expired access token using the stored refresh token.
 * Returns a new YahooTokenResponse with updated accessToken and expiresAt.
 */
export async function refreshYahooToken(
  refreshToken: string
): Promise<YahooTokenResponse> {
  const clientId = getYahooClientId();
  const clientSecret = getYahooClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("Yahoo OAuth is not configured.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: "oob",  // Yahoo allows "oob" for refresh
  });

  const res = await fetch(YAHOO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  const data = await res.json() as YahooRawTokenResponse;

  if (!res.ok || data.error) {
    throw new Error(
      `Yahoo token refresh failed: ${data.error ?? res.status} — ${data.error_description ?? ""}`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Yahoo may or may not rotate
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    xoauthYahooGuid: data.xoauth_yahoo_guid,
  };
}

// ─── Authenticated fetch ───────────────────────────────────────────────────────

/**
 * Make an authenticated GET request to the Yahoo Fantasy API.
 * Automatically refreshes the token if it has expired.
 *
 * @param url          Full Yahoo Fantasy API URL
 * @param accessToken  Current access token
 * @param refreshToken Refresh token (used if access token is expired)
 * @param expiresAt    Unix ms when access token expires
 * @returns { data, newTokens } — newTokens is set if the token was refreshed
 */
export async function yahooApiFetch<T>(
  url: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<{ data: T; newTokens?: YahooTokenResponse }> {
  let token = accessToken;
  let newTokens: YahooTokenResponse | undefined;

  // Refresh if within 5 minutes of expiry
  if (Date.now() >= expiresAt - 5 * 60 * 1000) {
    newTokens = await refreshYahooToken(refreshToken);
    token = newTokens.accessToken;
  }

  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 401) {
    // Token might have been invalidated — try one refresh
    newTokens = await refreshYahooToken(refreshToken);
    token = newTokens.accessToken;

    const retryRes = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!retryRes.ok) {
      throw new Error(`Yahoo API error after token refresh: ${retryRes.status} ${url}`);
    }

    const data = await retryRes.json() as T;
    return { data, newTokens };
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yahoo API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as T;
  return { data, newTokens };
}
