/**
 * BroadcastFrame → RFSN adapter inputs. Pure mapping; does not modify frame or adapter contracts.
 */
import type { BroadcastFrame, BroadcastContext } from "./broadcastFrameContract";
import type {
  CommentaryAcceptanceStatus,
  CommentaryEditorialRole,
  RfsnBroadcastMomentContext,
  RfsnCommentaryResult,
} from "../../../client/src/lib/rfsnBroadcastAdapter";
import type { RfsnCommentatorId } from "../../../client/src/lib/rfsnPresentation";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";

const VOICE_LABELS: Record<RfsnCommentatorId, string> = {
  sofia: "History Check",
  coach: "Coach's Clipboard",
  roxanne: "Hot Take",
};

function mapStatus(accepted: boolean, rejectionCategory?: string): CommentaryAcceptanceStatus {
  if (accepted) return "accepted";
  if (!rejectionCategory) return "empty";
  if (rejectionCategory === "generation" || rejectionCategory === "provider") return "generation_failed";
  return "rejected";
}

function pickIdentityFromFrame(frame: BroadcastFrame): {
  draftId: string;
  pickNumber: number;
  pickId: string;
} | null {
  const id = frame.public.identity;
  if (id.kind === "draft_pick") {
    return { draftId: id.draftId, pickNumber: id.pickNumber, pickId: id.pickId };
  }
  return null;
}

function pickIdentityFromMoment(moment: DraftMoment): {
  draftId: string;
  pickNumber: number;
  pickId: string;
} {
  return { draftId: moment.draftId, pickNumber: moment.overallPick, pickId: moment.eventId };
}

export function broadcastContextToRfsn(context: BroadcastContext): RfsnBroadcastMomentContext | undefined {
  if (context.kind === "none") return undefined;
  if (context.kind === "breaking_news") {
    return { breakingNews: { headline: context.headline, body: context.body } };
  }
  if (context.kind === "position_run") {
    return { positionRun: { count: context.count, position: context.position } };
  }
  if (context.kind === "league_storyline") {
    return { leagueStoryline: { title: context.title, body: context.body } };
  }
  return undefined;
}

/** Map on-air voices from a BroadcastFrame to adapter commentary results with editorial roles. */
export function broadcastFrameToCommentaryResults(
  frame: BroadcastFrame,
  moment?: DraftMoment,
): RfsnCommentaryResult[] {
  const identity = pickIdentityFromFrame(frame) ?? (moment ? pickIdentityFromMoment(moment) : null);
  if (!identity) return [];

  const slots: { voice: NonNullable<typeof frame.public.primaryVoice>; role: CommentaryEditorialRole }[] = [];
  if (frame.public.primaryVoice) slots.push({ voice: frame.public.primaryVoice, role: "primary" });
  if (frame.public.secondaryVoice) slots.push({ voice: frame.public.secondaryVoice, role: "secondary" });
  for (const v of frame.public.deferredVoices) {
    slots.push({ voice: v, role: "deferred" });
  }

  return slots.map(({ voice: v, role }) => ({
    draftId: identity.draftId,
    pickNumber: identity.pickNumber,
    pickId: identity.pickId,
    commentator: v.voice as RfsnCommentatorId,
    label: VOICE_LABELS[v.voice as RfsnCommentatorId] ?? v.voice,
    text: v.text ?? "",
    status: mapStatus(v.accepted, v.rejectionCategory),
    editorialRole: role,
    ...(v.text && v.text.length > 120 ? { long: true } : {}),
  }));
}

/** Include rejected attempts for shadow metrics (not passed to adapter on-air path). */
export function broadcastFrameDiagnosticsToCommentaryResults(
  frame: BroadcastFrame,
  moment?: DraftMoment,
): RfsnCommentaryResult[] {
  const identity = pickIdentityFromFrame(frame) ?? (moment ? pickIdentityFromMoment(moment) : null);
  if (!identity) return [];

  return frame.diagnostics.voiceAttempts.map((v) => ({
    draftId: identity.draftId,
    pickNumber: identity.pickNumber,
    pickId: identity.pickId,
    commentator: v.voice as RfsnCommentatorId,
    label: VOICE_LABELS[v.voice as RfsnCommentatorId] ?? v.voice,
    text: v.text ?? "",
    status: mapStatus(v.accepted, v.rejectionCategory),
  }));
}

export function draftMomentToRfsnDraftBoard(moment: DraftMoment, teamCount = 14): import("../../../client/src/lib/rfsnBroadcastAdapter").RfsnDraftBoardInput {
  const pos = moment.player.position.toUpperCase();
  const validPos = ["QB", "RB", "WR", "TE", "K", "DST"].includes(pos) ? pos : "WR";
  return {
    round: moment.round,
    pickInRound: moment.roundPick,
    overallPick: `${moment.round}.${String(moment.roundPick).padStart(2, "0")}`,
    onClockTeam: moment.owner.ownerName,
    clockSeconds: 90,
    draftOrder: [{
      pickLabel: `${moment.round}.${String(moment.roundPick).padStart(2, "0")}`,
      teamName: moment.owner.ownerName,
      teamAbbr: moment.owner.ownerName.slice(0, 3).toUpperCase(),
      isOnClock: true,
    }],
    board: [{
      rank: moment.overallPick,
      player: moment.player.playerName,
      position: validPos as "QB" | "RB" | "WR" | "TE" | "K" | "DST",
      team: moment.player.nflTeam ?? "FA",
      bye: 0,
      adp: moment.player.adp ?? 0,
      isOnClock: true,
    }],
    championshipOdds: [],
  };
}

export function serializeRfsnSnapshot(snapshot: import("../../../client/src/lib/rfsnPresentation").RfsnBroadcastSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
