import { V1, type IntelligenceBeatFamily, type IntelligenceBeatId } from "@/lib/v1Copy";

export type CoachQuestion = "whatChanged" | "whyItMatters" | "whatToDo" | "whereToGo";

export type IntelligenceBeat = {
  id: IntelligenceBeatId;
  family: IntelligenceBeatFamily;
  label: string;
  question: CoachQuestion;
  headline: string;
  detail: string;
  cta: string;
  href: string;
  priority: number;
  knowRivalsOrSelf: boolean;
};

export type BriefingAction = {
  label: string;
  href: string;
  beatId: IntelligenceBeatId;
};

export type ExecutiveBriefing = {
  paragraph: string;
  action: BriefingAction;
};

const BEAT_LABEL: Record<IntelligenceBeatId, string> = {
  rivalThreat: V1.home.beats.rivalThreat,
  yourPattern: V1.home.beats.yourPattern,
  leagueShift: V1.home.beats.leagueShift,
  tradeWindow: V1.home.beats.tradeWindow,
  playoffPath: V1.home.beats.playoffPath,
  draftPrep: V1.home.beats.draftPrep,
  acquisitionImpact: V1.home.beats.acquisitionImpact,
  hofMilestone: V1.home.beats.hofMilestone,
};

function isTradeDeadlineWeek(week: number): boolean {
  return week >= 9 && week <= 11;
}

export function detectSeasonPhase(input: {
  season: number;
  pulseWeek: number | undefined;
  pulseComplete: boolean;
  pulseReady: boolean;
}): { isInSeason: boolean; isPreseason: boolean } {
  const calendarYear = new Date().getFullYear();
  const week = input.pulseWeek ?? 0;
  const seasonStarted =
    input.pulseReady &&
    typeof input.pulseWeek === "number" &&
    week >= 1 &&
    !input.pulseComplete;
  const isPreseason =
    input.season === calendarYear && input.pulseReady && !input.pulseComplete && !seasonStarted;
  return { isInSeason: seasonStarted, isPreseason };
}

export function buildIntelligenceBeatCandidates(input: {
  isPreseason: boolean;
  week: number;
  ownerHome: {
    rival?: { rivalName?: string | null; heatLabel?: string | null } | null;
    threat?: { primary?: { ownerName?: string; threatLevel?: string; reason?: string } | null; note?: string | null } | null;
    careerRecord?: { winPct?: number; seasonsActive?: number } | null;
    championships?: { count?: number } | null;
  } | null | undefined;
  topRival?: { rivalName?: string; loreSentence?: string; heatLabel?: string } | null;
  dynastyLine?: string | null;
  draftMemo?: string | null;
  playoffOutlook?: string | null;
  recentTradeCount?: number;
  hofHeadline?: string | null;
  acquisitionHeadline?: string | null;
}): IntelligenceBeat[] {
  const beats: IntelligenceBeat[] = [];
  const oh = input.ownerHome;

  if (oh?.threat?.primary?.ownerName || input.topRival?.rivalName) {
    const name = oh?.threat?.primary?.ownerName ?? input.topRival?.rivalName ?? "Your rival";
    beats.push({
      id: "rivalThreat",
      family: "rivals",
      label: BEAT_LABEL.rivalThreat,
      question: "whyItMatters",
      headline: `${name} is the pressure point`,
      detail:
        oh?.threat?.primary?.reason ??
        input.topRival?.loreSentence ??
        "Your hottest rivalry sets the emotional stakes this week.",
      cta: `Open ${V1.features.rivalries}`,
      href: "/rivalry-center",
      priority: input.isPreseason ? 88 : 95,
      knowRivalsOrSelf: true,
    });
  }

  if (oh?.careerRecord || oh?.championships) {
    const titles = oh?.championships?.count ?? 0;
    const wp = oh?.careerRecord?.winPct;
    beats.push({
      id: "yourPattern",
      family: "self",
      label: BEAT_LABEL.yourPattern,
      question: "whatChanged",
      headline: titles > 0 ? `${titles} title${titles === 1 ? "" : "s"} on your ledger` : "Your GM pattern is taking shape",
      detail:
        wp != null
          ? `${Number(wp).toFixed(1)}% career win rate across ${oh?.careerRecord?.seasonsActive ?? "—"} seasons.`
          : "Your draft and trade tendencies define how opponents game-plan you.",
      cta: `Open ${V1.features.myGmProfile}`,
      href: "/owner-profiles",
      priority: input.isPreseason ? 96 : 82,
      knowRivalsOrSelf: true,
    });
  }

  if (input.dynastyLine) {
    beats.push({
      id: "leagueShift",
      family: "league",
      label: BEAT_LABEL.leagueShift,
      question: "whatChanged",
      headline: "The league identity is shifting",
      detail: input.dynastyLine,
      cta: `See ${V1.features.powerRankings}`,
      href: "/dynasty-power-rankings",
      priority: 78,
      knowRivalsOrSelf: false,
    });
  }

  if ((input.recentTradeCount ?? 0) > 0 || isTradeDeadlineWeek(input.week)) {
    beats.push({
      id: "tradeWindow",
      family: "trades",
      label: BEAT_LABEL.tradeWindow,
      question: "whatToDo",
      headline: isTradeDeadlineWeek(input.week) ? "Trade deadline pressure is live" : "The trade window is active",
      detail:
        (input.recentTradeCount ?? 0) > 0
          ? `${input.recentTradeCount} recent league moves — value is moving now.`
          : "This is the stretch where roster moves reshape the standings.",
      cta: `Open ${V1.features.tradeIntelligence}`,
      href: "/trades",
      priority: isTradeDeadlineWeek(input.week) ? 100 : 70,
      knowRivalsOrSelf: false,
    });
  }

  if (input.playoffOutlook && !input.isPreseason) {
    beats.push({
      id: "playoffPath",
      family: "playoff",
      label: BEAT_LABEL.playoffPath,
      question: "whyItMatters",
      headline: "Your playoff path is narrowing",
      detail: input.playoffOutlook,
      cta: `Open ${V1.features.whyHaventIWon}`,
      href: "/championship-diagnosis",
      priority: 84,
      knowRivalsOrSelf: true,
    });
  }

  if (input.draftMemo) {
    beats.push({
      id: "draftPrep",
      family: "draft",
      label: BEAT_LABEL.draftPrep,
      question: "whatToDo",
      headline: "Draft prep is the move",
      detail: input.draftMemo,
      cta: `Open ${V1.features.draftWarRoom}`,
      href: "/draft-war-room",
      priority: input.isPreseason ? 92 : 65,
      knowRivalsOrSelf: false,
    });
  }

  if (input.acquisitionHeadline) {
    beats.push({
      id: "acquisitionImpact",
      family: "acquisition",
      label: BEAT_LABEL.acquisitionImpact,
      question: "whatChanged",
      headline: "Recent adds changed the board",
      detail: input.acquisitionHeadline,
      cta: `Open ${V1.features.acquisitionImpact}`,
      href: "/acquisition-impact",
      priority: 68,
      knowRivalsOrSelf: false,
    });
  }

  if (input.hofHeadline) {
    beats.push({
      id: "hofMilestone",
      family: "history",
      label: BEAT_LABEL.hofMilestone,
      question: "whereToGo",
      headline: "Legacy milestone on the record",
      detail: input.hofHeadline,
      cta: `Open ${V1.features.hallOfFame}`,
      href: "/hall-of-fame",
      priority: input.isPreseason ? 90 : 60,
      knowRivalsOrSelf: false,
    });
  }

  return beats;
}

export function selectIntelligenceTrio(
  candidates: IntelligenceBeat[],
  briefingAction: BriefingAction,
  isPreseason: boolean,
): IntelligenceBeat[] {
  if (candidates.length === 0) return [];

  const byId = new Map(candidates.map((b) => [b.id, b]));
  const usedFamilies = new Set<IntelligenceBeatFamily>();
  const picked: IntelligenceBeat[] = [];

  const slot1 = byId.get(briefingAction.beatId);
  if (slot1) {
    picked.push(slot1);
    usedFamilies.add(slot1.family);
  }

  const pool = [...candidates]
    .filter((b) => !picked.some((p) => p.id === b.id))
    .sort((a, b) => b.priority - a.priority);

  if (isPreseason) {
    const prefer = ["hofMilestone", "yourPattern", "rivalThreat", "draftPrep"] as IntelligenceBeatId[];
    for (const id of prefer) {
      if (picked.length >= 3) break;
      const beat = byId.get(id);
      if (!beat || usedFamilies.has(beat.family) || picked.some((p) => p.id === beat.id)) continue;
      picked.push(beat);
      usedFamilies.add(beat.family);
    }
  }

  for (const beat of pool) {
    if (picked.length >= 3) break;
    if (usedFamilies.has(beat.family)) continue;
    picked.push(beat);
    usedFamilies.add(beat.family);
  }

  if (!picked.some((b) => b.knowRivalsOrSelf)) {
    const fallback = pool.find((b) => b.knowRivalsOrSelf && !picked.some((p) => p.id === b.id));
    if (fallback && picked.length >= 3) {
      picked[2] = fallback;
    } else if (fallback) {
      picked.push(fallback);
    }
  }

  return picked.slice(0, 3);
}

export function buildExecutiveBriefing(input: {
  isPreseason: boolean;
  isInSeason: boolean;
  welcomeName: string;
  weekLabel: string;
  week?: number;
  opponentName?: string | null;
  rivalName?: string | null;
  threatName?: string | null;
  dynastyLine?: string | null;
  draftMemo?: string | null;
  hofHeadline?: string | null;
  candidates: IntelligenceBeat[];
}): ExecutiveBriefing {
  const sorted = [...input.candidates].sort((a, b) => b.priority - a.priority);
  const tradeWindowBeat = sorted.find((b) => b.id === "tradeWindow");
  const forceTradeWindow =
    input.isInSeason && isTradeDeadlineWeek(input.week ?? 0) && tradeWindowBeat != null;
  const top = forceTradeWindow ? tradeWindowBeat! : sorted[0];
  const second = sorted.find((b) => b.id !== top?.id);

  let paragraph: string;
  let action: BriefingAction;

  if (input.isPreseason) {
    const memory = input.hofHeadline ?? "Your league's long memory is loaded and ready.";
    const pattern = input.rivalName
      ? `${input.rivalName} is the rivalry that will define your season.`
      : "Your GM profile and rivalries are the story before kickoff.";
    paragraph = `${input.welcomeName}, preseason mode: ${memory} ${pattern}`;
    action = {
      label: top?.cta ?? `Open ${V1.features.myGmProfile}`,
      href: top?.href ?? "/owner-profiles",
      beatId: top?.id ?? "yourPattern",
    };
  } else if (input.opponentName) {
    paragraph = `${input.welcomeName}, ${input.weekLabel.toLowerCase()}: you draw ${input.opponentName}${
      input.rivalName ? ` — a ${input.rivalName} rivalry angle` : ""
    }. ${input.threatName ? `${input.threatName} remains the bigger threat.` : ""} ${
      input.dynastyLine ?? "The league landscape keeps shifting."
    }`.replace(/\s+/g, " ").trim();
    action = {
      label: top?.cta ?? `Review ${V1.features.matchups}`,
      href: top?.href ?? "/matchups",
      beatId: top?.id ?? "rivalThreat",
    };
  } else {
    paragraph = `${input.welcomeName}, ${input.weekLabel.toLowerCase()}: ${
      input.dynastyLine ?? "Your league story continues."
    } ${second?.detail ?? ""}`.replace(/\s+/g, " ").trim();
    action = {
      label: top?.cta ?? `Open ${V1.features.myGmProfile}`,
      href: top?.href ?? "/owner-profiles",
      beatId: top?.id ?? "yourPattern",
    };
  }

  return { paragraph, action };
}

export function stateOfTheWeekLine(input: {
  isPreseason: boolean;
  isInSeason: boolean;
  weekLabel: string;
  leagueName: string;
}): string {
  if (input.isPreseason) {
    return `${input.leagueName} · Preseason`;
  }
  if (input.isInSeason) {
    return `${input.leagueName} · ${input.weekLabel}`;
  }
  return `${input.leagueName} · ${input.weekLabel}`;
}

export function thisWeekInHistoryLine(timeline: Array<{ season: number; label: string }>, currentSeason: number): string | null {
  if (timeline.length === 0) return null;
  const past = timeline.filter((t) => t.season < currentSeason);
  const row = past[past.length - 1] ?? timeline[timeline.length - 1];
  if (!row) return null;
  return `${row.season}: ${row.label} took the title — your league's last chapter before this season.`;
}
