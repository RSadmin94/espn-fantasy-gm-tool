import { describe, it, expect } from "vitest";
import { checkEntityGuard, checkNumbersWithTolerance, disallowedEntities } from "./voiceGrounding";
import { buildPlayerRegistryOracle } from "./playerRegistryOracle";
import { DEFAULT_PLAYER_REGISTRY_ORACLE } from "./playerRegistryOracle";
import type { SubjectFallback } from "./sofiaDeterministicValidation";

const subject: SubjectFallback = { ownerName: "Rod Sellers", playerName: "Lamar Jackson", position: "QB", overallPick: 18, round: 2 };

describe("entity guard (mention resolution)", () => {
  const allowed = ["Bruce Edwards", "Kenneth Walker III"];

  it("flags ungrounded multi-word player via structured violation", () => {
    const r = checkEntityGuard("Is Bruce really trusting Christian McCaffrey to carry him?", allowed);
    expect(r.pass).toBe(false);
    expect(r.violations[0]).toMatchObject({
      guard: "entity",
      canonicalName: "Christian McCaffrey",
      reason: "unauthorized_player_mention",
    });
  });

  it("flags ungrounded Patrick Mahomes comparison", () => {
    const r = checkEntityGuard("Is this the next Patrick Mahomes?", ["Steffon Bizzell", "Caleb Williams"]);
    expect(r.violations[0]?.canonicalName).toBe("Patrick Mahomes");
  });

  it("allows grounded players and owner names", () => {
    expect(checkEntityGuard("Did Rod just reach for Lamar Jackson? That's Rod's guy.", ["Rod Sellers", "Lamar Jackson"]).pass).toBe(true);
  });

  it("does NOT flag acronyms (JSN, ADP) or positions", () => {
    expect(checkEntityGuard("JSN falling past ADP — did Mark just steal a QB-level talent?", ["Mark Deroux", "Jaxon Smith-Njigba"]).pass).toBe(true);
  });

  it("does NOT flag emphasis, contractions, or teams", () => {
    expect(checkEntityGuard("Bruce Edwards took his fourth RB. Three-time champ? Bold. NEVER seen that.", allowed).pass).toBe(true);
    expect(checkEntityGuard("Here's what worries me. History says you're thin at RB.", allowed).pass).toBe(true);
    expect(checkEntityGuard("Bruce Edwards took a back — if the Jets get him the ball, he eats.", allowed).pass).toBe(true);
  });

  it("allows hyphenated grounded player", () => {
    expect(checkEntityGuard("Did Mark just steal Jaxon Smith-Njigba at pick 105?", ["Mark Deroux", "Jaxon Smith-Njigba"]).pass).toBe(true);
  });

  it("catches Andrew Luck comparison with seed oracle", () => {
    const r = checkEntityGuard("Bruce might have the best rookie since Andrew Luck.", allowed, DEFAULT_PLAYER_REGISTRY_ORACLE);
    expect(r.pass).toBe(false);
    expect(r.violations[0]?.canonicalName).toBe("Andrew Luck");
  });

  it("does NOT flag November", () => {
    expect(checkEntityGuard("I need backs I can count on in November.", allowed).pass).toBe(true);
  });

  it("ignores ambiguous Brown surname", () => {
    const o = buildPlayerRegistryOracle([
      { playerId: "b1", fullName: "A.J. Brown", normalizedName: "aj brown" },
      { playerId: "b2", fullName: "Antonio Brown", normalizedName: "antonio brown" },
    ]);
    const r = checkEntityGuard("I think Brown is going to regret this.", ["A.J. Brown"], o);
    expect(r.pass).toBe(true);
    expect(r.ignoredAmbiguous[0]?.reason).toBe("ambiguous_surname");
  });

  it("disallowedEntities returns matchedText for transitional callers", () => {
    expect(disallowedEntities("Best since Andrew Luck.", allowed, DEFAULT_PLAYER_REGISTRY_ORACLE)).toEqual(
      expect.arrayContaining(["Andrew Luck"]),
    );
  });
});

describe("numeric tolerance guard", () => {
  const claims = ["Jaxon Smith-Njigba fell 98.8 picks past ADP."];
  const pct = ["Rod Sellers has a 43.2% title probability."];

  it("passes an exact licensed number", () => {
    expect(checkNumbersWithTolerance("fell 98.8 picks past ADP", claims, subject).pass).toBe(true);
  });

  it("passes HEDGED rounding (nearly 100 for 98.8)", () => {
    expect(checkNumbersWithTolerance("fell nearly 100 picks past ADP", claims, subject).pass).toBe(true);
  });

  it("rejects UNHEDGED rounding (bare 99 for 98.8)", () => {
    expect(checkNumbersWithTolerance("fell 99 picks past ADP", claims, subject).pass).toBe(false);
  });

  it("rejects an invented number", () => {
    const r = checkNumbersWithTolerance("fell 50 picks past ADP", claims, subject);
    expect(r.pass).toBe(false);
    expect(r.invented).toContain("50");
  });

  it("passes percentage rounding within tolerance (43% for 43.2%)", () => {
    expect(checkNumbersWithTolerance("about a 43% title shot", pct, subject).pass).toBe(true);
  });

  it("rejects fabricated precision (98.83 for 98.8)", () => {
    expect(checkNumbersWithTolerance("fell nearly 98.83 picks past ADP", claims, subject).pass).toBe(false);
  });

  it("licenses the subject's pick and round numbers", () => {
    expect(checkNumbersWithTolerance("taken at pick 18 in round 2", claims, subject).pass).toBe(true);
  });

  it("does NOT flag position codes or structural references", () => {
    expect(checkNumbersWithTolerance("your QB1 is set but your RB1 is thin by Week 1", claims, subject).pass).toBe(true);
    expect(checkNumbersWithTolerance("he waited until round 1 anyway", claims, subject).pass).toBe(true);
  });
});
