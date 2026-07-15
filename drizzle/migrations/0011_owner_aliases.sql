CREATE TABLE IF NOT EXISTS `owner_aliases` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `leagueId` VARCHAR(32) NOT NULL,
  `legacyTeamName` VARCHAR(255) NOT NULL,
  `legacySeason` INT NULL,
  `resolvedOwnerName` VARCHAR(255) NULL,
  `confidence` INT NOT NULL DEFAULT 0,
  `resolutionMethod` VARCHAR(64) NOT NULL DEFAULT 'unresolved',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `notes` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_owner_aliases` (`leagueId`, `legacyTeamName`)
);
