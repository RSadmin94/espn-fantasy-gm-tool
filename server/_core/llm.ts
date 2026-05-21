// Multi-provider LLM layer — supports Anthropic Claude, OpenAI GPT, and Google Gemini.
// Select provider via LLM_PROVIDER env var: "anthropic" | "openai" | "gemini"
// Defaults to "anthropic" if not set.
// All callers use the same invokeLLM / invokeLLMStream interface — no changes needed upstream.

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
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
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
  function: { name: string };
};
export type ToolChoice = ToolChoicePrimitive | ToolChoiceByName | ToolChoiceExplicit;

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

// ---------------------------------------------------------------------------
// Provider defaults
// ---------------------------------------------------------------------------
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION = "2023-06-01";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_DEFAULT_MODEL = "gpt-4o";

const GEMINI_API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  model?: string;
  temperature?: number;
  callType?: LLMCallType;
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
  function: { name: string; arguments: string };
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
// Shared helpers
// ---------------------------------------------------------------------------

const ensureArray = (value: MessageContent | MessageContent[]): MessageContent[] =>
  Array.isArray(value) ? value : [value];

const contentToText = (content: MessageContent | MessageContent[]): string =>
  ensureArray(content)
    .map((part) => {
      if (typeof part === "string") return part;
      if (part.type === "text") return part.text;
      return JSON.stringify(part);
    })
    .join("\n");

function resolveMaxTokens(params: InvokeParams): number {
  const explicit = params.maxTokens ?? params.max_tokens;
  if (explicit != null && explicit > 0) return explicit;
  if (params.callType) return CALL_TYPE_DEFAULTS[params.callType] ?? DEFAULT_MAX_TOKENS;
  return DEFAULT_MAX_TOKENS;
}

function normalizeResponseFormat(params: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}): ResponseFormat | undefined {
  const rf = params.responseFormat ?? params.response_format;
  if (rf) return rf;
  const os = params.outputSchema ?? params.output_schema;
  if (os) return { type: "json_schema", json_schema: os };
  return undefined;
}

function buildJsonInstruction(format?: ResponseFormat): string | undefined {
  if (!format) return undefined;
  if (format.type === "json_object") return "Respond with valid JSON only.";
  if (format.type === "json_schema") {
    return (
      `Respond with valid JSON matching this schema:\n` +
      JSON.stringify(format.json_schema.schema, null, 2)
    );
  }
  return undefined;
}

function logUsage(opts: {
  provider: string;
  model: string;
  callType?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs: number;
}) {
  const { provider, model, callType, promptTokens, completionTokens, totalTokens, durationMs } = opts;
  console.log(
    `[LLM] provider=${provider} model=${model} callType=${callType ?? "unspecified"} ` +
      `prompt=${promptTokens ?? "?"} completion=${completionTokens ?? "?"} ` +
      `total=${totalTokens ?? "?"} durationMs=${durationMs}`
  );
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
    provider: ENV.llmProvider,
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

// ---------------------------------------------------------------------------
// Provider: Anthropic Claude
// ---------------------------------------------------------------------------

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string } | { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = { role: "user" | "assistant"; content: string | AnthropicContentBlock[] };

type AnthropicTool = { name: string; description?: string; input_schema: Record<string, unknown> };

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
  usage?: { input_tokens: number; output_tokens: number };
};

function contentToAnthropicBlocks(
  content: MessageContent | MessageContent[]
): string | AnthropicContentBlock[] {
  const parts = ensureArray(content);
  if (parts.length === 1 && typeof parts[0] === "string") return parts[0];
  const blocks: AnthropicContentBlock[] = [];
  for (const part of parts) {
    if (typeof part === "string") { blocks.push({ type: "text", text: part }); continue; }
    if (part.type === "text") { blocks.push({ type: "text", text: part.text }); continue; }
    if (part.type === "image_url") { blocks.push({ type: "image", source: { type: "url", url: part.image_url.url } }); continue; }
    if (part.type === "file_url") { blocks.push({ type: "text", text: `[file: ${part.file_url.url}]` }); }
  }
  if (blocks.length === 1 && blocks[0].type === "text") return (blocks[0] as { type: "text"; text: string }).text;
  return blocks;
}

function isAnthropicContentEmpty(content: string | AnthropicContentBlock[]): boolean {
  if (typeof content === "string") return content.trim().length === 0;
  if (content.length === 0) return true;
  return content.every((block) => {
    if (block.type === "text") return block.text.trim().length === 0;
    if (block.type === "tool_result") return block.content.trim().length === 0;
    return false;
  });
}

function mergeAnthropicContent(
  a: string | AnthropicContentBlock[],
  b: string | AnthropicContentBlock[]
): string | AnthropicContentBlock[] {
  if (typeof a === "string" && typeof b === "string") return a + "\n" + b;
  const toBlocks = (c: string | AnthropicContentBlock[]): AnthropicContentBlock[] =>
    typeof c === "string" ? [{ type: "text", text: c }] : c;
  return [...toBlocks(a), ...toBlocks(b)];
}

function mergeConsecutiveAnthropicMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
  const merged: AnthropicMessage[] = [];
  for (const msg of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content = mergeAnthropicContent(last.content, msg.content);
    } else {
      merged.push({ role: msg.role, content: msg.content });
    }
  }
  return merged;
}

function translateMessages(messages: Message[]): { system?: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = [];
  const anthropicMessages: AnthropicMessage[] = [];
  let pendingToolResults: AnthropicContentBlock[] = [];

  const flushToolResults = (pending: AnthropicContentBlock[]) => {
    if (pending.length === 0) return;
    anthropicMessages.push({ role: "user", content: [...pending] });
    pending.length = 0;
  };

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
      anthropicMessages.push({ role: "assistant", content: contentToAnthropicBlocks(msg.content) });
      continue;
    }
    if (msg.role === "user") {
      anthropicMessages.push({ role: "user", content: contentToAnthropicBlocks(msg.content) });
    }
  }
  flushToolResults(pendingToolResults);

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: mergeConsecutiveAnthropicMessages(
      anthropicMessages.filter((m) => !isAnthropicContentEmpty(m.content))
    ),
  };
}

function translateTools(tools?: Tool[]): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters ?? { type: "object", properties: {} },
  }));
}

function translateToolChoice(
  choice?: ToolChoice,
  tools?: Tool[]
): AnthropicToolChoice | undefined {
  if (!choice) return tools && tools.length > 0 ? { type: "auto" } : undefined;
  if (choice === "none") return { type: "none" };
  if (choice === "auto") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  if ("name" in choice) return { type: "tool", name: choice.name };
  if ("type" in choice && choice.type === "function") return { type: "tool", name: choice.function.name };
  return { type: "auto" };
}

function buildAnthropicPayload(params: InvokeParams, stream: boolean): Record<string, unknown> {
  const resolvedModel = params.model ?? (ENV.anthropicModel || ANTHROPIC_DEFAULT_MODEL);
  const resolvedMaxTokens = resolveMaxTokens(params);
  const { system: messageSystem, messages: anthropicMessages } = translateMessages(params.messages);
  const normalizedFormat = normalizeResponseFormat(params);
  const jsonInstruction = buildJsonInstruction(normalizedFormat);
  let system = messageSystem;
  if (jsonInstruction) system = system ? `${system}\n\n${jsonInstruction}` : jsonInstruction;

  const payload: Record<string, unknown> = {
    model: resolvedModel,
    max_tokens: resolvedMaxTokens,
    messages: anthropicMessages,
  };
  if (system) payload.system = system;
  if (params.temperature != null) payload.temperature = params.temperature;
  if (stream) payload.stream = true;

  const anthropicTools = translateTools(params.tools);
  if (anthropicTools && anthropicTools.length > 0) payload.tools = anthropicTools;

  const anthropicToolChoice = translateToolChoice(
    params.toolChoice ?? params.tool_choice,
    params.tools
  );
  if (anthropicToolChoice) payload.tool_choice = anthropicToolChoice;

  return payload;
}

function buildInvokeResult(anthropic: AnthropicResponse): InvokeResult {
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const block of anthropic.content) {
    if (block.type === "text") textParts.push(block.text);
    else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      });
    }
  }
  const finishReasonMap: Record<string, string> = {
    end_turn: "stop", max_tokens: "length", tool_use: "tool_calls", stop_sequence: "stop",
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
        finish_reason: finishReasonMap[anthropic.stop_reason ?? ""] ?? anthropic.stop_reason,
      },
    ],
    usage: anthropic.usage
      ? {
          prompt_tokens: anthropic.usage.input_tokens,
          completion_tokens: anthropic.usage.output_tokens,
          total_tokens: anthropic.usage.input_tokens + anthropic.usage.output_tokens,
        }
      : undefined,
  };
}

async function invokeAnthropic(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const resolvedModel = params.model ?? (ENV.anthropicModel || ANTHROPIC_DEFAULT_MODEL);
  const payload = buildAnthropicPayload(params, false);
  const startMs = Date.now();

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.anthropicApiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const anthropic = (await response.json()) as AnthropicResponse;
  const result = buildInvokeResult(anthropic);
  const durationMs = Date.now() - startMs;

  await trackUsageAfterCall(params, {
    callType: params.callType ?? "unspecified",
    model: result.model ?? resolvedModel,
    promptTokens: result.usage?.prompt_tokens ?? 0,
    completionTokens: result.usage?.completion_tokens ?? 0,
    totalTokens: result.usage?.total_tokens ?? 0,
    durationMs,
    streaming: false,
  });

  return result;
}

async function* invokeAnthropicStream(params: InvokeParams): AsyncGenerator<string, void, unknown> {
  if (!ENV.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const resolvedModel = params.model ?? (ENV.anthropicModel || ANTHROPIC_DEFAULT_MODEL);
  const payload = buildAnthropicPayload(params, true);
  const startMs = Date.now();

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.anthropicApiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic stream failed: ${response.status} ${response.statusText} – ${errorText}`);
  }
  if (!response.body) throw new Error("Anthropic stream: response body is null");

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
            if (event.message.usage.output_tokens != null) completionTokens = event.message.usage.output_tokens;
          }
          if (event.type === "message_delta" && event.usage) {
            if (event.usage.input_tokens != null) promptTokens = event.usage.input_tokens;
            if (event.usage.output_tokens != null) completionTokens = event.usage.output_tokens;
          }
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            yield event.delta.text;
          }
        } catch { /* skip malformed chunk */ }
      }
    }
  } finally {
    reader.releaseLock();
    const finalDurationMs = Date.now() - startMs;
    await trackUsageAfterCall(params, {
      callType: params.callType ?? "unspecified",
      model: resolvedModel,
      promptTokens: promptTokens ?? 0,
      completionTokens: completionTokens ?? 0,
      totalTokens: (promptTokens ?? 0) + (completionTokens ?? 0),
      durationMs: finalDurationMs,
      streaming: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Provider: OpenAI / ChatGPT
// ---------------------------------------------------------------------------

function buildOpenAIMessages(messages: Message[]): Record<string, unknown>[] {
  return messages.map((msg) => {
    const role = msg.role === "function" ? "tool" : msg.role;
    const content = contentToText(msg.content);
    if (msg.role === "tool" || msg.role === "function") {
      return { role: "tool", content, tool_call_id: msg.tool_call_id ?? msg.name ?? "unknown" };
    }
    return { role, content };
  });
}

async function invokeOpenAI(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured");
  const resolvedModel = params.model ?? (ENV.openaiModel || OPENAI_DEFAULT_MODEL);
  const resolvedMaxTokens = resolveMaxTokens(params);
  const normalizedFormat = normalizeResponseFormat(params);
  const startMs = Date.now();

  const body: Record<string, unknown> = {
    model: resolvedModel,
    max_tokens: resolvedMaxTokens,
    messages: buildOpenAIMessages(params.messages),
  };

  if (params.temperature != null) body.temperature = params.temperature;
  if (normalizedFormat?.type === "json_object") body.response_format = { type: "json_object" };
  if (normalizedFormat?.type === "json_schema") {
    body.response_format = { type: "json_schema", json_schema: normalizedFormat.json_schema };
  }
  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
    const tc = params.toolChoice ?? params.tool_choice;
    if (tc) body.tool_choice = tc;
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${ENV.openaiApiKey}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const json = (await response.json()) as {
    id: string;
    model: string;
    choices: Array<{
      index: number;
      message: { role: string; content: string | null; tool_calls?: ToolCall[] };
      finish_reason: string | null;
    }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  const durationMs = Date.now() - startMs;
  const result: InvokeResult = {
    id: json.id,
    created: Math.floor(Date.now() / 1000),
    model: json.model,
    choices: json.choices.map((c) => ({
      index: c.index,
      message: {
        role: "assistant",
        content: c.message.content ?? "",
        ...(c.message.tool_calls ? { tool_calls: c.message.tool_calls } : {}),
      },
      finish_reason: c.finish_reason,
    })),
    usage: json.usage,
  };

  await trackUsageAfterCall(params, {
    callType: params.callType ?? "unspecified",
    model: result.model ?? resolvedModel,
    promptTokens: result.usage?.prompt_tokens ?? 0,
    completionTokens: result.usage?.completion_tokens ?? 0,
    totalTokens: result.usage?.total_tokens ?? 0,
    durationMs,
    streaming: false,
  });

  return result;
}

async function* invokeOpenAIStream(params: InvokeParams): AsyncGenerator<string, void, unknown> {
  if (!ENV.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured");
  const resolvedModel = params.model ?? (ENV.openaiModel || OPENAI_DEFAULT_MODEL);
  const resolvedMaxTokens = resolveMaxTokens(params);
  const startMs = Date.now();

  const body: Record<string, unknown> = {
    model: resolvedModel,
    max_tokens: resolvedMaxTokens,
    messages: buildOpenAIMessages(params.messages),
    stream: true,
    stream_options: { include_usage: true },
  };
  if (params.temperature != null) body.temperature = params.temperature;

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${ENV.openaiApiKey}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI stream failed: ${response.status} ${response.statusText} – ${errorText}`);
  }
  if (!response.body) throw new Error("OpenAI stream: response body is null");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;

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
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          if (event.usage) {
            promptTokens = event.usage.prompt_tokens ?? promptTokens;
            completionTokens = event.usage.completion_tokens ?? completionTokens;
          }
          const delta = event.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
    await trackUsageAfterCall(params, {
      callType: params.callType ?? "unspecified",
      model: resolvedModel,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      durationMs: Date.now() - startMs,
      streaming: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Provider: Google Gemini
// ---------------------------------------------------------------------------

function buildGeminiContents(messages: Message[]): Record<string, unknown>[] {
  const contents: Record<string, unknown>[] = [];
  for (const msg of messages) {
    if (msg.role === "system") continue; // handled separately
    const role = msg.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: contentToText(msg.content) }] });
  }
  return contents;
}

function buildGeminiSystemInstruction(messages: Message[]): string | undefined {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => contentToText(m.content));
  return systemParts.length > 0 ? systemParts.join("\n\n") : undefined;
}

async function invokeGemini(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.geminiApiKey) throw new Error("GEMINI_API_KEY is not configured");
  const resolvedModel = params.model ?? (ENV.geminiModel || GEMINI_DEFAULT_MODEL);
  const resolvedMaxTokens = resolveMaxTokens(params);
  const normalizedFormat = normalizeResponseFormat(params);
  const startMs = Date.now();

  const systemInstruction = buildGeminiSystemInstruction(params.messages);
  const contents = buildGeminiContents(params.messages);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: resolvedMaxTokens,
      ...(params.temperature != null ? { temperature: params.temperature } : {}),
      ...(normalizedFormat?.type === "json_object" || normalizedFormat?.type === "json_schema"
        ? { responseMimeType: "application/json" }
        : {}),
    },
  };
  if (systemInstruction) body.system_instruction = { parts: [{ text: systemInstruction }] };

  const url = `${GEMINI_API_URL_BASE}/${resolvedModel}:generateContent?key=${ENV.geminiApiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };

  const durationMs = Date.now() - startMs;
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const usage = json.usageMetadata;

  const result: InvokeResult = {
    id: `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: resolvedModel,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: json.candidates?.[0]?.finishReason ?? "stop",
      },
    ],
    usage: usage
      ? {
          prompt_tokens: usage.promptTokenCount ?? 0,
          completion_tokens: usage.candidatesTokenCount ?? 0,
          total_tokens: usage.totalTokenCount ?? 0,
        }
      : undefined,
  };

  await trackUsageAfterCall(params, {
    callType: params.callType ?? "unspecified",
    model: resolvedModel,
    promptTokens: result.usage?.prompt_tokens ?? 0,
    completionTokens: result.usage?.completion_tokens ?? 0,
    totalTokens: result.usage?.total_tokens ?? 0,
    durationMs,
    streaming: false,
  });

  return result;
}

async function* invokeGeminiStream(params: InvokeParams): AsyncGenerator<string, void, unknown> {
  if (!ENV.geminiApiKey) throw new Error("GEMINI_API_KEY is not configured");
  const resolvedModel = params.model ?? (ENV.geminiModel || GEMINI_DEFAULT_MODEL);
  const resolvedMaxTokens = resolveMaxTokens(params);
  const startMs = Date.now();

  const systemInstruction = buildGeminiSystemInstruction(params.messages);
  const contents = buildGeminiContents(params.messages);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: resolvedMaxTokens,
      ...(params.temperature != null ? { temperature: params.temperature } : {}),
    },
  };
  if (systemInstruction) body.system_instruction = { parts: [{ text: systemInstruction }] };

  const url = `${GEMINI_API_URL_BASE}/${resolvedModel}:streamGenerateContent?alt=sse&key=${ENV.geminiApiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini stream failed: ${response.status} ${response.statusText} – ${errorText}`);
  }
  if (!response.body) throw new Error("Gemini stream: response body is null");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;

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
        if (!data) continue;
        try {
          const event = JSON.parse(data) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
          };
          if (event.usageMetadata) {
            promptTokens = event.usageMetadata.promptTokenCount ?? promptTokens;
            completionTokens = event.usageMetadata.candidatesTokenCount ?? completionTokens;
          }
          const text = event.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
          if (text) yield text;
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
    await trackUsageAfterCall(params, {
      callType: params.callType ?? "unspecified",
      model: resolvedModel,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      durationMs: Date.now() - startMs,
      streaming: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Public API — provider-agnostic
// ---------------------------------------------------------------------------

/**
 * Standard (non-streaming) LLM invocation.
 * Provider selected by LLM_PROVIDER env var: "anthropic" | "openai" | "gemini"
 * Defaults to "anthropic".
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const provider = ENV.llmProvider;
  if (provider === "openai") return invokeOpenAI(params);
  if (provider === "gemini") return invokeGemini(params);
  return invokeAnthropic(params);
}

/**
 * Streaming LLM invocation — yields text delta chunks via an async generator.
 * Provider selected by LLM_PROVIDER env var: "anthropic" | "openai" | "gemini"
 * Defaults to "anthropic".
 *
 * Usage:
 *   for await (const chunk of invokeLLMStream({ messages, callType: "advisor" })) {
 *     res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
 *   }
 */
export async function* invokeLLMStream(
  params: InvokeParams
): AsyncGenerator<string, void, unknown> {
  const provider = ENV.llmProvider;
  if (provider === "openai") yield* invokeOpenAIStream(params);
  else if (provider === "gemini") yield* invokeGeminiStream(params);
  else yield* invokeAnthropicStream(params);
}
