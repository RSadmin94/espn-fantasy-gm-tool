import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getV2CanonicalRoutes } from "@/lib/v2Navigation";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("v2Routing — locked FFR 2.0", () => {
  it("registers canonical V2 destinations via placeholder route expansion", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).toContain("getV2CanonicalRoutes");
    expect(main).toContain("...v2PlaceholderRoutes");
    expect(main).toContain("V2PlaceholderRoute");
    expect(getV2CanonicalRoutes().length).toBeGreaterThan(20);
  });

  it("proves every canonical destination is resolvable in the route model", () => {
    const routes = getV2CanonicalRoutes();
    expect(routes).toContain("/home");
    expect(routes).toContain("/rivals/rivalries");
    expect(routes).toContain("/my-team/championship-path");
    expect(routes).toContain("/rfsn/wire");
    expect(routes).toContain("/draft/war-room");
    expect(routes).toContain("/league/history/hall-of-fame");
    expect(routes).toContain("/rivals/owners/:ownerId");
    // No ADR-001 Season / top-level History paths in the V2 model
    expect(routes.some((r) => r === "/season" || r.startsWith("/season/"))).toBe(false);
  });

  it("keeps legacy routes reachable during Phase 1", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    const legacyRoutes = [
      "/dashboard",
      "/roster",
      "/matchups",
      "/trades",
      "/draft-war-room",
      "/rivalry-center",
      "/league-dna",
      "/dynasty-power-rankings",
      "/owner-profiles",
      "/advisor",
      "/hall-of-fame",
      "/history",
      "/transactions",
      "/standings",
      "/rfsn",
      "/rfsn/news",
      "/rfsn/live",
    ];
    for (const route of legacyRoutes) {
      expect(main).toContain(`path: "${route}"`);
    }
  });

  it("mounts the curated Home page at /home instead of V2PlaceholderRoute", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).toContain('path: "/home"');
    expect(main).toContain("element: <Home />");
    expect(main).toMatch(/import \{ Home \} from "\.\/pages\/Home"/);
    const homePage = fs.readFileSync(path.join(repoRoot, "client", "src", "pages", "Home.tsx"), "utf-8");
    expect(homePage).toContain('variant="curated"');
    expect(homePage).not.toContain("V2PlaceholderRoute");
    expect(homePage).not.toContain("V2PlaceholderPage");
  });

  it("mounts live Rivals pages at canonical routes instead of V2PlaceholderRoute", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    const live = [
      ["/rivals", "RivalsHub"],
      ["/rivals/cast", "RivalsCast"],
      ["/rivals/owners", "RivalsOwners"],
      ["/rivals/owners/:ownerId", "RivalsOwnerDossier"],
      ["/rivals/head-to-head", "RivalsHeadToHead"],
      ["/rivals/rivalries", "RivalsRivalries"],
      ["/rivals/league-map", "RivalsLeagueMap"],
      ["/rivals/relationships", "RivalsRelationships"],
    ] as const;
    for (const [route, component] of live) {
      expect(main).toContain(`path: "${route}"`);
      expect(main).toContain(`element: <${component} />`);
    }
    expect(main).toContain('path: "/the-cast"');
    expect(main).toContain('path: "/owner-profiles"');
    expect(main).toContain('path: "/rivalry-center"');
    expect(main).toContain('path: "/league-dna"');
  });

  it("mounts live My Team pages at canonical routes instead of V2PlaceholderRoute", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    const live = [
      ["/my-team", "MyTeamHub"],
      ["/my-team/roster", "MyTeamRoster"],
      ["/my-team/matchup", "MyTeamMatchup"],
      ["/my-team/trades", "MyTeamTrades"],
      ["/my-team/advisor", "MyTeamAdvisor"],
      ["/my-team/profile", "MyTeamProfile"],
      ["/my-team/championship-path", "MyTeamChampionshipPath"],
    ] as const;
    for (const [route, component] of live) {
      expect(main).toContain(`path: "${route}"`);
      expect(main).toContain(`element: <${component} />`);
    }
    expect(main).toContain('path: "/roster"');
    expect(main).toContain('path: "/matchups"');
    expect(main).toContain('path: "/trades"');
    expect(main).toContain('path: "/advisor"');
    expect(main).toContain('path: "/championship-diagnosis"');
  });

  it("mounts live RFSN pages at canonical routes instead of V2PlaceholderRoute", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    const live = [
      ["/rfsn", "RfsnHome"],
      ["/rfsn/wire", "RfsnWire"],
      ["/rfsn/breaking", "RfsnBreaking"],
      ["/rfsn/stories", "RfsnStories"],
      ["/rfsn/recaps", "RfsnRecaps"],
      ["/rfsn/analysts", "RfsnAnalysts"],
    ] as const;
    for (const [route, component] of live) {
      expect(main).toContain(`path: "${route}"`);
      expect(main).toContain(`element: <${component} />`);
    }
    expect(main).toContain('path: "/rfsn/news"');
    expect(main).toContain('path: "/rfsn/live"');
    expect(main).toContain("element: <RfsnNews />");
    expect(main).toContain("element: <RfsnLive />");
  });

  it("mounts live Draft pages at canonical routes instead of V2PlaceholderRoute", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).toContain('path: "/draft"');
    expect(main).toContain("element: <DraftHub />");
    expect(main).toContain("element: <DraftWarRoomLayout />");
    expect(main).toContain('path: "/draft/war-room"');
    expect(main).toContain('path: "/draft/mock"');
    expect(main).toContain('path: "/draft/keepers"');
    expect(main).toContain("element: <DraftKeepers />");
    expect(main).toContain('path: "/draft/history"');
    expect(main).toContain("element: <DraftHistoryPage />");
    expect(main).toContain('path: "/draft-war-room"');
    expect(main).toContain('path: "/draft-commentary"');
    expect(main).toContain('path: "/draft-history"');
    expect(main).toContain('path: "/keeper-advisor"');
    expect(main).toContain('path: "/keeper-forecast"');
  });

  it("mounts live League pages at canonical routes instead of V2PlaceholderRoute", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).toContain('path: "/league"');
    expect(main).toContain("element: <LeagueHub />");
    expect(main).toContain('path: "/league/standings"');
    expect(main).toContain("element: <LeagueStandings />");
    expect(main).toContain('path: "/league/standings/power-rankings"');
    expect(main).toContain("element: <LeaguePowerRankings />");
    expect(main).toContain('path: "/league/standings/playoffs"');
    expect(main).toContain("element: <LeaguePlayoffs />");
    expect(main).toContain('path: "/league/standings/strength-of-schedule"');
    expect(main).toContain("element: <LeagueStrengthOfSchedule />");
    expect(main).toContain("element: <LeagueArchiveLayout />");
    expect(main).toContain('path: "/league/history"');
    expect(main).toContain('path: "/league/history/champions"');
    expect(main).toContain('path: "/league/history/hall-of-fame"');
    expect(main).toContain('path: "/league/history/records"');
    expect(main).toContain('path: "/league/history/dynasties"');
    expect(main).toContain('path: "/league/history/timeline"');
    expect(main).toContain('path: "/league/history/transactions"');
    expect(main).toContain("element: <LeagueTransactions />");
    expect(main).toContain('path: "/league/acquisition-impact"');
    expect(main).toContain("element: <LeagueAcquisitionImpact />");
    expect(main).toContain('path: "/league/commissioner"');
    expect(main).toContain("element: <LeagueCommissioner />");
    expect(main).toContain('path: "/standings"');
    expect(main).toContain('path: "/hall-of-fame"');
    expect(main).toContain('path: "/history"');
    expect(main).toContain('path: "/transactions"');
  });

  it("does not redirect /draft to dashboard (V2 Draft hub owns /draft)", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).not.toMatch(/path:\s*"\/draft"\s*,\s*element:\s*<Navigate to="\/dashboard"/);
  });

  it("uses V2 navigation in AppShell", () => {
    const shell = fs.readFileSync(path.join(repoRoot, "client", "src", "components", "AppShell.tsx"), "utf-8");
    expect(shell).toContain("buildV2NavGroups");
    expect(shell).not.toContain("buildNavGroups(");
  });

  it("records locked Product Architecture as authority", () => {
    const archPath = path.join(repoRoot, "docs", "architecture", "FFR_2.0_Product_Architecture.md");
    expect(fs.existsSync(archPath)).toBe(true);
    const arch = fs.readFileSync(archPath, "utf-8");
    expect(arch).toContain("exactly six sections");
    expect(arch).toContain("Rivals");
    expect(arch).toContain("NO** top-level Season");
    expect(arch).toContain("History belongs");
  });
});
