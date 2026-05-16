CREATE TABLE `league_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`espnTxId` varchar(64) NOT NULL,
	`leagueId` varchar(32) NOT NULL,
	`season` int NOT NULL,
	`eventType` varchar(32) NOT NULL,
	`processedAt` bigint NOT NULL,
	`teamId` int NOT NULL DEFAULT 0,
	`ownerName` varchar(128) NOT NULL DEFAULT '',
	`payloadJson` text NOT NULL,
	`rawJson` text,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `league_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_le_espnTxId` UNIQUE(`espnTxId`)
);
--> statement-breakpoint
CREATE INDEX `idx_le_league_season` ON `league_events` (`leagueId`,`season`);--> statement-breakpoint
CREATE INDEX `idx_le_eventType` ON `league_events` (`eventType`);--> statement-breakpoint
CREATE INDEX `idx_le_processedAt` ON `league_events` (`processedAt`);--> statement-breakpoint
CREATE INDEX `idx_le_teamId` ON `league_events` (`teamId`);