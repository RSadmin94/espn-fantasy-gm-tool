CREATE TABLE `user_memory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`riskTolerance` varchar(32) DEFAULT 'moderate',
	`tradePhilosophy` text,
	`keeperPhilosophy` text,
	`draftStyle` varchar(64),
	`favoritePlayerTypes` text,
	`rivalManagers` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_memory_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_um_userId` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `idx_um_userId` ON `user_memory` (`userId`);