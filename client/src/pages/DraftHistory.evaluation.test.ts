import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.join(process.cwd(), "client/src/pages/DraftHistory.tsx"), "utf8");

describe("Draft History board view stays a pick ledger (RFSN-055A)", () => {
  it("does not add Draft Night / Draft Results columns to the board table", () => {
    const boardStart = src.indexOf("{/* Picks table */}");
    const teamStart = src.indexOf("{/* Draft Receipts");
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

  it("places grades on Draft Receipts view only", () => {
    expect(src).toContain("historicalDraftEvaluation");
    expect(src).toContain('label: "Draft Receipts"');
    expect(src).not.toContain('label: "Team View"');
    expect(src).not.toContain('label: "Draft Grades"');
    expect(src).toContain("CopyDraftReceiptButton");
    const button = readFileSync(
      path.join(process.cwd(), "client/src/components/draft/CopyDraftReceiptButton.tsx"),
      "utf8",
    );
    expect(button).toContain("Copy Receipt");
    const team = src.slice(src.indexOf("{/* Draft Receipts"));
    expect(team).toContain("Draft Night");
    expect(team).toContain("Draft Results");
    expect(team).toContain("GradeStat");
    expect(team).toContain("Draft Receipt");
    expect(team).not.toContain("Best Pick");
    expect(team).not.toContain("overallGrade");
  });

  it("does not render empty player names on Draft Receipts rows", () => {
    expect(src).toContain("draftBoardPickDisplayName");
    const team = src.slice(src.indexOf("{/* Draft Receipts"));
    expect(team).not.toMatch(/\{p\.playerName \?\? "—"\}/);
  });
});
