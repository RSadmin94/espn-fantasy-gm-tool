/**
 * RFSN-052C — League Intelligence Planner (evidence-planning layer).
 *
 * Deterministic: question + scope + resolved owners → which existing
 * authorities must be consulted before GM Advisor answers.
 *
 * Not an LLM tool registry. Does not invoke authorities.
 * RFSN-052E executes the plan via the evidence package.
 *
 * Unknown / coaching intents fall back to normal Advisor context packing.
 */

import { isSeasonMatchupDetailAsk } from "./championshipAuthority";
import { selectMatchupMarginTool } from "./matchupMarginTool";
import {
  findMentionedOwners,
  type AdvisorOwnerAlias,
} from "./advisorQuestionClassify";
import {
  resolveAdvisorQuestionScope,
  type AdvisorQuestionScope,
} from "./advisorScopeResolver";

/** Existing product authorities — planner names only, no new engines. */
export type AdvisorAuthorityId =
  | "owner_identity"
  | "championships"
  | "h2h"
  | "rivalry"
  | "matchup_history"
  | "matchup_margins"
  | "playoffs"
  | "league_records"
  | "owner_dossier"
  | "draft_history"
  | "trades"
  | "transactions"
  | "timeline"
  | "hall_of_fame"
  | "awards"
  | "league_dna";

/** Where each planner id already lives. Documentation only — not imported. */
export const ADVISOR_AUTHORITY_MODULES: Record<AdvisorAuthorityId, string> = {
  owner_identity: "ownerIdentityAuthority.buildOwnerIdentityAuthority",
  championships: "championshipAuthority.buildChampionshipAuthority",
  h2h: "h2hAuthority.buildH2HAuthority",
  rivalry: "rivalryService.computeRivalryScores",
  matchup_history: "gmMatchups + h2hAuthority meetings",
  matchup_margins: "matchupMarginTool.tryMatchupMarginToolAnswer",
  playoffs: "h2hAuthority playoff layer / playoffPositionSplit",
  league_records: "hallOfFameService / espn.ownerAllTimeRecords",
  owner_dossier: "ownerProfileService / ownerCareerProfileService",
  draft_history: "espn.draftHistory / owner draft DNA",
  trades: "completedTradeAuthority.loadCompletedTradeIntelligence",
  transactions: "historicalDataService.getSeasonTransactions",
  timeline: "careerReportService.computeCareerReport timeline",
  hall_of_fame: "hallOfFameService.buildHallOfFamePayload",
  awards: "services/rfsn/draftNightAwards",
  league_dna: "leagueDNA.calcLeagueDNA",
};

const AUTHORITY_ORDER: AdvisorAuthorityId[] = [
  "owner_identity",
  "championships",
  "h2h",
  "rivalry",
  "matchup_history",
  "matchup_margins",
  "playoffs",
  "league_records",
  "owner_dossier",
  "draft_history",
  "trades",
  "transactions",
  "timeline",
  "hall_of_fame",
  "awards",
  "league_dna",
];

export type AdvisorPlannerIntent =
  | "matchup_margins"
  | "h2h_pair"
  | "best_rivalry"
  | "goat"
  | "championship_leaderboard"
  | "championship_compare"
  | "owner_championships"
  | "podium_placement"
  | "season_matchup_detail"
  | "reigning_champion"
  | "why_havent_i_won"
  | "playoff_eliminations"
  | "playoff_villain"
  | "career_win_pct"
  | "worst_career_record"
  | "career_most_wins"
  | "career_most_losses"
  | "owner_career"
  | "draft_history"
  | "trade_history"
  | "league_history_general"
  | "advisor_fallback";

export type AdvisorResolvedOwner = {
  displayName: string;
  memberId?: string;
  canonicalPersonId?: string;
};

export type AdvisorEvidencePlannerInput = {
  message: string;
  leagueId: string;
  scope: AdvisorQuestionScope;
  owners: AdvisorResolvedOwner[];
};

export type AdvisorEvidencePlan = {
  intent: AdvisorPlannerIntent;
  authorities: AdvisorAuthorityId[];
  deterministicFirst: boolean;
  narrativeAllowed: boolean;
  requiredEvidence: string[];
  /** When true, caller should use existing Advisor prompt packing (no authority fan-out). */
  fallbackToAdvisorContext: boolean;
};

function uniqueAuthorities(ids: AdvisorAuthorityId[]): AdvisorAuthorityId[] {
  const set = new Set(ids);
  return AUTHORITY_ORDER.filter((id) => set.has(id));
}

function normalize(message: string): string {
  return message.toLowerCase().replace(/\s+/g, " ").trim();
}

function namedOwners(input: AdvisorEvidencePlannerInput): AdvisorResolvedOwner[] {
  if (input.owners.length > 0) return input.owners;
  return input.scope.ownerNames.map((displayName) => ({ displayName }));
}

function isWhyHaventIWon(t: string): boolean {
  return (
    /\bwhy haven'?t i won\b/.test(t) ||
    /\bwhy (have|haven) (i|we) (not )?won\b/.test(t) ||
    /\bwhy (can'?t|cannot) i win (a |the )?(title|championship)?\b/.test(t) ||
    /\bchampionship drought\b/.test(t) ||
    /\bwhy don'?t i (ever )?win\b/.test(t)
  );
}

function isReigningChampionAsk(t: string): boolean {
  if (/\bmost (championships|titles|rings)\b/.test(t)) return false;
  if (/\bgreatest|goat|hall of fame\b/.test(t)) return false;
  return (
    /\bwho(?:'s| is) the (?:reigning )?champ(?:ion)?\b/.test(t) ||
    /\b(?:who is|who'?s) (?:our |the )?(?:current |reigning )?champion\b/.test(t) ||
    /\breigning champion\b/.test(t) ||
    /\bwho won (?:the )?(?:league|title|championship)\b/.test(t)
  );
}

function isGoatAsk(t: string): boolean {
  return (
    /\bgoat\b/.test(t) ||
    /\bgreatest (owner|gm|manager|of all time)\b/.test(t) ||
    /\bmost decorated\b/.test(t) ||
    /\bwho(?:'s| is) the (?:greatest|best) (?:owner|gm|manager)s?\b/.test(t)
  );
}

function isBestRivalryAsk(t: string): boolean {
  return (
    /\b(best|greatest|biggest|most heated|most intense) rivalr(?:y|ies)\b/.test(t) ||
    /\brivalry (?:of all time|ever)\b/.test(t) ||
    /\bwho is my biggest rival\b/.test(t)
  );
}

function isPlayoffEliminationsAsk(t: string): boolean {
  return /\b(most|most career|career)?\s*playoff eliminations\b/.test(t) || /\bwho has (the )?most playoff eliminations\b/.test(t);
}

function isPlayoffVillainAsk(t: string): boolean {
  return /\bplayoff villain\b/.test(t) || /\bbiggest villain\b/.test(t);
}

function isCareerWinPctAsk(t: string): boolean {
  return (
    /\b(best|highest) (?:career )?win(?:ning)? (?:percentage|pct|rate)\b/.test(t) ||
    /\bcareer winning percentage\b/.test(t) ||
    /\bmost efficient\b/.test(t) ||
    /\befficient (?:owner|gm|manager)\b/.test(t)
  );
}

function isNamedOwnerCareerSnapshotAsk(t: string, ownerCount: number): boolean {
  if (ownerCount !== 1) return false;
  return (
    /\bhow good (?:was|is)\b/.test(t) ||
    /\b(?:his|her|their) (?:career )?record\b/.test(t) ||
    /\bcareer record\b/.test(t) ||
    /\bwin(?:ning)? (?:percentage|pct|rate)\b/.test(t)
  );
}

function isWorstCareerRecordAsk(t: string): boolean {
  return (
    /\bworst (?:career )?record\b/.test(t) ||
    /\bworst (?:career )?win(?:ning)? (?:percentage|pct|rate)\b/.test(t)
  );
}

function isMostCareerWinsAsk(t: string): boolean {
  return (
    /\bmost career wins\b/.test(t) ||
    (/\bmost wins\b/.test(t) && /\b(career|all.?time|historical)\b/.test(t))
  );
}

function isMostCareerLossesAsk(t: string): boolean {
  return (
    /\bmost career losses\b/.test(t) ||
    (/\bmost losses\b/.test(t) &&
      /\b(career|all.?time|historical)\b/.test(t) &&
      !/\bone[-\s]?point|blowout|margin/.test(t))
  );
}

function isChampionshipLeaderboard(t: string, ownerCount: number): boolean {
  if (isChampionshipCompareAsk(t, ownerCount)) return false;
  return (
    /\bmost (?:championships|titles|rings)\b/.test(t) ||
    /\bwho has (?:the )?most (?:championships|titles|rings)\b/.test(t) ||
    (/\bwho has more (?:championships|titles|rings)\b/.test(t) && ownerCount < 2) ||
    /\btitle (?:count|leaderboard|leaders?)\b/.test(t)
  );
}

/** Two named owners + ring/title comparison — Championship Authority only. */
export function isChampionshipCompareAsk(t: string, ownerCount: number): boolean {
  if (ownerCount < 2) return false;
  if (/\bwho has more (?:championships|titles|rings)\b/.test(t)) return true;
  if (/\bmore (?:championships|titles|rings)\b/.test(t)) return true;
  if (
    /\bmost (?:championships|titles|rings)\b/.test(t) &&
    (/\bor\b/.test(t) || /\bvs\.?\b/.test(t) || /\bversus\b/.test(t))
  ) {
    return true;
  }
  return false;
}

/** Season podium (runner-up / third) from Championship Authority medals. */
export function isPodiumPlacementAsk(t: string): boolean {
  const ru = /\brunner-?ups?\b|\bsecond place\b|\b2nd place\b/.test(t);
  const third =
    /\bthird place\b|\b3rd place\b/.test(t) ||
    (/\b(?:third|3rd)\b/.test(t) && (/\bwho\b/.test(t) || /\bfinished\b/.test(t)));
  if (!ru && !third) return false;
  if (/\bhow many\b/.test(t) && /\b(championships?|rings?|titles?)\b/.test(t)) return false;
  return /\bwho\b/.test(t) || /\bfinished\b/.test(t) || /\b(?:19|20)\d{2}\b/.test(t);
}

/** One named owner + how many rings/titles — Championship Authority only. */
export function isOwnerChampionshipAsk(t: string, ownerCount: number): boolean {
  if (ownerCount !== 1) return false;
  if (isGoatAsk(t) || isWhyHaventIWon(t)) return false;
  return (
    /\bhow many (?:championships|titles|rings)\b/.test(t) ||
    /\b(?:championship|title|ring) count\b/.test(t) ||
    /\b(?:rings?|titles?|championships?)\s+does\b/.test(t) ||
    /\bdoes .+ have\b.+\b(?:rings?|titles?|championships?)\b/.test(t) ||
    (/\b(championships?|titles?|rings?)\b/.test(t) &&
      !/\b(career|legacy|franchise|playoff|h2h|head[-\s]?to[-\s]?head)\b/.test(t))
  );
}

/** Head-to-head / pair record cues, including pronouns. */
export function isAdvisorH2HQuestion(t: string, ownerCount: number): boolean {
  if (
    /\bhead[-\s]?to[-\s]?head\b/.test(t) ||
    /\bh2h\b/.test(t) ||
    /\bwho owns who\b/.test(t) ||
    /\bhow many times (have they|did they|have we|have .+)\s+met\b/.test(t) ||
    /\b(check|show|what(?:'s| is|s)) their (h2h|head[-\s]?to[-\s]?head|playoff record)\b/.test(t) ||
    /\b(their|the) playoff record\b/.test(t)
  ) {
    return true;
  }
  if (ownerCount >= 2) return true;
  if (/\bvs\.?\b|\bversus\b/.test(t) && ownerCount >= 1) return true;
  return false;
}

function isLeagueHistoryGeneral(t: string): boolean {
  return (
    /\bleague history\b/.test(t) ||
    /\btell me about (?:our |the )?league\b/.test(t) ||
    /\bhall of fame\b/.test(t)
  );
}

function isOwnerCareerAsk(t: string, ownerCount: number, scope: AdvisorQuestionScope): boolean {
  if (scope.scopeType === "owner_career") return true;
  if (ownerCount === 1 && /\b(career|legacy|franchise|titles?|championships?)\b/.test(t)) {
    return !isGoatAsk(t) && !isChampionshipLeaderboard(t, ownerCount);
  }
  return false;
}

function planForIntent(
  intent: AdvisorPlannerIntent,
  ownerCount: number,
): Pick<
  AdvisorEvidencePlan,
  "authorities" | "deterministicFirst" | "narrativeAllowed" | "requiredEvidence" | "fallbackToAdvisorContext"
> {
  switch (intent) {
    case "matchup_margins":
      return {
        authorities: uniqueAuthorities(["owner_identity", "matchup_margins"]),
        deterministicFirst: true,
        narrativeAllowed: false,
        requiredEvidence: ["margin_query", "owner_resolved_matchups"],
        fallbackToAdvisorContext: false,
      };
    case "h2h_pair":
      return {
        authorities: uniqueAuthorities(["owner_identity", "h2h", "playoffs"]),
        deterministicFirst: true,
        narrativeAllowed: false,
        requiredEvidence: [
          "h2h_career_record",
          "h2h_playoff_record",
          "h2h_meetings",
          "playoff_eliminations",
        ],
        fallbackToAdvisorContext: false,
      };
    case "best_rivalry":
      return {
        authorities: uniqueAuthorities([
          ...(ownerCount >= 1 ? (["owner_identity"] as AdvisorAuthorityId[]) : []),
          "rivalry",
          "h2h",
          "playoffs",
          "championships",
        ]),
        deterministicFirst: true,
        narrativeAllowed: false,
        requiredEvidence: ["rivalry_ranking", "h2h_career_record", "playoff_eliminations"],
        fallbackToAdvisorContext: false,
      };
    case "playoff_eliminations":
    case "playoff_villain":
      return {
        authorities: uniqueAuthorities(["owner_identity", "playoffs", "rivalry"]),
        deterministicFirst: true,
        narrativeAllowed: false,
        requiredEvidence: ["playoff_eliminations"],
        fallbackToAdvisorContext: false,
      };
    case "career_win_pct":
    case "worst_career_record":
    case "career_most_wins":
    case "career_most_losses":
      return {
        authorities: uniqueAuthorities(["owner_identity", "league_records"]),
        deterministicFirst: true,
        narrativeAllowed: false,
        requiredEvidence: ["career_records"],
        fallbackToAdvisorContext: false,
      };
    case "goat":
      return {
        authorities: uniqueAuthorities([
          "championships",
          "league_records",
          "hall_of_fame",
          "playoffs",
          "timeline",
        ]),
        deterministicFirst: true,
        narrativeAllowed: true,
        requiredEvidence: [
          "title_counts",
          "hof_leaderboard",
          "league_records",
          "playoff_resume",
          "career_longevity",
        ],
        fallbackToAdvisorContext: false,
      };
    case "championship_leaderboard":
      return {
        authorities: uniqueAuthorities(["championships"]),
        deterministicFirst: true,
        narrativeAllowed: false,
        requiredEvidence: ["title_counts", "champion_seasons"],
        fallbackToAdvisorContext: false,
      };
    case "championship_compare":
      return {
        authorities: uniqueAuthorities(["owner_identity", "championships"]),
        deterministicFirst: true,
        narrativeAllowed: false,
        requiredEvidence: ["title_counts", "champion_seasons"],
        fallbackToAdvisorContext: false,
      };
    case "owner_championships":
      return {
        authorities: uniqueAuthorities(["owner_identity", "championships"]),
        deterministicFirst: true,
        narrativeAllowed: false,
        requiredEvidence: ["title_counts", "champion_seasons"],
        fallbackToAdvisorContext: false,
      };
    case "podium_placement":
      return {
        authorities: uniqueAuthorities(["championships"]),
        deterministicFirst: true,
        narrativeAllowed: false,
        requiredEvidence: ["podium"],
        fallbackToAdvisorContext: false,
      };
    case "season_matchup_detail":
      return {
        authorities: uniqueAuthorities(["owner_identity", "championships", "league_records"]),
        deterministicFirst: true,
        narrativeAllowed: false,
        requiredEvidence: ["season_coverage"],
        fallbackToAdvisorContext: false,
      };
    case "reigning_champion":
      return {
        authorities: uniqueAuthorities(["championships"]),
        deterministicFirst: true,
        narrativeAllowed: false,
        requiredEvidence: ["reigning_champion", "latest_title_season"],
        fallbackToAdvisorContext: false,
      };
    case "why_havent_i_won":
      return {
        authorities: uniqueAuthorities([
          "owner_dossier",
          "playoffs",
          "championships",
          "draft_history",
          "trades",
          "matchup_history",
        ]),
        deterministicFirst: true,
        narrativeAllowed: true,
        requiredEvidence: [
          "why_havent_i_won_findings",
          "title_counts",
          "playoff_resume",
          "draft_tendencies",
          "trade_history",
          "matchup_resume",
        ],
        fallbackToAdvisorContext: false,
      };
    case "owner_career":
      return {
        authorities: uniqueAuthorities([
          "owner_identity",
          "owner_dossier",
          "championships",
          "timeline",
          "playoffs",
          "matchup_history",
        ]),
        deterministicFirst: true,
        narrativeAllowed: true,
        requiredEvidence: [
          "owner_profile",
          "title_counts",
          "career_timeline",
          "playoff_resume",
        ],
        fallbackToAdvisorContext: false,
      };
    case "draft_history":
      return {
        authorities: uniqueAuthorities(["owner_identity", "draft_history"]),
        deterministicFirst: true,
        narrativeAllowed: true,
        requiredEvidence: ["draft_picks", "draft_tendencies"],
        fallbackToAdvisorContext: false,
      };
    case "trade_history":
      return {
        authorities: uniqueAuthorities(["owner_identity", "trades", "transactions"]),
        deterministicFirst: true,
        narrativeAllowed: true,
        requiredEvidence: ["completed_trades", "transaction_ledger"],
        fallbackToAdvisorContext: false,
      };
    case "league_history_general":
      return {
        authorities: uniqueAuthorities([
          "championships",
          "hall_of_fame",
          "league_records",
          "playoffs",
          "timeline",
        ]),
        deterministicFirst: true,
        narrativeAllowed: true,
        requiredEvidence: ["title_counts", "hof_leaderboard", "league_records", "career_longevity"],
        fallbackToAdvisorContext: false,
      };
    case "advisor_fallback":
      return {
        authorities: [],
        deterministicFirst: false,
        narrativeAllowed: true,
        requiredEvidence: [],
        fallbackToAdvisorContext: true,
      };
  }
}

function detectIntent(
  t: string,
  scope: AdvisorQuestionScope,
  ownerCount: number,
): AdvisorPlannerIntent {
  if (isWhyHaventIWon(t)) return "why_havent_i_won";
  if (isReigningChampionAsk(t)) return "reigning_champion";
  if (isGoatAsk(t)) return "goat";
  if (isPlayoffVillainAsk(t)) return "playoff_villain";
  if (isBestRivalryAsk(t)) return "best_rivalry";
  if (selectMatchupMarginTool(t) != null) return "matchup_margins";
  if (isChampionshipCompareAsk(t, ownerCount)) return "championship_compare";
  if (isChampionshipLeaderboard(t, ownerCount)) return "championship_leaderboard";
  if (isPodiumPlacementAsk(t)) return "podium_placement";
  if (isSeasonMatchupDetailAsk(t)) return "season_matchup_detail";
  if (isOwnerChampionshipAsk(t, ownerCount)) return "owner_championships";
  if (isPlayoffEliminationsAsk(t)) return "playoff_eliminations";
  if (isNamedOwnerCareerSnapshotAsk(t, ownerCount)) return "career_win_pct";
  if (isCareerWinPctAsk(t)) return "career_win_pct";
  if (isWorstCareerRecordAsk(t)) return "worst_career_record";
  if (isMostCareerWinsAsk(t)) return "career_most_wins";
  if (isMostCareerLossesAsk(t)) return "career_most_losses";
  if (
    isAdvisorH2HQuestion(t, ownerCount) ||
    ownerCount >= 2 ||
    (scope.scopeType === "rivalry_history" && ownerCount >= 1)
  ) {
    return "h2h_pair";
  }
  if (scope.scopeType === "draft_history") return "draft_history";
  if (
    /\bdraft\b/.test(t) &&
    scope.scopeType !== "current_season" &&
    !/\bshould i (draft|keep|pick)\b/.test(t)
  ) {
    return "draft_history";
  }
  if (scope.scopeType === "transaction_history") return "trade_history";
  if (isOwnerCareerAsk(t, ownerCount, scope)) return "owner_career";
  if (isLeagueHistoryGeneral(t)) return "league_history_general";
  if (scope.scopeType === "current_season") return "advisor_fallback";
  if (scope.confidence === "low" && ownerCount === 0) return "advisor_fallback";
  return "advisor_fallback";
}

/**
 * Build an evidence plan. Pure. No LLM. No authority execution.
 */
export function planAdvisorEvidence(input: AdvisorEvidencePlannerInput): AdvisorEvidencePlan {
  const t = normalize(input.message ?? "");
  const owners = namedOwners(input);
  const intent = detectIntent(t, input.scope, owners.length);
  const rest = planForIntent(intent, owners.length);
  return { intent, ...rest };
}

/**
 * Convenience: resolve scope then plan. Still no LLM / no authority calls.
 */
export function planAdvisorEvidenceFromMessage(
  message: string,
  opts?: {
    leagueId?: string;
    ownerAliases?: AdvisorOwnerAlias[];
    currentSeason?: number;
  },
): AdvisorEvidencePlan {
  const scope = resolveAdvisorQuestionScope(message, {
    ownerAliases: opts?.ownerAliases,
    currentSeason: opts?.currentSeason,
  });
  let owners: AdvisorResolvedOwner[] = [];
  if (opts?.ownerAliases?.length) {
    owners = findMentionedOwners(message, opts.ownerAliases).map((o) => ({
      displayName: o.displayName,
      memberId: o.memberId,
    }));
  }
  if (owners.length === 0) {
    owners = scope.ownerNames.map((displayName) => ({ displayName }));
  }
  return planAdvisorEvidence({
    message,
    leagueId: opts?.leagueId ?? "",
    scope,
    owners,
  });
}
