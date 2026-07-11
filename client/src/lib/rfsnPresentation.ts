/**
 * RFSN draft broadcast presentation — static fixtures and view-state helpers.
 * Frontend-only; no server contracts or live endpoints.
 */

export type RfsnSignificance = "routine" | "notable" | "major" | "historic";

export type RfsnCommentatorId = "sofia" | "coach" | "roxanne";

export type RfsnBroadcastPhase =
  | "idle"
  | "pick_locked"
  | "board_updated"
  | "beat"
  | "primary_in"
  | "secondary_in"
  | "exiting";

export type RfsnCommentaryCard = {
  id: string;
  commentator: RfsnCommentatorId;
  label: string;
  text: string;
  long?: boolean;
};

export type RfsnDraftPickRow = {
  rank: number;
  player: string;
  position: "QB" | "RB" | "WR" | "TE" | "K" | "DST";
  team: string;
  bye: number;
  adp: number;
  isOnClock?: boolean;
};

export type RfsnOrderSlot = {
  pickLabel: string;
  teamName: string;
  teamAbbr: string;
  isOnClock?: boolean;
  isComplete?: boolean;
};

export type RfsnTickerItem = {
  id: string;
  commentator: RfsnCommentatorId;
  text: string;
};

export type RfsnQueuedMoment = {
  id: string;
  significance: RfsnSignificance;
  primary: RfsnCommentaryCard;
  secondary?: RfsnCommentaryCard;
  breakingNews?: { headline: string; body: string };
  positionRun?: { count: number; position: string };
  leagueStoryline?: { title: string; body: string };
};

export type RfsnBroadcastSnapshot = {
  round: number;
  pickInRound: number;
  overallPick: string;
  onClockTeam: string;
  clockSeconds: number;
  draftOrder: RfsnOrderSlot[];
  board: RfsnDraftPickRow[];
  significance: RfsnSignificance;
  /** Optional subtle meter fill 0–1; labels work without it */
  momentMeter?: number;
  primary?: RfsnCommentaryCard;
  secondary?: RfsnCommentaryCard;
  breakingNews?: { headline: string; body: string; playerImage?: string };
  positionRun?: { count: number; position: string };
  leagueStoryline?: { title: string; body: string };
  championshipOdds: { team: string; pct: number }[];
  ticker: RfsnTickerItem[];
  queue: RfsnQueuedMoment[];
};

export const SIGNIFICANCE_LABELS: Record<RfsnSignificance, string> = {
  routine: "Routine",
  notable: "Notable",
  major: "Major",
  historic: "Historic",
};

export function significanceLabel(level: RfsnSignificance): string {
  return SIGNIFICANCE_LABELS[level];
}

export const COMMENTATOR_META: Record<
  RfsnCommentatorId,
  { displayName: string; role: string; accentClass: string; borderClass: string; bgClass: string }
> = {
  sofia: {
    displayName: "Sofia",
    role: "Lead Analyst",
    accentClass: "text-sky-400",
    borderClass: "border-sky-500/50",
    bgClass: "bg-sky-500/10",
  },
  coach: {
    displayName: "Coach",
    role: "Roster Construction",
    accentClass: "text-amber-400",
    borderClass: "border-amber-500/50",
    bgClass: "bg-amber-500/10",
  },
  roxanne: {
    displayName: "Roxanne",
    role: "Debate & Receipts",
    accentClass: "text-fuchsia-400",
    borderClass: "border-fuchsia-500/50",
    bgClass: "bg-fuchsia-500/10",
  },
};

const BASE_ORDER: RfsnOrderSlot[] = [
  { pickLabel: "5.01", teamName: "Team Bruce", teamAbbr: "BRU", isComplete: true },
  { pickLabel: "5.02", teamName: "Team Dave", teamAbbr: "DAV", isComplete: true },
  { pickLabel: "5.03", teamName: "Team Rod", teamAbbr: "ROD", isComplete: true },
  { pickLabel: "5.04", teamName: "Team Mike", teamAbbr: "MIK", isOnClock: true },
  { pickLabel: "5.05", teamName: "Team Tom", teamAbbr: "TOM" },
  { pickLabel: "5.06", teamName: "Team Jen", teamAbbr: "JEN" },
  { pickLabel: "5.07", teamName: "Team Pat", teamAbbr: "PAT" },
  { pickLabel: "5.08", teamName: "Team Sam", teamAbbr: "SAM" },
  { pickLabel: "5.09", teamName: "Team Lee", teamAbbr: "LEE" },
  { pickLabel: "5.10", teamName: "Team Kai", teamAbbr: "KAI" },
];

const BASE_BOARD: RfsnDraftPickRow[] = [
  { rank: 1, player: "C. McCaffrey", position: "RB", team: "SF", bye: 9, adp: 1.2 },
  { rank: 2, player: "B. Hall", position: "RB", team: "NYJ", bye: 12, adp: 2.1 },
  { rank: 3, player: "T. Hill", position: "WR", team: "MIA", bye: 6, adp: 3.4 },
  { rank: 4, player: "J. Jefferson", position: "WR", team: "MIN", bye: 6, adp: 4.0 },
  { rank: 5, player: "J. Gibbs", position: "RB", team: "DET", bye: 5, adp: 5.1, isOnClock: true },
  { rank: 6, player: "C. Lamb", position: "WR", team: "DAL", bye: 7, adp: 6.3 },
  { rank: 7, player: "T. McBride", position: "TE", team: "ARI", bye: 11, adp: 7.8 },
  { rank: 8, player: "J. Allen", position: "QB", team: "BUF", bye: 12, adp: 8.2 },
];

const BASE_ODDS = [
  { team: "Team Rod", pct: 28 },
  { team: "Team Bruce", pct: 24 },
  { team: "Team Mike", pct: 19 },
  { team: "Team Dave", pct: 14 },
];

function baseSnapshot(overrides: Partial<RfsnBroadcastSnapshot> = {}): RfsnBroadcastSnapshot {
  return {
    round: 5,
    pickInRound: 4,
    overallPick: "4.05",
    onClockTeam: "Team Mike",
    clockSeconds: 48,
    draftOrder: BASE_ORDER,
    board: BASE_BOARD,
    significance: "notable",
    momentMeter: 0.55,
    championshipOdds: BASE_ODDS,
    ticker: [],
    queue: [],
    ...overrides,
  };
}

export type RfsnFixtureScenario =
  | "routine_pick"
  | "notable_pick"
  | "major_pick"
  | "historic_pick"
  | "position_run"
  | "league_storyline"
  | "commentary_queued"
  | "long_commentary"
  | "mobile_narrow";

export function fixtureForScenario(scenario: RfsnFixtureScenario): RfsnBroadcastSnapshot {
  switch (scenario) {
    case "routine_pick":
      return baseSnapshot({
        significance: "routine",
        momentMeter: 0.15,
        primary: undefined,
        secondary: undefined,
        ticker: [{ id: "t1", commentator: "coach", text: "Clock moving — nothing wild yet." }],
      });

    case "notable_pick":
      return baseSnapshot({
        significance: "notable",
        momentMeter: 0.55,
        primary: {
          id: "p1",
          commentator: "sofia",
          label: "History Check",
          text: "This is the latest Mike has ever drafted a running back. His previous latest? Round 3 in 2021.",
        },
        ticker: [],
      });

    case "major_pick":
      return baseSnapshot({
        significance: "major",
        momentMeter: 0.78,
        primary: {
          id: "p1",
          commentator: "sofia",
          label: "League Context",
          text: "Mike takes Gibbs at 4.05 — three spots above ADP. The room is reacting.",
        },
        secondary: {
          id: "s1",
          commentator: "coach",
          label: "Roster Construction",
          text: "I like Gibbs. Explosive. But Mike is already thin at WR...",
        },
        ticker: [
          { id: "t1", commentator: "roxanne", text: "Screenshotted." },
        ],
      });

    case "historic_pick":
      return baseSnapshot({
        significance: "historic",
        momentMeter: 1,
        breakingNews: {
          headline: "EARLIEST TE EVER!",
          body: "Trey McBride becomes the earliest tight end selected in league history at 4.05.",
        },
        primary: {
          id: "p1",
          commentator: "sofia",
          label: "History Check",
          text: "League records show no tight end before Round 6 in 14 seasons of data.",
        },
        secondary: {
          id: "s1",
          commentator: "roxanne",
          label: "Receipt Alert",
          text: "Did Mike just hand Rod the championship? I'm just asking questions.",
        },
        ticker: [
          { id: "t1", commentator: "coach", text: "I don't love reaching this early." },
          { id: "t2", commentator: "sofia", text: "Let's see how this ages." },
        ],
      });

    case "position_run":
      return baseSnapshot({
        significance: "major",
        momentMeter: 0.7,
        positionRun: { count: 6, position: "RB" },
        primary: {
          id: "p1",
          commentator: "coach",
          label: "Coach's Clipboard",
          text: "Six running backs in the last nine picks. Wide receivers are about to spike.",
        },
        ticker: [{ id: "t1", commentator: "roxanne", text: "The run is real." }],
      });

    case "league_storyline":
      return baseSnapshot({
        significance: "notable",
        leagueStoryline: {
          title: "Mike's RB Roulette",
          body: "Mike has drafted a RB in rounds 1–3 for five straight years. This pick breaks the pattern.",
        },
        primary: {
          id: "p1",
          commentator: "sofia",
          label: "League Context",
          text: "The storyline entering tonight was whether Mike would finally pivot to receiver-heavy.",
        },
        ticker: [],
      });

    case "commentary_queued":
      return baseSnapshot({
        significance: "notable",
        primary: {
          id: "p1",
          commentator: "sofia",
          label: "History Check",
          text: "Mike locks Gibbs while we still have a queued moment from the prior pick.",
        },
        queue: [
          {
            id: "q1",
            significance: "major",
            primary: {
              id: "qp1",
              commentator: "roxanne",
              label: "Hot Take",
              text: "Rod's stack just got scarier — we'll get to that after this pick.",
            },
          },
        ],
        ticker: [{ id: "t1", commentator: "coach", text: "Queue it — don't stack cards." }],
      });

    case "long_commentary":
      return baseSnapshot({
        significance: "major",
        momentMeter: 0.72,
        primary: {
          id: "p1",
          commentator: "sofia",
          label: "History Check",
          long: true,
          text: "Mike's roster construction history shows a clear preference for anchor running backs in the first five rounds, but his championship seasons correlate with mid-round receiver value. This pick continues the trend he's tried to break since 2022, when he finished third despite a league-winning WR corps.",
        },
        secondary: {
          id: "s1",
          commentator: "coach",
          label: "Roster Construction",
          text: "Thin at WR still.",
        },
      });

    case "mobile_narrow":
      return fixtureForScenario("major_pick");
  }
}

/** Enforce at most one primary and one secondary on screen */
export function resolveOnAirCommentary(snapshot: RfsnBroadcastSnapshot): {
  primary: RfsnCommentaryCard | null;
  secondary: RfsnCommentaryCard | null;
} {
  return {
    primary: snapshot.primary ?? null,
    secondary: snapshot.primary ? (snapshot.secondary ?? null) : null,
  };
}

export function shouldShowMomentBanner(snapshot: RfsnBroadcastSnapshot): boolean {
  return snapshot.significance !== "routine";
}

export function shouldShowBreakingNews(snapshot: RfsnBroadcastSnapshot): boolean {
  return Boolean(snapshot.breakingNews) || snapshot.significance === "historic";
}

export type RfsnContextGraphicKind = "breaking_news" | "position_run" | "league_storyline" | "none";

export type RfsnContextGraphicState = {
  /** At most one prominent broadcast graphic — never a dashboard grid */
  prominent: RfsnContextGraphicKind;
  /** Quiet championship odds strip; always available but visually subdued */
  showQuietOdds: boolean;
};

/**
 * TV-style graphic selection: one active feature, quiet odds underneath.
 * Breaking news overrides position run and storyline widgets.
 */
export function resolveContextGraphic(snapshot: RfsnBroadcastSnapshot): RfsnContextGraphicState {
  if (shouldShowBreakingNews(snapshot) && snapshot.breakingNews) {
    return { prominent: "breaking_news", showQuietOdds: true };
  }
  if (snapshot.positionRun) {
    return { prominent: "position_run", showQuietOdds: true };
  }
  if (snapshot.leagueStoryline) {
    return { prominent: "league_storyline", showQuietOdds: true };
  }
  return { prominent: "none", showQuietOdds: true };
}

export type RfsnLayoutMode = "desktop" | "mobile";

export function resolveLayoutMode(viewportWidth: number): RfsnLayoutMode {
  return viewportWidth < 768 ? "mobile" : "desktop";
}

export const RFSN_SHELL_CLASS = "min-h-screen bg-[#07070c] text-foreground overflow-x-hidden";

export const RFSN_PHASE_BEAT_MS = 400;
export const RFSN_PHASE_PRIMARY_MS = 600;
export const RFSN_PHASE_SECONDARY_MS = 500;

export function nextBroadcastPhase(
  phase: RfsnBroadcastPhase,
  hasSecondary: boolean,
): RfsnBroadcastPhase {
  switch (phase) {
    case "idle":
      return "pick_locked";
    case "pick_locked":
      return "board_updated";
    case "board_updated":
      return "beat";
    case "beat":
      return "primary_in";
    case "primary_in":
      return hasSecondary ? "secondary_in" : "exiting";
    case "secondary_in":
      return "exiting";
    case "exiting":
      return "idle";
    default:
      return "idle";
  }
}

export function commentaryVisibleForPhase(
  phase: RfsnBroadcastPhase,
  slot: "primary" | "secondary",
): boolean {
  if (slot === "primary") {
    return phase === "primary_in" || phase === "secondary_in" || phase === "exiting";
  }
  return phase === "secondary_in" || phase === "exiting";
}

export function dequeueNextMoment(queue: RfsnQueuedMoment[]): {
  next: RfsnQueuedMoment | null;
  remaining: RfsnQueuedMoment[];
} {
  if (queue.length === 0) return { next: null, remaining: [] };
  const [next, ...remaining] = queue;
  return { next: next ?? null, remaining };
}

export function applyQueuedMoment(
  snapshot: RfsnBroadcastSnapshot,
  moment: RfsnQueuedMoment,
): RfsnBroadcastSnapshot {
  return {
    ...snapshot,
    significance: moment.significance,
    primary: moment.primary,
    secondary: moment.secondary,
    breakingNews: moment.breakingNews,
    positionRun: moment.positionRun,
    leagueStoryline: moment.leagueStoryline,
  };
}

export const FIXTURE_SCENARIO_LABELS: Record<RfsnFixtureScenario, string> = {
  routine_pick: "Routine pick — no commentator",
  notable_pick: "Notable pick — primary only",
  major_pick: "Major pick — primary + reaction",
  historic_pick: "Historic pick — breaking news",
  position_run: "Position run alert",
  league_storyline: "League storyline",
  commentary_queued: "Queued while next pick begins",
  long_commentary: "Long commentary text",
  mobile_narrow: "Mobile / narrow layout",
};
