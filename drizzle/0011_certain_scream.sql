CREATE TABLE `champ_equity_predictions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`week` int NOT NULL,
	`teamName` varchar(128) NOT NULL,
	`predictedChampPct` int NOT NULL,
	`predictedPlayoffPct` int NOT NULL,
	`currentRank` int NOT NULL,
	`actuallyWonChamp` int,
	`actuallyMadePlayoffs` int,
	`finalRank` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `champ_equity_predictions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monte_carlo_calibration` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`week` int NOT NULL,
	`teamName` varchar(128) NOT NULL,
	`opponentName` varchar(128) NOT NULL,
	`predictedWinPct` int NOT NULL,
	`projectedScore` int NOT NULL,
	`projectedFloor` int NOT NULL,
	`projectedCeiling` int NOT NULL,
	`actualScore` int,
	`actualOpponentScore` int,
	`actualWon` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monte_carlo_calibration_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `start_sit_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`week` int NOT NULL,
	`playerAName` varchar(128) NOT NULL,
	`playerAPosition` varchar(8) NOT NULL,
	`playerAProjection` int NOT NULL,
	`playerAFloor` int NOT NULL,
	`playerACeiling` int NOT NULL,
	`playerABustPct` int NOT NULL,
	`playerAActualPoints` int,
	`playerBName` varchar(128) NOT NULL,
	`playerBPosition` varchar(8) NOT NULL,
	`playerBProjection` int NOT NULL,
	`playerBFloor` int NOT NULL,
	`playerBCeiling` int NOT NULL,
	`playerBBustPct` int NOT NULL,
	`playerBActualPoints` int,
	`recommendation` enum('A','B','TOSS_UP') NOT NULL,
	`winProbabilityA` int NOT NULL,
	`agentConsensus` int,
	`aiVerdict` text,
	`outcome` enum('CORRECT','INCORRECT','PUSH'),
	`resolvedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `start_sit_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trade_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`week` int NOT NULL,
	`assetsGiven` json NOT NULL,
	`assetsReceived` json NOT NULL,
	`valueGiven` int NOT NULL,
	`valueReceived` int NOT NULL,
	`verdict` enum('WIN','FAIR','LOSS') NOT NULL,
	`champDeltaBefore` int,
	`champDeltaAfter` int,
	`aiSummary` text,
	`rodDecision` enum('ACCEPTED','REJECTED','PENDING') NOT NULL DEFAULT 'PENDING',
	`outcomeRating` enum('GREAT','GOOD','NEUTRAL','BAD','TERRIBLE'),
	`outcomeNotes` text,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trade_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_cep_season_week` ON `champ_equity_predictions` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `idx_cep_team` ON `champ_equity_predictions` (`teamName`);--> statement-breakpoint
CREATE INDEX `idx_mcc_season_week` ON `monte_carlo_calibration` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `idx_mcc_team` ON `monte_carlo_calibration` (`teamName`);--> statement-breakpoint
CREATE INDEX `idx_ssd_season_week` ON `start_sit_decisions` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `idx_ssd_outcome` ON `start_sit_decisions` (`outcome`);--> statement-breakpoint
CREATE INDEX `idx_td_season_week` ON `trade_decisions` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `idx_td_verdict` ON `trade_decisions` (`verdict`);--> statement-breakpoint
CREATE INDEX `idx_td_decision` ON `trade_decisions` (`rodDecision`);