/**
 * Unified draft-source ingestion — adapters observe picks; the Draft Engine
 * consumes NormalizedPickEvent only. Downstream (grades / commentary / booth)
 * must not branch on provider.
 */

/** Product experience — permanent split. */
export type DraftExperience = "live" | "mock";

/**
 * Where picks originate. Live = real league draft; Mock = everything else.
 * Future providers add an id here + one adapter file.
 */
export type DraftProviderId =
  | "espn-live"
  | "sleeper-live"
  | "yahoo-live"
  | "rfsn-local-mock"
  | "fantasypros-mock"
  | "espn-mock"
  | "sleeper-mock"
  | "yahoo-mock";

export type DraftType = "live" | "mock";

/**
 * Provider-agnostic locked pick. Maps 1:1 onto server LockedPickInput fields
 * plus adapter metadata that is stripped before notifyLockedPick.
 */
export type NormalizedPickEvent = {
  provider: DraftProviderId;
  draftType: DraftType;
  draftId: string;
  leagueId: string;
  round: number;
  /** Pick within round (1-based). */
  pick: number;
  overallPick: number;
  teamId: string;
  ownerId: string;
  ownerName: string;
  playerId: string;
  playerName: string;
  position: string;
  timestamp: string;
  nflTeam?: string | null;
  adp?: number | null;
  metadata?: Record<string, unknown>;
};

/** Session envelope for a batch of newly observed picks. */
export type NormalizedPickBatch = {
  provider: DraftProviderId;
  draftType: DraftType;
  draftId: string;
  leagueId: string;
  teamCount: number;
  draftComplete: boolean;
  draftPace?: "broadcast" | "brisk" | "turbo";
  picks: NormalizedPickEvent[];
};

/**
 * Adapter contract — observe provider state, emit normalized events only.
 * Adapters must not call grading, commentary, or booth APIs.
 */
export interface DraftSourceAdapter<TObservation = unknown> {
  readonly provider: DraftProviderId;
  readonly draftType: DraftType;
  /** Map a provider observation into a normalized batch (may be empty). */
  observe(observation: TObservation): NormalizedPickBatch | null;
}

/** Catalog entry for UI source selectors (labels only — no execution). */
export type DraftSourceCatalogEntry = {
  id: DraftProviderId;
  experience: DraftExperience;
  label: string;
  available: boolean;
};

export const LIVE_DRAFT_SOURCES: readonly DraftSourceCatalogEntry[] = [
  { id: "espn-live", experience: "live", label: "ESPN League", available: true },
  { id: "sleeper-live", experience: "live", label: "Sleeper League", available: false },
  { id: "yahoo-live", experience: "live", label: "Yahoo League", available: false },
] as const;

export const MOCK_DRAFT_SOURCES: readonly DraftSourceCatalogEntry[] = [
  { id: "rfsn-local-mock", experience: "mock", label: "RFSN Local Mock", available: true },
  { id: "fantasypros-mock", experience: "mock", label: "FantasyPros Mock", available: true },
  { id: "espn-mock", experience: "mock", label: "ESPN Mock", available: false },
  { id: "sleeper-mock", experience: "mock", label: "Sleeper Mock", available: false },
  { id: "yahoo-mock", experience: "mock", label: "Yahoo Mock", available: false },
] as const;

export function availableSourcesForExperience(
  experience: DraftExperience,
): DraftSourceCatalogEntry[] {
  const list = experience === "live" ? LIVE_DRAFT_SOURCES : MOCK_DRAFT_SOURCES;
  return list.filter((s) => s.available);
}

/** Strip adapter metadata → server notifyLockedPick.pick shape. */
export function toLockedPickInput(event: NormalizedPickEvent): {
  overallPick: number;
  round: number;
  roundPick: number;
  teamId: string;
  ownerName: string;
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string | null;
  adp: number | null;
} {
  return {
    overallPick: event.overallPick,
    round: event.round,
    roundPick: event.pick,
    teamId: event.teamId,
    ownerName: event.ownerName,
    playerId: event.playerId,
    playerName: event.playerName,
    position: event.position,
    nflTeam: event.nflTeam ?? null,
    adp: event.adp ?? null,
  };
}

/** Build the tRPC notifyLockedPick payload from a normalized batch item. */
export function toNotifyLockedPickRequest(
  event: NormalizedPickEvent,
  opts: {
    teamCount: number;
    draftComplete?: boolean;
    draftPace?: "broadcast" | "brisk" | "turbo";
  },
) {
  return {
    leagueId: event.leagueId,
    draftId: event.draftId,
    pick: toLockedPickInput(event),
    draftComplete: opts.draftComplete ?? false,
    draftPace: opts.draftPace,
    teamCount: opts.teamCount,
  };
}
