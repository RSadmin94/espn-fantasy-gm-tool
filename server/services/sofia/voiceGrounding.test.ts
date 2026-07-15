import { describe, it, expect } from "vitest";
import { checkEntityGuard, checkNumbersWithTolerance, checkRoundReferences, checkUnsupportedFactualAnchors, checkPremiseAnchored, checkSofiaAddsValue, checkCoachLaneProtection, disallowedEntities } from "./voiceGrounding";
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

  it("does NOT flag owner surname Graham as Jimmy Graham", () => {
    const allowed = ["Jan Graham", "Puka Nacua"];
    expect(checkEntityGuard("Jan Graham just made a statement with this Puka Nacua grab.", allowed).pass).toBe(true);
    expect(checkEntityGuard("Graham is playing for keeps tonight.", allowed).pass).toBe(true);
  });

  it("still flags unauthorized Jimmy Graham when not an owner reference", () => {
    const allowed = ["Jan Graham", "Puka Nacua"];
    const r = checkEntityGuard("This is the next Jimmy Graham at tight end.", allowed);
    expect(r.pass).toBe(false);
    expect(r.violations[0]?.canonicalName).toBe("Jimmy Graham");
  });

  it("does NOT flag Hall of Fame as Breece Hall", () => {
    const allowed = ["Bruce Edwards", "Kenneth Walker III"];
    expect(checkEntityGuard("Bruce Edwards is building a Hall of Fame roster.", allowed).pass).toBe(true);
  });

  it("does NOT flag owner surname Williams as Caleb Williams", () => {
    const allowed = ["Mark Williams", "Puka Nacua"];
    expect(checkEntityGuard("Mark Williams just made a bold move with Puka Nacua.", allowed).pass).toBe(true);
    expect(checkEntityGuard("Williams is loading up on receivers early.", allowed).pass).toBe(true);
  });

  it("does NOT flag owner surname Brown when multiple NFL Browns exist", () => {
    const o = buildPlayerRegistryOracle([
      { playerId: "b1", fullName: "A.J. Brown", normalizedName: "aj brown" },
      { playerId: "b2", fullName: "Antonio Brown", normalizedName: "antonio brown" },
    ]);
    const allowed = ["James Brown", "Kenneth Walker III"];
    expect(checkEntityGuard("James Brown is betting big on Kenneth Walker III.", allowed, o).pass).toBe(true);
  });

  it("still flags unauthorized Caleb Williams when not an owner reference", () => {
    const allowed = ["Mark Deroux", "Jaxon Smith-Njigba"];
    const r = checkEntityGuard("Is this the next Caleb Williams at quarterback?", allowed);
    expect(r.pass).toBe(false);
    expect(r.violations[0]?.canonicalName).toBe("Caleb Williams");
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

describe("round reference guard", () => {
  const claims = ["Tony Dorsey selected Patrick Mahomes (QB) at pick 168, round 12."];
  const subject: SubjectFallback = { ownerName: "Tony Dorsey", playerName: "Patrick Mahomes", position: "QB", overallPick: 168, round: 12 };

  it("passes correct round reference", () => {
    expect(checkRoundReferences("a twelfth-round quarterback stash", subject, claims).pass).toBe(true);
    expect(checkRoundReferences("taken in round 12", subject, claims).pass).toBe(true);
  });

  it("rejects wrong ordinal round", () => {
    const r = checkRoundReferences("relying on a sixth-round quarterback", subject, claims);
    expect(r.pass).toBe(false);
    expect(r.mismatches).toContain("6");
  });

  it("rejects wrong digit round", () => {
    expect(checkRoundReferences("you waited until round 6", subject, claims).pass).toBe(false);
  });
});

describe("unsupported factual anchors", () => {
  const claims = ["Jan Graham selected Puka Nacua at pick 130, round 10."];

  it("rejects invented injury in opinion", () => {
    const r = checkUnsupportedFactualAnchors(
      "Puka already has an injury history — risky depth pick.",
      claims,
      "OPINION",
    );
    expect(r.pass).toBe(false);
  });

  it("allows injury when in verified facts", () => {
    expect(checkUnsupportedFactualAnchors(
      "Brooks is coming off a torn ACL.",
      ["Jonathon Brooks is a rookie returning from a torn ACL."],
      "OPINION",
    ).pass).toBe(true);
  });
});

describe("premise anchoring", () => {
  const claims = ["Rod Sellers selected Lamar Jackson (QB) at pick 18, round 2."];

  it("passes when premise matches a verified fact", () => {
    expect(checkPremiseAnchored("Rod Sellers selected Lamar Jackson (QB) at pick 18, round 2.", claims).pass).toBe(true);
  });

  it("rejects unanchored premise", () => {
    expect(checkPremiseAnchored("pick fact", claims).pass).toBe(false);
  });
});

describe("Sofia adds-value guard", () => {
  const subject: SubjectFallback = { ownerName: "Mark Deroux", playerName: "Jaxon Smith-Njigba", position: "WR", overallPick: 105, round: 8 };

  it("rejects bare receipt when ADP fact exists", () => {
    const r = checkSofiaAddsValue(
      "Mark Deroux selected Jaxon Smith-Njigba (WR) at pick 105, round 8.",
      {
        subject,
        verifiedFacts: [
          "Mark Deroux selected Jaxon Smith-Njigba (WR) at pick 105, round 8.",
          "Jaxon Smith-Njigba fell 98 picks past ADP.",
        ],
      },
    );
    expect(r.pass).toBe(false);
  });

  it("passes when milestone language present", () => {
    expect(checkSofiaAddsValue(
      "Nate West selected Sam LaPorta in the third round, the earliest a tight end has ever been drafted in this league.",
      {
        subject: { ...subject, ownerName: "Nate West", playerName: "Sam LaPorta", position: "TE" },
        verifiedFacts: [
          "Nate West selected Sam LaPorta (TE) at pick 41, round 3.",
          "This is the earliest a tight end has ever been drafted in this league.",
        ],
      },
    ).pass).toBe(true);
  });
});

describe("coach lane protection", () => {
  it("rejects coach restating verified milestone", () => {
    const r = checkCoachLaneProtection(
      "It's a league record pick, folks — the earliest tight end ever taken.",
      {
        verifiedFacts: [
          "Nate West selected Sam LaPorta (TE) at pick 41, round 3.",
          "This is the earliest a tight end has ever been drafted in this league.",
        ],
      },
    );
    expect(r.pass).toBe(false);
  });

  it("passes coach reacting with strategy instead of restating milestone", () => {
    expect(checkCoachLaneProtection(
      "That move puts pressure on every other manager to upgrade at tight end before the window closes.",
      {
        verifiedFacts: [
          "Nate West selected Sam LaPorta (TE) at pick 41, round 3.",
          "This is the earliest a tight end has ever been drafted in this league.",
        ],
      },
    ).pass).toBe(true);
  });
});
