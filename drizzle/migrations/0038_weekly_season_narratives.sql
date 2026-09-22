-- Durable weekly narrative cache. Unique identity is the concurrency lock:
-- (leagueId, season, week, eventId, factFingerprint, promptVersion).
-- No request timestamp / session id in the fingerprint.

CREATE TABLE IF NOT EXISTS `weekly_season_narratives` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `week` int NOT NULL,
  `eventId` varchar(128) NOT NULL,
  `factFingerprint` varchar(64) NOT NULL,
  `promptVersion` varchar(32) NOT NULL DEFAULT 'rfsn-week-v1',
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `headline` varchar(256) NULL,
  `bodyText` text NULL,
  `usageEventId` int NULL,
  `errorMessage` varchar(512) NULL,
  `generatedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_weekly_season_narrative` (`leagueId`, `season`, `week`, `eventId`, `factFingerprint`, `promptVersion`),
  KEY `idx_wsn_league_week` (`leagueId`, `season`, `week`)
);
