/**
 * Canonical Owner Awards V1 metadata.
 * Presentation / discovery only — does not change award calculations.
 */

export type OwnerAwardRarity = "Legendary" | "Epic" | "Rare" | "Common";

export type OwnerAwardCategory =
  | "Championships"
  | "Scoring"
  | "Drafting"
  | "Roster Management"
  | "Trading"
  | "Waivers"
  | "Rivalries"
  | "Records"
  | "Legacy"
  | "Participation";

/** Lucide icon name resolved on the client. */
export type OwnerAwardIconName =
  | "trophy"
  | "medal"
  | "sword"
  | "drafting"
  | "thumbs-down"
  | "crown"
  | "zap"
  | "handshake"
  | "flame"
  | "ghost"
  | "skull";

export type OwnerAwardMeta = {
  id: string;
  /** Must match server `awardName` exactly. */
  awardName: string;
  displayName: string;
  category: OwnerAwardCategory;
  shortDescription: string;
  longDescription: string;
  howEarned: string;
  eligibility: string;
  rarity: OwnerAwardRarity;
  icon: OwnerAwardIconName;
  displayOrder: number;
  relatedAwardIds: readonly string[];
};

export const OWNER_AWARD_RARITIES: readonly OwnerAwardRarity[] = [
  "Legendary",
  "Epic",
  "Rare",
  "Common",
] as const;

export const OWNER_AWARD_CATEGORIES: readonly OwnerAwardCategory[] = [
  "Championships",
  "Scoring",
  "Drafting",
  "Roster Management",
  "Trading",
  "Waivers",
  "Rivalries",
  "Records",
  "Legacy",
  "Participation",
] as const;

/**
 * Complete catalog for Owner Awards V1 (10 awards).
 * IDs are stable; `awardName` must stay aligned with `owners.ownerList` output.
 */
export const OWNER_AWARD_META: readonly OwnerAwardMeta[] = [
  {
    id: "best_drafter",
    awardName: "Best Drafter",
    displayName: "Best Drafter",
    category: "Drafting",
    shortDescription: "The sharpest early-round drafter in league history.",
    longDescription:
      "Recognizes the multi-season owner who has most consistently secured early-round RB and WR talent — the foundation of a strong draft board.",
    howEarned:
      "Accumulate the most RB/WR selections in rounds 1–3 across seasons with enough resolved draft history.",
    eligibility:
      "Multi-season owners with at least 12 resolved draft picks. One current holder league-wide.",
    rarity: "Epic",
    icon: "drafting",
    displayOrder: 1,
    relatedAwardIds: ["worst_drafter", "keeper_king"],
  },
  {
    id: "worst_drafter",
    awardName: "Worst Drafter",
    displayName: "Worst Drafter",
    category: "Drafting",
    shortDescription: "The least efficient early-round skill-position drafter.",
    longDescription:
      "Marks the eligible multi-season owner with the fewest early RB/WR picks — a cautionary badge of draft-board drought.",
    howEarned:
      "Post the fewest RB/WR picks in rounds 1–3 among eligible multi-season owners (cannot be the same owner as Best Drafter).",
    eligibility:
      "Multi-season owners with enough draft history; at least two eligible owners. Cannot share an owner with Best Drafter.",
    rarity: "Rare",
    icon: "thumbs-down",
    displayOrder: 2,
    relatedAwardIds: ["best_drafter"],
  },
  {
    id: "keeper_king",
    awardName: "Keeper King",
    displayName: "Keeper King",
    category: "Roster Management",
    shortDescription: "The owner who leans hardest into the keeper game.",
    longDescription:
      "Honors the multi-season manager with the highest share of roster spots filled via keepers — a dynasty-minded roster builder.",
    howEarned:
      "Post the highest keeper rate (keepers ÷ resolved picks) among multi-season owners with enough keepers on record.",
    eligibility:
      "Multi-season owners with at least 10 resolved picks and at least 2 keepers. One current holder.",
    rarity: "Epic",
    icon: "crown",
    displayOrder: 3,
    relatedAwardIds: ["best_drafter", "trade_shark"],
  },
  {
    id: "transaction_addict",
    awardName: "Transaction Addict",
    displayName: "Transaction Addict",
    category: "Waivers",
    shortDescription: "The busiest acquisition machine in league history.",
    longDescription:
      "Goes to the multi-season owner with the most lifetime acquisitions — always hunting the wire.",
    howEarned: "Record the most lifetime acquisitions among multi-season owners with acquisitions > 0.",
    eligibility: "Multi-season owners with at least one acquisition. One current holder.",
    rarity: "Rare",
    icon: "zap",
    displayOrder: 4,
    relatedAwardIds: ["trade_shark"],
  },
  {
    id: "trade_shark",
    awardName: "Trade Shark",
    displayName: "Trade Shark",
    category: "Trading",
    shortDescription: "The most active trader at the negotiation table.",
    longDescription:
      "Awarded to the multi-season owner who has completed the most trades — a restless roster reshaper.",
    howEarned: "Complete the most trades among multi-season owners with trades > 0.",
    eligibility: "Multi-season owners with at least one completed trade. One current holder.",
    rarity: "Epic",
    icon: "handshake",
    displayOrder: 5,
    relatedAwardIds: ["transaction_addict", "keeper_king"],
  },
  {
    id: "regular_season_bully",
    awardName: "Regular Season Bully",
    displayName: "Regular Season Bully",
    category: "Records",
    shortDescription: "Career regular-season dominance measured by win rate.",
    longDescription:
      "Recognizes the multi-season owner with the highest career regular-season win percentage — week-to-week tyranny.",
    howEarned:
      "Post the highest career regular-season win % among multi-season owners with at least 14 regular-season games.",
    eligibility: "Multi-season owners with ≥14 regular-season games. One current holder.",
    rarity: "Legendary",
    icon: "flame",
    displayOrder: 6,
    relatedAwardIds: ["playoff_merchant", "rivalry_killer"],
  },
  {
    id: "playoff_merchant",
    awardName: "Playoff Merchant",
    displayName: "Playoff Merchant",
    category: "Championships",
    shortDescription: "Deep runs without sitting alone atop the podium.",
    longDescription:
      "Goes to the owner with the most runner-up and third-place finishes — always in the hunt, often one step short.",
    howEarned:
      "Accumulate the most runner-up + third-place finishes. When tied, fewer championships are preferred.",
    eligibility: "Any owner with at least one RU or 3rd-place finish. One current holder.",
    rarity: "Epic",
    icon: "medal",
    displayOrder: 7,
    relatedAwardIds: ["regular_season_bully"],
  },
  {
    id: "rivalry_killer",
    awardName: "Rivalry Killer",
    displayName: "Rivalry Killer",
    category: "Rivalries",
    shortDescription: "The sharpest head-to-head predator in the league.",
    longDescription:
      "Honors the multi-season owner with the best regular-season H2H net record — the name that owns matchup history.",
    howEarned:
      "Post the best regular-season head-to-head net record (wins − losses) among multi-season owners with enough H2H games.",
    eligibility: "Multi-season owners with at least 10 H2H games. One current holder.",
    rarity: "Legendary",
    icon: "sword",
    displayOrder: 8,
    relatedAwardIds: ["regular_season_bully"],
  },
  {
    id: "one_year_wonder",
    awardName: "One-Year Wonder",
    displayName: "One-Year Wonder",
    category: "Legacy",
    shortDescription: "A single-season flash that still made the ledger.",
    longDescription:
      "Awarded to the one-season (graveyard) owner with the highest win percentage — a brief but bright run.",
    howEarned: "Post the highest win % among one-season owners with games played.",
    eligibility: "Graveyard owners with exactly one season and games played. One current holder.",
    rarity: "Common",
    icon: "ghost",
    displayOrder: 9,
    relatedAwardIds: ["graveyard_legend"],
  },
  {
    id: "graveyard_legend",
    awardName: "Graveyard Legend",
    displayName: "Graveyard Legend",
    category: "Participation",
    shortDescription: "The highest-scoring one-season alumni mark.",
    longDescription:
      "Recognizes the one-season owner who put up the most points for — a scoring footprint that outlived the roster.",
    howEarned: "Post the highest points-for among one-season (graveyard) owners with PF > 0.",
    eligibility: "Graveyard owners with exactly one season and positive PF. One current holder.",
    rarity: "Common",
    icon: "skull",
    displayOrder: 10,
    relatedAwardIds: ["one_year_wonder"],
  },
] as const;

const BY_ID = new Map(OWNER_AWARD_META.map((m) => [m.id, m]));
const BY_NAME = new Map(OWNER_AWARD_META.map((m) => [m.awardName, m]));

export function getOwnerAwardMetaById(id: string): OwnerAwardMeta | null {
  return BY_ID.get(String(id ?? "").trim()) ?? null;
}

export function getOwnerAwardMetaByName(awardName: string): OwnerAwardMeta | null {
  return BY_NAME.get(String(awardName ?? "").trim()) ?? null;
}

export function listOwnerAwardMeta(): OwnerAwardMeta[] {
  return [...OWNER_AWARD_META].sort((a, b) => a.displayOrder - b.displayOrder);
}

export const OWNER_AWARD_ORDER: readonly string[] = OWNER_AWARD_META.map((m) => m.awardName);

export function rarityRank(rarity: OwnerAwardRarity): number {
  switch (rarity) {
    case "Legendary":
      return 0;
    case "Epic":
      return 1;
    case "Rare":
      return 2;
    case "Common":
      return 3;
    default:
      return 9;
  }
}
