CREATE TABLE `pick_trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`draftYear` int NOT NULL DEFAULT 2026,
	`type` enum('acquired','traded_away') NOT NULL,
	`round` int NOT NULL,
	`pickInRound` int NOT NULL,
	`label` varchar(8) NOT NULL,
	`counterparty` varchar(128) NOT NULL,
	`notes` text,
	`pickValue` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pick_trades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pick_trades_year` ON `pick_trades` (`draftYear`);