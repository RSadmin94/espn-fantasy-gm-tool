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
 * changes (2010-2026), unlike a raw single-GUID match. **Championship title seasons and
 * snapshot/timeline champion rows** use `buildChampionshipAuthority` (same as Why
 * Haven't I Won / trophy history), not medal-only counts from the profile bundle.
 * Findings + confidence are reused from computeWhyHaventIWon. Owner is bridged GUID ->
 * display name -> canonical profile.
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
  championSeasonsFromAuthority,
  cleanOwnerDisplay,
  personMergeKey,
} from "./ownerProfileService";
import { computeChampionshipPath } from "./championshipPath";
import { buildChampionshipAuthority } from "./championshipAuthority";
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
  playoffTrips: number;
  championshipDrought: number;
  runnerUps: number;
  careerWinRate: number;
  activityDna: { primary: string | null; secondary: string | null };
  leagueDnaRank: number | null;
  biggestRival: string | null;
  biggestThreat: string | null;
};

export type SeasonCard = {
  season: number;
  finish: number | null;
  record: string;
  pointsFor: number | null;
  resultLabel: string;
  isChampion: boolean;
  isRunnerUp: boolean;
  championName: string | null;
  playerLevelAvailable: boolean;
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
  teamCount: number;
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
  /** Champion modes only: the failure-mode patterns/findings reframed as obstacles overcome. */
  obstaclesOvercome?: { patterns: PatternStat[]; findings: WhyFinding[] };
  /** True when the active league has no owner selected -> UI prompts team selection. */
  needsOwnerSelection: boolean;
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
      needsOwnerSelection: why.needsOwnerSelection,
      teamCount: 0,
    };
  };
  // Setup-required: no owner selected for this league - surface the CTA, never a fallback owner.
  if (why.needsOwnerSelection) return minimal(why.note ?? "Select your team for this league.");
  if (!db || !why.ownerName) return minimal();

  const allGmRows = await db
    .select().from(gmTeams).where(eq(gmTeams.leagueId, leagueId))
    .orderBy(asc(gmTeams.season), asc(gmTeams.teamId));
  const latestGmSeason = allGmRows.length ? Math.max(...allGmRows.map((t) => Number(t.season))) : null;
  const teamCount = latestGmSeason != null
    ? new Set(allGmRows.filter((t) => Number(t.season) === latestGmSeason).map((t) => Number(t.teamId))).size
    : 0;
  const resolved = resolveOwnerTeamsForProfile(allGmRows, why.ownerName);
  if (!resolved) return minimal("Owner identity could not be resolved across seasons.");

  const champAuth = await buildChampionshipAuthority({ db, leagueId });

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
  // Per-season champion NAME from the championship authority (medals primary; standings fallback).
  const championNameBySeason = new Map<number, string>();
  for (const [cs, nm] of champAuth.championNameBySeason) {
    if (nm) championNameBySeason.set(cs, cleanOwnerDisplay(nm) || "Unknown");
  }
  const rankOf = (season: number, fs: number | null | undefined): number | null => {
    const f = Number(fs);
    if (!f || f <= 0) return null;
    return f - (minFsBySeason.get(season) ?? 1) + 1;
  };

  const seasonsPlayed = snap.seasons.length;
  const seedOwnerId = String(resolved.ownerTeamRows[0]?.ownerId ?? "").trim();
  const championSeasons = championSeasonsFromAuthority(champAuth, {
    ownerId: seedOwnerId,
    profileOwnerKey: resolved.profileOwnerKey,
  });
  const titles = championSeasons.length;
  const runnerUps = snap.runnerUps;
  const correctedRanks = snap.seasonRecords
    .map((r) => rankOf(r.season, r.finalStanding))
    .filter((x): x is number => x != null && x > 0);
  const bestFinish = correctedRanks.length ? Math.min(...correctedRanks) : null;
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

  const authChampSeasonSet = new Set(championSeasons);
  const timeline: SeasonCard[] = snap.seasonRecords
    .slice()
    .sort((a, b) => b.season - a.season)
    .map((r) => {
      const fs = r.finalStanding;
      const place = rankOf(r.season, fs);
      const isAuthChampion = authChampSeasonSet.has(r.season);
      const resultLabel = isAuthChampion
        ? "Champion"
        : r.isRunnerUp
          ? "Runner-Up"
          : r.isThirdPlace
            ? "3rd Place"
            : place == null
              ? "In Progress"
              : place <= 6
                ? `${ordinal(place)} Place`
                : "Missed Playoffs";
      const ties = Number(r.ties ?? 0);
      const record = `${r.wins}-${r.losses}${ties > 0 ? `-${ties}` : ""}`;
      const hasMatchupPF = Number(r.pointsFor ?? 0) >= 100;
      return {
        season: r.season,
        finish: place,
        record,
        pointsFor: hasMatchupPF ? Math.round(Number(r.pointsFor ?? 0) * 10) / 10 : null,
        resultLabel,
        isChampion: isAuthChampion,
        isRunnerUp: !!r.isRunnerUp,
        championName: championNameBySeason.get(r.season) ?? (isAuthChampion ? (cleanOwnerDisplay(why.ownerName) || why.ownerName) : null),
        playerLevelAvailable: r.season >= 2021,
      };
    });

  const focalKey = ownerKeyOverride ?? why.ownerKey;
  const playerSeasons = snap.seasons.filter((s) => s >= 2021 && (latestCompletedSeason == null || s <= latestCompletedSeason));
  const [cp, acq, draftResults] = await Promise.all([
    computeChampionshipPath(userId, focalKey).catch(() => null),
    computeAcquisitionImpact(userId, focalKey).catch(() => null),
    // Phase B: pass leagueId to computeDraftReality — no implicit 457622 fallback.
    Promise.all(playerSeasons.map((s) => computeDraftReality(s, leagueId).catch(() => null))),
  ]);
  const readiness = buildReadiness({ cp, acq, draftResults, ownerName: why.ownerName, playoffTrips, seasonsPlayed, primary });

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

  // Mode-aware: champions get positive drivers; failure mode gets historic failure analysis.
  const champTeamBySeasonAuth = new Map<number, number>();
  for (const [cs, tid] of champAuth.championTeamIdBySeason) if (tid != null) champTeamBySeasonAuth.set(cs, tid);
  const failurePatterns = buildPatterns({ cp, flatRS, resolved, champTeamBySeason: champTeamBySeasonAuth, playoffTrips, seasonsPlayed });
  const isWinner = mode !== "why-havent-won";
  const titleSeason = championSeasons.length ? Math.max(...championSeasons) : null;
  let finalPatterns: PatternStat[];
  let finalTopReasons: WhyFinding[];
  let obstaclesOvercome: CareerReport["obstaclesOvercome"];
  if (isWinner) {
    finalPatterns = buildChampionPatterns({ titleSeason, snap, cp, acq, primary, seasonsPlayed, titles, playoffTrips, championSeasons });
    finalTopReasons = buildChampionDrivers({ titleSeason, snap, cp, acq, primary, secondary, seasonsPlayed, titles, playoffTrips, runnerUps, championSeasons, ownerName: why.ownerName });
    obstaclesOvercome = { patterns: failurePatterns, findings: why.findings };
  } else {
    finalPatterns = failurePatterns;
    finalTopReasons = why.findings;
    obstaclesOvercome = undefined;
  }
  return {
    leagueId, ownerKey: resolved.profileOwnerKey, ownerName: why.ownerName, isSetupComplete: why.isSetupComplete,
    needsOwnerSelection: why.needsOwnerSelection,
    teamCount,
    mode, title, subtitle, careerArc, careerStory, snapshot, timeline, readiness,
    patterns: finalPatterns, topReasons: finalTopReasons, obstaclesOvercome,
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
  flatRS: any[]; resolved: any; champTeamBySeason: Map<number, number>; playoffTrips: number; seasonsPlayed: number;
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
  const gp = countGamePatterns(a.flatRS, a.resolved, a.champTeamBySeason);
  if (gp.realLosses > 0) {
    out.push({ id: "close", label: "Close losses (within 10 pts)", value: String(gp.closeLosses), detail: "games that could have flipped a playoff push", severity: gp.closeLosses >= 10 ? "high" : "medium" });
    out.push({ id: "lostchamp", label: "Lost to the eventual champion", value: String(gp.lostToChamp), detail: "head-to-head losses to that season's champion (full-scoring era)", severity: gp.lostToChamp >= 6 ? "high" : "medium" });
  }
  return out;
}
function countGamePatterns(flatRS: any[], resolved: any, champTeamBySeason: Map<number, number>): { closeLosses: number; lostToChamp: number; realLosses: number } {
  const focalTeamBySeason = new Map<number, number>();
  for (const t of (resolved && resolved.ownerTeamRows ? resolved.ownerTeamRows : [])) focalTeamBySeason.set(Number(t.season), Number(t.teamId));
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

// ===== Phase 2: Champion-mode positive drivers =====

/**
 * Positive pattern stats for champion mode (Pattern Detection section).
 * All values celebrate what the owner did RIGHT in their title run.
 */
function buildChampionPatterns(a: {
  titleSeason: number | null;
  snap: any;
  cp: any | null;
  acq: any | null;
  primary: string | null;
  seasonsPlayed: number;
  titles: number;
  playoffTrips: number;
  championSeasons: number[];
}): PatternStat[] {
  const out: PatternStat[] = [];

  const titleRecord = a.titleSeason
    ? a.snap.seasonRecords?.find((r: any) => Number(r.season) === a.titleSeason)
    : null;

  // 1. Title season PF vs career average
  if (titleRecord && Number(titleRecord.pointsFor ?? 0) > 100) {
    const titlePF = Math.round(Number(titleRecord.pointsFor));
    const careerPFs = (a.snap.seasonRecords ?? [])
      .filter((r: any) => Number(r.pointsFor ?? 0) > 100)
      .map((r: any) => Number(r.pointsFor));
    const avgPF = careerPFs.length
      ? careerPFs.reduce((s: number, v: number) => s + v, 0) / careerPFs.length
      : 0;
    const aboveAvg = avgPF > 0 && titlePF > avgPF;
    out.push({
      id: "title_pf",
      label: `${a.titleSeason} Points Scored`,
      value: titlePF.toLocaleString(),
      detail: aboveAvg
        ? `+${(titlePF - avgPF).toFixed(0)} above your career season avg (${Math.round(avgPF)})`
        : `Season total points — ${Math.round(avgPF)} career avg`,
      severity: aboveAvg ? "low" : "info",
    });
  }

  // 2. Title season win-loss record
  if (titleRecord) {
    const wins = Number(titleRecord.wins ?? 0);
    const losses = Number(titleRecord.losses ?? 0);
    const total = wins + losses;
    if (total > 0) {
      const pct = Math.round((wins / total) * 100);
      out.push({
        id: "title_record",
        label: `${a.titleSeason} Regular Season`,
        value: `${wins}-${losses}`,
        detail: `${pct}% win rate — above the ${Math.round(50 + (pct - 50) * 0.5)}% typical title-season pace`,
        severity: pct >= 55 ? "low" : "info",
      });
    }
  }

  // 3. Strongest positional advantage vs champion benchmark
  const posLeads = (a.cp?.positionGaps ?? []).filter((g: any) => g.gap < -0.5)
    .sort((x: any, y: any) => x.gap - y.gap);
  if (posLeads.length > 0) {
    const best = posLeads[0];
    out.push({
      id: "pos_lead",
      label: `${best.position} Edge`,
      value: `+${Math.abs(best.gap).toFixed(1)} PPG`,
      detail: `Above champion benchmark at ${best.position}: ${best.ownerAvg.toFixed(1)} vs ${best.championAvg.toFixed(1)} avg`,
      severity: "low",
    });
  }

  // 4. Career championship rate
  if (a.titles > 0) {
    const pct = Math.round((a.titles / a.seasonsPlayed) * 100);
    out.push({
      id: "title_rate",
      label: "Career Titles",
      value: String(a.titles),
      detail: `${pct}% title rate — ${a.championSeasons.join(", ")} across ${a.seasonsPlayed} seasons`,
      severity: "low",
    });
  }

  // 5. Playoff qualification rate
  const playoffRate = a.seasonsPlayed > 0 ? a.playoffTrips / a.seasonsPlayed : 0;
  out.push({
    id: "playoff_rate",
    label: "Playoff Trips",
    value: String(a.playoffTrips),
    detail: `${Math.round(playoffRate * 100)}% qualification rate — consistent contender`,
    severity: playoffRate >= 0.40 ? "low" : "info",
  });

  // 6. Acquisition edge
  if (a.acq?.focal && Number(a.acq.focal.acquisitionImpactScore ?? 0) > 55) {
    const score = Math.round(Number(a.acq.focal.acquisitionImpactScore));
    out.push({
      id: "acq_edge",
      label: "Acquisition Impact",
      value: `${score}/100`,
      detail: "In-season roster moves above hold-your-draft baseline",
      severity: score >= 70 ? "low" : "info",
    });
  }

  return out.slice(0, 6);
}

/**
 * Positive championship drivers for the Top Reasons section in champion mode.
 * Ranked by contribution strength (severity = 0-100, higher = more impactful).
 */
function buildChampionDrivers(a: {
  titleSeason: number | null;
  snap: any;
  cp: any | null;
  acq: any | null;
  primary: string | null;
  secondary: string | null;
  seasonsPlayed: number;
  titles: number;
  playoffTrips: number;
  runnerUps: number;
  championSeasons: number[];
  ownerName: string;
}): WhyFinding[] {
  const findings: WhyFinding[] = [];

  const titleRecord = a.titleSeason
    ? a.snap.seasonRecords?.find((r: any) => Number(r.season) === a.titleSeason)
    : null;

  // 1. Scoring edge in title season vs champion benchmark
  if (titleRecord && Number(titleRecord.pointsFor ?? 0) > 100) {
    const titlePF = Number(titleRecord.pointsFor);
    const careerPFs = (a.snap.seasonRecords ?? [])
      .filter((r: any) => Number(r.pointsFor ?? 0) > 100)
      .map((r: any) => Number(r.pointsFor));
    const careerAvgPF = careerPFs.length
      ? careerPFs.reduce((s: number, v: number) => s + v, 0) / careerPFs.length
      : 0;
    // Champion benchmark = career avg + the historical gap (cp.pointsForGap shows owner is X below champ avg)
    const champBench = a.cp?.pointsForGap != null && careerAvgPF > 0
      ? careerAvgPF + Number(a.cp.pointsForGap)
      : null;
    const aboveChampBench = champBench != null && titlePF >= champBench;
    const aboveCareer = careerAvgPF > 0 && titlePF > careerAvgPF;
    if (aboveChampBench && champBench) {
      findings.push({
        id: "scoring_champ",
        headline: "Scored above the championship scoring threshold",
        detail: `${Math.round(titlePF)} points in ${a.titleSeason} — clearing the historical champion benchmark of ~${Math.round(champBench)} pts. In title seasons, output above that bar is the single strongest predictor of winning.`,
        category: "scoring",
        severity: Math.min(95, 65 + Math.round(((titlePF - champBench) / champBench) * 300)),
        metricValue: Math.round(titlePF), leagueBenchmark: Math.round(champBench),
      });
    } else if (aboveCareer) {
      findings.push({
        id: "scoring_peak",
        headline: "Peaked in the right season",
        detail: `${Math.round(titlePF)} points in ${a.titleSeason} — ${(titlePF - careerAvgPF).toFixed(0)} above your career seasonal avg (${Math.round(careerAvgPF)}). Championship teams score more than they typically do.`,
        category: "scoring",
        severity: 72,
        metricValue: Math.round(titlePF), leagueBenchmark: Math.round(careerAvgPF),
      });
    }
  }

  // 2. Positional strengths vs champion benchmark
  const posLeads = (a.cp?.positionGaps ?? []).filter((g: any) => g.gap < -0.5)
    .sort((x: any, y: any) => x.gap - y.gap);
  if (posLeads.length > 0) {
    const best = posLeads[0];
    const others = posLeads.slice(1).map((g: any) => g.position).join(", ");
    findings.push({
      id: "pos_strength",
      headline: `${best.position} was a championship-level weapon`,
      detail: `Your ${best.position}s averaged ${best.ownerAvg.toFixed(1)} pts/game vs the typical champion's ${best.championAvg.toFixed(1)}${others ? ` — also ahead at ${others}` : ""}. Positional advantage at the position accounts for 40% of the readiness score.`,
      category: "position",
      severity: Math.min(90, 58 + Math.round(Math.abs(best.gap) * 6)),
        metricValue: Math.round(best.ownerAvg * 10) / 10, leagueBenchmark: Math.round(best.championAvg * 10) / 10,
    });
  }

  // 3. Consistent playoff presence
  const playoffRate = a.seasonsPlayed > 0 ? a.playoffTrips / a.seasonsPlayed : 0;
  if (playoffRate >= 0.30) {
    findings.push({
      id: "playoff_consistency",
      headline: "Consistent playoff presence built the runway to win",
      detail: `${a.playoffTrips} playoff trips in ${a.seasonsPlayed} seasons (${Math.round(playoffRate * 100)}%). Repeated playoff exposure is the most reliable path to eventual championship — and you stayed in contention long enough to break through.`,
      category: "playoffs",
      severity: Math.min(85, 40 + Math.round(playoffRate * 90)),
        metricValue: a.playoffTrips, leagueBenchmark: a.seasonsPlayed,
    });
  }

  // 4. Activity DNA alignment
  const dnaScore = activityAlignmentScore(a.primary);
  if (dnaScore >= 70 && a.primary) {
    const desc = a.primary;
    const secondaryNote = a.secondary ? ` combined with ${a.secondary}` : "";
    findings.push({
      id: "dna_edge",
      headline: `${desc} DNA drove championship-level roster agility`,
      detail: `Your ${desc}${secondaryNote} style produces the in-season adaptability that title teams rely on. Owners who actively improve their roster mid-season outperform static draft-and-hold managers in this league.`,
      category: "acquisitions",
      severity: dnaScore,
        metricValue: dnaScore, leagueBenchmark: 100,
    });
  }

  // 5. In-season acquisition impact
  if (a.acq?.focal && Number(a.acq.focal.acquisitionImpactScore ?? 0) > 55) {
    const score = Math.round(Number(a.acq.focal.acquisitionImpactScore));
    findings.push({
      id: "acq_impact",
      headline: "In-season roster moves added measurable winning edge",
      detail: `Acquisition impact score of ${score}/100. Your waiver and trade activity throughout the season improved team strength above what you drafted — a consistent pattern in championship-winning rosters.`,
      category: "acquisitions",
      severity: Math.min(88, 38 + score),
        metricValue: score, leagueBenchmark: 100,
    });
  }

  // 6. Multi-title persistence
  if (a.titles >= 2) {
    const gap = a.championSeasons.length >= 2
      ? Math.max(...a.championSeasons) - Math.min(...a.championSeasons)
      : 0;
    findings.push({
      id: "multi_title",
      headline: `${a.titles} championships proves the system is repeatable`,
      detail: gap > 0
        ? `First title in ${Math.min(...a.championSeasons)}, returned to the top ${gap} years later in ${Math.max(...a.championSeasons)}. Back-to-back decades of contention separates genuine systems from single-year runs.`
        : `Multiple championships in ${a.championSeasons.join(", ")} — sustained excellence at the highest level.`,
      category: "playoffs",
      severity: Math.min(92, 55 + a.titles * 12 + Math.min(gap, 10)),
      metricValue: a.titles, leagueBenchmark: 1,
    });
  }

  // 7. Biggest rival overcome
  if (a.cp?.biggestRival?.ownerName) {
    const rival = String(a.cp.biggestRival.ownerName);
    findings.push({
      id: "rival_overcome",
      headline: `Broke through despite ${rival} being your biggest rival`,
      detail: `${rival} has been your toughest head-to-head opponent over your career. Winning the title means you navigated the full gauntlet — including your most dangerous competition.`,
      category: "rivals",
      severity: 68,
        metricValue: 1, leagueBenchmark: 1,
    });
  }

  return findings.sort((x, y) => y.severity - x.severity).slice(0, 6);
}
