-- Step 1: Delete duplicate draft_picks rows, keeping the latest (highest id) per (leagueId, season, overallPick).
-- No-op if no duplicates exist (DELETE affects 0 rows = success).
DELETE FROM draft_picks WHERE id NOT IN (SELECT max_id FROM (SELECT MAX(id) AS max_id FROM draft_picks GROUP BY leagueId, season, overallPick) AS _keepers);

-- Step 2: Add unique key. ER_DUP_KEYNAME is caught by the migration runner if it already exists.
ALTER TABLE draft_picks ADD UNIQUE KEY `uq_draft_picks` (`leagueId`, `season`, `overallPick`)
