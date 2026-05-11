CREATE TABLE `gm_decision_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`decisionId` int NOT NULL,
	`tag` varchar(128) NOT NULL,
	CONSTRAINT `gm_decision_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gm_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`toolSource` enum('start_sit','trade_analyzer','waiver_wire','trade_offer','keeper_lab','draft_war_room','manual') NOT NULL,
	`decisionType` enum('start_sit','trade_accept','trade_reject','waiver_add','waiver_pass','keeper_keep','keeper_drop','draft_pick','manual') NOT NULL,
	`description` text NOT NULL,
	`recommendation` text,
	`followedRecommendation` boolean,
	`accepted` boolean NOT NULL DEFAULT true,
	`playersInvolved` text,
	`counterparty` varchar(128),
	`aiContext` text,
	`season` int NOT NULL,
	`weekNum` int,
	`outcome` enum('correct','incorrect','neutral','pending') NOT NULL DEFAULT 'pending',
	`outcomeScore` int,
	`outcomeNotes` text,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gm_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_gmdt_decision` ON `gm_decision_tags` (`decisionId`);--> statement-breakpoint
CREATE INDEX `idx_gmdt_tag` ON `gm_decision_tags` (`tag`);--> statement-breakpoint
CREATE INDEX `idx_gmd_tool` ON `gm_decisions` (`toolSource`);--> statement-breakpoint
CREATE INDEX `idx_gmd_type` ON `gm_decisions` (`decisionType`);--> statement-breakpoint
CREATE INDEX `idx_gmd_season_week` ON `gm_decisions` (`season`,`weekNum`);--> statement-breakpoint
CREATE INDEX `idx_gmd_outcome` ON `gm_decisions` (`outcome`);--> statement-breakpoint
CREATE INDEX `idx_gmd_created` ON `gm_decisions` (`createdAt`);