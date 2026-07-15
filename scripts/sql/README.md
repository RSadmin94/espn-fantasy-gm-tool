# Railway MySQL — draft history SQL

Generates **`import_draft_history_2010_2025_FIXED.sql`** (and keeps **`import_draft_history_2010_2025.sql`** in sync) from **`ATLANTAS_FINEST_FF_Draft_History.xls`** (Excel 2003 XML). Also writes **`import_validation.json`** (seasons, row counts, insert batch count, index notes).

- **INSERT IGNORE** — new `(leagueId, season, overallPick)` rows are inserted; existing rows are **not** overwritten.
- **League id** `457622`; **season** is the workbook “Year” column; **overallPick** is the third value in each `VALUES` tuple (after `leagueId`, `season`).
- **Expected unique index**: `(leagueId, season, overallPick)` — Drizzle name `uq_draft_picks`. If Railway still has an older unique key **without** `season`, every year collides on the same `overallPick` numbers and only one season’s data survives (whether you used `ON DUPLICATE KEY UPDATE` or `INSERT IGNORE`).

## One command (from repo root)

```bash
pnpm sql:draft-import
```

Equivalent:

```bash
node scripts/sql/build_import_sql.mjs && node scripts/sql/slim-fixed-sql.mjs
```

The second step rewrites `rawPick` JSON in the generated SQL so it only contains `source`, `teamName`, `nflTeam`, and `ownerName` (no duplicate column fields).

Optional first argument: path to the workbook if it is not under `~/Downloads/`, `data/`, or `Downloads/` next to the repo.

If the workbook is missing but **`import_draft_history_2010_2025.sql`** already exists, the script regenerates **`_FIXED`**, **`import_validation.json`**, and the legacy filename by transforming that SQL (strip `ON DUPLICATE KEY UPDATE`, switch to `INSERT IGNORE`).

## After generation

Paste **`scripts/sql/import_draft_history_2010_2025_FIXED.sql`** into the Railway MySQL **Query** tab (or `mysql < …`). No `DATABASE_URL` is required for generation.

**Preferred (app schema):** load the same data with Drizzle and `DATABASE_URL` — no SQL paste:

```bash
pnpm import:draft-drizzle
```

That runs **`scripts/import-draft-history-drizzle.ts`**, which reads this folder’s **`import_draft_history_2010_2025_FIXED.sql`** (and **`import_validation.json`** for `leagueId`), inserts a single verification row, then bulk **INSERT IGNORE** via `schema.gmDraftPicks`.

Verification:

```sql
SELECT season, COUNT(*) AS cnt
FROM draft_picks
WHERE leagueId='457622'
GROUP BY season
ORDER BY season;
```

## Alternative (xlsx + shared parser)

If the workbook is binary `.xls` / `.xlsx` instead of XML:

```bash
pnpm generate:draft-sql -- --file=path/to/workbook.xls
```
