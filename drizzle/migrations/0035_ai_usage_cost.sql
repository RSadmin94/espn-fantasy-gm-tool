-- AI usage & cost tracking: ensure usage_events exists, then add attribution columns + app_settings.
-- Applied at process start by server/runMigrations.ts (NOT drizzle-kit journal).
-- Production may not have usage_events yet (drizzle-kit 0027 was never in this runner).
-- CREATE IF NOT EXISTS + skippable ALTER/INDEX keeps this idempotent.

CREATE TABLE IF NOT EXISTS `usage_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `eventCategory` varchar(16) NOT NULL,
  `featureName` varchar(128) NOT NULL,
  `callType` varchar(64) NULL,
  `promptTokens` int NOT NULL DEFAULT 0,
  `completionTokens` int NOT NULL DEFAULT 0,
  `totalTokens` int NOT NULL DEFAULT 0,
  `estimatedCostUsd` float NOT NULL DEFAULT 0,
  `durationMs` int NOT NULL DEFAULT 0,
  `userId` varchar(64) NULL,
  `model` varchar(128) NULL,
  `streaming` boolean NOT NULL DEFAULT false,
  `eventType` varchar(32) NULL,
  `page` varchar(256) NULL,
  `action` varchar(128) NULL,
  `sessionId` varchar(64) NULL,
  `metadata` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `provider` varchar(32) NULL,
  `featureId` varchar(64) NULL,
  `intent` varchar(64) NULL,
  `leagueId` varchar(64) NULL,
  `requestId` varchar(64) NULL,
  `parentRequestId` varchar(64) NULL,
  `retryCount` int NOT NULL DEFAULT 0,
  `cachedInputTokens` int NOT NULL DEFAULT 0,
  `status` varchar(16) NULL,
  `errorCode` varchar(64) NULL,
  `generated` boolean NULL,
  `delivered` boolean NULL,
  `displayed` boolean NULL,
  `discarded` boolean NULL,
  `costPriced` boolean NULL,
  `providerReportedCostUsd` float NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ue_feature` (`featureName`),
  KEY `idx_ue_category` (`eventCategory`),
  KEY `idx_ue_created` (`createdAt`),
  KEY `idx_ue_user` (`userId`),
  KEY `idx_ue_event_type` (`eventType`),
  KEY `idx_ue_session` (`sessionId`),
  KEY `idx_ue_provider` (`provider`),
  KEY `idx_ue_model` (`model`),
  KEY `idx_ue_feature_id` (`featureId`),
  KEY `idx_ue_intent` (`intent`),
  KEY `idx_ue_league` (`leagueId`),
  KEY `idx_ue_request` (`requestId`),
  KEY `idx_ue_status` (`status`)
);

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
