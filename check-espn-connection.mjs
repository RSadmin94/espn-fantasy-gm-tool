import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.query(`
SELECT
  id,
  provider,
  leagueId,
  isActive,
  leagueName,
  updatedAt
FROM league_connections
WHERE provider = 'espn'
`);

console.log(rows);

await conn.end();