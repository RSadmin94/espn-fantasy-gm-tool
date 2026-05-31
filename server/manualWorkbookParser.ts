/**
 * One-shot parsing of ATLANTAS (or similar) league history workbooks.
 * Used only by `scripts/import-atlantas-finest-history.ts` — not loaded at API runtime.
 */
import * as XLSX from "xlsx";

export type Matrix = string[][];

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

function sheetMatrix(ws: XLSX.WorkSheet): Matrix {
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

function findSheetName(book: XLSX.WorkBook, want: string[]): string | null {
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
  h2hMatrix: Matrix | null;
  sheetNames: string[];
};

function parseWorkbookBook(book: XLSX.WorkBook, path: string): ParsedManualWorkbook {
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
    const m = sheetMatrix(ws);
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
      const m = sheetMatrix(ws);
      const hi = headerRowIndex(m);
      const headers = m[hi] || [];
      const cmap = colMap(headers);
      const cSeason = pickCol(cmap, ["SEASON", "YEAR"]);
      const cWeek = pickCol(cmap, ["WEEK", "SCORING PERIOD", "MATCHUP", "PERIOD"]);
      const cHome = pickCol(cmap, ["HOME", "HOME TEAM", "HOME TEAM NAME", "TEAM 1"]);
      const cAway = pickCol(cmap, ["AWAY", "AWAY TEAM", "AWAY TEAM NAME", "TEAM 2"]);
      const cHs = pickCol(cmap, ["HOME SCORE", "HS", "H SCORE", "TEAM1SCORE", "PF"]);
      const cAs = pickCol(cmap, ["AWAY SCORE", "AS", "A SCORE", "TEAM2SCORE"]);
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
      const m = sheetMatrix(ws);
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
    if (ws) h2hMatrix = sheetMatrix(ws);
  }

  for (const sn of book.SheetNames) {
    const nk = normKey(sn);
    if (nk.includes("CHAMPION")) continue;
    if (nk.includes("MATRIX") && nk.includes("H2H")) continue;
    if (nk.includes("MATCHUP") && nk.includes("DETAIL")) continue;
    if (nk.includes("RECORD") && nk.includes("TEAM")) continue;
    const ws = book.Sheets[sn];
    if (!ws) continue;
    const m = sheetMatrix(ws);
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

  return {
    path,
    standings,
    matchups,
    drafts,
    champions,
    h2hMatrix,
    sheetNames,
  };
}

/** Parse workbook bytes once (e.g. from `readFileSync`). */
export function parseManualHistoryWorkbookBuffer(buf: Buffer, pathLabel: string): ParsedManualWorkbook {
  const book = XLSX.read(buf, { type: "buffer", cellDates: true });
  return parseWorkbookBook(book, pathLabel);
}

export function listManualSeasonsFromParsed(p: ParsedManualWorkbook): number[] {
  const s = new Set<number>();
  for (const x of p.standings) s.add(x.season);
  for (const x of p.matchups) s.add(x.season);
  for (const x of p.drafts) s.add(x.season);
  for (const x of p.champions) s.add(x.season);
  return Array.from(s).filter((y) => y !== 2009).sort((a, b) => a - b);
}

export function teamIdRegistryForSeason(season: number, standings: ManualStandingRow[]): Map<string, number> {
  const names = new Set<string>();
  for (const st of standings) {
    if (st.season === season && st.teamName) names.add(st.teamName);
  }
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const m = new Map<string, number>();
  sorted.forEach((n, i) => m.set(n, i + 1));
  return m;
}

export function standingsRowsForSeasonOrDraftTeams(p: ParsedManualWorkbook, season: number): ManualStandingRow[] {
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
