/**
 * Sofia Phase 2B — entailment eval fixtures (for the LIVE shadow smoke, run manually).
 *
 * These declare what a correct truth-checker SHOULD decide for each (sentence, claims) pair. The
 * committed unit tests do NOT use these against a real model — they run the checker against a mock.
 * These drive the untracked manual smoke that calls real DeepSeek, so we can see whether the model
 * actually classifies as expected.
 *
 * Honesty note: the "persona_control" group is HAND-AUTHORED flat/robotic phrasing of true facts. It
 * is NOT a corpus of historical generation outputs (no generation model has ever run). Its purpose is
 * to prove the TRUTH checker passes dull-but-grounded lines — dullness is the Comparison Engine's
 * concern, never the entailment checker's.
 */

export interface EntailmentFixture {
  id: string;
  category: "valid_entail" | "contradiction" | "unsupported_addition" | "persona_control";
  sentence: string;
  claims: string[];
  expected: "entail" | "neutral" | "contradict";
  note?: string;
}

const JG = ["Jan Graham selected Jaxon Smith-Njigba (WR) at pick 105, round 8.", "Jaxon Smith-Njigba fell 98.8 picks past ADP."];
const RS = ["Rod Sellers selected Lamar Jackson (QB) at pick 18, round 2."];
const MD = ["Mark Deroux selected Travis Etienne Jr. (RB) at pick 89, round 7.", "Travis Etienne Jr. fell 42.3 picks past ADP."];
const DC = ["Demetri Clark selected Josh Allen (QB) at pick 9, round 1.", "This is the earliest QB Demetri Clark has drafted."];
const H2H = ["Mark Deroux beat Rod Sellers 4 times."];

export const ENTAILMENT_FIXTURES: EntailmentFixture[] = [
  // ── valid entailments (9) ──
  { id: "e1", category: "valid_entail", sentence: "Jan Graham took Jaxon Smith-Njigba at pick 105.", claims: JG, expected: "entail" },
  { id: "e2", category: "valid_entail", sentence: "Jan Graham selected Jaxon Smith-Njigba (WR) at pick 105, round 8.", claims: JG, expected: "entail" },
  { id: "e3", category: "valid_entail", sentence: "Jaxon Smith-Njigba fell 98.8 picks past ADP.", claims: JG, expected: "entail" },
  { id: "e4", category: "valid_entail", sentence: "In round 8, Jan Graham grabbed Jaxon Smith-Njigba, who slid 98.8 picks past ADP.", claims: JG, expected: "entail" },
  { id: "e5", category: "valid_entail", sentence: "Mark Deroux has beaten Rod Sellers four times.", claims: H2H, expected: "entail" },
  { id: "e6", category: "valid_entail", sentence: "Josh Allen is the earliest quarterback Demetri Clark has ever drafted.", claims: DC, expected: "entail" },
  { id: "e7", category: "valid_entail", sentence: "At pick 18 in round 2, Rod Sellers took quarterback Lamar Jackson.", claims: RS, expected: "entail" },
  { id: "e8", category: "valid_entail", sentence: "Mark Deroux drafted Travis Etienne Jr. at pick 89.", claims: MD, expected: "entail" },
  { id: "e9", category: "valid_entail", sentence: "Travis Etienne Jr. was a steal, going 42.3 picks past ADP.", claims: MD, expected: "entail" },

  // ── direct contradictions (11) ──
  { id: "c1", category: "contradiction", sentence: "Rod Sellers beat Mark Deroux four times.", claims: H2H, expected: "contradict", note: "subject-object inversion" },
  { id: "c2", category: "contradiction", sentence: "Jan Graham selected Malik Nabers at pick 105.", claims: JG, expected: "contradict", note: "wrong player" },
  { id: "c3", category: "contradiction", sentence: "Bruce Edwards selected Jaxon Smith-Njigba at pick 105.", claims: JG, expected: "contradict", note: "wrong owner" },
  { id: "c4", category: "contradiction", sentence: "Jan Graham selected Jaxon Smith-Njigba at pick 42.", claims: JG, expected: "contradict", note: "wrong number" },
  { id: "c5", category: "contradiction", sentence: "Jaxon Smith-Njigba fell 12.5 picks past ADP.", claims: JG, expected: "contradict", note: "wrong ADP" },
  { id: "c6", category: "contradiction", sentence: "Jan Graham took Jaxon Smith-Njigba in round 3.", claims: JG, expected: "contradict", note: "wrong round" },
  { id: "c7", category: "contradiction", sentence: "Mark Deroux beat Rod Sellers 7 times.", claims: H2H, expected: "contradict", note: "wrong count" },
  { id: "c8", category: "contradiction", sentence: "Jaxon Smith-Njigba was reached 98.8 picks ahead of ADP.", claims: JG, expected: "contradict", note: "direction inversion (reach vs steal)" },
  { id: "c9", category: "contradiction", sentence: "Demetri Clark has drafted a quarterback earlier than Josh Allen before.", claims: DC, expected: "contradict", note: "contradicts 'earliest'" },
  { id: "c10", category: "contradiction", sentence: "Rod Sellers selected Lamar Jackson as a running back.", claims: RS, expected: "contradict", note: "wrong position" },
  { id: "c11", category: "contradiction", sentence: "Travis Etienne Jr. was a reach, going 42.3 picks ahead of ADP.", claims: MD, expected: "contradict", note: "steal reframed as reach" },

  // ── unsupported additions (9) → neutral ──
  { id: "n1", category: "unsupported_addition", sentence: "Jan Graham was thrilled to land Jaxon Smith-Njigba at pick 105.", claims: JG, expected: "neutral", note: "emotion" },
  { id: "n2", category: "unsupported_addition", sentence: "Jan Graham took Jaxon Smith-Njigba to lock down a true WR1.", claims: JG, expected: "neutral", note: "motive" },
  { id: "n3", category: "unsupported_addition", sentence: "Jan Graham is clearly building his roster around young receivers.", claims: JG, expected: "neutral", note: "strategy" },
  { id: "n4", category: "unsupported_addition", sentence: "Jaxon Smith-Njigba will be a league-winner this season.", claims: JG, expected: "neutral", note: "prediction" },
  { id: "n5", category: "unsupported_addition", sentence: "Rod Sellers had been targeting Lamar Jackson all draft.", claims: RS, expected: "neutral", note: "intent" },
  { id: "n6", category: "unsupported_addition", sentence: "Mark Deroux confidently drafted Travis Etienne Jr. at pick 89.", claims: MD, expected: "neutral", note: "emotion added to true fact" },
  { id: "n7", category: "unsupported_addition", sentence: "Demetri Clark broke from his usual patient approach to take Josh Allen.", claims: DC, expected: "neutral", note: "unsupported characterization" },
  { id: "n8", category: "unsupported_addition", sentence: "Jan Graham took Jaxon Smith-Njigba to fill his biggest positional need.", claims: JG, expected: "neutral", note: "unsupported need claim" },
  { id: "n9", category: "unsupported_addition", sentence: "It was a brilliant, franchise-altering selection by Mark Deroux.", claims: MD, expected: "neutral", note: "opinion/prediction" },

  // ── persona controls (5): dull but true. Truth checker must NOT punish dullness. ──
  { id: "p1", category: "persona_control", sentence: "Jan Graham. Jaxon Smith-Njigba. Pick 105, round 8.", claims: JG, expected: "entail", note: "flat phrasing of true facts" },
  { id: "p2", category: "persona_control", sentence: "Selection: Jaxon Smith-Njigba, WR, pick 105.", claims: JG, expected: "entail" },
  { id: "p3", category: "persona_control", sentence: "Data point: Travis Etienne Jr. fell 42.3 picks past ADP.", claims: MD, expected: "entail" },
  { id: "p4", category: "persona_control", sentence: "Owner Rod Sellers, player Lamar Jackson, position QB, pick 18.", claims: RS, expected: "entail" },
  { id: "p5", category: "persona_control", sentence: "Record: Mark Deroux 4 wins over Rod Sellers.", claims: H2H, expected: "entail" },
];
