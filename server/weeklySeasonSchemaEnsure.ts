/**
 * Idempotent weekly-season schema ensure. Preview DBs may not have 0037/0038 applied.
 * Does not assign unattributed rows to 457622.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";

function errorText(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur; i++) {
    if (cur instanceof Error) {
      const extra = cur as Error & { sqlMessage?: string; code?: string; errno?: number };
      parts.push(cur.message, extra.sqlMessage ?? "", String(extra.code ?? ""), String(extra.errno ?? ""));
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return parts.join(" ");
}

export function isBenignSchemaError(e: unknown): boolean {
  const msg = errorText(e);
  return /Duplicate column|already exists|Duplicate key name|ER_DUP_FIELDNAME|ER_TABLE_EXISTS_ERROR|\b1060\b|\b1050\b/i.test(msg);
}

export async function ensureWeeklySeasonSchema(): Promise<string[]> {
  const db = await getDb();
  if (!db) return ["database unavailable"];
  const notes: string[] = [];

  const run = async (label: string, query: string) => {
    try {
      await db.execute(sql.raw(query));
    } catch (e) {
      if (!isBenignSchemaError(e)) notes.push(`${label} failed: ${errorText(e).slice(0, 240)}`);
    }
  };

  await run(
    "weekly_player_stats",
    `CREATE TABLE IF NOT EXISTS \`weekly_player_stats\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`season\` int NOT NULL,
      \`week\` int NOT NULL,
      \`playerId\` int NOT NULL,
      \`playerName\` varchar(128) NOT NULL,
      \`position\` varchar(8) NOT NULL,
      \`proTeam\` varchar(8) NOT NULL DEFAULT '?',
      \`teamId\` int NULL,
      \`ownerName\` varchar(128) NULL,
      \`targets\` int DEFAULT 0,
      \`receptions\` int DEFAULT 0,
      \`receivingYards\` int DEFAULT 0,
      \`receivingTDs\` int DEFAULT 0,
      \`rushingAttempts\` int DEFAULT 0,
      \`rushingYards\` int DEFAULT 0,
      \`rushingTDs\` int DEFAULT 0,
      \`passingAttempts\` int DEFAULT 0,
      \`completions\` int DEFAULT 0,
      \`passingYards\` int DEFAULT 0,
      \`passingTDs\` int DEFAULT 0,
      \`interceptions\` int DEFAULT 0,
      \`snapCount\` int DEFAULT 0,
      \`snapPct\` int DEFAULT 0,
      \`fantasyPoints\` int DEFAULT 0,
      \`leagueId\` varchar(32) NOT NULL DEFAULT 'unattributed',
      \`fetchedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_wps_league_week_player\` (\`leagueId\`, \`season\`, \`week\`, \`playerId\`)
    )`,
  );

  await run("weekly_storylines.leagueId", "ALTER TABLE `weekly_storylines` ADD COLUMN `leagueId` varchar(32) NOT NULL DEFAULT 'unattributed'");
  await run("fear_index.leagueId", "ALTER TABLE `fear_index` ADD COLUMN `leagueId` varchar(32) NOT NULL DEFAULT 'unattributed'");
  await run("weekly_player_stats.leagueId", "ALTER TABLE `weekly_player_stats` ADD COLUMN `leagueId` varchar(32) NOT NULL DEFAULT 'unattributed'");

  await run(
    "weekly_season_packs",
    `CREATE TABLE IF NOT EXISTS \`weekly_season_packs\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`leagueId\` varchar(32) NOT NULL,
      \`season\` int NOT NULL,
      \`week\` int NOT NULL,
      \`weekStatus\` varchar(16) NOT NULL,
      \`currentMatchupPeriod\` int NOT NULL DEFAULT 0,
      \`factsJson\` longtext NOT NULL,
      \`receiptsJson\` longtext NOT NULL,
      \`generatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_weekly_season_pack\` (\`leagueId\`, \`season\`, \`week\`)
    )`,
  );

  await run(
    "weekly_season_narratives",
    `CREATE TABLE IF NOT EXISTS \`weekly_season_narratives\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`leagueId\` varchar(32) NOT NULL,
      \`season\` int NOT NULL,
      \`week\` int NOT NULL,
      \`eventId\` varchar(128) NOT NULL,
      \`factFingerprint\` varchar(64) NOT NULL,
      \`promptVersion\` varchar(32) NOT NULL DEFAULT 'rfsn-week-v1',
      \`status\` varchar(16) NOT NULL DEFAULT 'pending',
      \`headline\` varchar(256) NULL,
      \`bodyText\` text NULL,
      \`usageEventId\` int NULL,
      \`errorMessage\` varchar(512) NULL,
      \`generatedAt\` timestamp NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_weekly_season_narrative\` (\`leagueId\`, \`season\`, \`week\`, \`eventId\`, \`factFingerprint\`, \`promptVersion\`)
    )`,
  );

  await run(
    "rfsn_stories",
    `CREATE TABLE IF NOT EXISTS \`rfsn_stories\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`storyId\` varchar(255) NOT NULL,
      \`leagueId\` varchar(32) NOT NULL,
      \`storyType\` varchar(48) NOT NULL,
      \`status\` varchar(24) NOT NULL DEFAULT 'emerging',
      \`owners\` json NOT NULL,
      \`ownerDisplay\` json NOT NULL,
      \`headline\` varchar(512) NOT NULL DEFAULT '',
      \`priority\` int NOT NULL DEFAULT 0,
      \`confidence\` int NOT NULL DEFAULT 0,
      \`mentionCount\` int NOT NULL DEFAULT 0,
      \`resolution\` varchar(512) NULL,
      \`supportingFacts\` json NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`lastMentioned\` timestamp NULL,
      \`lastDetectedAt\` timestamp NULL,
      \`expiry\` timestamp NOT NULL,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_rfsn_story_id\` (\`storyId\`),
      KEY \`idx_rfsn_story_league\` (\`leagueId\`)
    )`,
  );

  return notes;
}
