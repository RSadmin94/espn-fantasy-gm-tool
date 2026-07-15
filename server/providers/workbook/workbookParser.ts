/**
 * Sleeper Data Import workbook parser (version-aware entry point).
 */

import * as XLSX from "xlsx";

export const SLEEPER_WORKBOOK_V8_VERSION = "v8" as const;
export type SleeperWorkbookVersion = typeof SLEEPER_WORKBOOK_V8_VERSION;

export type WorkbookSheetMatrix = string[][];

export type ParsedSleeperWorkbookInfo = {
  username: string;
  year: number;
  throughWeek: number;
  leagueLabel: string;
  focalUserId: string;
};

export type ParsedSleeperWorkbook = {
  version: SleeperWorkbookVersion;
  sheetNames: string[];
  sheets: Record<string, WorkbookSheetMatrix>;
  info: ParsedSleeperWorkbookInfo;
};

function normCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return String(v.getFullYear());
  return String(v).replace(/\s+/g, " ").trim();
}

export function sheetToMatrix(ws: XLSX.WorkSheet): WorkbookSheetMatrix {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: WorkbookSheetMatrix = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c: c });
      const cell = ws[addr];
      row.push(normCell(cell?.v ?? cell?.w ?? ""));
    }
    rows.push(row);
  }
  return rows;
}

function parseInfoSheet(matrix: WorkbookSheetMatrix): ParsedSleeperWorkbookInfo {
  const kv = new Map<string, string>();
  for (const row of matrix) {
    const key = normCell(row[0]).toLowerCase();
    if (!key) continue;
    kv.set(key, normCell(row[1]));
  }

  const year = Number(kv.get("year"));
  const throughWeek = Number(kv.get("through week"));

  return {
    username: kv.get("username") || "",
    year: Number.isFinite(year) ? year : 0,
    throughWeek: Number.isFinite(throughWeek) ? throughWeek : 0,
    leagueLabel: kv.get("league") || "",
    focalUserId: normCell(matrix[0]?.[2]),
  };
}

function detectVersion(sheetNames: string[]): SleeperWorkbookVersion | null {
  const names = new Set(sheetNames.map((n) => n.trim().toLowerCase()));
  const v8Markers = ["info", "users", "roster summary", "weekly results", "draft result", "leagues", "settings"];
  if (v8Markers.every((m) => [...names].some((n) => n === m))) {
    return SLEEPER_WORKBOOK_V8_VERSION;
  }
  return null;
}

export function parseWorkbookBytes(buffer: Buffer): ParsedSleeperWorkbook {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const version = detectVersion(book.SheetNames);
  if (!version) {
    throw new Error("unsupported_workbook_version");
  }

  const sheets: Record<string, WorkbookSheetMatrix> = {};
  for (const name of book.SheetNames) {
    sheets[name] = sheetToMatrix(book.Sheets[name]!);
  }

  const infoSheet = sheets["Info"] ?? sheets["info"];
  if (!infoSheet?.length) {
    throw new Error("missing_info_sheet");
  }

  return {
    version,
    sheetNames: [...book.SheetNames],
    sheets,
    info: parseInfoSheet(infoSheet),
  };
}

export function getSheet(parsed: ParsedSleeperWorkbook, ...aliases: string[]): WorkbookSheetMatrix {
  for (const alias of aliases) {
    const exact = parsed.sheets[alias];
    if (exact?.length) return exact;
    const hit = Object.entries(parsed.sheets).find(
      ([name]) => name.trim().toLowerCase() === alias.trim().toLowerCase(),
    );
    if (hit?.[1]?.length) return hit[1];
  }
  return [];
}

export function normHeaderKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function headerIndexMap(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((cell, idx) => {
    const key = normHeaderKey(cell);
    if (key && !map.has(key)) map.set(key, idx);
  });
  return map;
}

export function pickColumn(map: Map<string, number>, aliases: string[]): number | null {
  for (const alias of aliases) {
    const key = normHeaderKey(alias);
    if (map.has(key)) return map.get(key)!;
    for (const [k, idx] of map.entries()) {
      if (k.includes(key) || key.includes(k)) return idx;
    }
  }
  return null;
}

export function parseNumber(value: string): number {
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function excelSerialToMs(serial: string): number {
  const n = parseNumber(serial);
  if (n <= 0) return Date.now();
  return Math.round((n - 25569) * 86400 * 1000);
}
