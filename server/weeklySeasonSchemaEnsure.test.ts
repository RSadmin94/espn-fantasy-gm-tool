import { describe, it, expect } from "vitest";
import { isBenignSchemaError } from "./weeklySeasonSchemaEnsure";

describe("weekly season schema ensure", () => {
  it("treats nested Duplicate column / errno 1060 as benign", () => {
    const inner = Object.assign(new Error("Duplicate column name 'leagueId'"), { errno: 1060, code: "ER_DUP_FIELDNAME" });
    const outer = Object.assign(new Error("Failed query: ALTER TABLE `weekly_storylines`"), { cause: inner });
    expect(isBenignSchemaError(outer)).toBe(true);
    expect(isBenignSchemaError(new Error("syntax error near ALTER"))).toBe(false);
  });
});
