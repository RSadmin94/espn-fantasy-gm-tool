/**
 * Sofia Phase 2A — evaluation scaffold. Model-free. Scores commentary against deterministic grounding,
 * word/sentence budget, and (when supplied) a semantic EntailmentChecker.
 *
 * Honest modeling: a "production decision" is only AVAILABLE when we can safely decide accept/reject —
 * a deterministic failure or a budget failure gives a safe REJECT, and a deterministic PASS is only
 * production-safe once a semantic checker has run. Without a semantic checker, a deterministic-pass
 * output (which could be a known-gap inversion) is NOT counted as production-safe. The full 50-moment
 * benchmark replaces the inline fixtures once a model-backed checker exists.
 */
import { countWords, type SubjectFallback } from "./sofiaGrounding";
import { verifyDeterministicGrounding, splitSentences, type EntailmentChecker } from "./sofiaDeterministicValidation";
import type { CommentaryLevel } from "./sofiaContract";

export interface EvalFixture {
  id: string;
  category: string;
  momentId: string;
  level: CommentaryLevel;
  text: string;
  permittedClaims: string[];
  subject: SubjectFallback;
  budget: { maxWords: number; maxSentences: number };
  expected: {
    deterministic: "pass" | "fail" | "known_gap";
    production: "accept" | "reject";
  };
}

export interface EvalScore {
  id: string;
  category: string;
  tokenPass: boolean;
  numberPass: boolean;
  polarityPass: boolean;
  budgetPass: boolean;
  deterministicResult: "pass" | "fail";
  semanticResult: "not_run" | "entail" | "neutral" | "contradict";
  expectedDeterministic: "pass" | "fail" | "known_gap";
  expectedProduction: "accept" | "reject";
  deterministicExpectationMet: boolean;
  productionDecisionAvailable: boolean;
  failures: string[];
}

export async function scoreCommentary(
  fixture: EvalFixture,
  entailmentChecker?: EntailmentChecker,
): Promise<EvalScore> {
  const det = verifyDeterministicGrounding(fixture.text, fixture.permittedClaims, fixture.subject);
  const budgetPass =
    countWords(fixture.text) <= fixture.budget.maxWords &&
    splitSentences(fixture.text).length <= fixture.budget.maxSentences;
  const deterministicResult: "pass" | "fail" = det.valid ? "pass" : "fail";

  let semanticResult: EvalScore["semanticResult"] = "not_run";
  if (entailmentChecker) {
    semanticResult = await entailmentChecker.check({
      sentence: fixture.text,
      claims: fixture.permittedClaims,
      subject: fixture.subject,
    });
  }

  const expectedDeterministic = fixture.expected.deterministic;
  const deterministicExpectationMet =
    expectedDeterministic === "known_gap"
      ? deterministicResult === "pass" // a known gap passes deterministic checks — that IS the gap
      : deterministicResult === expectedDeterministic;

  const productionDecisionAvailable =
    deterministicResult === "fail" ||
    !budgetPass ||
    (deterministicResult === "pass" && semanticResult !== "not_run");

  return {
    id: fixture.id,
    category: fixture.category,
    tokenPass: det.tokenPass,
    numberPass: det.numberPass,
    polarityPass: det.polarityPass,
    budgetPass,
    deterministicResult,
    semanticResult,
    expectedDeterministic,
    expectedProduction: fixture.expected.production,
    deterministicExpectationMet,
    productionDecisionAvailable,
    failures: det.failures.map((f) => `${f.category}: ${f.message}`),
  };
}

export async function runEval(fixtures: EvalFixture[], entailmentChecker?: EntailmentChecker) {
  const scores = await Promise.all(fixtures.map((f) => scoreCommentary(f, entailmentChecker)));
  return {
    total: scores.length,
    deterministicExpectationsMet: scores.filter((s) => s.deterministicExpectationMet).length,
    deterministicFailures: scores.filter((s) => s.deterministicResult === "fail").length,
    knownGaps: fixtures.filter((f) => f.expected.deterministic === "known_gap").length,
    semanticChecksRun: scores.filter((s) => s.semanticResult !== "not_run").length,
    productionDecisionsAvailable: scores.filter((s) => s.productionDecisionAvailable).length,
    scores,
  };
}

// ── Fixtures (inline; no DB, no provider) ────────────────────────────────────────────────────────
const SUBJ_JG: SubjectFallback = { ownerName: "Jan Graham", playerName: "Jaxon Smith-Njigba", position: "WR", overallPick: 105, round: 8 };
const CLAIMS_JG = [
  "Jan Graham selected Jaxon Smith-Njigba (WR) at pick 105, round 8.",
  "Jaxon Smith-Njigba fell 98.8 picks past ADP.",
];
const SUBJ_RS: SubjectFallback = { ownerName: "Rod Sellers", playerName: "Lamar Jackson", position: "QB", overallPick: 18, round: 2 };
const CLAIMS_RS = ["Rod Sellers selected Lamar Jackson (QB) at pick 18, round 2."];
const SUBJ_MD: SubjectFallback = { ownerName: "Mark Deroux", playerName: "Travis Etienne Jr.", position: "RB", overallPick: 89, round: 7 };
const CLAIMS_MD = [
  "Mark Deroux selected Travis Etienne Jr. (RB) at pick 89, round 7.",
  "Travis Etienne Jr. fell 42.3 picks past ADP.",
];
const SUBJ_DC: SubjectFallback = { ownerName: "Demetri Clark", playerName: "Josh Allen", position: "QB", overallPick: 9, round: 1 };
const CLAIMS_DC = [
  "Demetri Clark selected Josh Allen (QB) at pick 9, round 1.",
  "This is the earliest QB Demetri Clark has drafted.",
];

export const SOFIA_EVAL_FIXTURES: EvalFixture[] = [
  // ── valid (deterministic pass / production accept) ──
  { id: "v1", category: "valid", momentId: "457622:m:105", level: "routine", text: "Jan Graham selected Jaxon Smith-Njigba (WR) at pick 105, round 8.", permittedClaims: CLAIMS_JG, subject: SUBJ_JG, budget: { maxWords: 20, maxSentences: 1 }, expected: { deterministic: "pass", production: "accept" } },
  { id: "v2", category: "valid", momentId: "457622:m:105f", level: "historic", text: "Jan Graham selected Jaxon Smith-Njigba (WR) at pick 105, round 8. Jaxon Smith-Njigba fell 98.8 picks past ADP.", permittedClaims: CLAIMS_JG, subject: SUBJ_JG, budget: { maxWords: 45, maxSentences: 2 }, expected: { deterministic: "pass", production: "accept" } },
  { id: "v3", category: "valid", momentId: "457622:m:18", level: "major", text: "Rod Sellers selected Lamar Jackson (QB) at pick 18, round 2.", permittedClaims: CLAIMS_RS, subject: SUBJ_RS, budget: { maxWords: 20, maxSentences: 1 }, expected: { deterministic: "pass", production: "accept" } },
  { id: "v4", category: "valid", momentId: "457622:m:89", level: "historic", text: "Mark Deroux selected Travis Etienne Jr. (RB) at pick 89, round 7. Travis Etienne Jr. fell 42.3 picks past ADP.", permittedClaims: CLAIMS_MD, subject: SUBJ_MD, budget: { maxWords: 45, maxSentences: 2 }, expected: { deterministic: "pass", production: "accept" } },

  // ── deterministic adversarial (deterministic fail / production reject) ──
  { id: "a1", category: "invented_number", momentId: "457622:m:105", level: "historic", text: "Jaxon Smith-Njigba fell 50 picks past ADP.", permittedClaims: CLAIMS_JG, subject: SUBJ_JG, budget: { maxWords: 45, maxSentences: 2 }, expected: { deterministic: "fail", production: "reject" } },
  { id: "a2", category: "rounded_number", momentId: "457622:m:105", level: "historic", text: "Jaxon Smith-Njigba fell 99 picks past ADP.", permittedClaims: CLAIMS_JG, subject: SUBJ_JG, budget: { maxWords: 45, maxSentences: 2 }, expected: { deterministic: "fail", production: "reject" } },
  { id: "a3", category: "adp_inversion", momentId: "457622:m:105", level: "historic", text: "Jan Graham reached for Jaxon Smith-Njigba (WR) at pick 105, ahead of ADP.", permittedClaims: CLAIMS_JG, subject: SUBJ_JG, budget: { maxWords: 45, maxSentences: 2 }, expected: { deterministic: "fail", production: "reject" } },
  { id: "a4", category: "timing_inversion", momentId: "457622:m:9", level: "historic", text: "This is the latest QB Demetri Clark has drafted.", permittedClaims: CLAIMS_DC, subject: SUBJ_DC, budget: { maxWords: 45, maxSentences: 2 }, expected: { deterministic: "fail", production: "reject" } },
  { id: "a5", category: "out_of_vocab", momentId: "457622:m:105", level: "historic", text: "Jan Graham gambled on Jaxon Smith-Njigba (WR) at pick 105.", permittedClaims: CLAIMS_JG, subject: SUBJ_JG, budget: { maxWords: 45, maxSentences: 2 }, expected: { deterministic: "fail", production: "reject" } },

  // ── over-budget (grounded, but rejected by the budget gate — NOT a grounding failure) ──
  { id: "b1", category: "over_budget", momentId: "457622:m:105f", level: "routine", text: "Jan Graham selected Jaxon Smith-Njigba (WR) at pick 105, round 8. Jaxon Smith-Njigba fell 98.8 picks past ADP.", permittedClaims: CLAIMS_JG, subject: SUBJ_JG, budget: { maxWords: 8, maxSentences: 1 }, expected: { deterministic: "pass", production: "reject" } },

  // ── known semantic gaps (deterministic pass, but production reject — needs model entailment) ──
  { id: "k1", category: "subject_object_inversion", momentId: "gap:h2h", level: "notable", text: "Rod beat Mark 3 times.", permittedClaims: ["Mark beat Rod 3 times."], subject: { ownerName: "Mark", playerName: "Rod", position: "NA", overallPick: 0, round: 0 }, budget: { maxWords: 20, maxSentences: 1 }, expected: { deterministic: "known_gap", production: "reject" } },
  { id: "k2", category: "negation_scope", momentId: "gap:neg", level: "notable", text: "Rod Sellers has drafted a quarterback in round 1.", permittedClaims: ["Rod Sellers has never drafted a quarterback in round 1."], subject: { ownerName: "Rod Sellers", playerName: "quarterback", position: "QB", overallPick: 1, round: 1 }, budget: { maxWords: 20, maxSentences: 1 }, expected: { deterministic: "known_gap", production: "reject" } },
  { id: "k3", category: "comparison_direction", momentId: "gap:cmp", level: "notable", text: "Lamar Jackson ranked above Josh Allen in points.", permittedClaims: ["Josh Allen ranked above Lamar Jackson in points."], subject: { ownerName: "League", playerName: "Josh Allen", position: "QB", overallPick: 0, round: 0 }, budget: { maxWords: 20, maxSentences: 1 }, expected: { deterministic: "known_gap", production: "reject" } },
];
