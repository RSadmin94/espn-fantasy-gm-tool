CREATE TABLE `mock_draft_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(128) NOT NULL DEFAULT 'Mock Draft',
	`draftSlot` int NOT NULL,
	`totalTeams` int NOT NULL DEFAULT 14,
	`totalRounds` int NOT NULL DEFAULT 15,
	`grade` varchar(4) NOT NULL,
	`avgEcr` int NOT NULL,
	`totalVbd` int NOT NULL DEFAULT 0,
	`rodPicksJson` json NOT NULL,
	`allPicksJson` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mock_draft_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_mock_draft_user` ON `mock_draft_results` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_mock_draft_created` ON `mock_draft_results` (`createdAt`);