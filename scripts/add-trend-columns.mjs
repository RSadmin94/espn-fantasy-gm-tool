import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Adds trend/change + rank columns to gm_player_registry.
// adp, percentOwned, auctionValue already exist.
try {
  await conn.query(`ALTER TABLE gm_player_registry ADD COLUMN adpChange FLOAT NULL COMMENT 'ESPN ADP percent change (trend)'`);
  console.log("OK adpChange column added");
} catch (e) { console.log("adpChange:", e.message); }

try {
  await conn.query(`ALTER TABLE gm_player_registry ADD COLUMN espnRank INT NULL COMMENT 'ESPN draft rank (PPR/STD)'`);
  console.log("OK espnRank column added");
} catch (e) { console.log("espnRank:", e.message); }

const [cols] = await conn.query(`SHOW COLUMNS FROM gm_player_registry`);
console.log("COLUMNS:", cols.map(c => c.Field).join(", "));
await conn.end();
