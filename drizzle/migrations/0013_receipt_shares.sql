-- Receipt short links: maps a short code -> the full signed Receipt token,
-- so shared URLs are /r/<code> (~30 chars) instead of /p/<~400-char token>.
CREATE TABLE IF NOT EXISTS `receipt_shares` (
  `code` VARCHAR(16) NOT NULL PRIMARY KEY,
  `token` TEXT NOT NULL,
  `memberId` VARCHAR(64) NULL,
  `leagueId` VARCHAR(32) NULL,
  `createdByUserId` INT NULL,
  `views` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_rs_createdByUserId` (`createdByUserId`),
  INDEX `idx_rs_createdAt` (`createdAt`)
)
