import type { Express, Request, Response } from "express";
import { exchangeYahooCode, buildYahooAuthUrl, isYahooConfigured } from "../providers/yahooOAuth";
import { getDb } from "../db";
import { leagueConnections } from "../../drizzle/schema";


function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  // ─── Yahoo OAuth2 authorization redirect ──────────────────────────────────
  app.get("/api/yahoo/oauth/start", (req: Request, res: Response) => {
    if (!isYahooConfigured()) {
      res.status(503).json({ error: "Yahoo OAuth is not configured on this server." });
      return;
    }
    const origin = getQueryParam(req, "origin") ?? "";
    const userId = getQueryParam(req, "userId") ?? "";
    const redirectUri = `${origin}/api/yahoo/oauth/callback`;
    // Encode origin + userId into state for CSRF protection
    const state = Buffer.from(JSON.stringify({ origin, userId, ts: Date.now() })).toString("base64url");
    const authUrl = buildYahooAuthUrl(redirectUri, state);
    res.redirect(302, authUrl);
  });

  // ─── Yahoo OAuth2 callback ────────────────────────────────────────────────
  app.get("/api/yahoo/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const error = getQueryParam(req, "error");

    if (error) {
      console.error("[Yahoo OAuth] User denied access:", error);
      res.redirect(302, "/connect?yahoo_error=denied");
      return;
    }

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    let origin = "";
    let userId = "";
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
      origin = decoded.origin ?? "";
      userId = decoded.userId ?? "";
    } catch {
      res.status(400).json({ error: "Invalid state parameter" });
      return;
    }

    const redirectUri = `${origin}/api/yahoo/oauth/callback`;

    try {
      const tokens = await exchangeYahooCode(code, redirectUri);

      // Persist tokens in leagueConnections as a pending Yahoo connection
      // (no leagueId yet — user will pick their league in the UI)
      const database = await getDb();
      if (database && userId) {
        const userIdNum = parseInt(userId, 10);
        if (!isNaN(userIdNum)) {
          // Upsert a pending Yahoo connection record to store the tokens
          await database
            .insert(leagueConnections)
            .values({
              userId: userIdNum,
              provider: "yahoo",
              leagueId: "__pending__",
              leagueName: "Pending Yahoo Connection",
              season: new Date().getFullYear(),
              isActive: false,
              credentials: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: tokens.expiresAt,
              },
              syncStatus: "pending",
            })
            .onDuplicateKeyUpdate({
              set: {
                credentials: {
                  accessToken: tokens.accessToken,
                  refreshToken: tokens.refreshToken,
                  expiresAt: tokens.expiresAt,
                },
                syncStatus: "pending",
              },
            });
        }
      }

      // Redirect back to the connect page with success flag
      res.redirect(302, `${origin}/connect?yahoo_auth=success&userId=${userId}`);
    } catch (err) {
      console.error("[Yahoo OAuth] Callback failed:", err);
      res.redirect(302, `${origin}/connect?yahoo_error=callback_failed`);
    }
  });

}
