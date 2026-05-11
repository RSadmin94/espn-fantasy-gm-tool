CREATE TABLE `league_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`leagueId` varchar(128) NOT NULL,
	`leagueName` varchar(256) NOT NULL DEFAULT '',
	`season` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`credentials` json,
	`lastSyncedAt` timestamp,
	`syncStatus` enum('ok','error','pending') DEFAULT 'pending',
	`syncError` text,
	`dnaProfile` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `league_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_lc_user_provider_league_season` UNIQUE(`userId`,`provider`,`leagueId`,`season`)
);
--> statement-breakpoint
CREATE INDEX `idx_lc_user` ON `league_connections` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_lc_provider_league` ON `league_connections` (`provider`,`leagueId`);