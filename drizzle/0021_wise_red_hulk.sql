ALTER TABLE `espn_season_cache` DROP INDEX `uq_season_view`;--> statement-breakpoint
ALTER TABLE `espn_season_cache` ADD `leagueConnectionId` int;--> statement-breakpoint
ALTER TABLE `espn_season_cache` ADD CONSTRAINT `uq_lc_season_view` UNIQUE(`leagueConnectionId`,`season`,`viewName`);--> statement-breakpoint
CREATE INDEX `idx_esc_season_view` ON `espn_season_cache` (`season`,`viewName`);