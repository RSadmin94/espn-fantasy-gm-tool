/**
 * Structured logging for RFSN Live audio delivery — no tokens or full commentary.
 */
export type RfsnAudioLogEvent =
  | "clip_created"
  | "clip_requested"
  | "clip_found"
  | "clip_not_found"
  | "clip_expired"
  | "clip_identity_mismatch"
  | "clip_pending"
  | "draft_status_cleared"
  | "draft_status_initialized"
  | "response_status";

export function rfsnAudioInstanceId(): string {
  return (
    process.env.RAILWAY_REPLICA_ID ??
    process.env.RAILWAY_SERVICE_ID ??
    process.env.HOSTNAME ??
    `pid:${process.pid}`
  );
}

export function logRfsnAudio(
  event: RfsnAudioLogEvent,
  fields: Record<string, string | number | boolean | undefined> = {},
): void {
  console.info(
    "[RFSN Audio]",
    JSON.stringify({
      event,
      instance: rfsnAudioInstanceId(),
      ts: Date.now(),
      ...fields,
    }),
  );
}
