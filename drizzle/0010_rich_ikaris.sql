CREATE TABLE `adp_trend_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fpId` int NOT NULL,
	`playerName` varchar(128) NOT NULL,
	`position` varchar(8) NOT NULL,
	`adp` int,
	`ecrRank` int NOT NULL,
	`snapshotAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adp_trend_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_adp_trend_player` ON `adp_trend_snapshots` (`fpId`);--> statement-breakpoint
CREATE INDEX `idx_adp_trend_snapshot` ON `adp_trend_snapshots` (`snapshotAt`);