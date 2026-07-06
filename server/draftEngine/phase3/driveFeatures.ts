/**
 * Phase 3 — drive features for random-utility discrete choice (parliament of drives).
 */

import { normalizePlayerKey, normalizePosition } from "../phase1/types";
import type { ChoiceRecord } from "../phase1/types";
import type { PlayerTerrainCard, SeasonTerrain } from "../phase2/types";

export const DRIVE_NAMES = [
  "value",
  "need",
  "scarcityTierCliff",
  "herdFomo",
  "contrarian",
  "homerAffinity",
  "blockRevenge",
  "comfortAnchor",
  "panic",
  "rbEarlyRound",
  "wrEarlyRound",
  "rbEarlyLegacyEra",
  "wrEarlyModernEra",
] as const;

export type DriveName = (typeof DRIVE_NAMES)[number];
export type DriveFeatures = Record<DriveName, number>;

export type TerrainLookup = Map<number, Map<string, PlayerTerrainCard>>;

export function buildTerrainLookup(terrains: Map<number, SeasonTerrain>): TerrainLookup {
  const out: TerrainLookup = new Map();
  for (const [season, terrain] of terrains) {
    const m = new Map<string, PlayerTerrainCard>();
    for (const c of terrain.cards) m.set(c.playerKey, c);
    out.set(season, m);
  }
  return out;
}

function terrainFor(lookup: TerrainLookup, season: number, playerName: string): PlayerTerrainCard | null {
  return lookup.get(season)?.get(normalizePlayerKey(playerName)) ?? null;
}

const ROSTER_TARGET: Record<string, number> = { RB: 5, WR: 6, QB: 1, TE: 2 };

export function computeDriveFeatures(args: {
  record: ChoiceRecord;
  candidateName: string;
  candidatePosition: string;
  terrainLookup: TerrainLookup;
  ownerRosterCounts: Record<string, number>;
  ownerPriorPlayerKeys: Set<string>;
}): DriveFeatures {
  const { record, candidateName, candidatePosition, terrainLookup, ownerRosterCounts, ownerPriorPlayerKeys } = args;
  const pos = normalizePosition(candidatePosition);

  const target = ROSTER_TARGET[pos] ?? 1;
  const have = ownerRosterCounts[pos] ?? 0;
  const need = Math.max(0, Math.min(1, (target - have) / target));

  const valueNorm = (terrainFor(terrainLookup, record.season, candidateName)?.valueScore ?? 50) / 100;

  const available = record.availableSet;
  const availSamePos = available.filter((p) => normalizePosition(p.position) === pos);
  const tier12Remaining = availSamePos.filter((p) => {
    const t = terrainFor(terrainLookup, record.season, p.playerName);
    return t && (t.tier === "T1" || t.tier === "T2");
  }).length;
  const scarcityTierCliff =
    availSamePos.length > 0 ? Math.max(0, 1 - tier12Remaining / Math.min(3, availSamePos.length)) : 0;

  const runPos = record.roomState.runInProgress?.position ?? null;
  const herdFomo = runPos === pos ? 1 : 0;
  const contrarian = runPos && runPos !== pos && ["RB", "WR", "QB", "TE"].includes(pos) ? 1 : 0;

  const comfortAnchor = ownerPriorPlayerKeys.has(normalizePlayerKey(candidateName)) ? 1 : 0;

  const earlyRound = record.round <= 2 ? 1 : 0;
  const rbEarlyRound = pos === "RB" && earlyRound ? 1 : 0;
  const wrEarlyRound = pos === "WR" && earlyRound ? 1 : 0;

  const wrRem = record.roomState.tierByPosition.WR?.remaining ?? 10;
  const rbRem = record.roomState.tierByPosition.RB?.remaining ?? 10;
  const panic = record.round >= 10 && need > 0.5 ? 1 : record.round <= 2 && wrRem > rbRem + 5 && pos === "WR" ? 0.3 : 0;

  const legacyEra = record.season < 2023 ? 1 : 0;
  const modernEra = record.season >= 2023 ? 1 : 0;

  return {
    value: valueNorm,
    need,
    scarcityTierCliff,
    herdFomo,
    contrarian,
    homerAffinity: 0,
    blockRevenge: 0,
    comfortAnchor,
    panic,
    rbEarlyRound,
    wrEarlyRound,
    rbEarlyLegacyEra: rbEarlyRound * legacyEra,
    wrEarlyModernEra: wrEarlyRound * modernEra,
  };
}

export function buildChoiceEventsForFit(args: {
  records: ChoiceRecord[];
  terrainLookup: TerrainLookup;
}): Array<{
  season: number;
  round: number;
  chosenKey: string;
  alts: Array<{ key: string; name: string; position: string; features: DriveFeatures }>;
}> {
  const { records, terrainLookup } = args;
  const rosterBySeason = new Map<number, Record<string, number>>();
  const priorKeys = new Set<string>();
  const events: ReturnType<typeof buildChoiceEventsForFit> = [];

  const sorted = [...records].sort((a, b) => a.season - b.season || a.overallPick - b.overallPick);

  for (const rec of sorted) {
    const roster = { ...(rosterBySeason.get(rec.season) ?? { RB: 0, WR: 0, QB: 0, TE: 0 }) };

    const consideration = buildConsiderationSet(rec, terrainLookup);
    const alts = consideration.map((p) => ({
      key: normalizePlayerKey(p.playerName),
      name: p.playerName,
      position: normalizePosition(p.position),
      features: computeDriveFeatures({
        record: rec,
        candidateName: p.playerName,
        candidatePosition: p.position,
        terrainLookup,
        ownerRosterCounts: roster,
        ownerPriorPlayerKeys: priorKeys,
      }),
    }));

    const chosenKey = normalizePlayerKey(rec.chosenPlayer.playerName);
    if (!alts.some((a) => a.key === chosenKey)) {
      alts.push({
        key: chosenKey,
        name: rec.chosenPlayer.playerName,
        position: normalizePosition(rec.chosenPlayer.position),
        features: computeDriveFeatures({
          record: rec,
          candidateName: rec.chosenPlayer.playerName,
          candidatePosition: rec.chosenPlayer.position,
          terrainLookup,
          ownerRosterCounts: roster,
          ownerPriorPlayerKeys: priorKeys,
        }),
      });
    }

    events.push({ season: rec.season, round: rec.round, chosenKey, alts });

    const cp = normalizePosition(rec.chosenPlayer.position);
    roster[cp] = (roster[cp] ?? 0) + 1;
    rosterBySeason.set(rec.season, roster);
    priorKeys.add(chosenKey);
  }

  return events;
}

function buildConsiderationSet(rec: ChoiceRecord, terrainLookup: TerrainLookup): ChoiceRecord["availableSet"] {
  const available = rec.availableSet.filter((p) => p.playerName.trim());
  const scored = available.map((p) => ({
    p,
    v: terrainFor(terrainLookup, rec.season, p.playerName)?.valueScore ?? 0,
  }));
  scored.sort((a, b) => b.v - a.v);
  return scored.slice(0, 22).map((s) => s.p);
}
