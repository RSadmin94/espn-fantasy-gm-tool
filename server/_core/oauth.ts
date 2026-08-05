import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { exchangeYahooCode, buildYahooAuthUrl, isYahooConfigured } from "../providers/yahooOAuth";
import { writeYahooPendingCredentials } from "../yahooLeagueImport";

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

    const connectYahooPath = (origin: string, query: string) => {
      const base = origin || "";
      return `${base}/connect/yahoo?${query}`;
    };

    if (error) {
      console.error("[Yahoo OAuth] User denied access:", error);
      // Try to recover origin from state when present
      let origin = "";
      if (state) {
        try {
          const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
          origin = decoded.origin ?? "";
        } catch {
          /* ignore */
        }
      }
      res.redirect(302, connectYahooPath(origin, "yahoo_error=denied"));
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

      const userIdNum = parseInt(userId, 10);
      if (!isNaN(userIdNum)) {
        await writeYahooPendingCredentials(userIdNum, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        });
      }

      res.redirect(302, connectYahooPath(origin, "yahoo_auth=success"));
    } catch (err) {
      console.error("[Yahoo OAuth] Callback failed:", err);
      res.redirect(302, connectYahooPath(origin, "yahoo_error=callback_failed"));
    }
  });

  // ─── Manus OAuth callback ─────────────────────────────────────────────────
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect back to where user was before login, or home
      const returnPath = req.cookies?.["espn_return_path"] || "/";
      res.clearCookie("espn_return_path");
      res.redirect(302, returnPath);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
