/**
 * RFSN Live TTS telemetry — separate from text broadcast telemetry.
 */
export type RfsnTtsTelemetryEvent = {
  at: string;
  voice: string;
  commentaryId: string;
  pickId: string;
  event:
    | "audio_requested"
    | "audio_success"
    | "audio_failure"
    | "audio_timeout"
    | "audio_stale_discard"
    | "playback_started"
    | "playback_completed"
    | "playback_interrupted"
    | "fallback_to_text";
  upstreamLatencyMs?: number;
  bytes?: number;
  cacheStatus?: "hit" | "miss" | "unknown";
  error?: string;
};

const MAX_EVENTS = 300;
const events: RfsnTtsTelemetryEvent[] = [];

export function recordRfsnTtsTelemetry(
  event: Omit<RfsnTtsTelemetryEvent, "at">,
): void {
  events.push({ ...event, at: new Date().toISOString() });
  while (events.length > MAX_EVENTS) events.shift();
}

export function getRfsnTtsTelemetrySnapshot(): readonly RfsnTtsTelemetryEvent[] {
  return events;
}

export function resetRfsnTtsTelemetryForTests(): void {
  events.length = 0;
}
