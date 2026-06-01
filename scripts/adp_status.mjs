import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [cols] = await conn.query("SHOW COLUMNS FROM gm_player_registry");
console.log('COLUMNS:', JSON.stringify(cols.map(c => c.Field)));

const [[total]] = await conn.query("SELECT COUNT(*) AS n FROM gm_player_registry");
console.log('TOTAL_ROWS:', total.n);

const [[adpPop]] = await conn.query("SELECT COUNT(*) AS n FROM gm_player_registry WHERE adp IS NOT NULL AND adp <> '' AND adp <> '0'");
console.log('ADP_POPULATED:', adpPop.n);

const [byPos] = await conn.query("SELECT position, COUNT(*) AS total, SUM(CASE WHEN adp IS NOT NULL AND adp <> '' AND adp <> '0' THEN 1 ELSE 0 END) AS withAdp FROM gm_player_registry GROUP BY position ORDER BY total DESC");
console.log('BY_POSITION:', JSON.stringify(byPos));

const [sample] = await conn.query("SELECT fullName, position, adp FROM gm_player_registry WHERE adp IS NOT NULL AND adp <> '' AND adp <> '0' ORDER BY CAST(adp AS DECIMAL(10,2)) ASC LIMIT 15");
console.log('TOP_ADP_SAMPLE:', JSON.stringify(sample));

const [brock] = await conn.query("SELECT fullName, position, adp FROM gm_player_registry WHERE fullName LIKE '%Bowers%'");
console.log('BROCK:', JSON.stringify(brock));

await conn.end();
