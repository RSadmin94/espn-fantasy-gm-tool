CREATE TABLE `rivalry_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` varchar(64) NOT NULL,
	`rivalId` varchar(64) NOT NULL,
	`rivalName` varchar(128) NOT NULL,
	`rivalryScore` int NOT NULL DEFAULT 0,
	`h2hLosses` int NOT NULL DEFAULT 0,
	`h2hWins` int NOT NULL DEFAULT 0,
	`h2hTies` int NOT NULL DEFAULT 0,
	`playoffEliminations` int NOT NULL DEFAULT 0,
	`closeLossCount` int NOT NULL DEFAULT 0,
	`tradeVerdictLosses` int NOT NULL DEFAULT 0,
	`recentLosses` int NOT NULL DEFAULT 0,
	`heatLabel` varchar(32) NOT NULL DEFAULT 'Cold',
	`painfulLossSeason` int,
	`painfulLossMargin` int,
	`painfulLossOpponentScore` int,
	`revengeAchieved` boolean NOT NULL DEFAULT false,
	`lastMatchupSeason` int,
	`loreSentence` text,
	`loreGeneratedAt` timestamp,
	`computedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rivalry_scores_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_rivalry_pair` UNIQUE(`memberId`,`rivalId`)
);
--> statement-breakpoint
CREATE TABLE `trade_narratives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tradeId` varchar(128) NOT NULL,
	`season` int NOT NULL,
	`proposedDate` int NOT NULL,
	`sideAOwner` varchar(128) NOT NULL,
	`sideBOwner` varchar(128) NOT NULL,
	`verdict` varchar(8) NOT NULL,
	`verdictMargin` int NOT NULL DEFAULT 0,
	`narrativeLabel` varchar(64) NOT NULL,
	`narrativeSentence` text,
	`sideADesperation` int,
	`sideBDesperation` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trade_narratives_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_trade_narrative` UNIQUE(`tradeId`)
);
--> statement-breakpoint
CREATE INDEX `idx_rivalry_member` ON `rivalry_scores` (`memberId`);--> statement-breakpoint
CREATE INDEX `idx_rivalry_score` ON `rivalry_scores` (`rivalryScore`);--> statement-breakpoint
CREATE INDEX `idx_tn_season` ON `trade_narratives` (`season`);--> statement-breakpoint
CREATE INDEX `idx_tn_label` ON `trade_narratives` (`narrativeLabel`);