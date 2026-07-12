/**
 * Per-moment shadow diagnostics — traces silence/commentary decisions through the pipeline.
 */
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import type { BroadcastFrame } from "./broadcastFrameContract";
import { draftMomentToBroadcastMoment } from "./broadcastMomentBridge";
import { buildEditorialAssignment, resolveEditorialPlanId } from "./broadcastEditorialRouting";
import type { EditorialLedger } from "./editorialLedger";
import type { RfsnBroadcastSnapshot } from "../../../client/src/lib/rfsnPresentation";

export type MomentDiagnosticRow = {
  pickIdentity: string;
  sourceLevel: DraftMoment["level"];
  sourceSignals: string;
  commentaryBudgetEnabled: boolean;
  resolvedEditorialPlan: string;
  voicesRequested: string;
  frameStatus: string;
  frameLeadVoice: string | null;
  snapshotPrimary: string | null;
  snapshotSecondary: string | null;
  commentedOrSilent: "commented" | "silent";
  reason: string;
};

export function diagnoseMoment(
  draftMoment: DraftMoment,
  frame: BroadcastFrame,
  snapshot: RfsnBroadcastSnapshot,
  ledger: EditorialLedger,
): MomentDiagnosticRow {
  const bm = draftMomentToBroadcastMoment(draftMoment);
  const planId = resolveEditorialPlanId(bm);
  const assignment = buildEditorialAssignment(bm, ledger);
  const ledgerSnap = ledger.snapshot();

  const commented =
    frame.public.status !== "suppressed" &&
    frame.public.status !== "expired" &&
    Boolean(frame.public.primaryVoice?.accepted);

  let reason = "";
  if (assignment.silence) {
    reason = assignment.silenceReason ?? "editorial silence";
  } else if (frame.public.status === "expired") {
    reason = "stale/expired frame";
  } else if (!draftMoment.commentaryBudget.enabled) {
    reason = "commentary budget disabled";
  } else if (planId === "routine_pick") {
    reason = "routine_pick plan";
  } else if (ledgerSnap.decompressionRemaining > 0 && draftMoment.level === "routine") {
    reason = "decompression window";
  } else if (commented) {
    reason = `editorial plan ${planId}`;
  } else if (frame.public.status === "failed") {
    reason = "all voices failed grounding/generation";
  } else {
    reason = "voices requested but none accepted";
  }

  return {
    pickIdentity: `${draftMoment.draftId}:${draftMoment.overallPick}:${draftMoment.eventId}`,
    sourceLevel: draftMoment.level,
    sourceSignals: draftMoment.signals.join(", ") || "(none)",
    commentaryBudgetEnabled: draftMoment.commentaryBudget.enabled,
    resolvedEditorialPlan: planId,
    voicesRequested: assignment.request.join(", ") || "(none)",
    frameStatus: frame.public.status,
    frameLeadVoice: frame.public.primaryVoice?.voice ?? null,
    snapshotPrimary: snapshot.primary?.commentator ?? null,
    snapshotSecondary: snapshot.secondary?.commentator ?? null,
    commentedOrSilent: commented ? "commented" : "silent",
    reason,
  };
}

export function formatDiagnosticTable(rows: MomentDiagnosticRow[]): string {
  const header = [
    "pick",
    "level",
    "signals",
    "plan",
    "requested",
    "frame",
    "lead",
    "snapP",
    "outcome",
    "reason",
  ].join("\t");
  const lines = rows.map((r) => [
    r.pickIdentity.split(":").slice(-2).join(":"),
    r.sourceLevel,
    r.sourceSignals,
    r.resolvedEditorialPlan,
    r.voicesRequested,
    r.frameStatus,
    r.frameLeadVoice ?? "-",
    r.snapshotPrimary ?? "-",
    r.commentedOrSilent,
    r.reason,
  ].join("\t"));
  return [header, ...lines].join("\n");
}
