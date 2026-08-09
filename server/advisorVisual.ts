/**
 * RFSN-053D — Advisor visual payload contract.
 * Additive on deterministic Advisor replies. UI embeds the 053C gallery.
 */
import type { GalleryQueryResult, GallerySort } from "./matchupGalleryQuery";

export type AdvisorGalleryPreset =
  | "no_mercy"
  | "one_point"
  | "closest"
  | "championship"
  | "playoffs"
  | "highest"
  | "lowest"
  | "blowouts"
  | "biggest_wins"
  | "biggest_losses"
  | "h2h"
  | "season"
  | "custom";

/** Spec-shaped filters + 053C GalleryUiFilter fields. */
export type AdvisorMatchupGalleryFilters = {
  owner?: string;
  opponent?: string;
  ownerName?: string;
  opponentName?: string;
  season?: number;
  seasonFrom?: number;
  seasonTo?: number;
  week?: number;
  phase?: "regular" | "playoffs" | "all";
  result?: "win" | "loss" | "tie" | "any";
  winsOnly?: boolean;
  onePoint?: boolean;
  marginMin?: number;
  marginMax?: number;
  scoreMin?: number;
  scoreMax?: number;
  noMercy?: boolean;
  sort?: GallerySort;
  championshipGames?: boolean;
};

export type AdvisorMatchupGalleryVisual = {
  type: "matchup_gallery";
  preset: AdvisorGalleryPreset;
  filters: AdvisorMatchupGalleryFilters;
  result: GalleryQueryResult;
  href: string;
};

export type AdvisorVisual = AdvisorMatchupGalleryVisual;
