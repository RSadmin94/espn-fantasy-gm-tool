/**
 * analyze-draft-history.mjs
 * Queries the espnSeasonCache for all 8 seasons (2018-2025),
 * extracts draft picks, keeper flags, transactions, and player data,
 * then outputs a JSON summary for player profile building.
 *
 * The cache stores a single "combined" payload per season containing:
 *   - draftDetail.picks: array of draft picks (playerId, roundId, teamId, keeper, reservedForKeeper)
 *   - teams: array of team objects with roster entries
 *   - transactions: array of waiver/trade transactions
 *   - settings: league settings
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { writeFileSync } from "fs";

dotenv.config({ path: "/home/ubuntu/espn_ff_gm_tool/.env" });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const url = new URL(DB_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log("Connected. Fetching all seasons...");

const [rows] = await conn.execute(
  "SELECT season, payload FROM espn_season_cache WHERE viewName = 'combined' ORDER BY season ASC"
);
await conn.end();

console.log(`Loaded ${rows.length} seasons`);

// ── Position map ─────────────────────────────────────────────────────────────
const POS_MAP = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF", 17: "DEF" };

// ── Build player ID → name/position from roster data ─────────────────────────
// We'll build a global player map from all roster entries across all seasons
const playerIdToInfo = {}; // playerId -> { name, position, proTeam }

// ── Main extraction ───────────────────────────────────────────────────────────
const allPicks = [];
const teamNamesBySeason = {}; // season -> teamId -> { name, abbrev, owner }
const allTransactions = [];

for (const row of rows) {
  const season = row.season;
  const payload = row.payload;

  // ── Team names ──────────────────────────────────────────────────────────────
  const teams = payload.teams || [];
  teamNamesBySeason[season] = {};
  for (const t of teams) {
    const name = `${t.location || ""} ${t.nickname || ""}`.trim() || `Team ${t.id}`;
    const abbrev = t.abbrev || "";
    // Owner from members
    let ownerName = "";
    if (t.owners && payload.members) {
      const memberId = t.owners[0];
      const member = payload.members.find((m) => m.id === memberId);
      if (member) ownerName = `${member.firstName || ""} ${member.lastName || ""}`.trim();
    }
    teamNamesBySeason[season][t.id] = { name, abbrev, ownerName };

    // Extract player info from roster
    if (t.roster?.entries) {
      for (const entry of t.roster.entries) {
        const pe = entry.playerPoolEntry;
        if (!pe) continue;
        const player = pe.player || pe.playerPoolEntry?.player;
        if (!player) continue;
        const pid = player.id;
        if (!playerIdToInfo[pid]) {
          playerIdToInfo[pid] = {
            name: player.fullName || `Player ${pid}`,
            position: POS_MAP[player.defaultPositionId] || `POS${player.defaultPositionId}`,
            proTeam: player.proTeamId || 0,
          };
        }
      }
    }
  }

  // ── Draft picks ─────────────────────────────────────────────────────────────
  const picks = payload.draftDetail?.picks || [];
  console.log(`  ${season}: ${picks.length} picks, ${teams.length} teams`);

  for (const pick of picks) {
    const isKeeper = pick.keeper === true || pick.reservedForKeeper === true;
    allPicks.push({
      season,
      round: pick.roundId,
      pick: pick.roundPickNumber,
      overallPick: pick.overallPickNumber,
      playerId: pick.playerId,
      teamId: pick.teamId,
      isKeeper,
    });
  }

  // ── Transactions ─────────────────────────────────────────────────────────────
  const txns = payload.transactions || [];
  for (const txn of txns) {
    if (!txn.items) continue;
    for (const item of txn.items) {
      allTransactions.push({
        season,
        type: txn.type,
        subtype: txn.subType || "",
        playerId: item.playerId,
        fromTeamId: item.fromTeamId,
        toTeamId: item.toTeamId,
        bidAmount: txn.bidAmount || 0,
        processedDate: txn.processedDate || null,
      });
    }
  }
}

console.log(`\nTotal picks: ${allPicks.length}`);
console.log(`Total transactions: ${allTransactions.length}`);
console.log(`Players in roster data: ${Object.keys(playerIdToInfo).length}`);

// ── Enrich picks with player info ─────────────────────────────────────────────
// For players not in roster data, we'll use a placeholder
for (const pick of allPicks) {
  const info = playerIdToInfo[pick.playerId];
  pick.playerName = info?.name || `Player ${pick.playerId}`;
  pick.position = info?.position || "UNK";
}

// ── Aggregate per player ──────────────────────────────────────────────────────
const playerMap = {};

for (const pick of allPicks) {
  const pid = pick.playerId;
  if (!playerMap[pid]) {
    playerMap[pid] = {
      playerId: pid,
      playerName: pick.playerName,
      position: pick.position,
      draftHistory: [],
      keeperSeasons: [],
      teamsBySeason: {},
      firstSeen: pick.season,
      lastSeen: pick.season,
      totalDrafts: 0,
      totalKeeperYears: 0,
      roundHistory: [], // rounds drafted each season
    };
  }

  const p = playerMap[pid];
  if (pick.playerName !== `Player ${pid}`) {
    p.playerName = pick.playerName;
    p.position = pick.position;
  }

  const teamInfo = teamNamesBySeason[pick.season]?.[pick.teamId] || { name: `Team ${pick.teamId}`, abbrev: "", ownerName: "" };

  p.draftHistory.push({
    season: pick.season,
    round: pick.round,
    pick: pick.pick,
    overallPick: pick.overallPick,
    teamId: pick.teamId,
    teamName: teamInfo.name,
    ownerName: teamInfo.ownerName,
    isKeeper: pick.isKeeper,
  });

  if (pick.isKeeper) {
    p.keeperSeasons.push(pick.season);
    p.totalKeeperYears++;
  }

  p.teamsBySeason[pick.season] = { teamId: pick.teamId, teamName: teamInfo.name, ownerName: teamInfo.ownerName };
  p.firstSeen = Math.min(p.firstSeen, pick.season);
  p.lastSeen = Math.max(p.lastSeen, pick.season);
  p.totalDrafts++;
  p.roundHistory.push({ season: pick.season, round: pick.round, isKeeper: pick.isKeeper });
}

// Enrich with transaction data
for (const txn of allTransactions) {
  const pid = txn.playerId;
  if (!playerMap[pid]) continue;
  if (!playerMap[pid].transactions) playerMap[pid].transactions = [];
  playerMap[pid].transactions.push(txn);
}

// Finalize profiles
const profiles = Object.values(playerMap).map((p) => ({
  ...p,
  draftHistory: p.draftHistory.sort((a, b) => a.season - b.season),
  roundHistory: p.roundHistory.sort((a, b) => a.season - b.season),
  transactions: p.transactions || [],
  // Computed fields
  avgDraftRound: p.roundHistory.length > 0
    ? Math.round((p.roundHistory.reduce((s, r) => s + r.round, 0) / p.roundHistory.length) * 10) / 10
    : null,
  minRound: p.roundHistory.length > 0 ? Math.min(...p.roundHistory.map((r) => r.round)) : null,
  maxRound: p.roundHistory.length > 0 ? Math.max(...p.roundHistory.map((r) => r.round)) : null,
  // Value trend: is the player being drafted earlier or later over time?
  roundTrend: p.roundHistory.length >= 2
    ? p.roundHistory[p.roundHistory.length - 1].round - p.roundHistory[0].round
    : 0, // negative = drafted earlier (rising value), positive = later (falling value)
}));

// Sort by keeper years desc, then total drafts desc
profiles.sort((a, b) => {
  if (b.totalKeeperYears !== a.totalKeeperYears) return b.totalKeeperYears - a.totalKeeperYears;
  return b.totalDrafts - a.totalDrafts;
});

// ── Print summary stats ───────────────────────────────────────────────────────
console.log(`\n── Summary ──`);
console.log(`Unique players: ${profiles.length}`);
console.log(`Players kept 2+ years: ${profiles.filter((p) => p.totalKeeperYears >= 2).length}`);
console.log(`Players kept 1+ year: ${profiles.filter((p) => p.totalKeeperYears >= 1).length}`);
console.log(`Players drafted 3+ seasons: ${profiles.filter((p) => p.totalDrafts >= 3).length}`);

console.log("\n── Top 40 Most-Kept Players ──");
profiles.filter((p) => p.totalKeeperYears > 0).slice(0, 40).forEach((p, i) => {
  const teams = Object.values(p.teamsBySeason).map((t) => t.teamName).filter((v, i, a) => a.indexOf(v) === i).join(" → ").substring(0, 60);
  const rounds = p.roundHistory.map((r) => `${r.season}:R${r.round}${r.isKeeper ? "K" : ""}`).join(" ");
  console.log(
    `${String(i + 1).padStart(2)}. ${p.playerName.padEnd(25)} ${p.position.padEnd(4)} ` +
    `Kept:${p.totalKeeperYears} Drafts:${p.totalDrafts} | ${rounds}`
  );
});

console.log("\n── Players Drafted in 3+ Seasons (League Staples) ──");
profiles.filter((p) => p.totalDrafts >= 3 && p.totalKeeperYears === 0).slice(0, 20).forEach((p) => {
  const rounds = p.roundHistory.map((r) => `${r.season}:R${r.round}`).join(" ");
  console.log(`  ${p.playerName.padEnd(25)} ${p.position} | ${rounds}`);
});

console.log("\n── Season Pick Counts ──");
for (const season of [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]) {
  const picks = allPicks.filter((p) => p.season === season);
  const keepers = picks.filter((p) => p.isKeeper);
  console.log(`  ${season}: ${picks.length} picks, ${keepers.length} keepers (${keepers.map((k) => k.playerName).join(", ")})`);
}

// ── Write output ──────────────────────────────────────────────────────────────
writeFileSync(
  "/home/ubuntu/espn_ff_gm_tool/player-profiles-data.json",
  JSON.stringify({ profiles, allPicks, teamNamesBySeason, playerIdToInfo }, null, 2)
);
console.log("\nWrote player-profiles-data.json");
