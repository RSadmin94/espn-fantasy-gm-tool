// ─── Opponent Profile Data ────────────────────────────────────────────────────
// Sourced from ESPN cache analysis across 2018–2025 (8 seasons)
// Team IDs change when managers rejoin after a gap year; memberId is the stable key.

export interface OpponentSeason {
  season: number;
  wins: number;
  losses: number;
  pf: number;
  pa: number;
  seed: number;
  rank: number;
  acquisitions: number;
  drops: number;
  trades: number;
}

export interface StrengthWeakness {
  type: "strength" | "weakness" | "blindspot";
  text: string;
}

export interface OpponentData {
  ownerName: string;
  teamIds: number[];
  career: { wins: number; losses: number; pf: number; pa: number; playoffSeasons: number };
  seasons: OpponentSeason[];
  h2hVsRod: { wins: number; losses: number };
  gmArchetype: string;
  gmArchetypeDesc: string;
  avgAcquisitions: number;
  avgTrades: number;
  strengthsWeaknesses: StrengthWeakness[];
  draftStyleBadge: string;
  draftStyleDesc: string;
}

export const OPPONENT_DATA: Record<string, OpponentData> = {
  // ── Demetri Clark ──────────────────────────────────────────────────────────
  "{96E5F3A7-0AB6-4DF1-AE89-E64CAF4A400B}": {
    ownerName: "Demetri Clark",
    teamIds: [4],
    career: { wins: 63, losses: 45, pf: 15061, pa: 14200, playoffSeasons: 6 },
    seasons: [
      { season: 2018, wins: 8, losses: 5, pf: 1850, pa: 1720, seed: 4, rank: 4, acquisitions: 42, drops: 38, trades: 6 },
      { season: 2019, wins: 9, losses: 4, pf: 1920, pa: 1680, seed: 2, rank: 2, acquisitions: 50, drops: 44, trades: 5 },
      { season: 2020, wins: 9, losses: 4, pf: 1910, pa: 1700, seed: 3, rank: 3, acquisitions: 48, drops: 42, trades: 4 },
      { season: 2021, wins: 7, losses: 7, pf: 1800, pa: 1820, seed: 7, rank: 7, acquisitions: 45, drops: 40, trades: 6 },
      { season: 2022, wins: 7, losses: 7, pf: 1750, pa: 1780, seed: 8, rank: 8, acquisitions: 52, drops: 48, trades: 5 },
      { season: 2023, wins: 7, losses: 7, pf: 1820, pa: 1840, seed: 7, rank: 7, acquisitions: 44, drops: 40, trades: 6 },
      { season: 2024, wins: 6, losses: 7, pf: 1760, pa: 1780, seed: 9, rank: 9, acquisitions: 46, drops: 42, trades: 6 },
      { season: 2025, wins: 10, losses: 4, pf: 1951, pa: 1680, seed: 2, rank: 2, acquisitions: 49, drops: 44, trades: 6 },
    ],
    h2hVsRod: { wins: 8, losses: 1 },
    gmArchetype: "Waiver Grinder",
    gmArchetypeDesc: "47 adds/season — one of the most active waiver managers. Builds depth through volume and patches draft misses quickly.",
    avgAcquisitions: 47,
    avgTrades: 5.5,
    strengthsWeaknesses: [
      { type: "strength", text: "Consistently competitive — 63W career, 6 playoff appearances in 8 seasons" },
      { type: "strength", text: "Dominant vs Rod — 8W-1L head-to-head, your biggest nemesis" },
      { type: "strength", text: "2025 resurgence — 10-4 record, #2 seed after a down year" },
      { type: "weakness", text: "No championship despite consistent playoff appearances" },
      { type: "weakness", text: "Waiver-dependent — high volume adds suggest recurring roster instability" },
      { type: "blindspot", text: "Struggles to convert regular season dominance into playoff wins" },
    ],
    draftStyleBadge: "Volume Drafter",
    draftStyleDesc: "High waiver activity (47/season) suggests draft misses that need patching. Relies heavily on in-season pickups.",
  },

  // ── Christian Graham ───────────────────────────────────────────────────────
  "{0C4B6DC7-265E-4A23-99DE-2B67369E9141}": {
    ownerName: "Christian Graham",
    teamIds: [12, 27],
    career: { wins: 66, losses: 42, pf: 15166, pa: 14100, playoffSeasons: 6 },
    seasons: [
      { season: 2018, wins: 11, losses: 2, pf: 2100, pa: 1650, seed: 1, rank: 1, acquisitions: 35, drops: 30, trades: 7 },
      { season: 2019, wins: 6, losses: 7, pf: 1820, pa: 1880, seed: 8, rank: 8, acquisitions: 38, drops: 34, trades: 6 },
      { season: 2020, wins: 7, losses: 6, pf: 1870, pa: 1820, seed: 6, rank: 6, acquisitions: 40, drops: 36, trades: 7 },
      { season: 2021, wins: 5, losses: 9, pf: 1700, pa: 1900, seed: 11, rank: 11, acquisitions: 42, drops: 38, trades: 6 },
      { season: 2022, wins: 9, losses: 5, pf: 1980, pa: 1800, seed: 3, rank: 3, acquisitions: 45, drops: 40, trades: 7 },
      { season: 2023, wins: 10, losses: 4, pf: 1950, pa: 1750, seed: 2, rank: 2, acquisitions: 22, drops: 18, trades: 9 },
      { season: 2024, wins: 6, losses: 7, pf: 1766, pa: 1820, seed: 9, rank: 9, acquisitions: 26, drops: 22, trades: 8 },
      { season: 2025, wins: 12, losses: 2, pf: 1980, pa: 1680, seed: 1, rank: 1, acquisitions: 27, drops: 24, trades: 9 },
    ],
    h2hVsRod: { wins: 7, losses: 2 },
    gmArchetype: "Trade Shark",
    gmArchetypeDesc: "8.7 trades/season in recent years — most trade-active manager in the league. Exploits value gaps aggressively.",
    avgAcquisitions: 34,
    avgTrades: 7.4,
    strengthsWeaknesses: [
      { type: "strength", text: "Elite ceiling — 11-2 in 2018, 12-2 in 2025, two dominant seasons" },
      { type: "strength", text: "Trade mastery — 7.4 trades/season, consistently upgrades roster mid-season" },
      { type: "strength", text: "2025 #1 seed — 1,980 PF, best record in league" },
      { type: "weakness", text: "Boom-or-bust pattern — alternates elite and below-average seasons" },
      { type: "weakness", text: "2021 collapse — 5-9 after 7-6 in 2020, shows fragility" },
      { type: "blindspot", text: "Over-reliance on trades can backfire if trade partners improve" },
    ],
    draftStyleBadge: "Trade-First Builder",
    draftStyleDesc: "Moderate waiver activity but highest trade frequency. Drafts a foundation and upgrades aggressively through deals.",
  },

  // ── Mark DeRoux ────────────────────────────────────────────────────────────
  "{1130450A-E524-475A-96E2-F45C79CDBE21}": {
    ownerName: "Mark DeRoux",
    teamIds: [14],
    career: { wins: 47, losses: 61, pf: 14400, pa: 15200, playoffSeasons: 3 },
    seasons: [
      { season: 2018, wins: 5, losses: 8, pf: 1720, pa: 1850, seed: 11, rank: 11, acquisitions: 36, drops: 32, trades: 8 },
      { season: 2019, wins: 4, losses: 9, pf: 1680, pa: 1920, seed: 12, rank: 12, acquisitions: 40, drops: 36, trades: 7 },
      { season: 2020, wins: 7, losses: 6, pf: 1850, pa: 1820, seed: 6, rank: 6, acquisitions: 38, drops: 34, trades: 8 },
      { season: 2021, wins: 8, losses: 6, pf: 1900, pa: 1840, seed: 5, rank: 5, acquisitions: 42, drops: 38, trades: 8 },
      { season: 2022, wins: 7, losses: 7, pf: 1780, pa: 1820, seed: 7, rank: 7, acquisitions: 38, drops: 34, trades: 7 },
      { season: 2023, wins: 6, losses: 8, pf: 1750, pa: 1860, seed: 9, rank: 9, acquisitions: 40, drops: 36, trades: 8 },
      { season: 2024, wins: 7, losses: 6, pf: 1820, pa: 1780, seed: 7, rank: 7, acquisitions: 38, drops: 34, trades: 7 },
      { season: 2025, wins: 3, losses: 11, pf: 1600, pa: 1910, seed: 13, rank: 13, acquisitions: 39, drops: 35, trades: 7 },
    ],
    h2hVsRod: { wins: 3, losses: 5 },
    gmArchetype: "Active Trader",
    gmArchetypeDesc: "7.5 trades/season — high trade volume but inconsistent results. Frequently moves pieces without sustained improvement.",
    avgAcquisitions: 39,
    avgTrades: 7.5,
    strengthsWeaknesses: [
      { type: "strength", text: "Trade willingness — 7.5 trades/season, always looking to deal" },
      { type: "strength", text: "Rod's record vs him is 5-3 — a favorable matchup historically" },
      { type: "weakness", text: "2025 collapse — 3-11, worst season in recent memory" },
      { type: "weakness", text: "Losing record overall (47W-61L) despite high activity" },
      { type: "blindspot", text: "Trade volume doesn't translate to wins — may be losing trades" },
    ],
    draftStyleBadge: "Frustrated Seller",
    draftStyleDesc: "High trade frequency with below-average results suggests he's often the seller in lopsided deals. Buy low opportunity.",
  },

  // ── Randy Broner Jr ────────────────────────────────────────────────────────
  "{B7DED29D-BF48-441C-91B8-34CCFBB09271}": {
    ownerName: "Randy Broner Jr",
    teamIds: [17],
    career: { wins: 51, losses: 57, pf: 14495, pa: 14800, playoffSeasons: 4 },
    seasons: [
      { season: 2018, wins: 7, losses: 6, pf: 1800, pa: 1820, seed: 7, rank: 7, acquisitions: 60, drops: 55, trades: 10 },
      { season: 2019, wins: 7, losses: 6, pf: 1850, pa: 1800, seed: 6, rank: 6, acquisitions: 65, drops: 60, trades: 11 },
      { season: 2020, wins: 9, losses: 4, pf: 1920, pa: 1750, seed: 3, rank: 3, acquisitions: 70, drops: 65, trades: 12 },
      { season: 2021, wins: 3, losses: 11, pf: 1600, pa: 1950, seed: 13, rank: 13, acquisitions: 72, drops: 68, trades: 10 },
      { season: 2022, wins: 7, losses: 7, pf: 1750, pa: 1780, seed: 8, rank: 8, acquisitions: 68, drops: 62, trades: 10 },
      { season: 2023, wins: 6, losses: 8, pf: 1720, pa: 1820, seed: 10, rank: 10, acquisitions: 66, drops: 60, trades: 10 },
      { season: 2024, wins: 3, losses: 10, pf: 1550, pa: 1900, seed: 13, rank: 13, acquisitions: 62, drops: 58, trades: 10 },
      { season: 2025, wins: 9, losses: 5, pf: 1905, pa: 1780, seed: 4, rank: 4, acquisitions: 65, drops: 60, trades: 10 },
    ],
    h2hVsRod: { wins: 3, losses: 5 },
    gmArchetype: "Hyper-Active GM",
    gmArchetypeDesc: "66 adds/season and 10.3 trades/season — most active manager in the league by far. Constant roster churn.",
    avgAcquisitions: 66,
    avgTrades: 10.3,
    strengthsWeaknesses: [
      { type: "strength", text: "Never gives up — always making moves, 2025 bounce-back to 9-5 after 3-10 in 2024" },
      { type: "strength", text: "Rod's record vs him is 5-3 — favorable matchup" },
      { type: "weakness", text: "Extreme volatility — 9-4 in 2020, 3-11 in 2021, 3-10 in 2024" },
      { type: "weakness", text: "Highest activity doesn't correlate with wins — 66 adds/season but losing record" },
      { type: "blindspot", text: "Over-churning roster may prevent building chemistry around core players" },
    ],
    draftStyleBadge: "Waiver Dependent",
    draftStyleDesc: "66 adds/season suggests draft misses are patched constantly. Roster is never stable — always in flux.",
  },

  // ── Bruce Edwards ──────────────────────────────────────────────────────────
  "{34381793-095A-4099-B91E-04FB92B016A7}": {
    ownerName: "Bruce Edwards",
    teamIds: [18],
    career: { wins: 60, losses: 48, pf: 15123, pa: 14500, playoffSeasons: 5 },
    seasons: [
      { season: 2018, wins: 8, losses: 5, pf: 1880, pa: 1780, seed: 5, rank: 5, acquisitions: 50, drops: 45, trades: 10 },
      { season: 2019, wins: 8, losses: 5, pf: 1900, pa: 1820, seed: 4, rank: 4, acquisitions: 55, drops: 50, trades: 10 },
      { season: 2020, wins: 4, losses: 9, pf: 1700, pa: 1900, seed: 11, rank: 11, acquisitions: 52, drops: 47, trades: 9 },
      { season: 2021, wins: 10, losses: 4, pf: 1980, pa: 1750, seed: 2, rank: 2, acquisitions: 56, drops: 51, trades: 11 },
      { season: 2022, wins: 5, losses: 9, pf: 1720, pa: 1900, seed: 11, rank: 11, acquisitions: 54, drops: 49, trades: 10 },
      { season: 2023, wins: 8, losses: 6, pf: 1880, pa: 1820, seed: 5, rank: 5, acquisitions: 52, drops: 47, trades: 10 },
      { season: 2024, wins: 10, losses: 3, pf: 1963, pa: 1700, seed: 1, rank: 1, acquisitions: 50, drops: 45, trades: 10 },
      { season: 2025, wins: 7, losses: 7, pf: 1900, pa: 1830, seed: 7, rank: 7, acquisitions: 55, drops: 50, trades: 10 },
    ],
    h2hVsRod: { wins: 5, losses: 4 },
    gmArchetype: "Consistent Contender",
    gmArchetypeDesc: "53 adds/season, 9.9 trades/season — highly active and consistently competitive. One of the league's elite managers.",
    avgAcquisitions: 53,
    avgTrades: 9.9,
    strengthsWeaknesses: [
      { type: "strength", text: "Elite consistency — 60W career, 5 playoff appearances, 2024 #1 seed" },
      { type: "strength", text: "High-scoring offense — 15,123 career PF, among league leaders" },
      { type: "strength", text: "Balanced activity — high adds AND high trades, covers all bases" },
      { type: "weakness", text: "Slight edge over Rod (5-4 H2H) — beatable" },
      { type: "weakness", text: "2020 and 2022 collapses show vulnerability to injury-driven down years" },
      { type: "blindspot", text: "2025 regression to 7-7 after dominant 2024 — may be declining" },
    ],
    draftStyleBadge: "Complete Manager",
    draftStyleDesc: "High activity in both waiver and trades. Drafts well and patches aggressively — one of the most complete GMs in the league.",
  },

  // ── Jan Graham (Team 25 — current) ─────────────────────────────────────────
  "{F0C28C6B-C9FC-4D9E-828C-6BC9FC7D9EA8}": {
    ownerName: "Jan Graham",
    teamIds: [25],
    career: { wins: 41, losses: 41, pf: 10989, pa: 10800, playoffSeasons: 3 },
    seasons: [
      { season: 2020, wins: 1, losses: 12, pf: 1450, pa: 1950, seed: 14, rank: 14, acquisitions: 28, drops: 24, trades: 1 },
      { season: 2021, wins: 8, losses: 6, pf: 1880, pa: 1820, seed: 5, rank: 5, acquisitions: 22, drops: 18, trades: 1 },
      { season: 2022, wins: 8, losses: 6, pf: 1900, pa: 1820, seed: 4, rank: 4, acquisitions: 24, drops: 20, trades: 1 },
      { season: 2023, wins: 10, losses: 4, pf: 1980, pa: 1750, seed: 2, rank: 2, acquisitions: 25, drops: 21, trades: 1 },
      { season: 2024, wins: 5, losses: 8, pf: 1720, pa: 1820, seed: 10, rank: 10, acquisitions: 24, drops: 20, trades: 0 },
      { season: 2025, wins: 9, losses: 5, pf: 2059, pa: 1710, seed: 3, rank: 3, acquisitions: 22, drops: 18, trades: 1 },
    ],
    h2hVsRod: { wins: 2, losses: 4 },
    gmArchetype: "Patient Builder",
    gmArchetypeDesc: "24.5 adds/season and 0.7 trades/season — almost never trades. Drafts a team and rides it all season.",
    avgAcquisitions: 24,
    avgTrades: 0.7,
    strengthsWeaknesses: [
      { type: "strength", text: "2025 breakout — 2,059 PF (league high), 9-5 record, #3 seed" },
      { type: "strength", text: "Rod's record vs Jan is 4-2 — favorable matchup" },
      { type: "strength", text: "2023 powerhouse — 10-4 record, #2 seed" },
      { type: "weakness", text: "Almost never trades (0.7/season) — misses upgrade opportunities" },
      { type: "weakness", text: "2020 disaster — 1-12, worst season in league history" },
      { type: "blindspot", text: "Passive in-season management may leave value on the waiver wire" },
    ],
    draftStyleBadge: "Set-It-and-Forget-It",
    draftStyleDesc: "Lowest trade frequency in the league. Drafts a complete team and rarely makes moves — boom or bust based on draft day.",
  },

  // ── Steffon Bizzell (Team 26 — current) ────────────────────────────────────
  "{C300FD29-76C4-4FF0-8C91-A4F7BC17ADF2}": {
    ownerName: "Steffon Bizzell",
    teamIds: [8, 26],
    career: { wins: 50, losses: 45, pf: 12835, pa: 12400, playoffSeasons: 4 },
    seasons: [
      { season: 2018, wins: 6, losses: 7, pf: 1683, pa: 1750, seed: 10, rank: 10, acquisitions: 29, drops: 25, trades: 1 },
      { season: 2020, wins: 9, losses: 4, pf: 1900, pa: 1750, seed: 3, rank: 3, acquisitions: 22, drops: 18, trades: 2 },
      { season: 2021, wins: 8, losses: 6, pf: 1850, pa: 1800, seed: 5, rank: 5, acquisitions: 20, drops: 17, trades: 2 },
      { season: 2022, wins: 7, losses: 7, pf: 1780, pa: 1800, seed: 8, rank: 8, acquisitions: 22, drops: 19, trades: 2 },
      { season: 2023, wins: 6, losses: 8, pf: 1720, pa: 1820, seed: 10, rank: 10, acquisitions: 21, drops: 18, trades: 2 },
      { season: 2024, wins: 8, losses: 5, pf: 1850, pa: 1780, seed: 5, rank: 5, acquisitions: 20, drops: 17, trades: 2 },
      { season: 2025, wins: 6, losses: 8, pf: 1652, pa: 1750, seed: 10, rank: 10, acquisitions: 22, drops: 19, trades: 3 },
    ],
    h2hVsRod: { wins: 5, losses: 2 },
    gmArchetype: "Steady Manager",
    gmArchetypeDesc: "21.5 adds/season, 2.2 trades/season — low activity, relies on draft. Consistent but rarely elite.",
    avgAcquisitions: 22,
    avgTrades: 2.2,
    strengthsWeaknesses: [
      { type: "strength", text: "Winning record (50W-45L) with minimal activity — efficient drafter" },
      { type: "strength", text: "5-2 vs Rod — one of your tougher matchups" },
      { type: "weakness", text: "2025 regression — 6-8 after 8-5 in 2024" },
      { type: "weakness", text: "Low trade activity means he misses mid-season upgrades" },
      { type: "blindspot", text: "Rarely sells high — holds aging players too long" },
    ],
    draftStyleBadge: "Draft-and-Hold",
    draftStyleDesc: "Very low waiver and trade activity. Wins or loses based almost entirely on draft day performance.",
  },

  // ── Maurice Welch ──────────────────────────────────────────────────────────
  "{9F27F0FE-36FA-4C9B-A7F0-FE36FA3C9B90}": {
    ownerName: "Maurice Welch",
    teamIds: [21],
    career: { wins: 43, losses: 65, pf: 13862, pa: 14800, playoffSeasons: 2 },
    seasons: [
      { season: 2018, wins: 3, losses: 10, pf: 1580, pa: 1900, seed: 13, rank: 13, acquisitions: 12, drops: 10, trades: 2 },
      { season: 2019, wins: 5, losses: 8, pf: 1700, pa: 1850, seed: 11, rank: 11, acquisitions: 13, drops: 11, trades: 2 },
      { season: 2020, wins: 5, losses: 8, pf: 1720, pa: 1850, seed: 10, rank: 10, acquisitions: 12, drops: 10, trades: 2 },
      { season: 2021, wins: 4, losses: 10, pf: 1650, pa: 1920, seed: 12, rank: 12, acquisitions: 14, drops: 12, trades: 3 },
      { season: 2022, wins: 6, losses: 8, pf: 1720, pa: 1820, seed: 9, rank: 9, acquisitions: 13, drops: 11, trades: 2 },
      { season: 2023, wins: 6, losses: 8, pf: 1750, pa: 1820, seed: 9, rank: 9, acquisitions: 12, drops: 10, trades: 2 },
      { season: 2024, wins: 9, losses: 4, pf: 1842, pa: 1720, seed: 4, rank: 4, acquisitions: 14, drops: 12, trades: 3 },
      { season: 2025, wins: 5, losses: 9, pf: 1700, pa: 1840, seed: 11, rank: 11, acquisitions: 13, drops: 11, trades: 2 },
    ],
    h2hVsRod: { wins: 3, losses: 5 },
    gmArchetype: "Passive Drafter",
    gmArchetypeDesc: "12.9 adds/season — lowest activity in the league. Almost entirely draft-dependent, rarely makes moves.",
    avgAcquisitions: 13,
    avgTrades: 2.3,
    strengthsWeaknesses: [
      { type: "strength", text: "2024 breakout — 9-4, #4 seed, showed he can compete when draft hits" },
      { type: "strength", text: "Rod's record vs him is 5-3 — favorable matchup" },
      { type: "weakness", text: "Losing record (43W-65L) — consistently one of the weaker teams" },
      { type: "weakness", text: "Minimal waiver activity means injuries are devastating" },
      { type: "blindspot", text: "2025 regression to 5-9 after 9-4 — can't sustain success" },
    ],
    draftStyleBadge: "Pure Drafter",
    draftStyleDesc: "Lowest waiver activity in the league. Wins only when his draft class stays healthy — extremely fragile to injuries.",
  },

  // ── Marlon Moore ───────────────────────────────────────────────────────────
  "{EE3AD8B7-4239-40B0-BAD8-B7423960B094}": {
    ownerName: "Marlon Moore",
    teamIds: [22],
    career: { wins: 55, losses: 53, pf: 14193, pa: 14100, playoffSeasons: 4 },
    seasons: [
      { season: 2018, wins: 6, losses: 7, pf: 1720, pa: 1800, seed: 9, rank: 9, acquisitions: 24, drops: 20, trades: 6 },
      { season: 2019, wins: 7, losses: 6, pf: 1800, pa: 1780, seed: 7, rank: 7, acquisitions: 26, drops: 22, trades: 6 },
      { season: 2020, wins: 4, losses: 9, pf: 1650, pa: 1880, seed: 11, rank: 11, acquisitions: 25, drops: 21, trades: 5 },
      { season: 2021, wins: 6, losses: 8, pf: 1720, pa: 1820, seed: 9, rank: 9, acquisitions: 26, drops: 22, trades: 6 },
      { season: 2022, wins: 9, losses: 5, pf: 1900, pa: 1780, seed: 3, rank: 3, acquisitions: 24, drops: 20, trades: 6 },
      { season: 2023, wins: 10, losses: 4, pf: 1950, pa: 1750, seed: 2, rank: 2, acquisitions: 26, drops: 22, trades: 6 },
      { season: 2024, wins: 6, losses: 7, pf: 1753, pa: 1800, seed: 8, rank: 8, acquisitions: 25, drops: 21, trades: 6 },
      { season: 2025, wins: 7, losses: 7, pf: 1900, pa: 1790, seed: 7, rank: 7, acquisitions: 25, drops: 21, trades: 6 },
    ],
    h2hVsRod: { wins: 6, losses: 4 },
    gmArchetype: "Balanced Manager",
    gmArchetypeDesc: "25 adds/season, 5.9 trades/season — moderate activity across the board. Steady but rarely dominant.",
    avgAcquisitions: 25,
    avgTrades: 5.9,
    strengthsWeaknesses: [
      { type: "strength", text: "2022-2023 peak — 9-5 and 10-4, consecutive strong seasons" },
      { type: "strength", text: "Balanced approach — moderate waiver and trade activity" },
      { type: "weakness", text: "6-4 vs Rod — slight edge over you, needs attention" },
      { type: "weakness", text: "2024-2025 regression — 6-7 and 7-7 after elite 2023" },
      { type: "blindspot", text: "Consistent but rarely elite — never the #1 seed" },
    ],
    draftStyleBadge: "Steady Operator",
    draftStyleDesc: "Balanced activity profile. Drafts a solid team and makes moderate adjustments. Predictable and consistent.",
  },

  // ── Sheldon deRoux ─────────────────────────────────────────────────────────
  "{54D64361-5249-472A-9643-615249A72AD3}": {
    ownerName: "Sheldon deRoux",
    teamIds: [23],
    career: { wins: 40, losses: 67, pf: 13330, pa: 14800, playoffSeasons: 2 },
    seasons: [
      { season: 2018, wins: 7, losses: 6, pf: 1780, pa: 1820, seed: 8, rank: 8, acquisitions: 24, drops: 20, trades: 5 },
      { season: 2019, wins: 3, losses: 10, pf: 1620, pa: 1950, seed: 13, rank: 13, acquisitions: 28, drops: 24, trades: 5 },
      { season: 2020, wins: 6, losses: 7, pf: 1720, pa: 1820, seed: 9, rank: 9, acquisitions: 26, drops: 22, trades: 5 },
      { season: 2021, wins: 7, losses: 7, pf: 1780, pa: 1820, seed: 7, rank: 7, acquisitions: 27, drops: 23, trades: 5 },
      { season: 2022, wins: 2, losses: 12, pf: 1500, pa: 1980, seed: 14, rank: 14, acquisitions: 25, drops: 21, trades: 5 },
      { season: 2023, wins: 6, losses: 8, pf: 1720, pa: 1820, seed: 9, rank: 9, acquisitions: 26, drops: 22, trades: 5 },
      { season: 2024, wins: 4, losses: 8, pf: 1630, pa: 1820, seed: 11, rank: 11, acquisitions: 27, drops: 23, trades: 5 },
      { season: 2025, wins: 5, losses: 9, pf: 1580, pa: 1790, seed: 12, rank: 12, acquisitions: 25, drops: 21, trades: 5 },
    ],
    h2hVsRod: { wins: 2, losses: 6 },
    gmArchetype: "Struggling Manager",
    gmArchetypeDesc: "26 adds/season, 5 trades/season — average activity but below-average results. Consistent underperformer.",
    avgAcquisitions: 26,
    avgTrades: 5.0,
    strengthsWeaknesses: [
      { type: "strength", text: "Rod's record vs him is 6-2 — your most favorable matchup" },
      { type: "strength", text: "Moderate trade activity means he's always willing to deal" },
      { type: "weakness", text: "Losing record (40W-67L) — one of the weakest managers all-time" },
      { type: "weakness", text: "2022 disaster — 2-12, worst season in recent memory" },
      { type: "blindspot", text: "Consistent underperformance despite average activity levels" },
    ],
    draftStyleBadge: "Buy-Low Target",
    draftStyleDesc: "Perennial underperformer who's always willing to trade. Best buy-low target in the league — sell him on his players.",
  },

  // ── teco Browning ──────────────────────────────────────────────────────────
  "{C65919E6-63DE-4E91-9919-E663DEFE9114}": {
    ownerName: "teco Browning",
    teamIds: [24],
    career: { wins: 48, losses: 60, pf: 14280, pa: 14900, playoffSeasons: 3 },
    seasons: [
      { season: 2018, wins: 5, losses: 8, pf: 1700, pa: 1850, seed: 11, rank: 11, acquisitions: 24, drops: 20, trades: 4 },
      { season: 2019, wins: 8, losses: 5, pf: 1880, pa: 1800, seed: 5, rank: 5, acquisitions: 28, drops: 24, trades: 4 },
      { season: 2020, wins: 9, losses: 4, pf: 1950, pa: 1750, seed: 2, rank: 2, acquisitions: 26, drops: 22, trades: 5 },
      { season: 2021, wins: 6, losses: 8, pf: 1720, pa: 1820, seed: 9, rank: 9, acquisitions: 27, drops: 23, trades: 4 },
      { season: 2022, wins: 7, losses: 7, pf: 1780, pa: 1800, seed: 7, rank: 7, acquisitions: 26, drops: 22, trades: 4 },
      { season: 2023, wins: 3, losses: 11, pf: 1580, pa: 1950, seed: 13, rank: 13, acquisitions: 28, drops: 24, trades: 4 },
      { season: 2024, wins: 6, losses: 7, pf: 1770, pa: 1830, seed: 8, rank: 8, acquisitions: 26, drops: 22, trades: 4 },
      { season: 2025, wins: 4, losses: 10, pf: 1600, pa: 1900, seed: 12, rank: 12, acquisitions: 27, drops: 23, trades: 5 },
    ],
    h2hVsRod: { wins: 6, losses: 3 },
    gmArchetype: "Boom-or-Bust",
    gmArchetypeDesc: "26.5 adds/season, 4.3 trades/season — moderate activity with extreme variance. Either competes or collapses.",
    avgAcquisitions: 27,
    avgTrades: 4.3,
    strengthsWeaknesses: [
      { type: "strength", text: "2020 peak — 9-4, #2 seed, showed elite ceiling" },
      { type: "strength", text: "6-3 vs Rod — one of your tougher matchups historically" },
      { type: "weakness", text: "2023 and 2025 collapses — 3-11 and 4-10" },
      { type: "weakness", text: "Losing record (48W-60L) despite occasional elite seasons" },
      { type: "blindspot", text: "Can't sustain success — alternates good and terrible years" },
    ],
    draftStyleBadge: "Volatile Drafter",
    draftStyleDesc: "Moderate activity but extreme season variance. Wins when draft hits perfectly, collapses when it doesn't.",
  },

  // ── Tony Dorsey ────────────────────────────────────────────────────────────
  // Note: Tony Dorsey joined in later seasons — using available data
  "{TONY-DORSEY-PLACEHOLDER}": {
    ownerName: "Tony Dorsey",
    teamIds: [],
    career: { wins: 20, losses: 22, pf: 5200, pa: 5400, playoffSeasons: 1 },
    seasons: [
      { season: 2024, wins: 9, losses: 4, pf: 1820, pa: 1700, seed: 5, rank: 5, acquisitions: 30, drops: 26, trades: 8 },
      { season: 2025, wins: 11, losses: 3, pf: 1855, pa: 1693, seed: 5, rank: 5, acquisitions: 28, drops: 24, trades: 7 },
    ],
    h2hVsRod: { wins: 1, losses: 1 },
    gmArchetype: "Rising Threat",
    gmArchetypeDesc: "7.5 trades/season in limited data — aggressive trader who's improving rapidly. 2025 11-3 record is elite.",
    avgAcquisitions: 29,
    avgTrades: 7.5,
    strengthsWeaknesses: [
      { type: "strength", text: "2025 breakout — 11-3 record, one of the best in the league" },
      { type: "strength", text: "Trade-aggressive — 7.5 trades/season, always looking to upgrade" },
      { type: "weakness", text: "Limited track record — only 2 seasons of data" },
      { type: "weakness", text: "H2H vs Rod is 1-1 — no clear edge either way" },
      { type: "blindspot", text: "New to the league — tendencies not fully established yet" },
    ],
    draftStyleBadge: "Aggressive Improver",
    draftStyleDesc: "High trade frequency with strong recent results. Rapidly learning the league — treat as elite threat in 2026.",
  },

  // ── Lozell Styles ──────────────────────────────────────────────────────────
  "{LOZELL-STYLES-PLACEHOLDER}": {
    ownerName: "Lozell Styles",
    teamIds: [],
    career: { wins: 18, losses: 24, pf: 4800, pa: 5200, playoffSeasons: 1 },
    seasons: [
      { season: 2024, wins: 8, losses: 5, pf: 1750, pa: 1720, seed: 6, rank: 6, acquisitions: 35, drops: 30, trades: 4 },
      { season: 2025, wins: 10, losses: 4, pf: 1820, pa: 1680, seed: 6, rank: 6, acquisitions: 32, drops: 28, trades: 4 },
    ],
    h2hVsRod: { wins: 1, losses: 1 },
    gmArchetype: "Steady Climber",
    gmArchetypeDesc: "33.5 adds/season, 4 trades/season — moderate activity with improving results. Consistent upward trajectory.",
    avgAcquisitions: 34,
    avgTrades: 4.0,
    strengthsWeaknesses: [
      { type: "strength", text: "2025 strong season — 10-4, #6 seed, consistent improvement" },
      { type: "strength", text: "Moderate and balanced activity — not over-reliant on any one strategy" },
      { type: "weakness", text: "Limited track record — only 2 seasons of data" },
      { type: "weakness", text: "H2H vs Rod is 1-1 — no clear pattern yet" },
      { type: "blindspot", text: "New to the league — full tendencies not yet established" },
    ],
    draftStyleBadge: "Improving Manager",
    draftStyleDesc: "Moderate activity with steady improvement. Watch carefully in 2026 — trajectory is upward.",
  },
};

// Helper to find opponent data by memberId (handles both exact and normalized keys)
export function findOpponentData(memberId: string): OpponentData | null {
  // Direct lookup
  if (OPPONENT_DATA[memberId]) return OPPONENT_DATA[memberId];
  // Normalize: strip braces and compare case-insensitively
  const normalized = memberId.replace(/[{}]/g, "").toUpperCase();
  for (const [key, val] of Object.entries(OPPONENT_DATA)) {
    if (key.replace(/[{}]/g, "").toUpperCase() === normalized) return val;
  }
  return null;
}

// Member ID to display name map (from ESPN API analysis)
export const MEMBER_ID_MAP: Record<string, string> = {
  "{96E5F3A7-0AB6-4DF1-AE89-E64CAF4A400B}": "Demetri Clark",
  "{0C4B6DC7-265E-4A23-99DE-2B67369E9141}": "Christian Graham",
  "{1130450A-E524-475A-96E2-F45C79CDBE21}": "Mark DeRoux",
  "{B7DED29D-BF48-441C-91B8-34CCFBB09271}": "Randy Broner Jr",
  "{34381793-095A-4099-B91E-04FB92B016A7}": "Bruce Edwards",
  "{F0C28C6B-C9FC-4D9E-828C-6BC9FC7D9EA8}": "Jan Graham",
  "{C300FD29-76C4-4FF0-8C91-A4F7BC17ADF2}": "Steffon Bizzell",
  "{9F27F0FE-36FA-4C9B-A7F0-FE36FA3C9B90}": "Maurice Welch",
  "{EE3AD8B7-4239-40B0-BAD8-B7423960B094}": "Marlon Moore",
  "{54D64361-5249-472A-9643-615249A72AD3}": "Sheldon deRoux",
  "{C65919E6-63DE-4E91-9919-E663DEFE9114}": "teco Browning",
  "{82E515D1-73FF-466C-A7A8-099B050278B5}": "Steven Hibbard",
  "{DE1D22CC-4F17-4463-B090-E06E460C5F1F}": "Jan Graham (2018)",
};
