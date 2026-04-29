CREATE TABLE `chat_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`season` int,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `espn_season_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`viewName` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `espn_season_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refresh_manifest` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`lastRefreshedAt` timestamp NOT NULL DEFAULT (now()),
	`viewsRefreshed` json,
	`teamCount` int,
	`rosterCount` int,
	`matchupCount` int,
	`draftPickCount` int,
	`transactionCount` int,
	`status` enum('success','partial','failed') NOT NULL DEFAULT 'success',
	`errorMessage` text,
	CONSTRAINT `refresh_manifest_id` PRIMARY KEY(`id`),
	CONSTRAINT `refresh_manifest_season_unique` UNIQUE(`season`)
);
--> statement-breakpoint
CREATE INDEX `idx_season_view` ON `espn_season_cache` (`season`,`viewName`);