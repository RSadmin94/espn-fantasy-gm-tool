import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Add ADP and percentOwned columns to gm_player_registry
try {
  await conn.query(`ALTER TABLE gm_player_registry ADD COLUMN adp FLOAT NULL COMMENT 'ESPN average draft position'`);
  console.log("✓ adp column added");
} catch(e) { console.log("adp already exists:", e.message); }

try {
  await conn.query(`ALTER TABLE gm_player_registry ADD COLUMN percentOwned FLOAT NULL COMMENT 'ESPN percent owned'`);
  console.log("✓ percentOwned column added");
} catch(e) { console.log("percentOwned already exists:", e.message); }

try {
  await conn.query(`ALTER TABLE gm_player_registry ADD COLUMN auctionValue FLOAT NULL COMMENT 'ESPN auction value average'`);
  console.log("✓ auctionValue column added");
} catch(e) { console.log("auctionValue already exists:", e.message); }

// Confirm schema
const [cols] = await conn.query(`SHOW COLUMNS FROM gm_player_registry`);
console.log("Columns:", cols.map(c => c.Field).join(", "));

await conn.end();
