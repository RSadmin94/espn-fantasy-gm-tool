CREATE TABLE `league_identity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`teams` json NOT NULL,
	`members` json NOT NULL,
	`draftOrder` json NOT NULL,
	`draftDate` int,
	`keeperDeadline` int,
	`draftType` varchar(32),
	`keeperCount` int,
	`teamCount` int,
	`playoffTeamCount` int,
	`scoringType` varchar(32),
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `league_identity_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_li_season` UNIQUE(`season`)
);
--> statement-breakpoint
CREATE INDEX `idx_li_season` ON `league_identity` (`season`);