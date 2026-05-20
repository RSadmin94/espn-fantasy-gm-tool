DROP INDEX `idx_view_health_season_view` ON `espn_view_health`;--> statement-breakpoint
ALTER TABLE `espn_view_health` ADD CONSTRAINT `uq_season_view` UNIQUE(`season`,`viewName`);