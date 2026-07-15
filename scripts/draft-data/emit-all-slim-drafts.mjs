/**
 * Writes slim `scripts/draft-data/YYYY.json` files:
 * { "season", "leagueId", "picks": [{ overallPick, round, roundPick, teamName, playerName, position, nflTeam }] }
 *
 * Run from repo root: node scripts/draft-data/emit-all-slim-drafts.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build2010DraftDocument } from "./build2010DraftDocument.mjs";
import { generateSlimSnakeDraft } from "./leagueSnakeGenerator.mjs";
import { STAR_BOARDS } from "./historicalStarBoards.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEAGUE_ID = "457622";

function slimFrom2010Builder() {
  const full = build2010DraftDocument();
  return {
    season: 2010,
    leagueId: full.leagueId,
    picks: full.picks.map(p => ({
      overallPick: p.overallPick,
      round: p.round,
      roundPick: p.roundPick,
      teamName: p.teamName,
      playerName: p.playerName,
      position: p.position,
      nflTeam: p.nflTeam,
    })),
  };
}

const out2010 = join(__dirname, "2010.json");
const doc2010 = slimFrom2010Builder();
writeFileSync(out2010, JSON.stringify(doc2010, null, 2), "utf8");
console.log(`Wrote 2010.json (${doc2010.picks.length} picks)`);

for (const yr of [2011, 2012, 2013, 2014, 2015, 2017]) {
  const board = STAR_BOARDS[yr];
  if (!board) throw new Error(`Missing STAR_BOARDS[${yr}]`);
  const doc = generateSlimSnakeDraft(yr, LEAGUE_ID, board);
  const dest = join(__dirname, `${yr}.json`);
  writeFileSync(dest, JSON.stringify(doc, null, 2), "utf8");
  console.log(`Wrote ${yr}.json (${doc.picks.length} picks)`);
}
