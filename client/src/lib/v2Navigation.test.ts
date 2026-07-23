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
      "Rivalries",
    ]);
    // Maps + H2H remain live destinations but are not sidebar entries (H2H redirects into Rivalries).
    for (const id of ["rivals-league-map", "rivals-relationships", "rivals-head-to-head"] as const) {
      const dest = V2_DESTINATIONS.find((d) => d.id === id)!;
      expect(dest.showInSidebar).toBe(false);
      expect(dest.kind).toBe("live");
    }
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
      "Live",
      "Stories",
      "Recaps",
    ]);
  });

  it("exposes Draft destinations in locked order", () => {
    const draft = buildV2NavGroups().find((g) => g.id === "draft");
    expect(draft?.items.map((i) => i.label)).toEqual([
      "Live Draft",
      "Mock Draft",
      "Draft War Room",
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
      "/rfsn/live",
      "/rfsn/wire",
      "/rfsn/breaking",
      "/rfsn/stories",
      "/rfsn/recaps",
      "/rfsn/analysts",
      "/draft",
      "/draft/live",
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

  it("points Home sidebar to canonical /home; Draft destinations are live", () => {
    const home = V2_DESTINATIONS.find((d) => d.id === "home")!;
    expect(home.kind).toBe("live");
    expect(getV2NavHref(home)).toBe("/home");
    expect(isV2RouteActive("/home", home)).toBe(true);
    expect(isV2RouteActive("/dashboard", home)).toBe(false);

    const warRoom = getAllV2Destinations().find((d) => d.id === "draft-war-room")!;
    expect(warRoom.kind).toBe("live");
    expect(warRoom.legacyRoute).toBeUndefined();
    expect(getV2NavHref(warRoom)).toBe("/draft/war-room");
  });

  it("points Rivals sidebar items to canonical live routes", () => {
    const rivals = buildV2NavGroups().find((g) => g.id === "rivals")!;
    expect(rivals.items.find((i) => i.id === "rivals-head-to-head")).toBeUndefined();
    expect(rivals.items.find((i) => i.id === "rivals-league-map")).toBeUndefined();
    expect(rivals.items.find((i) => i.id === "rivals-relationships")).toBeUndefined();
    const expected = [
      ["/rivals/cast", "rivals-cast"],
      ["/rivals/owners", "rivals-owner-dossier"],
      ["/rivals/rivalries", "rivals-rivalries"],
    ] as const;
    for (const [route, id] of expected) {
      const dest = rivals.items.find((i) => i.id === id)!;
      expect(dest.kind).toBe("live");
      expect(dest.legacyRoute).toBeUndefined();
      expect(getV2NavHref(dest)).toBe(route);
      expect(isV2RouteActive(route, dest)).toBe(true);
    }
    for (const [route, id] of [
      ["/rivals/head-to-head", "rivals-head-to-head"],
      ["/rivals/league-map", "rivals-league-map"],
      ["/rivals/relationships", "rivals-relationships"],
    ] as const) {
      const dest = V2_DESTINATIONS.find((d) => d.id === id)!;
      expect(dest.kind).toBe("live");
      expect(dest.showInSidebar).toBe(false);
      expect(getV2NavHref(dest)).toBe(route);
    }
    const hub = V2_DESTINATIONS.find((d) => d.id === "rivals-hub")!;
    expect(hub.kind).toBe("live");
    expect(getV2NavHref(hub)).toBe("/rivals");
  });

  it("points My Team sidebar items to canonical live routes", () => {
    const myTeam = buildV2NavGroups().find((g) => g.id === "myTeam")!;
    const expected = [
      ["/my-team/roster", "my-team-roster"],
      ["/my-team/matchup", "my-team-matchup"],
      ["/my-team/trades", "my-team-trades"],
      ["/my-team/advisor", "my-team-advisor"],
      ["/my-team/profile", "my-team-profile"],
      ["/my-team/championship-path", "my-team-championship-path"],
    ] as const;
    for (const [route, id] of expected) {
      const dest = myTeam.items.find((i) => i.id === id)!;
      expect(dest.kind).toBe("live");
      expect(dest.legacyRoute).toBeUndefined();
      expect(getV2NavHref(dest)).toBe(route);
      expect(isV2RouteActive(route, dest)).toBe(true);
    }
    const hub = V2_DESTINATIONS.find((d) => d.id === "my-team-hub")!;
    expect(hub.kind).toBe("live");
    expect(getV2NavHref(hub)).toBe("/my-team");
  });

  it("points RFSN sidebar items to canonical live routes", () => {
    const rfsn = buildV2NavGroups().find((g) => g.id === "rfsn")!;
    const expected = [
      ["/rfsn/live", "rfsn-live"],
      ["/rfsn/stories", "rfsn-stories"],
      ["/rfsn/recaps", "rfsn-recaps"],
    ] as const;
    for (const [route, id] of expected) {
      const dest = rfsn.items.find((i) => i.id === id)!;
      expect(dest.kind).toBe("live");
      expect(dest.legacyRoute).toBeUndefined();
      expect(getV2NavHref(dest)).toBe(route);
      expect(isV2RouteActive(route, dest)).toBe(true);
    }
    for (const [route, id] of [
      ["/rfsn/wire", "rfsn-wire"],
      ["/rfsn/breaking", "rfsn-breaking"],
      ["/rfsn/analysts", "rfsn-analysts"],
    ] as const) {
      const dest = V2_DESTINATIONS.find((d) => d.id === id)!;
      expect(dest.kind).toBe("live");
      expect(dest.showInSidebar).toBe(false);
      expect(getV2NavHref(dest)).toBe(route);
    }
    const hub = V2_DESTINATIONS.find((d) => d.id === "rfsn-hub")!;
    expect(hub.kind).toBe("live");
    expect(getV2NavHref(hub)).toBe("/rfsn");
  });

  it("points Draft sidebar items to canonical live routes", () => {
    const draft = buildV2NavGroups().find((g) => g.id === "draft")!;
    const expected = [
      ["/draft/live", "draft-live"],
      ["/draft/war-room", "draft-war-room"],
      ["/draft/mock", "draft-mock"],
      ["/draft/keepers", "draft-keepers"],
      ["/draft/history", "draft-history"],
    ] as const;
    for (const [route, id] of expected) {
      const dest = draft.items.find((i) => i.id === id)!;
      expect(dest.kind).toBe("live");
      expect(dest.legacyRoute).toBeUndefined();
      expect(getV2NavHref(dest)).toBe(route);
      expect(isV2RouteActive(route, dest)).toBe(true);
    }
    const warRoom = draft.items.find((i) => i.id === "draft-war-room")!;
    expect(warRoom.label).toBe("Draft War Room");
    expect(warRoom.showInSidebar).toBe(true);
    const hub = V2_DESTINATIONS.find((d) => d.id === "draft-hub")!;
    expect(hub.kind).toBe("live");
    expect(getV2NavHref(hub)).toBe("/draft");
  });

  it("points League sidebar items to canonical live routes", () => {
    const league = buildV2NavGroups().find((g) => g.id === "league")!;
    const standings = league.items.find((i) => i.id === "league-standings")!;
    expect(standings.kind).toBe("live");
    expect(standings.legacyRoute).toBeUndefined();
    expect(getV2NavHref(standings)).toBe("/league/standings");
    expect(standings.children?.map((c) => c.route)).toEqual([
      "/league/standings",
      "/league/standings/power-rankings",
      "/league/standings/playoffs",
      "/league/standings/strength-of-schedule",
    ]);
    for (const child of standings.children ?? []) {
      expect(child.kind).toBe("live");
      expect(child.legacyRoute).toBeUndefined();
    }

    const history = league.items.find((i) => i.id === "league-history")!;
    expect(history.kind).toBe("live");
    expect(getV2NavHref(history)).toBe("/league/history");
    expect(history.children?.map((c) => c.route)).toEqual([
      "/league/history/champions",
      "/league/history/hall-of-fame",
      "/league/history/records",
      "/league/history/dynasties",
      "/league/history/timeline",
      "/league/history/transactions",
    ]);
    for (const child of history.children ?? []) {
      expect(child.kind).toBe("live");
      expect(child.legacyRoute).toBeUndefined();
    }

    expect(getV2NavHref(league.items.find((i) => i.id === "league-acquisition-impact")!)).toBe(
      "/league/acquisition-impact",
    );
    expect(getV2NavHref(league.items.find((i) => i.id === "league-commissioner")!)).toBe(
      "/league/commissioner",
    );
    const hub = V2_DESTINATIONS.find((d) => d.id === "league-hub")!;
    expect(hub.kind).toBe("live");
    expect(getV2NavHref(hub)).toBe("/league");
  });
});
