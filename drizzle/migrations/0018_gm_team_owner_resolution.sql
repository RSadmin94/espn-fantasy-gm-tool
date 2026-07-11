-- Sleeper / provider team-season owner overrides and resolution snapshots.

CREATE TABLE IF NOT EXISTS `gm_team_owner_overrides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `provider` varchar(16) NOT NULL DEFAULT 'sleeper',
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `teamId` int NOT NULL,
  `ownerKey` varchar(128) NOT NULL,
  `ownerName` varchar(255) NOT NULL DEFAULT '',
  `updatedByUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gm_team_owner_override` (`leagueId`, `season`, `teamId`),
  KEY `idx_gm_team_owner_override_league` (`leagueId`)
);

CREATE TABLE IF NOT EXISTS `gm_team_owner_resolution` (
  `id` int NOT NULL AUTO_INCREMENT,
  `provider` varchar(16) NOT NULL DEFAULT 'sleeper',
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `teamId` int NOT NULL,
  `teamName` varchar(255) NOT NULL DEFAULT '',
  `status` varchar(16) NOT NULL,
  `ownerKey` varchar(128) DEFAULT NULL,
  `ownerName` varchar(255) DEFAULT NULL,
  `suggestedOwnerKey` varchar(128) DEFAULT NULL,
  `suggestedOwnerName` varchar(255) DEFAULT NULL,
  `suggestionReason` text,
  `sourceDetail` varchar(255) NOT NULL DEFAULT '',
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gm_team_owner_resolution` (`leagueId`, `season`, `teamId`),
  KEY `idx_gm_team_owner_resolution_league` (`leagueId`, `season`)
);
