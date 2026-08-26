import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { fantasyDataCache } from "../drizzle/schema";
import { getDb } from "./db";
import { invokeLLM, resolveLlmRoute } from "./_core/llm";
import { aiUsage } from "./aiCost/aiFeatures";
import {
  NARRATIVE_JSON_SCHEMA,
  NARRATIVE_VERSION,
  buildNarrativePrompt,
  emptyUnavailableNarrative,
  groundNarrative,
  narrativeCacheMaterial,
  storytellingAllowed,
  type GroundedNarrative,
  type NarrativeFacts,
} from "../client/src/lib/postDraftEval/narrative";

const inflight = new Map<string, Promise<GroundedNarrative>>();

export function narrativeCacheKey(
  facts: NarrativeFacts,
  userId?: string | number,
  route: { provider: string; model: string } = resolveLlmRoute(),
): string {
  const hex = createHash("sha256")
    .update(`${String(userId ?? "anon")}:${route.provider}:${route.model}:${narrativeCacheMaterial(facts)}`)
    .digest("hex");
  return (`pde${hex}`).slice(0, 64);
}

function parseDraft(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const obj = JSON.parse(candidate) as unknown;
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj as Record<string, unknown>;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

async function readCache(key: string): Promise<GroundedNarrative | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select()
      .from(fantasyDataCache)
      .where(eq(fantasyDataCache.cacheKey, key))
      .limit(1);
    const raw = rows[0]?.payload;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: string; narrative?: GroundedNarrative };
    if (parsed.v !== NARRATIVE_VERSION || !parsed.narrative) return null;
    return { ...parsed.narrative, cached: true, source: parsed.narrative.source ?? "llm" };
  } catch {
    return null;
  }
}

async function writeCache(key: string, narrative: GroundedNarrative): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const body = JSON.stringify({ v: NARRATIVE_VERSION, narrative: { ...narrative, cached: true } });
    await db
      .insert(fantasyDataCache)
      .values({ cacheKey: key, payload: body, fetchedAt: new Date(), updatedAt: new Date() })
      .onDuplicateKeyUpdate({
        set: { payload: body, fetchedAt: new Date(), updatedAt: new Date() },
      });
  } catch (err) {
    console.warn("[postDraftEvalNarrative] cache write failed (non-fatal):", err);
  }
}

async function generateOnce(args: {
  facts: NarrativeFacts;
  userId: string | number;
  leagueId: string;
}): Promise<GroundedNarrative> {
  if (!storytellingAllowed(args.facts.season)) {
    return emptyUnavailableNarrative("unsupported_season");
  }
  const { system, user } = buildNarrativePrompt(args.facts);
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      callType: "json_structured",
      maxTokens: 4000,
      // Provider/model come from centralized LLM_PROVIDER — do not hardcode a feature island.
      usageContext: aiUsage("POST_DRAFT_STORYTELLING", {
        userId: args.userId,
        leagueId: args.leagueId,
        intent: `season:${args.facts.season}`,
      }),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: NARRATIVE_JSON_SCHEMA.name,
          strict: true,
          schema: NARRATIVE_JSON_SCHEMA.schema,
        },
      },
    });
    const raw = response?.choices?.[0]?.message?.content ?? "";
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    const draft = parseDraft(text);
    if (!draft) return emptyUnavailableNarrative("invalid_model_output");
    return { ...groundNarrative(args.facts, draft, "llm"), source: "llm", cached: false };
  } catch (err) {
    console.warn("[postDraftEvalNarrative] LLM failed; storytelling unavailable:", err);
    return emptyUnavailableNarrative("provider_error");
  }
}

export async function getPostDraftNarrative(args: {
  facts: NarrativeFacts;
  userId: string | number;
  leagueId: string;
}): Promise<GroundedNarrative> {
  if (!storytellingAllowed(args.facts.season)) {
    return emptyUnavailableNarrative("unsupported_season");
  }
  const key = narrativeCacheKey(args.facts, args.userId);
  const cached = await readCache(key);
  if (cached) {
    const source = cached.source === "fallback" || cached.source === "unavailable" ? cached.source : "llm";
    return { ...groundNarrative(args.facts, cached, source), cached: true, source: cached.source };
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const generated = await generateOnce(args);
    if (generated.source === "llm") await writeCache(key, generated);
    return generated;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, pending);
  return pending;
}

export function __resetNarrativeInflightForTests() {
  inflight.clear();
}
