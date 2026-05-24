-- Allow large combined ESPN payloads (MySQL JSON type is size-limited vs LONGTEXT).
ALTER TABLE `espn_season_cache` MODIFY COLUMN `payload` LONGTEXT NOT NULL;
