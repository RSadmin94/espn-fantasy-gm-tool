/**
 * Incremental DraftMoment builder for live locked picks — one moment per final pick.
 *
 * Receipt context uses the live ESPN ADP board (same source as Draft War Room), not the
 * shadow certification fixture. Client may also overlay per-pick ADP from the available pool.
 */
import { buildDraftMomentsFromContext } from "../draftMoments/draftMomentBuilder";
import { buildIdentityResolver } from "../draftMoments/draftMomentIdentityService";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import { momentConfigForDraftPace, type DraftPace } from "../draftMoments/draftMomentTypes";
import { normName, type MockPickLike } from "../draftMoments/draftMomentReceiptService";
import { applyEarlyRoundWrittenFloor } from "./liveDraftWrittenFloor";
import {
  buildLiveReceiptContext,
  ensureLiveEspnAdpBoard,
  loadLiveRivalryOverlay,
  resetLiveDraftReceiptContextForTests,
  type LiveRivalryOverlay,
} from "./liveDraftReceiptContext";

export type LockedPickInput = {
  overallPick: number;
  round: number;
  roundPick: number;
  teamId: string;
  ownerName: string;
  playerId: string;
  playerName: string;
  position: string;
  nflTeam?: string | null;
  /** ESPN ADP from War Room pool — belt-and-suspenders when board name match fails. */
  adp?: number | null;
};

type DraftAccumulator = {
  leagueId: string;
  draftId: string;
  season: number;
  teamCount: number;
  picks: MockPickLike[];
  /** Per-pick ADP overlays accumulated across the session. */
  adpOverlays: Array<{ playerName: string; position: string; adp?: number | null; playerId?: string }>;
  /** Cached rivalry overlay for this live session (null = unavailable). */
  rivalry: LiveRivalryOverlay | null;
  rivalryLoaded: boolean;
};

const accumulators = new Map<string, DraftAccumulator>();

function accKey(leagueId: string, draftId: string): string {
  return `${leagueId}:${draftId}`;
}

export function resetLiveDraftMomentSessionsForTests(): void {
  accumulators.clear();
  resetLiveDraftReceiptContextForTests();
}

export function resetLiveDraftMomentSession(leagueId: string, draftId: string): void {
  accumulators.delete(accKey(leagueId, draftId));
}

export function getLockedPicksForSession(leagueId: string, draftId: string): MockPickLike[] {
  const acc = accumulators.get(accKey(leagueId, draftId));
  return acc ? [...acc.picks] : [];
}

function resolverForPicks(picks: MockPickLike[], season: number) {
  const rows = new Map<string, { season: number; teamId: number; name: string; ownerName: string; ownerId: string }>();
  for (const p of picks) {
    const tid = Number(p.teamId) || 1;
    const key = `${season}:${tid}`;
    if (!rows.has(key)) {
      rows.set(key, {
        season,
        teamId: tid,
        name: `${p.ownerName} Team`,
        ownerName: p.ownerName,
        ownerId: `PID_${p.ownerName.toUpperCase().replace(/\s+/g, "_")}`,
      });
    }
  }
  return buildIdentityResolver([...rows.values()]);
}

export async function buildDraftMomentForLockedPick(
  leagueId: string,
  draftId: string,
  pick: LockedPickInput,
  opts: {
    season?: number;
    reset?: boolean;
    draftPace?: DraftPace;
    teamCount?: number;
    /** Signed-in user — used to load real rivalry overlays (never fabricated). */
    userId?: number | null;
    /** Test-only rivalry injection (skips DB rivalry load when provided). */
    rivalryOverlay?: LiveRivalryOverlay | null;
  } = {},
): Promise<DraftMoment> {
  const key = accKey(leagueId, draftId);
  if (opts.reset) accumulators.delete(key);

  const teamCount = opts.teamCount ?? 14;
  let acc = accumulators.get(key);
  if (!acc) {
    acc = {
      leagueId,
      draftId,
      season: opts.season ?? 2026,
      teamCount,
      picks: [],
      adpOverlays: [],
      rivalry: null,
      rivalryLoaded: false,
    };
    accumulators.set(key, acc);
  } else if (opts.teamCount != null) {
    acc.teamCount = opts.teamCount;
  }

  const board = await ensureLiveEspnAdpBoard();
  const nflFromBoard = board.nflTeamByName.get(normName(pick.playerName)) ?? null;

  const mockPick: MockPickLike = {
    overall: pick.overallPick,
    round: pick.round,
    roundPick: pick.roundPick,
    teamId: pick.teamId,
    ownerName: pick.ownerName,
    playerId: pick.playerId,
    playerName: pick.playerName,
    position: pick.position,
    nflTeam: pick.nflTeam ?? nflFromBoard,
  };

  if (!acc.picks.some((p) => p.overall === mockPick.overall)) {
    acc.picks.push(mockPick);
    acc.picks.sort((a, b) => a.overall - b.overall);
    acc.adpOverlays.push({
      playerName: pick.playerName,
      position: pick.position,
      adp: pick.adp,
      playerId: pick.playerId,
    });
  }

  if (opts.rivalryOverlay !== undefined) {
    acc.rivalry = opts.rivalryOverlay;
    acc.rivalryLoaded = true;
  } else if (!acc.rivalryLoaded) {
    acc.rivalry = await loadLiveRivalryOverlay({
      userId: opts.userId,
      leagueId,
      ownerNames: acc.picks.map((p) => p.ownerName),
    });
    acc.rivalryLoaded = true;
  } else if (acc.rivalry) {
    // Rematch stored rival names to newly-seen draft owners (no DB reload).
    const draftNames = acc.picks.map((p) => p.ownerName);
    acc.rivalry = {
      ...acc.rivalry,
      rivals: acc.rivalry.rivals.map((r) => {
        const matched =
          draftNames.find((n) => normName(n) === normName(r.ownerName)) ??
          draftNames.find(
            (n) =>
              normName(n).includes(normName(r.ownerName)) ||
              normName(r.ownerName).includes(normName(n)),
          ) ??
          r.ownerName;
        return { ...r, ownerName: matched };
      }),
    };
  }

  const ctx = buildLiveReceiptContext({
    leagueId,
    teamCount: acc.teamCount,
    board,
    overlays: acc.adpOverlays,
    rivalry: acc.rivalry,
  });

  const moments = buildDraftMomentsFromContext({
    leagueId,
    draftId,
    season: acc.season,
    mockPicks: acc.picks,
    ctx,
    resolver: resolverForPicks(acc.picks, acc.season),
    config: momentConfigForDraftPace(opts.draftPace),
  });

  const moment = moments.find((m) => m.overallPick === pick.overallPick);
  if (!moment) {
    throw new Error(`Failed to build DraftMoment for pick ${pick.overallPick}`);
  }
  return applyEarlyRoundWrittenFloor(moment);
}
