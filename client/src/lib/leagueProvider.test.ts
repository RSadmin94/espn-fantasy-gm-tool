import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isEspnSyncProvider,
  normalizeLeagueProvider,
  shouldShowSyncDataNav,
} from "./leagueProvider";

const repoRoot = process.cwd();

function readClient(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, "client", "src", rel), "utf-8");
}

describe("leagueProvider", () => {
  it("normalizes stored provider strings", () => {
    expect(normalizeLeagueProvider("espn")).toBe("espn");
    expect(normalizeLeagueProvider("ESPN")).toBe("espn");
    expect(normalizeLeagueProvider("sleeper")).toBe("sleeper");
    expect(normalizeLeagueProvider("sleeper_workbook")).toBe("sleeper_workbook");
    expect(normalizeLeagueProvider("yahoo")).toBe("unknown");
    expect(normalizeLeagueProvider("")).toBeNull();
    expect(normalizeLeagueProvider(null)).toBeNull();
    expect(normalizeLeagueProvider(undefined)).toBeNull();
  });

  it("never treats unknown or missing as ESPN sync", () => {
    expect(isEspnSyncProvider(null)).toBe(false);
    expect(isEspnSyncProvider("unknown")).toBe(false);
    expect(isEspnSyncProvider("sleeper")).toBe(false);
    expect(isEspnSyncProvider("sleeper_workbook")).toBe(false);
    expect(isEspnSyncProvider("espn")).toBe(true);
  });

  it("shows Sync Data nav only for ESPN (matches ConnectedLeagues)", () => {
    expect(shouldShowSyncDataNav("espn")).toBe(true);
    expect(shouldShowSyncDataNav("sleeper")).toBe(false);
    expect(shouldShowSyncDataNav("sleeper_workbook")).toBe(false);
    expect(shouldShowSyncDataNav("unknown")).toBe(false);
    expect(shouldShowSyncDataNav(null)).toBe(false);
  });
});

describe("RFSN-040 Sync Data provider awareness (source)", () => {
  it("useLeagueContext exposes provider from getActive and gates espn queries", () => {
    const src = readClient("hooks/useLeagueContext.ts");
    expect(src).toContain("provider: LeagueProviderKind | null");
    expect(src).toContain("normalizeLeagueProvider(activeQ.data.provider)");
    expect(src).toContain("espnContextEnabled");
    expect(src).toContain("enabled: authLoaded && userLoaded && espnContextEnabled");
    expect(src).toContain("enabled: espnContextEnabled && cacheReady");
  });

  it("SyncData mounts ESPN center only for espn; non-ESPN uses notice", () => {
    const sync = readClient("pages/SyncData.tsx");
    expect(sync).toContain("isEspnSyncProvider(provider)");
    expect(sync).toContain("SyncDataEspnCenter");
    expect(sync).toContain("SyncDataNonEspnNotice");
    expect(sync).toContain("Step 4 of ESPN setup");
    expect(sync).toContain("Import league history");
    expect(sync).toContain("Import weekly box scores");
    expect(sync).toContain("GMWR_CAPTURE_WEEKLY_STATS");
    // Gate returns notice before EspnCenter for non-ESPN — EspnCenter owns ESPN-only hooks.
    const gateIdx = sync.indexOf("export function SyncData()");
    const espnCenterIdx = sync.indexOf("function SyncDataEspnCenter()");
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(espnCenterIdx).toBeGreaterThan(gateIdx);
    expect(sync.slice(gateIdx, espnCenterIdx)).toContain("SyncDataNonEspnNotice");
    expect(sync.slice(gateIdx, espnCenterIdx)).not.toContain("trpc.espn");
  });

  it("Sleeper / workbook / unknown notices never include ESPN controls", () => {
    const notice = readClient("pages/SyncDataNonEspnNotice.tsx");
    expect(notice).toContain("This league is connected through Sleeper.");
    expect(notice).toContain('/connect/sleeper');
    expect(notice).toContain("Sleeper workbook");
    expect(notice).toContain('/import/sleeper-workbook');
    expect(notice).toContain("Unsupported sync source");
    expect(notice).not.toContain("Step 4 of ESPN setup");
    expect(notice).not.toContain("EspnConnectorGuide");
    expect(notice).not.toContain("Import league history");
    expect(notice).not.toContain("Import weekly box scores");
    expect(notice).not.toContain("GMWR_CAPTURE_WEEKLY_STATS");
    expect(notice).not.toContain("trpc.espn");
  });

  it("AppShell shows Sync Data only for ESPN; ConnectedLeagues unchanged", () => {
    const shell = readClient("components/AppShell.tsx");
    expect(shell).toContain("shouldShowSyncDataNav");
    expect(shell).toContain("showSyncData");
    expect(shell).toContain('data-nav="sync-data"');
    expect(shell).toMatch(/\{showSyncData \? \([\s\S]*?to="\/sync"/);

    const connected = readClient("pages/ConnectedLeagues.tsx");
    expect(connected).toContain('league.provider === "espn"');
    expect(connected).toContain('to="/sync"');
  });
});
