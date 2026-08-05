import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), "utf-8");
}

describe("Yahoo onboarding wiring (source)", () => {
  it("ConnectYahoo route and provider card exist", () => {
    const main = read("client/src/main.tsx");
    expect(main).toContain('path: "/connect/yahoo"');
    expect(main).toContain("ConnectYahoo");

    const cards = read("client/src/components/connect/ProviderConnectCards.tsx");
    expect(cards).toContain('id: "yahoo"');
    expect(cards).toContain('href: "/connect/yahoo"');
  });

  it("ConnectedLeagues labels Yahoo and never offers ESPN Sync for yahoo", () => {
    const connected = read("client/src/pages/ConnectedLeagues.tsx");
    expect(connected).toContain('if (provider === "yahoo") return "Yahoo"');
    expect(connected).toContain('league.provider === "espn"');
    expect(connected).toContain('to="/sync"');
    expect(connected).toContain('league.provider === "yahoo"');
    expect(connected).toContain('/connect/yahoo');
  });

  it("SyncDataNonEspnNotice has Yahoo-specific state without ESPN controls", () => {
    const notice = read("client/src/pages/SyncDataNonEspnNotice.tsx");
    expect(notice).toContain('provider === "yahoo"');
    expect(notice).toContain("data-sync-provider=\"yahoo\"");
    expect(notice).toContain("/connect/yahoo");
    expect(notice).not.toContain("GMWR_CAPTURE_WEEKLY_STATS");
    expect(notice).not.toContain("Import league history");
  });

  it("importYahooLeague orchestration calls persistUniversalLeague", () => {
    const src = read("server/yahooLeagueImport.ts");
    expect(src).toContain("persistUniversalLeague(league");
    expect(src).toContain('provider: "yahoo"');
    expect(src).toContain("assertCanConnectLeague");

    const router = read("server/providerRouter.ts");
    expect(router).toContain("runYahooLeagueImport");
    expect(router).toContain("selectYahooTeam");
  });

  it("OAuth callback redirects to /connect/yahoo and encrypts pending tokens", () => {
    const oauth = read("server/_core/oauth.ts");
    expect(oauth).toContain("/connect/yahoo?");
    expect(oauth).toContain("writeYahooPendingCredentials");
    expect(oauth).not.toContain("/connect?yahoo_auth=success");
  });

  it("ConnectYahoo surfaces not-configured setup without a dead Connect button", () => {
    const page = read("client/src/pages/ConnectYahoo.tsx");
    expect(page).toContain('data-yahoo-auth="not_configured"');
    expect(page).toContain("YAHOO_CLIENT_ID");
    expect(page).toContain("YAHOO_CLIENT_SECRET");
    expect(page).toContain("/api/yahoo/oauth/callback");
  });
});
