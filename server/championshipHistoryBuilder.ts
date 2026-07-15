/**
 * championshipHistoryBuilder.ts
 *
 * Shared helper that computes per-owner championship and trophy history.
 * **Titles / champion seasons:** `ChampionshipAuthority` only (`buildChampionshipAuthority` —
 * medals primary, `finalStanding` fallback). This module does **not** read `rankCalculatedFinal`
 * or `finalStanding` directly for champions.
 * **Runner-up / third:** `buildHallOfFamePayload` history rows (unchanged).
 * Map keys: ESPN member id (bare UUID) when `ownerKey` is `id:{uuid}`; else canonical `ownerKey`.
 * Consumers: `biggestThreatService`, `advisorContextBuilder`, `weeklyStorylinesService`.
 *
 * Produces structured trophy blocks suitable for injection into any AI prompt.
 */

import { getDb, memberIdFromOwnerKey, resolveActiveLeagueId } from "./db";
import { buildHallOfFamePayload, type HallOfFamePayload } from "./hallOfFameService";
import { buildChampionshipAuthority, type ChampionshipAuthority } from "./championshipAuthority";

export interface OwnerTrophyRecord {
  memberId: string;
  name: string;
  championships: number;
  championshipYears: number[];
  runnerUps: number;
  runnerUpYears: number[];
  thirdPlaceFinishes: number;
  thirdPlaceYears: number[];
  finalsAppearances: number; // championships + runnerUps
  totalTrophies: number; // championships + runnerUps + thirdPlace
  lastTitle: number | null;
  yearsSinceTitle: number | null;
  longestDrought: number; // longest gap between titles (or since founding if 0 titles)
  prestige: "dynasty" | "contender" | "finalist" | "veteran" | "hungry"; // computed label
}

function mapKeyFromOwnerKey(ownerKey: string): string {
  const mid = memberIdFromOwnerKey(ownerKey);
  return mid && mid.length > 0 ? mid : ownerKey;
}

/** Sum of `championships` across all owners in the trophy map (league-wide title seasons). */
export function sumChampionshipsInTrophyMap(trophyMap: Map<string, OwnerTrophyRecord>): number {
  let n = 0;
  for (const r of trophyMap.values()) n += r.championships;
  return n;
}

/**
 * Pure merge: ChampionshipAuthority (titles) + HoF payload (RU / 3rd + display names).
 * Does not touch DB. Used by `computeAllTrophyHistory` and by unit tests (PR-G / golden parity).
 */
export function mergeTrophyHistoryFromAuthorityAndHoF(args: {
  authority: ChampionshipAuthority;
  payload: HallOfFamePayload;
  seasons?: number[] | null;
  leagueId: string;
}): Map<string, OwnerTrophyRecord> {
  const { authority, payload, seasons, leagueId } = args;
  const trophyMap = new Map<string, OwnerTrophyRecord>();

  const seasonFilter =
    seasons != null && seasons.length > 0 ? new Set(seasons.map((y) => Math.floor(Number(y)))) : null;

  const keepSeason = (y: number) => !seasonFilter || seasonFilter.has(y);

  /** memberId-or-key → aggregate */
  function bump(
    ownerKey: string | null,
    year: number,
    slot: "champ" | "ru" | "third",
    displayName: string | null,
  ) {
    if (!ownerKey) return;
    const mapKey = mapKeyFromOwnerKey(ownerKey);
    if (!trophyMap.has(mapKey)) {
      trophyMap.set(mapKey, {
        memberId: mapKey,
        name: displayName?.trim() || mapKey,
        championships: 0,
        championshipYears: [],
        runnerUps: 0,
        runnerUpYears: [],
        thirdPlaceFinishes: 0,
        thirdPlaceYears: [],
        finalsAppearances: 0,
        totalTrophies: 0,
        lastTitle: null,
        yearsSinceTitle: null,
        longestDrought: 0,
        prestige: "hungry",
      });
    }
    const rec = trophyMap.get(mapKey)!;
    if (displayName?.trim()) rec.name = displayName.trim();

    if (slot === "champ") {
      rec.championships++;
      rec.championshipYears.push(year);
      rec.finalsAppearances++;
      rec.totalTrophies++;
    } else if (slot === "ru") {
      rec.runnerUps++;
      rec.runnerUpYears.push(year);
      rec.finalsAppearances++;
      rec.totalTrophies++;
    } else {
      rec.thirdPlaceFinishes++;
      rec.thirdPlaceYears.push(year);
      rec.totalTrophies++;
    }
  }

  // ===== CHAMPIONS + TITLES: single source of truth = ChampionshipAuthority =====
  for (const [authOwnerKey, authSeasons] of authority.championSeasonsByKey) {
    for (const season of authSeasons) {
      if (!keepSeason(season)) continue;
      bump(authOwnerKey, season, "champ", authority.championNameBySeason.get(season) ?? null);
    }
  }
  const fallbackFlagged = authority.fallbackSeasons.filter(keepSeason);
  if (fallbackFlagged.length > 0) {
    console.log(
      `[trophyHistory] league ${leagueId}: ${fallbackFlagged.length} champion season(s) via ${authority.fallbackLabel} (finalStanding fallback, NOT league_medals): [${fallbackFlagged.sort((a, b) => a - b).join(", ")}]`,
    );
  }

  for (const h of payload.championships.history) {
    if (!keepSeason(h.season)) continue;

    if (h.resolvedRunnerUpOwnerKey) {
      bump(h.resolvedRunnerUpOwnerKey, h.season, "ru", h.resolvedRunnerUpDisplay);
    }
    if (h.resolvedThirdOwnerKey) {
      bump(h.resolvedThirdOwnerKey, h.season, "third", h.resolvedThirdDisplay);
    }
  }

  for (const r of payload.ownerRecords) {
    const k = mapKeyFromOwnerKey(r.ownerKey);
    const rec = trophyMap.get(k);
    if (rec) rec.name = r.displayName;
  }

  const currentYear2 = new Date().getFullYear();
  for (const rec of Array.from(trophyMap.values())) {
    rec.championshipYears.sort((a: number, b: number) => a - b);
    rec.runnerUpYears.sort((a: number, b: number) => a - b);
    rec.thirdPlaceYears.sort((a: number, b: number) => a - b);

    rec.lastTitle =
      rec.championshipYears.length > 0
        ? rec.championshipYears[rec.championshipYears.length - 1]!
        : null;

    if (rec.lastTitle) {
      rec.yearsSinceTitle = currentYear2 - rec.lastTitle;
    }

    if (rec.championshipYears.length >= 2) {
      let maxGap = 0;
      for (let i = 1; i < rec.championshipYears.length; i++) {
        maxGap = Math.max(maxGap, rec.championshipYears[i] - rec.championshipYears[i - 1]);
      }
      rec.longestDrought = maxGap;
    }

    if (rec.championships >= 3) {
      rec.prestige = "dynasty";
    } else if (rec.championships >= 2) {
      rec.prestige = "contender";
    } else if (rec.championships === 1 || rec.finalsAppearances >= 2) {
      rec.prestige = "finalist";
    } else if (rec.totalTrophies >= 1) {
      rec.prestige = "veteran";
    } else {
      rec.prestige = "hungry";
    }
  }

  return trophyMap;
}

/**
 * Compute trophy history for all owners: **champions** via `buildChampionshipAuthority`,
 * **runner-up / third** via `buildHallOfFamePayload` history rows.
 * Map keys are ESPN member ids (bare UUID) when `ownerKey` is `id:{uuid}`; otherwise
 * the canonical `ownerKey` string (rare `name:` identities).
 *
 * @param leagueIdOverride optional explicit league (golden certification / scripts) — passed to `resolveActiveLeagueId` as input override.
 */
export async function computeAllTrophyHistory(
  seasons?: number[],
  userId?: number,
  leagueIdOverride?: string | null,
): Promise<Map<string, OwnerTrophyRecord>> {
  const db = await getDb();
  if (!db) return new Map();

  const { leagueId } = await resolveActiveLeagueId(
    { user: userId != null ? { id: userId } : undefined },
    leagueIdOverride ?? null,
    undefined,
  );
  if (!leagueId) return new Map();

  const payload = await buildHallOfFamePayload({
    db,
    leagueId,
    userId: userId ?? 0,
  });

  const authority = await buildChampionshipAuthority({ db, leagueId });
  return mergeTrophyHistoryFromAuthorityAndHoF({
    authority,
    payload,
    seasons,
    leagueId,
  });
}

/**
 * Build a concise trophy summary sentence for a single owner.
 * Used inline in narrative prompts.
 */
export function buildTrophySummary(rec: OwnerTrophyRecord): string {
  if (rec.championships === 0 && rec.runnerUps === 0 && rec.thirdPlaceFinishes === 0) {
    return `${rec.name} has never won a championship or reached the finals.`;
  }

  const parts: string[] = [];

  if (rec.championships > 0) {
    const yearsStr = rec.championshipYears.join(", ");
    if (rec.championships === 1) {
      parts.push(`1 championship (${yearsStr})`);
    } else {
      parts.push(`${rec.championships} championships (${yearsStr})`);
    }
  }

  if (rec.runnerUps > 0) {
    const yearsStr = rec.runnerUpYears.join(", ");
    parts.push(`${rec.runnerUps} runner-up finish${rec.runnerUps > 1 ? "es" : ""} (${yearsStr})`);
  }

  if (rec.thirdPlaceFinishes > 0) {
    const yearsStr = rec.thirdPlaceYears.join(", ");
    parts.push(`${rec.thirdPlaceFinishes} third-place finish${rec.thirdPlaceFinishes > 1 ? "es" : ""} (${yearsStr})`);
  }

  let summary = `${rec.name}: ${parts.join(", ")}.`;

  if (rec.yearsSinceTitle !== null && rec.yearsSinceTitle > 0) {
    summary += ` Last title: ${rec.lastTitle} (${rec.yearsSinceTitle} year${rec.yearsSinceTitle !== 1 ? "s" : ""} ago).`;
  }

  return summary;
}

/**
 * Build a full trophy block for AI prompt injection.
 * Includes prestige label, title years, finals history, and drought context.
 */
export function buildTrophyPromptBlock(rec: OwnerTrophyRecord, label?: string): string {
  const header = label ?? `${rec.name} — Trophy History`;
  const lines: string[] = [`${header}:`];

  const prestigeLabels: Record<string, string> = {
    dynasty: "DYNASTY — multi-time champion, proven winner",
    contender: "CONTENDER — multiple titles, still dangerous",
    finalist: "FINALIST — has won or reached the championship game",
    veteran: "VETERAN — experienced, has podium finishes",
    hungry: "HUNGRY — no titles yet, motivated to break through",
  };
  lines.push(`  Prestige: ${prestigeLabels[rec.prestige]}`);

  if (rec.championships > 0) {
    lines.push(`  Championships (${rec.championships}): ${rec.championshipYears.join(", ")}`);
  } else {
    lines.push(`  Championships: 0 (never won)`);
  }

  if (rec.runnerUps > 0) {
    lines.push(`  Runner-up finishes (${rec.runnerUps}): ${rec.runnerUpYears.join(", ")}`);
  }

  if (rec.thirdPlaceFinishes > 0) {
    lines.push(`  Third-place finishes (${rec.thirdPlaceFinishes}): ${rec.thirdPlaceYears.join(", ")}`);
  }

  if (rec.lastTitle) {
    lines.push(`  Last title: ${rec.lastTitle} (${rec.yearsSinceTitle} year${rec.yearsSinceTitle !== 1 ? "s" : ""} ago)`);
  }

  if (rec.championships === 0 && rec.runnerUps > 0) {
    lines.push(`  Note: Has reached the championship game ${rec.finalsAppearances} time${rec.finalsAppearances !== 1 ? "s" : ""} without winning — a story of near-misses.`);
  }

  if (rec.championships >= 2 && rec.longestDrought > 3) {
    lines.push(`  Longest gap between titles: ${rec.longestDrought} years`);
  }

  return lines.join("\n");
}

/**
 * Build a compact league-wide trophy leaderboard string for the GM Advisor.
 * Sorted by championships desc, then runner-ups desc.
 */
export function buildLeagueTrophyLeaderboard(trophyMap: Map<string, OwnerTrophyRecord>): string {
  const entries = Array.from(trophyMap.values())
    .filter(r => r.championships > 0 || r.runnerUps > 0)
    .sort((a, b) => b.championships - a.championships || b.runnerUps - a.runnerUps || b.thirdPlaceFinishes - a.thirdPlaceFinishes);

  if (entries.length === 0) return "";

  const lines = ["## LEAGUE TROPHY HISTORY (ground truth — use these exact years):"];
  for (const r of Array.from(entries)) {
    const champStr = r.championships > 0 ? `🏆 ${r.championships}× (${r.championshipYears.join(", ")})` : "🏆 0×";
    const rrStr = r.runnerUps > 0 ? ` | 🥈 ${r.runnerUps}× (${r.runnerUpYears.join(", ")})` : "";
    const droughtStr = r.lastTitle && r.yearsSinceTitle && r.yearsSinceTitle > 3 ? ` | ${r.yearsSinceTitle}yr drought` : "";
    lines.push(`  ${r.name}: ${champStr}${rrStr}${droughtStr}`);
  }

  // Narrative callouts
  const dynasties = entries.filter(r => r.championships >= 3);
  const neverWon = Array.from(trophyMap.values()).filter((r: OwnerTrophyRecord) => r.championships === 0 && r.runnerUps === 0);
  const nearMisses = entries.filter(r => r.championships === 0 && r.runnerUps >= 2);

  if (dynasties.length > 0) {
    lines.push(`\nDYNASTY: ${dynasties.map(d => `${d.name} (${d.championships} titles: ${d.championshipYears.join(", ")})`).join("; ")}`);
  }
  if (nearMisses.length > 0) {
    lines.push(`NEAR-MISSES: ${nearMisses.map(n => `${n.name} (${n.runnerUps}× runner-up, 0 titles)`).join("; ")}`);
  }
  if (neverWon.length > 0) {
    lines.push(`STILL CHASING: ${neverWon.map(n => n.name).join(", ")} — no championships or finals appearances yet`);
  }

  return lines.join("\n");
}
