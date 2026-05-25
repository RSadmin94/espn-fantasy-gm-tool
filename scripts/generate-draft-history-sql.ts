/**
 * Build `scripts/sql/import_draft_history_2010_2025.sql` from a local .xls workbook.
 * No DATABASE_URL, no API, no ESPN — writes static SQL for Railway MySQL Query tab.
 *
 * Default input: data/ATLANTAS_FINEST_FF_Draft_History.xls
 * If missing, falls back to data/ATLANTAS_FINEST_FF_History.xls (same draft sheet parser).
 *
 * Usage:
 *   pnpm exec tsx scripts/generate-draft-history-sql.ts
 *   pnpm exec tsx scripts/generate-draft-history-sql.ts --file=path/to.xls --league-id=457622 --out=scripts/sql/import_draft_history_2010_2025.sql
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  parseManualHistoryWorkbookBuffer,
  standingsRowsForSeasonOrDraftTeams,
  teamIdRegistryForSeason,
  type ManualDraftRow,
} from "../server/manualWorkbookParser";

const SOURCE = "verified_manual" as const;
const SEASON_MIN = 2010;
const SEASON_MAX = 2025;

function safeStringify(value: unknown): string {
  try {
    if (value === undefined) return "null";
    return JSON.stringify(value, (_k, v) => (v === undefined ? null : v));
  } catch {
    return "{}";
  }
}

function sqlQuote(s: string): string {
  return `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function resolveWorkbookPath(cwd: string): string {
  const candidates = [
    join(cwd, "data", "ATLANTAS_FINEST_FF_Draft_History.xls"),
    join(cwd, "Downloads", "ATLANTAS_FINEST_FF_Draft_History.xls"),
    join(cwd, "..", "..", "Downloads", "ATLANTAS_FINEST_FF_Draft_History.xls"),
    join(cwd, "data", "ATLANTAS_FINEST_FF_History.xls"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return join(cwd, "data", "ATLANTAS_FINEST_FF_Draft_History.xls");
}

function parseArgs(argv: string[]) {
  const cwd = process.cwd();
  let leagueId = String(process.env.ESPN_LEAGUE_ID ?? process.env.LEAGUE_ID ?? "457622").trim().slice(0, 32);
  let explicitFile: string | undefined;
  let outPath = join(cwd, "scripts", "sql", "import_draft_history_2010_2025.sql");
  for (const a of argv.slice(2)) {
    if (a.startsWith("--league-id=")) leagueId = a.slice("--league-id=".length).trim().slice(0, 32);
    if (a.startsWith("--file=")) explicitFile = a.slice("--file=".length).trim();
    if (a.startsWith("--out=")) outPath = a.slice("--out=".length).trim();
  }
  if (explicitFile) {
    if (!existsSync(explicitFile)) {
      console.error(`Workbook not found: ${explicitFile}`);
      process.exit(1);
    }
    return { leagueId, filePath: explicitFile, outPath };
  }
  const resolved = resolveWorkbookPath(cwd);
  if (!existsSync(resolved)) {
    console.error(
      `Workbook not found. Place ATLANTAS_FINEST_FF_Draft_History.xls under data/, Downloads/, or pass --file=...`,
    );
    process.exit(1);
  }
  console.warn(`[generate-draft-history-sql] Using workbook: ${resolved}`);
  return { leagueId, filePath: resolved, outPath };
}

function tidForPick(reg: Map<string, number>, teamName: string, ownerName: string): number {
  if (teamName && reg.has(teamName)) return reg.get(teamName)!;
  const key = teamName || ownerName || "Team";
  if (!reg.has(key)) {
    const next = reg.size + 1;
    reg.set(key, next);
  }
  return reg.get(key)!;
}

type SqlRow = {
  leagueId: string;
  season: number;
  overallPick: number;
  roundId: number;
  roundPick: number;
  teamId: number;
  playerName: string;
  position: string;
  isKeeper: number;
  rawPick: string;
};

function buildRows(parsed: ReturnType<typeof parseManualHistoryWorkbookBuffer>, leagueId: string): SqlRow[] {
  const picks = parsed.drafts
    .filter((d) => d.season >= SEASON_MIN && d.season <= SEASON_MAX && d.season !== 2009)
    .sort((a, b) => (a.season !== b.season ? a.season - b.season : a.overallPick - b.overallPick));

  const bySeason = new Map<number, ManualDraftRow[]>();
  for (const d of picks) {
    const arr = bySeason.get(d.season) ?? [];
    arr.push(d);
    bySeason.set(d.season, arr);
  }

  const rows: SqlRow[] = [];
  for (const [season, list] of [...bySeason.entries()].sort((a, b) => a[0] - b[0])) {
    const draftReg = teamIdRegistryForSeason(season, standingsRowsForSeasonOrDraftTeams(parsed, season));
    for (const d of list.sort((a, b) => a.overallPick - b.overallPick)) {
      const teamId = tidForPick(draftReg, d.teamName, d.ownerName);
      const rawPick = safeStringify({
        source: SOURCE,
        overallPickNumber: d.overallPick,
        roundId: d.round,
        roundPickNumber: d.roundPick,
        teamId,
        playerName: d.playerName,
        position: d.position,
        proTeam: d.nflTeam,
        keeper: d.isKeeper,
        ownerName: d.ownerName,
      });
      rows.push({
        leagueId,
        season,
        overallPick: d.overallPick,
        roundId: d.round,
        roundPick: d.roundPick,
        teamId,
        playerName: d.playerName.slice(0, 255),
        position: (d.position || "?").slice(0, 16),
        isKeeper: d.isKeeper ? 1 : 0,
        rawPick,
      });
    }
  }
  return rows;
}

function emitSql(rows: SqlRow[], sourceLabel: string): string {
  const header = [
    "-- Railway MySQL: verified manual draft picks (2010-2025, excludes 2009)",
    `-- Source: ${sourceLabel}`,
    "-- Table: draft_picks  |  Unique: (leagueId, season, overallPick)",
    "SET NAMES utf8mb4;",
    "",
  ].join("\n");

  const cols =
    "`leagueId`,`season`,`overallPick`,`roundId`,`roundPick`,`teamId`,`owningTeamId`,`playerId`,`playerName`,`position`,`isKeeper`,`bidAmount`,`rawPick`,`updatedAt`";

  const batchSize = 80;
  const chunks: string[] = [header];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch
      .map(
        (r) =>
          `(${sqlQuote(r.leagueId)},${r.season},${r.overallPick},${r.roundId},${r.roundPick},${r.teamId},NULL,NULL,${sqlQuote(r.playerName)},${sqlQuote(r.position)},${r.isKeeper},0,${sqlQuote(r.rawPick)},NOW())`,
      )
      .join(",\n");

    chunks.push(`INSERT INTO \`draft_picks\` (${cols}) VALUES
${values}
ON DUPLICATE KEY UPDATE
  \`roundId\` = VALUES(\`roundId\`),
  \`roundPick\` = VALUES(\`roundPick\`),
  \`teamId\` = VALUES(\`teamId\`),
  \`owningTeamId\` = VALUES(\`owningTeamId\`),
  \`playerId\` = VALUES(\`playerId\`),
  \`playerName\` = VALUES(\`playerName\`),
  \`position\` = VALUES(\`position\`),
  \`isKeeper\` = VALUES(\`isKeeper\`),
  \`bidAmount\` = VALUES(\`bidAmount\`),
  \`rawPick\` = VALUES(\`rawPick\`),
  \`updatedAt\` = VALUES(\`updatedAt\`);
`);
  }

  chunks.push(`-- Rows: ${rows.length}`);
  return chunks.join("\n");
}

function main() {
  const { leagueId, filePath, outPath } = parseArgs(process.argv);
  if (!existsSync(filePath)) {
    console.error(`Workbook not found: ${filePath}`);
    process.exit(1);
  }

  const buf = readFileSync(filePath);
  const parsed = parseManualHistoryWorkbookBuffer(buf, filePath);
  const rows = buildRows(parsed, leagueId);
  if (rows.length === 0) {
    console.error("No draft rows found for seasons 2010-2025. Check sheet headers (PLAYER, ROUND, SEASON/YEAR).");
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  const sql = emitSql(rows, filePath);
  writeFileSync(outPath, sql, "utf8");
  console.log(`Wrote ${rows.length} pick rows → ${outPath}`);
}

main();
