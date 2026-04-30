CREATE TABLE `espn_view_health` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`viewName` varchar(64) NOT NULL,
	`status` enum('ok','error','stale','empty') NOT NULL DEFAULT 'ok',
	`errorMessage` text,
	`recordCount` int,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `espn_view_health_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_view_health_season_view` ON `espn_view_health` (`season`,`viewName`);