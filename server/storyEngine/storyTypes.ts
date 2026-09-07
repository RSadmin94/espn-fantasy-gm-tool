/**
 * storyEngine/storyTypes.ts
 * ─────────────────────────
 * RFSN Story Engine — canonical types + tunable config.
 *
 * The engine turns isolated moments into long-lived stories that BEGIN, GROW,
 * COOL OFF, RESOLVE and RETIRE, persisting across weeks and seasons. This file
 * defines the persisted Story shape, the deterministic fact contract the
 * detectors read, and the config constants that govern the lifecycle.
 *
 * No LLM. No network. No routing changes. Pure data + rules.
 */

/** The 10 story types implemented in this first production engine. */
export type StoryType =
  | "dynasty"
  | "rise"
  | "collapse"
  | "redemption"
  | "rivalry"
  | "trade_saga"
  | "reach"
  | "steal"
  | "championship_chase"
  | "historic_season";

/** Lifecycle status. emerging → active → (cooling → background) ; resolved → retired. */
export type StoryStatus =
  | "emerging"
  | "active"
  | "background"
  | "cooling"
  | "resolved"
  | "retired";

/** A single evidence receipt. Every claim a story makes must trace to one of these. */
export interface SupportingFact {
  /** machine tag, e.g. "titles", "record", "h2h", "improvement". */
  kind: string;
  /** human-readable receipt, e.g. "3 titles (2019, 2023, 2025)". */
  text: string;
  season?: number;
  value?: number;
}

/**
 * A persisted story. Field set is the canonical Story Engine contract.
 * Times are epoch-ms numbers in the pure engine; the store maps them to DB
 * timestamps. confidence is 0..1 in the engine; the store maps it to 0..100.
 */
export interface Story {
  storyId: string;
  storyType: StoryType;
  leagueId: string;
  /** ownersInvolved — canonical owner keys, sorted (drives the dedup id). */
  owners: string[];
  /** display names aligned to `owners` (convenience for consumers). */
  ownerDisplay: string[];
  /** 0..100. */
  priority: number;
  status: StoryStatus;
  /** epoch ms. */
  createdAt: number;
  /** epoch ms, or null if never surfaced in a broadcast yet. */
  lastMentioned: number | null;
  mentionCount: number;
  /** 0..1. */
  confidence: number;
  /** set when the arc pays off; null while ongoing. */
  resolution: string | null;
  /** epoch ms — story retires if it passes expiry without being re-detected. */
  expiry: number;
  supportingFacts: SupportingFact[];
  /** short, color-free claim used as the story's label. */
  headline: string;
  /** epoch ms of the last detection cycle that re-confirmed this story. */
  lastDetectedAt: number;
}

/**
 * A detector's output for one candidate story, BEFORE ledger reconciliation.
 * The ledger converts this into a new Story or merges it into an existing one.
 */
export interface DetectedStory {
  storyType: StoryType;
  owners: string[];
  ownerDisplay: string[];
  headline: string;
  /** base priority 0..100 for this detection. */
  priority: number;
  /** base confidence 0..1 for this detection. */
  confidence: number;
  supportingFacts: SupportingFact[];
  /** if present, this detection RESOLVES the story (arc paid off). */
  resolution?: string | null;
}

// ─── Deterministic fact contract (the ONLY input detectors read) ───────────────

export interface OwnerSeasonRecord {
  season: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  finalStanding: number | null;
  playoffSeed: number | null;
  madePlayoffs: boolean;
}

export interface OwnerFacts {
  /** canonical owner key (teams.ownerId-based per ARCHITECTURE §9.1). */
  ownerKey: string;
  displayName: string;
  /** ascending by season. */
  seasons: OwnerSeasonRecord[];
  /** championship seasons (from ChampionshipAuthority per §9.2). */
  titleSeasons: number[];
  totalTitles: number;
}

export interface RivalryFacts {
  ownerA: string;
  ownerB: string;
  displayA: string;
  displayB: string;
  games: number;
  winsA: number;
  winsB: number;
  ties: number;
  playoffGames: number;
  lastMeetingSeason: number | null;
  streakType: "W" | "L" | "T" | "none";
  streakCount: number;
}

export interface TradeSagaFacts {
  ownerA: string;
  ownerB: string;
  displayA: string;
  displayB: string;
  tradeCount: number;
  lastTradeSeason: number | null;
}

export interface DraftPickFact {
  season: number;
  ownerKey: string;
  displayName: string;
  playerName: string;
  overallPick: number;
  /** expected/consensus slot; reach = picked well before, steal = fell well after. */
  expectedPick: number | null;
}

/** The complete deterministic input to detection for one league. */
export interface StoryLeagueFacts {
  leagueId: string;
  currentSeason: number;
  latestCompletedSeason: number | null;
  owners: OwnerFacts[];
  rivalries: RivalryFacts[];
  tradeSagas: TradeSagaFacts[];
  draftPicks: DraftPickFact[];
  /** best single-season win total in league history (for historic_season). */
  leagueRecordWins: number | null;
}

// ─── Lifecycle config (all tunable; the engine reads only from here) ────────────

export const DAY_MS = 24 * 60 * 60 * 1000;

export const STORY_CONFIG = {
  /** how long a story survives untouched, by phase (epoch-ms windows). */
  emergingTtlMs: 14 * DAY_MS,
  activeTtlMs: 21 * DAY_MS,
  backgroundTtlMs: 35 * DAY_MS,
  /** resolved stories stay queryable (archived) this long before retiring. */
  resolvedTtlMs: 120 * DAY_MS,

  /** priority added when a story is re-detected (grows). */
  growthStep: 6,
  /** priority removed each cycle a story is NOT re-detected (cools off). */
  coolStep: 10,
  /** priority damping applied right after a mention (rotation / anti-nag). */
  mentionCooldown: 12,

  /** confidence at/above which an emerging story promotes to active. */
  activeConfidence: 0.6,
  /** re-detections required to promote emerging → active (if confidence low). */
  emergeToActiveDetections: 2,
  /** priority at/below which an active story drops to background. */
  backgroundPriorityFloor: 25,

  /** hard bounds. */
  minPriority: 0,
  maxPriority: 100,
} as const;

export type StoryConfig = typeof STORY_CONFIG;
