/**
 * Phase 1 — Choice Ledger: every open-draft pick as a choice OVER the available set.
 */

import { classifyDraftPickRawPick } from "../../draftTruth";
import {
  buildNameToOwnerId,
  cleanOwnerDisplay,
  resolveOwnerKey,
  type GmTeamRow,
} from "../../ownerProfileService";
import { buildDraftEngineOwnerKeyRemap } from "../personMerge";
import { buildTeamsBySeason, parseDraftPickTeamNameFromRawPick, resolveDraftPickOwner } from "../../resolveDraftPickOwner";
import { chooserRoleFor } from "../rules";
import { buildRoomState, formatRoomStatePlain } from "./roomState";
import {
  normalizePlayerKey,
  normalizePosition,
  type ChoiceLedger,
  type ChoicePlayer,
  type ChoiceRecord,
  type DraftPickRow,
} from "./types";

export type ChoiceLedgerInputs = {
  leagueId: string;
  draftRows: DraftPickRow[];
  allLeagueTeams: Array<{
    leagueId: string;
    season: number;
    teamId: number;
    teamName: string;
    ownerName: string;
    ownerId: string | null;
  }>;
  activeProfileKeys: ReadonlySet<string>;
};

function toGmTeamRows(allLeagueTeams: ChoiceLedgerInputs["allLeagueTeams"]): GmTeamRow[] {
  return allLeagueTeams.map(
    (r) =>
      ({
        ...r,
        name: r.teamName ?? "",
      }) as unknown as GmTeamRow,
  );
}

function parseTruth(rawPick: string) {
  try {
    return classifyDraftPickRawPick(rawPick ? JSON.parse(rawPick) : null);
  } catch {
    return classifyDraftPickRawPick(null);
  }
}

function resolvePickOwnerKey(
  row: DraftPickRow,
  teamsBySeason: ReturnType<typeof buildTeamsBySeason>,
  nameToOwnerId: Map<string, string>,
  keyRemap: Map<string, string>,
): { profileKey: string; displayName: string } {
  const teamNameFromPick = parseDraftPickTeamNameFromRawPick(row.rawPick);
  const res = resolveDraftPickOwner(
    { season: row.season, teamId: row.teamId, teamName: teamNameFromPick },
    teamsBySeason,
  );
  const seasonList = teamsBySeason.get(row.season) ?? [];
  const rowById = seasonList.find((t) => t.teamId === row.teamId);
  const pickOwnerKeyRaw = rowById
    ? resolveOwnerKey(String(rowById.ownerId ?? "").trim(), rowById.ownerName, rowById.name, nameToOwnerId)
    : resolveOwnerKey("", res.ownerName, teamNameFromPick ?? "", nameToOwnerId);
  const profileKey = keyRemap.get(pickOwnerKeyRaw) ?? pickOwnerKeyRaw;
  const displayName = cleanOwnerDisplay(rowById?.ownerName ?? res.ownerName ?? teamNameFromPick ?? "Unknown");
  return { profileKey, displayName };
}

function toChoicePlayer(row: DraftPickRow): ChoicePlayer {
  return {
    playerName: String(row.playerName ?? "").trim(),
    position: normalizePosition(row.position ?? ""),
  };
}

function buildSeasonUniverse(picks: DraftPickRow[]): ChoicePlayer[] {
  const seen = new Set<string>();
  const out: ChoicePlayer[] = [];
  for (const row of picks) {
    const name = String(row.playerName ?? "").trim();
    if (!name) continue;
    const key = normalizePlayerKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(toChoicePlayer(row));
  }
  return out;
}

function teamCountForSeason(picks: DraftPickRow[]): number {
  const teams = new Set(picks.map((p) => p.teamId));
  return teams.size || 12;
}

export function buildChoiceLedger(inputs: ChoiceLedgerInputs): ChoiceLedger {
  const { leagueId, draftRows, allLeagueTeams, activeProfileKeys } = inputs;
  const gmRows = toGmTeamRows(allLeagueTeams);
  const teamsBySeason = buildTeamsBySeason(
    gmRows.map((t) => ({
      season: t.season,
      teamId: t.teamId,
      name: t.name,
      ownerName: t.ownerName,
      ownerId: t.ownerId?.trim() ? t.ownerId.trim() : undefined,
    })),
  );
  const nameToOwnerId = buildNameToOwnerId(gmRows);
  const keyRemap = buildDraftEngineOwnerKeyRemap(gmRows);

  const bySeason = new Map<number, DraftPickRow[]>();
  for (const row of draftRows) {
    const list = bySeason.get(row.season) ?? [];
    list.push(row);
    bySeason.set(row.season, list);
  }

  const choiceRecords: ChoiceRecord[] = [];
  let totalBoardSlots = 0;
  let activeChooserChoices = 0;
  let departedChooserChoices = 0;

  for (const season of [...bySeason.keys()].sort((a, b) => a - b)) {
    const seasonPicks = [...(bySeason.get(season) ?? [])].sort(
      (a, b) => Number(a.overallPick) - Number(b.overallPick),
    );
    const seasonUniverse = buildSeasonUniverse(seasonPicks);
    const teamCount = teamCountForSeason(seasonPicks);
    const draftedKeys = new Set<string>();
    const draftedPlayers: ChoicePlayer[] = [];
    const recentBoardPositions: string[] = [];

    for (const row of seasonPicks) {
      totalBoardSlots++;
      const player = toChoicePlayer(row);
      const playerKey = normalizePlayerKey(player.playerName);
      const truth = parseTruth(row.rawPick);

      const availableSet = seasonUniverse.filter((p) => !draftedKeys.has(normalizePlayerKey(p.playerName)));

      if (truth.draftedForAnalytics && player.playerName) {
        const { profileKey, displayName } = resolvePickOwnerKey(row, teamsBySeason, nameToOwnerId, keyRemap);
        const role = chooserRoleFor(profileKey, activeProfileKeys);
        if (role === "active") activeChooserChoices++;
        else departedChooserChoices++;

        const roomState = buildRoomState({
          picksSoFar: draftedPlayers.length,
          teamCount,
          draftedSoFar: draftedPlayers,
          seasonUniverse,
          availableSet,
          recentBoardPositions: [...recentBoardPositions],
        });

        choiceRecords.push({
          leagueId,
          season,
          round: Number(row.roundId) || Math.ceil(Number(row.overallPick) / teamCount),
          roundPick: Number(row.roundPick) || 0,
          overallPick: Number(row.overallPick),
          chooserProfileKey: profileKey,
          chooserDisplayName: displayName,
          chooserRole: role,
          chosenPlayer: player,
          availableSet: [...availableSet],
          roomState,
        });
      }

      if (playerKey && player.playerName) {
        draftedKeys.add(playerKey);
        draftedPlayers.push(player);
        recentBoardPositions.push(player.position);
      }
    }
  }

  return {
    leagueId,
    choiceRecords,
    stats: {
      totalBoardSlots,
      openChoiceEvents: choiceRecords.length,
      activeChooserChoices,
      departedChooserChoices,
      seasons: bySeason.size,
    },
  };
}

/** Headline alternatives for plain-English display (same position first). */
export function pickHeadlineAlternatives(record: ChoiceRecord, maxNames = 4): ChoicePlayer[] {
  const chosenKey = normalizePlayerKey(record.chosenPlayer.playerName);
  const passed = record.availableSet.filter((p) => normalizePlayerKey(p.playerName) !== chosenKey);
  const pos = record.chosenPlayer.position;
  const samePos = passed.filter((p) => p.position === pos);
  const otherPos = passed.filter((p) => p.position !== pos);
  return [...samePos, ...otherPos].slice(0, maxNames);
}

export function formatChoiceRecordPlain(record: ChoiceRecord): string {
  const alts = pickHeadlineAlternatives(record);
  const altNames = alts.map((p) => p.playerName).join(", ");
  const others = record.availableSet.length - 1 - alts.length;
  const othersSuffix = others > 0 ? `, +${others} others` : "";
  const roundLabel = `R${record.round}.${String(record.roundPick || record.overallPick).padStart(2, "0")}`;
  const room = formatRoomStatePlain(record.roomState);
  return `${record.season} ${roundLabel} — chose ${record.chosenPlayer.playerName} (${record.chosenPlayer.position}) over ${altNames}${othersSuffix}; ${room}`;
}

export function choiceRecordsForOwner(ledger: ChoiceLedger, profileOwnerKey: string): ChoiceRecord[] {
  return ledger.choiceRecords.filter((r) => r.chooserProfileKey === profileOwnerKey);
}
