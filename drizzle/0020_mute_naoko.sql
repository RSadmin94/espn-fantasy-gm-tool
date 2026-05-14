CREATE TABLE `funnel_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`event` varchar(64) NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `funnel_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `onboarding_state` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`currentProfile` int NOT NULL DEFAULT 0,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `onboarding_state_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_os_userId` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `stripeCustomerId` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `stripeSubscriptionId` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `subscriptionStatus` enum('free','trialing','active','past_due','canceled') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `trialStartedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `currentPeriodEnd` timestamp;--> statement-breakpoint
CREATE INDEX `idx_fe_userId` ON `funnel_events` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_fe_event` ON `funnel_events` (`event`);--> statement-breakpoint
CREATE INDEX `idx_fe_createdAt` ON `funnel_events` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_os_userId` ON `onboarding_state` (`userId`);