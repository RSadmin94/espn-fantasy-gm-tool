/**
 * RFSN Live TTS configuration — server-only.
 */
import type { RfsnCommentatorId } from "../../../client/src/lib/rfsnPresentation";

export const RFSN_TTS_MAX_TEXT_LENGTH = 500;
export const RFSN_TTS_SUPPORTED_VOICES: readonly RfsnCommentatorId[] = ["sofia", "coach", "roxanne"];

/** Default disabled — must be explicitly set to "true". */
export function isRfsnTtsEnabled(): boolean {
  return process.env.RFSN_TTS_ENABLED === "true";
}

export function getRfsnTtsServiceUrl(): string | null {
  const raw = process.env.RFSN_TTS_SERVICE_URL?.trim();
  return raw ? raw.replace(/\/$/, "") : null;
}

export function getRfsnTtsServiceToken(): string | null {
  const raw = process.env.RFSN_TTS_SERVICE_TOKEN?.trim();
  return raw || null;
}

export function getRfsnTtsTimeoutMs(): number {
  const raw = Number(process.env.RFSN_TTS_TIMEOUT_MS ?? "5000");
  return Number.isFinite(raw) && raw > 0 ? raw : 5000;
}

/** Enabled with URL + token configured — fail closed for audio when missing. */
export function isRfsnTtsConfigured(): boolean {
  return Boolean(getRfsnTtsServiceUrl() && getRfsnTtsServiceToken());
}

export function isRfsnTtsOperational(): boolean {
  return isRfsnTtsEnabled() && isRfsnTtsConfigured();
}

export function assertRfsnTtsVoice(voice: string): RfsnCommentatorId {
  const key = voice.trim().toLowerCase();
  if ((RFSN_TTS_SUPPORTED_VOICES as readonly string[]).includes(key)) {
    return key as RfsnCommentatorId;
  }
  throw new Error(`unsupported voice: ${voice}`);
}
