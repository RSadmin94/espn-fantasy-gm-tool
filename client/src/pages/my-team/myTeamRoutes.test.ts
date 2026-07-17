import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getAllV2Destinations, getV2NavHref, V2_DESTINATIONS } from "@/lib/v2Navigation";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("My Team V2 — Commit 4 route ownership", () => {
  it("marks every My Team destination live with canonical hrefs", () => {
    const items = getAllV2Destinations().filter((d) => d.navCategory === "myTeam");
    expect(items.length).toBeGreaterThanOrEqual(7);
    for (const d of items) {
      expect(d.kind).toBe("live");
      expect(d.legacyRoute).toBeUndefined();
      expect(getV2NavHref(d)).toBe(d.route);
    }
    expect(V2_DESTINATIONS.find((d) => d.id === "my-team-hub")?.route).toBe("/my-team");
  });

  it("implements hub and child routes without placeholders", () => {
    const files = [
      "client/src/pages/my-team/MyTeamHub.tsx",
      "client/src/pages/my-team/MyTeamRoster.tsx",
      "client/src/pages/my-team/MyTeamMatchup.tsx",
      "client/src/pages/my-team/MyTeamTrades.tsx",
      "client/src/pages/my-team/MyTeamAdvisor.tsx",
      "client/src/pages/my-team/MyTeamProfile.tsx",
      "client/src/pages/my-team/MyTeamChampionshipPath.tsx",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
      expect(src).not.toContain("V2PlaceholderRoute");
      expect(src).not.toContain("V2PlaceholderPage");
    }
  });

  it("reuses Roster, Matchups, Trades, Advisor, ChampionshipDiagnosis, OwnerProfiles", () => {
    expect(
      fs.readFileSync(path.join(repoRoot, "client/src/pages/my-team/MyTeamRoster.tsx"), "utf-8"),
    ).toContain("Roster");
    expect(
      fs.readFileSync(path.join(repoRoot, "client/src/pages/my-team/MyTeamMatchup.tsx"), "utf-8"),
    ).toContain("Matchups");
    expect(
      fs.readFileSync(path.join(repoRoot, "client/src/pages/my-team/MyTeamTrades.tsx"), "utf-8"),
    ).toContain("Trades");
    expect(
      fs.readFileSync(path.join(repoRoot, "client/src/pages/my-team/MyTeamAdvisor.tsx"), "utf-8"),
    ).toContain("Advisor");
    expect(
      fs
        .readFileSync(path.join(repoRoot, "client/src/pages/my-team/MyTeamChampionshipPath.tsx"), "utf-8")
        .includes("ChampionshipDiagnosis"),
    ).toBe(true);
    const profile = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/my-team/MyTeamProfile.tsx"),
      "utf-8",
    );
    expect(profile).toContain("authenticatedOwnerOnly");
    expect(profile).not.toContain("routeOwnerId");
    expect(profile).not.toContain("useParams");
  });

  it("hub curates me.ownerHome and links to canonical My Team tools", () => {
    const hub = fs.readFileSync(path.join(repoRoot, "client/src/pages/my-team/MyTeamHub.tsx"), "utf-8");
    expect(hub).toContain("data-v2-my-team-hub");
    expect(hub).toContain("me.ownerHome");
    expect(hub).toContain("/my-team/roster");
    expect(hub).toContain("/my-team/matchup");
    expect(hub).toContain("/my-team/trades");
    expect(hub).toContain("/my-team/advisor");
    expect(hub).toContain("/my-team/profile");
    expect(hub).toContain("/my-team/championship-path");
  });

  it("My GM cannot resolve another owner from URL parameters", () => {
    const profile = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/my-team/MyTeamProfile.tsx"),
      "utf-8",
    );
    expect(profile).toContain("authenticatedOwnerOnly");
    expect(profile).not.toContain("useParams");

    const owners = fs.readFileSync(path.join(repoRoot, "client/src/pages/OwnerProfiles.tsx"), "utf-8");
    expect(owners).toContain("authenticatedOwnerOnly");
    expect(owners).toContain("me.ownerHome");
    expect(owners).toContain("never URL");
  });

  it("Rivals dossier still resolves selected owners; My GM stays auth-bound", () => {
    const rivalsDossier = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/rivals/RivalsOwnerDossier.tsx"),
      "utf-8",
    );
    expect(rivalsDossier).toContain("routeOwnerId");
    expect(rivalsDossier).toContain("useParams");
    expect(rivalsDossier).not.toContain("authenticatedOwnerOnly");

    const myGm = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/my-team/MyTeamProfile.tsx"),
      "utf-8",
    );
    expect(myGm).toContain("authenticatedOwnerOnly");
    expect(myGm).not.toContain("routeOwnerId");
  });

  it("preserves legacy My Team routes in the router", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client/src/main.tsx"), "utf-8");
    for (const route of [
      "/roster",
      "/matchups",
      "/trades",
      "/advisor",
      "/owner-profiles",
      "/championship-diagnosis",
      "/championship-path",
      "/dashboard",
    ]) {
      expect(main).toContain(`path: "${route}"`);
    }
  });
});
