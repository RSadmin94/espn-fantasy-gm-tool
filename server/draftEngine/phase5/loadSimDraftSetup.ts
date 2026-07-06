/**
 * Phase 5 — load draft pool, slot order, and owner priors for simulation.
 */

import { CONFIRMED_ACTIVE_OWNERS, confirmedActiveProfileKeySet } from "../activeOwners";
import { choiceRecordsForOwner } from "../phase1/choiceLedger";
import type { ChoiceLedger } from "../phase1/types";
import { normalizePlayerKey, normalizePosition } from "../phase1/types";
import type { SeasonTerrain } from "../phase2/types";
import { isSkillPosition } from "../phase2/types";
import type { SimPlayer } from "./weather";

export type DraftSlot = {
  profileOwnerKey: string;
  displayName: string;
  slot: number;
  personalityFitTier: "full" | "shrinkage_cold";
};

export function poolFromTerrain(terrain: SeasonTerrain): SimPlayer[] {
  return terrain.cards
    .filter((c) => isSkillPosition(c.position))
    .map((c) => ({
      playerName: c.playerName,
      position: normalizePosition(c.position),
      playerKey: c.playerKey,
      valueScore: c.valueScore,
      tier: c.tier,
    }))
    .sort((a, b) => b.valueScore - a.valueScore);
}

export function buildOwnerPriorKeys(args: { ledger: ChoiceLedger }): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const owner of CONFIRMED_ACTIVE_OWNERS) {
    const records = choiceRecordsForOwner(args.ledger, owner.profileOwnerKey);
    out.set(owner.profileOwnerKey, new Set(records.map((r) => normalizePlayerKey(r.chosenPlayer.playerName))));
  }
  return out;
}

/** Snake-draft slot order from a prior season's round-1 ledger picks (active seats only). */
export function resolveDraftOrderFromLedger(args: { ledger: ChoiceLedger; orderSeason: number }): DraftSlot[] {
  const activeKeys = confirmedActiveProfileKeySet();
  const round1 = args.ledger.choiceRecords
    .filter((r) => r.season === args.orderSeason && r.round === 1 && r.chooserRole === "active")
    .sort((a, b) => a.overallPick - b.overallPick);

  const slots: DraftSlot[] = [];
  const seen = new Set<string>();

  for (const rec of round1) {
    if (!activeKeys.has(rec.chooserProfileKey) || seen.has(rec.chooserProfileKey)) continue;
    const owner = CONFIRMED_ACTIVE_OWNERS.find((o) => o.profileOwnerKey === rec.chooserProfileKey);
    if (!owner) continue;
    seen.add(rec.chooserProfileKey);
    slots.push({
      profileOwnerKey: owner.profileOwnerKey,
      displayName: owner.displayName,
      slot: slots.length + 1,
      personalityFitTier: owner.personalityFitTier,
    });
  }

  for (const owner of CONFIRMED_ACTIVE_OWNERS) {
    if (seen.has(owner.profileOwnerKey)) continue;
    slots.push({
      profileOwnerKey: owner.profileOwnerKey,
      displayName: owner.displayName,
      slot: slots.length + 1,
      personalityFitTier: owner.personalityFitTier,
    });
  }

  return slots;
}

/** @deprecated use resolveDraftOrderFromLedger */
export function resolveDraftOrderFromSeason(args: {
  draftRows: unknown[];
  allLeagueTeams: unknown[];
  orderSeason: number;
}): DraftSlot[] {
  void args;
  return CONFIRMED_ACTIVE_OWNERS.map((owner, i) => ({
    profileOwnerKey: owner.profileOwnerKey,
    displayName: owner.displayName,
    slot: i + 1,
    personalityFitTier: owner.personalityFitTier,
  }));
}

export function chooserAtPick(args: { overallPick: number; draftOrder: DraftSlot[] }): DraftSlot {
  const n = args.draftOrder.length;
  const round = Math.ceil(args.overallPick / n);
  const posInRound = ((args.overallPick - 1) % n) + 1;
  const idx = round % 2 === 1 ? posInRound - 1 : n - posInRound;
  return args.draftOrder[idx]!;
}

export function roundForPick(overallPick: number, teamCount: number): number {
  return Math.ceil(overallPick / teamCount);
}

export function pickInRound(overallPick: number, teamCount: number): number {
  return ((overallPick - 1) % teamCount) + 1;
}
