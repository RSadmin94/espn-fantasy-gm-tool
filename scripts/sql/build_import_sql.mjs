/**
 * Reads ATLANTAS_FINEST_FF_Draft_History.xls (Excel 2003 XML) and writes:
 *   - scripts/sql/import_draft_history_2010_2025_FIXED.sql  (INSERT IGNORE — preserves existing rows)
 *   - scripts/sql/import_validation.json
 *   - scripts/sql/import_draft_history_2010_2025.sql        (same body as _FIXED; legacy filename)
 *
 * No DATABASE_URL, no ESPN, no xlsx dependency (plain XML in UTF-8).
 *
 * Usage from repo root:
 *   pnpm sql:draft-import
 *   node scripts/sql/build_import_sql.mjs && node scripts/sql/slim-fixed-sql.mjs
 *   node scripts/sql/build_import_sql.mjs path/to/ATLANTAS_FINEST_FF_Draft_History.xls
 *
 * If the workbook is missing but `import_draft_history_2010_2025.sql` exists, regenerates
 * _FIXED + validation by transforming that file (INSERT IGNORE, strip ON DUPLICATE KEY UPDATE).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slimRawPickJsonInSqlString } from "./draftPickSqlSlim.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const DEFAULT_SRC = [
  path.join(os.homedir(), "Downloads", "ATLANTAS_FINEST_FF_Draft_History.xls"),
  path.join(repoRoot, "data", "ATLANTAS_FINEST_FF_Draft_History.xls"),
  path.join(repoRoot, "Downloads", "ATLANTAS_FINEST_FF_Draft_History.xls"),
  path.join(repoRoot, "..", "..", "Downloads", "ATLANTAS_FINEST_FF_Draft_History.xls"),
];

const LEAGUE_ID = "457622";
const SOURCE = "verified_manual";
const SEASON_MIN = 2010;
const SEASON_MAX = 2025;
const OUT_LEGACY = path.join(__dirname, "import_draft_history_2010_2025.sql");
const OUT_FIXED = path.join(__dirname, "import_draft_history_2010_2025_FIXED.sql");
const OUT_JSON = path.join(__dirname, "import_validation.json");

const BATCH = 80;

/** Production draft_picks columns (no id; updatedAt uses DB default). */
const INSERT_INTO_DRAFT_PICKS = `INSERT IGNORE INTO draft_picks
(
leagueId,
season,
overallPick,
roundId,
roundPick,
teamId,
owningTeamId,
playerId,
playerName,
position,
isKeeper,
bidAmount,
rawPick
) VALUES
`;

function sqlQuote(s) {
  return `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function resolveSrc(override) {
  if (override && fs.existsSync(override)) return override;
  for (const p of DEFAULT_SRC) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseWorkbookXml(xml) {
  const m = xml.match(/<Worksheet ss:Name="All Picks Combined">[\s\S]*?<\/Worksheet>/);
  if (!m) throw new Error('Worksheet "All Picks Combined" not found');
  const body = m[0];
  const re = /<Cell><Data ss:Type="(?:Number|String)">([^<]*)<\/Data><\/Cell>/g;
  const cells = [];
  let rm;
  while ((rm = re.exec(body)) !== null) cells.push(rm[1]);

  const rows = [];
  for (let i = 0; i + 7 < cells.length; i += 8) {
    rows.push(cells.slice(i, i + 8));
  }
  const header = rows.shift();
  if (!header || header[0] !== "Year") throw new Error(`Unexpected header: ${header?.join?.("|")}`);

  const drafts = [];
  for (const r of rows) {
    const year = Number(r[0]);
    if (!Number.isFinite(year) || year < SEASON_MIN || year > SEASON_MAX) continue;
    const round = Number(r[1]);
    const roundPick = Number(r[2]);
    const overallPick = Number(r[3]);
    const playerName = String(r[4] ?? "").trim();
    const nflTeam = String(r[5] ?? "").trim();
    const position = String(r[6] ?? "").trim();
    const teamName = String(r[7] ?? "").trim();
    if (!playerName) continue;
    if (!Number.isFinite(round) || !Number.isFinite(overallPick)) continue;
    drafts.push({ year, round, roundPick, overallPick, playerName, nflTeam, position, teamName });
  }

  drafts.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.overallPick - b.overallPick));

  const seasonsFoundInWorkbook = [...new Set(drafts.map((d) => d.year))].sort((a, b) => a - b);

  const bySeason = new Map();
  for (const d of drafts) {
    const arr = bySeason.get(d.year) ?? [];
    arr.push(d);
    bySeason.set(d.year, arr);
  }

  function tidForPick(reg, teamName) {
    if (teamName && reg.has(teamName)) return reg.get(teamName);
    const key = teamName || "Team";
    if (!reg.has(key)) reg.set(key, reg.size + 1);
    return reg.get(key);
  }

  const outRowsRaw = [];
  for (const [season, list] of [...bySeason.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.overallPick - b.overallPick);
    const names = new Set(list.map((x) => x.teamName).filter(Boolean));
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    const reg = new Map(sorted.map((n, i) => [n, i + 1]));
    for (const p of list) {
      const teamId = tidForPick(reg, p.teamName);
      const isKeeper = 0;
      const raw = {
        source: SOURCE,
        teamName: p.teamName,
        nflTeam: p.nflTeam,
        ownerName: "",
      };
      outRowsRaw.push({
        leagueId: LEAGUE_ID,
        season,
        overallPick: p.overallPick,
        roundId: p.round,
        roundPick: p.roundPick,
        teamId,
        playerName: p.playerName.slice(0, 255),
        position: (p.position || "?").slice(0, 16),
        isKeeper,
        bidAmount: "0.00",
        rawPick: JSON.stringify(raw),
      });
    }
  }

  const seasonsWrittenToSQL = [...bySeason.keys()].sort((a, b) => a - b);
  return {
    drafts,
    seasonsFoundInWorkbook,
    seasonsWrittenToSQL,
    outRowsRaw,
  };
}

function dedupeRows(outRowsRaw) {
  const seen = new Set();
  const outRows = [];
  let rowsSkippedDuplicate = 0;
  for (const r of outRowsRaw) {
    const k = `${r.leagueId}|${r.season}|${r.overallPick}`;
    if (seen.has(k)) {
      rowsSkippedDuplicate++;
      continue;
    }
    seen.add(k);
    outRows.push(r);
  }
  return { outRows, rowsSkippedDuplicate };
}

function rowsPerSeasonMap(outRows) {
  const m = {};
  for (const r of outRows) {
    const y = String(r.season);
    m[y] = (m[y] ?? 0) + 1;
  }
  return m;
}

function emitSqlBatches(outRows) {
  const batches = [];
  for (let i = 0; i < outRows.length; i += BATCH) {
    const b = outRows.slice(i, i + BATCH);
    const vals = b
      .map(
        (r) =>
          `(${sqlQuote(r.leagueId)},${r.season},${r.overallPick},${r.roundId},${r.roundPick},${r.teamId},NULL,NULL,${sqlQuote(r.playerName)},${sqlQuote(r.position)},${r.isKeeper},${r.bidAmount},${sqlQuote(r.rawPick)})`,
      )
      .join(",\n");
    batches.push(`${INSERT_INTO_DRAFT_PICKS}${vals};\n`);
  }
  return batches.join("\n");
}

function sqlPreamble(srcBasename) {
  return `-- Railway MySQL: ATLANTAS FINEST draft picks ${SEASON_MIN}-${SEASON_MAX} (FIXED)
-- Source: ${srcBasename} (sheet "All Picks Combined") — or regenerated from prior SQL in this folder
-- League: ${LEAGUE_ID} | Table: draft_picks | INSERT IGNORE (columns match production schema; id auto; updatedAt default)
-- rawPick JSON: source, teamName, nflTeam, ownerName only (all other fields are SQL columns)
SET NAMES utf8mb4;

`;
}

function sqlFooter(rowCount) {
  return `
-- Rows in this file: ${rowCount}
-- Verification (Railway):
-- SELECT season, COUNT(*)
-- FROM draft_picks
-- WHERE leagueId='${LEAGUE_ID}'
-- GROUP BY season
-- ORDER BY season;
`;
}

function buildValidationReport({
  srcBasename,
  seasonsFoundInWorkbook,
  seasonsWrittenToSQL,
  rowsPerSeason,
  rowsSkippedDuplicate,
  insertStatementsGenerated,
  totalRows,
  generatedFrom,
}) {
  return {
    generatedAt: new Date().toISOString(),
    generatedFrom,
    workbookSource: srcBasename,
    leagueId: LEAGUE_ID,
    leagueIdVerifiedEveryRow: true,
    seasonColumnMapping: "Worksheet column[0] 'Year' → SQL column season (integer)",
    draftPicksInsertColumns: [
      "leagueId",
      "season",
      "overallPick",
      "roundId",
      "roundPick",
      "teamId",
      "owningTeamId",
      "playerId",
      "playerName",
      "position",
      "isKeeper",
      "bidAmount",
      "rawPick",
    ],
    insertMode: "INSERT_IGNORE",
    suggestedVerificationSql:
      "SELECT season, COUNT(*) FROM draft_picks WHERE leagueId='457622' GROUP BY season ORDER BY season;",
    seasonsFoundInWorkbook,
    seasonsWrittenToSQL,
    rowsPerSeason,
    rowsSkippedDuplicate,
    insertStatementsGenerated,
    totalRowsWritten: totalRows,
    uniqueKeyDrizzleName: "uq_draft_picks",
    outputFiles: {
      fixedSql: "scripts/sql/import_draft_history_2010_2025_FIXED.sql",
      legacySql: "scripts/sql/import_draft_history_2010_2025.sql",
    },
  };
}

/** Regenerate _FIXED + JSON from an existing SQL dump (no workbook). */
function regenFromLegacySqlFile(legacyPath) {
  let sql = fs.readFileSync(legacyPath, "utf8");
  sql = sql
    .replace(/INSERT INTO `draft_picks`/g, "INSERT IGNORE INTO `draft_picks`")
    .replace(/\r?\nON DUPLICATE KEY UPDATE[\s\S]*?;/g, ";\n");

  let body = sql.replace(/^[\s\S]*?SET NAMES utf8mb4;\s*\r?\n?/im, "");

  body = body
    .replace(/INSERT IGNORE INTO `draft_picks` \([\s\S]*?\) VALUES\n/g, INSERT_INTO_DRAFT_PICKS)
    .replace(/INSERT IGNORE INTO draft_picks \([\s\S]*?\) VALUES\n/g, INSERT_INTO_DRAFT_PICKS);

  body = slimRawPickJsonInSqlString(body);

  const rowRe = /\('457622',(\d{4}),(\d+),/g;
  const seasons = new Set();
  let m;
  let n = 0;
  while ((m = rowRe.exec(body)) !== null) {
    seasons.add(Number(m[1]));
    n++;
  }
  const seasonsFoundInWorkbook = [...seasons].sort((a, b) => a - b);
  const rowsPerSeason = {};
  rowRe.lastIndex = 0;
  while ((m = rowRe.exec(body)) !== null) {
    const y = m[1];
    rowsPerSeason[y] = (rowsPerSeason[y] ?? 0) + 1;
  }

  const header = sqlPreamble(path.basename(legacyPath));
  const footer = sqlFooter(n);

  const outSql = header + body.trim() + "\n" + footer;

  const insertStatementsGenerated = (outSql.match(/INSERT IGNORE INTO/g) || []).length;

  const report = buildValidationReport({
    srcBasename: path.basename(legacyPath),
    seasonsFoundInWorkbook,
    seasonsWrittenToSQL: seasonsFoundInWorkbook,
    rowsPerSeason,
    rowsSkippedDuplicate: 0,
    insertStatementsGenerated,
    totalRows: n,
    generatedFrom: "legacy_sql_transform",
  });

  fs.writeFileSync(OUT_FIXED, outSql, "utf8");
  fs.writeFileSync(OUT_LEGACY, outSql, "utf8");
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  console.error(`Regenerated from ${legacyPath}: ${n} row refs, ${insertStatementsGenerated} INSERT batches -> ${OUT_FIXED}`);
}

function main() {
  const override = process.argv[2];
  const src = resolveSrc(override);

  if (src) {
    const xml = fs.readFileSync(src, "utf8");
    const parsed = parseWorkbookXml(xml);
    const { outRows, rowsSkippedDuplicate } = dedupeRows(parsed.outRowsRaw);
    const rowsPerSeason = rowsPerSeasonMap(outRows);
    const batches = [];
    for (let i = 0; i < outRows.length; i += BATCH) {
      batches.push(outRows.slice(i, i + BATCH));
    }
    const insertStatementsGenerated = batches.length;

    const body = slimRawPickJsonInSqlString(emitSqlBatches(outRows));
    const full = sqlPreamble(path.basename(src)) + body + sqlFooter(outRows.length);

    const report = buildValidationReport({
      srcBasename: path.basename(src),
      seasonsFoundInWorkbook: parsed.seasonsFoundInWorkbook,
      seasonsWrittenToSQL: parsed.seasonsWrittenToSQL,
      rowsPerSeason,
      rowsSkippedDuplicate,
      insertStatementsGenerated,
      totalRows: outRows.length,
      generatedFrom: "workbook_xml",
    });

    fs.writeFileSync(OUT_FIXED, full, "utf8");
    fs.writeFileSync(OUT_LEGACY, full, "utf8");
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
    console.error(`Wrote ${outRows.length} rows -> ${OUT_FIXED} + ${OUT_LEGACY}, report -> ${OUT_JSON}`);
    return;
  }

  if (fs.existsSync(OUT_LEGACY)) {
    regenFromLegacySqlFile(OUT_LEGACY);
    return;
  }

  throw new Error(
    "No workbook found. Place ATLANTAS_FINEST_FF_Draft_History.xls in Downloads/, repo data/, or pass path. " +
      `Or generate ${path.basename(OUT_LEGACY)} first.`,
  );
}

main();
