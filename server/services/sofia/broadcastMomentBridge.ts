/**
 * Event bridges — adapt domain moments into generic BroadcastMoment inputs.
 */
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import type { BroadcastContext, BroadcastMomentIdentity } from "./broadcastFrameContract";
import type { BroadcastMoment, BroadcastMomentReceipt } from "./broadcastMomentTypes";
import type { FactPacket } from "./broadcastVoice";

export function draftMomentToIdentity(moment: DraftMoment): BroadcastMomentIdentity {
  return {
    kind: "draft_pick",
    draftId: moment.draftId,
    pickNumber: moment.overallPick,
    pickId: moment.eventId,
  };
}

export function draftMomentToFactPacket(moment: DraftMoment): FactPacket {
  const claims = moment.permittedClaims.filter(Boolean);
  return {
    subject: {
      ownerName: moment.owner.ownerName,
      playerName: moment.player.playerName,
      position: moment.player.position,
      overallPick: moment.overallPick,
      round: moment.round,
      roundPick: moment.roundPick,
    },
    verifiedFacts: claims.length > 0 ? claims : [
      `${moment.owner.ownerName} selected ${moment.player.playerName} (${moment.player.position}) at pick ${moment.overallPick}, round ${moment.round}.`,
    ],
    storylines: [moment.primaryStoryline, moment.secondaryStoryline].filter((s): s is string => Boolean(s)),
    entities: [moment.owner.ownerName, moment.player.playerName],
    significance: moment.level,
  };
}

export function inferBroadcastContext(
  moment: DraftMoment,
  override?: BroadcastContext,
): BroadcastContext {
  if (override) return override;

  const hasRunSignal =
    moment.primaryStoryline === "POSITION_RUN" ||
    moment.signals.some((s) => s.startsWith("POSITION_RUN") || s.startsWith("CONSEQUENTIAL_RUN"));
  if (hasRunSignal) {
    const positionRun = moment.receipts.find((r) => r.id === "positionRun" && r.status === "available");
    const v = positionRun?.value && typeof positionRun.value === "object"
      ? (positionRun.value as { includingThis?: number; count?: number })
      : null;
    const count = v?.includingThis ?? v?.count ?? Math.max(1, moment.rosterBeforePick[moment.player.position] ?? 1);
    return { kind: "position_run", count, position: moment.player.position };
  }

  return { kind: "none" };
}

export function draftMomentHeadline(moment: DraftMoment): string | null {
  if (moment.primaryStoryline) return moment.primaryStoryline.replace(/_/g, " ");
  if (moment.level === "historic") return "HISTORIC PICK";
  if (moment.level === "major") return "MAJOR MOMENT";
  return null;
}

export function momentHasRivalry(moment: DraftMoment): boolean {
  return moment.receipts.some((r) => r.id === "rivalry" && r.status === "available");
}

export function identitiesEqual(a: BroadcastMomentIdentity, b: BroadcastMomentIdentity): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "draft_pick" && b.kind === "draft_pick") {
    return a.draftId === b.draftId && a.pickNumber === b.pickNumber && a.pickId === b.pickId;
  }
  if (a.kind === "league_event" && b.kind === "league_event") {
    return a.leagueId === b.leagueId && a.eventId === b.eventId;
  }
  return false;
}

function mapReceipts(moment: DraftMoment): BroadcastMomentReceipt[] {
  return moment.receipts
    .filter((r) => r.status === "available")
    .map((r) => ({ id: r.id, type: r.type }));
}

function buildCallbackKeys(moment: DraftMoment): string[] {
  const keys: string[] = [];
  if (moment.primaryStoryline) keys.push(`story:${moment.primaryStoryline}`);
  if (moment.secondaryStoryline) keys.push(`story:${moment.secondaryStoryline}`);
  for (const r of moment.receipts) {
    if (r.status === "available") keys.push(`receipt:${r.id}`);
  }
  return keys;
}

/** Normalize classifier signal strings for editorial routing (REACH(strong) → REACH:strong). */
export function normalizeDraftSignals(signals: readonly string[]): string[] {
  return signals.map((s) => s.replace(/\(strong\)/gi, ":strong"));
}

/** Draft pick → generic BroadcastMoment (orchestrator input). */
export function draftMomentToBroadcastMoment(
  moment: DraftMoment,
  opts: {
    context?: BroadcastContext;
    headline?: string | null;
    momentType?: string;
    overrideDecompression?: boolean;
    editorialPlanId?: BroadcastMoment["editorialPlanId"];
  } = {},
): BroadcastMoment {
  return {
    identity: draftMomentToIdentity(moment),
    momentType: opts.momentType ?? "draft_pick",
    significance: moment.level,
    headline: opts.headline ?? draftMomentHeadline(moment),
    context: inferBroadcastContext(moment, opts.context),
    factPacket: draftMomentToFactPacket(moment),
    commentaryBudget: moment.commentaryBudget,
    signals: normalizeDraftSignals(moment.signals),
    storylines: [moment.primaryStoryline, moment.secondaryStoryline].filter((s): s is string => Boolean(s)),
    receipts: mapReceipts(moment),
    primaryStoryline: moment.primaryStoryline,
    editorialPlanId: opts.editorialPlanId,
    overrideDecompression: opts.overrideDecompression,
    callbackKeys: buildCallbackKeys(moment),
  };
}

/** League event → generic BroadcastMoment (bridge stub for future event types). */
export function leagueEventToBroadcastMoment(input: {
  leagueId: string;
  eventId: string;
  occurredAt: string;
  momentType: string;
  significance: BroadcastMoment["significance"];
  headline: string | null;
  context?: BroadcastContext;
  factPacket: FactPacket;
  commentaryBudget?: BroadcastMoment["commentaryBudget"];
  signals?: string[];
  storylines?: string[];
  receipts?: BroadcastMomentReceipt[];
  editorialPlanId?: BroadcastMoment["editorialPlanId"];
  overrideDecompression?: boolean;
  callbackKeys?: string[];
}): BroadcastMoment {
  return {
    identity: {
      kind: "league_event",
      leagueId: input.leagueId,
      eventId: input.eventId,
      occurredAt: input.occurredAt,
    },
    momentType: input.momentType,
    significance: input.significance,
    headline: input.headline,
    context: input.context ?? { kind: "none" },
    factPacket: input.factPacket,
    commentaryBudget: input.commentaryBudget ?? { enabled: true, maxSentences: 2, maxWords: 40 },
    signals: input.signals ?? [],
    storylines: input.storylines ?? [],
    receipts: input.receipts ?? [],
    primaryStoryline: input.storylines?.[0] ?? null,
    editorialPlanId: input.editorialPlanId,
    overrideDecompression: input.overrideDecompression,
    callbackKeys: input.callbackKeys ?? [],
  };
}
