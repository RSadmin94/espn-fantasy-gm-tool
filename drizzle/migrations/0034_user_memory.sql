-- GM Advisor persistent memory (one row per user).
-- Additive: CREATE TABLE IF NOT EXISTS only. No drops, no column removals.
-- Mirrors drizzle/0017_thick_martin_li.sql + drizzle/schema.ts `userMemory`.
-- Required because boot-time runMigrations() only applies drizzle/migrations/*
-- (not the drizzle-kit journal under drizzle/*.sql).

CREATE TABLE IF NOT EXISTS `user_memory` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `riskTolerance` varchar(32) DEFAULT 'moderate',
  `tradePhilosophy` text,
  `keeperPhilosophy` text,
  `draftStyle` varchar(64),
  `favoritePlayerTypes` text,
  `rivalManagers` text,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_memory_id` PRIMARY KEY (`id`),
  CONSTRAINT `uq_um_userId` UNIQUE (`userId`)
);

CREATE INDEX `idx_um_userId` ON `user_memory` (`userId`);
