/**
 * Entitlement gate validation — free vs Pro API payloads.
 * Usage: npx tsx scripts/_validate_entitlement_gates.mts
 */
import {
  gateNotoriousTradesReport,
  gateRivalryStoryPair,
  gateRivalryStoryReceipts,
  gateRivalryStoryStatements,
} from "../server/leagueIntelGating.ts";

type Result = { name: string; pass: boolean; detail: string };

const results: Result[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
}

const sampleStory = {
  focalOwnerKey: "id:focal",
  rivalOwnerKey: "id:rival",
  tier: "legendary",
  headline: {
    key: "THREE_ELIMINATIONS",
    confidence: 0.95,
    receiptIds: ["gm:2016:15", "gm:2021:16", "gm:2023:15"],
  },
  documentaryFacts: [
    { factKey: "PLAYOFF_ELIMINATION", supportingGameIds: ["gm:2016:15"], confidence: 0.9 },
  ],
  availableBlocks: ["coldOpen", "taleOfTape", "turningPoint", "playoffWar"],
} as const;

const fullStatements = [
  {
    statementKey: "THREE_ELIMINATIONS_LEAD",
    block: "coldOpen",
    priority: 100,
    text: "Marlon has ended Rod's season 3 times.",
    receiptIds: ["gm:2016:15", "gm:2021:16", "gm:2023:15"],
    factKeys: ["PLAYOFF_ELIMINATION"],
    confidence: 0.95,
  },
  {
    statementKey: "CAREER_RECORD",
    block: "taleOfTape",
    priority: 50,
    text: "Career: 6–6.",
    receiptIds: ["gm:2024:1"],
    factKeys: [],
    confidence: 0.9,
  },
  {
    statementKey: "PLAYOFF_RECORD",
    block: "taleOfTape",
    priority: 40,
    text: "Playoffs: 1–4.",
    receiptIds: ["gm:2023:15"],
    factKeys: ["PLAYOFF_MEETING"],
    confidence: 0.85,
  },
] as const;

const fullReceipts = [
  {
    receiptId: "gm:2016:15",
    type: "game",
    season: 2016,
    isPlayoff: true,
    focalOwnerKey: "id:focal",
    rivalOwnerKey: "id:rival",
    factKeys: ["PLAYOFF_ELIMINATION"],
    source: "gmMatchups",
  },
  {
    receiptId: "gm:2021:16",
    type: "game",
    season: 2021,
    isPlayoff: true,
    focalOwnerKey: "id:focal",
    rivalOwnerKey: "id:rival",
    factKeys: ["PLAYOFF_ELIMINATION"],
    source: "gmMatchups",
  },
] as const;

const fullNotorious = {
  biggestValueGap: { margin: 245, receiptText: "Rod won by 245" },
  mostLopsided: { margin: 245 },
  closestFairTrade: { margin: 12 },
  biggestPickOnlyGap: { margin: 180 },
  biggestPlayerTrade: null,
  biggestMixedTrade: null,
  mostActivePair: {
    ownerAKey: "id:a",
    ownerBKey: "id:b",
    ownerAName: "Rod",
    ownerBName: "Sheldon",
    count: 2,
  },
  mostSuccessfulOwner: { ownerKey: "id:a", ownerName: "Rod", wins: 2, netValue: 348 },
  rankedByMargin: [{ margin: 245 }, { margin: 180 }, { margin: 90 }],
} as const;

// ── 1. Free user cannot retrieve full documentary script ─────────────────────
{
  const free = gateRivalryStoryStatements(
    "id:focal",
    "id:rival",
    [...fullStatements],
    false,
  );
  const onlyColdOpen =
    free.statements.length <= 1 &&
    free.statements.every((s) => s.block === "coldOpen") &&
    free.statements.every((s) => s.receiptIds.length === 0) &&
    free.lockedStatements >= fullStatements.length - 1;
  check(
    "Free user cannot retrieve full documentary script",
    onlyColdOpen && free.gated === true,
    `statements=${free.statements.length}, blocks=${free.statements.map((s) => s.block).join(",")}, locked=${free.lockedStatements}`,
  );
}

// ── 2. Free user cannot retrieve receipt evidence ────────────────────────────
{
  const freePair = gateRivalryStoryPair(sampleStory as any, false);
  const freeReceipts = gateRivalryStoryReceipts(
    "id:focal",
    "id:rival",
    [...fullReceipts] as any,
    false,
  );
  const blocked =
    freePair.documentaryFacts.length === 0 &&
    freePair.headline.receiptIds.length === 0 &&
    freeReceipts.receipts.length === 0 &&
    freeReceipts.gated === true;
  check(
    "Free user cannot retrieve receipt evidence",
    blocked,
    `facts=${freePair.documentaryFacts.length}, headlineReceipts=${freePair.headline.receiptIds.length}, receipts=${freeReceipts.receipts.length}`,
  );
}

// ── 3. Free user cannot retrieve full notorious trade ranking ────────────────
{
  const free = gateNotoriousTradesReport(fullNotorious as any, false);
  const blocked =
    free.rankedByMargin.length === 0 &&
    free.biggestValueGap === null &&
    free.mostLopsided === null &&
    free.mostActivePair === null &&
    free.tradeCount === fullNotorious.rankedByMargin.length &&
    free.gated === true;
  check(
    "Free user cannot retrieve full notorious trade ranking",
    blocked,
    `tradeCount=${free.tradeCount}, ranked=${free.rankedByMargin.length}, headline=${free.biggestValueGap === null}`,
  );
}

// ── 4. Pro user still gets full responses ────────────────────────────────────
{
  const proStatements = gateRivalryStoryStatements(
    "id:focal",
    "id:rival",
    [...fullStatements],
    true,
  );
  const proPair = gateRivalryStoryPair(sampleStory as any, true);
  const proReceipts = gateRivalryStoryReceipts(
    "id:focal",
    "id:rival",
    [...fullReceipts] as any,
    true,
  );
  const proNotorious = gateNotoriousTradesReport(fullNotorious as any, true);

  const full =
    proStatements.statements.length === fullStatements.length &&
    proStatements.statements.some((s) => s.block === "taleOfTape") &&
    proStatements.statements[0]?.receiptIds.length > 0 &&
    proPair.documentaryFacts.length > 0 &&
    proPair.headline.receiptIds.length > 0 &&
    proPair.availableBlocks.includes("turningPoint") &&
    proReceipts.receipts.length === fullReceipts.length &&
    proNotorious.rankedByMargin.length === fullNotorious.rankedByMargin.length &&
    proNotorious.biggestValueGap?.margin === 245 &&
    proStatements.gated === false &&
    proNotorious.gated === false;

  check(
    "Pro user still gets full responses",
    full,
    `statements=${proStatements.statements.length}, receipts=${proReceipts.receipts.length}, ranked=${proNotorious.rankedByMargin.length}`,
  );
}

// ── 5. UI still shows one Cold Open teaser (static contract) ─────────────────
{
  // GatedRivalryDossierTeaser reads rivalryStory.statements and renders
  // topColdOpenStatement() — one Cold Open block only. Server gate guarantees
  // at most one coldOpen statement with stripped receiptIds for free users.
  const free = gateRivalryStoryStatements(
    "id:focal",
    "id:rival",
    [...fullStatements],
    false,
  );
  const uiPayload =
    free.statements.length === 1 &&
    free.statements[0]?.block === "coldOpen" &&
    typeof free.statements[0]?.text === "string" &&
    free.statements[0].text.length > 0;
  check(
    "UI still shows one Cold Open teaser",
    uiPayload,
    `coldOpen="${free.statements[0]?.text ?? "(none)"}"`,
  );
}

// ── Report ───────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.pass).length;
console.log("\n=== Entitlement Gate Validation ===\n");
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
  console.log(`       ${r.detail}\n`);
}
console.log(`Summary: ${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exit(1);
