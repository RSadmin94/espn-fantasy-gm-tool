CREATE TABLE `espn_team_ownership` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leagueConnectionId` int NOT NULL,
	`season` int NOT NULL,
	`espnTeamId` int NOT NULL,
	`espnMemberId` varchar(128) NOT NULL,
	`teamName` varchar(256) DEFAULT '',
	`ownerDisplayName` varchar(256) DEFAULT '',
	`claimedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `espn_team_ownership_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_eto_user_lc_season` UNIQUE(`userId`,`leagueConnectionId`,`season`)
);
--> statement-breakpoint
CREATE INDEX `idx_eto_user` ON `espn_team_ownership` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_eto_lc` ON `espn_team_ownership` (`leagueConnectionId`);