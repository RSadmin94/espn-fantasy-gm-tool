import { describe, expect, it } from "vitest";
import {
  draftPickHasIdentity,
  draftPickIdentityCoverage,
  isPlaceholderDraftLedger,
  pickIdentityScore,
} from "./draftPickSourceSelection";

describe("draftPickSourceSelection (RFSN-055D2)", () => {
  it("scores completed picks above placeholder ledger rows", () => {
    const placeholder = Array.from({ length: 12 }, (_, i) => ({
      playerId: null,
      playerName: "",
      position: "?",
      overallPick: i + 1,
    }));
    const completed = [
      { playerId: 3117251, playerName: "Christian McCaffrey", position: "RB" },
      { playerId: 4035538, playerName: "Jonathan Taylor", position: "RB" },
    ];
    expect(isPlaceholderDraftLedger(placeholder)).toBe(true);
    expect(isPlaceholderDraftLedger(completed)).toBe(false);
    expect(pickIdentityScore(completed)).toBeGreaterThan(pickIdentityScore(placeholder));
  });

  it("detects identity on playerId or non-blank playerName", () => {
    expect(draftPickHasIdentity({ playerId: 3117251, playerName: "" })).toBe(true);
    expect(draftPickHasIdentity({ playerId: null, playerName: "Ja'Marr Chase" })).toBe(true);
    expect(draftPickHasIdentity({ playerId: null, playerName: "" })).toBe(false);
  });

  it("reports coverage counts for mixed ledgers", () => {
    const cov = draftPickIdentityCoverage([
      { playerId: 3117251, playerName: "Christian McCaffrey" },
      { playerId: null, playerName: "" },
      { playerId: 4427366, playerName: "", position: "?" },
    ]);
    expect(cov.total).toBe(3);
    expect(cov.resolved).toBe(1);
    expect(cov.withPlayerId).toBe(2);
    expect(cov.unresolved).toBe(2);
  });
});
