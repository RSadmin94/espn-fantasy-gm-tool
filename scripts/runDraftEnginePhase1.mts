/**
 * Phase 1 — build Choice Ledger and print sample Bruce records.
 * Usage: pnpm exec tsx scripts/runDraftEnginePhase1.mts [leagueId]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEAGUE_ID = process.argv[2] ?? "457622";

const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const env = fs.readFileSync(envPath, "utf8");
  const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) {
    process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
}

const { getDb } = await import("../server/db.ts");
const { proposedActiveProfileKeySet, BRUCE_PROFILE_OWNER_KEY } = await import("../server/draftEngine/activeOwners.ts");
const { loadChoiceLedgerInputs } = await import("../server/draftEngine/phase1/loadChoiceLedgerInputs.ts");
const {
  buildChoiceLedger,
  choiceRecordsForOwner,
  formatChoiceRecordPlain,
} = await import("../server/draftEngine/phase1/choiceLedger.ts");

const db = await getDb();
if (!db) {
  console.error("No database connection");
  process.exit(1);
}

const { shared, draftRows } = await loadChoiceLedgerInputs({ db, leagueId: LEAGUE_ID });
const ledger = buildChoiceLedger({
  leagueId: LEAGUE_ID,
  draftRows,
  allLeagueTeams: shared.allLeagueTeams,
  activeProfileKeys: proposedActiveProfileKeySet(),
});

console.log(`Choice Ledger — league ${LEAGUE_ID}`);
console.log(
  `${ledger.stats.openChoiceEvents} choice events across ${ledger.stats.seasons} seasons (${ledger.stats.activeChooserChoices} active chooser, ${ledger.stats.departedChooserChoices} departed context)`,
);
console.log("");

const bruceRecords = choiceRecordsForOwner(ledger, BRUCE_PROFILE_OWNER_KEY);
const samples = [
  ...bruceRecords.filter((r) => r.season >= 2023).slice(-8),
  ...bruceRecords.filter((r) => r.round === 1).slice(-3),
]
  .filter((r, i, arr) => arr.findIndex((x) => x.overallPick === r.overallPick && x.season === r.season) === i)
  .slice(0, 10);

console.log(`Bruce Edwards — ${bruceRecords.length} lifetime choice records (showing ${samples.length}):`);
for (const rec of samples) {
  console.log(`• ${formatChoiceRecordPlain(rec)}`);
}

const outJson = path.join(ROOT, "scripts", `_draft_engine_phase1_${LEAGUE_ID}.json`);
fs.writeFileSync(
  outJson,
  JSON.stringify(
    {
      stats: ledger.stats,
      bruceSample: samples.map((r) => ({
        ...r,
        availableCount: r.availableSet.length,
        availableSet: undefined,
      })),
    },
    null,
    2,
  ),
);
console.log(`\nWrote ${outJson}`);
