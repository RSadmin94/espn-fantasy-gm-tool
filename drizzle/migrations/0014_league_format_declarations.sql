-- League-level declared format override (redraft | keeper | dynasty).
-- League-keyed (sticky across seasons); authoritative over best-effort ESPN detection.
CREATE TABLE IF NOT EXISTS `league_format_declarations` (
  `leagueId` VARCHAR(32) NOT NULL PRIMARY KEY,
  `declaredFormat` VARCHAR(16) NOT NULL,
  `declaredByUserId` INT NULL,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)
