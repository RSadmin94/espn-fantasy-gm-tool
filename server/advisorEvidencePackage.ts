/**
 * RFSN-052D — Advisor evidence package.
 *
 * Assembles a structured evidence object from existing authorities selected by
 * the League Intelligence Planner. Does not invent facts, does not merge
 * conflicting numbers, does not relabel partial coverage as all-time.
 *
 * `buildAdvisorEvidencePackage` is pure (snapshots in → package out).
 * `assembleAdvisorEvidencePackage` loads live authorities then builds.
 * RFSN-052E wires this into advisor.chat + `/api/advisor/stream`.
 */

import type { AdvisorAuthorityId, AdvisorEvidencePlan, AdvisorResolvedOwner } from "./advisorEvidencePlanner";
import type { AdvisorQuestionScope, AdvisorScopePhase } from "./advisorScopeResolver";
import type { MatchupMarginAnalyticsResult } from "./matchupMarginAnalytics";
import type { AdvisorCareerQualification } from "./advisorCareerQualification";
import { qualifyAdvisorCareerRecords } from "./advisorCareerQualification";

export type AdvisorFactConfidence = "high" | "medium" | "low";

export type AdvisorFactProvenance = {
  fact: string;
  sourceAuthority: AdvisorAuthorityId;
  sourceScope: string;
  startSeason: number | null;
  endSeason: number | null;
  confidence: AdvisorFactConfidence;
};

export type AdvisorEvidenceFact = AdvisorFactProvenance & {
  id: string;
  value?: number | string | null;
  ownerKey?: string | null;
  ownerName?: string | null;
};

export type AdvisorPackageOwner = {
  displayName: string;
  memberId?: string;
  canonicalPersonId: string | null;
  resolvedBy: string | null;
  status: "resolved" | "unresolved";
};

export type AdvisorEvidenceConflict = {
  topic: string;
  left: AdvisorFactProvenance;
  right: AdvisorFactProvenance;
  note: string;
};

export type AdvisorRankingRow = {
  rank: number;
  name: string;
  value: number;
  ownerKey?: string;
};

export type AdvisorRanking = {
  id: string;
  label: string;
  rows: AdvisorRankingRow[];
  provenance: AdvisorFactProvenance;
};

export type AdvisorH2HRecord = {
  wins: number;
  losses: number;
  ties: number;
  games: number;
};

export type AdvisorH2HGameHighlight = {
  season: number;
  week: number;
  isPlayoff: boolean;
  scoreA: number;
  scoreB: number;
  margin: number;
  winner: "A" | "B" | "T";
};

export type AdvisorH2HBlock = {
  personA: string | null;
  personB: string | null;
  displayA: string | null;
  displayB: string | null;
  regularSeason: AdvisorH2HRecord | null;
  playoffs: AdvisorH2HRecord | null;
  lastMeeting: {
    season: number;
    week: number;
    isPlayoff: boolean;
    scoreA: number;
    scoreB: number;
  } | null;
  meetings: number;
  meetingStartSeason: number | null;
  meetingEndSeason: number | null;
  recent5: AdvisorH2HRecord | null;
  streak: { type: "W" | "L" | "T" | "none"; count: number } | null;
  closestGame: AdvisorH2HGameHighlight | null;
  biggestBlowout: AdvisorH2HGameHighlight | null;
  /** Playoff games A won (B eliminated). */
  eliminationsByA: number;
  /** Playoff games B won (A eliminated). */
  eliminationsByB: number;
};

export type AdvisorPodiumRow = {
  key: string;
  name: string;
  championships: number;
  runnerUps: number;
  thirdPlace: number;
  champSeasons: number[];
  runnerUpSeasons: number[];
  thirdSeasons: number[];
};

export type AdvisorChampionshipsBlock = {
  reigningKey: string | null;
  reigningName: string | null;
  latestCompletedSeason: number | null;
  medalTitles: Array<{ key: string; name: string; titles: number; seasons: number[] }>;
  fallbackInclusiveTitles: Array<{ key: string; name: string; titles: number; seasons: number[] }>;
  fallbackSeasons: number[];
  unresolvedSeasons: number[];
  coverageStartSeason: number | null;
  coverageEndSeason: number | null;
  matchupCoverageStartSeason: number | null;
  matchupCoverageEndSeason: number | null;
  partialLegacySeasons: number[];
  podiumByKey: AdvisorPodiumRow[];
};

export type AdvisorEvidencePackage = {
  question?: string;
  league: {
    leagueId: string;
    leagueName: string;
    provider: string;
    coverageStartSeason: number | null;
    coverageEndSeason: number | null;
  };
  scope: {
    type: AdvisorQuestionScope["scopeType"];
    startSeason: number | null;
    endSeason: number | null;
    phase: AdvisorScopePhase;
  };
  owners: AdvisorPackageOwner[];
  facts: AdvisorEvidenceFact[];
  rankings: AdvisorRanking[];
  h2h: AdvisorH2HBlock;
  championships: AdvisorChampionshipsBlock;
  playoffs: Record<string, unknown>;
  matchupStats: Record<string, unknown>;
  draftStats: Record<string, unknown>;
  tradeStats: Record<string, unknown>;
  timelineFacts: AdvisorEvidenceFact[];
  provenance: AdvisorFactProvenance[];
  conflicts: AdvisorEvidenceConflict[];
  coverageNotes: string[];
  plan: AdvisorEvidencePlan;
  careerRecords: Array<{
    ownerKey: string;
    ownerName: string;
    wins: number;
    losses: number;
    ties: number;
    games: number;
    winPct: number;
    seasonsActive: number;
    qualified?: boolean;
  }>;
  careerQualification: AdvisorCareerQualification | null;
  eliminationLeaderboard: Array<{
    ownerKey: string;
    ownerName: string;
    inflicted: number;
    topVictimName?: string | null;
    topVictimCount?: number;
  }>;
  playoffScope: {
    kind: "championship_bracket_eliminations" | "recorded_playoff_wins";
    note: string;
    playoffMeetings: number;
    winnersBracketMeetings: number;
    consolationMeetings: number;
    unknownTierMeetings: number;
    placementGamesExcluded: number;
  } | null;
  rivalryRanking: Array<{
    focalName: string;
    rivalName: string;
    rivalryScore: number;
    heatLabel: string;
    h2hWins: number;
    h2hLosses: number;
    playoffEliminations: number;
  }>;
};

export type IdentityPersonSnapshot = {
  canonicalPersonId: string;
  canonicalName: string;
  resolvedBy: string;
  aliases?: string[];
};

export type ChampionshipSeasonRow = {
  season: number;
  ownerKey: string | null;
  ownerName: string | null;
  source: "medal" | "finalStanding-fallback" | "unresolved";
  coverageKind?: "full" | "partial_legacy" | "none";
  runnerUpKey?: string | null;
  runnerUpName?: string | null;
  thirdPlaceKey?: string | null;
  thirdPlaceName?: string | null;
};

export type ChampionshipSnapshot = {
  seasons: ChampionshipSeasonRow[];
  reigningKey: string | null;
  latestCompletedSeason: number | null;
  championshipCoverageStart?: number | null;
  championshipCoverageEnd?: number | null;
  matchupCoverageStart?: number | null;
  matchupCoverageEnd?: number | null;
  partialLegacySeasons?: number[];
};

export type H2HMeetingSnapshot = {
  season: number;
  week: number;
  isPlayoff: boolean;
  winner: "A" | "B" | "T";
  scoreA: number;
  scoreB: number;
};

export type H2HSnapshot = {
  personA: string;
  personB: string;
  displayA: string;
  displayB: string;
  meetings: H2HMeetingSnapshot[];
};

export type RivalrySnapshot = {
  focalName: string;
  rivalName: string;
  rivalryScore: number;
  heatLabel: string;
  h2hWins: number;
  h2hLosses: number;
  playoffEliminations: number;
};

export type DraftSnapshot = {
  ownerName: string;
  ownerKey?: string;
  reachCount?: number;
  pickCount?: number;
  note?: string;
};

export type TradeSnapshot = {
  ownerName: string;
  ownerKey?: string;
  completedTradeCount?: number;
  note?: string;
};

export type TimelineSnapshotFact = {
  season: number;
  ownerName: string;
  ownerKey?: string;
  label: string;
};

export type AdvisorEvidenceSources = {
  leagueName: string;
  provider: string;
  coverageStartSeason: number | null;
  coverageEndSeason: number | null;
  persons: IdentityPersonSnapshot[];
  championships?: ChampionshipSnapshot | null;
  h2h?: H2HSnapshot | null;
  rivalry?: RivalrySnapshot | null;
  margins?: MatchupMarginAnalyticsResult | null;
  /** Preformatted deterministic margin answer from the existing tool, when available. */
  marginsAnswer?: string | null;
  careerRecords?: AdvisorEvidencePackage["careerRecords"] | null;
  playoffEliminations?: AdvisorEvidencePackage["eliminationLeaderboard"] | null;
  playoffScope?: AdvisorEvidencePackage["playoffScope"] | null;
  rivalryRanking?: RivalrySnapshot[] | null;
  draft?: DraftSnapshot[] | null;
  trades?: TradeSnapshot[] | null;
  timeline?: TimelineSnapshotFact[] | null;
};

export type BuildAdvisorEvidenceInput = {
  message: string;
  leagueId: string;
  scope: AdvisorQuestionScope;
  owners: AdvisorResolvedOwner[];
  plan: AdvisorEvidencePlan;
};

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function seasonInRange(season: number, start: number | null, end: number | null): boolean {
  if (start != null && season < start) return false;
  if (end != null && season > end) return false;
  return true;
}

function coverageLabel(start: number | null, end: number | null): string {
  if (start == null || end == null) return "recorded coverage unknown";
  if (start === end) return `recorded ${start}`;
  return `recorded ${start}–${end}`;
}

/** Never emit “all time”. League-history with known bounds is recorded coverage. */
export function qualifyCoverage(
  scope: AdvisorQuestionScope,
  coverageStart: number | null,
  coverageEnd: number | null,
): string[] {
  const notes: string[] = [];
  if (coverageStart == null || coverageEnd == null) {
    notes.push("Recorded season coverage is unknown. Do not treat missing seasons as all-time.");
    return notes;
  }
  const requestedStart = scope.startSeason;
  const requestedEnd = scope.endSeason;
  if (scope.scopeType === "league_history" && !scope.explicitSeasonRequested) {
    notes.push(`Not all-time. Recorded coverage is ${coverageStart}–${coverageEnd}.`);
  }
  if (requestedStart != null && coverageStart > requestedStart) {
    notes.push(
      `Requested from ${requestedStart} but recorded coverage starts ${coverageStart}. Partial history.`,
    );
  }
  if (requestedEnd != null && coverageEnd < requestedEnd) {
    notes.push(
      `Requested through ${requestedEnd} but recorded coverage ends ${coverageEnd}. Partial history.`,
    );
  }
  return notes;
}

export function resolveOwnersAgainstIdentity(
  requested: AdvisorResolvedOwner[],
  persons: IdentityPersonSnapshot[],
): AdvisorPackageOwner[] {
  return requested.map((req) => {
    const want = normName(req.displayName);
    const byId = req.canonicalPersonId
      ? persons.find((p) => p.canonicalPersonId === req.canonicalPersonId)
      : undefined;
    const byMember = req.memberId
      ? persons.find(
          (p) =>
            p.canonicalPersonId === req.memberId ||
            p.canonicalPersonId === `id:${req.memberId}`,
        )
      : undefined;
    const byName = persons.find((p) => {
      if (normName(p.canonicalName) === want) return true;
      return (p.aliases ?? []).some((a) => normName(a) === want);
    });
    const hit = byId ?? byMember ?? byName;
    if (!hit) {
      return {
        displayName: req.displayName,
        memberId: req.memberId,
        canonicalPersonId: req.canonicalPersonId ?? null,
        resolvedBy: null,
        status: "unresolved" as const,
      };
    }
    return {
      displayName: hit.canonicalName,
      memberId: req.memberId,
      canonicalPersonId: hit.canonicalPersonId,
      resolvedBy: hit.resolvedBy,
      status: "resolved" as const,
    };
  });
}

function tallyMeetings(
  meetings: H2HMeetingSnapshot[],
  phase: AdvisorScopePhase | "regular" | "playoffs",
  start: number | null,
  end: number | null,
): { wins: number; losses: number; ties: number; games: number } {
  const rec = { wins: 0, losses: 0, ties: 0, games: 0 };
  for (const m of meetings) {
    if (!seasonInRange(m.season, start, end)) continue;
    if (phase === "regular" && m.isPlayoff) continue;
    if (phase === "playoffs" && !m.isPlayoff) continue;
    rec.games++;
    if (m.winner === "A") rec.wins++;
    else if (m.winner === "B") rec.losses++;
    else rec.ties++;
  }
  return rec;
}

function pushFact(pkg: AdvisorEvidencePackage, fact: AdvisorEvidenceFact) {
  pkg.facts.push(fact);
  pkg.provenance.push({
    fact: fact.fact,
    sourceAuthority: fact.sourceAuthority,
    sourceScope: fact.sourceScope,
    startSeason: fact.startSeason,
    endSeason: fact.endSeason,
    confidence: fact.confidence,
  });
}

function emptyH2H(): AdvisorH2HBlock {
  return {
    personA: null,
    personB: null,
    displayA: null,
    displayB: null,
    regularSeason: null,
    playoffs: null,
    lastMeeting: null,
    meetings: 0,
    meetingStartSeason: null,
    meetingEndSeason: null,
    recent5: null,
    streak: null,
    closestGame: null,
    biggestBlowout: null,
    eliminationsByA: 0,
    eliminationsByB: 0,
  };
}

export function deriveH2HInsights(
  meetings: H2HMeetingSnapshot[],
  start: number | null,
  end: number | null,
): Pick<
  AdvisorH2HBlock,
  | "recent5"
  | "streak"
  | "closestGame"
  | "biggestBlowout"
  | "eliminationsByA"
  | "eliminationsByB"
  | "meetings"
  | "meetingStartSeason"
  | "meetingEndSeason"
> {
  const inScope = meetings
    .filter((m) => seasonInRange(m.season, start, end))
    .sort((a, b) => a.season - b.season || a.week - b.week);
  const seasons = inScope.map((m) => m.season);
  const rs = inScope.filter((m) => !m.isPlayoff);
  const po = inScope.filter((m) => m.isPlayoff);

  let streak: AdvisorH2HBlock["streak"] = { type: "none", count: 0 };
  for (let i = rs.length - 1; i >= 0; i--) {
    const m = rs[i]!;
    const t: "W" | "L" | "T" = m.winner === "A" ? "W" : m.winner === "B" ? "L" : "T";
    if (streak.type === "none") streak = { type: t, count: 1 };
    else if (streak.type === t) streak.count += 1;
    else break;
  }

  const recentSlice = rs.slice(-5);
  const recent5 = recentSlice.length
    ? tallyMeetings(recentSlice, "regular", start, end)
    : null;

  let closestGame: AdvisorH2HGameHighlight | null = null;
  let biggestBlowout: AdvisorH2HGameHighlight | null = null;
  for (const m of inScope) {
    if (m.winner === "T") continue;
    const margin = Math.abs(m.scoreA - m.scoreB);
    const row: AdvisorH2HGameHighlight = {
      season: m.season,
      week: m.week,
      isPlayoff: m.isPlayoff,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      margin,
      winner: m.winner,
    };
    if (!closestGame || margin < closestGame.margin) closestGame = row;
    if (!biggestBlowout || margin > biggestBlowout.margin) biggestBlowout = row;
  }

  return {
    meetings: inScope.length,
    meetingStartSeason: seasons.length ? Math.min(...seasons) : null,
    meetingEndSeason: seasons.length ? Math.max(...seasons) : null,
    recent5,
    streak,
    closestGame,
    biggestBlowout,
    eliminationsByA: po.filter((m) => m.winner === "A").length,
    eliminationsByB: po.filter((m) => m.winner === "B").length,
  };
}

function emptyChampionships(): AdvisorChampionshipsBlock {
  return {
    reigningKey: null,
    reigningName: null,
    latestCompletedSeason: null,
    medalTitles: [],
    fallbackInclusiveTitles: [],
    fallbackSeasons: [],
    unresolvedSeasons: [],
    coverageStartSeason: null,
    coverageEndSeason: null,
    matchupCoverageStartSeason: null,
    matchupCoverageEndSeason: null,
    partialLegacySeasons: [],
    podiumByKey: [],
  };
}

function effectiveSeasonBounds(
  scope: AdvisorQuestionScope,
  coverageStart: number | null,
  coverageEnd: number | null,
): { start: number | null; end: number | null } {
  const start =
    scope.startSeason != null
      ? coverageStart != null
        ? Math.max(scope.startSeason, coverageStart)
        : scope.startSeason
      : coverageStart;
  const end =
    scope.endSeason != null
      ? coverageEnd != null
        ? Math.min(scope.endSeason, coverageEnd)
        : scope.endSeason
      : coverageEnd;
  return { start, end };
}

/**
 * Pure assembler. Callers supply authority snapshots (tests or live loader).
 */
export function buildAdvisorEvidencePackage(
  input: BuildAdvisorEvidenceInput,
  sources: AdvisorEvidenceSources,
): AdvisorEvidencePackage {
  const { scope, plan } = input;
  const wanted = new Set(plan.authorities);
  const covStart = sources.coverageStartSeason;
  const covEnd = sources.coverageEndSeason;
  const bounds = effectiveSeasonBounds(scope, covStart, covEnd);
  const covText = coverageLabel(bounds.start, bounds.end);

  const owners = wanted.has("owner_identity") || input.owners.length > 0
    ? resolveOwnersAgainstIdentity(input.owners, sources.persons)
    : [];

  const pkg: AdvisorEvidencePackage = {
    question: input.message,
    league: {
      leagueId: input.leagueId,
      leagueName: sources.leagueName || "",
      provider: sources.provider || "",
      coverageStartSeason: covStart,
      coverageEndSeason: covEnd,
    },
    scope: {
      type: scope.scopeType,
      startSeason: scope.startSeason,
      endSeason: scope.endSeason,
      phase: scope.phase,
    },
    owners,
    facts: [],
    rankings: [],
    h2h: emptyH2H(),
    championships: emptyChampionships(),
    playoffs: {},
    matchupStats: {},
    draftStats: {},
    tradeStats: {},
    timelineFacts: [],
    provenance: [],
    conflicts: [],
    coverageNotes: qualifyCoverage(scope, covStart, covEnd),
    plan,
    careerRecords: [],
    careerQualification: null,
    eliminationLeaderboard: [],
    playoffScope: null,
    rivalryRanking: [],
  };

  if (plan.fallbackToAdvisorContext) {
    pkg.coverageNotes.push("Planner fallback: use existing Advisor context; no historical fan-out.");
    return pkg;
  }

  if (wanted.has("championships") || wanted.has("hall_of_fame") || wanted.has("league_records")) {
    const snap = sources.championships;
    if (!snap) {
      pkg.coverageNotes.push("Championships authority returned no data.");
    } else {
      const seasonYears = snap.seasons.map((s) => s.season);
      const champCovStart =
        snap.championshipCoverageStart ?? (seasonYears.length ? Math.min(...seasonYears) : null);
      const champCovEnd =
        snap.championshipCoverageEnd ?? (seasonYears.length ? Math.max(...seasonYears) : null);
      const champBounds = effectiveSeasonBounds(scope, champCovStart, champCovEnd);
      const champCovText = coverageLabel(champBounds.start, champBounds.end);
      const inScope = snap.seasons.filter((s) => seasonInRange(s.season, champBounds.start, champBounds.end));
      const fallbackSeasons = inScope.filter((s) => s.source === "finalStanding-fallback").map((s) => s.season);
      const unresolvedSeasons = inScope.filter((s) => s.source === "unresolved").map((s) => s.season);
      const medalOnly = inScope.filter((s) => s.source === "medal");
      const medalOrFallback = inScope.filter((s) => s.source === "medal" || s.source === "finalStanding-fallback");
      const partialLegacySeasons = [
        ...new Set([
          ...(snap.partialLegacySeasons ?? []),
          ...inScope.filter((s) => s.coverageKind === "partial_legacy").map((s) => s.season),
        ]),
      ].sort((a, b) => a - b);

      const aggregate = (rows: ChampionshipSeasonRow[]) => {
        const map = new Map<string, { key: string; name: string; titles: number; seasons: number[] }>();
        for (const r of rows) {
          if (!r.ownerKey) continue;
          const cur = map.get(r.ownerKey) ?? {
            key: r.ownerKey,
            name: r.ownerName || r.ownerKey,
            titles: 0,
            seasons: [] as number[],
          };
          if (!cur.seasons.includes(r.season)) {
            cur.titles += 1;
            cur.seasons.push(r.season);
          }
          map.set(r.ownerKey, cur);
        }
        return [...map.values()].sort((a, b) => b.titles - a.titles || a.name.localeCompare(b.name));
      };

      const medalTitles = aggregate(medalOnly);
      const fallbackInclusiveTitles = aggregate(medalOrFallback);
      const podiumMap = new Map<string, AdvisorPodiumRow>();
      const bumpPodium = (
        key: string | null | undefined,
        name: string | null | undefined,
        slot: "champ" | "ru" | "third",
        season: number,
      ) => {
        if (!key) return;
        const cur = podiumMap.get(key) ?? {
          key,
          name: name || key,
          championships: 0,
          runnerUps: 0,
          thirdPlace: 0,
          champSeasons: [] as number[],
          runnerUpSeasons: [] as number[],
          thirdSeasons: [] as number[],
        };
        if (name) cur.name = name;
        if (slot === "champ" && !cur.champSeasons.includes(season)) {
          cur.championships += 1;
          cur.champSeasons.push(season);
        } else if (slot === "ru" && !cur.runnerUpSeasons.includes(season)) {
          cur.runnerUps += 1;
          cur.runnerUpSeasons.push(season);
        } else if (slot === "third" && !cur.thirdSeasons.includes(season)) {
          cur.thirdPlace += 1;
          cur.thirdSeasons.push(season);
        }
        podiumMap.set(key, cur);
      };
      for (const r of inScope) {
        bumpPodium(r.ownerKey, r.ownerName, "champ", r.season);
        bumpPodium(r.runnerUpKey, r.runnerUpName, "ru", r.season);
        bumpPodium(r.thirdPlaceKey, r.thirdPlaceName, "third", r.season);
      }
      const podiumByKey = [...podiumMap.values()].sort(
        (a, b) => b.championships - a.championships || a.name.localeCompare(b.name),
      );
      const reigningRow = [...inScope].reverse().find((s) => s.ownerKey);
      pkg.championships = {
        reigningKey: snap.reigningKey,
        reigningName: inScope.find((s) => s.ownerKey === snap.reigningKey)?.ownerName ?? null,
        latestCompletedSeason: snap.latestCompletedSeason,
        medalTitles,
        fallbackInclusiveTitles,
        fallbackSeasons,
        unresolvedSeasons,
        coverageStartSeason: champCovStart,
        coverageEndSeason: champCovEnd,
        matchupCoverageStartSeason: snap.matchupCoverageStart ?? covStart,
        matchupCoverageEndSeason: snap.matchupCoverageEnd ?? covEnd,
        partialLegacySeasons,
        podiumByKey,
      };
      if (
        champCovStart != null &&
        champCovEnd != null &&
        (champCovStart !== covStart || champCovEnd !== covEnd)
      ) {
        pkg.coverageNotes.push(
          `Championship history coverage is ${champCovStart}–${champCovEnd}. Matchup / record coverage is ${coverageLabel(covStart, covEnd)}.`,
        );
      }

      if (medalTitles.length > 0) {
        const top = medalTitles[0]!;
        const fact: AdvisorEvidenceFact = {
          id: "titles_medal",
          fact: `${top.name}: ${top.titles} championship(s) (medals, ${champCovText})`,
          sourceAuthority: "championships",
          sourceScope: `medals · ${champCovText}`,
          startSeason: champBounds.start,
          endSeason: champBounds.end,
          confidence: fallbackSeasons.length > 0 ? "medium" : "high",
          value: top.titles,
          ownerKey: top.key,
          ownerName: top.name,
        };
        pushFact(pkg, fact);
        pkg.rankings.push({
          id: "titles_medal",
          label: `Championships (medals, ${champCovText})`,
          rows: medalTitles.map((r, i) => ({
            rank: i + 1,
            name: r.name,
            value: r.titles,
            ownerKey: r.key,
          })),
          provenance: { ...fact },
        });
      }

      if (fallbackSeasons.length > 0 && fallbackInclusiveTitles.length > 0) {
        const topAll = fallbackInclusiveTitles[0]!;
        const fact: AdvisorEvidenceFact = {
          id: "titles_fallback_inclusive",
          fact: `${topAll.name}: ${topAll.titles} championship(s) (medals + standings fallback, ${champCovText})`,
          sourceAuthority: "championships",
          sourceScope: `medals+finalStanding-fallback · ${champCovText}`,
          startSeason: champBounds.start,
          endSeason: champBounds.end,
          confidence: "medium",
          value: topAll.titles,
          ownerKey: topAll.key,
          ownerName: topAll.name,
        };
        pushFact(pkg, fact);
        pkg.rankings.push({
          id: "titles_fallback_inclusive",
          label: `Championships including standings fallback (${champCovText})`,
          rows: fallbackInclusiveTitles.map((r, i) => ({
            rank: i + 1,
            name: r.name,
            value: r.titles,
            ownerKey: r.key,
          })),
          provenance: { ...fact },
        });
        const medalTop = medalTitles[0];
        if (medalTop && (medalTop.key !== topAll.key || medalTop.titles !== topAll.titles)) {
          pkg.conflicts.push({
            topic: "championship_title_counts",
            left: pkg.provenance.find((p) => p.fact.includes("(medals,") && !p.fact.includes("fallback")) ?? {
              fact: fact.fact,
              sourceAuthority: "championships",
              sourceScope: "medals",
              startSeason: champBounds.start,
              endSeason: champBounds.end,
              confidence: "high",
            },
            right: { ...fact },
            note: "Medal-only titles and standings-fallback-inclusive titles disagree. Do not merge.",
          });
        }
      }

      if (reigningRow?.ownerName && wanted.has("championships")) {
        pushFact(pkg, {
          id: "reigning_champion",
          fact: `Reigning champion: ${reigningRow.ownerName} (${reigningRow.season}, ${reigningRow.source})`,
          sourceAuthority: "championships",
          sourceScope: `${reigningRow.source} · ${reigningRow.season}`,
          startSeason: reigningRow.season,
          endSeason: reigningRow.season,
          confidence: reigningRow.source === "medal" ? "high" : "medium",
          value: reigningRow.ownerName,
          ownerKey: reigningRow.ownerKey,
          ownerName: reigningRow.ownerName,
        });
      }
    }
  }

  if (wanted.has("h2h") || wanted.has("matchup_history") || wanted.has("playoffs")) {
    const snap = sources.h2h;
    if (!snap) {
      if (wanted.has("h2h")) pkg.coverageNotes.push("H2H authority returned no data for this pair.");
    } else {
      const rs = tallyMeetings(snap.meetings, "regular", bounds.start, bounds.end);
      const po = tallyMeetings(snap.meetings, "playoffs", bounds.start, bounds.end);
      const last = [...snap.meetings]
        .filter((m) => seasonInRange(m.season, bounds.start, bounds.end))
        .sort((a, b) => a.season - b.season || a.week - b.week)
        .at(-1);
      const extra = deriveH2HInsights(snap.meetings, bounds.start, bounds.end);
      pkg.h2h = {
        personA: snap.personA,
        personB: snap.personB,
        displayA: snap.displayA,
        displayB: snap.displayB,
        regularSeason: rs,
        playoffs: po,
        lastMeeting: last
          ? {
              season: last.season,
              week: last.week,
              isPlayoff: last.isPlayoff,
              scoreA: last.scoreA,
              scoreB: last.scoreB,
            }
          : null,
        ...extra,
      };
      pkg.playoffs = {
        h2h: po,
        sourceScope: `playoffs · ${covText}`,
      };
      pushFact(pkg, {
        id: "h2h_regular",
        fact: `${snap.displayA} vs ${snap.displayB} regular season: ${rs.wins}-${rs.losses}-${rs.ties} (${covText})`,
        sourceAuthority: "h2h",
        sourceScope: `regular_season · ${covText}`,
        startSeason: bounds.start,
        endSeason: bounds.end,
        confidence: "high",
        value: `${rs.wins}-${rs.losses}-${rs.ties}`,
      });
      pushFact(pkg, {
        id: "h2h_playoffs",
        fact: `${snap.displayA} vs ${snap.displayB} playoffs: ${po.wins}-${po.losses}-${po.ties} (${covText})`,
        sourceAuthority: "playoffs",
        sourceScope: `playoffs · ${covText}`,
        startSeason: bounds.start,
        endSeason: bounds.end,
        confidence: "high",
        value: `${po.wins}-${po.losses}-${po.ties}`,
      });
    }
  }

  if (wanted.has("rivalry") && sources.rivalry) {
    const r = sources.rivalry;
    pushFact(pkg, {
      id: "rivalry_score",
      fact: `${r.focalName} vs ${r.rivalName}: rivalry score ${r.rivalryScore} (${r.heatLabel})`,
      sourceAuthority: "rivalry",
      sourceScope: `rivalry_score_formula · ${covText}`,
      startSeason: bounds.start,
      endSeason: bounds.end,
      confidence: "medium",
      value: r.rivalryScore,
    });
    pushFact(pkg, {
      id: "rivalry_playoff_elims",
      fact: `${r.rivalName} playoff eliminations vs ${r.focalName}: ${r.playoffEliminations}`,
      sourceAuthority: "playoffs",
      sourceScope: `rivalry_playoff_elims · ${covText}`,
      startSeason: bounds.start,
      endSeason: bounds.end,
      confidence: "medium",
      value: r.playoffEliminations,
    });
    const h2hRs = pkg.h2h.regularSeason;
    if (h2hRs && (h2hRs.wins !== r.h2hWins || h2hRs.losses !== r.h2hLosses)) {
      pkg.conflicts.push({
        topic: "h2h_record",
        left: {
          fact: `H2H Authority regular season ${h2hRs.wins}-${h2hRs.losses}-${h2hRs.ties}`,
          sourceAuthority: "h2h",
          sourceScope: "regular_season",
          startSeason: bounds.start,
          endSeason: bounds.end,
          confidence: "high",
        },
        right: {
          fact: `Rivalry engine H2H ${r.h2hWins}-${r.h2hLosses}`,
          sourceAuthority: "rivalry",
          sourceScope: "rivalry_score_formula",
          startSeason: bounds.start,
          endSeason: bounds.end,
          confidence: "medium",
        },
        note: "H2H Authority and Rivalry engine report different regular-season records. Keep both; do not merge.",
      });
    }
  }

  if (wanted.has("matchup_margins")) {
    const m = sources.margins;
    if (!m?.query || !m.coverage) {
      if (sources.marginsAnswer?.trim()) {
        pkg.matchupStats = { formattedAnswer: sources.marginsAnswer.trim() };
      } else {
        pkg.coverageNotes.push("Matchup-margins authority returned no data.");
      }
    } else {
      const mStart = m.coverage.seasonFrom;
      const mEnd = m.coverage.seasonTo;
      pkg.matchupStats = {
        metric: m.query.metric,
        phase: m.coverage.phase,
        seasonFrom: mStart,
        seasonTo: mEnd,
        recordedGames: m.coverage.recordedGames,
        noData: m.noData,
        unsupported: m.unsupported,
        unsupportedReason: m.unsupportedReason,
        missingDataset: m.missingDataset,
        byOwner: m.byOwner,
        closestGame: m.closestGame,
        analytics: m,
        formattedAnswer: sources.marginsAnswer ?? null,
      };
      if (m.noData || m.unsupported) {
        pkg.coverageNotes.push(
          m.unsupportedReason || m.missingDataset || "Matchup-margins query has no computable result.",
        );
      } else if (m.ownerMaxMargins?.[0]) {
        const top = m.ownerMaxMargins[0];
        pushFact(pkg, {
          id: "margin_leader",
          fact: `${top.displayName}: ${top.maxMargin.toFixed(1)} max single-game margin (${m.coverage.phase}, ${coverageLabel(mStart, mEnd)})`,
          sourceAuthority: "matchup_margins",
          sourceScope: `${m.coverage.phase} · ${coverageLabel(mStart, mEnd)}`,
          startSeason: mStart,
          endSeason: mEnd,
          confidence: "high",
          value: top.maxMargin,
          ownerKey: top.personId,
          ownerName: top.displayName,
        });
        pkg.rankings.push({
          id: "matchup_margins",
          label: `largest single-game margin (${m.coverage.phase}, ${coverageLabel(mStart, mEnd)})`,
          rows: m.ownerMaxMargins.map((r, i) => ({
            rank: i + 1,
            name: r.displayName,
            value: r.maxMargin,
            ownerKey: r.personId,
          })),
          provenance: {
            fact: "largest single-game margin leaderboard",
            sourceAuthority: "matchup_margins",
            sourceScope: `${m.coverage.phase} · ${coverageLabel(mStart, mEnd)}`,
            startSeason: mStart,
            endSeason: mEnd,
            confidence: "high",
          },
        });
      } else if (m.byOwner[0]) {
        const top = m.byOwner[0];
        pushFact(pkg, {
          id: "margin_leader",
          fact: `${top.displayName}: ${top.count} (${m.query.metric}, ${m.coverage.phase}, ${coverageLabel(mStart, mEnd)})`,
          sourceAuthority: "matchup_margins",
          sourceScope: `${m.coverage.phase} · ${coverageLabel(mStart, mEnd)}`,
          startSeason: mStart,
          endSeason: mEnd,
          confidence: "high",
          value: top.count,
          ownerKey: top.personId,
          ownerName: top.displayName,
        });
        pkg.rankings.push({
          id: "matchup_margins",
          label: `${m.query.metric} (${m.coverage.phase}, ${coverageLabel(mStart, mEnd)})`,
          rows: m.byOwner.map((r, i) => ({
            rank: i + 1,
            name: r.displayName,
            value: r.count,
            ownerKey: r.personId,
          })),
          provenance: {
            fact: `${m.query.metric} leaderboard`,
            sourceAuthority: "matchup_margins",
            sourceScope: `${m.coverage.phase} · ${coverageLabel(mStart, mEnd)}`,
            startSeason: mStart,
            endSeason: mEnd,
            confidence: "high",
          },
        });
      } else if (m.highlightGame) {
        const g = m.highlightGame;
        pushFact(pkg, {
          id: "margin_highlight",
          fact: `${g.winnerName} ${g.winnerScore}–${g.loserScore} ${g.loserName} (margin ${g.margin}, ${g.season} week ${g.week})`,
          sourceAuthority: "matchup_margins",
          sourceScope: `${m.coverage.phase} · ${coverageLabel(mStart, mEnd)}`,
          startSeason: mStart,
          endSeason: mEnd,
          confidence: "high",
          value: g.margin,
          ownerName: g.winnerName,
        });
      }
    }
  }

  if (wanted.has("draft_history") && sources.draft?.length) {
    pkg.draftStats = { owners: sources.draft };
    for (const d of sources.draft) {
      if (d.reachCount == null && d.pickCount == null && !d.note) continue;
      pushFact(pkg, {
        id: `draft_${normName(d.ownerName).replace(/\s+/g, "_")}`,
        fact:
          d.note ||
          `${d.ownerName}: ${d.reachCount ?? 0} reaches / ${d.pickCount ?? 0} picks (${covText})`,
        sourceAuthority: "draft_history",
        sourceScope: `draft · ${covText}`,
        startSeason: bounds.start,
        endSeason: bounds.end,
        confidence: "medium",
        value: d.reachCount ?? d.pickCount ?? null,
        ownerKey: d.ownerKey,
        ownerName: d.ownerName,
      });
    }
  }

  if ((wanted.has("trades") || wanted.has("transactions")) && sources.trades?.length) {
    pkg.tradeStats = { owners: sources.trades };
    for (const t of sources.trades) {
      if (t.completedTradeCount == null && !t.note) continue;
      pushFact(pkg, {
        id: `trade_${normName(t.ownerName).replace(/\s+/g, "_")}`,
        fact:
          t.note ||
          `${t.ownerName}: ${t.completedTradeCount} completed trades (${covText})`,
        sourceAuthority: "trades",
        sourceScope: `completed_trades · ${covText}`,
        startSeason: bounds.start,
        endSeason: bounds.end,
        confidence: "medium",
        value: t.completedTradeCount ?? null,
        ownerKey: t.ownerKey,
        ownerName: t.ownerName,
      });
    }
  }

  if (wanted.has("timeline") && sources.timeline?.length) {
    for (const row of sources.timeline) {
      if (!seasonInRange(row.season, bounds.start, bounds.end)) continue;
      const fact: AdvisorEvidenceFact = {
        id: `timeline_${row.season}_${normName(row.ownerName).replace(/\s+/g, "_")}`,
        fact: `${row.season}: ${row.ownerName} — ${row.label}`,
        sourceAuthority: "timeline",
        sourceScope: `timeline · ${row.season}`,
        startSeason: row.season,
        endSeason: row.season,
        confidence: "medium",
        value: row.label,
        ownerKey: row.ownerKey,
        ownerName: row.ownerName,
      };
      pkg.timelineFacts.push(fact);
      pkg.provenance.push({
        fact: fact.fact,
        sourceAuthority: fact.sourceAuthority,
        sourceScope: fact.sourceScope,
        startSeason: fact.startSeason,
        endSeason: fact.endSeason,
        confidence: fact.confidence,
      });
    }
    if (pkg.timelineFacts.length > 0) {
      const seasons = pkg.timelineFacts.map((f) => f.startSeason!).filter(Boolean);
      pushFact(pkg, {
        id: "career_longevity",
        fact: `Timeline span ${Math.min(...seasons)}–${Math.max(...seasons)} (${pkg.timelineFacts.length} season card(s), recorded — not all-time)`,
        sourceAuthority: "timeline",
        sourceScope: `longevity · ${coverageLabel(Math.min(...seasons), Math.max(...seasons))}`,
        startSeason: Math.min(...seasons),
        endSeason: Math.max(...seasons),
        confidence: "medium",
        value: pkg.timelineFacts.length,
      });
    }
  }

  if (wanted.has("league_records") && sources.careerRecords?.length) {
    const normalized = sources.careerRecords.map((r) => ({
      ...r,
      seasonsActive: r.seasonsActive ?? 0,
    }));
    const qual = qualifyAdvisorCareerRecords(normalized);
    pkg.careerQualification = qual;
    pkg.careerRecords = normalized
      .map((r) => ({
        ...r,
        qualified: qual.candidates.find((c) => c.ownerKey === r.ownerKey)?.qualified ?? false,
      }))
      .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || a.ownerName.localeCompare(b.ownerName));
    const board = qual.qualified.length ? qual.qualified : pkg.careerRecords;
    const top = [...board].sort(
      (a, b) => b.winPct - a.winPct || b.wins - a.wins || a.ownerName.localeCompare(b.ownerName),
    )[0];
    if (top) {
      pushFact(pkg, {
        id: "career_win_pct_leader",
        fact: `${top.ownerName}: ${(top.winPct * 100).toFixed(1)}% (${top.wins}–${top.losses}–${top.ties}, regular season, ${covText}; leaderboard ≥${qual.minGames} RS games / ${qual.minSeasons} season(s))`,
        sourceAuthority: "league_records",
        sourceScope: `regular_season · ${covText}`,
        startSeason: bounds.start,
        endSeason: bounds.end,
        confidence: "high",
        value: top.winPct,
        ownerKey: top.ownerKey,
        ownerName: top.ownerName,
      });
      pkg.rankings.push({
        id: "career_win_pct",
        label: `Career winning percentage (regular season, qualified ≥${qual.minGames} games / ${qual.minSeasons} season(s), ${covText})`,
        rows: [...board]
          .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || a.ownerName.localeCompare(b.ownerName))
          .map((r, i) => ({
            rank: i + 1,
            name: r.ownerName,
            value: Number((r.winPct * 100).toFixed(1)),
            ownerKey: r.ownerKey,
          })),
        provenance: {
          fact: "Career winning percentage leaderboard (Advisor qualification; HoF unchanged)",
          sourceAuthority: "league_records",
          sourceScope: `regular_season · ${covText}`,
          startSeason: bounds.start,
          endSeason: bounds.end,
          confidence: "high",
        },
      });
    }
  }

  if ((wanted.has("playoffs") || wanted.has("rivalry")) && sources.playoffEliminations?.length) {
    pkg.eliminationLeaderboard = [...sources.playoffEliminations].sort(
      (a, b) => b.inflicted - a.inflicted || a.ownerName.localeCompare(b.ownerName),
    );
    pkg.playoffScope = sources.playoffScope ?? {
      kind: "recorded_playoff_wins",
      note: "Playoff tier not supplied on this snapshot; labeled as recorded playoff wins.",
      playoffMeetings: pkg.eliminationLeaderboard.reduce((n, r) => n + r.inflicted, 0),
      winnersBracketMeetings: 0,
      consolationMeetings: 0,
      unknownTierMeetings: 0,
      placementGamesExcluded: 0,
    };
    const top = pkg.eliminationLeaderboard[0];
    if (top) {
      const metric =
        pkg.playoffScope.kind === "championship_bracket_eliminations"
          ? "championship-bracket elimination(s)"
          : "recorded playoff win(s)";
      pushFact(pkg, {
        id: "playoff_elims_leader",
        fact: `${top.ownerName}: ${top.inflicted} ${metric} (${covText})`,
        sourceAuthority: "playoffs",
        sourceScope: `playoffs · ${covText}`,
        startSeason: bounds.start,
        endSeason: bounds.end,
        confidence: "high",
        value: top.inflicted,
        ownerKey: top.ownerKey,
        ownerName: top.ownerName,
      });
    }
  }

  const ranking = sources.rivalryRanking?.length
    ? sources.rivalryRanking
    : sources.rivalry
      ? [sources.rivalry]
      : [];
  if (wanted.has("rivalry") && ranking.length) {
    pkg.rivalryRanking = ranking;
    const top = ranking[0]!;
    pushFact(pkg, {
      id: "rivalry_top_pair",
      fact: `${top.focalName} vs ${top.rivalName}: rivalry score ${top.rivalryScore} (${top.heatLabel})`,
      sourceAuthority: "rivalry",
      sourceScope: `rivalry_score · ${covText}`,
      startSeason: bounds.start,
      endSeason: bounds.end,
      confidence: "medium",
      value: top.rivalryScore,
    });
  }

  return pkg;
}

/**
 * Live loader: existing authorities only. Safe to call without wiring into chat.
 */
export async function loadAdvisorEvidenceSources(args: {
  leagueId: string;
  leagueName?: string;
  provider?: string;
  userId?: number;
  message: string;
  plan: AdvisorEvidencePlan;
  owners: AdvisorPackageOwner[] | AdvisorResolvedOwner[];
}): Promise<AdvisorEvidenceSources> {
  const { leagueId, plan } = args;
  const wanted = new Set(plan.authorities);
  const sources: AdvisorEvidenceSources = {
    leagueName: args.leagueName ?? "",
    provider: args.provider ?? "",
    coverageStartSeason: null,
    coverageEndSeason: null,
    persons: [],
  };

  try {
    const { getLeagueHistoricalCoverageSignals } = await import("./weeklyStatsLeagueCoverage");
    const cov = await getLeagueHistoricalCoverageSignals(leagueId);
    const seasons = [...cov.teamsSeasons].sort((a, b) => a - b);
    sources.coverageStartSeason = seasons[0] ?? null;
    sources.coverageEndSeason = seasons.length ? seasons[seasons.length - 1]! : null;
  } catch {
    /* coverage optional */
  }

  if (wanted.has("owner_identity") || args.owners.length > 0) {
    try {
      const { buildOwnerIdentityAuthority } = await import("./ownerIdentityAuthority");
      const identity = await buildOwnerIdentityAuthority(leagueId);
      sources.persons = identity.listPersons().map((p) => ({
        canonicalPersonId: p.canonicalPersonId,
        canonicalName: p.canonicalName,
        resolvedBy: p.resolvedBy,
        aliases: [p.canonicalName],
      }));
    } catch {
      sources.persons = [];
    }
  }

  if (wanted.has("championships") || wanted.has("hall_of_fame") || wanted.has("league_records")) {
    try {
      const { getDb } = await import("./db");
      const { buildChampionshipAuthority } = await import("./championshipAuthority");
      const db = await getDb();
      if (db) {
        const champ = await buildChampionshipAuthority({ db, leagueId });
        const seasons: ChampionshipSeasonRow[] = [];
        for (const [season, key] of champ.championKeyBySeason) {
          seasons.push({
            season,
            ownerKey: key,
            ownerName: champ.championNameBySeason.get(season) ?? null,
            source: champ.sourceBySeason.get(season) ?? "unresolved",
            coverageKind: champ.coverageBySeason.get(season),
            runnerUpKey: champ.runnerUpKeyBySeason.get(season) ?? null,
            runnerUpName: champ.runnerUpNameBySeason.get(season) ?? null,
            thirdPlaceKey: champ.thirdPlaceKeyBySeason.get(season) ?? null,
            thirdPlaceName: champ.thirdPlaceNameBySeason.get(season) ?? null,
          });
        }
        sources.championships = {
          seasons,
          reigningKey: champ.reigningKey,
          latestCompletedSeason: champ.latestCompletedSeason,
          championshipCoverageStart: champ.championshipCoverageStart,
          championshipCoverageEnd: champ.championshipCoverageEnd,
          matchupCoverageStart: champ.matchupCoverageStart,
          matchupCoverageEnd: champ.matchupCoverageEnd,
          partialLegacySeasons: champ.partialLegacySeasons,
        };
      }
    } catch {
      sources.championships = null;
    }
  }

  if (wanted.has("h2h") || wanted.has("matchup_history") || wanted.has("playoffs")) {
    try {
      const resolved = resolveOwnersAgainstIdentity(
        args.owners.map((o) => ({
          displayName: o.displayName,
          memberId: "memberId" in o ? o.memberId : undefined,
          canonicalPersonId: o.canonicalPersonId ?? undefined,
        })),
        sources.persons,
      ).filter((o) => o.status === "resolved" && o.canonicalPersonId);
      if (resolved.length >= 2) {
        const { buildH2HAuthority } = await import("./h2hAuthority");
        const auth = await buildH2HAuthority(leagueId);
        const a = resolved[0]!;
        const b = resolved[1]!;
        const result = auth.getH2H(a.canonicalPersonId!, b.canonicalPersonId!);
        sources.h2h = {
          personA: result.personA,
          personB: result.personB,
          displayA: result.displayA,
          displayB: result.displayB,
          meetings: result.meetings.map((m) => ({
            season: m.season,
            week: m.week,
            isPlayoff: m.isPlayoff,
            winner: m.winner === result.personA ? "A" : m.winner === result.personB ? "B" : "T",
            scoreA: m.scoreA,
            scoreB: m.scoreB,
          })),
        };
      }
    } catch {
      sources.h2h = null;
    }
  }

  if (wanted.has("playoffs") || wanted.has("rivalry")) {
    try {
      const { buildH2HAuthority } = await import("./h2hAuthority");
      const auth = await buildH2HAuthority(leagueId);
      const elims = auth.eliminationsInflicted();
      sources.playoffScope = {
        kind: elims.scope,
        note: elims.note,
        playoffMeetings: elims.playoffMeetings,
        winnersBracketMeetings: elims.winnersBracketMeetings,
        consolationMeetings: elims.consolationMeetings,
        unknownTierMeetings: elims.unknownTierMeetings,
        placementGamesExcluded: elims.placementGamesExcluded,
      };
      if (elims.leaderboard.length) {
        sources.playoffEliminations = elims.leaderboard.map((e) => ({
          ownerKey: e.personId,
          ownerName: e.displayName,
          inflicted: e.inflicted,
          topVictimName: e.topVictimName,
          topVictimCount: e.topVictimCount,
        }));
      }
    } catch {
      /* H2H optional when pair snapshot already failed */
    }
  }

  if (wanted.has("rivalry") && args.userId != null) {
    try {
      const { computeRivalryScores } = await import("./rivalryService");
      const pairs = await computeRivalryScores(args.userId, leagueId);
      const top = pairs[0];
      if (top) {
        sources.rivalry = {
          focalName: top.ownerName || "Focal",
          rivalName: top.rivalName,
          rivalryScore: top.rivalryScore,
          heatLabel: top.heatLabel,
          h2hWins: top.h2hWins,
          h2hLosses: top.h2hLosses,
          playoffEliminations: top.playoffEliminations,
        };
      }
      if (pairs.length) {
        sources.rivalryRanking = pairs.slice(0, 12).map((p) => ({
          focalName: p.ownerName || "Focal",
          rivalName: p.rivalName,
          rivalryScore: p.rivalryScore,
          heatLabel: p.heatLabel,
          h2hWins: p.h2hWins,
          h2hLosses: p.h2hLosses,
          playoffEliminations: p.playoffEliminations,
        }));
      }
    } catch {
      sources.rivalry = null;
    }
  }

  if (wanted.has("league_records")) {
    try {
      const { getDb } = await import("./db");
      const { buildHallOfFamePayload } = await import("./hallOfFameService");
      const db = await getDb();
      if (db) {
        const hof = await buildHallOfFamePayload({
          db,
          leagueId,
          userId: args.userId ?? 0,
        });
        sources.careerRecords = hof.ownerRecords
          .filter((r) => r.gamesPlayed > 0)
          .map((r) => ({
            ownerKey: r.ownerKey,
            ownerName: r.displayName,
            wins: r.wins,
            losses: r.losses,
            ties: r.ties,
            games: r.gamesPlayed,
            winPct: r.gamesPlayed > 0 ? r.winPct / 100 : 0,
            seasonsActive: r.seasonsActive,
          }));
      }
    } catch {
      sources.careerRecords = null;
    }
  }

  if (wanted.has("matchup_margins")) {
    try {
      const { tryMatchupMarginToolAnswer } = await import("./matchupMarginTool");
      const hit = await tryMatchupMarginToolAnswer({
        leagueId,
        message: args.message,
        resolvedOwnerNames: args.owners
          .map((o) => o.displayName)
          .filter((n): n is string => Boolean(n?.trim())),
      });
      sources.margins = hit?.analytics ?? null;
      sources.marginsAnswer = hit?.answer ?? null;
    } catch {
      sources.margins = null;
    }
  }

  return sources;
}

export async function assembleAdvisorEvidencePackage(
  input: BuildAdvisorEvidenceInput & {
    leagueName?: string;
    provider?: string;
    userId?: number;
  },
): Promise<AdvisorEvidencePackage> {
  const sources = await loadAdvisorEvidenceSources({
    leagueId: input.leagueId,
    leagueName: input.leagueName,
    provider: input.provider,
    userId: input.userId,
    message: input.message,
    plan: input.plan,
    owners: input.owners,
  });
  return buildAdvisorEvidencePackage(input, sources);
}
