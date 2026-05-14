CREATE TABLE `llm_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`callType` varchar(64) NOT NULL,
	`model` varchar(128),
	`promptTokens` int NOT NULL DEFAULT 0,
	`completionTokens` int NOT NULL DEFAULT 0,
	`totalTokens` int NOT NULL DEFAULT 0,
	`durationMs` int NOT NULL DEFAULT 0,
	`streaming` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `llm_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_lu_userId` ON `llm_usage` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_lu_callType` ON `llm_usage` (`callType`);--> statement-breakpoint
CREATE INDEX `idx_lu_createdAt` ON `llm_usage` (`createdAt`);