/**
 * RFSN-053H — Narrate a HistoricalStoryPackage (server LLM + cache).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { invokeLLM } from "./_core/llm";
import {
  NARRATION_PROMPT_VERSION,
  narrationUsesOnlyPackageFacts,
  storyPackageHashInput,
  type HistoricalStoryPackage,
  type NarrationVoice,
} from "@shared/historicalStoryPackage";
import {
  NARRATION_EXPORT_ERROR,
  buildNarrationPrompt,
  narrationCorpus,
  parseHistoricalNarration,
  type HistoricalNarration,
} from "@shared/historicalNarration";

const memoryCache = new Map<string, HistoricalNarration>();
const MEMORY_MAX = 80;

export type NarrationLlm = (pkg: HistoricalStoryPackage, voice: NarrationVoice) => Promise<HistoricalNarration>;

let llmImpl: NarrationLlm | null = null;

export function setHistoricalNarrationLlmForTests(fn: NarrationLlm | null): void {
  llmImpl = fn;
}

export function narrationCacheKey(pkg: HistoricalStoryPackage, voice: NarrationVoice): string {
  return createHash("sha256")
    .update(JSON.stringify({ package: storyPackageHashInput(pkg), voice, promptVersion: NARRATION_PROMPT_VERSION }))
    .digest("hex");
}

function cacheDir(): string {
  const dir = path.join(os.tmpdir(), "ffr-historical-narration");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cachePath(key: string): string {
  return path.join(cacheDir(), `${key}.json`);
}

function remember(key: string, value: HistoricalNarration): void {
  memoryCache.set(key, value);
  if (memoryCache.size > MEMORY_MAX) {
    const first = memoryCache.keys().next().value;
    if (typeof first === "string") memoryCache.delete(first);
  }
  try {
    fs.writeFileSync(cachePath(key), JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}

function lookup(key: string): HistoricalNarration | null {
  const mem = memoryCache.get(key);
  if (mem) return mem;
  try {
    const file = cachePath(key);
    if (!fs.existsSync(file)) return null;
    const parsed = parseHistoricalNarration(JSON.parse(fs.readFileSync(file, "utf8")), "sofia");
    if (!parsed) return null;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function clearHistoricalNarrationCacheForTests(): void {
  memoryCache.clear();
  try {
    const dir = cacheDir();
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".json")) fs.unlinkSync(path.join(dir, f));
    }
  } catch {
    /* ignore */
  }
}

async function defaultLlm(pkg: HistoricalStoryPackage, voice: NarrationVoice): Promise<HistoricalNarration> {
  const prompt = buildNarrationPrompt(pkg, voice);
  const res = await invokeLLM({
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    callType: "json_structured",
    temperature: 0.4,
    maxTokens: 900,
    responseFormat: { type: "json_object" },
  });
  const content = res.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : content ? JSON.stringify(content) : "";
  const parsed = parseHistoricalNarration(text, voice);
  if (!parsed) throw new Error(NARRATION_EXPORT_ERROR);
  return { ...parsed, voice };
}

export async function narrateHistoricalStory(
  pkg: HistoricalStoryPackage,
  voice: NarrationVoice,
): Promise<{ narration: HistoricalNarration; cacheHit: boolean; key: string }> {
  const key = narrationCacheKey(pkg, voice);
  const cached = lookup(key);
  if (cached) return { narration: cached, cacheHit: true, key };

  const impl = llmImpl ?? defaultLlm;
  const narration = await impl(pkg, voice);
  const grounded = narrationUsesOnlyPackageFacts(pkg, narrationCorpus(narration));
  if (!grounded.ok) {
    console.error("[historical-narration] invented facts", grounded.invented);
    throw new Error(NARRATION_EXPORT_ERROR);
  }
  remember(key, narration);
  return { narration, cacheHit: false, key };
}
