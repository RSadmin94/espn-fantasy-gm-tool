CREATE TABLE `weekly_player_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`week` int NOT NULL,
	`playerId` int NOT NULL,
	`playerName` varchar(128) NOT NULL,
	`position` varchar(8) NOT NULL,
	`proTeam` varchar(8) NOT NULL DEFAULT '?',
	`teamId` int,
	`ownerName` varchar(128),
	`targets` int DEFAULT 0,
	`receptions` int DEFAULT 0,
	`receivingYards` int DEFAULT 0,
	`receivingTDs` int DEFAULT 0,
	`rushingAttempts` int DEFAULT 0,
	`rushingYards` int DEFAULT 0,
	`rushingTDs` int DEFAULT 0,
	`passingAttempts` int DEFAULT 0,
	`completions` int DEFAULT 0,
	`passingYards` int DEFAULT 0,
	`passingTDs` int DEFAULT 0,
	`interceptions` int DEFAULT 0,
	`snapCount` int DEFAULT 0,
	`snapPct` int DEFAULT 0,
	`fantasyPoints` int DEFAULT 0,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_player_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_wps_season_week` ON `weekly_player_stats` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `idx_wps_player_season` ON `weekly_player_stats` (`playerId`,`season`);--> statement-breakpoint
CREATE INDEX `idx_wps_season_week_player` ON `weekly_player_stats` (`season`,`week`,`playerId`);