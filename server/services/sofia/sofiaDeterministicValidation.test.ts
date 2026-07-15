import { describe, it, expect } from "vitest";
import {
  verifyDeterministicGrounding,
  DeterministicEntailmentPlaceholder,
  KNOWN_SEMANTIC_GAPS,
} from "./sofiaDeterministicValidation";
import { runEval, SOFIA_EVAL_FIXTURES } from "./sofiaEval";
import type { SubjectFallback } from "./sofiaGrounding";

const SUBJ_JG: SubjectFallback = { ownerName: "Jan Graham", playerName: "Jaxon Smith-Njigba", position: "WR", overallPick: 105, round: 8 };
const CLAIMS_JG = [
  "Jan Graham selected Jaxon Smith-Njigba (WR) at pick 105, round 8.",
  "Jaxon Smith-Njigba fell 98.8 picks past ADP.",
];
const SUBJ_DC: SubjectFallback = { ownerName: "Demetri Clark", playerName: "Josh Allen", position: "QB", overallPick: 9, round: 1 };
const CLAIMS_DC = [
  "Demetri Clark selected Josh Allen (QB) at pick 9, round 1.",
  "This is the earliest QB Demetri Clark has drafted.",
];

describe("verifyDeterministicGrounding", () => {
  it("1. valid Phase 1 commentary passes token, number, and polarity", () => {
    const r = verifyDeterministicGrounding(
      "Jan Graham selected Jaxon Smith-Njigba (WR) at pick 105, round 8. Jaxon Smith-Njigba fell 98.8 picks past ADP.",
      CLAIMS_JG,
      SUBJ_JG,
    );
    expect(r.valid).toBe(true);
    expect(r.tokenPass && r.numberPass && r.polarityPass).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("2. invented number fails", () => {
    const r = verifyDeterministicGrounding("Jaxon Smith-Njigba fell 50 picks past ADP.", CLAIMS_JG, SUBJ_JG);
    expect(r.numberPass).toBe(false);
    expect(r.failures.some((f) => f.category === "number" && f.message.includes("50"))).toBe(true);
  });

  it("3. rounded number fails", () => {
    const r = verifyDeterministicGrounding("Jaxon Smith-Njigba fell 99 picks past ADP.", CLAIMS_JG, SUBJ_JG);
    expect(r.numberPass).toBe(false);
  });

  it("4. polarity inversion fails", () => {
    const r = verifyDeterministicGrounding("This is the latest QB Demetri Clark has drafted.", CLAIMS_DC, SUBJ_DC);
    expect(r.valid).toBe(false);
    // caught by polarity (earliest->latest) and/or token gate
    expect(r.polarityPass === false || r.tokenPass === false).toBe(true);
  });

  it("5. out-of-vocabulary factual language fails", () => {
    const r = verifyDeterministicGrounding("Jan Graham gambled on Jaxon Smith-Njigba (WR) at pick 105.", CLAIMS_JG, SUBJ_JG);
    expect(r.tokenPass).toBe(false);
  });

  it("6. subject pick and round numbers are licensed even if absent from claims", () => {
    const subj: SubjectFallback = { ownerName: "Owner", playerName: "Player", position: "WR", overallPick: 105, round: 8 };
    const claimsNoNums = ["Owner selected Player at pick, round."];
    const r = verifyDeterministicGrounding("Owner selected Player at pick 105, round 8.", claimsNoNums, subj);
    expect(r.numberPass).toBe(true); // 105 and 8 licensed by subject.overallPick / subject.round
  });

  it("7. deterministic entailment placeholder: contradict on inconsistency, neutral on consistency, NEVER entail", async () => {
    const bad = await DeterministicEntailmentPlaceholder.check({ sentence: "Jaxon Smith-Njigba fell 50 picks past ADP.", claims: CLAIMS_JG, subject: SUBJ_JG });
    const good = await DeterministicEntailmentPlaceholder.check({ sentence: "Jaxon Smith-Njigba fell 98.8 picks past ADP.", claims: CLAIMS_JG, subject: SUBJ_JG });
    expect(bad).toBe("contradict");
    expect(good).toBe("neutral");
    expect(bad).not.toBe("entail");
    expect(good).not.toBe("entail");
  });
});

describe("eval runner", () => {
  it("8. reports every deterministic fixture's expectation as met", async () => {
    const rep = await runEval(SOFIA_EVAL_FIXTURES);
    expect(rep.deterministicExpectationsMet).toBe(rep.total);
  });

  it("9. known semantic-gap fixtures are identified as known_gap and pass deterministic checks", async () => {
    const rep = await runEval(SOFIA_EVAL_FIXTURES);
    expect(rep.knownGaps).toBe(3);
    const gaps = rep.scores.filter((s) => s.expectedDeterministic === "known_gap");
    expect(gaps.length).toBe(3);
    expect(gaps.every((s) => s.deterministicResult === "pass")).toBe(true); // they pass lexically — that IS the gap
  });

  it("10. known-gap fixtures are NOT counted production-safe without a semantic checker", async () => {
    const rep = await runEval(SOFIA_EVAL_FIXTURES); // no checker supplied
    const gaps = rep.scores.filter((s) => s.expectedDeterministic === "known_gap");
    expect(gaps.every((s) => s.productionDecisionAvailable === false)).toBe(true);
    expect(rep.semanticChecksRun).toBe(0);
  });

  it("11. real Phase-1 template lines pass semantic-adjacent deterministic grounding", () => {
    const lines: Array<[string, string[], SubjectFallback]> = [
      ["Jan Graham selected Jaxon Smith-Njigba (WR) at pick 105, round 8.", CLAIMS_JG, SUBJ_JG],
      ["Jan Graham selected Jaxon Smith-Njigba (WR) at pick 105, round 8. Jaxon Smith-Njigba fell 98.8 picks past ADP.", CLAIMS_JG, SUBJ_JG],
      ["Demetri Clark selected Josh Allen (QB) at pick 9, round 1.", CLAIMS_DC, SUBJ_DC],
    ];
    for (const [text, claims, subject] of lines) {
      expect(verifyDeterministicGrounding(text, claims, subject).valid).toBe(true);
    }
  });

  it("exposes the known-gap category list", () => {
    expect(KNOWN_SEMANTIC_GAPS).toContain("subject_object_inversion");
    expect(KNOWN_SEMANTIC_GAPS).toContain("negation_scope");
  });

  // Deferred to the phase that wires a model-backed EntailmentChecker. NOT a passing test now —
  // we never assert that an inversion must remain accepted.
  it.todo("model-backed EntailmentChecker rejects subject-object inversion (k1: 'Rod beat Mark' vs claim 'Mark beat Rod')");
});
