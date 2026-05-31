import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query("SELECT payload FROM espn_raw_cache WHERE leagueId='457622' AND viewName='combined' AND season=2026 LIMIT 1");
const data = JSON.parse(rows[0].payload);
const items = data.settings.scoringSettings.scoringItems;
console.log("TOTAL ITEMS:", items.length);
console.log("SCORING_TYPE:", data.settings.scoringSettings.scoringType);
console.log("PPR:", data.settings.scoringSettings.playerRankType);
const STAT = {0:"passingYards_perYd",3:"passing300plusBonus",4:"passing400plusBonus",
  19:"passing2ptConv",20:"passingIncompletions",21:"passingAttempts",22:"passingCompletions",
  23:"passingYdsPerAtt",26:"passingYards_alt",35:"rushingTD",36:"passingTD",
  37:"rushing2ptConv",38:"receivingYards_perYd",40:"receptions",41:"targets",
  45:"receivingTD",46:"rushingTD_alt",47:"receivingYards_alt",50:"kickReturnYards",
  51:"kickReturnTD",52:"puntReturnYards",53:"puntReturnTD",54:"fumbleLost",
  55:"fumblesRecovered",56:"fumblesTotal",57:"intThrown",58:"2ptConversion",
  68:"defSacks",72:"defInterceptions",73:"defFumblesRec",74:"defTD",75:"defSafeties",
  76:"defBlockedKickTD",83:"defPts_0",84:"defPts_1_6",85:"defPts_7_13",
  86:"defPts_14_17",88:"defPts_18_27",89:"defPts_28_34",90:"defPts_35plus",
  102:"kickPAT",103:"kickFG_0_19",104:"kickFG_20_29",105:"kickFG_30_39",
  106:"kickFG_40_49",107:"kickFG_50plus",108:"kickFGMissed",122:"kickPATMissed",
  123:"passingYards_per10"
};
console.log("=== FULL SCORING ITEMS ===");
for (const i of items) {
  const n = STAT[i.statId] || "statId_"+i.statId;
  console.log(`${n} (${i.statId}): ${i.points} pts${i.pointsOverrides?" override="+JSON.stringify(i.pointsOverrides):""}`);
}
await conn.end();
