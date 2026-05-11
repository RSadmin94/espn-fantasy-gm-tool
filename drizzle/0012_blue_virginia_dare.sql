CREATE TABLE `player_news_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerName` varchar(128) NOT NULL,
	`espnPlayerId` int,
	`nflTeam` varchar(8),
	`position` varchar(8),
	`signalType` enum('role_up','role_down','injury_risk','workload_risk','hidden_opportunity','depth_chart_change','coach_trust_up','coach_trust_down','return_from_injury','neutral') NOT NULL,
	`magnitude` int NOT NULL DEFAULT 50,
	`projectionImpactPct` int NOT NULL DEFAULT 0,
	`summary` text NOT NULL,
	`confidence` int NOT NULL DEFAULT 70,
	`headline` text,
	`articleDescription` text,
	`sourceType` enum('espn_news','espn_injury','rss') DEFAULT 'espn_news',
	`publishedAt` timestamp,
	`cachedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `player_news_signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pns_player_name` ON `player_news_signals` (`playerName`);--> statement-breakpoint
CREATE INDEX `idx_pns_espn_id` ON `player_news_signals` (`espnPlayerId`);--> statement-breakpoint
CREATE INDEX `idx_pns_expires` ON `player_news_signals` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `idx_pns_signal_type` ON `player_news_signals` (`signalType`);