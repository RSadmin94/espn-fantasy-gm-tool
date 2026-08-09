/**
 * RFSN-052B — Deterministic historical scope resolver for GM Advisor.
 *
 * Pure question → scope. Does not call authorities or change the UI.
 * RFSN-052E consumes this as the first step of the evidence-first Advisor path.
 *
 * Default: if the user does not explicitly request a season or current-season
 * context, scope is LEAGUE HISTORY — never the current season.
 */

import {
  findMentionedOwners,
  type AdvisorOwnerAlias,
} from "./advisorQuestionClassify";

export type AdvisorScopeType =
  | "current_season"
  | "single_season"
  | "season_range"
  | "owner_career"
  | "league_history"
  | "draft_history"
  | "transaction_history"
  | "rivalry_history";

export type AdvisorScopePhase = "regular" | "playoffs" | "all";

export type AdvisorScopeConfidence = "high" | "medium" | "low";

export type AdvisorQuestionScope = {
  scopeType: AdvisorScopeType;
  startSeason: number | null;
  endSeason: number | null;
  phase: AdvisorScopePhase;
  ownerNames: string[];
  confidence: AdvisorScopeConfidence;
  explicitSeasonRequested: boolean;
};

export type ResolveAdvisorScopeOptions = {
  /** Known league owners — used for deterministic name matching. */
  ownerAliases?: AdvisorOwnerAlias[];
  /** League "this year" (max cached / sync current). Defaults to calendar year. */
  currentSeason?: number;
};

/** Shared stop-list so alias matching does not treat question words as owners. */
export const ADVISOR_NAME_STOP = new Set(
  [
    "who", "what", "how", "when", "where", "why", "which",
    "the", "this", "that", "last", "next", "most", "many", "more", "less",
    "league", "history", "season", "seasons", "year", "years", "week",
    "playoff", "playoffs", "regular", "draft", "trade", "trades", "traded",
    "owner", "owners", "team", "teams", "manager", "managers", "gm",
    "rival", "rivals", "rivalry", "championship", "championships", "title", "titles",
    "goat", "hall", "fame", "point", "points", "loss", "losses", "win", "wins",
    "game", "games", "record", "biggest", "best", "worst", "strongest", "greatest",
    "always", "never", "football", "fantasy", "my", "our", "your", "his", "her",
    "their", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "against", "versus", "from", "through", "until", "since", "during", "about",
  ].map((s) => s.toLowerCase()),
);

const NAME_STOP = ADVISOR_NAME_STOP;

function normalize(message: string): string {
  return message.toLowerCase().replace(/\s+/g, " ").trim();
}

function calendarYear(now = new Date()): number {
  return now.getFullYear();
}

type SeasonParse = {
  kind: "none" | "current" | "single" | "range";
  start: number | null;
  end: number | null;
  explicit: boolean;
};

function parseSeasons(t: string, currentSeason: number): SeasonParse {
  if (
    /\b(this year|this season|current season|this week|right now|currently)\b/.test(t) ||
    /\bheading into\s+this (year|season)\b/.test(t)
  ) {
    return { kind: "current", start: currentSeason, end: currentSeason, explicit: true };
  }

  if (/\b(last season|last year|previous season|a year ago)\b/.test(t)) {
    const y = currentSeason - 1;
    return { kind: "single", start: y, end: y, explicit: true };
  }

  const dash = t.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/);
  if (dash) {
    const a = Number(dash[1]);
    const b = Number(dash[2]);
    return {
      kind: "range",
      start: Math.min(a, b),
      end: Math.max(a, b),
      explicit: true,
    };
  }

  const through = t.match(
    /\b(?:from\s+)?(20\d{2})\s+(?:through|to|until)\s+(20\d{2})\b/,
  );
  if (through) {
    const a = Number(through[1]);
    const b = Number(through[2]);
    return {
      kind: "range",
      start: Math.min(a, b),
      end: Math.max(a, b),
      explicit: true,
    };
  }

  const since = t.match(/\bsince\s+(20\d{2})\b/);
  if (since) {
    return {
      kind: "range",
      start: Number(since[1]),
      end: currentSeason,
      explicit: true,
    };
  }

  const inYear = t.match(/\b(?:in|during|for)\s+(20\d{2})\b/);
  if (inYear) {
    const y = Number(inYear[1]);
    return { kind: "single", start: y, end: y, explicit: true };
  }

  const seasonPhrase = t.match(/\b(20\d{2})\s+season\b/);
  if (seasonPhrase) {
    const y = Number(seasonPhrase[1]);
    return { kind: "single", start: y, end: y, explicit: true };
  }

  const bare = t.match(/\b(20\d{2})\b/);
  if (bare) {
    const y = Number(bare[1]);
    return { kind: "single", start: y, end: y, explicit: true };
  }

  return { kind: "none", start: null, end: null, explicit: false };
}

function isMatchupStatQuestion(t: string): boolean {
  return (
    /\b(one[-\s]?point|1[-\s]?point|point losses?|point wins?|nail-?biter|close (games?|losses?)|margin|closest game|blowout|heartbreak|margin of victory|combined (score|total)|losing score|winning score|upset|halftime)\b/.test(
      t,
    ) ||
    /\b(biggest|largest)\s+(win|victory|blowout|margin)\b/.test(t) ||
    /\b(wins?|losses?)\s+by\b/.test(t)
  );
}

function parsePhase(t: string): AdvisorScopePhase {
  const wantsPlayoffs = /\bplayoff/.test(t);
  const wantsRegular = /\bregular\s*season\b/.test(t);
  if (wantsPlayoffs && !wantsRegular) return "playoffs";
  if (wantsRegular && !wantsPlayoffs) return "regular";
  if (/\ball\s+games\b|\bincluding\s+playoff/.test(t)) return "all";
  if (isMatchupStatQuestion(t)) return "regular";
  return "all";
}

function isDraftDomain(t: string): boolean {
  return /\b(draft|adp|keeper pick|drafted|reaches?\b|reach(ed|ing) in (the )?draft)\b/.test(
    t,
  );
}

function isTransactionDomain(t: string): boolean {
  return /\b(trades?|traded|waiver|waivers|add[-\s]?drop|transactions?|transaction history)\b/.test(
    t,
  );
}

function isRivalryCue(t: string): boolean {
  return (
    /\b(rivalry|nemesis|h2h|head[-\s]?to[-\s]?head|record against|vs\.?|versus|owns this rivalry|history with)\b/.test(
      t,
    ) ||
    /\bwho owns who\b/.test(t) ||
    /\bhow many times (have they|did they|have we) met\b/.test(t) ||
    /\b(their|the) playoff record\b/.test(t) ||
    /\b(always lose to|always beat|why do i (always|keep) (lose|losing))\b/.test(t)
  );
}

function isOwnerCareerCue(t: string): boolean {
  return (
    /\b(my (career|franchise|legacy|history)|his career|her career|their career)\b/.test(t) ||
    /\b(career|legacy|franchise|all[-\s]?time record)\b/.test(t)
  );
}

function titleCaseName(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function parseVsPair(message: string): string[] {
  const m = message.match(
    /\b([A-Za-z][A-Za-z]+(?:\s+[A-Za-z][A-Za-z]+)?)\s+(?:vs\.?|versus)\s+([A-Za-z][A-Za-z]+(?:\s+[A-Za-z][A-Za-z]+)?)\b/i,
  );
  if (!m) return [];
  const a = m[1]!.trim();
  const b = m[2]!.trim();
  if (NAME_STOP.has(a.toLowerCase()) || NAME_STOP.has(b.toLowerCase())) return [];
  return [titleCaseName(a), titleCaseName(b)];
}

function parseAgainstName(message: string): string[] {
  const m = message.match(
    /\b(?:against|vs\.?)\s+([A-Za-z][A-Za-z]+(?:\s+[A-Za-z][A-Za-z]+)?)\b/i,
  );
  if (!m) return [];
  const name = m[1]!.trim();
  if (NAME_STOP.has(name.toLowerCase())) return [];
  return [titleCaseName(name)];
}

function resolveOwnerNames(
  message: string,
  aliases: AdvisorOwnerAlias[] | undefined,
): string[] {
  if (aliases && aliases.length > 0) {
    const hits = findMentionedOwners(message, aliases);
    if (hits.length > 0) {
      return [...new Set(hits.map((h) => h.displayName))];
    }
  }
  const vs = parseVsPair(message);
  if (vs.length === 2) return vs;
  const against = parseAgainstName(message);
  if (against.length === 1) return against;
  return [];
}

function confidenceFor(args: {
  explicitSeason: boolean;
  scopeType: AdvisorScopeType;
  phaseExplicit: boolean;
  ownerCount: number;
  ambiguous: boolean;
}): AdvisorScopeConfidence {
  if (args.ambiguous) return "low";
  if (args.explicitSeason) return "high";
  if (args.scopeType === "rivalry_history" && args.ownerCount >= 2) return "high";
  if (args.phaseExplicit && args.scopeType === "league_history") return "high";
  if (
    args.scopeType === "rivalry_history" ||
    args.scopeType === "owner_career" ||
    args.scopeType === "draft_history" ||
    args.scopeType === "transaction_history"
  ) {
    return "medium";
  }
  if (args.scopeType === "league_history" && args.phaseExplicit) return "high";
  return args.scopeType === "league_history" ? "medium" : "low";
}

/**
 * Resolve historical / seasonal scope for a GM Advisor question.
 */
export function resolveAdvisorQuestionScope(
  message: string,
  opts?: ResolveAdvisorScopeOptions,
): AdvisorQuestionScope {
  const currentSeason = opts?.currentSeason ?? calendarYear();
  const raw = (message ?? "").trim();
  const t = normalize(raw);

  if (!t) {
    return {
      scopeType: "league_history",
      startSeason: null,
      endSeason: null,
      phase: "all",
      ownerNames: [],
      confidence: "low",
      explicitSeasonRequested: false,
    };
  }

  const seasons = parseSeasons(t, currentSeason);
  const phase = parsePhase(t);
  const phaseExplicit =
    /\bplayoff/.test(t) ||
    /\bregular\s*season\b/.test(t) ||
    /\ball\s+games\b|\bincluding\s+playoff/.test(t);
  const ownerNames = resolveOwnerNames(raw, opts?.ownerAliases);
  const draft = isDraftDomain(t);
  const txn = isTransactionDomain(t);
  const rivalry = isRivalryCue(t) || ownerNames.length >= 2;
  const careerCue = isOwnerCareerCue(t);
  const ambiguous =
    /^(what do you think\??|thoughts\??|any advice\??|what'?s going on\??|idk|huh\??)$/i.test(
      t,
    );

  let scopeType: AdvisorScopeType;

  if (seasons.kind === "current") {
    scopeType = "current_season";
  } else if (seasons.kind === "range") {
    scopeType = "season_range";
  } else if (seasons.kind === "single") {
    scopeType = "single_season";
  } else if (rivalry) {
    scopeType = "rivalry_history";
  } else if (draft) {
    scopeType = "draft_history";
  } else if (txn) {
    scopeType = "transaction_history";
  } else if (careerCue || ownerNames.length === 1) {
    scopeType = "owner_career";
  } else {
    scopeType = "league_history";
  }

  const conf = confidenceFor({
    explicitSeason: seasons.explicit,
    scopeType,
    phaseExplicit,
    ownerCount: ownerNames.length,
    ambiguous,
  });

  return {
    scopeType,
    startSeason: seasons.start,
    endSeason: seasons.end,
    phase,
    ownerNames,
    confidence: ambiguous ? "low" : conf,
    explicitSeasonRequested: seasons.explicit,
  };
}
