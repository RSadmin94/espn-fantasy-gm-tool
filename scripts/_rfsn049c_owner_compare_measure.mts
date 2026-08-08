/**
 * RFSN-049C — local prompt-size measurement for OWNER_COMPARISON vs coaching controls.
 * Approx tokens = chars ÷ 4. Does not call OpenAI.
 */
import "dotenv/config";
import { buildAdvisorSystemPrompt } from "../server/advisorContextBuilder";
import {
  classifyAdvisorQuestionDetailed,
  listAdvisorOwnerAliases,
} from "../server/advisorQuestionClassify";
import { getUserMemory } from "../server/db";

const USER_ID = 1;
const SEASON = 2025;

const QUESTIONS = [
  { q: "How can I improve compared with Vince?", label: "owner-vince" },
  { q: "Am I better than Bruce?", label: "owner-bruce" },
  { q: "Should I worry about Demetri?", label: "owner-demetri" },
  { q: "How do I stack up against ClassicZig?", label: "owner-zig" },
  { q: "How can I improve my team?", label: "control-improve" },
  { q: "Who should I start at WR2?", label: "control-startsit" },
] as const;

function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function detectBlocks(system: string): string[] {
  const checks: Array<[string, RegExp]> = [
    ["CAREER HISTORY", /## CAREER HISTORY/],
    ["Named owner H2H", /NAMED OWNER COMPARISON/],
    ["Trophy", /Championship Authority|LEAGUE TROPHY/i],
    ["ANALYTICS", /CALCULATED ANALYTICS/],
    ["DNA", /League DNA|BEHAVIORAL DNA|## .*DNA/i],
    ["DRAFT", /GROUND TRUTH — .*DRAFT ORDER/],
  ];
  return checks.filter(([, re]) => re.test(system)).map(([n]) => n);
}

async function main() {
  const gmMemory = await getUserMemory(USER_ID);
  let gmMemoryBlock: string | undefined;
  if (gmMemory) {
    const parts: string[] = [];
    if (gmMemory.riskTolerance) parts.push(`Risk Tolerance: ${gmMemory.riskTolerance}`);
    if (gmMemory.tradePhilosophy) parts.push(`Trade Philosophy: ${gmMemory.tradePhilosophy}`);
    if (parts.length) gmMemoryBlock = parts.join("\n");
  }

  const aliases = await listAdvisorOwnerAliases(USER_ID, SEASON);
  console.log(
    `Loaded ${aliases.length} owner aliases. Sample: ${aliases
      .slice(0, 8)
      .map((a) => a.displayName)
      .join(", ")}`,
  );

  console.log(
    "| Question | Intent | Matched | Sys chars | Sys ≈tok | Blocks |",
  );
  console.log(
    "| -------- | ------ | ------- | --------: | -------: | ------ |",
  );

  for (const item of QUESTIONS) {
    const detailed = classifyAdvisorQuestionDetailed(item.q, {
      ownerAliases: aliases,
    });
    const system = await buildAdvisorSystemPrompt(
      SEASON,
      gmMemoryBlock,
      USER_ID,
      item.q,
    );
    const blocks = detectBlocks(system);
    console.log(
      `| ${item.q} | ${detailed.category} | ${detailed.matchedOwners.map((o) => o.displayName).join(", ") || "—"} | ${system.length} | ${approxTokens(system)} | ${blocks.join(", ") || "—"} |`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
