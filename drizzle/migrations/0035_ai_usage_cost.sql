-- AI usage & cost tracking: extend usage_events + app_settings for monthly budget.
-- Applied at process start by server/runMigrations.ts (NOT drizzle-kit journal).
-- Column names match drizzle/schema.ts (camelCase), which is what production already uses.

ALTER TABLE `usage_events` MODIFY COLUMN `model` varchar(128) NULL;

ALTER TABLE `usage_events` ADD COLUMN `provider` varchar(32) NULL;
ALTER TABLE `usage_events` ADD COLUMN `featureId` varchar(64) NULL;
ALTER TABLE `usage_events` ADD COLUMN `intent` varchar(64) NULL;
ALTER TABLE `usage_events` ADD COLUMN `leagueId` varchar(64) NULL;
ALTER TABLE `usage_events` ADD COLUMN `requestId` varchar(64) NULL;
ALTER TABLE `usage_events` ADD COLUMN `parentRequestId` varchar(64) NULL;
ALTER TABLE `usage_events` ADD COLUMN `retryCount` int NOT NULL DEFAULT 0;
ALTER TABLE `usage_events` ADD COLUMN `cachedInputTokens` int NOT NULL DEFAULT 0;
ALTER TABLE `usage_events` ADD COLUMN `status` varchar(16) NULL;
ALTER TABLE `usage_events` ADD COLUMN `errorCode` varchar(64) NULL;
ALTER TABLE `usage_events` ADD COLUMN `generated` boolean NULL;
ALTER TABLE `usage_events` ADD COLUMN `delivered` boolean NULL;
ALTER TABLE `usage_events` ADD COLUMN `displayed` boolean NULL;
ALTER TABLE `usage_events` ADD COLUMN `discarded` boolean NULL;
ALTER TABLE `usage_events` ADD COLUMN `costPriced` boolean NULL;
ALTER TABLE `usage_events` ADD COLUMN `providerReportedCostUsd` float NULL;

CREATE INDEX `idx_ue_provider` ON `usage_events` (`provider`);
CREATE INDEX `idx_ue_model` ON `usage_events` (`model`);
CREATE INDEX `idx_ue_feature_id` ON `usage_events` (`featureId`);
CREATE INDEX `idx_ue_intent` ON `usage_events` (`intent`);
CREATE INDEX `idx_ue_league` ON `usage_events` (`leagueId`);
CREATE INDEX `idx_ue_request` ON `usage_events` (`requestId`);
CREATE INDEX `idx_ue_status` ON `usage_events` (`status`);

CREATE TABLE IF NOT EXISTS `app_settings` (
  `key` varchar(64) NOT NULL,
  `value` text NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
);
