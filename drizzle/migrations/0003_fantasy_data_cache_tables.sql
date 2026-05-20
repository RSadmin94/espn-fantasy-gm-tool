-- Ensure draft-board cache tables exist (idempotent for runtime self-heal + migrations)
CREATE TABLE IF NOT EXISTS `fantasy_data_cache` (
  `id` int AUTO_INCREMENT NOT NULL,
  `cacheKey` varchar(64) NOT NULL,
  `payload` json NOT NULL,
  `fetchedAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fantasy_data_cache_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_fantasy_cache_key` UNIQUE(`cacheKey`)
);

CREATE TABLE IF NOT EXISTS `adp_trend_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `fpId` int NOT NULL,
  `playerName` varchar(128) NOT NULL,
  `position` varchar(8) NOT NULL,
  `adp` int,
  `ecrRank` int NOT NULL,
  `snapshotAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `adp_trend_snapshots_id` PRIMARY KEY(`id`),
  INDEX `idx_adp_fp` (`fpId`),
  INDEX `idx_adp_snapshot` (`snapshotAt`)
);
