CREATE TABLE `weekly_storylines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`week` int NOT NULL,
	`storyType` varchar(64) NOT NULL,
	`emotionalTag` varchar(64) NOT NULL,
	`teamId` int NOT NULL,
	`ownerName` varchar(128) NOT NULL,
	`record` varchar(16) NOT NULL,
	`intensityScore` int NOT NULL DEFAULT 0,
	`headline` varchar(256),
	`bodyText` text,
	`supportingStat` varchar(256),
	`opponentName` varchar(128),
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_storylines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_ws_season_week` ON `weekly_storylines` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `idx_ws_story_type` ON `weekly_storylines` (`storyType`);--> statement-breakpoint
CREATE INDEX `idx_ws_intensity` ON `weekly_storylines` (`intensityScore`);