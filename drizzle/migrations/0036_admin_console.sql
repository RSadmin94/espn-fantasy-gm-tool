-- Owner-only Admin Console: owner role + account controls + feature overrides + audit log.
-- Applied at process start by server/runMigrations.ts (NOT drizzle-kit journal).
-- No FKs on purpose: admin rows must not cascade-delete if a users row is removed.
-- ALTER ENUM adds owner only. Existing user and admin rows stay unchanged.
-- Column names match drizzle/schema.ts (camelCase), which is what production already uses.

ALTER TABLE `users` MODIFY COLUMN `role` ENUM('user','admin','owner') NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS `admin_account_controls` (
  `userId` int NOT NULL,
  `status` ENUM('active','watched','throttled','restricted','suspended') NOT NULL DEFAULT 'active',
  `aiDisabled` boolean NOT NULL DEFAULT false,
  `dailyTokenLimit` int NULL,
  `notes` text NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updatedByUserId` int NULL,
  PRIMARY KEY (`userId`)
);

CREATE TABLE IF NOT EXISTS `admin_feature_overrides` (
  `featureId` varchar(64) NOT NULL,
  `enabled` boolean NOT NULL DEFAULT true,
  `maintenance` boolean NOT NULL DEFAULT false,
  `restrictTo` ENUM('none','admin','owner') NOT NULL DEFAULT 'none',
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`featureId`)
);

CREATE TABLE IF NOT EXISTS `admin_audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actorUserId` int NOT NULL,
  `actorOpenId` varchar(64) NULL,
  `action` varchar(64) NOT NULL,
  `targetType` varchar(32) NOT NULL,
  `targetId` varchar(128) NOT NULL,
  `previousValue` text NULL,
  `newValue` text NULL,
  `reason` text NULL,
  PRIMARY KEY (`id`),
  KEY `idx_aal_created` (`createdAt`),
  KEY `idx_aal_actor` (`actorUserId`),
  KEY `idx_aal_action` (`action`),
  KEY `idx_aal_target` (`targetType`, `targetId`)
);
