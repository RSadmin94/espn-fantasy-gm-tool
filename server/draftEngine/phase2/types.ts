import { normalizePlayerKey, normalizePosition } from "../phase1/types";

export type ValueSource =
  | "prior_season_fantasy_points"
  | "league_draft_order_proxy"
  | "retroactive_league_draft_capital"
  | "unranked";

export type TerrainTier = "T1" | "T2" | "T3" | "T4" | "T5";

export interface PlayerTerrainCard {
  playerName: string;
  playerKey: string;
  position: string;
  playerId: number | null;
  /** 0–100 value normalized within position (primary board signal for Phase 3). */
  valueScore: number;
  /** Raw cross-position score before position normalization (audit). */
  rawValueScore: number;
  valueSource: ValueSource;
  tier: TerrainTier;
  /** Position-relative rank (1 = best at position on this board). */
  positionRank: number;
  scarcityIndex: number;
  /** 0–1 risk estimate; 0.5 = unknown/neutral. */
  riskScore: number;
  riskLabel: string;
  age: number | null;
  ageSource: "espn_player_cache" | "unknown";
  upsideLabel: "high" | "moderate" | "low" | "unknown";
  /** Honest notes on proxy limitations for this row. */
  dataNotes: string[];
  /** Eventual league draft slot (not used in value — audit only). */
  eventualOverallPick: number | null;
  priorSeasonPoints: number | null;
}

export interface SeasonTerrain {
  leagueId: string;
  season: number;
  teamCount: number;
  playerCount: number;
  cards: PlayerTerrainCard[];
  dataGaps: string[];
  valueMethodSummary: string;
}

export interface TerrainDraftPickRow {
  playerName: string;
  position: string;
  overallPick: number;
  playerId: number | null;
  season: number;
}

export interface PriorSeasonPointsRow {
  playerId: number;
  totalPoints: number;
}

export interface PlayerCacheRow {
  playerId: number;
  name: string;
  position: string;
  injuryStatus: string;
  projectedTotalPoints: number | null;
  averagePoints: number | null;
}

const SKILL = new Set(["RB", "WR", "QB", "TE"]);

export function isSkillPosition(pos: string): boolean {
  return SKILL.has(normalizePosition(pos));
}

export function playerKey(name: string): string {
  return normalizePlayerKey(name);
}
