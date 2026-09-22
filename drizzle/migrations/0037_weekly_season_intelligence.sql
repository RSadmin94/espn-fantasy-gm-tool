-- Weekly Season Intelligence Engine: league-scope weekly intel + week packs.
--
-- Migration behavior (conservative):
--   * Existing weekly_storylines / fear_index / weekly_player_stats rows receive
--     leagueId = 'unattributed'. They are NOT assigned to ESPN league 457622.
--   * Reads for a real league never include unattributed rows.
--   * New engine writes always set an explicit leagueId.
--   * Duplicate weekly_player_stats rows (same season+week+playerId) keep the
--     highest id before the unique index is added.

ALTER TABLE `weekly_storylines`
  ADD COLUMN `leagueId` varchar(32) NOT NULL DEFAULT 'unattributed';

CREATE UNIQUE INDEX `uq_ws_league_week_story_team`
  ON `weekly_storylines` (`leagueId`, `season`, `week`, `storyType`, `teamId`);
CREATE INDEX `idx_ws_league_season_week`
  ON `weekly_storylines` (`leagueId`, `season`, `week`);

ALTER TABLE `fear_index`
  ADD COLUMN `leagueId` varchar(32) NOT NULL DEFAULT 'unattributed';

ALTER TABLE `fear_index` DROP INDEX `uq_fear_team_week`;
CREATE UNIQUE INDEX `uq_fear_league_team_week`
  ON `fear_index` (`leagueId`, `season`, `week`, `teamId`);
CREATE INDEX `idx_fi_league_season_week`
  ON `fear_index` (`leagueId`, `season`, `week`);

ALTER TABLE `weekly_player_stats`
  ADD COLUMN `leagueId` varchar(32) NOT NULL DEFAULT 'unattributed';

DELETE w FROM `weekly_player_stats` w
INNER JOIN `weekly_player_stats` w2
  ON w.`leagueId` = w2.`leagueId`
 AND w.`season` = w2.`season`
 AND w.`week` = w2.`week`
 AND w.`playerId` = w2.`playerId`
 AND w.`id` < w2.`id`;

CREATE UNIQUE INDEX `uq_wps_league_week_player`
  ON `weekly_player_stats` (`leagueId`, `season`, `week`, `playerId`);

CREATE TABLE IF NOT EXISTS `weekly_season_packs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `week` int NOT NULL,
  `weekStatus` varchar(16) NOT NULL,
  `currentMatchupPeriod` int NOT NULL DEFAULT 0,
  `factsJson` longtext NOT NULL,
  `receiptsJson` longtext NOT NULL,
  `generatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_weekly_season_pack` (`leagueId`, `season`, `week`),
  KEY `idx_wsp_league_season` (`leagueId`, `season`)
);
