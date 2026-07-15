/**
 * Incremental DraftMoment builder for live locked picks — one moment per final pick.
 */
import { buildDraftMomentsFromContext } from "../draftMoments/draftMomentBuilder";
import { buildIdentityResolver } from "../draftMoments/draftMomentIdentityService";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import { momentConfigForDraftPace, type DraftPace } from "../draftMoments/draftMomentTypes";
import type { MockPickLike } from "../draftMoments/draftMomentReceiptService";
import { makeShadowReceiptContext } from "./shadowDraftSources";
import {
  applyLiveRivalryOverlay,
  loadLiveRivalryOverlay,
  type LiveRivalryOverlay,
} from "./liveDraftRivalryOverlay";

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
};

type DraftAccumulator = {
  leagueId: string;
  draftId: string;
  season: number;
  picks: MockPickLike[];
  rivalry: LiveRivalryOverlay | null;
  rivalryLoaded: boolean;
};

const accumulators = new Map<string, DraftAccumulator>();

function accKey(leagueId: string, draftId: string): string {
  return `${leagueId}:${draftId}`;
}

export function resetLiveDraftMomentSessionsForTests(): void {
  accumulators.clear();
}

export function resetLiveDraftMomentSession(leagueId: string, draftId: string): void {
  accumulators.delete(accKey(leagueId, draftId));
}

export function getLockedPicksForSession(leagueId: string, draftId: string): MockPickLike[] {
  const acc = accumulators.get(accKey(leagueId, draftId));
  return acc ? [...acc.picks] : [];
}

function resolverForPicks(picks: MockPickLike[]) {
  const rows = new Map<string, { season: number; teamId: number; name: string; ownerName: string; ownerId: string }>();
  for (const p of picks) {
    const tid = Number(p.teamId) || 1;
    const key = `2026:${tid}`;
    if (!rows.has(key)) {
      rows.set(key, {
        season: 2026,
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
    /** Signed-in user — loads grounded rivalry (never fabricated). */
    userId?: number | null;
    /** Test-only rivalry injection. */
    rivalryOverlay?: LiveRivalryOverlay | null;
  } = {},
): Promise<DraftMoment> {
  const key = accKey(leagueId, draftId);
  if (opts.reset) accumulators.delete(key);

  let acc = accumulators.get(key);
  if (!acc) {
    acc = {
      leagueId,
      draftId,
      season: opts.season ?? 2026,
      picks: [],
      rivalry: null,
      rivalryLoaded: false,
    };
    accumulators.set(key, acc);
  }

  const mockPick: MockPickLike = {
    overall: pick.overallPick,
    round: pick.round,
    roundPick: pick.roundPick,
    teamId: pick.teamId,
    ownerName: pick.ownerName,
    playerId: pick.playerId,
    playerName: pick.playerName,
    position: pick.position,
    nflTeam: pick.nflTeam ?? null,
  };

  if (!acc.picks.some((p) => p.overall === mockPick.overall)) {
    acc.picks.push(mockPick);
    acc.picks.sort((a, b) => a.overall - b.overall);
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
    const draftNames = acc.picks.map((p) => p.ownerName);
    acc.rivalry = {
      ...acc.rivalry,
      rivals: acc.rivalry.rivals.map((r) => {
        const matched =
          draftNames.find((n) => n.trim().toLowerCase() === r.ownerName.trim().toLowerCase()) ??
          r.ownerName;
        return { ...r, ownerName: matched };
      }),
    };
  }

  // When a real rivalry overlay is present, replace shadow Alice faux rivals.
  // When unavailable, keep the shadow context so offline/dev drafts still exercise the lane.
  let ctx = makeShadowReceiptContext({ leagueId, teamCount: 14 });
  if (acc.rivalry) {
    ctx = {
      ...ctx,
      rivalById: new Map(),
      focalMemberId: "",
    };
    ctx = applyLiveRivalryOverlay(ctx, acc.rivalry);
  }

  const moments = buildDraftMomentsFromContext({
    leagueId,
    draftId,
    season: acc.season,
    mockPicks: acc.picks,
    ctx,
    resolver: resolverForPicks(acc.picks),
    config: momentConfigForDraftPace(opts.draftPace),
  });

  const moment = moments.find((m) => m.overallPick === pick.overallPick);
  if (!moment) {
    throw new Error(`Failed to build DraftMoment for pick ${pick.overallPick}`);
  }
  return moment;
}
