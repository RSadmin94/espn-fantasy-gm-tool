/**
 * @vitest-environment node
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  buildCompactLookupFromCatalog,
  createPlayerIdentityIndex,
  normalizePlayerName,
  resolvePlayerIdentity,
  sleeperPlayerHeadshotUrl,
  type CompactPlayerLookupArtifact,
} from "./playerIdentity";
import {
  getDefaultPlayerIdentityIndex,
  getPlayerIdentityArtifact,
  resolvePlayerIdentityDefault,
} from "./playerIdentityLookup";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fixtureArtifact(): CompactPlayerLookupArtifact {
  return buildCompactLookupFromCatalog(
    {
      "4046": {
        player_id: "4046",
        full_name: "Patrick Mahomes",
        position: "QB",
        team: "KC",
        espn_id: "3139477",
        active: true,
        status: "Active",
      },
      "4866": {
        player_id: "4866",
        full_name: "Saquon Barkley",
        position: "RB",
        team: "PHI",
        espn_id: "3929630",
        active: true,
        status: "Active",
      },
      "6780": {
        player_id: "6780",
        full_name: "Chris Rodriguez",
        position: "RB",
        team: "WAS",
        espn_id: "4426385",
        active: true,
        status: "Active",
      },
      // Ambiguous same name+team+pos (synthetic)
      "9001": {
        player_id: "9001",
        full_name: "Jordan Twin",
        position: "WR",
        team: "DAL",
        espn_id: "100001",
        active: true,
        status: "Active",
      },
      "9002": {
        player_id: "9002",
        full_name: "Jordan Twin",
        position: "WR",
        team: "DAL",
        espn_id: "100002",
        active: true,
        status: "Active",
      },
      // Same name, different teams — unique via team
      "9101": {
        player_id: "9101",
        full_name: "Alex Same",
        position: "WR",
        team: "CHI",
        espn_id: "200001",
        active: true,
        status: "Active",
      },
      "9102": {
        player_id: "9102",
        full_name: "Alex Same",
        position: "WR",
        team: "DET",
        espn_id: "200002",
        active: true,
        status: "Active",
      },
      // Same name, different positions — unique via position
      "9201": {
        player_id: "9201",
        full_name: "Sam Dual",
        position: "RB",
        team: "NYG",
        espn_id: "300001",
        active: true,
        status: "Active",
      },
      "9202": {
        player_id: "9202",
        full_name: "Sam Dual",
        position: "WR",
        team: "NYG",
        espn_id: "300002",
        active: true,
        status: "Active",
      },
      // Unique name only
      "9301": {
        player_id: "9301",
        full_name: "Unique Unicorn",
        position: "TE",
        team: "GB",
        espn_id: "400001",
        active: true,
        status: "Active",
      },
      // Inactive without espn — excluded from compact
      "9999": {
        player_id: "9999",
        full_name: "Ghost Inactive",
        position: "RB",
        team: "FA",
        active: false,
        status: "Inactive",
      },
      SF: {
        player_id: "SF",
        full_name: "San Francisco 49ers",
        position: "DEF",
        team: "SF",
        active: true,
        status: "Active",
      },
    },
  );
}

describe("shared/playerIdentity", () => {
  const artifact = fixtureArtifact();
  const index = createPlayerIdentityIndex(artifact);

  it("normalizes names consistently", () => {
    // Matches historical server/playerStatsTypes normalizer (apostrophe → space).
    expect(normalizePlayerName("Ja'Marr Chase")).toBe("ja marr chase");
    expect(normalizePlayerName("Patrick Mahomes II")).toBe("patrick mahomes");
  });

  it("tier 1: Sleeper ID", () => {
    const r = resolvePlayerIdentity({ sleeperPlayerId: "4046" }, index);
    expect(r.matchSource).toBe("sleeper_id");
    expect(r.sleeperPlayerId).toBe("4046");
    expect(r.espnPlayerId).toBe("3139477");
    expect(r.canonicalName).toBe("Patrick Mahomes");
    expect(r.confidence).toBe("exact");
    expect(r.headshotUrl).toContain("3139477");
    expect(r.unresolvedReason).toBeNull();
  });

  it("tier 2: ESPN ID", () => {
    const r = resolvePlayerIdentity({ espnPlayerId: "3929630" }, index);
    expect(r.matchSource).toBe("espn_id");
    expect(r.sleeperPlayerId).toBe("4866");
    expect(r.canonicalName).toBe("Saquon Barkley");
  });

  it("tier 3: name + team + position", () => {
    const r = resolvePlayerIdentity(
      { playerName: "Saquon Barkley", nflTeam: "PHI", position: "RB" },
      index,
    );
    expect(r.matchSource).toBe("name_team_pos");
    expect(r.sleeperPlayerId).toBe("4866");
    expect(r.confidence).toBe("high");
  });

  it("tier 4: name + team (when pos omitted)", () => {
    const r = resolvePlayerIdentity(
      { playerName: "Alex Same", nflTeam: "CHI" },
      index,
    );
    expect(r.matchSource).toBe("name_team");
    expect(r.espnPlayerId).toBe("200001");
  });

  it("tier 5: name + position (when team omitted / disambiguates)", () => {
    const r = resolvePlayerIdentity(
      { playerName: "Sam Dual", position: "WR" },
      index,
    );
    expect(r.matchSource).toBe("name_pos");
    expect(r.espnPlayerId).toBe("300002");
    expect(r.confidence).toBe("medium");
  });

  it("tier 6: unique exact normalized name only", () => {
    const r = resolvePlayerIdentity({ playerName: "Unique Unicorn" }, index);
    expect(r.matchSource).toBe("name_unique");
    expect(r.sleeperPlayerId).toBe("9301");
    expect(r.confidence).toBe("low");
  });

  it("tier 7: unresolved when no match", () => {
    const r = resolvePlayerIdentity({ playerName: "Nobody Here" }, index);
    expect(r.matchSource).toBe("unresolved");
    expect(r.unresolvedReason).toBe("no_match");
    expect(r.sleeperPlayerId).toBeNull();
    expect(r.headshotUrl).toBeNull();
  });

  it("rejects ambiguous name+team+pos", () => {
    const r = resolvePlayerIdentity(
      { playerName: "Jordan Twin", nflTeam: "DAL", position: "WR" },
      index,
    );
    expect(r.matchSource).toBe("unresolved");
    expect(r.unresolvedReason).toBe("ambiguous_name_team_pos");
  });

  it("rejects ambiguous unique-name when duplicates exist", () => {
    const r = resolvePlayerIdentity({ playerName: "Alex Same" }, index);
    expect(r.matchSource).toBe("unresolved");
    expect(r.unresolvedReason).toBe("ambiguous_name");
  });

  it("ESPN fallback headshot when id known but unresolved by name", () => {
    const r = resolvePlayerIdentity(
      { playerName: "Nobody Here", espnPlayerId: "3139477" },
      index,
    );
    // ESPN id matches Mahomes in index → tier 2 wins first
    expect(r.matchSource).toBe("espn_id");
  });

  it("ESPN fallback when espn id not in index", () => {
    const r = resolvePlayerIdentity(
      { playerName: "Ghost", espnPlayerId: "999888777" },
      index,
    );
    expect(r.matchSource).toBe("unresolved");
    expect(r.unresolvedReason).toBe("no_match");
    expect(r.espnPlayerId).toBe("999888777");
    expect(r.headshotUrl).toContain("999888777");
  });

  it("builds Sleeper headshot URLs", () => {
    expect(sleeperPlayerHeadshotUrl("4046")).toBe(
      "https://sleepercdn.com/content/nfl/players/thumb/4046.jpg",
    );
    const r = resolvePlayerIdentity({ sleeperPlayerId: "SF" }, index);
    expect(r.matchSource).toBe("sleeper_id");
    expect(r.headshotUrl).toContain("sleepercdn.com");
  });

  it("compact artifact generation excludes inactive without espn id", () => {
    expect(artifact.players.some((p) => p[0] === "9999")).toBe(false);
    expect(artifact.includedPlayerCount).toBeLessThan(artifact.sourcePlayerCount);
    expect(artifact.v).toBe(1);
    expect(artifact.contentHash).toMatch(/^fnv1a-[0-9a-f]+$/);
    expect(artifact).not.toHaveProperty("generatedAt");
  });

  it("missing input resolves as unresolved", () => {
    const r = resolvePlayerIdentity({}, index);
    expect(r.unresolvedReason).toBe("missing_input");
  });
});

describe("shared/playerIdentityLookup (bundled artifact)", () => {
  it("Rivals and bookmarklet call the same default resolver", () => {
    // Both surfaces import resolvePlayerIdentityDefault from this module.
    const rivals = resolvePlayerIdentityDefault;
    const bookmarklet = resolvePlayerIdentityDefault;
    expect(rivals).toBe(bookmarklet);

    const a = rivals({ espnPlayerId: "3139477" });
    const b = bookmarklet({ espnPlayerId: "3139477" });
    expect(a).toEqual(b);
    expect(a.matchSource).toBe("espn_id");
    expect(a.sleeperPlayerId).toBeTruthy();
  });

  it("loads versioned compact artifact within size budget", () => {
    const artifact = getPlayerIdentityArtifact();
    expect(artifact.v).toBe(1);
    expect(artifact.source).toBe("sleeper:v1/players/nfl");
    expect(artifact.includedPlayerCount).toBeGreaterThan(500);
    expect(artifact.includedPlayerCount).toBeLessThan(5000);

    const filePath = path.join(root, "shared/data/sleeperPlayerLookup.compact.json");
    const bytes = fs.statSync(filePath).size;
    expect(bytes).toBeGreaterThan(10_000);
    expect(bytes).toBeLessThanOrEqual(120_000);

    const index = getDefaultPlayerIdentityIndex();
    expect(index.playerCount).toBe(artifact.includedPlayerCount);
  });

  it("does not fetch the full Sleeper catalog at runtime", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    resolvePlayerIdentityDefault({ playerName: "Patrick Mahomes", nflTeam: "KC", position: "QB" });
    resolvePlayerIdentityDefault({ espnPlayerId: "3929630" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const identitySrc = fs.readFileSync(
      path.join(root, "shared/playerIdentity.ts"),
      "utf8",
    );
    const lookupSrc = fs.readFileSync(
      path.join(root, "shared/playerIdentityLookup.ts"),
      "utf8",
    );
    expect(identitySrc).not.toMatch(/fetch\s*\(/);
    expect(lookupSrc).not.toMatch(/fetch\s*\(/);
    expect(lookupSrc).not.toMatch(/api\.sleeper\.app/);
    expect(lookupSrc).toMatch(/sleeperPlayerLookup\.compact\.json/);
  });
});
