/**
 * careerReportService.ts  (Phase 0)
 *
 * Orchestrator for the "Why Haven't I Won?" flagship redesign. Produces the page
 * mode/title, the Career Arc label, the Career Story Header, the career snapshot, and
 * the preserved findings (top reasons).
 *
 * FULL-HISTORY facts come from the SAME identity-merged pipeline that powers Owner
 * Profiles (resolveOwnerTeamsForProfile + computeOwnerProfileRecordBundle over gm_teams
 * + gm_matchups). This correctly stitches an owner across season-to-season identity/GUID
 * changes (2010-2026), unlike a raw single-GUID match. Findings + confidence are reused
 * from computeWhyHaventIWon. Owner is bridged GUID -> display name -> canonical profile.
 *
 * Deterministic + template-driven. NO LLM. Profile-aware (no hardcoded Rod).
 * See WHY_HAVENT_I_WON_REDESIGN_SPEC.md.
 */
import { eq, asc } from "drizzle-orm";
import { getDb } from "./db";
import { gmTeams } from "../drizzle/schema";
import { computeWhyHaventIWon, type WhyHaventIWonResult, type WhyFinding } from "./whyHaventIWon";
import { getActivityDnaForOwner } from "./activityDnaService";
import {
  resolveOwnerTeamsForProfile,
  loadOwnerProfileSharedData,
  loadFlatRegularSeasonMatchups,
  computeOwnerProfileRecordBundle,
} from "./ownerProfileService";

export type CareerArc =
  | "The Dynasty" | "The Breakthrough" | "The Contender"
  | "The Gatekeeper" | "The Challenger" | "The Builder" | "The Underdog";

export type CareerSnapshot = {
  seasonsPlayed: number;
  titles: number;
  championSeasons: number[];
  bestFinish: number | null;
  playoffTrips: number;              // top-6 finish proxy (refined in timeline phase)
  championshipDrought: number;       // seasons since last title; seasonsPlayed if never won
  runnerUps: number;
  careerWinRate: number;             // 0-1, regular season
  activityDna: { primary: string | null; secondary: string | null };
  leagueDnaRank: number | null;      // Phase 5
  biggestRival: string | null;       // Phase 5
  biggestThreat: string | null;      // Phase 5
};

export type CareerReport = {
  leagueId: string;
  ownerKey: string | null;
  ownerName: string;
  isSetupComplete: boolean;
  mode: WhyHaventIWonResult["pageMode"];
  title: string;
  subtitle: string;
  careerArc: CareerArc | null;
  careerStory: string;
  snapshot: CareerSnapshot | null;
  topReasons: WhyFinding[];
  confidence: WhyHaventIWonResult["confidence"];
  dataCoverage: { teamLevel: string; playerLevel: string };
  note?: string;
};

function titleFor(mode: WhyHaventIWonResult["pageMode"]): { title: string; subtitle: string } {
  switch (mode) {
    case "why-you-won":
      return { title: "Why You Won", subtitle: "The exact reasons your championship season succeeded." };
    case "why-you-broke-through":
      return { title: "Why You Broke Through", subtitle: "The story of how you became a champion and what has changed since." };
    default:
      return { title: "Why Haven't I Won?", subtitle: "A complete breakdown of what's preventing you from becoming a champion." };
  }
}

function dnaDescriptor(p: string | null | undefined): string {
  switch (p) {
    case "Trade Opportunist": return "aggressive trading";
    case "Waiver Aggressive": return "aggressive waiver-wire moves";
    case "Roster Builder": return "steady roster improvement";
    case "Draft-and-Hold": return "patience and a hold-your-core approach";
    case "High Activity": return "a high-volume, hands-on style";
    case "Low Activity": return "a patient, low-churn style";
    default: return "consistent management";
  }
}

function timesWord(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

const BUILDER_PRIMARIES = new Set(["Roster Builder", "Waiver Aggressive", "Trade Opportunist"]);
const PASSIVE_DNA = new Set(["Draft-and-Hold", "Low Activity"]);

export async function computeCareerReport(
  userId?: number,
  ownerKeyOverride?: string | null,
): Promise<CareerReport> {
  const why = await computeWhyHaventIWon(userId, ownerKeyOverride ?? null);
  const leagueId = why.leagueId;
  const dataCoverage = { teamLevel: "2010-2026", playerLevel: "2021-2025" };
  const db = await getDb();

  const minimal = (note?: string): CareerReport => {
    const { title, subtitle } = titleFor(why.pageMode);
    return {
      leagueId, ownerKey: why.ownerKey, ownerName: why.ownerName, isSetupComplete: why.isSetupComplete,
      mode: why.pageMode, title, subtitle, careerArc: null, careerStory: "", snapshot: null,
      topReasons: why.findings, confidence: why.confidence, dataCoverage, note: note ?? why.note,
    };
  };
  if (!db || !why.ownerName) return minimal();

  // ---- Full-history facts via the identity-merged Owner Profile pipeline ----
  const allGmRows = await db
    .select().from(gmTeams).where(eq(gmTeams.leagueId, leagueId))
    .orderBy(asc(gmTeams.season), asc(gmTeams.teamId));
  const resolved = resolveOwnerTeamsForProfile(allGmRows, why.ownerName);
  if (!resolved) return minimal("Owner identity could not be resolved across seasons.");

  const shared = await loadOwnerProfileSharedData({ db, leagueId });
  const flatRS = await loadFlatRegularSeasonMatchups({ db, leagueId, userId: userId ?? 0 });
  const bundle = computeOwnerProfileRecordBundle({
    profileOwnerKey: resolved.profileOwnerKey,
    ownerTeamRows: resolved.ownerTeamRows,
    allLeagueGmRows: allGmRows,
    medalRows: shared.medalRows,
    flatRegularSeason: flatRS,
  });
  const snap = bundle.snapshotFromRecords;

  const dna = await getActivityDnaForOwner(leagueId, resolved.profileOwnerKey).catch(() => null);
  const primary = dna?.primaryDNA ?? null;
  const secondary = dna?.secondaryDNA ?? null;

  const seasonsPlayed = snap.seasons.length;
  const titles = snap.championships;
  const championSeasons = snap.champSeasons.slice().sort((a, b) => a - b);
  const runnerUps = snap.runnerUps;
  const finishes = snap.seasonRecords.map((r) => r.finalStanding).filter((x): x is number => x != null && x > 0);
  const bestFinish = finishes.length ? Math.min(...finishes) : null;
  // Playoff-trip proxy: final standing in the top 6 (the playoff bracket). The playoffSeed
  // column is populated for nearly every team, so it cannot mark qualifiers. Refined to true
  // bracket participation in the timeline phase.
  const playoffTrips = finishes.filter((f) => f <= 6).length;
  const games = snap.totalWins + snap.totalLosses + snap.totalTies;
  const careerWinRate = games > 0 ? snap.totalWins / games : 0;

  let latestCompletedSeason: number | null = null;
  for (const t of allGmRows) {
    if (Number(t.finalStanding) === 1) {
      const s = Number(t.season);
      if (latestCompletedSeason == null || s > latestCompletedSeason) latestCompletedSeason = s;
    }
  }
  const hasWon = titles > 0;
  const isReigning = latestCompletedSeason != null && championSeasons.includes(latestCompletedSeason);
  const mode: WhyHaventIWonResult["pageMode"] = isReigning ? "why-you-won" : hasWon ? "why-you-broke-through" : "why-havent-won";
  const drought = hasWon && latestCompletedSeason != null
    ? Math.max(0, latestCompletedSeason - Math.max(...championSeasons))
    : seasonsPlayed;
  const debut = snap.seasons.length ? Math.min(...snap.seasons) : null;
  const latestTitle = championSeasons.length ? Math.max(...championSeasons) : null;

  const careerArc = computeArc({ titles, isReigning, runnerUps, winRate: careerWinRate, primary });
  const careerStory = buildStory({
    mode, titles, championSeasons, isReigning, primary, secondary, runnerUps, playoffTrips,
    latestTitle, debut, topFinding: why.findings[0]?.headline ?? null,
  });

  const { title, subtitle } = titleFor(mode);
  const snapshot: CareerSnapshot = {
    seasonsPlayed, titles, championSeasons, bestFinish, playoffTrips,
    championshipDrought: drought, runnerUps,
    careerWinRate: Math.round(careerWinRate * 1000) / 1000,
    activityDna: { primary, secondary },
    leagueDnaRank: null, biggestRival: null, biggestThreat: null,
  };

  return {
    leagueId, ownerKey: resolved.profileOwnerKey, ownerName: why.ownerName, isSetupComplete: why.isSetupComplete,
    mode, title, subtitle, careerArc, careerStory, snapshot, topReasons: why.findings,
    confidence: why.confidence, dataCoverage, note: why.note,
  };
}

function computeArc(a: {
  titles: number; isReigning: boolean; runnerUps: number; winRate: number; primary: string | null;
}): CareerArc {
  if (a.titles >= 3) return "The Dynasty";
  if (a.isReigning) return "The Breakthrough";
  if (a.titles >= 1) return "The Contender";
  if (a.runnerUps >= 2 && a.winRate >= 0.50) return "The Gatekeeper";
  if (a.winRate >= 0.50) return "The Challenger";
  if (a.primary && BUILDER_PRIMARIES.has(a.primary)) return "The Builder";
  return "The Underdog";
}

function buildStory(c: {
  mode: WhyHaventIWonResult["pageMode"]; titles: number; championSeasons: number[];
  isReigning: boolean; primary: string | null; secondary: string | null; runnerUps: number;
  playoffTrips: number; latestTitle: number | null; debut: number | null; topFinding: string | null;
}): string {
  const s: string[] = [];
  const desc = dnaDescriptor(c.primary);
  const desc2 = c.secondary ? dnaDescriptor(c.secondary) : null;
  const howClause = desc2 && desc2 !== desc ? `${desc} and ${desc2}` : desc;

  if (c.titles >= 1) {
    if (c.titles >= 3) {
      s.push(`You have built a dynasty with ${c.titles} championships (${c.championSeasons.join(", ")}).`);
    } else if (c.isReigning) {
      s.push(c.titles === 1 && c.latestTitle != null && c.debut != null
        ? `After ${Math.max(0, c.latestTitle - c.debut)} years of chasing a title, you broke through in ${c.latestTitle}.`
        : `You enter as the reigning champion, with ${c.titles} career titles (most recently ${c.latestTitle}).`);
    } else {
      s.push(c.titles === 1 && c.latestTitle != null
        ? `You broke through for your title in ${c.latestTitle}, but you have not been back on top since.`
        : `You own ${c.titles} championships (${c.championSeasons.join(", ")}), but the crown has eluded you recently.`);
    }
    s.push(`Your path was built on ${howClause}.`);
    s.push(`You have reached the mountaintop ${timesWord(c.titles)}.`);
    s.push(c.titles >= 3 ? "The standard now is sustained dominance."
      : c.isReigning ? "The next challenge is proving it wasn't a one-year peak."
      : "The challenge now is finding your way back to the top.");
  } else {
    const passive = (c.primary != null && PASSIVE_DNA.has(c.primary)) || (c.secondary != null && PASSIVE_DNA.has(c.secondary));
    const competitive = c.runnerUps >= 1 || c.playoffTrips >= 1;
    if (passive) {
      s.push("Your profile reflects patience and stability.");
      s.push("You rarely overreact, but that same caution has limited your chances to improve your championship odds during the season.");
      s.push("The data suggests your next breakthrough requires more aggressive roster improvement.");
    } else if (competitive) {
      s.push("You have consistently fielded competitive teams but have never completed the final step.");
      const ru = c.runnerUps > 0 ? `${c.runnerUps} runner-up finish${c.runnerUps === 1 ? "" : "es"} and ` : "";
      s.push(`Your league history shows ${ru}${c.playoffTrips} playoff trips that ended short of the trophy.`);
      s.push(c.topFinding ? `Your greatest obstacle has been ${c.topFinding.charAt(0).toLowerCase()}${c.topFinding.slice(1)}.`
        : "Your greatest obstacle has been converting strong seasons into playoff success.");
    } else {
      s.push("You are still searching for your first deep playoff run.");
      s.push(c.topFinding ? `The data points to ${c.topFinding.charAt(0).toLowerCase()}${c.topFinding.slice(1)} as your biggest hurdle.`
        : "The data points to roster consistency as your biggest hurdle.");
    }
  }
  return s.join(" ");
}
