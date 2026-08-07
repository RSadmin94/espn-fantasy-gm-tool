/**
 * Before/after Advisor system-prompt size for context-trimming categories (RFSN-049B).
 * Old = full bag (no userMessage → GENERAL_FULL gates).
 * New = gated by classifyAdvisorQuestion(userMessage).
 * Approx tokens = chars ÷ 4 (same method as prior audit).
 */
import "dotenv/config";
import { buildAdvisorSystemPrompt } from "../server/advisorContextBuilder";
import { classifyAdvisorQuestion } from "../server/advisorQuestionClassify";
import { getUserMemory } from "../server/db";

const USER_ID = 1;
const SEASON = 2025;

const QUESTIONS = [
  // Team improvement
  "How can I improve my team?",
  "What's my biggest weakness?",
  "How close am I to winning?",
  // General feedback
  "How am I doing?",
  "What do you think?",
  "Any advice?",
  // Existing categories
  "Who should I start at WR2?",
  "Should I trade for Justin Jefferson?",
  "Why do I always lose to Bruce?",
  "Who is the greatest owner in league history?",
  "Who is my biggest threat right now?",
  // Explicit full bag
  "Tell me everything about my franchise.",
] as const;

function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function detectBlocks(system: string): { present: string[]; absent: string[] } {
  const checks: Array<[string, RegExp]> = [
    ["CAREER HISTORY", /## CAREER HISTORY/],
    ["Trophy leaderboard", /Championship Authority|## .*TROPHY|League Trophy/i],
    ["CALCULATED ANALYTICS", /CALCULATED ANALYTICS/],
    ["THIS WEEK H2H", /THIS WEEK'S OPPONENT — H2H/],
    ["Opponent trophy", /THIS WEEK'S OPPONENT — TROPHY/],
    ["DNA", /League DNA|BEHAVIORAL DNA|## .*DNA/i],
    ["DRAFT ORDER", /GROUND TRUTH — .*DRAFT ORDER/],
  ];
  const present: string[] = [];
  const absent: string[] = [];
  for (const [name, re] of checks) {
    if (re.test(system)) present.push(name);
    else absent.push(name);
  }
  return { present, absent };
}

async function main() {
  const gmMemory = await getUserMemory(USER_ID);
  let gmMemoryBlock: string | undefined;
  if (gmMemory) {
    const memParts: string[] = [];
    if (gmMemory.riskTolerance) memParts.push(`Risk Tolerance: ${gmMemory.riskTolerance}`);
    if (gmMemory.tradePhilosophy) memParts.push(`Trade Philosophy: ${gmMemory.tradePhilosophy}`);
    if (gmMemory.keeperPhilosophy) memParts.push(`Keeper Philosophy: ${gmMemory.keeperPhilosophy}`);
    if (gmMemory.draftStyle) memParts.push(`Draft Style: ${gmMemory.draftStyle}`);
    if (gmMemory.favoritePlayerTypes)
      memParts.push(`Favorite Player Types: ${gmMemory.favoritePlayerTypes}`);
    if (gmMemory.rivalManagers) memParts.push(`Rival Managers to Watch: ${gmMemory.rivalManagers}`);
    if (gmMemory.notes) memParts.push(`GM Notes: ${gmMemory.notes}`);
    if (memParts.length > 0) gmMemoryBlock = memParts.join("\n");
  }

  console.log("Building baseline (old full bag — no userMessage)…");
  const oldSystem = await buildAdvisorSystemPrompt(SEASON, gmMemoryBlock, USER_ID);
  const oldChars = oldSystem.length;
  const oldTok = approxTokens(oldSystem);
  console.log(`Baseline: ${oldChars} chars ≈ ${oldTok} tokens\n`);

  console.log(
    "| Question | Classification | Old chars | Old ≈tok | New chars | New ≈tok | Δ chars | Blocks Removed | Blocks Retained |",
  );
  console.log(
    "| -------- | -------------- | --------: | -------: | --------: | -------: | ------: | -------------- | --------------- |",
  );

  for (const q of QUESTIONS) {
    const category = classifyAdvisorQuestion(q);
    const neu = await buildAdvisorSystemPrompt(SEASON, gmMemoryBlock, USER_ID, q);
    const newChars = neu.length;
    const newTok = approxTokens(neu);
    const oldBlocks = detectBlocks(oldSystem);
    const newBlocks = detectBlocks(neu);
    const removed = oldBlocks.present.filter((b) => !newBlocks.present.includes(b));
    const retained = newBlocks.present;

    console.log(
      `| ${q} | ${category} | ${oldChars} | ${oldTok} | ${newChars} | ${newTok} | ${newChars - oldChars} | ${removed.join(", ") || "—"} | ${retained.join(", ") || "—"} |`,
    );
  }

  // Force exit — open DB pools otherwise hang the process on Windows.
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
