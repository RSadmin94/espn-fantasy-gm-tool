/**
 * Version 1 user-facing labels — single source for nav, titles, and marketing copy.
 * Backend route names and API identifiers stay unchanged.
 */
export const V1 = {
  home: {
    nav: "Welcome Back, Coach",
    eyebrow: "Welcome Back, Coach",
    enterCta: "Welcome Back, Coach",
    stateOfTheWeek: "State of the week",
    executiveBriefing: "Executive Briefing",
    thisWeek: "This Week",
    intelligenceTrio: "Intelligence Trio",
    leaguePulse: "League Pulse",
    standingsSnapshot: "Standings Snapshot",
    longMemory: "The Long Memory",
    exploreGrid: "Explore",
    exploreGridTitle: "What should I look at first?",
    exploreGridLead: "Start with the stories your synced league history already tells.",
    preseasonKickoffLine: "Weekly intelligence switches on at kickoff.",
    thisWeekInHistory: "This week in history",
    championsTimeline: "Champions timeline",
    recentEvents: "Recent events",
    intelligenceTrioLead: "Three beats that matter right now",
    standingsSnapshotHint: "Top 5 · your row pinned",
    thisWeekVs: "You play {opponent} this week",
    rivalryAngle: "Rivalry angle",
    storylinesKickoffLine: "Weekly storylines switch on at kickoff.",
    storylinesLastSeasonNote: "Last season's top storyline",
    freeJourney: {
      myGmProfile: "My GM Profile",
      ownerDnaBasic: "Owner DNA",
      oneRival: "Your Biggest Rival",
      oneStoryline: "League Storyline",
    },
    beats: {
      rivalThreat: "Rival Threat",
      yourPattern: "Your Pattern",
      leagueShift: "League Shift",
      tradeWindow: "Trade Window",
      playoffPath: "Playoff Path",
      draftPrep: "Draft Prep",
      acquisitionImpact: "Acquisition Impact",
      hofMilestone: "Hall of Fame Milestone",
    },
    questions: {
      whatChanged: "What changed",
      whyItMatters: "Why it matters",
      whatToDo: "What to do",
      whereToGo: "Where to go",
    },
  },
  navGroups: {
    home: "Welcome Back, Coach",
    media: "RFSN",
    weekly: "Weekly",
    knowRivals: "Know Rivals",
    knowYourself: "Know Yourself",
    league: "League",
    history: "History",
  },
  features: {
    tradeIntelligence: "Trade Intelligence",
    whyHaventIWon: "Why Haven't I Won?",
    powerRankings: "Power Rankings",
    hallOfFame: "Hall of Fame",
    leagueHistory: "League History",
    rivalries: "Rivalries",
    myGmProfile: "My GM Profile",
    leagueDna: "League DNA",
    leagueWire: "RFSN",
    rfsn: "RFSN",
    advisor: "GM Advisor",
    rosters: "Rosters",
    matchups: "Matchups",
    theCast: "The Cast",
    acquisitionImpact: "Acquisition Impact",
    commissionerHub: "Commissioner Hub",
    draftHistory: "Draft History",
    transactions: "Transactions",
    standings: "Standings",
    settings: "Settings",
    syncData: "Sync Data",
    draftWarRoom: "Draft War Room",
  },
} as const;

export type IntelligenceBeatFamily =
  | "rivals"
  | "self"
  | "league"
  | "trades"
  | "playoff"
  | "draft"
  | "acquisition"
  | "history";

export type IntelligenceBeatId =
  | "rivalThreat"
  | "yourPattern"
  | "leagueShift"
  | "tradeWindow"
  | "playoffPath"
  | "draftPrep"
  | "acquisitionImpact"
  | "hofMilestone";
