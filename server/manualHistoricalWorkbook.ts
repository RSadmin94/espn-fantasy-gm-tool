/**
 * Verified manual league history workbook (.xls / .xlsx).
 * Read-only: no ESPN, no DB writes. Used by historicalDataService + routers.
 *
 * Expected sheets (names matched case-insensitive, extra spaces trimmed):
 *   Champions, Current Teams Records, All Teams Records,
 *   H2H Matrix, H2H Detailed Matchups
 *
 * Optional: any sheet whose header row looks like a draft recap (Season/Round/Player…).
 *
 * Path: VERIFIED_MANUAL_HISTORY_XLS env, else ./data/ATLANTAS_FINEST_FF_History.xls,
 * ./server/data/…, or ~/Downloads/ATLANTAS_FINEST_FF_History.xls
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type * as XLSXNS from "xlsx";

let xlsxMod: typeof XLSXNS | null = null;
async function getXlsx(): Promise<typeof XLSXNS> {
  if (!xlsxMod) xlsxMod = await import("xlsx");
  return xlsxMod;
}

export function resolveVerifiedManualXlsPath(): string | null {
  const env = process.env.VERIFIED_MANUAL_HISTORY_XLS?.trim();
  if (env && existsSync(env)) return env;
  const cwd = process.cwd();
  const candidates = [
    join(cwd, "data", "ATLANTAS_FINEST_FF_History.xls"),
    join(cwd, "data", "ATLANTAS_FINEST_FF_History.xlsx"),
    join(cwd, "server", "data", "ATLANTAS_FINEST_FF_History.xls"),
    join(cwd, "server", "data", "ATLANTAS_FINEST_FF_History.xlsx"),
    join(homedir(), "Downloads", "ATLANTAS_FINEST_FF_History.xls"),
    join(homedir(), "Downloads", "ATLANTAS_FINEST_FF_History.xlsx"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function getManualWorkbookSignature(): string {
  const p = resolveVerifiedManualXlsPath();
  if (!p) return "none";
  try {
    const st = statSync(p);
    return `${p}|${st.mtimeMs}`;
  } catch {
    return `${p}|unknown`;
  }
}

function normCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return String(v.getFullYear());
  return String(v).replace(/\s+/g, " ").trim();
}

function normKey(s: string): string {
  return s
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function manualMemberIdForOwnerName(ownerName: string): string {
  const slug = normCell(ownerName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `manual:${slug || "unknown"}`;
}

type Matrix = string[][];

function sheetMatrix(ws: XLSXNS.WorkSheet, XLSX: typeof XLSXNS): Matrix {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: Matrix = [];
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row: string[] = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      row.push(normCell(cell?.v ?? cell?.w ?? ""));
    }
    rows.push(row);
  }
  return rows;
}

function findSheetName(book: XLSXNS.WorkBook, want: string[]): string | null {
  const targets = want.map((w) => normKey(w));
  for (const name of book.SheetNames) {
    const nk = normKey(name);
    if (targets.some((t) => nk === t || nk.includes(t) || t.includes(nk))) return name;
  }
  return null;
}

function headerRowIndex(m: Matrix): number {
  for (let i = 0; i < Math.min(15, m.length); i++) {
    const row = m[i];
    if (!row) continue;
    const joined = row.map(normKey).filter(Boolean).join("|");
    if (joined.includes("SEASON") || joined.includes("YEAR")) return i;
    if (joined.includes("WEEK") && (joined.includes("HOME") || joined.includes("AWAY"))) return i;
    if (joined.includes("TEAM") && (joined.includes("W") || joined.includes("WIN"))) return i;
  }
  return 0;
}

function colMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((h, idx) => {
    const k = normKey(h);
    if (k) map[k] = idx;
  });
  return map;
}

function pickCol(map: Record<string, number>, aliases: string[]): number | null {
  for (const a of aliases) {
    const k = normKey(a);
    if (map[k] != null) return map[k]!;
    const hit = Object.keys(map).find((key) => key.includes(normKey(a)) || normKey(a).includes(key));
    if (hit != null) return map[hit]!;
  }
  return null;
}

function parseNum(s: string): number {
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export type ManualStandingRow = {
  season: number;
  teamName: string;
  ownerName: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  rank: number | null;
};

export type ManualMatchupRow = {
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  isPlayoff: boolean;
};

export type ManualDraftRow = {
  season: number;
  overallPick: number;
  round: number;
  roundPick: number;
  teamName: string;
  ownerName: string;
  playerName: string;
  position: string;
  nflTeam: string;
  isKeeper: boolean;
};

export type ManualChampionRow = {
  season: number;
  championName: string;
  runnerUpName: string | null;
};

export type ParsedManualWorkbook = {
  path: string;
  standings: ManualStandingRow[];
  matchups: ManualMatchupRow[];
  drafts: ManualDraftRow[];
  champions: ManualChampionRow[];
  /** Raw matrix: row0 = headers, col0 = row labels, cells "W-L" or "W / L" */
  h2hMatrix: Matrix | null;
  sheetNames: string[];
};

let cached: { sig: string; parsed: ParsedManualWorkbook } | null = null;

export async function loadParsedManualWorkbook(): Promise<ParsedManualWorkbook | null> {
  const path = resolveVerifiedManualXlsPath();
  if (!path) return null;
  const sig = getManualWorkbookSignature();
  if (cached && cached.sig === sig) return cached.parsed;

  const XLSX = await getXlsx();
  let book: XLSXNS.WorkBook;
  try {
    const buf = readFileSync(path);
    book = XLSX.read(buf, { type: "buffer", cellDates: true });
  } catch (e) {
    console.warn("[manualHistoricalWorkbook] failed to read workbook:", path, e);
    return null;
  }

  const sheetNames = [...book.SheetNames];
  const standings: ManualStandingRow[] = [];
  const matchups: ManualMatchupRow[] = [];
  const drafts: ManualDraftRow[] = [];
  const champions: ManualChampionRow[] = [];
  let h2hMatrix: Matrix | null = null;

  const parseStandingsFrom = (sheetName: string | null) => {
    if (!sheetName) return;
    const ws = book.Sheets[sheetName];
    if (!ws) return;
    const m = sheetMatrix(ws, XLSX);
    const hi = headerRowIndex(m);
    const headers = m[hi] || [];
    const cmap = colMap(headers);
    const cSeason = pickCol(cmap, ["SEASON", "YEAR", "YR"]);
    const cTeam = pickCol(cmap, ["TEAM", "TEAM NAME", "TEAM_NAME", "FRANCHISE"]);
    const cOwner = pickCol(cmap, ["OWNER", "MANAGER", "MEMBER", "GM", "OWNER NAME"]);
    const cW = pickCol(cmap, ["W", "WINS", "WIN"]);
    const cL = pickCol(cmap, ["L", "LOSSES", "LOSS"]);
    const cT = pickCol(cmap, ["T", "TIES", "TIE"]);
    const cPf = pickCol(cmap, ["PF", "PTS FOR", "POINTS FOR", "PF PTS"]);
    const cPa = pickCol(cmap, ["PA", "PTS AGST", "PTS AGAINST", "PA PTS", "POINTS AGAINST"]);
    const cRank = pickCol(cmap, ["RANK", "FINISH", "PLACE", "SEED", "STANDING"]);
    if (cSeason == null || cTeam == null) return;
    for (let r = hi + 1; r < m.length; r++) {
      const row = m[r];
      if (!row) continue;
      const season = parseNum(row[cSeason] ?? "");
      if (season <= 1990 || season === 2009) continue;
      const teamName = normCell(row[cTeam] ?? "");
      if (!teamName) continue;
      const ownerName = cOwner != null ? normCell(row[cOwner] ?? "") : "";
      const wins = cW != null ? parseNum(row[cW] ?? "") : 0;
      const losses = cL != null ? parseNum(row[cL] ?? "") : 0;
      const ties = cT != null ? parseNum(row[cT] ?? "") : 0;
      const pf = cPf != null ? parseNum(row[cPf] ?? "") : 0;
      const pa = cPa != null ? parseNum(row[cPa] ?? "") : 0;
      const rank = cRank != null ? parseNum(row[cRank] ?? "") : null;
      standings.push({
        season,
        teamName,
        ownerName,
        wins,
        losses,
        ties,
        pf,
        pa,
        rank: rank && rank > 0 ? rank : null,
      });
    }
  };

  parseStandingsFrom(findSheetName(book, ["All Teams Records"]));
  if (standings.length === 0) parseStandingsFrom(findSheetName(book, ["Current Teams Records"]));

  const muName = findSheetName(book, ["H2H Detailed Matchups", "Detailed Matchups", "Matchups"]);
  if (muName) {
    const ws = book.Sheets[muName];
    if (ws) {
      const m = sheetMatrix(ws, XLSX);
      const hi = headerRowIndex(m);
      const headers = m[hi] || [];
      const cmap = colMap(headers);
      const cSeason = pickCol(cmap, ["SEASON", "YEAR"]);
      const cWeek = pickCol(cmap, ["WEEK", "SCORING PERIOD", "MATCHUP", "PERIOD"]);
      const cHome = pickCol(cmap, ["HOME", "HOME TEAM", "HOME TEAM NAME", "TEAM 1"]);
      const cAway = pickCol(cmap, ["AWAY", "AWAY TEAM", "AWAY TEAM NAME", "TEAM 2"]);
      const cHs = pickCol(cmap, ["HOME SCORE", "HS", "H SCORE", "TEAM1SCORE", "PF"]);
      const cAs = pickCol(cmap, ["AWAY SCORE", "AS", "A SCORE", "TEAM2SCORE"]);
      // Some sheets use single PF column pair — try adjacent if only one PF
      if (cSeason != null && cHome != null && cAway != null) {
        let cHs2 = cHs;
        let cAs2 = cAs;
        if (cHs2 == null || cAs2 == null) {
          const pfCols = Object.keys(cmap).filter((k) => k === "PF" || k.includes("PF"));
          if (pfCols.length >= 2) {
            cHs2 = cmap[pfCols[0]!]!;
            cAs2 = cmap[pfCols[1]!]!;
          }
        }
        for (let r = hi + 1; r < m.length; r++) {
          const row = m[r];
          if (!row) continue;
          const season = parseNum(row[cSeason] ?? "");
          if (season <= 1990 || season === 2009) continue;
          const week = cWeek != null ? parseNum(row[cWeek] ?? "") : 0;
          const homeTeam = normCell(row[cHome] ?? "");
          const awayTeam = normCell(row[cAway] ?? "");
          if (!homeTeam || !awayTeam) continue;
          const hs = cHs2 != null ? parseNum(row[cHs2] ?? "") : 0;
          const as = cAs2 != null ? parseNum(row[cAs2] ?? "") : 0;
          const playoffHint = normKey(row.join(" ")).includes("PLAYOFF");
          matchups.push({
            season,
            week: week > 0 ? week : matchups.filter((x) => x.season === season).length + 1,
            homeTeam,
            awayTeam,
            homeScore: hs,
            awayScore: as,
            isPlayoff: playoffHint,
          });
        }
      }
    }
  }

  const chName = findSheetName(book, ["Champions", "Championship"]);
  if (chName) {
    const ws = book.Sheets[chName];
    if (ws) {
      const m = sheetMatrix(ws, XLSX);
      const hi = headerRowIndex(m);
      const headers = m[hi] || [];
      const cmap = colMap(headers);
      const cSeason = pickCol(cmap, ["SEASON", "YEAR"]);
      const cChamp = pickCol(cmap, ["CHAMP", "CHAMPION", "WINNER", "1ST", "FIRST"]);
      const cRu = pickCol(cmap, ["RUNNER", "2ND", "SECOND", "RU"]);
      if (cSeason != null && cChamp != null) {
        for (let r = hi + 1; r < m.length; r++) {
          const row = m[r];
          if (!row) continue;
          const season = parseNum(row[cSeason] ?? "");
          if (season <= 1990 || season === 2009) continue;
          const championName = normCell(row[cChamp] ?? "");
          if (!championName) continue;
          const runnerUpName = cRu != null ? normCell(row[cRu] ?? "") || null : null;
          champions.push({ season, championName, runnerUpName });
        }
      }
    }
  }

  const mxName = findSheetName(book, ["H2H Matrix", "Head To Head Matrix"]);
  if (mxName) {
    const ws = book.Sheets[mxName];
    if (ws) h2hMatrix = sheetMatrix(ws, XLSX);
  }

  /** Draft-like sheets */
  for (const sn of book.SheetNames) {
    const nk = normKey(sn);
    if (nk.includes("CHAMPION")) continue;
    if (nk.includes("MATRIX") && nk.includes("H2H")) continue;
    if (nk.includes("MATCHUP") && nk.includes("DETAIL")) continue;
    if (nk.includes("RECORD") && nk.includes("TEAM")) continue;
    const ws = book.Sheets[sn];
    if (!ws) continue;
    const m = sheetMatrix(ws, XLSX);
    if (m.length < 2) continue;
    const hi = headerRowIndex(m);
    const headers = m[hi] || [];
    const cmap = colMap(headers);
    const hasPlayer = Object.keys(cmap).some((k) => k.includes("PLAYER") || k === "NAME");
    const hasRound = Object.keys(cmap).some((k) => k.includes("ROUND") || k === "RND" || k === "RD");
    if (!hasPlayer || !hasRound) continue;
    const cSeason = pickCol(cmap, ["SEASON", "YEAR"]);
    const cRound = pickCol(cmap, ["ROUND", "RND", "RD", "R"]);
    const cRp = pickCol(cmap, ["ROUND PICK", "PICK", "PICK IN ROUND", "PK"]);
    const cOv = pickCol(cmap, ["OVERALL", "OV", "OVR", "OVERALL PICK", "PICK"]);
    const cTeam = pickCol(cmap, ["TEAM", "TEAM NAME", "MGR", "FRANCHISE"]);
    const cOwner = pickCol(cmap, ["OWNER", "MANAGER"]);
    const cPlayer = pickCol(cmap, ["PLAYER", "PLAYER NAME", "NAME", "PICK NAME"]);
    const cPos = pickCol(cmap, ["POS", "POSITION"]);
    const cNfl = pickCol(cmap, ["NFL", "PRO", "TEAM NFL", "NFL TEAM"]);
    const cK = pickCol(cmap, ["KEEPER", "K", "IS KEEPER"]);
    if (cRound == null || cPlayer == null) continue;
    for (let r = hi + 1; r < m.length; r++) {
      const row = m[r];
      if (!row) continue;
      const season = cSeason != null ? parseNum(row[cSeason] ?? "") : 0;
      if (season <= 1990 || season === 2009) continue;
      const round = parseNum(row[cRound] ?? "");
      const roundPick = cRp != null ? parseNum(row[cRp] ?? "") : 1;
      let overallPick = cOv != null ? parseNum(row[cOv] ?? "") : 0;
      if (overallPick <= 0 && round > 0) overallPick = (round - 1) * 16 + roundPick;
      const teamName = cTeam != null ? normCell(row[cTeam] ?? "") : "";
      const ownerName = cOwner != null ? normCell(row[cOwner] ?? "") : "";
      const playerName = normCell(row[cPlayer] ?? "");
      if (!playerName) continue;
      const position = cPos != null ? normCell(row[cPos] ?? "") : "";
      const nflTeam = cNfl != null ? normCell(row[cNfl] ?? "") : "";
      let isKeeper = false;
      if (cK != null) {
        const kv = normCell(row[cK] ?? "").toUpperCase();
        isKeeper = kv === "Y" || kv === "YES" || kv === "TRUE" || kv === "1" || kv === "K";
      }
      drafts.push({
        season,
        overallPick: overallPick || drafts.filter((d) => d.season === season).length + 1,
        round: round || 1,
        roundPick: roundPick || 1,
        teamName,
        ownerName,
        playerName,
        position,
        nflTeam,
        isKeeper,
      });
    }
  }

  const parsed: ParsedManualWorkbook = {
    path,
    standings,
    matchups,
    drafts,
    champions,
    h2hMatrix,
    sheetNames,
  };
  cached = { sig, parsed };
  return parsed;
}

export function listManualSeasonsFromParsed(p: ParsedManualWorkbook): number[] {
  const s = new Set<number>();
  for (const x of p.standings) s.add(x.season);
  for (const x of p.matchups) s.add(x.season);
  for (const x of p.drafts) s.add(x.season);
  for (const x of p.champions) s.add(x.season);
  return Array.from(s).filter((y) => y !== 2009).sort((a, b) => a - b);
}

/** Per-season stable team id from display name (1..n). */
export function teamIdRegistryForSeason(
  season: number,
  standings: ManualStandingRow[],
): Map<string, number> {
  const names = new Set<string>();
  for (const s of standings) {
    if (s.season === season && s.teamName) names.add(s.teamName);
  }
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const m = new Map<string, number>();
  sorted.forEach((n, i) => m.set(n, i + 1));
  return m;
}

function standingsRowsForSeasonOrDraftTeams(p: ParsedManualWorkbook, season: number): ManualStandingRow[] {
  const fromStand = p.standings.filter((s) => s.season === season);
  if (fromStand.length > 0) return fromStand;
  const teamNames = new Set<string>();
  for (const d of p.drafts) {
    if (d.season === season && d.teamName) teamNames.add(d.teamName);
  }
  return [...teamNames].map((teamName) => ({
    season,
    teamName,
    ownerName: "",
    wins: 0,
    losses: 0,
    ties: 0,
    pf: 0,
    pa: 0,
    rank: null,
  }));
}

export function getManualDraftPickRowsForSeason(season: number, p: ParsedManualWorkbook): Record<string, unknown>[] {
  if (season === 2009) return [];
  const reg = teamIdRegistryForSeason(season, standingsRowsForSeasonOrDraftTeams(p, season));
  const tidFor = (teamName: string, ownerName: string): number => {
    if (teamName && reg.has(teamName)) return reg.get(teamName)!;
    const key = teamName || ownerName || "Team";
    if (!reg.has(key)) {
      const next = reg.size + 1;
      reg.set(key, next);
    }
    return reg.get(key)!;
  };

  const rows = p.drafts.filter((d) => d.season === season).sort((a, b) => a.overallPick - b.overallPick);
  return rows.map((d) => ({
    season,
    overallPickNumber: d.overallPick,
    roundId: d.round,
    roundPickNumber: d.roundPick,
    teamId: tidFor(d.teamName, d.ownerName),
    teamName: d.teamName || `Team ${tidFor(d.teamName, d.ownerName)}`,
    playerId: null,
    playerName: d.playerName,
    position: d.position || "?",
    keeper: d.isKeeper,
    reservedForKeeper: false,
    proTeam: d.nflTeam || "",
    bidAmount: 0,
    rawPick: JSON.stringify({ seeded: "manual_workbook", ownerName: d.ownerName }),
  }));
}

export function getManualMatchupsForSeasonWeek(
  season: number,
  week: number,
  p: ParsedManualWorkbook,
): Record<string, unknown>[] {
  if (season === 2009) return [];
  const rows = p.matchups.filter((m) => m.season === season && m.week === week);
  const standings = [...p.standings.filter((s) => s.season === season)];
  const ensureTeam = (name: string) => {
    if (!name) return;
    if (!standings.some((s) => s.teamName === name)) {
      standings.push({
        season,
        teamName: name,
        ownerName: "",
        wins: 0,
        losses: 0,
        ties: 0,
        pf: 0,
        pa: 0,
        rank: null,
      });
    }
  };
  for (const m of p.matchups.filter((x) => x.season === season)) {
    ensureTeam(m.homeTeam);
    ensureTeam(m.awayTeam);
  }
  const reg = teamIdRegistryForSeason(season, standings);
  const tid = (teamName: string): number => {
    if (reg.has(teamName)) return reg.get(teamName)!;
    const next = reg.size + 1;
    reg.set(teamName, next);
    return next;
  };
  const shaped: Record<string, unknown>[] = [];
  let mp = 1;
  for (const m of rows) {
    const hid = tid(m.homeTeam);
    const aid = tid(m.awayTeam);
    let winner: "HOME" | "AWAY" | "TIE" | "UNDECIDED" = "UNDECIDED";
    if (m.homeScore > m.awayScore) winner = "HOME";
    else if (m.awayScore > m.homeScore) winner = "AWAY";
    else if (m.homeScore === m.awayScore && m.homeScore > 0) winner = "TIE";
    shaped.push({
      season,
      matchupPeriodId: mp++,
      scoringPeriodId: week,
      winner,
      playoffTierType: m.isPlayoff ? "WINNERS_BRACKET" : "NONE",
      homeTeamId: hid,
      homeTotalPoints: m.homeScore,
      homeProjectedPoints: null,
      awayTeamId: aid,
      awayTotalPoints: m.awayScore,
      awayProjectedPoints: null,
    });
  }
  return shaped;
}

/** All matchups for a season (every week), ESPN-shaped rows for historicalDataService. */
export function getAllManualMatchupsShapedForSeason(season: number, p: ParsedManualWorkbook): Record<string, unknown>[] {
  if (season === 2009) return [];
  const list = p.matchups.filter((m) => m.season === season);
  if (list.length === 0) return [];
  const standings = [...p.standings.filter((s) => s.season === season)];
  const ensureTeam = (name: string) => {
    if (!name) return;
    if (!standings.some((s) => s.teamName === name)) {
      standings.push({
        season,
        teamName: name,
        ownerName: "",
        wins: 0,
        losses: 0,
        ties: 0,
        pf: 0,
        pa: 0,
        rank: null,
      });
    }
  };
  for (const m of list) {
    ensureTeam(m.homeTeam);
    ensureTeam(m.awayTeam);
  }
  const reg = teamIdRegistryForSeason(season, standings);
  const tid = (teamName: string): number => {
    if (reg.has(teamName)) return reg.get(teamName)!;
    const next = reg.size + 1;
    reg.set(teamName, next);
    return next;
  };
  const shaped: Record<string, unknown>[] = [];
  let mp = 1;
  for (const m of list.sort((a, b) => a.week - b.week || a.homeTeam.localeCompare(b.homeTeam))) {
    const hid = tid(m.homeTeam);
    const aid = tid(m.awayTeam);
    let winner: "HOME" | "AWAY" | "TIE" | "UNDECIDED" = "UNDECIDED";
    if (m.homeScore > m.awayScore) winner = "HOME";
    else if (m.awayScore > m.homeScore) winner = "AWAY";
    else if (m.homeScore === m.awayScore && m.homeScore > 0) winner = "TIE";
    shaped.push({
      season,
      matchupPeriodId: mp++,
      scoringPeriodId: m.week,
      winner,
      playoffTierType: m.isPlayoff ? "WINNERS_BRACKET" : "NONE",
      homeTeamId: hid,
      homeTotalPoints: m.homeScore,
      homeProjectedPoints: null,
      awayTeamId: aid,
      awayTotalPoints: m.awayScore,
      awayProjectedPoints: null,
    });
  }
  return shaped;
}

export function maxWeekFromManualMatchups(season: number, p: ParsedManualWorkbook): number {
  let w = 0;
  for (const m of p.matchups) {
    if (m.season === season) w = Math.max(w, m.week);
  }
  return w;
}

/**
 * Build ESPN-shaped combined payload for ownerCareerStats from manual workbook rows.
 */
export async function buildManualCombinedPayloadForSeason(season: number): Promise<Record<string, unknown> | null> {
  if (season === 2009) return null;
  const p = await loadParsedManualWorkbook();
  if (!p) return null;
  const st = p.standings.filter((s) => s.season === season);
  const mus = p.matchups.filter((m) => m.season === season);
  if (st.length === 0 && mus.length === 0) return null;

  const reg = teamIdRegistryForSeason(season, st);
  const tid = (teamName: string): number => {
    if (reg.has(teamName)) return reg.get(teamName)!;
    const next = reg.size + 1;
    reg.set(teamName, next);
    return next;
  };

  const members: Record<string, unknown>[] = [];
  const memberSeen = new Set<string>();
  for (const row of st) {
    const oid = row.ownerName ? manualMemberIdForOwnerName(row.ownerName) : manualMemberIdForOwnerName(row.teamName);
    if (!memberSeen.has(oid)) {
      memberSeen.add(oid);
      const parts = row.ownerName.split(/\s+/).filter(Boolean);
      members.push({
        id: oid,
        firstName: parts[0] || row.ownerName || "Owner",
        lastName: parts.slice(1).join(" ") || "",
        displayName: row.ownerName || row.teamName,
      });
    }
  }

  const teams: Record<string, unknown>[] = [];
  for (const row of st) {
    const id = tid(row.teamName);
    const memberId = row.ownerName ? manualMemberIdForOwnerName(row.ownerName) : manualMemberIdForOwnerName(row.teamName);
    teams.push({
      id,
      name: row.teamName,
      abbrev: row.teamName.slice(0, 4).toUpperCase(),
      primaryOwner: memberId,
      owners: [memberId],
      points: row.pf,
      rankCalculatedFinal: row.rank ?? 0,
      playoffSeed: row.rank && row.rank <= 6 ? row.rank : 0,
      record: {
        overall: {
          wins: row.wins,
          losses: row.losses,
          ties: row.ties,
          pointsFor: row.pf,
          pointsAgainst: row.pa,
        },
      },
      transactionCounter: {},
    });
  }

  const schedule: Record<string, unknown>[] = [];
  const rsWeeks = mus.filter((m) => !m.isPlayoff).map((m) => m.week);
  const matchupPeriodCount = rsWeeks.length > 0 ? Math.max(...rsWeeks) : 14;
  let mp = 1;
  for (const m of mus) {
    const hid = tid(m.homeTeam);
    const aid = tid(m.awayTeam);
    let winner = "UNDECIDED";
    if (m.homeScore > m.awayScore) winner = "HOME";
    else if (m.awayScore > m.homeScore) winner = "AWAY";
    else if (m.homeScore === m.awayScore && m.homeScore > 0) winner = "TIE";
    schedule.push({
      matchupPeriodId: m.isPlayoff ? matchupPeriodCount + mp : m.week,
      scoringPeriodId: m.week,
      winner,
      playoffTierType: m.isPlayoff ? "WINNERS_BRACKET" : "NONE",
      home: { teamId: hid, totalPoints: m.homeScore },
      away: { teamId: aid, totalPoints: m.awayScore },
    });
    mp++;
  }

  const ch = p.champions.find((c) => c.season === season);
  if (ch && teams.length > 0) {
    const cn = ch.championName.toLowerCase();
    for (const t of teams) {
      const nm = String(t.name).toLowerCase();
      if (nm.includes(cn) || cn.includes(nm)) {
        t.rankCalculatedFinal = 1;
        break;
      }
    }
  }

  return {
    seasonId: season,
    id: "manual-workbook",
    members,
    teams,
    schedule,
    settings: { scheduleSettings: { matchupPeriodCount } },
    transactions: [],
  };
}

/**
 * Merge H2H matrix wins/losses into owner h2h maps when schedule did not produce games between a pair.
 */
export function mergeManualH2HMatrixIntoOwners(
  ownerMap: Map<
    string,
    {
      h2h: Map<string, { wins: number; losses: number; ties: number }>;
      displayName: string;
    }
  >,
  p: ParsedManualWorkbook,
): void {
  const mx = p.h2hMatrix;
  if (!mx || mx.length < 2) return;

  const resolveOwnerKey = (label: string): string | null => {
    const L = label.trim().toLowerCase();
    for (const [id, o] of ownerMap) {
      if (o.displayName.toLowerCase() === L) return id;
    }
    for (const [id, o] of ownerMap) {
      if (L.includes(o.displayName.toLowerCase()) || o.displayName.toLowerCase().includes(L)) return id;
    }
    return null;
  };

  const header = mx[0] || [];
  const colLabels = header.slice(1).map(normCell);
  for (let r = 1; r < mx.length; r++) {
    const row = mx[r];
    if (!row) continue;
    const rowLabel = normCell(row[0] ?? "");
    if (!rowLabel) continue;
    const aId = resolveOwnerKey(rowLabel);
    if (!aId) continue;
    for (let c = 1; c < row.length && c - 1 < colLabels.length; c++) {
      const colLabel = colLabels[c - 1] ?? "";
      if (!colLabel) continue;
      const bId = resolveOwnerKey(colLabel);
      if (!bId || aId === bId) continue;
      const cell = normCell(row[c] ?? "");
      const m = cell.match(/(\d+)\s*[-–/]\s*(\d+)/);
      if (!m) continue;
      const wA = parseNum(m[1]!);
      const wB = parseNum(m[2]!);
      const oA = ownerMap.get(aId);
      const oB = ownerMap.get(bId);
      if (!oA || !oB) continue;
      const recAB = oA.h2h.get(bId) || { wins: 0, losses: 0, ties: 0 };
      const recBA = oB.h2h.get(aId) || { wins: 0, losses: 0, ties: 0 };
      const hasSchedule = recAB.wins + recAB.losses + recAB.ties + recBA.wins + recBA.losses + recBA.ties > 0;
      if (hasSchedule) continue;
      recAB.wins = wA;
      recAB.losses = wB;
      recAB.ties = 0;
      recBA.wins = wB;
      recBA.losses = wA;
      recBA.ties = 0;
      oA.h2h.set(bId, recAB);
      oB.h2h.set(aId, recBA);
    }
  }
}
