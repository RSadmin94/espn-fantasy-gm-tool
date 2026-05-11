// FILE: server/injuryService.ts
/**
 * Phase 1 — Injury Intelligence Engine
 *
 * Fetches live NFL injury + practice participation data from ESPN's public
 * injuries endpoint (no API key required) and caches in espn_season_cache
 * under season=0 / viewName="injury_cache".
 *
 * Exports:
 *   fetchAndCacheInjuries()  — fetch fresh, write to DB, return parsed
 *   getCachedInjuries()      — fast DB read
 *   getInjuries()            — smart: cache-first, fetch if missing
 *   calcInjuryScores()       — derive the 4 Phase-1 scores per player
 *   buildInjuryPromptBlock() — ready-to-inject string for any LLM prompt
 */

import { getCachedView, upsertCachedView } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PracticeStatus = "FULL" | "LIMITED" | "DNP" | "UNKNOWN";
export type InjuryDesignation = "OUT" | "DOUBTFUL" | "QUESTIONABLE" | "PROBABLE" | "IR" | "PUP" | "ACTIVE";

export interface PlayerInjuryRecord {
  playerId: number;
  playerName: string;
  position: string;
  proTeam: string;
  injuryStatus: InjuryDesignation;
  injuryType: string;
  practiceStatus: PracticeStatus;
  practiceWed: PracticeStatus;
  practiceThu: PracticeStatus;
  practiceFri: PracticeStatus;
  returnDate: string | null;
  updatedAt: string;
}

export interface InjuryScores {
  playerId: number;
  playerName: string;
  position: string;
  injuryRiskScore: number;       // 0-100, higher = more risk
  workloadConfidence: number;    // 0-100, higher = more certain about workload
  volatilityMultiplier: number;  // 0.0-1.0, applied to projection
  statusLabel: string;           // human-readable for UI
  designation: InjuryDesignation;
  practiceTrend: "IMPROVING" | "DECLINING" | "STABLE" | "UNKNOWN";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INJURY_CACHE_VIEW = "injury_cache";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeDesignation(raw: string | undefined): InjuryDesignation {
  const s = (raw ?? "").toUpperCase().trim();
  if (s === "OUT") return "OUT";
  if (s === "DOUBTFUL") return "DOUBTFUL";
  if (s === "QUESTIONABLE") return "QUESTIONABLE";
  if (s === "PROBABLE") return "PROBABLE";
  if (s === "IR" || s.includes("INJURED RESERVE")) return "IR";
  if (s === "PUP") return "PUP";
  return "ACTIVE";
}

function normalizePractice(raw: string | undefined): PracticeStatus {
  const s = (raw ?? "").toUpperCase().trim();
  if (s === "FULL" || s === "FP" || s === "FULL PARTICIPATION") return "FULL";
  if (s === "LIMITED" || s === "LP" || s === "LIMITED PARTICIPATION") return "LIMITED";
  if (s === "DNP" || s.includes("DID NOT PRACTICE")) return "DNP";
  return "UNKNOWN";
}

function calcPracticeTrend(
  wed: PracticeStatus,
  thu: PracticeStatus,
  fri: PracticeStatus
): InjuryScores["practiceTrend"] {
  const scale: Record<PracticeStatus, number> = { FULL: 3, LIMITED: 2, DNP: 1, UNKNOWN: 0 };
  const w = scale[wed], t = scale[thu], f = scale[fri];
  const known = [f, t, w].filter(v => v > 0);
  if (known.length < 2) return "UNKNOWN";
  const delta = known[0] - known[1];
  if (delta > 0) return "IMPROVING";
  if (delta < 0) return "DECLINING";
  return "STABLE";
}

// ─── ESPN fetch ───────────────────────────────────────────────────────────────

async function fetchInjuriesFromESPN(): Promise<PlayerInjuryRecord[]> {
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`ESPN injuries HTTP ${res.status}`);
    const json = await res.json() as Record<string, unknown>;

    const teamGroups = (json.injuries as Array<{
      team: Record<string, unknown>;
      injuries: Array<Record<string, unknown>>;
    }>) ?? [];

    const records: PlayerInjuryRecord[] = [];
    const now = new Date().toISOString();

    for (const group of teamGroups) {
      const proTeam = (group.team?.abbreviation as string) ?? "?";
      for (const inj of (group.injuries ?? [])) {
        const athlete = inj.athlete as Record<string, unknown> | undefined;
        if (!athlete) continue;

        const id = Number(athlete.id ?? 0);
        const name = (athlete.displayName as string) ?? "Unknown";
        const posObj = athlete.position as Record<string, unknown> | undefined;
        const pos = (posObj?.abbreviation as string) ?? "?";
        const status = inj.status as Record<string, unknown> | undefined;
        const designation = normalizeDesignation(status?.type as string);

        // Practice logs: sorted array of { date, type }
        const practiceLogs = (inj.practiceLogs as Array<{ date: string; type: string }> ?? [])
          .sort((a, b) => a.date.localeCompare(b.date));
        const len = practiceLogs.length;
        const wed = normalizePractice(practiceLogs[len - 3]?.type);
        const thu = normalizePractice(practiceLogs[len - 2]?.type);
        const fri = normalizePractice(practiceLogs[len - 1]?.type);

        records.push({
          playerId: id,
          playerName: name,
          position: pos,
          proTeam,
          injuryStatus: designation,
          injuryType: (inj.type as string) ?? "",
          practiceStatus: fri !== "UNKNOWN" ? fri : thu !== "UNKNOWN" ? thu : wed,
          practiceWed: wed,
          practiceThu: thu,
          practiceFri: fri,
          returnDate: (inj.returnDate as string) ?? null,
          updatedAt: now,
        });
      }
    }
    return records;
  } catch (err) {
    console.error("[injuryService] ESPN fetch failed:", err);
    return [];
  }
}

// ─── Cache API ────────────────────────────────────────────────────────────────

export async function fetchAndCacheInjuries(): Promise<PlayerInjuryRecord[]> {
  const records = await fetchInjuriesFromESPN();
  if (records.length > 0) {
    await upsertCachedView(0, INJURY_CACHE_VIEW, {
      records,
      fetchedAt: new Date().toISOString(),
      count: records.length,
    });
  }
  return records;
}

export async function getCachedInjuries(): Promise<PlayerInjuryRecord[]> {
  const cached = await getCachedView(0, INJURY_CACHE_VIEW);
  if (!cached) return [];
  const payload = cached.payload as { records: PlayerInjuryRecord[]; fetchedAt: string };
  const age = Date.now() - new Date(payload.fetchedAt).getTime();
  if (age > CACHE_TTL_MS) {
    fetchAndCacheInjuries().catch(() => {}); // background refresh
  }
  return payload.records ?? [];
}

/** Smart entry point: cache-first, fetch from ESPN if cache is missing. */
export async function getInjuries(): Promise<PlayerInjuryRecord[]> {
  const cached = await getCachedView(0, INJURY_CACHE_VIEW);
  if (!cached) return fetchAndCacheInjuries();
  return getCachedInjuries();
}

// ─── Score Calculation ────────────────────────────────────────────────────────

/**
 * Derives the 4 Phase-1 injury scores for a list of players.
 * Players not on the injury report are treated as ACTIVE / full confidence.
 */
export function calcInjuryScores(
  players: Array<{ playerId: number; playerName: string; position: string }>,
  injuries: PlayerInjuryRecord[]
): InjuryScores[] {
  const byId = new Map(injuries.map(i => [i.playerId, i]));
  const byName = new Map(injuries.map(i => [i.playerName.toLowerCase(), i]));

  return players.map(p => {
    const inj = byId.get(p.playerId) ?? byName.get(p.playerName.toLowerCase()) ?? null;

    if (!inj || inj.injuryStatus === "ACTIVE") {
      return {
        playerId: p.playerId,
        playerName: p.playerName,
        position: p.position,
        injuryRiskScore: 0,
        workloadConfidence: 100,
        volatilityMultiplier: 1.0,
        statusLabel: "Active — no injury concern",
        designation: "ACTIVE" as InjuryDesignation,
        practiceTrend: "UNKNOWN" as const,
      };
    }

    const trend = calcPracticeTrend(inj.practiceWed, inj.practiceThu, inj.practiceFri);

    // Injury Risk Score
    const riskBase: Record<InjuryDesignation, number> = {
      IR: 100, PUP: 100, OUT: 95, DOUBTFUL: 75,
      QUESTIONABLE: 45, PROBABLE: 20, ACTIVE: 0,
    };
    const practiceAdj = inj.practiceStatus === "DNP" ? 10 : inj.practiceStatus === "FULL" ? -10 : 0;
    const trendAdj = trend === "DECLINING" ? 5 : trend === "IMPROVING" ? -5 : 0;
    const injuryRiskScore = Math.min(100, Math.max(0, riskBase[inj.injuryStatus] + practiceAdj + trendAdj));

    const workloadConfidence = Math.round(100 - injuryRiskScore * 0.9);

    const volatilityMultiplier =
      injuryRiskScore >= 90 ? 0.10 :
      injuryRiskScore >= 75 ? 0.35 :
      injuryRiskScore >= 45 ? 0.65 :
      injuryRiskScore >= 20 ? 0.85 : 0.95;

    const practiceStr =
      inj.practiceStatus === "DNP" ? "DNP" :
      inj.practiceStatus === "LIMITED" ? "Limited practice" :
      inj.practiceStatus === "FULL" ? "Full practice" : "";
    const trendStr =
      trend === "IMPROVING" ? " — trending up" :
      trend === "DECLINING" ? " — trending down" : "";
    const statusLabel = [inj.injuryStatus, inj.injuryType ? `(${inj.injuryType})` : "", practiceStr, trendStr]
      .filter(Boolean).join(" ");

    return {
      playerId: p.playerId,
      playerName: p.playerName,
      position: p.position,
      injuryRiskScore,
      workloadConfidence,
      volatilityMultiplier,
      statusLabel,
      designation: inj.injuryStatus,
      practiceTrend: trend,
    };
  });
}

// ─── Prompt Block ─────────────────────────────────────────────────────────────

/**
 * Returns a pre-formatted block to inject into any AI system prompt.
 * Only includes players with actual risk (injuryRiskScore > 0).
 */
export function buildInjuryPromptBlock(scores: InjuryScores[]): string {
  const injured = scores.filter(s => s.injuryRiskScore > 0)
    .sort((a, b) => b.injuryRiskScore - a.injuryRiskScore);

  if (injured.length === 0) {
    return "INJURY INTELLIGENCE: All queried players are active with no injury concerns.";
  }

  const lines = injured.map(s => [
    `  ${s.playerName} (${s.position}): ${s.statusLabel}.`,
    `    Risk: ${s.injuryRiskScore}/100 | Workload confidence: ${s.workloadConfidence}% | Projection multiplier: ${s.volatilityMultiplier.toFixed(2)}x`,
  ].join("\n")).join("\n");

  return `INJURY INTELLIGENCE (live — treat as ground truth, do not contradict):\n${lines}`;
}
