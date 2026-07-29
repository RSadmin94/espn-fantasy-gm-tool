-- GM Advisor chat history (per-user, per-league threads).
-- Additive: CREATE TABLE IF NOT EXISTS only.
-- Mirrors drizzle/schema.ts `chatHistory` + drizzle/0001 + drizzle/0034_chat_history_league.sql.
-- Required because boot-time runMigrations() only applies drizzle/migrations/*
-- (not the drizzle-kit journal under drizzle/*.sql).

CREATE TABLE IF NOT EXISTS `chat_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `leagueId` varchar(32) NOT NULL DEFAULT '',
  `season` int,
  `role` enum('user','assistant') NOT NULL,
  `content` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `chat_history_id` PRIMARY KEY (`id`)
);

CREATE INDEX `idx_chat_history_user_league` ON `chat_history` (`userId`, `leagueId`);
