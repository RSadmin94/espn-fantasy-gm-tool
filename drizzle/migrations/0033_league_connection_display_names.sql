-- Per-user connected league display names (canonical provider name remains on league_connections).

CREATE TABLE IF NOT EXISTS `league_connection_display_names` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `provider` varchar(32) NOT NULL,
  `leagueId` varchar(128) NOT NULL,
  `displayName` varchar(256) NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lcdn_user_provider_league` (`userId`, `provider`, `leagueId`),
  KEY `idx_lcdn_user` (`userId`)
);
