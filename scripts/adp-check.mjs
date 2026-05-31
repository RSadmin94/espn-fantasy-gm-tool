import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
// What columns do we have?
const [cols] = await conn.query(`SHOW COLUMNS FROM roster_entries`);
console.log("Columns:", cols.map(c => c.Field).join(", "));
// gm_player_registry columns
const [pcols] = await conn.query(`SHOW COLUMNS FROM gm_player_registry`);
console.log("Registry cols:", pcols.map(c => c.Field).join(", "));
// Sample registry rows with any ownership-like fields
const [reg] = await conn.query(`SELECT * FROM gm_player_registry LIMIT 3`);
console.log("Registry sample:", JSON.stringify(reg[0]));
await conn.end();
