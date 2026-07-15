import type { CommentaryLevel, SofiaCommentary } from "../../../server/services/sofia/sofiaContract";

export type { CommentaryLevel, SofiaCommentary };

export const SOFIA_FEED_CONTAINER_CLASS =
  "mx-auto w-full max-w-[52rem] space-y-4 overflow-x-hidden px-1";

export const LEVEL_LABELS: Record<CommentaryLevel, string> = {
  routine: "Routine",
  notable: "Notable",
  major: "Major",
  historic: "Historic",
};

export function levelLabel(level: CommentaryLevel): string {
  return LEVEL_LABELS[level];
}

/** Human-readable storyline label — contract values only, no invented copy. */
export function formatStorylineLabel(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Newest pick first — mock review reads like a live recap stack. */
export function sortCommentaryNewestFirst(items: SofiaCommentary[]): SofiaCommentary[] {
  return [...items].sort((a, b) => b.subject.overallPick - a.subject.overallPick);
}

export function buildSofiaShareText(item: SofiaCommentary): string {
  const storyline = formatStorylineLabel(item.primaryStoryline);
  const level = levelLabel(item.level);
  const header = storyline ? `${level} · ${storyline}` : level;
  return `Sofia — Fantasy Football Rivals\n\n${header}\n\n${item.text}`;
}

export function isGroundedCommentary(item: SofiaCommentary): boolean {
  return item.validation.grounded === true;
}

/** Presentation model for moment cards — keeps card markup thin and testable. */
export function getMomentCardDisplay(commentary: SofiaCommentary) {
  return {
    level: levelLabel(commentary.level),
    ownerName: commentary.subject.ownerName,
    playerLine: `${commentary.subject.playerName} · ${commentary.subject.position}`,
    pickLine: `Round ${commentary.subject.round} · Pick ${commentary.subject.overallPick}`,
    storyline: formatStorylineLabel(commentary.primaryStoryline),
    text: commentary.text,
    verified: isGroundedCommentary(commentary),
    showShare: isGroundedCommentary(commentary),
  };
}

export function mapSofiaErrorCopy(message: string | undefined): {
  title: string;
  body: string;
  showLeagueSwitch: boolean;
  showDraftWarRoom: boolean;
} {
  const normalized = (message ?? "").toLowerCase();
  if (normalized.includes("draft war room")) {
    return {
      title: "No commentary for this season",
      body: "There is no draft commentary for the selected season yet. Run a mock draft in Draft War Room to generate Sofia commentary.",
      showLeagueSwitch: false,
      showDraftWarRoom: true,
    };
  }
  if (normalized.includes("active league")) {
    return {
      title: "Switch to your active league",
      body: "Sofia's commentary follows your active league. Use the league switcher or Connected Leagues, then return here.",
      showLeagueSwitch: true,
      showDraftWarRoom: false,
    };
  }
  if (normalized.includes("unavailable")) {
    return {
      title: "No commentary for this season",
      body: "There is no draft commentary for the selected season yet. Run a mock draft in Draft War Room to generate Sofia commentary.",
      showLeagueSwitch: false,
      showDraftWarRoom: true,
    };
  }
  return {
    title: "Couldn't load commentary",
    body: "Something went wrong loading Sofia's draft commentary. Please try again.",
    showLeagueSwitch: false,
    showDraftWarRoom: false,
  };
}

export type DraftCommentaryViewState =
  | "loading_gate"
  | "setup_incomplete"
  | "no_active_league"
  | "loading_commentary"
  | "error"
  | "empty"
  | "ready";

export function resolveDraftCommentaryViewState(args: {
  gateLoading: boolean;
  profile: { isSetupComplete?: boolean } | null | undefined;
  activeLeagueId: string | null | undefined;
  commentaryLoading: boolean;
  commentaryError: boolean;
  commentary: SofiaCommentary[] | undefined;
}): DraftCommentaryViewState {
  if (args.gateLoading) return "loading_gate";
  if (args.profile && args.profile.isSetupComplete === false) return "setup_incomplete";
  if (!args.activeLeagueId) return "no_active_league";
  if (args.commentaryLoading) return "loading_commentary";
  if (args.commentaryError) return "error";
  if (!args.commentary || args.commentary.length === 0) return "empty";
  return "ready";
}

/** Never expose generation source in UI copy. */
export function containsForbiddenModelTerms(text: string): boolean {
  const lower = text.toLowerCase();
  const banned = [
    "deepseek",
    "qwen",
    "template",
    "llm",
    "fabrication",
    "grounding",
    "prompt",
    "openai",
    "anthropic",
  ];
  return banned.some((term) => lower.includes(term));
}
