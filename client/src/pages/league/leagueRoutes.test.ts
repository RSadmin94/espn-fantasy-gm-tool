import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getAllV2Destinations, getV2NavHref, V2_DESTINATIONS } from "@/lib/v2Navigation";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("League V2 — Commit 7 route ownership", () => {
  it("marks every League destination live with canonical hrefs", () => {
    const items = getAllV2Destinations().filter((d) => d.navCategory === "league");
    expect(items.length).toBeGreaterThanOrEqual(14);
    for (const d of items) {
      expect(d.kind).toBe("live");
      expect(d.legacyRoute).toBeUndefined();
      expect(getV2NavHref(d)).toBe(d.route);
    }
    expect(V2_DESTINATIONS.find((d) => d.id === "league-hub")?.route).toBe("/league");
  });

  it("does not invent top-level /league/settings — Settings remain utilities", () => {
    const routes = getAllV2Destinations().map((d) => d.route);
    expect(routes).not.toContain("/league/settings");
    expect(routes).not.toContain("/league/transactions");
    expect(routes).toContain("/league/history/transactions");
  });

  it("implements hub and children without placeholders", () => {
    const files = [
      "client/src/pages/league/LeagueHub.tsx",
      "client/src/pages/league/LeagueStandings.tsx",
      "client/src/pages/league/LeaguePowerRankings.tsx",
      "client/src/pages/league/LeaguePlayoffs.tsx",
      "client/src/pages/league/LeagueStrengthOfSchedule.tsx",
      "client/src/pages/league/LeagueArchiveLayout.tsx",
      "client/src/pages/league/LeagueTransactions.tsx",
      "client/src/pages/league/LeagueAcquisitionImpact.tsx",
      "client/src/pages/league/LeagueCommissioner.tsx",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
      expect(src).not.toContain("V2PlaceholderRoute");
      expect(src).not.toContain("V2PlaceholderPage");
    }
  });

  it("hub curates existing HoF / league signals without inventing metrics engines", () => {
    const hub = fs.readFileSync(path.join(repoRoot, "client/src/pages/league/LeagueHub.tsx"), "utf-8");
    expect(hub).toContain("data-v2-league-hub");
    expect(hub).toContain("espn.hallOfFame");
    expect(hub).toContain("/league/standings");
    expect(hub).toContain("/league/history");
    expect(hub).toContain("/league/history/transactions");
    expect(hub).not.toContain("ChampionshipAuthority");
    expect(hub).not.toContain("buildChampionshipAuthority");
    expect(hub).toContain("Presentation-only");
  });

  it("Standings routes reuse Standings / DynastyPowerRankings; SOS stays honest-empty", () => {
    expect(
      fs.readFileSync(path.join(repoRoot, "client/src/pages/league/LeagueStandings.tsx"), "utf-8"),
    ).toContain("Standings");
    expect(
      fs.readFileSync(path.join(repoRoot, "client/src/pages/league/LeaguePowerRankings.tsx"), "utf-8"),
    ).toContain("DynastyPowerRankings");
    expect(
      fs.readFileSync(path.join(repoRoot, "client/src/pages/league/LeaguePlayoffs.tsx"), "utf-8"),
    ).toContain('context="playoffs"');
    expect(
      fs.readFileSync(path.join(repoRoot, "client/src/pages/league/LeaguePlayoffs.tsx"), "utf-8"),
    ).toContain('initialMode="final"');
    const sos = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/league/LeagueStrengthOfSchedule.tsx"),
      "utf-8",
    );
    expect(sos).toContain("data-v2-league-sos");
    expect(sos).toContain("not yet exposed");
  });

  it("History archive mounts HallOfFame; Transactions mount factual Transactions page", () => {
    const archive = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/league/LeagueArchiveLayout.tsx"),
      "utf-8",
    );
    expect(archive).toContain("HallOfFame");
    expect(archive).toContain("archive-championships");
    expect(archive).toContain("archive-records");
    expect(archive).toContain("archive-dynasty");
    expect(archive).toContain("archive-milestones");
    expect(archive).not.toContain("LeagueWireNewsroom");
    expect(archive).not.toContain("Rfsn");

    const txs = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/league/LeagueTransactions.tsx"),
      "utf-8",
    );
    expect(txs).toContain("Transactions");
    expect(txs).toContain('route="/transactions"');
    expect(txs).not.toContain("Rfsn");
    expect(txs).not.toContain("LeagueWire");
  });

  it("preserves legacy League routes", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client/src/main.tsx"), "utf-8");
    for (const route of [
      "/standings",
      "/dynasty-power-rankings",
      "/transactions",
      "/history",
      "/hall-of-fame",
      "/acquisition-impact",
      "/commissioner-command-center",
      "/league-settings",
      "/settings",
      "/sync",
    ]) {
      expect(main).toContain(`path: "${route}"`);
    }
  });

  it("does not alter ChampionshipAuthority or owner identity modules in this commit", () => {
    expect(fs.existsSync(path.join(repoRoot, "server/championshipAuthority.ts"))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, "client/src/lib/ownerIdentity.ts"))).toBe(true);
    const standings = fs.readFileSync(path.join(repoRoot, "client/src/pages/Standings.tsx"), "utf-8");
    expect(standings).toContain("initialMode");
    expect(standings).toContain("trpc.espn.standings");
  });
});
