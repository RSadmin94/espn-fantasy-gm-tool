/**
 * championshipHistoryBuilder.ts
 *
 * Shared helper that computes per-owner championship and trophy history
 * from cached ESPN season data. Uses rankCalculatedFinal (the authoritative
 * ESPN field) to determine champion (#1) and runner-up (#2) for each season.
 *
 * Produces structured trophy blocks suitable for injection into any AI prompt.
 */

import { getAllCachedSeasons, getCachedView } from "./db";
import { normalizeTeams } from "./espnService";
import { memCache } from "./memCache";

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

/**
 * Compute trophy history for all owners across all cached seasons.
 * Returns a map of memberId → OwnerTrophyRecord.
 */
export async function computeAllTrophyHistory(
  seasons?: number[],
  userId?: number
): Promise<Map<string, OwnerTrophyRecord>> {
  const trophyMap = new Map<string, OwnerTrophyRecord>();

  // Determine which seasons to scan
  const currentYear = new Date().getFullYear();
  const yearsToScan = seasons ?? Array.from({ length: currentYear - 2009 }, (_, i) => 2010 + i);

  // Determine available seasons from DB if not specified
  const availableSeasons = seasons ?? (await getAllCachedSeasons(undefined, userId));
  const yearsToProcess = yearsToScan.filter(y => availableSeasons.includes(y));

  for (const year of yearsToProcess) {
    let combined: Record<string, unknown> | null = null;
    try {
      const row = await getCachedView(year, "combined", undefined, { userId });
      if (!row) continue;
      const payload = (row as Record<string, unknown>).payload;
      combined = typeof payload === "string" ? JSON.parse(payload) : (payload as Record<string, unknown>);
    } catch {
      continue;
    }
    if (!combined) continue;

    const teamsRaw = (combined.teams as Record<string, unknown>[]) ?? [];
    const teams = normalizeTeams(combined) as Record<string, unknown>[];
    const members = (combined.members as Record<string, unknown>[]) ?? [];

    if (teams.length === 0) continue;

    // Build memberId → display name map
    const memberNameMap = new Map<string, string>();
    for (const m of members) {
      const mid = m.id as string;
      const first = (m.firstName as string) ?? "";
      const last = (m.lastName as string) ?? "";
      const display = (m.displayName as string) ?? "";
      memberNameMap.set(mid, `${first} ${last}`.trim() || display || mid);
    }

    // Build teamId → memberId map
    const teamToMember = new Map<number, string>();
    for (const t of teams) {
      const tid = t.id as number;
      const owner = (t.primaryOwner as string) || ((t.owners as string[])?.[0] ?? "");
      if (owner) teamToMember.set(tid, owner);
    }

    // Find champion (rank 1), runner-up (rank 2), third place (rank 3)
    const ranked: Array<{ rank: number; memberId: string }> = [];
    for (const t of teams) {
      const rank = t.rankCalculatedFinal as number;
      if (!rank || rank < 1 || rank > 3) continue;
      const tid = t.id as number;
      const memberId = teamToMember.get(tid);
      if (!memberId) continue;
      ranked.push({ rank, memberId });
    }

    for (const { rank, memberId } of ranked) {
      if (!trophyMap.has(memberId)) {
        trophyMap.set(memberId, {
          memberId,
          name: memberNameMap.get(memberId) ?? memberId,
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
      const rec = trophyMap.get(memberId)!;
      // Update name in case it changed
      if (memberNameMap.has(memberId)) rec.name = memberNameMap.get(memberId)!;

      if (rank === 1) {
        rec.championships++;
        rec.championshipYears.push(year);
        rec.finalsAppearances++;
        rec.totalTrophies++;
        rec.lastTitle = year;
      } else if (rank === 2) {
        rec.runnerUps++;
        rec.runnerUpYears.push(year);
        rec.finalsAppearances++;
        rec.totalTrophies++;
      } else if (rank === 3) {
        rec.thirdPlaceFinishes++;
        rec.thirdPlaceYears.push(year);
        rec.totalTrophies++;
      }
    }
  }

  // Post-process: compute derived fields
  const currentYear2 = new Date().getFullYear();
  for (const rec of Array.from(trophyMap.values())) {
    // Sort years
    rec.championshipYears.sort((a: number, b: number) => a - b);
    rec.runnerUpYears.sort((a: number, b: number) => a - b);
    rec.thirdPlaceYears.sort((a: number, b: number) => a - b);

    // Years since last title
    if (rec.lastTitle) {
      rec.yearsSinceTitle = currentYear2 - rec.lastTitle;
    }

    // Longest drought between consecutive championships
    if (rec.championshipYears.length >= 2) {
      let maxGap = 0;
      for (let i = 1; i < rec.championshipYears.length; i++) {
        maxGap = Math.max(maxGap, rec.championshipYears[i] - rec.championshipYears[i - 1]);
      }
      rec.longestDrought = maxGap;
    }

    // Prestige label
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
