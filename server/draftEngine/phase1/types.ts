/** Normalize player identity within a draft season. */
export function normalizePlayerKey(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.'’]/g, "")                  // drop periods/apostrophes: "Sr." -> "sr", "A.J." -> "aj", "De'Von" -> "devon"
    .replace(/\s+/g, " ")
    .replace(/\s+(jr|sr|ii|iii|iv)$/i, "")  // strip a trailing generational suffix so "Kyle Pitts Sr" == "Kyle Pitts"
    .trim();
}

export function normalizePosition(pos: string): string {
  const p = String(pos ?? "")
    .trim()
    .toUpperCase();
  if (!p) return "UNK";
  if (p === "DEF" || p === "D/ST" || p === "DST") return "DST";
  return p.split(/[-/]/)[0] ?? p;
}

export interface ChoicePlayer {
  playerName: string;
  position: string;
}

export interface PositionTierSnapshot {
  /** Players still available at this position at pick time. */
  remaining: number;
  /** Already drafted at this position before this pick. */
  drafted: number;
}

export interface RoomState {
  picksSoFar: number;
  teamCount: number;
  positionCounts: Record<string, number>;
  /** Positions of the last up-to-6 board slots. */
  recentBoardPositions: string[];
  /** When 3+ of the last 4 board slots share a position. */
  runInProgress: { position: string; countInLastFour: number } | null;
  /** Per-skill-position availability snapshot (RB/WR/QB/TE). */
  tierByPosition: Record<string, PositionTierSnapshot>;
}

export interface ChoiceRecord {
  leagueId: string;
  season: number;
  round: number;
  roundPick: number;
  overallPick: number;
  chooserProfileKey: string;
  chooserDisplayName: string;
  chooserRole: "active" | "departed_context";
  chosenPlayer: ChoicePlayer;
  /** Every player still on the board at this pick (honest universe = eventually-drafted pool). */
  availableSet: ChoicePlayer[];
  roomState: RoomState;
}

export interface ChoiceLedger {
  leagueId: string;
  choiceRecords: ChoiceRecord[];
  stats: {
    totalBoardSlots: number;
    openChoiceEvents: number;
    activeChooserChoices: number;
    departedChooserChoices: number;
    seasons: number;
  };
}

export interface DraftPickRow {
  playerName: string;
  position: string;
  roundId: number;
  roundPick: number;
  overallPick: number;
  isKeeper: number;
  season: number;
  teamId: number;
  rawPick: string;
}
