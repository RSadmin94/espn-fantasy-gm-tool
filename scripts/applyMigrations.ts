import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL!);
console.log("Connected to Railway MySQL");

const statements = [
  `CREATE TABLE IF NOT EXISTS \`gm_player_registry\` (
    \`id\`               BIGINT       NOT NULL AUTO_INCREMENT,
    \`espnPlayerId\`     VARCHAR(50)  NULL,
    \`sleeperPlayerId\`  VARCHAR(50)  NULL,
    \`fullName\`         VARCHAR(100) NOT NULL,
    \`normalizedName\`   VARCHAR(100) NOT NULL,
    \`position\`         VARCHAR(10)  NOT NULL DEFAULT '',
    \`currentNflTeam\`   VARCHAR(3)   NULL,
    \`firstSeasonSeen\`  INT          NULL,
    \`lastSeasonSeen\`   INT          NULL,
    \`isActive\`         TINYINT(1)   NOT NULL DEFAULT 1,
    \`needsReview\`      TINYINT(1)   NOT NULL DEFAULT 0,
    \`reviewReason\`     VARCHAR(255) NULL,
    \`createdAt\`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`uq_gm_player_registry_espn\`    ON \`gm_player_registry\` (\`espnPlayerId\`)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`uq_gm_player_registry_sleeper\` ON \`gm_player_registry\` (\`sleeperPlayerId\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_gm_player_registry_norm\`     ON \`gm_player_registry\` (\`normalizedName\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_gm_player_registry_position\` ON \`gm_player_registry\` (\`position\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_gm_player_registry_active\`   ON \`gm_player_registry\` (\`isActive\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_gm_player_registry_review\`   ON \`gm_player_registry\` (\`needsReview\`)`,
  `CREATE TABLE IF NOT EXISTS \`gm_weekly_player_stats\` (
    \`id\`               BIGINT         NOT NULL AUTO_INCREMENT,
    \`playerId\`         BIGINT         NOT NULL,
    \`season\`           INT            NOT NULL,
    \`week\`             INT            NOT NULL,
    \`pointsScored\`     DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    \`rosterSlotId\`     INT            NOT NULL DEFAULT 0,
    \`isStarter\`        TINYINT(1)     NOT NULL DEFAULT 0,
    \`ownerKey\`         VARCHAR(50)    NOT NULL,
    \`teamId\`           INT            NULL,
    \`source\`           VARCHAR(50)    NOT NULL DEFAULT 'espn',
    \`sourceConfidence\` DECIMAL(5,2)   NOT NULL DEFAULT 100.00,
    \`needsReview\`      TINYINT(1)     NOT NULL DEFAULT 0,
    \`reviewReason\`     VARCHAR(255)   NULL,
    \`createdAt\`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`uq_gm_wps\`               ON \`gm_weekly_player_stats\` (\`playerId\`, \`season\`, \`week\`, \`ownerKey\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_gm_wps_season_player\`       ON \`gm_weekly_player_stats\` (\`season\`, \`playerId\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_gm_wps_owner_season\`        ON \`gm_weekly_player_stats\` (\`ownerKey\`, \`season\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_gm_wps_season_week\`         ON \`gm_weekly_player_stats\` (\`season\`, \`week\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_gm_wps_team_season\`         ON \`gm_weekly_player_stats\` (\`teamId\`, \`season\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_gm_wps_review\`              ON \`gm_weekly_player_stats\` (\`needsReview\`)`,
];

let ok = 0, skipped = 0;
for (const stmt of statements) {
  try {
    await conn.query(stmt);
    process.stdout.write(".");
    ok++;
  } catch (e: any) {
    // Already exists or duplicate index = normal
    if (e.code === "ER_TABLE_EXISTS_ERROR" || e.code === "ER_DUP_KEYNAME" || e.message?.includes("already exists")) {
      process.stdout.write("s");
      skipped++;
    } else {
      console.log(`\nERR: ${e.message}`);
      skipped++;
    }
  }
}

// Verify tables exist
const [tables] = await conn.query(`SHOW TABLES LIKE 'gm_%'`);
await conn.end();

console.log(`\n\n✓ ${ok} statements applied, ${skipped} skipped`);
console.log("Tables found:");
for (const row of tables as any[]) {
  console.log("  ", Object.values(row)[0]);
}
