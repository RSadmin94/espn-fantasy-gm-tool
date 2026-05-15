DROP TABLE `espn_team_ownership`;--> statement-breakpoint
ALTER TABLE `espn_season_cache` DROP INDEX `uq_lc_season_view`;--> statement-breakpoint
DROP INDEX `idx_esc_season_view` ON `espn_season_cache`;--> statement-breakpoint
ALTER TABLE `espn_season_cache` ADD CONSTRAINT `uq_season_view` UNIQUE(`season`,`viewName`);--> statement-breakpoint
ALTER TABLE `espn_season_cache` DROP COLUMN `leagueConnectionId`;