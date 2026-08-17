import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.join(process.cwd(), "client/src/pages/DraftHistory.tsx"), "utf8");

describe("Draft History board view stays a pick ledger (RFSN-055A)", () => {
  it("does not add Draft Night / Draft Results columns to the board table", () => {
    const boardStart = src.indexOf("{/* Picks table */}");
    const teamStart = src.indexOf("{/* Draft Grades");
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

  it("places grades on Draft Grades view only", () => {
    expect(src).toContain("historicalDraftEvaluation");
    expect(src).toContain('label: "Draft Grades"');
    expect(src).not.toContain('label: "Team View"');
    const team = src.slice(src.indexOf("{/* Draft Grades"));
    expect(team).toContain("Draft Night");
    expect(team).toContain("Draft Results");
    expect(team).toContain("GradeStat");
    expect(team).not.toContain("Best Pick");
    expect(team).not.toContain("overallGrade");
  });

  it("does not render empty player names on Draft Grades rows", () => {
    expect(src).toContain("historicalPickDisplayName");
    const team = src.slice(src.indexOf("{/* Draft Grades"));
    expect(team).not.toMatch(/\{p\.playerName \?\? "—"\}/);
  });
});
