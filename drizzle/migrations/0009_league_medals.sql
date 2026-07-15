CREATE TABLE IF NOT EXISTS `league_medals` (
  `id` int AUTO_INCREMENT NOT NULL,
  `leagueId` varchar(32) NOT NULL,
  `season` int NOT NULL,
  `championOwner` varchar(255) NOT NULL DEFAULT '',
  `runnerUpOwner` varchar(255) NOT NULL DEFAULT '',
  `thirdPlaceOwner` varchar(255) NOT NULL DEFAULT '',
  `source` varchar(64) NOT NULL DEFAULT 'espn_history_medal',
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `league_medals_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_league_medals` UNIQUE(`leagueId`, `season`)
);
