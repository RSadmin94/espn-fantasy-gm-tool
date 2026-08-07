/**
 * Lightweight Advisor question classification for context trimming.
 * Does not change model, persona, or retrieval architecture — only which
 * expensive history blocks attach to the existing system prompt.
 */

export type AdvisorQuestionCategory =
  | "START_SIT"
  | "TRADE_STRATEGY"
  | "RIVALRY_HISTORY"
  | "LEAGUE_HISTORY"
  | "CURRENT_LEAGUE"
  | "TEAM_IMPROVEMENT"
  | "GENERAL_SMALL"
  | "GENERAL_FULL";

/** Which expensive / optional blocks to attach for a category. */
export type AdvisorContextGates = {
  category: AdvisorQuestionCategory;
  /** VORP / scarcity / roster gaps */
  includeAnalytics: boolean;
  /** Injury intelligence block */
  includeInjuries: boolean;
  /** Multi-season CAREER HISTORY owner lines */
  includeCareerHistory: boolean;
  /** LEAGUE TROPHY HISTORY leaderboard + dynasty/drought narratives */
  includeTrophyHistory: boolean;
  /** This week's opponent H2H block */
  includeCurrentWeekH2h: boolean;
  /** Opponent trophy block */
  includeOpponentTrophy: boolean;
  /** League DNA behavioral profiles */
  includeDna: boolean;
  /** Draft order + keeper picks */
  includeDraft: boolean;
};

/** Current-season coaching bag: roster/standings/analytics/injuries/schedule — no history. */
const CURRENT_COACHING_GATES = {
  includeAnalytics: true,
  includeInjuries: true,
  includeCareerHistory: false,
  includeTrophyHistory: false,
  includeCurrentWeekH2h: true,
  includeOpponentTrophy: false,
  includeDna: false,
  includeDraft: false,
} as const;

const GATES: Record<AdvisorQuestionCategory, Omit<AdvisorContextGates, "category">> = {
  START_SIT: { ...CURRENT_COACHING_GATES },
  TRADE_STRATEGY: {
    includeAnalytics: true,
    includeInjuries: true,
    includeCareerHistory: false,
    includeTrophyHistory: false,
    includeCurrentWeekH2h: false,
    includeOpponentTrophy: false,
    includeDna: true,
    includeDraft: true,
  },
  RIVALRY_HISTORY: {
    includeAnalytics: false,
    includeInjuries: false,
    includeCareerHistory: true,
    includeTrophyHistory: true,
    includeCurrentWeekH2h: true,
    includeOpponentTrophy: true,
    includeDna: true,
    includeDraft: false,
  },
  LEAGUE_HISTORY: {
    includeAnalytics: false,
    includeInjuries: false,
    includeCareerHistory: true,
    includeTrophyHistory: true,
    includeCurrentWeekH2h: false,
    includeOpponentTrophy: false,
    includeDna: false,
    includeDraft: false,
  },
  CURRENT_LEAGUE: { ...CURRENT_COACHING_GATES },
  TEAM_IMPROVEMENT: { ...CURRENT_COACHING_GATES },
  GENERAL_SMALL: { ...CURRENT_COACHING_GATES },
  GENERAL_FULL: {
    includeAnalytics: true,
    includeInjuries: true,
    includeCareerHistory: true,
    includeTrophyHistory: true,
    includeCurrentWeekH2h: true,
    includeOpponentTrophy: true,
    includeDna: true,
    includeDraft: true,
  },
};

/**
 * Classify a user Advisor question into a context-trimming category.
 * Prefer specific intents; fall back to GENERAL_FULL when ambiguous.
 */
export function classifyAdvisorQuestion(message: string): AdvisorQuestionCategory {
  const t = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return "GENERAL_FULL";

  // Rivalry / personal H2H history (before generic "history")
  if (
    /\b(rivalry|nemesis|always lose to|always beat|record against|vs\.?\s+\w+|versus|head[-\s]?to[-\s]?head|h2h|owns this rivalry|history with)\b/.test(
      t,
    ) ||
    /\bwhy do i (always|keep) (lose|losing)\b/.test(t)
  ) {
    return "RIVALRY_HISTORY";
  }

  // Explicit full-bag franchise / legacy / career dumps (before narrower history)
  if (
    /\b(tell me everything|everything about (my|the) (franchise|career|legacy|team))\b/.test(t) ||
    /\b(explain my legacy|my legacy|complete breakdown|full (career|franchise) (breakdown|history|summary))\b/.test(
      t,
    ) ||
    /\b(summarize|summary of) my (league history|franchise|career|legacy)\b/.test(t) ||
    /\bgive me a complete (breakdown|history|summary)\b/.test(t) ||
    /\b(my entire (career|franchise|history)|franchise history)\b/.test(t)
  ) {
    return "GENERAL_FULL";
  }

  // League history / GOAT / championships
  if (
    /\b(greatest owner|league history|most championships|most titles|dominated the league|all[-\s]?time|goat|hall of fame)\b/.test(
      t,
    ) ||
    /\bwho (is|are) the (greatest|best|worst) (owner|manager|gm)s?\b/.test(t) ||
    /\btell me about (our |the )?league history\b/.test(t) ||
    /\bwho has (the )?most championships\b/.test(t)
  ) {
    return "LEAGUE_HISTORY";
  }

  // Start / sit — "X or Y" only when lineup/position cues present
  if (
    /\b(start|sit|bench|flex|wr2|wr1|rb1|rb2|te1|lineup|who should i (start|sit|bench)|should i start)\b/.test(
      t,
    ) ||
    (/\b\w+\s+or\s+\w+\b/.test(t) &&
      /\b(qb|rb|wr|te|k|dst|defense|flex|start|sit|bench)\b/.test(t))
  ) {
    return "START_SIT";
  }

  // Trade
  if (
    /\b(trade|offer for|target|package|buy low|sell high|fair trade|should i trade|trade for)\b/.test(
      t,
    )
  ) {
    return "TRADE_STRATEGY";
  }

  // Team improvement / coaching (before CURRENT_LEAGUE so "this week" coaching stays here)
  if (
    /\b(improve (my )?team|biggest (weakness|need|hole|problem)|holding me back)\b/.test(t) ||
    /\b(how (can|do) i (improve|win|fix|get better)|how do i win (this )?(league|year))\b/.test(
      t,
    ) ||
    /\bwhat should i do( this week| to improve)?\b/.test(t) ||
    /\b(what position should i upgrade|upgrade (my )?(qb|rb|wr|te|flex|roster|position))\b/.test(
      t,
    ) ||
    /\bhow close am i (to (a |the )?(championship|title|winning|playoffs))?\b/.test(t) ||
    /\b(win this league|path to (a |the )?championship|championship window)\b/.test(t) ||
    /\b(roster (weakness|need|gap)|what('s| is) my biggest need)\b/.test(t) ||
    /\bwhat should i (focus on|prioritize|fix)\b/.test(t)
  ) {
    return "TEAM_IMPROVEMENT";
  }

  // Current league / threat / standings now
  if (
    /\b(biggest threat|best team right now|in first|standings|who is leading|strongest roster|power ranking|playoff race|waiver)\b/.test(
      t,
    ) ||
    /\b(who is (first|last|leading)|current (standings|rankings)|this week('s)? (matchup|opponent|slate))\b/.test(
      t,
    ) ||
    /\b(right now|currently)\b/.test(t)
  ) {
    return "CURRENT_LEAGUE";
  }

  // Light feedback — current season only
  if (
    /\b(what do you think|how am i doing|any advice|thoughts on (my )?(team|roster)|give me (some )?feedback)\b/.test(
      t,
    ) ||
    /\b(feedback on (my )?(team|roster)|rate my (team|roster)|be honest|am i cooked)\b/.test(t) ||
    /\b(any tips|quick take|honest (take|assessment))\b/.test(t)
  ) {
    return "GENERAL_SMALL";
  }

  return "GENERAL_FULL";
}

export function advisorContextGatesFor(
  category: AdvisorQuestionCategory,
): AdvisorContextGates {
  return { category, ...GATES[category] };
}

export function gatesForAdvisorMessage(message: string | undefined | null): AdvisorContextGates {
  const category = message?.trim()
    ? classifyAdvisorQuestion(message)
    : ("GENERAL_FULL" as const);
  return advisorContextGatesFor(category);
}
