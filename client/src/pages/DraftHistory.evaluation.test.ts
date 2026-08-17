import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.join(process.cwd(), "client/src/pages/DraftHistory.tsx"), "utf8");

describe("Draft History board view stays a pick ledger (RFSN-055A)", () => {
  it("does not add Draft Night / Draft Results columns to the board table", () => {
    const boardStart = src.indexOf("{/* Picks table */}");
    const teamStart = src.indexOf("{/* Team View");
    expect(boardStart).toBeGreaterThan(-1);
    expect(teamStart).toBeGreaterThan(boardStart);
    const board = src.slice(boardStart, teamStart);
    expect(board).toContain("Overall Pick");
    expect(board).toContain("Round");
    expect(board).toContain("Player");
    expect(board).not.toContain("Draft Night");
    expect(board).not.toContain("Draft Results");
    expect(board).not.toContain("Roster Management");
  });

  it("places grades on Team view only", () => {
    expect(src).toContain("historicalDraftEvaluation");
    const team = src.slice(src.indexOf("{/* Team View"));
    expect(team).toContain("Draft Night");
    expect(team).toContain("Draft Results");
    expect(team).toContain("GradeStat");
    expect(team).not.toContain("Best Pick");
    expect(team).not.toContain("overallGrade");
  });
});
