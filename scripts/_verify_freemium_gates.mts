/**
 * Freemium gate verification — simulates free-user payloads (entitled=false).
 * Usage: npx tsx scripts/_verify_freemium_gates.mts
 */
import {
  gateCareerReport,
  gateChampionshipPath,
  gateHallOfFame,
  gateNotoriousTradesReport,
  gatePlayoffPositionSplit,
  gateRivalryDossier,
  gateRivalryStoryPair,
  gateRivalryStoryReceipts,
  gateRivalryStoryStatements,
  gateTradeAnalyzeResult,
} from "../server/leagueIntelGating.ts";

type Check = { name: string; pass: boolean; detail: string };

const checks: Check[] = [];

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
}

// ── Trade Analyzer ───────────────────────────────────────────────────────────
{
  const full = {
    totalA: 100,
    totalB: 88,
    pickValueA: 0,
    pickValueB: 12,
    ratio: 1.14,
    fairnessGrade: "SLIGHT EDGE A",
    leagueFormat: "redraft",
    formatSource: "espn",
    requiresFormatDisclaimer: false,
    disclaimers: [],
    sideAValues: [{ playerId: 1, compositeValue: 50 }],
    sideBValues: [{ playerId: 2, compositeValue: 40 }],
    aiVerdict: "Team A wins",
    mathSummary: "secret math",
    teamANeeds: { QB: 2 },
    teamBNeeds: { RB: 3 },
    tradeIntelligence: { verdict: { verdict: "WIN" }, splitVerdict: {} },
  };
  const free = gateTradeAnalyzeResult(full, false);
  const keys = Object.keys(free);
  const allowed = new Set([
    "totalA",
    "totalB",
    "pickValueA",
    "pickValueB",
    "ratio",
    "fairnessGrade",
    "leagueFormat",
    "formatSource",
    "requiresFormatDisclaimer",
    "disclaimers",
    "gated",
    "entitled",
  ]);
  const leaked = keys.filter((k) => !allowed.has(k));
  record(
    "Trade Analyzer — free payload keys only",
    leaked.length === 0 && free.gated === true,
    leaked.length ? `Leaked keys: ${leaked.join(", ")}` : "Only WHO fields returned",
  );
  record(
    "Trade Analyzer — no pro fields in free payload",
    !("aiVerdict" in free) && !("tradeIntelligence" in free) && !("sideAValues" in free),
    JSON.stringify({ hasAi: "aiVerdict" in free, hasTi: "tradeIntelligence" in free }),
  );
}

// ── Rivalry Dossier ──────────────────────────────────────────────────────────
{
  const dossier = {
    opponents: [{ opponentOwnerKey: "a", wins: 10, losses: 5 }],
    pairDetail: { timeline: [{ season: 2020 }], heartbreaks: 3 },
  };
  const gated = gateRivalryDossier(dossier, false);
  record(
    "Rivalry Dossier — opponents/pairDetail emptied",
    Array.isArray(gated.opponents) &&
      gated.opponents.length === 0 &&
      gated.pairDetail === null &&
      gated.gated === true,
    `opponents=${gated.opponents.length}, pairDetail=${gated.pairDetail}`,
  );
}

// ── Hall of Fame ─────────────────────────────────────────────────────────────
{
  const hof = {
    championships: [{ owner: "Rod", titles: 2 }],
    ownerRecords: [{ rank: 1 }],
    singleGameRecords: { highestPf: { available: true, value: 200 } },
    rivalryRecords: { longestStreak: { available: true, value: 8 } },
    seasonRecords: { bestSeason: { available: true, value: 15 } },
  };
  const gated = gateHallOfFame(hof as any, false);
  const deepLocked =
    (gated.singleGameRecords as any).highestPf?.available === false &&
    (gated.rivalryRecords as any).longestStreak?.available === false &&
    (gated.seasonRecords as any).bestSeason?.available === false;
  const identityIntact = (gated as any).championships?.length === 1;
  record(
    "League History — identity free, deep archives locked",
    deepLocked && identityIntact && gated.gated === true,
    `deepLocked=${deepLocked}, identity=${identityIntact}`,
  );
}

// ── Championship Diagnosis (career + path) ───────────────────────────────────
{
  const report = {
    topReasons: [
      { id: "1", headline: "A", detail: "d1", severity: 90 },
      { id: "2", headline: "B", detail: "d2", severity: 80 },
    ],
    patterns: [{ id: "p1" }],
    readiness: { score: 55, tier: "Contender", positional: [], components: [], topActions: ["act"] },
    titlePath: { currentScore: 70, moves: [{ rank: 1, title: "Fix RB" }], summary: "path" },
    careerStory: "full story",
    snapshot: { titles: 0, seasonsPlayed: 10 },
  } as any;
  const gated = gateCareerReport(report, false);
  record(
    "Championship Diagnosis — career teaser (1 reason, no readiness)",
    gated.topReasons.length === 1 &&
      gated.readiness === null &&
      gated.titlePath.moves.length === 0 &&
      gated.gated === true,
    `reasons=${gated.topReasons.length}, readiness=${gated.readiness}, moves=${gated.titlePath.moves.length}`,
  );

  const path = {
    recommendedActions: [{ text: "draft WR" }],
    topImprovements: [{ area: "RB" }],
    positionGaps: [{ position: "RB", gap: 5 }],
    closestChampion: { ownerName: "X", similarity: 80 },
    narrative: "full path",
    oneThingHeadline: "Fix RB",
    championshipProfile: { available: true, positions: ["RB"], seasons: [], combined: {} },
    titlePathScore: 60,
    confidence: "High",
    ownerName: "Rod",
    teamCount: 14,
  } as any;
  const gatedPath = gateChampionshipPath(path, false);
  record(
    "Championship Diagnosis — path plan redacted",
    gatedPath.recommendedActions.length === 0 &&
      gatedPath.positionGaps.length === 0 &&
      gatedPath.closestChampion === null &&
      gatedPath.gated === true,
    `actions=${gatedPath.recommendedActions.length}, gaps=${gatedPath.positionGaps.length}`,
  );

  const playoff = {
    leagueId: "1",
    ownerKey: "k",
    ownerName: "Rod",
    isSetupComplete: true,
    available: true,
    reason: null,
    coverageSeasons: [2021],
    playoffSeasonsForOwner: [2021],
    positions: [{ position: "RB", verdict: "disappeared", playoffAvg: 8 }],
    overall: { playoffPF: 99, regularPF: 110, championFullPF: 120, championPlayoffPF: 115, headline: "Fell short" },
    narrative: "playoff story",
    confidence: "High" as const,
  };
  const gatedPlayoff = gatePlayoffPositionSplit(playoff, false);
  record(
    "Championship Diagnosis — playoff split redacted",
    gatedPlayoff.positions.length === 0 && gatedPlayoff.available === false && gatedPlayoff.gated === true,
    `positions=${gatedPlayoff.positions.length}, available=${gatedPlayoff.available}`,
  );
}

// ── Rivalry Documentary (server gates) ───────────────────────────────────────
{
  const story = {
    focalOwnerKey: "a",
    rivalOwnerKey: "b",
    tier: "legendary",
    headline: { key: "THREE_ELIMINATIONS", confidence: 0.9, receiptIds: ["gm:1", "gm:2", "gm:3"] },
    documentaryFacts: [{ factKey: "PLAYOFF_ELIMINATION", supportingGameIds: ["gm:1"], confidence: 0.9 }],
    availableBlocks: ["coldOpen", "taleOfTape", "turningPoint"],
  } as any;
  const gatedPair = gateRivalryStoryPair(story, false);
  record(
    "Rivalry pair — teaser metadata only",
    gatedPair.documentaryFacts.length === 0 &&
      gatedPair.headline.receiptIds.length === 0 &&
      !gatedPair.availableBlocks.includes("turningPoint") &&
      gatedPair.availableBlocks.includes("coldOpen"),
    `facts=${gatedPair.documentaryFacts.length}, blocks=${gatedPair.availableBlocks.join(",")}`,
  );

  const gatedReceipts = gateRivalryStoryReceipts("a", "b", [{ receiptId: "gm:1" }] as any, false);
  record(
    "Rivalry receipts — empty for free",
    gatedReceipts.receipts.length === 0 && gatedReceipts.gated === true,
    `receipts=${gatedReceipts.receipts.length}`,
  );

  const statements = [
    { statementKey: "THREE_ELIMINATIONS_LEAD", block: "coldOpen", priority: 100, text: "Teaser", receiptIds: ["gm:1"], factKeys: [], confidence: 0.9 },
    { statementKey: "CAREER_RECORD", block: "taleOfTape", priority: 50, text: "Secret", receiptIds: [], factKeys: [], confidence: 0.8 },
  ] as any;
  const gatedStatements = gateRivalryStoryStatements("a", "b", statements, false);
  record(
    "Rivalry statements — cold open only",
    gatedStatements.statements.length === 1 &&
      gatedStatements.statements[0]?.block === "coldOpen" &&
      gatedStatements.statements[0]?.receiptIds.length === 0 &&
      gatedStatements.lockedStatements === 1,
    `statements=${gatedStatements.statements.length}, locked=${gatedStatements.lockedStatements}`,
  );
}

// ── Notorious Trades (server gate) ───────────────────────────────────────────
{
  const report = {
    biggestValueGap: { margin: 100 },
    mostLopsided: { margin: 90 },
    closestFairTrade: null,
    biggestPickOnlyGap: null,
    biggestPlayerTrade: null,
    biggestMixedTrade: null,
    mostActivePair: { count: 2 },
    mostSuccessfulOwner: { netValue: 200 },
    rankedByMargin: [{ margin: 100 }, { margin: 90 }],
  } as any;
  const gated = gateNotoriousTradesReport(report, false);
  record(
    "Notorious trades — count-only for free",
    gated.tradeCount === 2 &&
      gated.rankedByMargin.length === 0 &&
      gated.biggestValueGap === null &&
      gated.gated === true,
    `tradeCount=${gated.tradeCount}, ranked=${gated.rankedByMargin.length}`,
  );
}

// ── Report ───────────────────────────────────────────────────────────────────
const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass);

console.log("\n=== Freemium Gate Verification ===\n");
for (const c of checks) {
  console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
  console.log(`       ${c.detail}\n`);
}
console.log(`Summary: ${passed}/${checks.length} checks passed`);
if (failed.length) {
  console.log("\nFailed checks:");
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
