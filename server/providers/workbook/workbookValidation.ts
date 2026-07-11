/**
 * Structural validation for Sleeper Data Import v8 workbooks.
 */

import type { ParsedSleeperWorkbook } from "./workbookParser";
import { getSheet } from "./workbookParser";

export type WorkbookValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  version: string;
};

const V8_REQUIRED_SHEETS = ["Info", "Users", "Roster Summary", "Leagues", "Settings"] as const;

const V8_OPTIONAL_SHEETS = [
  "Rosters",
  "Standings",
  "Weekly Results",
  "Draft Result",
  "Transactions",
  "Schedule",
  "Awards",
  "Playoffs",
  "Diagnostics",
  "Players Database",
] as const;

function sheetHasData(parsed: ParsedSleeperWorkbook, name: string): boolean {
  const matrix = getSheet(parsed, name);
  return matrix.length > 1 && matrix.some((row) => row.some((cell) => cell.trim().length > 0));
}

export function validateSleeperWorkbookV8(parsed: ParsedSleeperWorkbook): WorkbookValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (parsed.version !== "v8") {
    errors.push(`Unsupported workbook version: ${parsed.version}`);
  }

  for (const required of V8_REQUIRED_SHEETS) {
    if (!sheetHasData(parsed, required)) {
      errors.push(`Missing required worksheet: ${required}`);
    }
  }

  if (!parsed.info.year) {
    errors.push("Missing league season (Info → Year)");
  }

  if (!parsed.info.leagueLabel.trim()) {
    warnings.push("League label missing in Info sheet");
  }

  const users = getSheet(parsed, "Users");
  if (users.length <= 1) {
    errors.push("Users worksheet has no owner rows");
  }

  const rosterSummary = getSheet(parsed, "Roster Summary");
  if (rosterSummary.length <= 1) {
    errors.push("Roster Summary worksheet has no team rows");
  }

  const leagues = getSheet(parsed, "Leagues");
  if (leagues.length <= 1) {
    errors.push("Leagues worksheet has no league rows");
  } else if (parsed.info.year) {
    const header = leagues[0] ?? [];
    const seasonIdx = header.findIndex((h) => normHeader(h) === "season");
    const seasons = leagues
      .slice(1)
      .map((row) => Number(row[seasonIdx]))
      .filter((n) => Number.isFinite(n) && n > 0);
    const seasonMatches = seasons.filter((s) => s === parsed.info.year);
    if (seasonMatches.length === 0) {
      errors.push(`Leagues worksheet has no row for season ${parsed.info.year}`);
    }
    if (seasonMatches.length > 1) {
      warnings.push(
        `Leagues worksheet has ${seasonMatches.length} rows for season ${parsed.info.year}; importer will match Settings/Info league name`,
      );
    }
  }

  for (const optional of V8_OPTIONAL_SHEETS) {
    if (!sheetHasData(parsed, optional)) {
      warnings.push(`Optional worksheet empty or missing: ${optional}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    version: parsed.version,
  };
}

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function listWorkbookAudit(parsed: ParsedSleeperWorkbook): Array<{
  name: string;
  rowCount: number;
  columnCount: number;
  purpose: string;
  mapsTo: string;
  v1Status: "mapped" | "ignored";
}> {
  const purposeBySheet: Record<string, { purpose: string; mapsTo: string; v1Status: "mapped" | "ignored" }> = {
    Info: { purpose: "Import metadata (username, year, week, league label)", mapsTo: "settings (season, labels)", v1Status: "mapped" },
    Diagnostics: { purpose: "Sleeper macro run log", mapsTo: "—", v1Status: "ignored" },
    Rosters: { purpose: "Per-player roster slots", mapsTo: "rosters", v1Status: "mapped" },
    "Roster Summary": { purpose: "Team/franchise summary per roster", mapsTo: "teams", v1Status: "mapped" },
    Standings: { purpose: "Season standings by user", mapsTo: "teams (wins/losses/points)", v1Status: "mapped" },
    "Weekly Results": { purpose: "Weekly scores and opponents", mapsTo: "matchups", v1Status: "mapped" },
    "Player Results": { purpose: "Weekly player stat lines", mapsTo: "—", v1Status: "ignored" },
    Awards: { purpose: "Season awards", mapsTo: "—", v1Status: "ignored" },
    Playoffs: { purpose: "Playoff bracket", mapsTo: "—", v1Status: "ignored" },
    Transactions: { purpose: "Adds, drops, waivers, trades", mapsTo: "transactions", v1Status: "mapped" },
    "Free Agents": { purpose: "Weekly FA pool snapshot", mapsTo: "—", v1Status: "ignored" },
    Balance: { purpose: "Entry fees and transaction costs", mapsTo: "—", v1Status: "ignored" },
    Schedule: { purpose: "Regular-season schedule matrix", mapsTo: "—", v1Status: "ignored" },
    "Owned Draft Picks": { purpose: "Future pick ownership", mapsTo: "—", v1Status: "ignored" },
    "Draft Result": { purpose: "Completed draft picks", mapsTo: "draftPicks", v1Status: "mapped" },
    "Players Database": { purpose: "Sleeper NFL player catalog snapshot", mapsTo: "—", v1Status: "ignored" },
    Leagues: { purpose: "League API payload (ids, scoring, settings)", mapsTo: "settings", v1Status: "mapped" },
    Settings: { purpose: "League settings JSON paths", mapsTo: "settings", v1Status: "mapped" },
    Users: { purpose: "League member identities", mapsTo: "teams.ownerId / owners", v1Status: "mapped" },
  };

  return parsed.sheetNames.map((name) => {
    const matrix = parsed.sheets[name] ?? [];
    const rowCount = matrix.length;
    const columnCount = matrix.reduce((max, row) => Math.max(max, row.length), 0);
    const meta = purposeBySheet[name] ?? {
      purpose: name.startsWith("Week ") ? "Weekly roster snapshot tab" : "Sleeper export tab",
      mapsTo: name.startsWith("Week ") ? "—" : "—",
      v1Status: "ignored" as const,
    };
    if (name.endsWith(" Data") || (name.startsWith("Week ") && !name.includes("Week 1"))) {
      return {
        name,
        rowCount,
        columnCount,
        purpose: "Per-week player stat export (duplicate of Player Results when populated)",
        mapsTo: "—",
        v1Status: "ignored" as const,
      };
    }
    return { name, rowCount, columnCount, ...meta };
  });
}
