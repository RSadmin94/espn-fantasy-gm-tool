// FILE: server/biggestThreatService.ts
/**
 * LeagueDNA Advisor — Increment 2: Biggest Threat
 *
 * Deterministic (no-LLM) scoring engine that identifies the single most
 * threatening opponent for the active-profile user, by joining four existing
 * datasets on memberId:
 *
 *   - Rivalry / H2H  → computeRivalryScores()        (rivalryService.ts)
 *   - League DNA     → buildManagerRawData()+calcLeagueDNA() (dnaRouter/leagueDNA)
 *   - Championship   → computeAllTrophyHistory()      (championshipHistoryBuilder.ts)
 *   - Active profile → resolveActiveProfile()         (db.ts)
 *
 * Threat score (0–100) is a transparent weighted composite:
 *   Head-to-head dominance over you   0–35
 *   Playoff eliminations of you        0–20
 *   Championship pedigree (proven)     0–20
 *   Recent form against you            0–15
 *   Manager competence (DNA)           0–10
 *
 * No LLM is used. The "reason" sentence is template-assembled from the actual
 * numbers, so the output is fully reproducible.
 */

import { resolveActiveProfile, memberIdFromOwnerKey } from "./db";
import { computeRivalryScores, type RivalryPair } from "./rivalryService";
import { buildManagerRawData } from "./dnaRouter";
import { calcLeagueDNA, type ManagerDNA } from "./leagueDNA";
import { computeAllTrophyHistory, type OwnerTrophyRecord } from "./championshipHistoryBuilder";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ThreatComponents {
  headToHead: number;           // 0–35  — rival's win rate + volume vs you
  playoffEliminations: number;  // 0–20  — times they knocked you out
  championshipPedigree: number; // 0–20  — titles + finals appearances
  recentForm: number;           // 0–15  — recent losses + active losing streak
  managerCompetence: number;    // 0–10  — inverse of DNA exploitability
}

export type ThreatLevel =
  | "Apex Threat"
  | "Major Threat"
  | "Moderate Threat"
  | "Minor Threat"
  | "Negligible";

export interface BiggestThreat {
  memberId: string;
  ownerName: string;
  threatScore: number;          // 0–100
  threatLevel: ThreatLevel;
  components: ThreatComponents;
  stats: {
    h2hWinsVsYou: number;        // rival's wins over you
    h2hLossesVsYou: number;      // rival's losses to you
    h2hRecordVsYou: string;      // e.g. "14-7"
    playoffEliminations: number;
    championships: number;
    runnerUps: number;
    prestige: string;
    gmArchetype: string | null;
    exploitabilityLabel: string | null;
    heatLabel: string;
    rivalryScore: number;
    currentStreak: string;       // plain-English streak note
  };
  reason: string;                // deterministic one-liner
}

export interface BiggestThreatResult {
  focalMemberId: string | null;
  isSetupComplete: boolean;
  threat: BiggestThreat | null;
  ranked: Array<{
    memberId: string;
    ownerName: string;
    threatScore: number;
    threatLevel: ThreatLevel;
  }>;
  note?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

function threatLevel(score: number): ThreatLevel {
  if (score >= 75) return "Apex Threat";
  if (score >= 55) return "Major Threat";
  if (score >= 35) return "Moderate Threat";
  if (score >= 15) return "Minor Threat";
  return "Negligible";
}

/**
 * Score one rival into a BiggestThreat. Pure function of its inputs.
 * In RivalryPair, h2hWins/h2hLosses are from the FOCAL user's perspective:
 *   h2hLosses = focal user's losses = the rival's WINS over you.
 */
function scoreThreat(
  r: RivalryPair,
  dna: ManagerDNA | undefined,
  trophy: OwnerTrophyRecord | undefined,
): BiggestThreat {
  const rivalWins = r.h2hLosses;      // rival's wins over you
  const rivalLosses = r.h2hWins;      // rival's losses to you
  const ties = r.h2hTies ?? 0;
  const totalH2H = rivalWins + rivalLosses + ties;

  // a) Head-to-head dominance (0–35), dampened for small samples
  const winRate = totalH2H > 0 ? rivalWins / totalH2H : 0;
  const sampleDamp = totalH2H >= 6 ? 1 : totalH2H >= 3 ? 0.7 : 0.4;
  const headToHead = clamp((winRate * 25 + Math.min(10, rivalWins)) * sampleDamp, 0, 35);

  // b) Playoff eliminations of you (0–20)
  const playoffEliminations = clamp((r.playoffEliminations ?? 0) * 10, 0, 20);

  // c) Championship pedigree (0–20)
  const champs = trophy?.championships ?? 0;
  const runnerUps = trophy?.runnerUps ?? 0;
  const championshipPedigree = clamp(Math.min(14, champs * 7) + Math.min(6, runnerUps * 2), 0, 20);

  // d) Recent form against you (0–15)
  const recentLossPts = Math.min(12, (r.recentLosses ?? 0) * 4);
  const streakPts =
    r.currentStreakDirection === "losing" ? Math.min(3, r.currentStreakLength ?? 0) : 0;
  const recentForm = clamp(recentLossPts + streakPts, 0, 15);

  // e) Manager competence via DNA (0–10): inverse of exploitability
  const exploit = dna?.exploitabilityScore ?? 50; // neutral default if unknown
  const managerCompetence = clamp(((100 - exploit) / 100) * 10, 0, 10);

  const components: ThreatComponents = {
    headToHead: r1(headToHead),
    playoffEliminations: r1(playoffEliminations),
    championshipPedigree: r1(championshipPedigree),
    recentForm: r1(recentForm),
    managerCompetence: r1(managerCompetence),
  };

  const threatScore = Math.round(
    clamp(
      headToHead + playoffEliminations + championshipPedigree + recentForm + managerCompetence,
      0,
      100,
    ),
  );

  const ownerName = r.rivalName || trophy?.name || dna?.ownerName || r.rivalId;

  // Streak note
  let currentStreak = "No active streak.";
  if (r.currentStreakDirection === "losing" && (r.currentStreakLength ?? 0) >= 1) {
    currentStreak = `You're on a ${r.currentStreakLength}-game losing streak vs ${ownerName}.`;
  } else if (r.currentStreakDirection === "winning" && (r.currentStreakLength ?? 0) >= 1) {
    currentStreak = `You're on a ${r.currentStreakLength}-game winning streak vs ${ownerName}.`;
  }

  // Deterministic reason: top contributing phrases, assembled from real numbers
  const phrases: Array<{ weight: number; text: string }> = [];
  if (totalH2H > 0) {
    phrases.push({
      weight: headToHead,
      text:
        rivalWins > rivalLosses
          ? `holds a ${rivalWins}-${rivalLosses} head-to-head edge over you`
          : rivalWins === rivalLosses
            ? `is locked in a ${rivalWins}-${rivalLosses} head-to-head with you`
            : `trails you ${rivalWins}-${rivalLosses} head-to-head but stays dangerous`,
    });
  }
  if ((r.playoffEliminations ?? 0) > 0) {
    phrases.push({
      weight: playoffEliminations + 0.5, // nudge: eliminations are emotionally weighty
      text: `knocked you out of the playoffs ${r.playoffEliminations} time${r.playoffEliminations === 1 ? "" : "s"}`,
    });
  }
  if (champs > 0) {
    phrases.push({ weight: championshipPedigree, text: `is a ${champs}× champion` });
  } else if (runnerUps > 0) {
    phrases.push({ weight: championshipPedigree, text: `is a ${runnerUps}× finalist` });
  }
  if (r.currentStreakDirection === "losing" && (r.currentStreakLength ?? 0) >= 2) {
    phrases.push({ weight: recentForm, text: `has you on a ${r.currentStreakLength}-game skid` });
  } else if ((r.recentLosses ?? 0) > 0) {
    phrases.push({
      weight: recentForm,
      text: `has beaten you ${r.recentLosses} time${r.recentLosses === 1 ? "" : "s"} in the last 3 seasons`,
    });
  }
  if (dna && (dna.exploitabilityLabel === "Shark" || dna.exploitabilityLabel === "Market-Aware")) {
    phrases.push({ weight: managerCompetence, text: `manages like a ${dna.exploitabilityLabel.toLowerCase()} (low exploitability)` });
  }

  const top = phrases.sort((a, b) => b.weight - a.weight).slice(0, 3).map((p) => p.text);
  let reason: string;
  if (top.length === 0) {
    reason = `${ownerName} is your top-ranked threat, but the signal is thin — more game history will sharpen this.`;
  } else if (top.length === 1) {
    reason = `${ownerName} ${top[0]}.`;
  } else {
    reason = `${ownerName} ${top.slice(0, -1).join(", ")}, and ${top[top.length - 1]}.`;
  }

  return {
    memberId: r.rivalId,
    ownerName,
    threatScore,
    threatLevel: threatLevel(threatScore),
    components,
    stats: {
      h2hWinsVsYou: rivalWins,
      h2hLossesVsYou: rivalLosses,
      h2hRecordVsYou: `${rivalWins}-${rivalLosses}${ties ? `-${ties}` : ""}`,
      playoffEliminations: r.playoffEliminations ?? 0,
      championships: champs,
      runnerUps,
      prestige: trophy?.prestige ?? "hungry",
      gmArchetype: dna?.gmArchetype ?? null,
      exploitabilityLabel: dna?.exploitabilityLabel ?? null,
      heatLabel: r.heatLabel,
      rivalryScore: r.rivalryScore,
      currentStreak,
    },
    reason,
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Compute the biggest threat for the active-profile user (deterministic).
 *
 * @param userId Authenticated user id (optional). When absent or not set up,
 *               the underlying datasets fall back to the league's primary owner,
 *               consistent with the rest of the app's anonymous behavior.
 */
export async function computeBiggestThreat(userId?: number): Promise<BiggestThreatResult> {
  const profile = await resolveActiveProfile(userId != null ? { id: userId } : null);
  const isSetupComplete = !!profile?.isSetupComplete;
  const focalMemberId = isSetupComplete ? memberIdFromOwnerKey(profile.selectedOwnerKey) : null;

  // Pull all three datasets (each read-only over the cached ESPN seasons).
  const [rivals, managers, trophyMap] = await Promise.all([
    computeRivalryScores(userId),
    buildManagerRawData(userId),
    computeAllTrophyHistory(undefined, userId),
  ]);

  if (!rivals || rivals.length === 0) {
    return {
      focalMemberId,
      isSetupComplete,
      threat: null,
      ranked: [],
      note: "No rivalry history available yet — sync league seasons to populate threats.",
    };
  }

  const dnaByMember = new Map<string, ManagerDNA>();
  for (const d of calcLeagueDNA(managers)) dnaByMember.set(d.memberId, d);

  const scored = rivals
    .map((r) => scoreThreat(r, dnaByMember.get(r.rivalId), trophyMap.get(r.rivalId)))
    .sort((a, b) => b.threatScore - a.threatScore);

  return {
    focalMemberId,
    isSetupComplete,
    threat: scored[0] ?? null,
    ranked: scored.slice(0, 5).map((t) => ({
      memberId: t.memberId,
      ownerName: t.ownerName,
      threatScore: t.threatScore,
      threatLevel: t.threatLevel,
    })),
  };
}
