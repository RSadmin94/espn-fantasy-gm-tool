-- season_rosters: end-of-season roster snapshots scraped from the ESPN League Rosters page.
-- One row per player per team per season. Unique on (leagueId, season, teamName, playerName).
-- acquisitionType = Draft | Trade | Free Agency  (empty for seasons where ESPN omits it).
-- ownerName is resolved from gmTeams at query time; stored blank initially.

CREATE TABLE IF NOT EXISTS season_rosters (
  id              INT          AUTO_INCREMENT PRIMARY KEY,
  leagueId        VARCHAR(32)  NOT NULL,
  season          INT          NOT NULL,
  teamName        VARCHAR(255) NOT NULL DEFAULT '',
  ownerName       VARCHAR(255) NOT NULL DEFAULT '',
  playerName      VARCHAR(255) NOT NULL,
  nflTeam         VARCHAR(32)  NOT NULL DEFAULT '',
  position        VARCHAR(16)  NOT NULL DEFAULT '',
  slot            VARCHAR(32)  NOT NULL DEFAULT '',
  acquisitionType VARCHAR(64)  NOT NULL DEFAULT '',
  injuryStatus    VARCHAR(16)  NOT NULL DEFAULT '',
  capturedAt      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_season_rosters (leagueId, season, teamName, playerName)
);
