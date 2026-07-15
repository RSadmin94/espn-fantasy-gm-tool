/**
 * C9 / ownerSelfReview validation (no LLM call, no DB writes).
 *
 * Usage:
 *   npx tsx scripts/validate-c9-owner-self-review.ts [userId]
 *
 * With userId: builds the same career + prompt framing as ownerSelfReview and
 * asserts forbidden literals are absent from the assembled user prompt.
 *
 * Without userId: runs synthetic profile block assertions only.
 */

import assert from "node:assert";
import {
  buildOwnerCareerProfileForFocalUser,
  formatOwnerCareerProfileFactsBlock,
  type OwnerCareerProfile,
} from "../server/ownerCareerProfileService";
import {
  resolveLeaguePromptContext,
  buildLeaguePromptContext,
} from "../server/leaguePromptContext";

/** Legacy static ownerSelfReview prompt markers — must never reappear in assembled prompt. */
const LEGACY_STATIC_MARKERS = [
  "Rod's complete career data",
  "50W–56L",
  "50W-56L",
  "1921 PF",
  "1447 PF",
  "PLAYOFF APPEARANCES: 4 of 8 seasons",
  "2019 #2 seed, 2021 #9",
  "Derrick Henry 2022",
  "Aug 18 deadline",
  "18-season keeper league \"ATLANTAS",
];

/** Static template from routers.ts ownerSelfReview (must stay free of legacy hardcoding). */
const STATIC_PROMPT_HEAD = `You are an expert fantasy football analyst reviewing the career of `;

function assertNoLegacyMarkers(label: string, text: string) {
  const lower = text.toLowerCase();
  for (const f of LEGACY_STATIC_MARKERS) {
    if (lower.includes(f.toLowerCase())) {
      throw new Error(`${label}: legacy static marker "${f}" found`);
    }
  }
  if (/nan|undefined|infinity/i.test(text)) {
    throw new Error(`${label}: NaN/undefined/Infinity in text`);
  }
}

function buildSelfReviewUserPrompt(
  career: OwnerCareerProfile,
  leagueDescriptor: string,
  historyClause: string,
): string {
  const franchiseLine = career.teamNames.length ? ` (${career.teamNames.join(" / ")})` : "";
  const facts = formatOwnerCareerProfileFactsBlock(career);
  return `${STATIC_PROMPT_HEAD}${career.ownerName}${franchiseLine} in ${leagueDescriptor}, ${historyClause}.

Here is the compiled career data for this manager (from synced ESPN cache only — treat as ground truth; do not invent seasons or stats not listed):

${facts}

Generate an honest, detailed self-scouting report as if you are this manager's personal analytics coach. Be direct and specific — don't be generic.

Respond with JSON in this exact format:
{
  "narrative": "3-4 sentence career narrative describing this manager's arc, style, and trajectory",
  "focusAreas2026": ["specific focus area 1", "specific focus area 2", "specific focus area 3", "specific focus area 4"],
  "draftRecommendations": "2-3 sentences of specific upcoming-draft advice based on tendencies and blind spots shown in the data",
  "honestVerdict": "1-2 sentences of honest, direct assessment of where this manager stands relative to the league data and what separates them from sustained title contention"
}`;
}

function syntheticCareer(): OwnerCareerProfile {
  const s1: OwnerCareerProfile["seasons"][0] = {
    season: 2024,
    teamName: "Test FC",
    wins: 8,
    losses: 6,
    pf: 1788.2,
    playoffSeed: 4,
    madePlayoffs: true,
    isChampion: false,
    acquisitions: 20,
    drops: 18,
    trades: 3,
  };
  return {
    memberId: "m-test",
    leagueId: "999",
    ownerName: "Alex Manager",
    teamNames: ["Test FC"],
    seasons: [s1],
    totalWins: 8,
    totalLosses: 6,
    winPct: 57.1,
    seasonsActive: 1,
    yearMin: 2024,
    yearMax: 2024,
    championships: 0,
    playoffAppearances: 1,
    playoffSummaries: ["2024 #4 seed"],
    bestSeason: s1,
    worstSeason: s1,
    totalDraftPicks: 15,
    positionPickCounts: { RB: 6, WR: 5, QB: 2, TE: 2 },
    round1ByPosition: { RB: 1 },
    round1PickSeasons: 1,
    draftStyleHint: "RB-first lean in round 1.",
    keeperHistoryLines: [],
    roundOneNotables: ["2024: Player One (RB) — round 1"],
    avgAcquisitions: 20,
    avgDrops: 18,
    avgTrades: 3,
    mostActiveSeasonNote: "2024 (20 adds, 3 trades) — 8-6",
    quietestSeasonNote: "2024 (20 adds, 3 trades) — 8-6",
  };
}

async function main() {
  const uidArg = process.argv[2];
  const synthetic = syntheticCareer();
  const synFacts = formatOwnerCareerProfileFactsBlock(synthetic);
  assert(!/NaN|undefined|Infinity/i.test(synFacts), "synthetic facts block");
  assert(synFacts.includes("8W–6L"), "synthetic should include record");

  const synPrompt = buildSelfReviewUserPrompt(
    synthetic,
    "this league (12-team PPR keeper league)",
    "3-season league (2022-2024)",
  );
  assertNoLegacyMarkers("synthetic+descriptor", synPrompt);
  assertNoLegacyMarkers("synthetic facts only", synFacts);

  if (!uidArg || !/^\d+$/.test(uidArg)) {
    console.log("OK: synthetic C9 prompt/facts validation passed.");
    console.log("Skip live DB/cache check: pass numeric userId as argv[1], e.g. npx tsx scripts/validate-c9-owner-self-review.ts 42");
    return;
  }

  const userId = Number(uidArg);
  const career = await buildOwnerCareerProfileForFocalUser(userId);
  if (!career) {
    console.log("RESULT: PRECONDITION_FAILED (no focal profile or no cache rows for member in active league)");
    return;
  }

  const promptCtx = await resolveLeaguePromptContext(userId, career.yearMax);
  const { leagueDescriptor, historyClause } = buildLeaguePromptContext(promptCtx);
  const userPrompt = buildSelfReviewUserPrompt(career, leagueDescriptor, historyClause);

  assertNoLegacyMarkers("live assembled user prompt", userPrompt);
  assertNoLegacyMarkers("live facts block", formatOwnerCareerProfileFactsBlock(career));

  const descLower = leagueDescriptor.toLowerCase();
  if (descLower.includes("atlantas finest")) {
    console.log("NOTE: leagueDescriptor contains ATLANTAS FINEST — OK when ESPN/cache league name is that string.");
  }

  console.log("OK: live user", userId, "— career seasons:", career.seasonsActive, "prompt length:", userPrompt.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
