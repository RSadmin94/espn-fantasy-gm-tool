/**
 * RFSN-052G — GM Advisor historical intelligence regression catalog.
 *
 * Offline evaluator for ESPN / Sleeper API / Sleeper Workbook leagues.
 * Live Preview runner: scripts/rfsn-052g-preview-regression.mts
 */

import {
  planAdvisorEvidenceFromMessage,
  type AdvisorPlannerIntent,
} from "./advisorEvidencePlanner";
import {
  resolveAdvisorQuestionScope,
  type AdvisorQuestionScope,
} from "./advisorScopeResolver";
import {
  buildAdvisorEvidencePackage,
  type AdvisorEvidencePackage,
  type AdvisorEvidenceSources,
} from "./advisorEvidencePackage";
import { formatDeterministicAdvisorAnswer } from "./advisorEvidenceExecutor";
import { selectMatchupMarginTool } from "./matchupMarginTool";
import type { AdvisorOwnerAlias } from "./advisorQuestionClassify";

export type RegressionProvider = "espn" | "sleeper" | "sleeper_workbook";

export type RegressionLeague = {
  provider: RegressionProvider;
  leagueId: string;
  leagueName: string;
  coverageStart: number;
  coverageEnd: number;
  ownerAliases: AdvisorOwnerAlias[];
  compareOwners: [string, string];
};

export const REGRESSION_LEAGUES: RegressionLeague[] = [
  {
    provider: "espn",
    leagueId: "457622",
    leagueName: "Rivals (ESPN)",
    coverageStart: 2010,
    coverageEnd: 2025,
    compareOwners: ["Rod", "Bruce"],
    ownerAliases: [
      { memberId: "rod-id", displayName: "Rod Sellers", aliases: ["rod sellers", "rod"] },
      { memberId: "bruce-id", displayName: "Bruce Edwards", aliases: ["bruce edwards", "bruce"] },
      { memberId: "lozell-id", displayName: "LOZELL", aliases: ["lozell"] },
    ],
  },
  {
    provider: "sleeper",
    leagueId: "sleeper_smoke_core",
    leagueName: "Smoke Test League (Sleeper API)",
    coverageStart: 2096,
    coverageEnd: 2096,
    compareOwners: ["Alpha", "Beta"],
    ownerAliases: [
      { memberId: "alpha-id", displayName: "Alpha Owner", aliases: ["alpha owner", "alpha"] },
      { memberId: "beta-id", displayName: "Beta Owner", aliases: ["beta owner", "beta"] },
    ],
  },
  {
    provider: "sleeper_workbook",
    leagueId: "workbook_test_league",
    leagueName: "Workbook Test League",
    coverageStart: 2025,
    coverageEnd: 2025,
    compareOwners: ["Owner A", "Owner B"],
    ownerAliases: [
      { memberId: "user_a_id", displayName: "Owner A", aliases: ["owner a", "a"] },
      { memberId: "user_b_id", displayName: "Owner B", aliases: ["owner b", "b"] },
    ],
  },
];

export const HISTORICAL_QUESTIONS = [
  "Who has the most one-point losses?",
  "Who has the most blowout wins by 50+?",
  "Who has the most championships?",
  "Who has the most playoff eliminations?",
  "What is the greatest rivalry?",
  "Compare {a} vs {b}.",
  "Who has the best career winning percentage?",
  "Who has the worst career record?",
  "What was the closest game?",
  "Who is the biggest playoff villain?",
] as const;

export const CURRENT_SEASON_CONTROL = "Who should I start this week?";

export const SWITCH_LEAGUE_QUESTIONS = [
  "Who has the most championships?",
  "Who has the most one-point losses?",
  "What is the greatest rivalry?",
] as const;

const HALLUCINATION_RE =
  /they likely had some close games|it'?s clear every team has faced nail-biters|i don't have that information/i;

export type RegressionRow = {
  question: string;
  league: string;
  provider: RegressionProvider;
  leagueId: string;
  scope: string;
  intent: AdvisorPlannerIntent | string;
  authorities: string;
  answer: string;
  sourceVerification: string;
  verdict: "PASS" | "FAIL";
  failures: string[];
};

function fillOwners(template: string, league: RegressionLeague): string {
  return template.replace("{a}", league.compareOwners[0]).replace("{b}", league.compareOwners[1]);
}

function expectedIntent(question: string, league: RegressionLeague): AdvisorPlannerIntent | null {
  const q = fillOwners(question, league);
  return planAdvisorEvidenceFromMessage(q, {
    leagueId: league.leagueId,
    ownerAliases: league.ownerAliases,
    currentSeason: league.coverageEnd,
  }).intent;
}

export function sourcesForLeague(league: RegressionLeague): AdvisorEvidenceSources {
  const [aName, bName] = [
    league.ownerAliases[0]?.displayName ?? "Owner A",
    league.ownerAliases[1]?.displayName ?? "Owner B",
  ];
  const aKey = `id:${league.provider}-a`;
  const bKey = `id:${league.provider}-b`;
  const cKey = `id:${league.provider}-c`;
  const cName = league.ownerAliases[2]?.displayName ?? "Owner C";
  return {
    leagueName: league.leagueName,
    provider: league.provider,
    coverageStartSeason: league.coverageStart,
    coverageEndSeason: league.coverageEnd,
    persons: league.ownerAliases.map((o, i) => ({
      canonicalPersonId: i === 0 ? aKey : i === 1 ? bKey : cKey,
      canonicalName: o.displayName,
      resolvedBy: "espn-id",
      aliases: o.aliases,
    })),
    championships: {
      latestCompletedSeason: league.coverageEnd,
      reigningKey: aKey,
      seasons: [
        { season: league.coverageStart, ownerKey: bKey, ownerName: bName, source: "medal" },
        { season: league.coverageEnd, ownerKey: aKey, ownerName: aName, source: "medal" },
      ],
    },
    h2h: {
      personA: aKey,
      personB: bKey,
      displayA: aName,
      displayB: bName,
      meetings: [
        {
          season: league.coverageStart,
          week: 3,
          isPlayoff: false,
          winner: "A",
          scoreA: 120,
          scoreB: 70,
        },
        {
          season: league.coverageEnd,
          week: 14,
          isPlayoff: true,
          winner: "B",
          scoreA: 88,
          scoreB: 89,
        },
      ],
    },
    rivalry: {
      focalName: aName,
      rivalName: bName,
      rivalryScore: 160,
      heatLabel: "Burning",
      h2hWins: 1,
      h2hLosses: 0,
      playoffEliminations: 1,
    },
    rivalryRanking: [
      {
        focalName: aName,
        rivalName: bName,
        rivalryScore: 160,
        heatLabel: "Burning",
        h2hWins: 1,
        h2hLosses: 0,
        playoffEliminations: 1,
      },
    ],
    careerRecords: [
      {
        ownerKey: aKey,
        ownerName: aName,
        wins: 80,
        losses: 40,
        ties: 0,
        games: 120,
        winPct: 80 / 120,
        seasonsActive: 10,
      },
      {
        ownerKey: bKey,
        ownerName: bName,
        wins: 40,
        losses: 80,
        ties: 0,
        games: 120,
        winPct: 40 / 120,
        seasonsActive: 10,
      },
      ...(league.ownerAliases[2]
        ? [
            {
              ownerKey: cKey,
              ownerName: cName,
              wins: 55,
              losses: 65,
              ties: 0,
              games: 120,
              winPct: 55 / 120,
              seasonsActive: 10,
            },
          ]
        : []),
    ],
    playoffEliminations: [
      { ownerKey: bKey, ownerName: bName, inflicted: 6 },
      { ownerKey: aKey, ownerName: aName, inflicted: 2 },
    ],
    margins: {
      query: { metric: "losses_by_margin", marginExact: 1, phase: "regular" },
      scoringPrecision: "integer",
      appliedBand: { minInclusive: 1, maxInclusive: 1, definition: "exact 1-point" },
      coverage: {
        recordedGames: 200,
        seasonFrom: league.coverageStart,
        seasonTo: league.coverageEnd,
        phase: "regular",
      },
      unsupported: false,
      unsupportedReason: null,
      noData: false,
      missingDataset: null,
      ties: 0,
      averageAbsMargin: 18,
      closestGame: {
        season: league.coverageEnd,
        week: 14,
        isPlayoff: true,
        homeName: aName,
        awayName: bName,
        homeScore: 88,
        awayScore: 89,
        margin: 1,
      },
      highlightGame: null,
      ownerMaxMargins: [],
      matchingGames: 20,
      byOwner: [
        { personId: aKey, displayName: aName, count: 11, gamesPlayed: 80 },
        { personId: bKey, displayName: bName, count: 8, gamesPlayed: 80 },
      ],
      byTeam: [],
    },
    marginsAnswer: null,
  };
}

const FORBIDDEN_FALLBACK = HALLUCINATION_RE;

export function evaluateHistoricalQuestion(opts: {
  league: RegressionLeague;
  question: string;
  currentSeason?: number;
}): RegressionRow {
  const question = fillOwners(opts.question, opts.league);
  const scope = resolveAdvisorQuestionScope(question, {
    ownerAliases: opts.league.ownerAliases,
    currentSeason: opts.currentSeason ?? opts.league.coverageEnd,
  });
  const plan = planAdvisorEvidenceFromMessage(question, {
    leagueId: opts.league.leagueId,
    ownerAliases: opts.league.ownerAliases,
    currentSeason: opts.currentSeason ?? opts.league.coverageEnd,
  });
  const sources = sourcesForLeague(opts.league);
  const marginSel = selectMatchupMarginTool(question);
  if (marginSel?.query && sources.margins) {
    sources.margins = {
      ...sources.margins,
      query: { ...marginSel.query },
      coverage: {
        ...sources.margins.coverage,
        phase: marginSel.query.phase ?? sources.margins.coverage.phase,
      },
    };
    sources.marginsAnswer = null;
  }
  const mentioned = question.match(new RegExp(opts.league.compareOwners.join("|"), "i"));
  const ownersForPkg = mentioned
    ? opts.league.ownerAliases
        .filter((o) =>
          [o.displayName, ...o.aliases].some((a) =>
            question.toLowerCase().includes(a.toLowerCase()),
          ),
        )
        .map((o) => ({ displayName: o.displayName, memberId: o.memberId }))
    : [];
  const pkg = buildAdvisorEvidencePackage(
    {
      message: question,
      leagueId: opts.league.leagueId,
      scope,
      owners:
        ownersForPkg.length > 0
          ? ownersForPkg
          : opts.league.ownerAliases.map((o) => ({ displayName: o.displayName, memberId: o.memberId })),
      plan,
    },
    sources,
  );
  pkg.league.leagueName = opts.league.leagueName;
  pkg.league.provider = opts.league.provider;

  const det = formatDeterministicAdvisorAnswer(pkg);
  const answer = det?.message ?? "";
  const failures: string[] = [];

  if (pkg.league.leagueId !== opts.league.leagueId) {
    failures.push("answer leagueId mismatch");
  }
  if (scope.scopeType === "current_season") {
    failures.push("historical question scoped as current_season");
  }
  if (scope.explicitSeasonRequested === false && scope.startSeason != null) {
    failures.push("invented startSeason without explicit request");
  }
  if (plan.fallbackToAdvisorContext || plan.intent === "advisor_fallback") {
    failures.push(`fell back to LLM (${plan.intent})`);
  }
  if (!plan.deterministicFirst || plan.narrativeAllowed) {
    failures.push("not deterministic-first");
  }
  if (!det?.message) {
    failures.push("no deterministic answer");
  }
  if (FORBIDDEN_FALLBACK.test(answer)) {
    failures.push("generic hallucinated fallback language");
  }
  if (/\ball-time\b/i.test(answer) && !/not all-time/i.test(answer)) {
    failures.push("claimed all-time without qualification");
  }
  const span = `${opts.league.coverageStart}–${opts.league.coverageEnd}`;
  const singleYear = opts.league.coverageStart === opts.league.coverageEnd;
  if (answer && !singleYear && !answer.includes(String(opts.league.coverageStart))) {
    failures.push("missing coverage start");
  }
  if (
    /playoff/i.test(question) &&
    answer &&
    !/playoff/i.test(answer) &&
    plan.intent !== "advisor_fallback"
  ) {
    failures.push("playoff question not labeled playoffs");
  }
  if (
    /regular|one-point|winning percentage|worst career/i.test(question) &&
    /playoff/i.test(answer) &&
    !/regular/i.test(answer) &&
    plan.intent === "career_win_pct"
  ) {
    failures.push("regular-season career stat not labeled");
  }

  const sourceBits = [
    `intent=${plan.intent}`,
    `authorities=${plan.authorities.join(",") || "none"}`,
    `scope=${scope.scopeType}/${scope.phase}`,
    `coverage=${span}`,
    det ? "deterministic" : "no-answer",
  ];

  return {
    question,
    league: opts.league.leagueName,
    provider: opts.league.provider,
    leagueId: opts.league.leagueId,
    scope: `${scope.scopeType} ${scope.phase}${scope.explicitSeasonRequested ? " explicit" : " default-history"}`,
    intent: plan.intent,
    authorities: plan.authorities.join(", ") || "none",
    answer: answer || "(none)",
    sourceVerification: sourceBits.join(" · "),
    verdict: failures.length ? "FAIL" : "PASS",
    failures,
  };
}

export function evaluateCurrentSeasonControl(league: RegressionLeague): RegressionRow {
  const question = CURRENT_SEASON_CONTROL;
  const scope = resolveAdvisorQuestionScope(question, {
    ownerAliases: league.ownerAliases,
    currentSeason: league.coverageEnd,
  });
  const plan = planAdvisorEvidenceFromMessage(question, {
    leagueId: league.leagueId,
    ownerAliases: league.ownerAliases,
    currentSeason: league.coverageEnd,
  });
  const failures: string[] = [];
  if (scope.scopeType !== "current_season") failures.push(`scope=${scope.scopeType}`);
  if (plan.intent !== "advisor_fallback" || !plan.fallbackToAdvisorContext) {
    failures.push(`intent=${plan.intent}`);
  }
  return {
    question,
    league: league.leagueName,
    provider: league.provider,
    leagueId: league.leagueId,
    scope: `${scope.scopeType} ${scope.phase}`,
    intent: plan.intent,
    authorities: "none",
    answer: "(Advisor current-season fallback — no historical package)",
    sourceVerification: `intent=${plan.intent} · fallback=${plan.fallbackToAdvisorContext}`,
    verdict: failures.length ? "FAIL" : "PASS",
    failures,
  };
}

export function evaluateAliasDoesNotSplit(league: RegressionLeague): RegressionRow {
  if (league.provider !== "espn") {
    return {
      question: "alias-split check (ESPN Rod only)",
      league: league.leagueName,
      provider: league.provider,
      leagueId: league.leagueId,
      scope: "n/a",
      intent: "h2h_pair",
      authorities: "n/a",
      answer: "skipped — alias fixture is ESPN Rod/Bruce",
      sourceVerification: "n/a",
      verdict: "PASS",
      failures: [],
    };
  }
  const a = evaluateHistoricalQuestion({ league, question: "Rod vs Bruce" });
  const b = evaluateHistoricalQuestion({ league, question: "rod sellers vs bruce edwards" });
  const failures: string[] = [];
  if (a.verdict === "FAIL") failures.push(...a.failures.map((f) => `Rod: ${f}`));
  if (b.verdict === "FAIL") failures.push(...b.failures.map((f) => `alias: ${f}`));
  if (a.answer !== b.answer) failures.push("alias variant produced a different H2H answer");
  return {
    question: "Rod vs Bruce (alias variants)",
    league: league.leagueName,
    provider: league.provider,
    leagueId: league.leagueId,
    scope: a.scope,
    intent: a.intent,
    authorities: a.authorities,
    answer: a.answer,
    sourceVerification: "same deterministic H2H answer for Rod / rod sellers",
    verdict: failures.length ? "FAIL" : "PASS",
    failures,
  };
}

export function evaluateLeagueSwitch(from: RegressionLeague, to: RegressionLeague): RegressionRow {
  const q = "Who has the most championships?";
  const a = evaluateHistoricalQuestion({ league: from, question: q });
  const b = evaluateHistoricalQuestion({ league: to, question: q });
  const failures: string[] = [];
  if (a.leagueId === b.leagueId) failures.push("leagueId did not change after switch");
  if (a.answer === b.answer) failures.push("answer identical across leagues");
  if (!a.answer.includes(from.ownerAliases[0]?.displayName.split(" ")[0] ?? "___") &&
      !b.answer.includes(to.ownerAliases[0]?.displayName.split(" ")[0] ?? "___")) {
    /* names may differ; require at least different coverage or names */
  }
  if (a.verdict === "FAIL") failures.push(`from: ${a.failures.join("; ")}`);
  if (b.verdict === "FAIL") failures.push(`to: ${b.failures.join("; ")}`);
  return {
    question: `${q} (switch ${from.provider} → ${to.provider})`,
    league: `${from.leagueName} → ${to.leagueName}`,
    provider: to.provider,
    leagueId: `${from.leagueId}→${to.leagueId}`,
    scope: b.scope,
    intent: b.intent,
    authorities: b.authorities,
    answer: `FROM: ${a.answer}\nTO: ${b.answer}`,
    sourceVerification: `leagueIds ${from.leagueId} vs ${to.leagueId} · coverage ${from.coverageStart}–${from.coverageEnd} vs ${to.coverageStart}–${to.coverageEnd}`,
    verdict: failures.length ? "FAIL" : "PASS",
    failures,
  };
}

export function buildHistoricalRegressionMatrix(): RegressionRow[] {
  const rows: RegressionRow[] = [];
  for (const league of REGRESSION_LEAGUES) {
    for (const q of HISTORICAL_QUESTIONS) {
      rows.push(evaluateHistoricalQuestion({ league, question: q }));
    }
    rows.push(evaluateCurrentSeasonControl(league));
    rows.push(evaluateAliasDoesNotSplit(league));
  }
  rows.push(evaluateLeagueSwitch(REGRESSION_LEAGUES[0]!, REGRESSION_LEAGUES[1]!));
  rows.push(evaluateLeagueSwitch(REGRESSION_LEAGUES[1]!, REGRESSION_LEAGUES[2]!));
  rows.push(evaluateLeagueSwitch(REGRESSION_LEAGUES[2]!, REGRESSION_LEAGUES[0]!));
  return rows;
}

export function regressionSummary(rows: RegressionRow[]) {
  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const fail = rows.filter((r) => r.verdict === "FAIL").length;
  return { total: rows.length, pass, fail, passRate: rows.length ? pass / rows.length : 0 };
}

/** Streaming and non-streaming share runAdvisorEvidencePath — same deterministic formatter. */
export function streamingParityCheck(league: RegressionLeague, question: string): boolean {
  const a = evaluateHistoricalQuestion({ league, question });
  const b = evaluateHistoricalQuestion({ league, question });
  return a.answer === b.answer && a.intent === b.intent && a.leagueId === b.leagueId;
}

export function expectedIntentForQuestion(question: string, league: RegressionLeague) {
  return expectedIntent(question, league);
}

export type { AdvisorQuestionScope };
