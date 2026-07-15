/**
 * Sofia Phase 2B — model provider abstraction.
 *
 * `SofiaModelProvider` is the only seam Sofia uses to reach a model. Swapping models (Qwen, Claude,
 * GPT, Gemini) means adding a new implementation here — no changes elsewhere. This module contains
 * PRODUCTION providers only; test doubles live in the test file, not here.
 *
 * Shadow-phase scope: this provider is only ever invoked by the shadow runner / the untracked manual
 * smoke script. It is NOT wired into any endpoint, the commentary path, routing, or persistence.
 */

export interface SofiaModelProvider {
  /** Send a fully-formed prompt, get raw text back. Throws SofiaProviderError on any failure. */
  complete(prompt: string): Promise<string>;
}

export type SofiaProviderErrorKind =
  | "configuration_error"
  | "timeout"
  | "provider_error"
  | "empty_response";

/** Sanitized provider error — never carries the key, headers, or full payload. */
export class SofiaProviderError extends Error {
  constructor(public readonly kind: SofiaProviderErrorKind, message: string) {
    super(message);
    this.name = "SofiaProviderError";
  }
}

export interface DeepSeekProviderOptions {
  model?: string;
  timeoutMs?: number;
  /** Sampling temperature. Default 0 (classification / grounding). Voice generation uses ~0.9. */
  temperature?: number;
  /** Request DeepSeek's API-enforced JSON output. Default true. */
  jsonMode?: boolean;
}

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash"; // legacy deepseek-chat alias retires 2026-07-24
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * DeepSeek provider. Reads the key from process.env.DEEPSEEK_API_KEY and FAILS CLOSED — a missing key
 * throws configuration_error rather than silently no-op'ing. Errors are sanitized: the key, auth
 * header, and raw request are never included in thrown messages.
 */
export class DeepSeekProvider implements SofiaModelProvider {
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly jsonMode: boolean;

  constructor(opts: DeepSeekProviderOptions = {}) {
    this.model = opts.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.temperature = opts.temperature ?? 0;
    this.jsonMode = opts.jsonMode ?? true;
  }

  async complete(prompt: string): Promise<string> {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key || !key.trim()) {
      throw new SofiaProviderError("configuration_error", "DEEPSEEK_API_KEY is not set");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: this.temperature,
          max_tokens: 512,
          // Non-thinking mode. This is a JSON truth-classification, not a reasoning task. DeepSeek V4
          // enables thinking by DEFAULT; leaving it on let reasoning tokens consume the whole completion
          // budget on interpretive inputs (finish_reason=length, empty content -> empty_response). Disabling
          // it is DeepSeek's recommended config for classification routes and eliminates that failure class,
          // while cutting output tokens (cost) and latency. (max_tokens is a ceiling, not a charge.)
          thinking: { type: "disabled" },
          ...(this.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });
    } catch (e) {
      // AbortError -> timeout; anything else -> generic provider error. Never leak the request.
      if (e instanceof Error && e.name === "AbortError") {
        throw new SofiaProviderError("timeout", `request exceeded ${this.timeoutMs}ms`);
      }
      throw new SofiaProviderError("provider_error", "network request to model provider failed");
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // status code only — never the response body (may echo request context)
      throw new SofiaProviderError("provider_error", `model provider returned HTTP ${res.status}`);
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new SofiaProviderError("empty_response", "model provider returned unparseable body");
    }
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new SofiaProviderError("empty_response", "model provider returned no content");
    }
    return text;
  }
}
