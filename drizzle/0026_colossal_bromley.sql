CREATE TABLE `fear_index` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`week` int NOT NULL,
	`teamId` int NOT NULL,
	`memberId` varchar(64) NOT NULL,
	`ownerName` varchar(128) NOT NULL,
	`fearScore` int NOT NULL DEFAULT 0,
	`heatLabel` varchar(32) NOT NULL DEFAULT 'NEUTRAL',
	`avgPfLast4` int NOT NULL DEFAULT 0,
	`winStreak` int NOT NULL DEFAULT 0,
	`rosterHealthScore` int NOT NULL DEFAULT 0,
	`tradeAggressionScore` int NOT NULL DEFAULT 0,
	`exploitabilityInverse` int NOT NULL DEFAULT 0,
	`computedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fear_index_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_fear_team_week` UNIQUE(`season`,`week`,`teamId`)
);
--> statement-breakpoint
CREATE TABLE `reputation_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` varchar(64) NOT NULL,
	`ownerName` varchar(128) NOT NULL,
	`season` int NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`eventLabel` varchar(128) NOT NULL,
	`eventSentence` text,
	`supportingStat` varchar(256),
	`severity` varchar(16) NOT NULL DEFAULT 'NOTABLE',
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reputation_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_rep_event` UNIQUE(`memberId`,`season`,`eventType`)
);
--> statement-breakpoint
CREATE INDEX `idx_fi_season_week` ON `fear_index` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `idx_fi_score` ON `fear_index` (`fearScore`);--> statement-breakpoint
CREATE INDEX `idx_re_member` ON `reputation_events` (`memberId`);--> statement-breakpoint
CREATE INDEX `idx_re_season` ON `reputation_events` (`season`);--> statement-breakpoint
CREATE INDEX `idx_re_type` ON `reputation_events` (`eventType`);