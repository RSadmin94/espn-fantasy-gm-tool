# Known failures (do not “fix” blindly)

These are **recurring problem classes** called out for Qwen / any agent takeover. Confirm with logs and repro before changing behavior.

## 1. Bad title derivation

**Symptom:** Wrong champion label, duplicate “champ” UI, or title that does not match what users see on ESPN.

**Likely cause:** Title or honorific inferred from standings, playoff bracket heuristics, or cached ESPN JSON instead of **`league_medals`**-backed data.

**Guidance:** Trace the UI to its query and table. If it is not reading medals (or a documented, user-approved fallback), treat it as a bug in **derivation**, not in ESPN.

## 2. Inflated matchup totals

**Symptom:** Season win/loss or points totals disagree with ESPN; double-counted weeks; impossible sums.

**Likely cause:** Aggregates built from overlapping sources (e.g. schedule fragments + matchup rows), wrong season filter, or counting incomplete vs complete games inconsistently.

**Guidance:** Reconcile against **`gmMatchups`** for the same `leagueId` + `season` + week keys before “fixing” math in the UI layer.

## 3. Stale UI routes

**Symptom:** 404, blank page after deploy, or feature flag route pointing at removed lazy chunk.

**Likely cause:** Router table (`App.tsx` / route config) drifted from actual pages or build output.

**Guidance:** Grep route strings and lazy imports; align with Vite build warnings if dynamic import paths changed.

## 4. Cache fallback bypassing dedupe

**Symptom:** Duplicate rows, stale draft picks reappearing, or inconsistent counts between “fresh” and “cached” loads.

**Likely cause:** A code path reads legacy cache or raw JSON without the same upsert/dedupe keys as the Drizzle path, or two writers race without a single source of truth.

**Guidance:** Map read path → write path. Prefer one pipeline (normalized tables + defined ingest) over parallel caches.

---

Document new failures here when they are confirmed root causes, not one-off local DB noise.
