import { describe, it, expect } from "vitest";
import { parseEspnRecapPaste, DEFAULT_ESPN_ROUND1_2025 } from "./draftOrderDebugger";

describe("draftOrderDebugger", () => {
  it("parses pasted ESPN recap lines", () => {
    const text = `
1 Ja'Marr Chase → Dominion Thor
2 Saquon Barkley - The Playmakers
3. Amon-Ra St. Brown | TigerCommander
`;
    const rows = parseEspnRecapPaste(text);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.playerName).toContain("Ja'Marr Chase");
    expect(rows[0]?.teamName).toBe("Dominion Thor");
    expect(rows[2]?.pickNumber).toBe(3);
  });

  it("default sample has 14 round-1 rows", () => {
    expect(DEFAULT_ESPN_ROUND1_2025).toHaveLength(14);
  });
});
