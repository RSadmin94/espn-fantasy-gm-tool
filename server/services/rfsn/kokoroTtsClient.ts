/**
 * Server-only Kokoro TTS HTTP client.
 */
import type { RfsnCommentatorId } from "../../../client/src/lib/rfsnPresentation";
import {
  assertRfsnTtsVoice,
  getRfsnTtsServiceToken,
  getRfsnTtsServiceUrl,
  getRfsnTtsTimeoutMs,
  isRfsnTtsOperational,
  RFSN_TTS_MAX_TEXT_LENGTH,
} from "./rfsnTtsConfig";

export type SynthesizeAnalystSpeechInput = {
  voice: RfsnCommentatorId | string;
  text: string;
  signal?: AbortSignal;
};

export type SynthesizeAnalystSpeechResult = {
  contentType: "audio/wav";
  bytes: Buffer;
  durationMs: number;
  cacheStatus: "hit" | "miss" | "unknown";
};

function isValidWavHeader(bytes: Buffer): boolean {
  return (
    bytes.length >= 44 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WAVE"
  );
}

function sanitizeUpstreamError(status: number): string {
  if (status >= 400 && status < 500) return "invalid request";
  return "synthesis failed";
}

export async function synthesizeAnalystSpeech(
  input: SynthesizeAnalystSpeechInput,
): Promise<SynthesizeAnalystSpeechResult> {
  if (!isRfsnTtsOperational()) {
    throw new Error("tts disabled");
  }

  const voice = assertRfsnTtsVoice(String(input.voice));
  const text = input.text.trim().slice(0, RFSN_TTS_MAX_TEXT_LENGTH);
  if (!text) {
    throw new Error("empty text");
  }

  const baseUrl = getRfsnTtsServiceUrl();
  const token = getRfsnTtsServiceToken();
  if (!baseUrl || !token) {
    throw new Error("tts not configured");
  }

  const started = Date.now();
  const timeoutMs = getRfsnTtsTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (input.signal) {
    if (input.signal.aborted) {
      clearTimeout(timeout);
      throw new Error("timeout");
    }
    input.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(`${baseUrl}/synthesize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "audio/wav",
      },
      body: JSON.stringify({ voice, text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(sanitizeUpstreamError(response.status));
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("audio/wav")) {
      throw new Error("invalid response");
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    if (!isValidWavHeader(bytes)) {
      throw new Error("invalid wav");
    }

    const cacheHeader = response.headers.get("x-cache-status")?.toLowerCase();
    const cacheStatus: SynthesizeAnalystSpeechResult["cacheStatus"] =
      cacheHeader === "hit" || cacheHeader === "miss" ? cacheHeader : "unknown";

    return {
      contentType: "audio/wav",
      bytes,
      durationMs: Date.now() - started,
      cacheStatus,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("timeout");
    }
    if (error instanceof Error && ["invalid request", "invalid response", "invalid wav", "empty text", "unsupported voice"].some((m) => error.message.includes(m))) {
      throw error;
    }
    throw new Error("synthesis failed");
  } finally {
    clearTimeout(timeout);
  }
}
