-- GM War Room: ESPN raw cache, normalized tables, sync runs, legacy cache compatibility.
-- Idempotent for Railway MySQL (CREATE IF NOT EXISTS + conditional ALTER).

-- 1) Raw ESPN cache (canonical LONGTEXT payloads)
CREATE TABLE IF NOT EXISTS `espn_raw_cache` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `viewName` varchar(64) NOT NULL,
  `payload` LONGTEXT NOT NULL,
  `payloadBytes` int NOT NULL DEFAULT 0,
  `fetchedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_raw_cache` (`leagueId`, `season`, `viewName`),
  KEY `idx_raw_cache_league_season` (`leagueId`, `season`)
);

-- 2) Normalized tables
CREATE TABLE IF NOT EXISTS `league_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `name` varchar(255) NOT NULL DEFAULT '',
  `teamCount` int NOT NULL DEFAULT 0,
  `scoringType` varchar(64) NOT NULL DEFAULT '',
  `playoffTeams` int NOT NULL DEFAULT 0,
  `regularSeasonWeeks` int NOT NULL DEFAULT 0,
  `tradeDeadline` bigint NULL,
  `rosterSlots` LONGTEXT NULL,
  `scoringSettings` LONGTEXT NULL,
  `rawSettings` LONGTEXT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_league_settings` (`leagueId`, `season`)
);

CREATE TABLE IF NOT EXISTS `teams` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `teamId` int NOT NULL,
  `name` varchar(255) NOT NULL DEFAULT '',
  `abbreviation` varchar(16) NOT NULL DEFAULT '',
  `ownerName` varchar(255) NOT NULL DEFAULT '',
  `ownerId` varchar(128) NOT NULL DEFAULT '',
  `logoUrl` varchar(1024) NOT NULL DEFAULT '',
  `wins` int NOT NULL DEFAULT 0,
  `losses` int NOT NULL DEFAULT 0,
  `ties` int NOT NULL DEFAULT 0,
  `pointsFor` decimal(10,2) NOT NULL DEFAULT 0,
  `pointsAgainst` decimal(10,2) NOT NULL DEFAULT 0,
  `playoffSeed` int NULL,
  `finalStanding` int NULL,
  `rawTeam` LONGTEXT NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_teams` (`leagueId`, `season`, `teamId`)
);

CREATE TABLE IF NOT EXISTS `matchups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `week` int NOT NULL DEFAULT 0,
  `matchupPeriodId` int NOT NULL,
  `homeTeamId` int NOT NULL,
  `awayTeamId` int NOT NULL,
  `homeScore` decimal(10,2) NOT NULL DEFAULT 0,
  `awayScore` decimal(10,2) NOT NULL DEFAULT 0,
  `homeProjected` decimal(10,2) NULL,
  `awayProjected` decimal(10,2) NULL,
  `winnerTeamId` int NULL,
  `isPlayoff` tinyint(1) NOT NULL DEFAULT 0,
  `isCompleted` tinyint(1) NOT NULL DEFAULT 0,
  `rawMatchup` LONGTEXT NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_matchups` (`leagueId`, `season`, `matchupPeriodId`, `homeTeamId`, `awayTeamId`)
);

CREATE TABLE IF NOT EXISTS `draft_picks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `overallPick` int NOT NULL,
  `roundId` int NOT NULL DEFAULT 0,
  `roundPick` int NOT NULL DEFAULT 0,
  `teamId` int NOT NULL,
  `owningTeamId` int NULL,
  `playerId` int NULL,
  `playerName` varchar(255) NULL,
  `position` varchar(16) NULL,
  `isKeeper` tinyint(1) NOT NULL DEFAULT 0,
  `bidAmount` decimal(10,2) NOT NULL DEFAULT 0,
  `rawPick` LONGTEXT NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_draft_picks` (`leagueId`, `season`, `overallPick`)
);

-- playerKey disambiguates rows where ESPN playerId is NULL (header / non-player rows)
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `transactionId` varchar(64) NOT NULL,
  `type` varchar(64) NOT NULL DEFAULT '',
  `status` varchar(64) NOT NULL DEFAULT '',
  `playerId` int NULL,
  `playerKey` int NOT NULL DEFAULT 0,
  `playerName` varchar(255) NULL,
  `fromTeamId` int NULL,
  `toTeamId` int NULL,
  `bidAmount` decimal(10,2) NOT NULL DEFAULT 0,
  `proposedDate` bigint NULL,
  `processedDate` bigint NULL,
  `rawTransaction` LONGTEXT NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_transactions` (`leagueId`, `season`, `transactionId`, `playerKey`)
);

CREATE TABLE IF NOT EXISTS `roster_entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `week` int NOT NULL DEFAULT 0,
  `teamId` int NOT NULL,
  `playerId` int NOT NULL,
  `playerName` varchar(255) NOT NULL DEFAULT '',
  `position` varchar(16) NOT NULL DEFAULT '',
  `nflTeam` varchar(16) NOT NULL DEFAULT '',
  `slotId` int NULL,
  `acquisitionType` varchar(64) NOT NULL DEFAULT '',
  `projectedPoints` decimal(10,2) NULL,
  `actualPoints` decimal(10,2) NULL,
  `injuryStatus` varchar(64) NOT NULL DEFAULT '',
  `rawRosterEntry` LONGTEXT NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roster_entries` (`leagueId`, `season`, `week`, `teamId`, `playerId`)
);

CREATE TABLE IF NOT EXISTS `players` (
  `id` int NOT NULL AUTO_INCREMENT,
  `playerId` int NOT NULL,
  `season` int NOT NULL,
  `name` varchar(255) NOT NULL DEFAULT '',
  `position` varchar(16) NOT NULL DEFAULT '',
  `nflTeam` varchar(16) NOT NULL DEFAULT '',
  `jerseyNumber` int NULL,
  `injuryStatus` varchar(64) NOT NULL DEFAULT '',
  `percentOwned` decimal(10,2) NULL,
  `percentStarted` decimal(10,2) NULL,
  `averagePoints` decimal(10,4) NULL,
  `totalPoints` decimal(10,4) NULL,
  `projectedTotalPoints` decimal(10,4) NULL,
  `rawPlayer` LONGTEXT NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_players` (`playerId`, `season`)
);

CREATE TABLE IF NOT EXISTS `standings_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `week` int NOT NULL DEFAULT 0,
  `teamId` int NOT NULL,
  `rank` int NOT NULL DEFAULT 0,
  `wins` int NOT NULL DEFAULT 0,
  `losses` int NOT NULL DEFAULT 0,
  `ties` int NOT NULL DEFAULT 0,
  `pointsFor` decimal(10,2) NOT NULL DEFAULT 0,
  `pointsAgainst` decimal(10,2) NOT NULL DEFAULT 0,
  `rawStanding` LONGTEXT NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_standings_snapshots` (`leagueId`, `season`, `week`, `teamId`)
);

CREATE TABLE IF NOT EXISTS `sync_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `status` enum('running','success','partial','failed') NOT NULL DEFAULT 'running',
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finishedAt` timestamp NULL,
  `errorMessage` LONGTEXT NULL,
  `rawViewsSaved` int NOT NULL DEFAULT 0,
  `teamsSaved` int NOT NULL DEFAULT 0,
  `matchupsSaved` int NOT NULL DEFAULT 0,
  `draftPicksSaved` int NOT NULL DEFAULT 0,
  `transactionsSaved` int NOT NULL DEFAULT 0,
  `rosterEntriesSaved` int NOT NULL DEFAULT 0,
  `playersSaved` int NOT NULL DEFAULT 0,
  `standingsSaved` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_sync_runs_league_season` (`leagueId`, `season`)
);

-- 11) fantasy_data_cache.payload → LONGTEXT
-- Safe to re-run on most hosts (no-op if already LONGTEXT). If this errors after first apply, mark 0006 applied in _applied_migrations or adjust manually.
ALTER TABLE `fantasy_data_cache` MODIFY COLUMN `payload` LONGTEXT NOT NULL;

-- 12) Legacy espn_season_cache (LONGTEXT) if missing
CREATE TABLE IF NOT EXISTS `espn_season_cache` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL DEFAULT 'default',
  `season` int NOT NULL,
  `viewName` varchar(64) NOT NULL,
  `payload` LONGTEXT NOT NULL,
  `fetchedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_league_season_view` (`leagueId`, `season`, `viewName`)
);
