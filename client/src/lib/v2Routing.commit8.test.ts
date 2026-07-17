import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getAllV2Destinations } from "@/lib/v2Navigation";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("v2Routing — Commit 8 cleanup", () => {
  it("has no placeholder destinations in locked navigation", () => {
    const destinations = getAllV2Destinations();
    expect(destinations.some((d) => d.kind === "placeholder")).toBe(false);
    expect(destinations.every((d) => d.legacyRoute === undefined)).toBe(true);
  });

  it("does not register live param routes as V2PlaceholderRoute duplicates", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).toContain("LIVE_PARAM_ROUTES");
    expect(main).toContain('path: "/rivals/owners/:ownerId"');
    expect(main).toContain("element: <RivalsOwnerDossier />");
    expect(main).not.toMatch(
      /path:\s*"\/rivals\/owners\/:ownerId"[\s\S]*?element:\s*<V2PlaceholderRoute/,
    );
  });

  it("redirects safe legacy League routes to canonical destinations", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    const redirects: [string, string][] = [
      ["/standings", "/league/standings"],
      ["/dynasty-power-rankings", "/league/standings/power-rankings"],
      ["/hall-of-fame", "/league/history/hall-of-fame"],
      ["/transactions", "/league/history/transactions"],
      ["/acquisition-impact", "/league/acquisition-impact"],
      ["/commissioner-command-center", "/league/commissioner"],
    ];
    for (const [legacy, canonical] of redirects) {
      expect(main).toContain(`path: "${legacy}"`);
      expect(main).toContain(`to="${canonical}"`);
    }
  });

  it("redirects safe legacy My Team routes to canonical destinations", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    const redirects: [string, string][] = [
      ["/roster", "/my-team/roster"],
      ["/matchups", "/my-team/matchup"],
      ["/trades", "/my-team/trades"],
      ["/advisor", "/my-team/advisor"],
      ["/championship-diagnosis", "/my-team/championship-path"],
      ["/championship-path", "/my-team/championship-path"],
    ];
    for (const [legacy, canonical] of redirects) {
      expect(main).toContain(`path: "${legacy}"`);
      expect(main).toContain(`to="${canonical}"`);
    }
  });

  it("redirects safe legacy Draft routes to canonical destinations", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    const redirects: [string, string][] = [
      ["/draft-history", "/draft/history"],
      ["/keeper-advisor", "/draft/keepers"],
      ["/keeper-forecast", "/draft/keepers"],
    ];
    for (const [legacy, canonical] of redirects) {
      expect(main).toContain(`path: "${legacy}"`);
      expect(main).toContain(`to="${canonical}"`);
    }
  });

  it("preserves distinct legacy routes that differ from canonical wrappers", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).toContain('path: "/league-dna"');
    expect(main).toContain('path: "/draft-war-room"');
    expect(main).toContain('path: "/draft-commentary"');
    expect(main).toContain('path: "/draft-reality"');
    expect(main).toContain('path: "/history"');
    expect(main).toContain("element: <LeagueHistory />");
  });

  it("redirects legacy rivalry and owner-profile aliases to canonical Rivals routes", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    const redirects: [string, string][] = [
      ["/rivalry-center", "/rivals/rivalries"],
      ["/owner-profiles", "/rivals/owners"],
      ["/rivals/head-to-head", "/rivals/rivalries"],
    ];
    for (const [legacy, canonical] of redirects) {
      expect(main).toContain(`path: "${legacy}"`);
      expect(main).toContain(`to="${canonical}"`);
    }
    expect(main).not.toContain("element: <RivalryCenter />");
    expect(main).not.toContain("element: <RivalsHeadToHead />");
  });

  it("removed dead ChampionshipPath page file (canonical uses ChampionshipDiagnosis)", () => {
    expect(fs.existsSync(path.join(repoRoot, "client/src/pages/ChampionshipPath.tsx"))).toBe(false);
    expect(
      fs.readFileSync(path.join(repoRoot, "client/src/pages/my-team/MyTeamChampionshipPath.tsx"), "utf-8"),
    ).toContain("ChampionshipDiagnosis");
  });

  it("removed obsolete mockDraftIntelligence test (production module no longer exists)", () => {
    expect(fs.existsSync(path.join(repoRoot, "server/mockDraftIntelligence.test.ts"))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, "client/src/lib/mockDraftUtils.ts"))).toBe(false);
  });

  it("briefing builders emit canonical V2 hrefs", () => {
    const gm = fs.readFileSync(path.join(repoRoot, "client/src/lib/gmBriefing.ts"), "utf-8");
    const coach = fs.readFileSync(path.join(repoRoot, "client/src/lib/welcomeBackCoachBriefing.ts"), "utf-8");
    expect(gm).toContain('href: "/rivals/rivalries"');
    expect(gm).toContain('href: "/draft/war-room"');
    expect(gm).toContain('href: "/my-team/championship-path"');
    expect(gm).not.toContain('href: "/rivalry-center"');
    expect(coach).toContain('href: "/league/standings/power-rankings"');
    expect(coach).toContain('href: "/my-team/trades"');
    expect(coach).not.toContain('href: "/dynasty-power-rankings"');
  });

  it("Keeper Center uses embedded mode to avoid nested page headers", () => {
    const keepers = fs.readFileSync(path.join(repoRoot, "client/src/pages/draft/DraftKeepers.tsx"), "utf-8");
    expect(keepers).toContain("embedded");
    expect(
      fs.readFileSync(path.join(repoRoot, "client/src/pages/LeagueKeeperForecast.tsx"), "utf-8"),
    ).toContain("embedded");
    expect(fs.readFileSync(path.join(repoRoot, "client/src/pages/KeeperAdvisor.tsx"), "utf-8")).toContain(
      "embedded",
    );
  });
});
