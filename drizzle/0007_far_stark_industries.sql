DROP INDEX `idx_season_view` ON `espn_season_cache`;--> statement-breakpoint
ALTER TABLE `espn_season_cache` ADD CONSTRAINT `uq_season_view` UNIQUE(`season`,`viewName`);