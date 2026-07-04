import type { IntelligenceBeat } from "@/lib/welcomeBackCoachBriefing";

export type HeadlineCategory = "news" | "milestone" | "trade" | "rivalry" | "upset";

export type BriefingHeadline = {
  id: string;
  text: string;
  category: HeadlineCategory;
  priority: number;
  href?: string;
};

export type BriefingHeroStory = {
  id: string;
  headline: string;
  dek: string;
  href: string;
  priority: number;
};

export type BriefingIdentity = {
  displayName: string;
  reputation: string;
  leagueSays: string;
  knownFor: string;
  fearedBecause: string;
  careerLine: string | null;
  titlesLine: string | null;
  rankLine: string | null;
};

export type BriefingRivalWeek = {
  name: string;
  heatLabel: string | null;
  teaser: string | null;
  whyNow: string[];
  href: string;
  h2hLine: string | null;
};

export type BriefingAdvantage = {
  title: string;
  bullets: string[];
  lockedBullets: string[];
};

export type BriefingComingNext = {
  teaser: string;
};

export type GmBriefingEdition = {
  hero: BriefingHeroStory;
  quote: string;
  headlines: BriefingHeadline[];
  headlinesHiddenCount: number;
  identity: BriefingIdentity;
  rival: BriefingRivalWeek | null;
  advantage: BriefingAdvantage;
  comingNext: BriefingComingNext;
};

const CATEGORY_STYLE: Record<HeadlineCategory, string> = {
  news: "text-sky-400",
  milestone: "text-emerald-400",
  trade: "text-orange-400",
  rivalry: "text-violet-400",
  upset: "text-red-400",
};

export function headlineCategoryClass(category: HeadlineCategory): string {
  return CATEGORY_STYLE[category] ?? CATEGORY_STYLE.news;
}

function beatToCategory(beat: IntelligenceBeat): HeadlineCategory {
  switch (beat.id) {
    case "tradeWindow":
    case "acquisitionImpact":
      return "trade";
    case "hofMilestone":
      return "milestone";
    case "rivalThreat":
      return "rivalry";
    case "playoffPath":
      return "upset";
    default:
      return "news";
  }
}

function daySeed(): number {
  const d = new Date();
  const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

function pickByDay<T>(items: T[], seed: number): T | null {
  if (items.length === 0) return null;
  return items[seed % items.length] ?? items[0];
}

function heroFromBeat(beat: IntelligenceBeat): BriefingHeroStory {
  const headlines: Record<string, { headline: string; dek?: string }> = {
    rivalThreat: { headline: "The Rivalry Returns", dek: beat.detail },
    yourPattern: { headline: "Nobody Plays Like You", dek: beat.detail },
    leagueShift: { headline: "The League Is Shifting", dek: beat.detail },
    tradeWindow: { headline: "The Trade Window Opens", dek: beat.detail },
    playoffPath: { headline: "The Playoff Race Tightens", dek: beat.detail },
    draftPrep: { headline: "Draft Season Begins", dek: beat.detail },
    acquisitionImpact: { headline: "The Board Just Changed", dek: beat.detail },
    hofMilestone: { headline: "A Legacy Milestone", dek: beat.detail },
  };
  const mapped = headlines[beat.id] ?? { headline: beat.headline, dek: beat.detail };
  return {
    id: beat.id,
    headline: mapped.headline,
    dek: mapped.dek ?? beat.detail,
    href: beat.href,
    priority: beat.priority,
  };
}

export function buildHeroCandidates(input: {
  beats: IntelligenceBeat[];
  isPreseason: boolean;
  opponentName?: string | null;
  rivalName?: string | null;
  hofHeadline?: string | null;
  week?: number;
}): BriefingHeroStory[] {
  const heroes: BriefingHeroStory[] = input.beats.map(heroFromBeat);

  if (input.opponentName) {
    heroes.push({
      id: "matchup-opponent",
      headline: input.rivalName ? "The Rivalry Returns" : `Face ${input.opponentName}`,
      dek: input.rivalName
        ? `You play ${input.opponentName} this week — the ${input.rivalName} rivalry is live again.`
        : `Your Week ${input.week ?? ""} matchup is ${input.opponentName}. The league is watching.`,
      href: "/rivalry-center",
      priority: 95,
    });
  }

  if (input.isPreseason) {
    heroes.push({
      id: "preseason-kickoff",
      headline: "The Draft Begins Soon",
      dek: input.hofHeadline ?? "Your league's history is loaded. This season writes the next chapter.",
      href: "/draft-war-room",
      priority: 88,
    });
  }

  if (input.week != null && input.week >= 14) {
    heroes.push({
      id: "championship-week",
      headline: "One Game Decides Your Legacy",
      dek: "Championship week is here. Every decision you've made leads to this moment.",
      href: "/championship-path",
      priority: 96,
    });
  }

  return heroes.sort((a, b) => b.priority - a.priority);
}

export function selectHeroStory(candidates: BriefingHeroStory[]): BriefingHeroStory {
  const seed = daySeed();
  const top = candidates.slice(0, Math.min(5, candidates.length));
  return pickByDay(top, seed) ?? {
    id: "fallback",
    headline: "Your League Has News Today",
    dek: "Connect your league history and check back for today's front-page story.",
    href: "/owner-profiles",
    priority: 0,
  };
}

export function buildHeadlineCandidates(beats: IntelligenceBeat[]): BriefingHeadline[] {
  return beats.map((b) => ({
    id: b.id,
    text: b.headline === b.detail ? b.detail : `${b.headline} — ${b.detail}`,
    category: beatToCategory(b),
    priority: b.priority,
    href: b.href,
  }));
}

export function selectTopHeadlines(candidates: BriefingHeadline[], show = 3): {
  visible: BriefingHeadline[];
  hiddenCount: number;
} {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const pool = sorted.length >= 6 ? sorted.slice(0, 6) : sorted;
  const seed = daySeed();
  const rotated = [...pool.slice(seed % pool.length), ...pool.slice(0, seed % pool.length)];
  const visible = rotated.slice(0, show);
  return { visible, hiddenCount: Math.max(0, pool.length - visible.length) };
}

export function buildQuoteOfTheWeek(input: {
  rivalName?: string | null;
  threatReason?: string | null;
  opponentName?: string | null;
  leagueName?: string;
}): string {
  const quotes: string[] = [];
  if (input.threatReason && input.rivalName) {
    quotes.push(`${input.rivalName} is still the name everyone whispers about in ${input.leagueName ?? "this league"}.`);
  }
  if (input.opponentName) {
    quotes.push(`"${input.opponentName} hasn't forgotten the last time these two met."`);
  }
  if (input.rivalName) {
    quotes.push(`"${input.rivalName} drafted another rookie. Nobody is surprised."`);
    quotes.push(`"The league still hasn't recovered from last year's playoff collapse — ask ${input.rivalName}."`);
  }
  quotes.push(`"${input.leagueName ?? "This league"} remembers everything. So do we."`);
  return pickByDay(quotes, daySeed()) ?? quotes[0]!;
}

export function buildEmotionalIdentity(input: {
  displayName: string;
  careerLine: string | null;
  titlesLine: string | null;
  rankLine: string | null;
  rivalName: string | null;
  threatName: string | null;
  threatLevel: string | null;
  winPct?: number | null;
}): BriefingIdentity {
  let reputation = "The Competitor";
  if (input.titlesLine && /[1-9]/.test(input.titlesLine)) reputation = "The Champion";
  else if (input.rankLine) {
    const rank = parseInt(input.rankLine.replace(/\D/g, ""), 10);
    if (rank <= 3) reputation = "The Contender";
    else if (rank >= 10) reputation = "The Rebuilder";
  } else if (input.winPct != null && input.winPct >= 55) reputation = "The Contender";

  const leagueSays =
    input.threatLevel === "high"
      ? "Never quits."
      : input.careerLine?.includes("50") || (input.winPct != null && input.winPct >= 48 && input.winPct <= 52)
        ? "Always in the mix."
        : "Plays the long game.";

  const knownFor = input.rivalName ? `The ${input.rivalName} rivalry.` : "Showing up every week.";

  const fearedBecause =
    input.threatName && input.threatLevel
      ? `${input.threatLevel} threat from ${input.threatName}.`
      : "Late-season comebacks.";

  return {
    displayName: input.displayName,
    reputation,
    leagueSays,
    knownFor,
    fearedBecause,
    careerLine: input.careerLine,
    titlesLine: input.titlesLine,
    rankLine: input.rankLine,
  };
}

export function buildRivalOfWeek(input: {
  opponentName?: string | null;
  opponentIsRival?: boolean;
  topRival?: {
    rivalName: string;
    heatLabel?: string | null;
    loreSentence?: string | null;
    h2hWins?: number;
    h2hLosses?: number;
    h2hTies?: number;
    playoffEliminations?: number;
    winStreak?: number;
  } | null;
  week?: number;
}): BriefingRivalWeek | null {
  const rival = input.topRival;
  if (!rival?.rivalName) return null;

  const name = input.opponentName && input.opponentIsRival ? input.opponentName : rival.rivalName;
  const whyNow: string[] = [];
  if (input.opponentName && name === input.opponentName) {
    whyNow.push(`You play ${input.opponentName} this week.`);
  }
  if ((rival.playoffEliminations ?? 0) > 0) {
    whyNow.push(`${name} eliminated you from the playoffs ${rival.playoffEliminations} time${rival.playoffEliminations === 1 ? "" : "s"}.`);
  }
  if ((rival.winStreak ?? 0) >= 3) {
    whyNow.push(`${name} has beaten you ${rival.winStreak} straight times.`);
  } else if (rival.h2hWins != null && rival.h2hLosses != null) {
    whyNow.push(`All-time series: ${rival.h2hWins}-${rival.h2hLosses}${rival.h2hTies ? `-${rival.h2hTies}` : ""}.`);
  }
  if (whyNow.length === 0) whyNow.push("The hottest rivalry in your league right now.");

  const h2hLine =
    rival.h2hWins != null && rival.h2hLosses != null
      ? `${rival.h2hWins}-${rival.h2hLosses}${rival.h2hTies ? `-${rival.h2hTies}` : ""} all-time`
      : null;

  return {
    name,
    heatLabel: rival.heatLabel ?? null,
    teaser: rival.loreSentence ?? null,
    whyNow,
    href: "/rivalry-center",
    h2hLine,
  };
}

export function buildWeekAdvantage(input: {
  beats: IntelligenceBeat[];
  opponentName?: string | null;
  hasRivalsAccess: boolean;
}): BriefingAdvantage {
  const title = input.opponentName
    ? `Beat ${input.opponentName}`
    : "This Week's Advantage";

  const actionBeats = input.beats
    .filter((b) => b.question === "whatToDo" || b.question === "whyItMatters")
    .sort((a, b) => b.priority - a.priority);

  const bullets = actionBeats.map((b) => b.detail).filter(Boolean);
  const fallback = [
    "Watch the trade wire — value moves fast this time of year.",
    "Review your rival's last three matchups before setting your lineup.",
    "Check waiver wire trends before Wednesday's run.",
  ];

  const all = bullets.length > 0 ? bullets : fallback;
  const visibleCount = input.hasRivalsAccess ? all.length : Math.min(2, all.length);

  return {
    title,
    bullets: all.slice(0, visibleCount),
    lockedBullets: input.hasRivalsAccess ? [] : all.slice(visibleCount),
  };
}

export function buildComingNext(input: {
  threatName?: string | null;
  hasRivalsAccess: boolean;
}): BriefingComingNext {
  if (input.hasRivalsAccess) {
    return { teaser: "You have full Rivals intelligence unlocked this week." };
  }
  const teasers = [
    input.threatName
      ? `${input.threatName} has accepted most trades after losses.`
      : "Your rivals' trade patterns after losses are mapped.",
    "Draft tendencies by round reveal who you're really playing against.",
    "Weekly scouting reports update every time your league syncs.",
  ];
  return { teaser: pickByDay(teasers, daySeed() + 1) ?? teasers[0]! };
}

export function buildGmBriefingEdition(input: {
  beats: IntelligenceBeat[];
  isPreseason: boolean;
  welcomeName: string;
  leagueName: string;
  week: number;
  seasonCount: number;
  rivalryCount: number;
  syncReady: boolean;
  opponentName?: string | null;
  rivalName?: string | null;
  threatName?: string | null;
  threatReason?: string | null;
  threatLevel?: string | null;
  hofHeadline?: string | null;
  displayName: string;
  careerLine: string | null;
  titlesLine: string | null;
  rankLine: string | null;
  winPct?: number | null;
  topRival?: Parameters<typeof buildRivalOfWeek>[0]["topRival"];
  opponentIsRival?: boolean;
  hasRivalsAccess: boolean;
}): GmBriefingEdition {
  const heroCandidates = buildHeroCandidates({
    beats: input.beats,
    isPreseason: input.isPreseason,
    opponentName: input.opponentName,
    rivalName: input.rivalName,
    hofHeadline: input.hofHeadline,
    week: input.week,
  });

  const headlineCandidates = buildHeadlineCandidates(input.beats);
  const { visible, hiddenCount } = selectTopHeadlines(headlineCandidates, 3);

  return {
    hero: selectHeroStory(heroCandidates),
    quote: buildQuoteOfTheWeek({
      rivalName: input.rivalName,
      threatReason: input.threatReason,
      opponentName: input.opponentName,
      leagueName: input.leagueName,
    }),
    headlines: visible,
    headlinesHiddenCount: hiddenCount,
    identity: buildEmotionalIdentity({
      displayName: input.displayName,
      careerLine: input.careerLine,
      titlesLine: input.titlesLine,
      rankLine: input.rankLine,
      rivalName: input.rivalName ?? null,
      threatName: input.threatName ?? null,
      threatLevel: input.threatLevel ?? null,
      winPct: input.winPct,
    }),
    rival: buildRivalOfWeek({
      opponentName: input.opponentName,
      opponentIsRival: input.opponentIsRival,
      topRival: input.topRival,
      week: input.week,
    }),
    advantage: buildWeekAdvantage({
      beats: input.beats,
      opponentName: input.opponentName,
      hasRivalsAccess: input.hasRivalsAccess,
    }),
    comingNext: buildComingNext({
      threatName: input.threatName,
      hasRivalsAccess: input.hasRivalsAccess,
    }),
  };
}

export function personalizationGreeting(_name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return "GOOD MORNING, COACH";
  if (hour < 17) return "GOOD AFTERNOON, COACH";
  return "GOOD EVENING, COACH";
}

export function personalizationMeta(input: {
  leagueName: string;
  weekLabel: string;
  seasonCount: number;
  rivalryCount: number;
  syncReady: boolean;
}): string {
  const sync = input.syncReady ? "Ready" : "Sync needed";
  const seasons = `${input.seasonCount} Season${input.seasonCount === 1 ? "" : "s"}`;
  const rivalries =
    input.rivalryCount > 0
      ? `${input.rivalryCount} Rivalr${input.rivalryCount === 1 ? "y" : "ies"}`
      : "Rivalries loading";
  return `${input.leagueName} · ${input.weekLabel} · ${seasons} · ${rivalries} · ${sync}`;
}
