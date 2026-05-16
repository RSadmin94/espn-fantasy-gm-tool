ALTER TABLE `espn_season_cache` DROP INDEX `uq_season_view`;--> statement-breakpoint
ALTER TABLE `espn_season_cache` ADD `leagueId` varchar(32) DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `espn_season_cache` ADD CONSTRAINT `uq_league_season_view` UNIQUE(`leagueId`,`season`,`viewName`);