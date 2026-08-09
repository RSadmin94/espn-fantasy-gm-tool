import { describe, expect, it } from "vitest";
import { selectMatchupMarginTool } from "./matchupMarginTool";
import {
  REGRESSION_LEAGUES,
  HISTORICAL_QUESTIONS,
  buildHistoricalRegressionMatrix,
  evaluateCurrentSeasonControl,
  evaluateHistoricalQuestion,
  evaluateLeagueSwitch,
  regressionSummary,
  streamingParityCheck,
} from "./advisorHistoricalRegression";

describe("RFSN-052G blowout 50+ tool selection", () => {
  it("selects wins by 50+ not one-point wins", () => {
    const sel = selectMatchupMarginTool("Who has the most blowout wins by 50+?");
    expect(sel).not.toBeNull();
    expect(sel?.query).toMatchObject({
      metric: "wins_by_margin",
      marginMin: 50,
    });
    expect(sel?.query.marginExact).toBeUndefined();
  });
});

describe("RFSN-052G historical regression matrix", () => {
  const rows = buildHistoricalRegressionMatrix();
  const summary = regressionSummary(rows);

  it("covers ESPN, Sleeper API, and Sleeper Workbook", () => {
    const providers = new Set(rows.map((r) => r.provider));
    expect(providers).toEqual(new Set(["espn", "sleeper", "sleeper_workbook"]));
  });

  it("runs all 10 historical questions per league plus controls", () => {
    expect(rows.length).toBeGreaterThanOrEqual(REGRESSION_LEAGUES.length * HISTORICAL_QUESTIONS.length);
    expect(summary.fail, JSON.stringify(rows.filter((r) => r.verdict === "FAIL"), null, 2)).toBe(0);
    expect(summary.pass).toBe(summary.total);
  });

  it("defaults to full recorded history when no season is specified", () => {
    for (const league of REGRESSION_LEAGUES) {
      const row = evaluateHistoricalQuestion({
        league,
        question: "Who has the most championships?",
      });
      expect(row.scope).toMatch(/default-history/);
      expect(row.scope).not.toMatch(/current_season/);
      expect(row.answer.toLowerCase()).not.toMatch(/\ball-time\b/);
    }
  });

  it("keeps current-season requests on current-season fallback", () => {
    for (const league of REGRESSION_LEAGUES) {
      const row = evaluateCurrentSeasonControl(league);
      expect(row.verdict, row.failures.join("; ")).toBe("PASS");
      expect(row.scope).toMatch(/current_season/);
    }
  });

  it("does not split ESPN Rod aliases across careers", () => {
    const espn = REGRESSION_LEAGUES.find((l) => l.provider === "espn")!;
    const rod = evaluateHistoricalQuestion({ league: espn, question: "Rod vs Bruce" });
    const alias = evaluateHistoricalQuestion({
      league: espn,
      question: "rod sellers vs bruce edwards",
    });
    expect(rod.answer).toBe(alias.answer);
    expect(rod.verdict).toBe("PASS");
  });

  it("labels regular season vs playoffs on H2H compare", () => {
    const espn = REGRESSION_LEAGUES.find((l) => l.provider === "espn")!;
    const row = evaluateHistoricalQuestion({ league: espn, question: "Compare {a} vs {b}." });
    expect(row.answer).toMatch(/Regular season/i);
    expect(row.answer).toMatch(/Playoffs/i);
  });

  it("qualifies partial workbook coverage instead of all-time", () => {
    const wb = REGRESSION_LEAGUES.find((l) => l.provider === "sleeper_workbook")!;
    const row = evaluateHistoricalQuestion({
      league: wb,
      question: "Who has the most championships?",
    });
    expect(row.answer).toMatch(/2025/);
    expect(row.answer.toLowerCase()).not.toMatch(/\ball-time\b/);
    expect(row.verdict, row.failures.join("; ")).toBe("PASS");
  });

  it("follows the active league when switching ESPN → Sleeper → Workbook", () => {
    const [espn, sleeper, workbook] = REGRESSION_LEAGUES;
    const a = evaluateLeagueSwitch(espn!, sleeper!);
    const b = evaluateLeagueSwitch(sleeper!, workbook!);
    expect(a.verdict, a.failures.join("; ")).toBe("PASS");
    expect(b.verdict, b.failures.join("; ")).toBe("PASS");
    expect(a.answer).not.toBe(b.answer);
  });

  it("streaming and non-streaming deterministic answers match", () => {
    const espn = REGRESSION_LEAGUES.find((l) => l.provider === "espn")!;
    expect(streamingParityCheck(espn, "Who has the most one-point losses?")).toBe(true);
    expect(streamingParityCheck(espn, "Who has the most championships?")).toBe(true);
    expect(streamingParityCheck(espn, "Compare {a} vs {b}.")).toBe(true);
  });

  it("rejects generic hallucinated fallback language", () => {
    for (const row of rows) {
      expect(row.answer.toLowerCase()).not.toMatch(
        /they likely had some close games|nail-biters|i don't have that information/,
      );
    }
  });
});
