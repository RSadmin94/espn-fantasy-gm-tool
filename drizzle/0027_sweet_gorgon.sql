CREATE TABLE `usage_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`eventCategory` varchar(16) NOT NULL,
	`featureName` varchar(128) NOT NULL,
	`callType` varchar(64),
	`promptTokens` int NOT NULL DEFAULT 0,
	`completionTokens` int NOT NULL DEFAULT 0,
	`totalTokens` int NOT NULL DEFAULT 0,
	`estimatedCostUsd` float NOT NULL DEFAULT 0,
	`durationMs` int NOT NULL DEFAULT 0,
	`userId` varchar(64),
	`model` varchar(64),
	`streaming` boolean NOT NULL DEFAULT false,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usage_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_ue_feature` ON `usage_events` (`featureName`);--> statement-breakpoint
CREATE INDEX `idx_ue_category` ON `usage_events` (`eventCategory`);--> statement-breakpoint
CREATE INDEX `idx_ue_created` ON `usage_events` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_ue_user` ON `usage_events` (`userId`);