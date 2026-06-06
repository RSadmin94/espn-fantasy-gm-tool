ALTER TABLE `chat_history` ADD COLUMN `leagueId` varchar(32) NOT NULL DEFAULT '';
CREATE INDEX `idx_chat_history_user_league` ON `chat_history` (`userId`, `leagueId`);
