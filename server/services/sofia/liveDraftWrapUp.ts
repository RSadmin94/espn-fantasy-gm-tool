/**
 * End-of-draft RFSN wrap-up — one league_event moment after the final pick locks.
 */
import { selectBiggestClassifiedReach } from "../draftMoments/reachClassification";
import { leagueEventToBroadcastMoment } from "./broadcastMomentBridge";
import type { BroadcastMoment } from "./broadcastMomentTypes";
import type { FactPacket } from "./broadcastVoice";
import { makeShadowReceiptContext } from "./shadowDraftSources";
import { normName } from "../draftMoments/draftMomentReceiptService";
import type { MockPickLike } from "../draftMoments/draftMomentReceiptService";

export type DraftWrapUpSummary = {
  totalPicks: number;
  teamCount: number;
  bestValue?: { playerName: string; ownerName: string; pick: number; adp: number; delta: number };
  biggestReach?: { playerName: string; ownerName: string; pick: number; adp: number; delta: number };
  topPosition?: { position: string; count: number };
};

export function wrapUpEventIdForDraft(draftId: string): string {
  return `wrap-up:${draftId}`;
}

export function summarizeDraftWrapUp(
  picks: readonly MockPickLike[],
  teamCount: number,
  adpByName?: Map<string, number>,
): DraftWrapUpSummary {
  const adp = adpByName ?? makeShadowReceiptContext().adpByName;
  let bestValue: DraftWrapUpSummary["bestValue"];
  const posCounts = new Map<string, number>();
  const reachCandidates: Array<{
    name: string;
    teamName: string;
    pickNumber: number;
    adp: number;
    round: number;
  }> = [];

  for (const p of picks) {
    const pos = String(p.position ?? "?").toUpperCase();
    posCounts.set(pos, (posCounts.get(pos) ?? 0) + 1);
    const playerAdp = adp.get(normName(p.playerName));
    if (playerAdp == null) continue;
    const valueDelta = playerAdp - p.overall;
    if (valueDelta >= 3 && (!bestValue || valueDelta > bestValue.delta)) {
      bestValue = {
        playerName: p.playerName,
        ownerName: p.ownerName,
        pick: p.overall,
        adp: playerAdp,
        delta: valueDelta,
      };
    }
    reachCandidates.push({
      name: p.playerName,
      teamName: p.ownerName,
      pickNumber: p.overall,
      adp: playerAdp,
      round: p.round,
    });
  }

  const classified = selectBiggestClassifiedReach(reachCandidates, teamCount);
  const biggestReach: DraftWrapUpSummary["biggestReach"] = classified
    ? {
        playerName: classified.name,
        ownerName: classified.team,
        pick: classified.pickNumber,
        adp: classified.adp,
        delta: classified.reachDelta,
      }
    : undefined;

  const topPosition = [...posCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    totalPicks: picks.length,
    teamCount,
    bestValue,
    biggestReach,
    topPosition:
      topPosition && topPosition[1] < picks.length * 0.85
        ? { position: topPosition[0], count: topPosition[1] }
        : undefined,
  };
}

export function buildDraftWrapUpBroadcastMoment(
  leagueId: string,
  draftId: string,
  summary: DraftWrapUpSummary,
): BroadcastMoment {
  const claims: string[] = [
    `Draft complete: ${summary.totalPicks} picks across ${summary.teamCount} teams.`,
  ];
  if (summary.bestValue) {
    claims.push(
      `Best value: ${summary.bestValue.playerName} to ${summary.bestValue.ownerName}, ${summary.bestValue.delta} picks ahead of ADP.`,
    );
  }
  if (summary.biggestReach) {
    claims.push(
      `Biggest reach: ${summary.biggestReach.playerName} by ${summary.biggestReach.ownerName}, ${summary.biggestReach.delta} picks early.`,
    );
  }
  if (summary.topPosition) {
    claims.push(
      `Most drafted position: ${summary.topPosition.position} (${summary.topPosition.count} picks).`,
    );
  }

  const entities = new Set<string>(["League"]);
  if (summary.bestValue) {
    entities.add(summary.bestValue.playerName);
    entities.add(summary.bestValue.ownerName);
  }
  if (summary.biggestReach) {
    entities.add(summary.biggestReach.playerName);
    entities.add(summary.biggestReach.ownerName);
  }

  const factPacket: FactPacket = {
    subject: {
      ownerName: "League",
      playerName: "Draft",
      position: "—",
      overallPick: summary.totalPicks,
      round: 0,
      roundPick: 0,
    },
    verifiedFacts: claims,
    storylines: ["DRAFT_WRAP_UP"],
    entities: [...entities],
  };

  return leagueEventToBroadcastMoment({
    leagueId,
    eventId: wrapUpEventIdForDraft(draftId),
    occurredAt: new Date().toISOString(),
    momentType: "draft_wrap_up",
    significance: "historic",
    headline: "Draft complete",
    context: { kind: "league_storyline", title: "Draft wrap-up", body: claims[0]! },
    factPacket,
    commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 45 },
    editorialPlanId: "draft_wrap_up",
    overrideDecompression: true,
    storylines: ["DRAFT_WRAP_UP"],
  });
}
