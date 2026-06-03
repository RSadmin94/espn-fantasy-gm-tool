/**
 * careerReportService.ts  (Phase 0 + timeline)
 *
 * Orchestrator for the "Why Haven't I Won?" flagship redesign. Produces the page
 * mode/title, the Career Arc label, the Career Story Header, the career snapshot, the
 * season-by-season timeline, and the preserved findings (top reasons).
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
  cleanOwnerDisplay,
  personMergeKey,
} from "./ownerProfileService";
import { computeChampionshipPath } from "./championshipPath";
import { computeAcquisitionImpact } from "./acquisitionImpact";
import { computeDraftReality } from "./draftRealitySimulator";

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

export type SeasonCard = {
  season: number;
  finish: number | null;             // finalStanding (null/0 -> in progress)
  record: string;                    // "W-L" or "W-L-T"
  pointsFor: number | null;
  resultLabel: string;               // Champion / Runner-Up / 3rd Place / Nth Place / Missed Playoffs / In Progress
  isChampion: boolean;
  isRunnerUp: boolean;
  championName: string | null;       // who won the league that season
  playerLevelAvailable: boolean;     // season >= 2021 (positional/draft/acq metrics exist)
};

export type ReadinessComponent = { key: string; label: string; score: number; weight: number };
export type ChampionshipReadiness = {
  score: number;
  tier: string;
  components: ReadinessComponent[];
  positional: Array<{ position: string; ownerAvg: number; championAvg: number; gap: number; gapPct: number }>;
  topActions: string[];
};
export type PatternStat = { id: string; label: string; value: string; detail: string; severity: "high" | "medium" | "low" | "info" };

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
  timeline: SeasonCard[];
  readiness: ChampionshipReadiness | null;
  patterns: PatternStat[];
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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
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
      timeline: [], readiness: null, patterns: [], topReasons: why.findings, confidence: why.confidence, dataCoverage, note: note ?? why.note,
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

  // Champion display name per season (for the timeline).
  const championNameBySeason = new Map<number, string>();
  const minFsBySeason = new Map<number, number>();
  let latestCompletedSeason: number | null = null;
  for (const t of allGmRows) {
    const s = Number(t.season);
    const fsRaw = Number(t.finalStanding);
    if (fsRaw > 0) {
      if (!minFsBySeason.has(s) || fsRaw < (minFsBySeason.get(s) as number)) minFsBySeason.set(s, fsRaw);
      if (latestCompletedSeason == null || s > latestCompletedSeason) latestCompletedSeason = s;
    }
  }
  // Champion per season = the rank-1 team (finalStanding == that season's minimum). This backfills
  // pre-2018 winners too, since pre-2018 the champion is stored as finalStanding == 2, not 1.
  for (const ct of allGmRows) {
    const cs = Number(ct.season);
    const cfs = Number(ct.finalStanding);
    if (cfs > 0 && cfs === minFsBySeason.get(cs)) {
      championNameBySeason.set(cs, cleanOwnerDisplay(String(ct.ownerName ?? "")) || "Unknown");
    }
  }
  // Pre-2018 finalStanding for this league is offset by +1 (best team stored as 2, not 1, with
  // no rank-1 present). Detect the offset per season dynamically (subtract that season's minimum
  // standing) so the corrected rank is always 1-based; 2018+ already start at 1 -> unchanged.
  const rankOf = (season: number, fs: number | null | undefined): number | null => {
    const f = Number(fs);
    if (!f || f <= 0) return null;
    return f - (minFsBySeason.get(season) ?? 1) + 1;
  };

  const seasonsPlayed = snap.seasons.length;
  const titles = snap.championships;
  const championSeasons = snap.champSeasons.slice().sort((a, b) => a - b);
  const runnerUps = snap.runnerUps;
  const correctedRanks = snap.seasonRecords
    .map((r) => rankOf(r.season, r.finalStanding))
    .filter((x): x is number => x != null && x > 0);
  const bestFinish = correctedRanks.length ? Math.min(...correctedRanks) : null;
  // True playoff-bracket participation: offset-corrected final placement in the top 6. The
  // championship bracket produces final placements 1-6; consolation teams land 7+. (isPlayoff on
  // matchups is unusable here -- it also flags consolation games, so every team would qualify.)
  const playoffTrips = snap.seasonRecords
    .filter((r) => { const cr = rankOf(r.season, r.finalStanding); return cr != null && cr <= 6; })
    .length;
  const games = snap.totalWins + snap.totalLosses + snap.totalTies;
  const careerWinRate = games > 0 ? snap.totalWins / games : 0;

  const hasWon = titles > 0;
  const isReigning = latestCompletedSeason != null && championSeasons.includes(latestCompletedSeason);
  const mode: WhyHaventIWonResult["pageMode"] = isReigning ? "why-you-won" : hasWon ? "why-you-broke-through" : "why-havent-won";
  const drought = hasWon && latestCompletedSeason != null
    ? Math.max(0, latestCompletedSeason - Math.max(...championSeasons))
    : seasonsPlayed;
  const debut = snap.seasons.length ? Math.min(...snap.seasons) : null;
  const latestTitle = championSeasons.length ? Math.max(...championSeasons) : null;

  // ---- Season timeline (oldest -> newest) ----
  const timeline: SeasonCard[] = snap.seasonRecords
    .slice()
    .sort((a, b) => a.season - b.season)
    .map((r) => {
      const fs = r.finalStanding;
      const place = rankOf(r.season, fs);
      const resultLabel = r.isChampion ? "Champion"
        : r.isRunnerUp ? "Runner-Up"
        : r.isThirdPlace ? "3rd Place"
        : place == null ? "In Progress"
        : place <= 6 ? `${ordinal(place)} Place`
        : "Missed Playoffs";
      const ties = Number(r.ties ?? 0);
      const record = `${r.wins}-${r.losses}${ties > 0 ? `-${ties}` : ""}`;
      const hasMatchupPF = Number(r.pointsFor ?? 0) >= 100; // real fantasy total; pre-2018 stored win-indicators (PF==wins)
      return {
        season: r.season,
        finish: place,
        record,
        pointsFor: hasMatchupPF ? Math.round(Number(r.pointsFor ?? 0) * 10) / 10 : null,
        resultLabel,
        isChampion: !!r.isChampion,
        isRunnerUp: !!r.isRunnerUp,
        championName: championNameBySeason.get(r.season) ?? (r.isChampion ? (cleanOwnerDisplay(why.ownerName) || why.ownerName) : null),
        playerLevelAvailable: r.season >= 2021,
      };
    });

  // ---- Championship Readiness + Pattern Detection (player-level composition) ----
  const focalKey = ownerKeyOverride ?? why.ownerKey;
  const playerSeasons = snap.seasons.filter((s) => s >= 2021 && (latestCompletedSeason == null || s <= latestCompletedSeason));
  const [cp, acq, draftResults] = await Promise.all([
    computeChampionshipPath(userId, focalKey).catch(() => null),
    computeAcquisitionImpact(userId, focalKey).catch(() => null),
    Promise.all(playerSeasons.map((s) => computeDraftReality(s).catch(() => null))),
  ]);
  const readiness = buildReadiness({ cp, acq, draftResults, ownerName: why.ownerName, playoffTrips, seasonsPlayed, primary });
  const patterns = buildPatterns({ cp, flatRS, resolved, allGmRows, playoffTrips, seasonsPlayed });

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
    leagueDnaRank: null,
    biggestRival: cp?.biggestRival?.ownerName ?? null,
    biggestThreat: cp?.biggestThreat?.ownerName ?? null,
  };

  return {
    leagueId, ownerKey: resolved.profileOwnerKey, ownerName: why.ownerName, isSetupComplete: why.isSetupComplete,
    mode, title, subtitle, careerArc, careerStory, snapshot, timeline, readiness, patterns, topReasons: why.findings,
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


// ===== Phase 1b helpers: Championship Readiness + Pattern Detection =====
function rdAvg(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function rdClamp(n: number): number { return Math.max(0, Math.min(100, n)); }
function activityAlignmentScore(primary: string | null): number {
  switch (primary) {
    case "Roster Builder":
    case "Waiver Aggressive":
    case "Trade Opportunist": return 85;
    case "High Activity": return 75;
    case "Draft-and-Hold": return 45;
    case "Low Activity": return 35;
    default: return 60;
  }
}
function buildReadiness(a: {
  cp: Awaited<ReturnType<typeof computeChampionshipPath>> | null;
  acq: Awaited<ReturnType<typeof computeAcquisitionImpact>> | null;
  draftResults: Array<Awaited<ReturnType<typeof computeDraftReality>> | null>;
  ownerName: string; playoffTrips: number; seasonsPlayed: number; primary: string | null;
}): ChampionshipReadiness | null {
  const comps: ReadinessComponent[] = [];
  if (a.cp) {
    const posScores: number[] = [];
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      const champ = Number((a.cp.championProfile as any)?.[pos] ?? 0);
      const own = Number((a.cp.ownerProfile as any)?.[pos] ?? 0);
      if (champ > 0) posScores.push(rdClamp((100 * own) / champ));
    }
    if (posScores.length) comps.push({ key: "positional", label: "Positional strength", score: Math.round(rdAvg(posScores)), weight: 0.40 });
  }
  const playoffRate = a.seasonsPlayed > 0 ? a.playoffTrips / a.seasonsPlayed : 0;
  comps.push({ key: "playoff", label: "Playoff appearances", score: Math.round(rdClamp((playoffRate / 0.5) * 100)), weight: 0.15 });
  if (a.acq && a.acq.focal) comps.push({ key: "acquisition", label: "In-season acquisitions", score: Math.round(rdClamp(a.acq.focal.acquisitionImpactScore)), weight: 0.15 });
  const fk = personMergeKey(a.ownerName);
  const dg: number[] = [];
  const rg: number[] = [];
  for (const dr of a.draftResults) {
    if (!dr) continue;
    const oi = dr.ownerImpacts.find((o) => personMergeKey(o.ownerName) === fk);
    if (oi) { dg.push(oi.draftGrade); rg.push(oi.rosterMgmtGrade); }
  }
  if (dg.length) comps.push({ key: "draft", label: "Draft quality", score: Math.round(rdAvg(dg)), weight: 0.15 });
  if (rg.length) comps.push({ key: "rosterMgmt", label: "Roster management", score: Math.round(rdAvg(rg)), weight: 0.10 });
  comps.push({ key: "activity", label: "Activity alignment", score: activityAlignmentScore(a.primary), weight: 0.05 });
  if (!comps.length) return null;
  const totalW = comps.reduce((s, c) => s + c.weight, 0);
  const score = Math.round(comps.reduce((s, c) => s + c.score * c.weight, 0) / totalW);
  const tier = score >= 80 ? "Championship-Ready" : score >= 65 ? "Contender" : score >= 50 ? "Rising" : score >= 35 ? "Rebuilding" : "Foundation";
  const positional = (a.cp && a.cp.positionGaps ? a.cp.positionGaps : []).map((g) => ({ position: g.position as string, ownerAvg: g.ownerAvg, championAvg: g.championAvg, gap: g.gap, gapPct: g.gapPct }));
  const acts = a.cp && a.cp.recommendedActions && a.cp.recommendedActions.length ? a.cp.recommendedActions : (a.cp && a.cp.topImprovements ? a.cp.topImprovements : []);
  return { score, tier, components: comps, positional, topActions: acts.slice(0, 4) };
}
function buildPatterns(a: {
  cp: Awaited<ReturnType<typeof computeChampionshipPath>> | null;
  flatRS: any[]; resolved: any; allGmRows: any[]; playoffTrips: number; seasonsPlayed: number;
}): PatternStat[] {
  const out: PatternStat[] = [];
  const missed = Math.max(0, a.seasonsPlayed - a.playoffTrips);
  out.push({ id: "missed", label: "Missed the playoffs", value: String(missed), detail: "out of " + a.seasonsPlayed + " seasons played", severity: missed > a.seasonsPlayed / 2 ? "high" : "medium" });
  if (a.cp && a.cp.pointsForGap > 0) {
    out.push({ id: "pfgap", label: "Points/season below champions", value: "-" + Math.round(a.cp.pointsForGap), detail: "average regular-season scoring deficit vs title teams", severity: a.cp.pointsForGap > 150 ? "high" : "medium" });
  }
  const gaps = a.cp && a.cp.positionGaps ? a.cp.positionGaps.filter((x) => x.gap > 0).slice(0, 2) : [];
  for (const g of gaps) {
    out.push({ id: "pos-" + g.position, label: "Below champion " + g.position, value: "-" + g.gap.toFixed(1) + " PPG", detail: "your " + g.position + "s average " + g.ownerAvg.toFixed(1) + " vs champion " + g.championAvg.toFixed(1), severity: g.gapPct >= 20 ? "high" : "medium" });
  }
  const gp = countGamePatterns(a.flatRS, a.resolved, a.allGmRows);
  if (gp.realLosses > 0) {
    out.push({ id: "close", label: "Close losses (within 10 pts)", value: String(gp.closeLosses), detail: "games that could have flipped a playoff push", severity: gp.closeLosses >= 10 ? "high" : "medium" });
    out.push({ id: "lostchamp", label: "Lost to the eventual champion", value: String(gp.lostToChamp), detail: "head-to-head losses to that season's champion (full-scoring era)", severity: gp.lostToChamp >= 6 ? "high" : "medium" });
  }
  return out;
}
function countGamePatterns(flatRS: any[], resolved: any, allGmRows: any[]): { closeLosses: number; lostToChamp: number; realLosses: number } {
  const focalTeamBySeason = new Map<number, number>();
  for (const t of (resolved && resolved.ownerTeamRows ? resolved.ownerTeamRows : [])) focalTeamBySeason.set(Number(t.season), Number(t.teamId));
  const champTeamBySeason = new Map<number, number>();
  for (const t of allGmRows) if (Number(t.finalStanding) === 1) champTeamBySeason.set(Number(t.season), Number(t.teamId));
  const realSeasons = new Set<number>();
  for (const m of flatRS) if (Number(m.homeScore) > 50 || Number(m.awayScore) > 50) realSeasons.add(Number(m.season));
  let closeLosses = 0, lostToChamp = 0, realLosses = 0;
  for (const m of flatRS) {
    if (!Number(m.isCompleted)) continue;
    const s = Number(m.season);
    if (!realSeasons.has(s)) continue;
    const ft = focalTeamBySeason.get(s);
    if (ft == null) continue;
    const isHome = Number(m.homeTeamId) === ft;
    const isAway = Number(m.awayTeamId) === ft;
    if (!isHome && !isAway) continue;
    const my = isHome ? Number(m.homeScore) : Number(m.awayScore);
    const opp = isHome ? Number(m.awayScore) : Number(m.homeScore);
    const oppTeam = isHome ? Number(m.awayTeamId) : Number(m.homeTeamId);
    const lost = m.winnerTeamId != null ? Number(m.winnerTeamId) === oppTeam : my < opp;
    if (!lost) continue;
    realLosses++;
    if (Math.abs(my - opp) <= 10) closeLosses++;
    if (champTeamBySeason.get(s) === oppTeam) lostToChamp++;
  }
  return { closeLosses, lostToChamp, realLosses };
}