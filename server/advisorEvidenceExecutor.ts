/**
 * RFSN-052E — Evidence-first GM Advisor executor.
 *
 * Shared by advisor.chat and POST /api/advisor/stream:
 *   question → league → scope → owner identity → planner → evidence package
 *   → deterministic answer OR grounded LLM narrative OR current-season fallback.
 *
 * Does not invent facts. Does not expose internal module names in user text.
 */

import type { Message } from "./_core/llm";
import {
  findMentionedOwners,
  type AdvisorOwnerAlias,
} from "./advisorQuestionClassify";
import {
  isAdvisorH2HQuestion,
  planAdvisorEvidence,
  type AdvisorAuthorityId,
  type AdvisorEvidencePlan,
  type AdvisorPlannerIntent,
  type AdvisorResolvedOwner,
} from "./advisorEvidencePlanner";
import {
  resolveAdvisorQuestionScope,
  type AdvisorQuestionScope,
  type AdvisorScopePhase,
} from "./advisorScopeResolver";
import {
  assembleAdvisorEvidencePackage,
  type AdvisorEvidencePackage,
} from "./advisorEvidencePackage";
import {
  formatPartialLegacyUnavailable,
  isPartialLegacyUnsupportedAsk,
} from "./championshipAuthority";
import { formatMatchupMarginAnswer, type MatchupMarginAnalyticsResult } from "./matchupMarginAnalytics";
import { getChatHistory } from "./db";
import { buildAdvisorMessages } from "./advisorContextBuilder";
import {
  getAdvisorConversationContext,
  isAdvisorFollowUpPairAsk,
  setAdvisorConversationContext,
} from "./advisorConversationContext";
import { findNamedCareerRecord } from "./advisorCareerQualification";
import { resolveCurrentOwner } from "./currentOwnerService";
import {
  isMatchupGalleryFollowUpAsk,
  MATCHUP_GALLERY_TOOL_NAME,
  tryMatchupGalleryToolAnswer,
} from "./matchupGalleryTool";
import {
  HISTORICAL_NARRATION_TOOL_NAME,
  tryHistoricalNarrationToolAnswer,
} from "./historicalNarrationTool";
import type { AdvisorVisual } from "./advisorVisual";

export type AdvisorEvidenceTelemetry = {
  resolvedLeagueId: string;
  resolvedScope: {
    type: AdvisorQuestionScope["scopeType"];
    startSeason: number | null;
    endSeason: number | null;
    phase: AdvisorScopePhase;
  };
  intent: AdvisorPlannerIntent;
  authoritiesUsed: AdvisorAuthorityId[];
  deterministicShortCircuit: boolean;
  evidenceCoverage: {
    startSeason: number | null;
    endSeason: number | null;
    notes: string[];
  };
};

export type AdvisorEvidencePathResult =
  | {
      kind: "deterministic";
      message: string;
      tool?: string;
      visual?: AdvisorVisual;
      telemetry: AdvisorEvidenceTelemetry;
    }
  | {
      kind: "llm";
      messages: Message[];
      telemetry: AdvisorEvidenceTelemetry;
    };

export type AdvisorEvidenceExecutorInput = {
  message: string;
  leagueId: string;
  userId: number;
  season: number;
  ownerAliases?: AdvisorOwnerAlias[];
  currentSeason?: number;
  leagueName?: string;
  provider?: string;
  gmMemoryBlock?: string;
};

export type AdvisorEvidenceExecutorDeps = {
  assemblePackage?: typeof assembleAdvisorEvidencePackage;
  buildFallbackMessages?: typeof buildAdvisorMessages;
  getHistory?: typeof getChatHistory;
  getConversation?: typeof getAdvisorConversationContext;
  setConversation?: typeof setAdvisorConversationContext;
  tryGallery?: typeof tryMatchupGalleryToolAnswer;
  tryNarration?: typeof tryHistoricalNarrationToolAnswer;
  resolveViewerOwnerName?: (userId: number) => Promise<string | null>;
};

type MarginStats = {
  noData?: boolean;
  unsupported?: boolean;
  missingDataset?: string | null;
  formattedAnswer?: string | null;
  analytics?: MatchupMarginAnalyticsResult | null;
  seasonFrom?: number | null;
  seasonTo?: number | null;
};

export function coverageLabelForUser(
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  if (start != null && end != null && start === end) return String(start);
  if (start != null && end != null) return `${start}–${end}`;
  return "recorded coverage";
}

export function acrossCoveragePhrase(
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  if (start != null && end != null && start === end) {
    return `Across recorded ${start}`;
  }
  if (start != null && end != null) {
    return `Across recorded league history from ${start}–${end}`;
  }
  return "Across recorded league history";
}

export function acrossChampionshipHistoryPhrase(
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  if (start != null && end != null && start === end) {
    return `Across recorded championship history from ${start}`;
  }
  if (start != null && end != null) {
    return `Across recorded championship history from ${start}–${end}`;
  }
  return "Across recorded championship history";
}

function championshipSpan(pkg: AdvisorEvidencePackage): {
  start: number | null;
  end: number | null;
} {
  return {
    start: pkg.championships.coverageStartSeason ?? pkg.league.coverageStartSeason,
    end: pkg.championships.coverageEndSeason ?? pkg.league.coverageEndSeason,
  };
}

/** Specific missing-data sentence. Never generic “I don’t have that information.” */
export function missingDatasetSentence(dataset: string, coverage: string): string {
  return `This league does not have recorded ${dataset} for ${coverage}.`;
}

function fmtRecord(
  rec: { wins: number; losses: number; ties: number; games: number } | null,
): string {
  if (!rec || rec.games === 0) return "no recorded games";
  const g = rec.games === 1 ? "game" : "games";
  return `${rec.wins}–${rec.losses}–${rec.ties} (${rec.games} ${g})`;
}

function normOwner(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function acrossRecordedMeetings(start: number | null, end: number | null): string {
  if (start != null && end != null && start === end) {
    return `Across recorded meetings from ${start}`;
  }
  if (start != null && end != null) {
    return `Across recorded meetings from ${start}–${end}`;
  }
  return "Across recorded meetings";
}

function leadPhrase(
  nameA: string,
  nameB: string,
  rec: { wins: number; losses: number; ties: number; games: number } | null,
): string {
  if (!rec || rec.games === 0) return "no recorded games";
  const g = rec.games === 1 ? "game" : "games";
  const recStr = `${rec.wins}–${rec.losses}–${rec.ties} (${rec.games} ${g})`;
  if (rec.wins > rec.losses) return `${nameA} leads ${recStr}`;
  if (rec.losses > rec.wins) {
    return `${nameB} leads ${rec.losses}–${rec.wins}–${rec.ties} (${rec.games} ${g})`;
  }
  return `tied ${recStr}`;
}

function findTitleRow(
  pkg: AdvisorEvidencePackage,
  owner: { displayName: string; canonicalPersonId?: string | null },
) {
  const want = normOwner(owner.displayName);
  const wantKey = owner.canonicalPersonId ?? "";
  return (
    pkg.championships.medalTitles.find(
      (r) => r.key === wantKey || normOwner(r.name) === want,
    ) ?? null
  );
}

/** Deterministic H2H Authority answer. Never “all-time” unless caller verifies completeness. */
export function formatH2HAdvisorAnswer(pkg: AdvisorEvidencePackage): string {
  const coverage = coverageLabelForUser(
    pkg.league.coverageStartSeason,
    pkg.league.coverageEndSeason,
  );
  const a = pkg.h2h.displayA;
  const b = pkg.h2h.displayB;
  const named =
    a && b
      ? `${a} vs ${b}`
      : pkg.owners
          .map((o) => o.displayName)
          .filter(Boolean)
          .slice(0, 2)
          .join(" vs ");
  if (!a || !b || pkg.h2h.meetings === 0) {
    return missingDatasetSentence(
      named ? `head-to-head meetings for ${named}` : "head-to-head meetings",
      coverage,
    );
  }

  const meetStart = pkg.h2h.meetingStartSeason;
  const meetEnd = pkg.h2h.meetingEndSeason;
  const lines: string[] = [`${acrossRecordedMeetings(meetStart, meetEnd)}, ${a} vs ${b}:`];
  lines.push(`Regular season: ${leadPhrase(a, b, pkg.h2h.regularSeason)}.`);
  lines.push(`Playoffs: ${leadPhrase(a, b, pkg.h2h.playoffs)}.`);
  lines.push(`Meetings: ${pkg.h2h.meetings}.`);
  if (pkg.h2h.playoffs && pkg.h2h.playoffs.games > 0) {
    lines.push(
      `Playoff eliminations: ${a} has eliminated ${b} ${pkg.h2h.eliminationsByA} time${
        pkg.h2h.eliminationsByA === 1 ? "" : "s"
      }; ${b} has eliminated ${a} ${pkg.h2h.eliminationsByB} time${
        pkg.h2h.eliminationsByB === 1 ? "" : "s"
      }.`,
    );
  }
  if (pkg.h2h.recent5 && pkg.h2h.recent5.games > 0) {
    lines.push(`Recent regular-season (last ${Math.min(5, pkg.h2h.recent5.games)}): ${fmtRecord(pkg.h2h.recent5)}.`);
  }
  const streak = pkg.h2h.streak;
  if (streak && streak.type !== "none" && streak.count > 0) {
    const who = streak.type === "W" ? a : streak.type === "L" ? b : "Neither";
    const kind = streak.type === "T" ? "tie" : streak.type === "W" ? "win" : "loss";
    lines.push(
      `Current streak: ${who}, ${streak.count}-game ${kind} streak.`,
    );
  }
  if (pkg.h2h.closestGame) {
    const g = pkg.h2h.closestGame;
    lines.push(
      `Closest game: ${g.season} week ${g.week}${g.isPlayoff ? " (playoffs)" : ""}, ${g.scoreA}–${g.scoreB} (margin ${g.margin}).`,
    );
  }
  if (pkg.h2h.biggestBlowout) {
    const g = pkg.h2h.biggestBlowout;
    const winner = g.winner === "A" ? a : b;
    lines.push(
      `Biggest blowout: ${g.season} week ${g.week}${g.isPlayoff ? " (playoffs)" : ""}, ${g.scoreA}–${g.scoreB} (margin ${g.margin}, ${winner}).`,
    );
  }
  lines.push(`Not all-time. Recorded meeting coverage is ${coverageLabelForUser(meetStart, meetEnd)}.`);
  return lines.join("\n");
}

/** Championship Authority only — never an LLM ring estimate. */
export function formatOwnerChampionshipAnswer(pkg: AdvisorEvidencePackage): string {
  const span = championshipSpan(pkg);
  const coverage = coverageLabelForUser(span.start, span.end);
  const across = acrossChampionshipHistoryPhrase(span.start, span.end);
  if (!pkg.championships.latestCompletedSeason && pkg.championships.medalTitles.length === 0) {
    return missingDatasetSentence("championships", coverage);
  }
  const owner =
    pkg.owners.find((o) => o.status === "resolved") ?? pkg.owners[0] ?? null;
  if (!owner) {
    return missingDatasetSentence("championships", coverage);
  }
  const row = findTitleRow(pkg, owner);
  const titles = row?.titles ?? 0;
  const years = row?.seasons?.length
    ? ` (${[...row.seasons].sort((a, b) => a - b).join(", ")})`
    : "";
  let text = `${across}, ${owner.displayName} has ${titles} championship${titles === 1 ? "" : "s"}${years}.`;
  const fb = pkg.championships.fallbackInclusiveTitles.find(
    (r) =>
      r.key === (owner.canonicalPersonId ?? "") ||
      normOwner(r.name) === normOwner(owner.displayName),
  );
  if (fb && fb.titles !== titles) {
    text += ` Totals that include seasons inferred from final standings differ and are not merged: ${fb.titles}.`;
  }
  const q = (pkg.question ?? "").toLowerCase();
  if (/\brunner-?up\b|\bsecond place\b|\bthird place\b|\bpodium\b/.test(q)) {
    const podium = pkg.championships.podiumByKey.find(
      (p) =>
        p.key === (owner.canonicalPersonId ?? "") ||
        normOwner(p.name) === normOwner(owner.displayName),
    );
    if (podium) {
      const ru = podium.runnerUpSeasons.length
        ? ` runner-up in ${podium.runnerUpSeasons.join(", ")}`
        : "";
      const th = podium.thirdSeasons.length
        ? ` third place in ${podium.thirdSeasons.join(", ")}`
        : "";
      if (ru || th) text += ` Recorded podium:${ru}${ru && th ? ";" : ""}${th}.`;
    }
  }
  return text;
}

export function formatPodiumPlacementAnswer(pkg: AdvisorEvidencePackage): string {
  const span = championshipSpan(pkg);
  const coverage = coverageLabelForUser(span.start, span.end);
  const across = acrossChampionshipHistoryPhrase(span.start, span.end);
  const q = (pkg.question ?? "").toLowerCase();
  const wantRu = /\brunner-?ups?\b|\bsecond place\b|\b2nd place\b/.test(q);
  const wantThird =
    /\bthird place\b|\b3rd place\b/.test(q) ||
    (/\b(?:third|3rd)\b/.test(q) && (/\bwho\b/.test(q) || /\bfinished\b/.test(q)));
  const yearFromScope =
    pkg.scope.startSeason != null && pkg.scope.endSeason != null && pkg.scope.startSeason === pkg.scope.endSeason
      ? pkg.scope.startSeason
      : pkg.scope.startSeason ?? pkg.scope.endSeason ?? null;
  const yearFromText = (pkg.question ?? "").match(/\b(?:19|20)\d{2}\b/);
  const year = yearFromScope ?? (yearFromText ? Number(yearFromText[0]) : null);
  if (year == null || !Number.isFinite(year)) {
    return missingDatasetSentence("podium placements", coverage);
  }
  const ru = pkg.championships.podiumByKey.find((p) => p.runnerUpSeasons.includes(year));
  const third = pkg.championships.podiumByKey.find((p) => p.thirdSeasons.includes(year));
  const bits: string[] = [];
  if (wantRu) {
    bits.push(ru?.name ? `the ${year} runner-up is ${ru.name}` : `no recorded runner-up for ${year}`);
  }
  if (wantThird) {
    bits.push(third?.name ? `the ${year} third-place finisher is ${third.name}` : `no recorded third place for ${year}`);
  }
  if (!bits.length) {
    return missingDatasetSentence("podium placements", coverage);
  }
  return `${across}, ${bits.join("; ")}.`;
}

export function formatChampionshipCompareAnswer(pkg: AdvisorEvidencePackage): string {
  const span = championshipSpan(pkg);
  const coverage = coverageLabelForUser(span.start, span.end);
  const across = acrossChampionshipHistoryPhrase(span.start, span.end);
  if (pkg.championships.medalTitles.length === 0 && pkg.championships.fallbackInclusiveTitles.length === 0) {
    return missingDatasetSentence("championships", coverage);
  }
  const owners = pkg.owners.slice(0, 2);
  if (owners.length < 2) {
    return missingDatasetSentence("championships", coverage);
  }
  const rows = owners.map((o) => {
    const row = findTitleRow(pkg, o);
    return {
      name: o.displayName,
      titles: row?.titles ?? 0,
      seasons: row?.seasons ?? [],
    };
  });
  const bits = rows.map((r) => {
    const years = r.seasons.length ? ` (${[...r.seasons].sort((a, b) => a - b).join(", ")})` : "";
    return `${r.name} has ${r.titles} championship${r.titles === 1 ? "" : "s"}${years}`;
  });
  let verdict = `${bits[0]} and ${bits[1]}.`;
  if (rows[0]!.titles > rows[1]!.titles) verdict += ` ${rows[0]!.name} has more championships.`;
  else if (rows[1]!.titles > rows[0]!.titles) verdict += ` ${rows[1]!.name} has more championships.`;
  else verdict += " They are tied.";
  return `${across}, ${verdict}`;
}

function resolveOwnersFromMessage(
  message: string,
  scope: AdvisorQuestionScope,
  ownerAliases?: AdvisorOwnerAlias[],
): AdvisorResolvedOwner[] {
  if (ownerAliases?.length) {
    const mentioned = findMentionedOwners(message, ownerAliases);
    if (mentioned.length > 0) {
      return mentioned.map((o) => ({
        displayName: o.displayName,
        memberId: o.memberId,
      }));
    }
  }
  return scope.ownerNames.map((displayName) => ({ displayName }));
}

export function buildEvidenceTelemetry(opts: {
  leagueId: string;
  scope: AdvisorQuestionScope;
  plan: AdvisorEvidencePlan;
  pkg?: AdvisorEvidencePackage | null;
  deterministicShortCircuit: boolean;
}): AdvisorEvidenceTelemetry {
  return {
    resolvedLeagueId: opts.leagueId,
    resolvedScope: {
      type: opts.scope.scopeType,
      startSeason: opts.scope.startSeason,
      endSeason: opts.scope.endSeason,
      phase: opts.scope.phase,
    },
    intent: opts.plan.intent,
    authoritiesUsed: opts.deterministicShortCircuit || !opts.plan.fallbackToAdvisorContext
      ? [...opts.plan.authorities]
      : [],
    deterministicShortCircuit: opts.deterministicShortCircuit,
    evidenceCoverage: {
      startSeason: opts.pkg?.league.coverageStartSeason ?? null,
      endSeason: opts.pkg?.league.coverageEndSeason ?? null,
      notes: opts.pkg?.coverageNotes ?? [],
    },
  };
}

export function formatBestRivalryAnswer(pkg: AdvisorEvidencePackage): string {
  const coverage = coverageLabelForUser(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  const across = acrossCoveragePhrase(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  const top = pkg.rivalryRanking[0];
  if (!top) return missingDatasetSentence("rivalry scores", coverage);
  return (
    `${across}, the greatest recorded rivalry is ${top.focalName} vs ${top.rivalName} ` +
    `(score ${top.rivalryScore}, ${top.heatLabel}). ` +
    `Regular-season H2H ${top.h2hWins}–${top.h2hLosses}. ` +
    `Playoff eliminations: ${top.playoffEliminations}. Not all-time.`
  );
}

export function formatPlayoffEliminationsAnswer(
  pkg: AdvisorEvidencePackage,
  intent: "playoff_eliminations" | "playoff_villain",
): string {
  const coverage = coverageLabelForUser(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  const across = acrossCoveragePhrase(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  const top = pkg.eliminationLeaderboard[0];
  const scope = pkg.playoffScope;
  const proven = scope?.kind === "championship_bracket_eliminations";
  if (!top) {
    return missingDatasetSentence(
      proven ? "championship-bracket playoff eliminations" : "playoff wins",
      coverage,
    );
  }
  const villain = intent === "playoff_villain";
  const label = proven
    ? villain
      ? "biggest playoff villain (championship-bracket eliminations inflicted)"
      : "most championship-bracket playoff eliminations inflicted"
    : villain
      ? "biggest playoff villain by recorded playoff wins"
      : "most recorded playoff wins against opponents";
  const victim =
    top.topVictimName && (top.topVictimCount ?? 0) > 0
      ? ` Most often vs ${top.topVictimName} (${top.topVictimCount}).`
      : "";
  const rest =
    pkg.eliminationLeaderboard.length > 1
      ? ` Next: ${pkg.eliminationLeaderboard
          .slice(1, 4)
          .map((r) => `${r.ownerName} ${r.inflicted}`)
          .join(", ")}.`
      : "";
  const scopeBit = proven
    ? " Championship bracket only (consolation excluded)."
    : " Recorded playoff wins — consolation/placement weeks may be included; not proven eliminations.";
  const provenance = scope?.note ? ` ${scope.note}` : " Same H2H/Rivalry gmMatchups + Owner Identity source.";
  const partial = pkg.coverageNotes.find((n) => /partial history/i.test(n));
  const qualify = partial ? ` ${partial}` : "";
  return `${across}, ${top.ownerName} is the ${label}: ${top.inflicted} (playoffs only).${victim}${rest}${scopeBit}${provenance} Not all-time.${qualify}`;
}

function careerBarPhrase(pkg: AdvisorEvidencePackage): string {
  const q = pkg.careerQualification;
  if (!q) return "";
  return `among owners with at least ${q.minGames} regular-season games (league median) and ${q.minSeasons} season${q.minSeasons === 1 ? "" : "s"}`;
}

function namedCareerIfRequested(pkg: AdvisorEvidencePackage) {
  if (pkg.owners.length !== 1) return null;
  return findNamedCareerRecord(pkg.careerRecords, pkg.owners[0]!);
}

export function formatCareerWinPctAnswer(pkg: AdvisorEvidencePackage): string {
  const coverage = coverageLabelForUser(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  const across = acrossCoveragePhrase(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  if (!pkg.careerRecords.length) return missingDatasetSentence("career records", coverage);
  const named = namedCareerIfRequested(pkg);
  if (named) {
    const q = pkg.careerQualification;
    const below =
      q && !(named.games >= q.minGames && named.seasonsActive >= q.minSeasons)
        ? ` Below the career leaderboard bar of ${q.minGames} games / ${q.minSeasons} season(s).`
        : "";
    return (
      `${across}, ${named.ownerName}: ${(named.winPct * 100).toFixed(1)}% ` +
      `(${named.wins}–${named.losses}–${named.ties}, ${named.games} regular-season games, ${named.seasonsActive} season${named.seasonsActive === 1 ? "" : "s"}).${below} Not all-time.`
    );
  }
  const pool = pkg.careerQualification?.qualified?.length
    ? pkg.careerQualification.qualified
    : pkg.careerRecords;
  const top = [...pool].sort(
    (a, b) => b.winPct - a.winPct || b.wins - a.wins || a.ownerName.localeCompare(b.ownerName),
  )[0];
  if (!top) return missingDatasetSentence("career records", coverage);
  const bar = careerBarPhrase(pkg);
  return (
    `${across}, ${top.ownerName} has the best career winning percentage${bar ? ` ${bar}` : ""}: ` +
    `${(top.winPct * 100).toFixed(1)}% (${top.wins}–${top.losses}–${top.ties}, regular season). Not all-time.`
  );
}

export function formatWorstCareerRecordAnswer(pkg: AdvisorEvidencePackage): string {
  const coverage = coverageLabelForUser(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  const across = acrossCoveragePhrase(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  if (!pkg.careerRecords.length) return missingDatasetSentence("career records", coverage);
  const named = namedCareerIfRequested(pkg);
  if (named) return formatCareerWinPctAnswer(pkg);
  const pool = pkg.careerQualification?.qualified?.length
    ? pkg.careerQualification.qualified
    : pkg.careerRecords;
  const worst = [...pool].sort(
    (a, b) => a.winPct - b.winPct || b.losses - a.losses || a.ownerName.localeCompare(b.ownerName),
  )[0]!;
  const bar = careerBarPhrase(pkg);
  return (
    `${across}, ${worst.ownerName} has the worst career record${bar ? ` ${bar}` : ""}: ` +
    `${(worst.winPct * 100).toFixed(1)}% (${worst.wins}–${worst.losses}–${worst.ties}, regular season). Not all-time.`
  );
}

export function formatMostCareerWinsAnswer(pkg: AdvisorEvidencePackage): string {
  const coverage = coverageLabelForUser(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  const across = acrossCoveragePhrase(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  if (!pkg.careerRecords.length) return missingDatasetSentence("career records", coverage);
  const named = namedCareerIfRequested(pkg);
  if (named) return formatCareerWinPctAnswer(pkg);
  const pool = pkg.careerQualification?.qualified?.length
    ? pkg.careerQualification.qualified
    : pkg.careerRecords;
  const top = [...pool].sort(
    (a, b) => b.wins - a.wins || b.winPct - a.winPct || a.ownerName.localeCompare(b.ownerName),
  )[0]!;
  const bar = careerBarPhrase(pkg);
  return (
    `${across}, ${top.ownerName} has the most career wins${bar ? ` ${bar}` : ""}: ${top.wins} ` +
    `(${top.wins}–${top.losses}–${top.ties}, regular season). Not all-time.`
  );
}

export function formatMostCareerLossesAnswer(pkg: AdvisorEvidencePackage): string {
  const coverage = coverageLabelForUser(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  const across = acrossCoveragePhrase(pkg.league.coverageStartSeason, pkg.league.coverageEndSeason);
  if (!pkg.careerRecords.length) return missingDatasetSentence("career records", coverage);
  const named = namedCareerIfRequested(pkg);
  if (named) return formatCareerWinPctAnswer(pkg);
  const pool = pkg.careerQualification?.qualified?.length
    ? pkg.careerQualification.qualified
    : pkg.careerRecords;
  const top = [...pool].sort(
    (a, b) => b.losses - a.losses || a.winPct - b.winPct || a.ownerName.localeCompare(b.ownerName),
  )[0]!;
  const bar = careerBarPhrase(pkg);
  return (
    `${across}, ${top.ownerName} has the most career losses${bar ? ` ${bar}` : ""}: ${top.losses} ` +
    `(${top.wins}–${top.losses}–${top.ties}, regular season). Not all-time.`
  );
}

/**
 * Deterministic user-facing answer when a single authority fully answers.
 * Returns null when the LLM should narrate verified evidence instead.
 */
export function formatDeterministicAdvisorAnswer(
  pkg: AdvisorEvidencePackage,
): { message: string; tool?: string } | null {
  const { plan } = pkg;
  if (plan.fallbackToAdvisorContext) return null;
  if (!plan.deterministicFirst || plan.narrativeAllowed) return null;

  const covStart = pkg.league.coverageStartSeason;
  const covEnd = pkg.league.coverageEndSeason;
  const coverage = coverageLabelForUser(covStart, covEnd);
  const across = acrossCoveragePhrase(covStart, covEnd);
  const champSpan = championshipSpan(pkg);
  const champAcross = acrossChampionshipHistoryPhrase(champSpan.start, champSpan.end);
  const champCoverage = coverageLabelForUser(champSpan.start, champSpan.end);

  const partialHit = isPartialLegacyUnsupportedAsk(
    pkg.question ?? "",
    { startSeason: pkg.scope.startSeason, endSeason: pkg.scope.endSeason },
    pkg.championships.partialLegacySeasons,
  );
  if (partialHit != null) {
    return { message: formatPartialLegacyUnavailable(partialHit) };
  }

  if (plan.intent === "matchup_margins") {
    const stats = pkg.matchupStats as MarginStats;
    const marginCoverage = coverageLabelForUser(
      stats.seasonFrom ?? covStart,
      stats.seasonTo ?? covEnd,
    );
    if (stats.noData || stats.unsupported) {
      return {
        message: missingDatasetSentence("matchup margins", marginCoverage),
        tool: "query_matchup_margins",
      };
    }
    if (stats.formattedAnswer?.trim()) {
      return { message: stats.formattedAnswer.trim(), tool: "query_matchup_margins" };
    }
    if (stats.analytics) {
      return {
        message: formatMatchupMarginAnswer(stats.analytics),
        tool: "query_matchup_margins",
      };
    }
    const fact = pkg.facts.find((f) => f.id === "margin_leader")?.fact;
    if (fact) return { message: fact, tool: "query_matchup_margins" };
    return {
      message: missingDatasetSentence("matchup margins", marginCoverage),
      tool: "query_matchup_margins",
    };
  }

  if (plan.intent === "reigning_champion") {
    const name = pkg.championships.reigningName;
    const year =
      pkg.facts.find((f) => f.id === "reigning_champion")?.startSeason ??
      pkg.championships.latestCompletedSeason;
    if (!name) {
      return { message: missingDatasetSentence("championships", champCoverage) };
    }
    const yearBit = year != null ? ` (${year})` : "";
    return { message: `${champAcross}, the reigning champion is ${name}${yearBit}.` };
  }

  if (plan.intent === "championship_leaderboard") {
    const medal = pkg.championships.medalTitles;
    const fallback = pkg.championships.fallbackInclusiveTitles;
    if (medal.length === 0 && fallback.length === 0) {
      return { message: missingDatasetSentence("championships", champCoverage) };
    }
    const rows = medal.length > 0 ? medal : fallback;
    const inferredOnly = medal.length === 0;
    const lines = rows.map((r, i) => {
      const years = r.seasons.length ? ` (${[...r.seasons].sort((a, b) => a - b).join(", ")})` : "";
      return `${i + 1}. ${r.name} — ${r.titles}${years}`;
    });
    let text = inferredOnly
      ? `${champAcross}, championship totals inferred from final standings:\n${lines.join("\n")}`
      : `${champAcross}, championship totals:\n${lines.join("\n")}`;
    if (pkg.conflicts.some((c) => c.topic === "championship_title_counts") && fallback[0]) {
      const fb = fallback[0];
      text += `\n\nTotals that include seasons inferred from final standings differ and are not merged: ${fb.name} — ${fb.titles}.`;
    }
    return { message: text };
  }

  if (plan.intent === "h2h_pair") {
    return { message: formatH2HAdvisorAnswer(pkg) };
  }

  if (plan.intent === "owner_championships") {
    return { message: formatOwnerChampionshipAnswer(pkg) };
  }

  if (plan.intent === "podium_placement") {
    return { message: formatPodiumPlacementAnswer(pkg) };
  }

  if (plan.intent === "championship_compare") {
    return { message: formatChampionshipCompareAnswer(pkg) };
  }

  if (plan.intent === "best_rivalry") {
    return { message: formatBestRivalryAnswer(pkg) };
  }

  if (plan.intent === "playoff_eliminations" || plan.intent === "playoff_villain") {
    return { message: formatPlayoffEliminationsAnswer(pkg, plan.intent) };
  }

  if (plan.intent === "career_win_pct") {
    return { message: formatCareerWinPctAnswer(pkg) };
  }

  if (plan.intent === "worst_career_record") {
    return { message: formatWorstCareerRecordAnswer(pkg) };
  }

  if (plan.intent === "career_most_wins") {
    return { message: formatMostCareerWinsAnswer(pkg) };
  }

  if (plan.intent === "career_most_losses") {
    return { message: formatMostCareerLossesAnswer(pkg) };
  }

  if (plan.intent === "draft_intelligence") {
    const stats = pkg.draftStats as {
      formattedAnswer?: string | null;
      noDraftBoard?: boolean;
    };
    const draftCoverage = coverageLabelForUser(covStart, covEnd);
    if (stats.formattedAnswer?.trim()) {
      return {
        message: stats.formattedAnswer.trim(),
        tool: "query_draft_intelligence",
      };
    }
    return {
      message: missingDatasetSentence("draft history", draftCoverage),
      tool: "query_draft_intelligence",
    };
  }

  return null;
}

/** Grounded narrative prompt. Numbers come only from the evidence package. */
export function buildGroundedEvidenceSystemPrompt(pkg: AdvisorEvidencePackage): string {
  const league = pkg.league.leagueName?.trim() || "this league";
  const across = acrossCoveragePhrase(
    pkg.league.coverageStartSeason,
    pkg.league.coverageEndSeason,
  );
  const factLines =
    pkg.facts.length > 0
      ? pkg.facts.map((f) => `- ${f.fact}`).join("\n")
      : "- (none recorded)";
  const rankingBlocks = pkg.rankings
    .map((r) => {
      const rows = r.rows.map((row) => `  ${row.rank}. ${row.name}: ${row.value}`).join("\n");
      return `${r.label}:\n${rows}`;
    })
    .join("\n\n");
  const h2h =
    pkg.h2h.displayA && pkg.h2h.displayB
      ? [
          `${pkg.h2h.displayA} vs ${pkg.h2h.displayB}`,
          `  Regular season: ${fmtRecord(pkg.h2h.regularSeason)}`,
          `  Playoffs: ${fmtRecord(pkg.h2h.playoffs)}`,
          pkg.h2h.lastMeeting
            ? `  Last meeting: ${pkg.h2h.lastMeeting.season} week ${pkg.h2h.lastMeeting.week}${
                pkg.h2h.lastMeeting.isPlayoff ? " (playoffs)" : ""
              }`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  const timeline =
    pkg.timelineFacts.length > 0
      ? pkg.timelineFacts.map((f) => `- ${f.fact}`).join("\n")
      : "";
  const conflicts =
    pkg.conflicts.length > 0
      ? pkg.conflicts
          .map((c) => `- ${c.note}\n  A: ${c.left.fact}\n  B: ${c.right.fact}`)
          .join("\n")
      : "";
  const coverageNotes =
    pkg.coverageNotes.length > 0 ? pkg.coverageNotes.join("\n") : "None.";
  const ownerLines =
    pkg.owners.length > 0
      ? pkg.owners
          .map((o) =>
            o.status === "resolved"
              ? `- ${o.displayName}`
              : `- ${o.displayName} (not resolved to a recorded owner)`,
          )
          .join("\n")
      : "";

  return `You are the War Room AI — a sharp, direct GM advisor for ${league}.
${across}.

Answer using ONLY the verified evidence below.
You may narrate and explain tone, but you must not invent statistics that are absent from the evidence.
You must not change records, counts, rankings, years, championship totals, playoff totals, or head-to-head totals.
If two evidence lines disagree, present both and say they are not merged.
Do not use filler such as "they likely had some close games", "it's clear every team has faced nail-biters", or "I don't have that information" when evidence exists.
If a requested dataset is genuinely missing, say exactly: "This league does not have recorded [dataset] for [coverage]."
When coverage matters, state it in plain language (for example "${across}…").
Never mention internal system, module, or implementation names.

## Verified evidence
${factLines}
${ownerLines ? `\n## Owners\n${ownerLines}` : ""}
${rankingBlocks ? `\n## Rankings\n${rankingBlocks}` : ""}
${h2h ? `\n## Head-to-head\n${h2h}` : ""}
${timeline ? `\n## Timeline\n${timeline}` : ""}
${conflicts ? `\n## Unmerged disagreements\n${conflicts}` : ""}

## Coverage notes
${coverageNotes}
`;
}

function historyWithoutDuplicateUser(
  history: Array<{ role: string; content: string }>,
  userMessage: string,
): Message[] {
  const slice = history.slice(-20);
  const last = slice[slice.length - 1];
  const prior =
    last?.role === "user" && last.content === userMessage ? slice.slice(0, -1) : slice;
  return prior.map((h) => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));
}

/**
 * Run the evidence-first Advisor path. Pure-ish when deps are injected.
 */
export async function runAdvisorEvidencePath(
  input: AdvisorEvidenceExecutorInput,
  deps: AdvisorEvidenceExecutorDeps = {},
): Promise<AdvisorEvidencePathResult> {
  const assemble = deps.assemblePackage ?? assembleAdvisorEvidencePackage;
  const buildFallback = deps.buildFallbackMessages ?? buildAdvisorMessages;
  const getHistory = deps.getHistory ?? getChatHistory;
  const getConvo = deps.getConversation ?? getAdvisorConversationContext;
  const setConvo = deps.setConversation ?? setAdvisorConversationContext;

  const currentSeason = input.currentSeason ?? input.season;
  const scope = resolveAdvisorQuestionScope(input.message, {
    ownerAliases: input.ownerAliases,
    currentSeason,
  });
  let owners = resolveOwnersFromMessage(input.message, scope, input.ownerAliases);
  const convo = getConvo(input.userId, input.leagueId);
  const followUp = isAdvisorFollowUpPairAsk(input.message);
  if (
    followUp &&
    convo &&
    convo.lastLeagueId === String(input.leagueId) &&
    convo.lastResolvedOwners.length >= 2 &&
    owners.length < 2
  ) {
    owners = convo.lastResolvedOwners.map((o) => ({ ...o }));
  } else if (
    owners.length < 2 &&
    input.ownerAliases?.length &&
    isAdvisorH2HQuestion(input.message.toLowerCase(), owners.length)
  ) {
    const history = await getHistory(input.userId, input.season, input.leagueId);
    const merged = [...owners];
    const seen = new Set(merged.map((o) => o.displayName.toLowerCase()));
    for (const h of [...history].reverse()) {
      for (const hit of findMentionedOwners(h.content, input.ownerAliases)) {
        const key = hit.displayName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({ displayName: hit.displayName, memberId: hit.memberId });
        if (merged.length >= 2) break;
      }
      if (merged.length >= 2) break;
    }
    owners = merged;
  }
  let plan = planAdvisorEvidence({
    message: input.message,
    leagueId: input.leagueId,
    scope,
    owners,
  });
  const galleryFollowUp =
    convo?.lastIntent === "matchup_gallery" &&
    Boolean(convo.lastGalleryFilter) &&
    isMatchupGalleryFollowUpAsk(input.message);
  if (galleryFollowUp) {
    plan = {
      intent: "matchup_gallery",
      authorities: ["owner_identity", "matchup_history"],
      deterministicFirst: true,
      narrativeAllowed: false,
      requiredEvidence: ["gallery_query"],
      fallbackToAdvisorContext: false,
    };
  }

  if (plan.intent === "historical_narration") {
    const resolveOwner =
      deps.resolveViewerOwnerName ??
      (async (userId: number) => {
        try {
          const cur = await resolveCurrentOwner({ id: userId });
          return cur.displayName?.trim() || cur.franchiseName?.trim() || null;
        } catch {
          return null;
        }
      });
    const currentOwnerName = await resolveOwner(input.userId);
    const tryNarration = deps.tryNarration ?? tryHistoricalNarrationToolAnswer;
    const hit = await tryNarration({
      leagueId: input.leagueId,
      message: input.message,
      currentOwnerName,
      leagueName: input.leagueName,
      ownerAliases: input.ownerAliases,
      priorFilter: convo?.lastGalleryFilter ?? undefined,
    });
    setConvo(input.userId, input.leagueId, {
      lastResolvedOwners:
        owners.length >= 1 ? owners : (convo?.lastResolvedOwners ?? []),
      lastIntent: plan.intent,
      lastScope: scope,
      lastLeagueId: String(input.leagueId),
      lastGalleryFilter: hit?.galleryFilter ?? convo?.lastGalleryFilter ?? null,
      lastGalleryPreset: convo?.lastGalleryPreset ?? null,
    });
    return {
      kind: "deterministic",
      message: hit?.answer ?? "Unable to generate narration.",
      tool: hit?.toolName ?? HISTORICAL_NARRATION_TOOL_NAME,
      visual: hit?.visual,
      telemetry: buildEvidenceTelemetry({
        leagueId: input.leagueId,
        scope,
        plan,
        pkg: null,
        deterministicShortCircuit: true,
      }),
    };
  }

  if (plan.intent === "matchup_gallery") {
    const resolveOwner =
      deps.resolveViewerOwnerName ??
      (async (userId: number) => {
        try {
          const cur = await resolveCurrentOwner({ id: userId });
          return cur.displayName?.trim() || cur.franchiseName?.trim() || null;
        } catch {
          return null;
        }
      });
    const currentOwnerName = await resolveOwner(input.userId);
    const tryGallery = deps.tryGallery ?? tryMatchupGalleryToolAnswer;
    const hit = await tryGallery({
      leagueId: input.leagueId,
      message: input.message,
      currentOwnerName,
      resolvedOwnerNames: owners.map((o) => o.displayName).filter((n): n is string => Boolean(n?.trim())),
      ownerAliases: input.ownerAliases,
      priorFilter: convo?.lastIntent === "matchup_gallery" ? convo.lastGalleryFilter : undefined,
      priorPreset: convo?.lastIntent === "matchup_gallery" ? convo.lastGalleryPreset : undefined,
      lastIntent: convo?.lastIntent ?? null,
    });
    setConvo(input.userId, input.leagueId, {
      lastResolvedOwners:
        owners.length >= 1 ? owners : (convo?.lastResolvedOwners ?? []),
      lastIntent: plan.intent,
      lastScope: scope,
      lastLeagueId: String(input.leagueId),
      lastGalleryFilter: hit?.query ?? null,
      lastGalleryPreset: hit?.preset ?? null,
    });
    return {
      kind: "deterministic",
      message: hit?.answer ?? "No recorded games match these filters.",
      tool: hit?.toolName ?? MATCHUP_GALLERY_TOOL_NAME,
      visual: hit?.visual,
      telemetry: buildEvidenceTelemetry({
        leagueId: input.leagueId,
        scope,
        plan,
        pkg: null,
        deterministicShortCircuit: true,
      }),
    };
  }

  const persistConversation = () => {
    setConvo(input.userId, input.leagueId, {
      lastResolvedOwners:
        owners.length >= 1 ? owners : (convo?.lastResolvedOwners ?? []),
      lastIntent: plan.intent,
      lastScope: scope,
      lastLeagueId: String(input.leagueId),
      lastGalleryFilter: null,
      lastGalleryPreset: null,
    });
  };

  const skipHistoricalPackage = plan.intent === "advisor_fallback";

  if (skipHistoricalPackage) {
    persistConversation();
    const messages = await buildFallback({
      userId: input.userId,
      season: input.season,
      userMessage: input.message,
      gmMemoryBlock: input.gmMemoryBlock,
      leagueId: input.leagueId,
    });
    return {
      kind: "llm",
      messages,
      telemetry: buildEvidenceTelemetry({
        leagueId: input.leagueId,
        scope,
        plan,
        pkg: null,
        deterministicShortCircuit: false,
      }),
    };
  }

  const pkg = await assemble({
    message: input.message,
    leagueId: input.leagueId,
    scope,
    owners,
    plan,
    leagueName: input.leagueName,
    provider: input.provider,
    userId: input.userId,
  });

  const deterministic = formatDeterministicAdvisorAnswer(pkg);
  persistConversation();
  if (deterministic) {
    return {
      kind: "deterministic",
      message: deterministic.message,
      tool: deterministic.tool,
      telemetry: buildEvidenceTelemetry({
        leagueId: input.leagueId,
        scope,
        plan,
        pkg,
        deterministicShortCircuit: true,
      }),
    };
  }

  const history = await getHistory(input.userId, input.season, input.leagueId);
  const messages: Message[] = [
    { role: "system", content: buildGroundedEvidenceSystemPrompt(pkg) },
    ...historyWithoutDuplicateUser(history, input.message),
    { role: "user", content: input.message },
  ];
  return {
    kind: "llm",
    messages,
    telemetry: buildEvidenceTelemetry({
      leagueId: input.leagueId,
      scope,
      plan,
      pkg,
      deterministicShortCircuit: false,
    }),
  };
}
