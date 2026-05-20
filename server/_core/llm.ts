// ROLLBACK NOTE: Migrated from Manus Forge to Anthropic Claude on 2026-05-19.
// Baseline commit 8a0704f. We may not have the earliest version.
// To roll back: git checkout 8a0704f -- server/_core/llm.ts

import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

/**
 * callType hints help the LLM helper pick a sensible default max_tokens.
 * Callers can always override with an explicit maxTokens value.
 *
 * Defaults:
 *   chat / advisor        → 1024   (conversational, should be snappy)
 *   war_room_agent        → 512    (one agent's focused output)
 *   weekly_briefing       → 2048   (longer narrative report)
 *   retrospective         → 1536   (career / season review)
 *   json_structured       → 1024   (JSON schema responses)
 *   fallback              → 1024
 */
export type LLMCallType =
  | "chat"
  | "advisor"
  | "war_room_agent"
  | "weekly_briefing"
  | "retrospective"
  | "json_structured"
  | "draft_helper";

const CALL_TYPE_DEFAULTS: Record<LLMCallType, number> = {
  chat: 1024,
  advisor: 1024,
  war_room_agent: 512,
  weekly_briefing: 2048,
  retrospective: 1536,
  json_structured: 1024,
  draft_helper: 1024,
};

const DEFAULT_MAX_TOKENS = 1024;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION = "2023-06-01";

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  /** Optional model override. Defaults to claude-sonnet-4-20250514 (or ANTHROPIC_MODEL env). */
  model?: string;
  /** Optional temperature override (0.0–1.0 for Anthropic). */
  temperature?: number;
  /** Hint used to pick a sensible default max_tokens when none is specified. */
  callType?: LLMCallType;
  /**
   * Optional callback to persist usage metrics to the DB.
   * Keeps llm.ts infrastructure-free — callers decide whether to persist.
   * Called after the response completes (or after the stream closes).
   */
  persistUsage?: (usage: {
    callType: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    durationMs: number;
    streaming: boolean;
  }) => void;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// ---------------------------------------------------------------------------
// Anthropic API types (internal)
// ---------------------------------------------------------------------------

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "url"; url: string } | { type: "base64"; media_type: string; data: string };
    }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

type AnthropicTool = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type AnthropicToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "tool"; name: string }
  | { type: "none" };

type AnthropicResponse = {
  id: string;
  type: string;
  role: string;
  model: string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  stop_reason: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const contentToText = (content: MessageContent | MessageContent[]): string => {
  return ensureArray(content)
    .map(part => {
      if (typeof part === "string") return part;
      if (part.type === "text") return part.text;
      return JSON.stringify(part);
    })
    .join("\n");
};

const contentToAnthropicBlocks = (
  content: MessageContent | MessageContent[]
): string | AnthropicContentBlock[] => {
  const parts = ensureArray(content);
  if (parts.length === 1 && typeof parts[0] === "string") {
    return parts[0];
  }

  const blocks: AnthropicContentBlock[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      blocks.push({ type: "text", text: part });
      continue;
    }
    if (part.type === "text") {
      blocks.push({ type: "text", text: part.text });
      continue;
    }
    if (part.type === "image_url") {
      blocks.push({
        type: "image",
        source: { type: "url", url: part.image_url.url },
      });
      continue;
    }
    if (part.type === "file_url") {
      blocks.push({
        type: "text",
        text: `[file: ${part.file_url.url}]`,
      });
    }
  }

  if (blocks.length === 1 && blocks[0].type === "text") {
    return blocks[0].text;
  }
  return blocks;
};

/**
 * Splits system messages into Anthropic's top-level `system` param and maps
 * user/assistant/tool roles to Anthropic message format.
 */
function translateMessages(messages: Message[]): {
  system?: string;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const anthropicMessages: AnthropicMessage[] = [];

  const flushToolResults = (pending: AnthropicContentBlock[]) => {
    if (pending.length === 0) return;
    anthropicMessages.push({ role: "user", content: pending });
    pending.length = 0;
  };

  let pendingToolResults: AnthropicContentBlock[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      flushToolResults(pendingToolResults);
      systemParts.push(contentToText(msg.content));
      continue;
    }

    if (msg.role === "tool" || msg.role === "function") {
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: msg.tool_call_id ?? msg.name ?? "unknown",
        content: contentToText(msg.content),
      });
      continue;
    }

    flushToolResults(pendingToolResults);

    if (msg.role === "assistant") {
      anthropicMessages.push({
        role: "assistant",
        content: contentToAnthropicBlocks(msg.content),
      });
      continue;
    }

    if (msg.role === "user") {
      anthropicMessages.push({
        role: "user",
        content: contentToAnthropicBlocks(msg.content),
      });
    }
  }

  flushToolResults(pendingToolResults);

  const system =
    systemParts.length > 0 ? systemParts.join("\n\n") : undefined;

  return {
    system,
    messages: mergeConsecutiveAnthropicMessages(
      filterEmptyAnthropicMessages(anthropicMessages)
    ),
  };
}

function isAnthropicContentEmpty(
  content: string | AnthropicContentBlock[]
): boolean {
  if (typeof content === "string") {
    return content.trim().length === 0;
  }
  if (content.length === 0) return true;
  return content.every(block => {
    if (block.type === "text") return block.text.trim().length === 0;
    if (block.type === "tool_result") return block.content.trim().length === 0;
    return false;
  });
}

function filterEmptyAnthropicMessages(
  messages: AnthropicMessage[]
): AnthropicMessage[] {
  return messages.filter(msg => !isAnthropicContentEmpty(msg.content));
}

function mergeAnthropicContent(
  a: string | AnthropicContentBlock[],
  b: string | AnthropicContentBlock[]
): string | AnthropicContentBlock[] {
  const toBlocks = (content: string | AnthropicContentBlock[]): AnthropicContentBlock[] => {
    if (typeof content === "string") {
      return content.trim() ? [{ type: "text", text: content }] : [];
    }
    return content;
  };

  const merged = [...toBlocks(a), ...toBlocks(b)];
  if (merged.length === 0) return "";
  if (merged.length === 1 && merged[0].type === "text") {
    return merged[0].text;
  }
  return merged;
}

/** Anthropic requires strict user/assistant alternation — merge consecutive same-role turns. */
function mergeConsecutiveAnthropicMessages(
  messages: AnthropicMessage[]
): AnthropicMessage[] {
  if (messages.length === 0) return messages;

  const merged: AnthropicMessage[] = [];
  for (const msg of messages) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content = mergeAnthropicContent(prev.content, msg.content);
      continue;
    }
    merged.push({ role: msg.role, content: msg.content });
  }
  return merged;
}

/** Converts OpenAI-style tools to Anthropic `input_schema` format. */
function translateTools(tools: Tool[] | undefined): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters ?? { type: "object", properties: {} },
  }));
}

function translateToolChoice(
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): AnthropicToolChoice | undefined {
  if (!toolChoice) return undefined;

  if (toolChoice === "none") return { type: "none" };
  if (toolChoice === "auto") return { type: "auto" };

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    return { type: "any" };
  }

  if ("name" in toolChoice) {
    return { type: "tool", name: toolChoice.name };
  }

  if (toolChoice.type === "function") {
    return { type: "tool", name: toolChoice.function.name };
  }

  return { type: "auto" };
}

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}): ResponseFormat | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

/** Anthropic has no native response_format — inject JSON instructions into system. */
function buildJsonInstruction(format: ResponseFormat | undefined): string | undefined {
  if (!format || format.type === "text") return undefined;

  if (format.type === "json_object") {
    return (
      "Respond with valid JSON only. Do not wrap the response in markdown code fences " +
      "or include any text outside the JSON object."
    );
  }

  const { name, schema, strict } = format.json_schema;
  return (
    `Respond with valid JSON only that conforms to the "${name}" schema` +
    `${strict ? " (strict mode — no extra properties)" : ""}. ` +
    `Do not wrap the response in markdown code fences or include any text outside the JSON.\n\n` +
    `Schema:\n${JSON.stringify(schema, null, 2)}`
  );
}

function buildInvokeResult(anthropic: AnthropicResponse): InvokeResult {
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of anthropic.content) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  const finishReasonMap: Record<string, string> = {
    end_turn: "stop",
    max_tokens: "length",
    tool_use: "tool_calls",
    stop_sequence: "stop",
  };

  return {
    id: anthropic.id,
    created: Math.floor(Date.now() / 1000),
    model: anthropic.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textParts.join(""),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason:
          finishReasonMap[anthropic.stop_reason ?? ""] ??
          anthropic.stop_reason,
      },
    ],
    usage: anthropic.usage
      ? {
          prompt_tokens: anthropic.usage.input_tokens,
          completion_tokens: anthropic.usage.output_tokens,
          total_tokens:
            anthropic.usage.input_tokens + anthropic.usage.output_tokens,
        }
      : undefined,
  };
}

const assertApiKey = () => {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
};

function resolveModel(explicit?: string): string {
  return explicit ?? (ENV.anthropicModel || DEFAULT_MODEL);
}

/**
 * Resolve the effective max_tokens for a call.
 * Priority: explicit maxTokens/max_tokens > callType default > global default.
 */
function resolveMaxTokens(params: InvokeParams): number {
  const explicit = params.maxTokens ?? params.max_tokens;
  if (explicit != null && explicit > 0) return explicit;
  if (params.callType) return CALL_TYPE_DEFAULTS[params.callType] ?? DEFAULT_MAX_TOKENS;
  return DEFAULT_MAX_TOKENS;
}

/**
 * Safe usage logger — logs model, callType, token counts, and durationMs.
 * Never logs message content or API keys.
 */
function logUsage(opts: {
  model: string;
  callType?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs: number;
}) {
  const { model, callType, promptTokens, completionTokens, totalTokens, durationMs } = opts;
  console.log(
    `[LLM] model=${model} callType=${callType ?? "unspecified"} ` +
    `prompt=${promptTokens ?? "?"} completion=${completionTokens ?? "?"} ` +
    `total=${totalTokens ?? "?"} durationMs=${durationMs}`
  );
}

function anthropicHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": ENV.anthropicApiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

async function trackUsageAfterCall(
  params: InvokeParams,
  usageData: {
    callType: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    durationMs: number;
    streaming: boolean;
  }
) {
  logUsage({
    model: usageData.model,
    callType: params.callType,
    promptTokens: usageData.promptTokens,
    completionTokens: usageData.completionTokens,
    totalTokens: usageData.totalTokens,
    durationMs: usageData.durationMs,
  });

  if (params.persistUsage) {
    try {
      params.persistUsage(usageData);
    } catch {
      /* never throw */
    }
  }

  try {
    const { trackLLMEvent } = await import("../usageTracker");
    trackLLMEvent({
      featureName: params.callType ?? "llm.unspecified",
      callType: params.callType ?? "unspecified",
      model: usageData.model,
      promptTokens: usageData.promptTokens,
      completionTokens: usageData.completionTokens,
      totalTokens: usageData.totalTokens,
      durationMs: usageData.durationMs,
      streaming: usageData.streaming,
    });
  } catch {
    /* never block */
  }
}

function buildAnthropicPayload(params: InvokeParams, stream: boolean): Record<string, unknown> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    temperature,
  } = params;

  const resolvedModel = resolveModel(model);
  const resolvedMaxTokens = resolveMaxTokens(params);
  const { system: messageSystem, messages: anthropicMessages } = translateMessages(messages);
  const normalizedFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });
  const jsonInstruction = buildJsonInstruction(normalizedFormat);

  let system = messageSystem;
  if (jsonInstruction) {
    system = system ? `${system}\n\n${jsonInstruction}` : jsonInstruction;
  }

  const payload: Record<string, unknown> = {
    model: resolvedModel,
    max_tokens: resolvedMaxTokens,
    messages: anthropicMessages,
  };

  if (system) payload.system = system;
  if (temperature != null) payload.temperature = temperature;
  if (stream) payload.stream = true;

  const anthropicTools = translateTools(tools);
  if (anthropicTools && anthropicTools.length > 0) {
    payload.tools = anthropicTools;
  }

  const anthropicToolChoice = translateToolChoice(toolChoice || tool_choice, tools);
  if (anthropicToolChoice) {
    payload.tool_choice = anthropicToolChoice;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Standard (non-streaming) LLM invocation.
 * All existing callers continue to work without changes.
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const resolvedModel = resolveModel(params.model);
  const payload = buildAnthropicPayload(params, false);
  const startMs = Date.now();

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const anthropic = (await response.json()) as AnthropicResponse;
  const result = buildInvokeResult(anthropic);
  const durationMs = Date.now() - startMs;

  const usageData = {
    callType: params.callType ?? "unspecified",
    model: result.model ?? resolvedModel,
    promptTokens: result.usage?.prompt_tokens ?? 0,
    completionTokens: result.usage?.completion_tokens ?? 0,
    totalTokens: result.usage?.total_tokens ?? 0,
    durationMs,
    streaming: false,
  };

  await trackUsageAfterCall(params, usageData);

  return result;
}

/**
 * Streaming LLM invocation — yields text delta chunks via an async generator.
 *
 * Usage:
 *   for await (const chunk of invokeLLMStream({ messages, callType: "advisor" })) {
 *     res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
 *   }
 *
 * Only use this for the GM Advisor chat endpoint. All other callers use invokeLLM.
 */
export async function* invokeLLMStream(
  params: InvokeParams
): AsyncGenerator<string, void, unknown> {
  assertApiKey();

  const resolvedModel = resolveModel(params.model);
  const payload = buildAnthropicPayload(params, true);
  const startMs = Date.now();

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM stream failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  if (!response.body) {
    throw new Error("LLM stream: response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const event = JSON.parse(data) as {
            type?: string;
            message?: { usage?: { input_tokens?: number; output_tokens?: number } };
            usage?: { input_tokens?: number; output_tokens?: number };
            delta?: { type?: string; text?: string };
          };

          if (event.type === "message_start" && event.message?.usage) {
            promptTokens = event.message.usage.input_tokens;
            if (event.message.usage.output_tokens != null) {
              completionTokens = event.message.usage.output_tokens;
            }
          }

          if (event.type === "message_delta" && event.usage) {
            if (event.usage.input_tokens != null) {
              promptTokens = event.usage.input_tokens;
            }
            if (event.usage.output_tokens != null) {
              completionTokens = event.usage.output_tokens;
            }
          }

          if (
            event.type === "content_block_delta" &&
            event.delta?.type === "text_delta" &&
            event.delta.text
          ) {
            yield event.delta.text;
          }
        } catch {
          // Malformed SSE chunk — skip silently
        }
      }
    }
  } finally {
    reader.releaseLock();
    const finalDurationMs = Date.now() - startMs;
    const totalTokens =
      promptTokens != null && completionTokens != null
        ? promptTokens + completionTokens
        : undefined;

    await trackUsageAfterCall(params, {
      callType: params.callType ?? "unspecified",
      model: resolvedModel,
      promptTokens: promptTokens ?? 0,
      completionTokens: completionTokens ?? 0,
      totalTokens: totalTokens ?? 0,
      durationMs: finalDurationMs,
      streaming: true,
    });
  }
}
