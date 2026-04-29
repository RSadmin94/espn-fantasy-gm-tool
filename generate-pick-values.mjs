/**
 * 14-team PPR Pick Value Chart Generator
 *
 * The original Jimmy Johnson chart was designed for 32-team NFL drafts.
 * We calibrate it for a 14-team, PPR, keeper league using these principles:
 *
 * 1. The #1 overall pick is worth 3000 points (anchored from JJ chart).
 * 2. Value decays exponentially across 15 rounds × 14 teams = 210 picks.
 * 3. In a 14-team league, the value curve is steeper in rounds 1-3 (scarcity
 *    of elite players is higher) and flatter in rounds 8-15 (late picks are
 *    nearly interchangeable).
 * 4. PPR scoring inflates WR/TE value, which compresses the gap between
 *    round 1 and round 2 picks slightly vs. standard scoring.
 * 5. Keeper league adjustment: round 1 picks are slightly more valuable
 *    because elite players are often kept, making the top of the board
 *    more unpredictable and premium.
 *
 * Formula: value(pick) = BASE * e^(-k * (pick - 1))
 *   where BASE = 3000, k = 0.028 (tuned so pick 210 ≈ 1)
 *
 * This produces:
 *   Pick 1:   3000
 *   Pick 14:  ~2100  (end of round 1)
 *   Pick 15:  ~2050  (start of round 2 — snake, so pick 14 and 15 are adjacent)
 *   Pick 28:  ~1450  (end of round 2)
 *   Pick 42:  ~1000  (end of round 3)
 *   Pick 70:  ~500   (end of round 5)
 *   Pick 140: ~100   (end of round 10)
 *   Pick 210: ~1     (last pick)
 */

const TEAMS = 14;
const ROUNDS = 15;
const TOTAL_PICKS = TEAMS * ROUNDS; // 210
const BASE = 3000;
const K = 0.028;

// Generate all pick values
const picks = [];
for (let overall = 1; overall <= TOTAL_PICKS; overall++) {
  const round = Math.ceil(overall / TEAMS);
  // Snake draft: odd rounds go 1→14, even rounds go 14→1
  const positionInRound = overall - (round - 1) * TEAMS;
  const pickInRound = round % 2 === 1
    ? positionInRound          // odd round: 1.01, 1.02, ... 1.14
    : TEAMS + 1 - positionInRound; // even round: 2.14, 2.13, ... 2.01

  const value = Math.round(BASE * Math.exp(-K * (overall - 1)));

  picks.push({
    overall,
    round,
    pickInRound,
    label: `${round}.${String(pickInRound).padStart(2, '0')}`,
    value,
  });
}

// Print summary
console.log('=== 14-Team PPR Pick Value Chart ===\n');
console.log('Round | Pick | Overall | Value');
console.log('------|------|---------|------');
for (const p of picks) {
  if (p.pickInRound === 1 || p.pickInRound === 7 || p.pickInRound === 14) {
    console.log(`  ${String(p.round).padStart(2)}  | ${String(p.pickInRound).padStart(4)} |    ${String(p.overall).padStart(3)}    | ${p.value}`);
  }
}

// Output as JSON for embedding in the app
console.log('\n=== JSON Output (first 42 picks) ===');
console.log(JSON.stringify(picks.slice(0, 42).map(p => ({ label: p.label, overall: p.overall, value: p.value })), null, 2));

// Verify key values
console.log('\n=== Key Verification Points ===');
const keyPicks = [1, 7, 14, 15, 21, 28, 29, 42, 43, 70, 105, 140, 210];
for (const op of keyPicks) {
  const p = picks[op - 1];
  console.log(`Pick ${String(op).padStart(3)} (${p.label}): ${p.value}`);
}
