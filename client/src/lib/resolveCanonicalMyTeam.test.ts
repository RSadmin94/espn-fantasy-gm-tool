import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  resolveCanonicalMyTeam,
  resolveMyTeamByOwnerClues,
} from "./resolveCanonicalMyTeam";

const espnTeams = [
  { teamId: 3, teamName: "Rod FC", owners: "Rod Sellers;Co-owner" },
  { teamId: 7, teamName: "Other Squad", owners: "Someone Else" },
];

describe("resolveMyTeamByOwnerClues (ESPN path)", () => {
  it("matches owner clues to ESPN team rows", () => {
    const my = resolveMyTeamByOwnerClues(espnTeams, ["Rod Sellers"]);
    expect(my).toEqual({
      teamId: 3,
      teamName: "Rod FC",
      ownerName: "Rod Sellers",
    });
  });

  it("returns null when clues do not match", () => {
    expect(resolveMyTeamByOwnerClues(espnTeams, ["Unknown GM"])).toBeNull();
  });
});

describe("resolveCanonicalMyTeam — ESPN unchanged", () => {
  it("uses name clues and ignores selectedTeamId", () => {
    const my = resolveCanonicalMyTeam({
      provider: "espn",
      connection: {
        selectedTeamId: 7,
        selectedOwnerName: "Someone Else",
        selectedFranchiseName: "Other Squad",
      },
      espnTeams,
      ownerClues: ["Rod Sellers"],
    });
    expect(my?.teamId).toBe(3);
    expect(my?.teamName).toBe("Rod FC");
  });

  it("does not fall through to selectedTeamId when clues miss", () => {
    const my = resolveCanonicalMyTeam({
      provider: "espn",
      connection: { selectedTeamId: 7, selectedOwnerName: "Someone Else" },
      espnTeams,
      ownerClues: ["No Match"],
    });
    expect(my).toBeNull();
  });
});

describe("resolveCanonicalMyTeam — non-ESPN selectedTeamId precedence", () => {
  it("Sleeper API: selectedTeamId wins immediately", () => {
    const my = resolveCanonicalMyTeam({
      provider: "sleeper",
      connection: {
        selectedTeamId: 4,
        selectedOwnerName: "Sleeper Owner",
        selectedFranchiseName: "API Franchise",
      },
      espnTeams: [],
      ownerClues: ["Would Match ESPN Only"],
    });
    expect(my).toEqual({
      teamId: 4,
      teamName: "API Franchise",
      ownerName: "Sleeper Owner",
    });
  });

  it("Sleeper Workbook: selectedTeamId wins immediately", () => {
    const my = resolveCanonicalMyTeam({
      provider: "sleeper_workbook",
      connection: {
        selectedTeamId: 1,
        selectedOwnerName: "TaylorMWitt",
        selectedFranchiseName: "Wasn't Last, Still Pain",
      },
      espnTeams: [],
      ownerClues: ["rsis220"],
    });
    expect(my).toEqual({
      teamId: 1,
      teamName: "Wasn't Last, Still Pain",
      ownerName: "TaylorMWitt",
    });
  });

  it("Yahoo / unknown: selectedTeamId wins (future providers benefit)", () => {
    for (const provider of ["yahoo", "unknown"] as const) {
      const my = resolveCanonicalMyTeam({
        provider,
        connection: { selectedTeamId: 9, selectedOwnerName: "Y Owner" },
        espnTeams: [],
        ownerClues: [],
      });
      expect(my?.teamId).toBe(9);
      expect(my?.ownerName).toBe("Y Owner");
    }
  });

  it("does not attempt ESPN name matching before selectedTeamId", () => {
    const my = resolveCanonicalMyTeam({
      provider: "sleeper",
      connection: { selectedTeamId: 99, selectedOwnerName: "Persisted" },
      espnTeams,
      ownerClues: ["Rod Sellers"],
    });
    expect(my?.teamId).toBe(99);
    expect(my?.ownerName).toBe("Persisted");
  });
});

describe("resolveCanonicalMyTeam — no selectedTeamId fallback", () => {
  it("falls back to clue matching when selectedTeamId is missing", () => {
    const my = resolveCanonicalMyTeam({
      provider: "sleeper",
      connection: { selectedTeamId: null, selectedOwnerName: null },
      espnTeams,
      ownerClues: ["Rod Sellers"],
    });
    expect(my?.teamId).toBe(3);
  });

  it("returns null when no selection and no clue match", () => {
    const my = resolveCanonicalMyTeam({
      provider: "sleeper_workbook",
      connection: { selectedTeamId: null },
      espnTeams: [],
      ownerClues: ["Anyone"],
    });
    expect(my).toBeNull();
  });

  it("returns null while provider is unresolved", () => {
    expect(
      resolveCanonicalMyTeam({
        provider: null,
        connection: { selectedTeamId: 1 },
        espnTeams: [],
        ownerClues: [],
      }),
    ).toBeNull();
  });
});

describe("RFSN-046B wiring (source)", () => {
  it("useLeagueContext uses resolveCanonicalMyTeam with active connection selection", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "client", "src", "hooks", "useLeagueContext.ts"),
      "utf-8",
    );
    expect(src).toContain('from "@/lib/resolveCanonicalMyTeam"');
    expect(src).toContain("resolveCanonicalMyTeam(");
    expect(src).toContain("activeConnection");
    expect(src).toContain("connection: activeConnection");
    expect(src).not.toContain("resolveMyTeam(teams, clues)");
  });
});
