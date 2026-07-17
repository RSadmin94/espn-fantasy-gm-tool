import { describe, expect, it } from "vitest";
import {
  V2_DESTINATIONS,
  V2_NAV_CATEGORY_ORDER,
  assertLockedV2NavigationInvariants,
  buildV2NavGroups,
  getAllV2Destinations,
  getV2CanonicalRoutes,
  getV2NavHref,
  isV2RouteActive,
} from "@/lib/v2Navigation";
import { V2 } from "@/lib/v2Copy";

describe("v2Navigation — locked FFR 2.0", () => {
  it("has exactly six primary sidebar sections in locked order", () => {
    expect(V2_NAV_CATEGORY_ORDER).toEqual([
      "home",
      "rivals",
      "myTeam",
      "rfsn",
      "draft",
      "league",
    ]);
    const groups = buildV2NavGroups();
    expect(groups).toHaveLength(6);
    expect(groups.map((g) => g.id)).toEqual(V2_NAV_CATEGORY_ORDER);
    expect(groups.map((g) => g.title)).toEqual([
      V2.navGroups.home,
      V2.navGroups.rivals,
      V2.navGroups.myTeam,
      V2.navGroups.rfsn,
      V2.navGroups.draft,
      V2.navGroups.league,
    ]);
  });

  it("does not include Season or top-level History", () => {
    const invariants = assertLockedV2NavigationInvariants();
    expect(invariants.hasSeason).toBe(false);
    expect(invariants.hasTopLevelHistory).toBe(false);
    expect(invariants.sectionCount).toBe(6);
    const ids = buildV2NavGroups().map((g) => g.id);
    expect(ids).not.toContain("season");
    expect(ids).not.toContain("history");
  });

  it("restores Rivals as a primary section (second)", () => {
    const invariants = assertLockedV2NavigationInvariants();
    expect(invariants.rivalsIsPrimary).toBe(true);
    const rivals = buildV2NavGroups().find((g) => g.id === "rivals");
    expect(rivals?.items.map((i) => i.label)).toEqual([
      "The Cast",
      "Owner Dossier",
      "Head-to-Head Ledger",
      "Rivalries",
      "League Map",
      "Relationship Map",
    ]);
  });

  it("nests History inside League", () => {
    const invariants = assertLockedV2NavigationInvariants();
    expect(invariants.historyNestedInLeague).toBe(true);
    const league = buildV2NavGroups().find((g) => g.id === "league");
    const history = league?.items.find((i) => i.id === "league-history");
    expect(history).toBeDefined();
    expect(history?.children?.map((c) => c.label)).toEqual([
      "Champions",
      "Hall of Fame",
      "Records",
      "Dynasties",
      "Timeline",
      "Transactions",
    ]);
  });

  it("exposes My Team destinations in locked order", () => {
    const myTeam = buildV2NavGroups().find((g) => g.id === "myTeam");
    expect(myTeam?.items.map((i) => i.label)).toEqual([
      "Roster",
      "Matchup",
      "Trades",
      "GM Advisor",
      "My GM",
      "Championship Path",
    ]);
  });

  it("exposes RFSN destinations in locked order", () => {
    const rfsn = buildV2NavGroups().find((g) => g.id === "rfsn");
    expect(rfsn?.items.map((i) => i.label)).toEqual([
      "Wire",
      "Breaking News",
      "Stories",
      "Recaps",
      "Analysts",
    ]);
  });

  it("exposes Draft destinations in locked order", () => {
    const draft = buildV2NavGroups().find((g) => g.id === "draft");
    expect(draft?.items.map((i) => i.label)).toEqual([
      "War Room",
      "Mock Draft",
      "Keeper Center",
      "Draft History",
    ]);
  });

  it("nests Standings children under League", () => {
    const league = buildV2NavGroups().find((g) => g.id === "league");
    const standings = league?.items.find((i) => i.id === "league-standings");
    expect(standings?.children?.map((c) => c.label)).toEqual([
      "Record",
      "Power Rankings",
      "Playoff Picture",
      "Strength of Schedule",
    ]);
  });

  it("registers every required canonical route", () => {
    const routes = getV2CanonicalRoutes();
    const required = [
      "/home",
      "/rivals",
      "/rivals/cast",
      "/rivals/owners",
      "/rivals/owners/:ownerId",
      "/rivals/head-to-head",
      "/rivals/rivalries",
      "/rivals/league-map",
      "/rivals/relationships",
      "/my-team",
      "/my-team/roster",
      "/my-team/matchup",
      "/my-team/trades",
      "/my-team/advisor",
      "/my-team/profile",
      "/my-team/championship-path",
      "/rfsn",
      "/rfsn/wire",
      "/rfsn/breaking",
      "/rfsn/stories",
      "/rfsn/recaps",
      "/rfsn/analysts",
      "/draft",
      "/draft/war-room",
      "/draft/mock",
      "/draft/keepers",
      "/draft/history",
      "/league",
      "/league/standings",
      "/league/standings/power-rankings",
      "/league/standings/playoffs",
      "/league/standings/strength-of-schedule",
      "/league/history",
      "/league/history/champions",
      "/league/history/hall-of-fame",
      "/league/history/records",
      "/league/history/dynasties",
      "/league/history/timeline",
      "/league/history/transactions",
      "/league/acquisition-impact",
      "/league/commissioner",
    ];
    for (const route of required) {
      expect(routes).toContain(route);
    }
  });

  it("points Home sidebar to canonical /home and keeps Draft legacy hrefs", () => {
    const home = V2_DESTINATIONS.find((d) => d.id === "home")!;
    expect(home.kind).toBe("live");
    expect(getV2NavHref(home)).toBe("/home");
    expect(isV2RouteActive("/home", home)).toBe(true);
    expect(isV2RouteActive("/dashboard", home)).toBe(false);

    const warRoom = getAllV2Destinations().find((d) => d.id === "draft-war-room")!;
    expect(getV2NavHref(warRoom)).toBe("/draft-war-room");
  });
});
