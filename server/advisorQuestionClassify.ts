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
  | "OWNER_COMPARISON"
  | "GENERAL_SMALL"
  | "GENERAL_FULL";

/** Known league owner aliases for deterministic name matching. */
export type AdvisorOwnerAlias = {
  memberId: string;
  displayName: string;
  /** Lowercase match tokens (first name, last name, full name, team name, etc.) */
  aliases: string[];
};

export type AdvisorClassificationResult = {
  category: AdvisorQuestionCategory;
  matchedOwners: AdvisorOwnerAlias[];
};

/** Which expensive / optional blocks to attach for a category. */
export type AdvisorContextGates = {
  category: AdvisorQuestionCategory;
  /** VORP / scarcity / roster gaps */
  includeAnalytics: boolean;
  /** Injury intelligence block */
  includeInjuries: boolean;
  /** Multi-season CAREER HISTORY owner lines */
  includeCareerHistory: boolean;
  /** When career history is on, only include these memberIds (+ focal if available) */
  careerMemberIdFilter: string[] | null;
  /** LEAGUE TROPHY HISTORY leaderboard + dynasty/drought narratives */
  includeTrophyHistory: boolean;
  /** This week's opponent H2H block */
  includeCurrentWeekH2h: boolean;
  /** Opponent trophy block */
  includeOpponentTrophy: boolean;
  /** Named-owner H2H for OWNER_COMPARISON matches */
  includeNamedOwnerH2h: boolean;
  /** League DNA behavioral profiles */
  includeDna: boolean;
  /** Draft order + keeper picks */
  includeDraft: boolean;
  /** Owners matched in the user message (OWNER_COMPARISON) */
  matchedOwners: AdvisorOwnerAlias[];
};

/** Current-season coaching bag: roster/standings/analytics/injuries/schedule — no history. */
const CURRENT_COACHING_GATES = {
  includeAnalytics: true,
  includeInjuries: true,
  includeCareerHistory: false,
  includeTrophyHistory: false,
  includeCurrentWeekH2h: true,
  includeOpponentTrophy: false,
  includeNamedOwnerH2h: false,
  includeDna: false,
  includeDraft: false,
} as const;

const GATES: Record<
  AdvisorQuestionCategory,
  Omit<AdvisorContextGates, "category" | "matchedOwners" | "careerMemberIdFilter">
> = {
  START_SIT: { ...CURRENT_COACHING_GATES },
  TRADE_STRATEGY: {
    includeAnalytics: true,
    includeInjuries: true,
    includeCareerHistory: false,
    includeTrophyHistory: false,
    includeCurrentWeekH2h: false,
    includeOpponentTrophy: false,
    includeNamedOwnerH2h: false,
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
    includeNamedOwnerH2h: false,
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
    includeNamedOwnerH2h: false,
    includeDna: false,
    includeDraft: false,
  },
  CURRENT_LEAGUE: { ...CURRENT_COACHING_GATES },
  TEAM_IMPROVEMENT: { ...CURRENT_COACHING_GATES },
  OWNER_COMPARISON: {
    includeAnalytics: true,
    includeInjuries: true,
    includeCareerHistory: true,
    includeTrophyHistory: false,
    includeCurrentWeekH2h: true,
    includeOpponentTrophy: false,
    includeNamedOwnerH2h: true,
    includeDna: true,
    includeDraft: false,
  },
  GENERAL_SMALL: { ...CURRENT_COACHING_GATES },
  GENERAL_FULL: {
    includeAnalytics: true,
    includeInjuries: true,
    includeCareerHistory: true,
    includeTrophyHistory: true,
    includeCurrentWeekH2h: true,
    includeOpponentTrophy: true,
    includeNamedOwnerH2h: false,
    includeDna: true,
    includeDraft: true,
  },
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pushAlias(set: Set<string>, raw: string | null | undefined) {
  const v = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (v.length >= 3) set.add(v);
  // Also index first token of multi-word names (Vince from "Vince Sellers")
  const first = v.split(" ")[0] ?? "";
  if (first.length >= 3) set.add(first);
}

/** Comparison / measuring-stick phrasing (not generic rivalry lore). */
export function hasOwnerComparisonIntent(message: string): boolean {
  const t = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return false;
  return (
    /\b(compared with|compared to|compare(d)? (myself )?with|compare(d)? (myself )?to)\b/.test(
      t,
    ) ||
    /\b(better than|worse than|stack up against|match up against|worry about)\b/.test(t) ||
    /\bhow (do|can) i (stack|match) up\b/.test(t) ||
    /\bam i (better|worse) than\b/.test(t) ||
    /\bshould i worry about\b/.test(t) ||
    /\bhow (can|do) i improve compared\b/.test(t)
  );
}

/** Deterministic owner mentions via known aliases (longest alias wins per owner). */
export function findMentionedOwners(
  message: string,
  owners: AdvisorOwnerAlias[],
): AdvisorOwnerAlias[] {
  const t = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t || owners.length === 0) return [];
  const hits: AdvisorOwnerAlias[] = [];
  for (const owner of owners) {
    const sorted = [...owner.aliases].sort((a, b) => b.length - a.length);
    for (const alias of sorted) {
      if (alias.length < 3) continue;
      const re = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
      if (re.test(t)) {
        hits.push(owner);
        break;
      }
    }
  }
  return hits;
}

/**
 * Load owner/team display aliases from local combined caches across seasons.
 * No hard-coded founder names — includes historical owners still in cache.
 */
export async function listAdvisorOwnerAliases(
  userId?: number,
  season = 2025,
): Promise<AdvisorOwnerAlias[]> {
  try {
    const { getCachedView, resolveActiveLeagueId, getAllCachedSeasons } = await import(
      "./db"
    );
    const { leagueId: lid } = await resolveActiveLeagueId(
      { user: userId != null ? { id: userId } : undefined },
      null,
      season,
    );
    if (!lid) return [];
    const leagueKey = String(lid).slice(0, 32);
    const seasons = await getAllCachedSeasons(undefined, userId);
    const seasonList = seasons.length > 0 ? seasons : [season];

    const byMember = new Map<string, { displayName: string; aliases: Set<string> }>();

    for (const s of seasonList) {
      const cached = await getCachedView(s, "combined", leagueKey);
      if (!cached?.payload) continue;
      const data = cached.payload as Record<string, unknown>;
      const members = (data.members as Record<string, unknown>[]) ?? [];
      const teams = (data.teams as Record<string, unknown>[]) ?? [];

      for (const m of members) {
        const mid = String(m.id ?? "").trim();
        if (!mid) continue;
        const first = String(m.firstName ?? "").trim();
        const last = String(m.lastName ?? "").trim();
        const display =
          [first, last].filter(Boolean).join(" ") ||
          String(m.displayName ?? "").trim() ||
          mid;
        let entry = byMember.get(mid);
        if (!entry) {
          entry = { displayName: display, aliases: new Set() };
          byMember.set(mid, entry);
        } else if (display && entry.displayName === mid) {
          entry.displayName = display;
        }
        // Full name + first name only — avoid shared last names (e.g. two "Sellers")
        pushAlias(entry.aliases, display);
        pushAlias(entry.aliases, first);
        pushAlias(entry.aliases, String(m.displayName ?? ""));
        pushAlias(entry.aliases, String((m as { nickname?: string }).nickname ?? ""));
      }

      for (const team of teams) {
        const t = team as Record<string, unknown>;
        const primaryOwner = String(
          t.primaryOwner || (Array.isArray(t.owners) ? t.owners[0] : "") || "",
        ).trim();
        if (!primaryOwner) continue;
        const teamName = String(t.name ?? t.teamName ?? "").trim();
        const abbrev = String(t.abbrev ?? "").trim();
        let entry = byMember.get(primaryOwner);
        if (!entry) {
          entry = { displayName: teamName || primaryOwner, aliases: new Set() };
          byMember.set(primaryOwner, entry);
        }
        pushAlias(entry.aliases, teamName);
        pushAlias(entry.aliases, abbrev);
        if (Array.isArray(t.owners)) {
          for (const o of t.owners) pushAlias(entry.aliases, String(o));
        }
      }
    }

    return [...byMember.entries()]
      .map(([memberId, v]) => ({
        memberId,
        displayName: v.displayName,
        aliases: [...v.aliases],
      }))
      .filter((o) => o.aliases.length > 0);
  } catch {
    return [];
  }
}

/**
 * Classify a user Advisor question into a context-trimming category.
 * Prefer specific intents; fall back to GENERAL_FULL when ambiguous.
 * Pass `ownerAliases` to enable OWNER_COMPARISON for named measuring-stick asks.
 */
export function classifyAdvisorQuestion(
  message: string,
  opts?: { ownerAliases?: AdvisorOwnerAlias[] },
): AdvisorQuestionCategory {
  return classifyAdvisorQuestionDetailed(message, opts).category;
}

export function classifyAdvisorQuestionDetailed(
  message: string,
  opts?: { ownerAliases?: AdvisorOwnerAlias[] },
): AdvisorClassificationResult {
  const t = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return { category: "GENERAL_FULL", matchedOwners: [] };

  // Rivalry / personal H2H history (before generic "history")
  if (
    /\b(rivalry|nemesis|always lose to|always beat|record against|vs\.?\s+\w+|versus|head[-\s]?to[-\s]?head|h2h|owns this rivalry|history with)\b/.test(
      t,
    ) ||
    /\bwhy do i (always|keep) (lose|losing)\b/.test(t)
  ) {
    return { category: "RIVALRY_HISTORY", matchedOwners: [] };
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
    return { category: "GENERAL_FULL", matchedOwners: [] };
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
    return { category: "LEAGUE_HISTORY", matchedOwners: [] };
  }

  // Start / sit — "X or Y" only when lineup/position cues present
  if (
    /\b(start|sit|bench|flex|wr2|wr1|rb1|rb2|te1|lineup|who should i (start|sit|bench)|should i start)\b/.test(
      t,
    ) ||
    (/\b\w+\s+or\s+\w+\b/.test(t) &&
      /\b(qb|rb|wr|te|k|dst|defense|flex|start|sit|bench)\b/.test(t))
  ) {
    return { category: "START_SIT", matchedOwners: [] };
  }

  // Trade
  if (
    /\b(trade|offer for|target|package|buy low|sell high|fair trade|should i trade|trade for)\b/.test(
      t,
    )
  ) {
    return { category: "TRADE_STRATEGY", matchedOwners: [] };
  }

  // Owner-aware comparison (before generic TEAM_IMPROVEMENT)
  const ownerAliases = opts?.ownerAliases ?? [];
  if (hasOwnerComparisonIntent(message)) {
    const matchedOwners =
      ownerAliases.length > 0 ? findMentionedOwners(message, ownerAliases) : [];
    if (matchedOwners.length > 0) {
      return { category: "OWNER_COMPARISON", matchedOwners };
    }
    // Comparison phrasing but unknown/non-league name — keep coaching bag, not FULL
    return { category: "TEAM_IMPROVEMENT", matchedOwners: [] };
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
    return { category: "TEAM_IMPROVEMENT", matchedOwners: [] };
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
    return { category: "CURRENT_LEAGUE", matchedOwners: [] };
  }

  // Light feedback — current season only
  if (
    /\b(what do you think|how am i doing|any advice|thoughts on (my )?(team|roster)|give me (some )?feedback)\b/.test(
      t,
    ) ||
    /\b(feedback on (my )?(team|roster)|rate my (team|roster)|be honest|am i cooked)\b/.test(t) ||
    /\b(any tips|quick take|honest (take|assessment))\b/.test(t)
  ) {
    return { category: "GENERAL_SMALL", matchedOwners: [] };
  }

  return { category: "GENERAL_FULL", matchedOwners: [] };
}

export function advisorContextGatesFor(
  category: AdvisorQuestionCategory,
  matchedOwners: AdvisorOwnerAlias[] = [],
): AdvisorContextGates {
  const base = GATES[category];
  const careerMemberIdFilter =
    category === "OWNER_COMPARISON" && matchedOwners.length > 0
      ? matchedOwners.map((o) => o.memberId)
      : null;
  return {
    category,
    ...base,
    careerMemberIdFilter,
    matchedOwners,
  };
}

/** Sync gates — OWNER_COMPARISON only when aliases are supplied. */
export function gatesForAdvisorMessage(
  message: string | undefined | null,
  opts?: { ownerAliases?: AdvisorOwnerAlias[] },
): AdvisorContextGates {
  if (!message?.trim()) return advisorContextGatesFor("GENERAL_FULL");
  const detailed = classifyAdvisorQuestionDetailed(message, opts);
  return advisorContextGatesFor(detailed.category, detailed.matchedOwners);
}

/** Async gates — loads local owner aliases for the active league. */
export async function gatesForAdvisorMessageAsync(
  message: string | undefined | null,
  userId?: number,
  season = 2025,
): Promise<AdvisorContextGates> {
  if (!message?.trim()) return advisorContextGatesFor("GENERAL_FULL");
  const ownerAliases = await listAdvisorOwnerAliases(userId, season);
  return gatesForAdvisorMessage(message, { ownerAliases });
}
