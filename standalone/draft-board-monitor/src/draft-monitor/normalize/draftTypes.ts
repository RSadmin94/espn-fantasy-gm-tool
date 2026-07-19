/**
 * Standalone dual-source draft board — shared normalized types.
 * No Rivals / notifyLockedPick coupling.
 */

export type DraftSource = "fantasypros" | "espn";

export type DraftStatus =
  | "NOT_STARTED"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETE"
  | "UNKNOWN";

export type NormalizedDraftTeam = {
  teamId: string;
  teamName: string;
  ownerName?: string;
  draftSlot?: number;
  isUserTeam?: boolean;
};

export type NormalizedDraftPick = {
  eventKey: string;
  source: DraftSource;
  draftId?: string;
  overallPick?: number;
  round: number;
  pickInRound?: number;
  originalDraftSlot?: number;
  currentTeamId: string;
  currentTeamName: string;
  currentOwnerName?: string;
  originalTeamId?: string;
  originalTeamName?: string;
  playerId?: string;
  playerName: string;
  nflTeam?: string;
  position?: string;
  isKeeper: boolean;
  isTradedPick: boolean;
  isLiveSelection: boolean;
  /** Proven keeper when source exposes it; false = not keeper; undefined = unknown */
  keeperStatusKnown: boolean;
  sourceSequence?: number;
  sourceTimestamp?: string;
};

export type NormalizedDraftSnapshot = {
  source: DraftSource;
  draftId?: string;
  draftName?: string;
  status: DraftStatus;
  teamCount: number;
  roundCount?: number;
  teams: NormalizedDraftTeam[];
  picks: NormalizedDraftPick[];
  currentRound?: number;
  currentPickInRound?: number;
  currentOverallPick?: number;
  onTheClockTeamId?: string;
  userTeamId?: string;
  lastUpdatedAt: string;
  /** Conservative fingerprint when formal draftId is missing */
  draftFingerprint: string;
};

export type MonitorDiagnostics = {
  version: string;
  source: DraftSource | "unknown";
  draftIdOrFingerprint: string;
  teamCount: number;
  sourcePickCount: number;
  normalizedPickCount: number;
  duplicatesSuppressed: number;
  keeperCount: number;
  tradedPickCount: number;
  lastSuccessfulReadAt: string | null;
  parseError: string | null;
  status: DraftStatus | "ERROR" | "LOADING";
};

export const MONITOR_VERSION = "1.0.0-standalone";

export function emptySnapshot(
  source: DraftSource,
  partial?: Partial<NormalizedDraftSnapshot>,
): NormalizedDraftSnapshot {
  return {
    source,
    status: "UNKNOWN",
    teamCount: 0,
    teams: [],
    picks: [],
    lastUpdatedAt: new Date().toISOString(),
    draftFingerprint: `${source}:empty`,
    ...partial,
  };
}
