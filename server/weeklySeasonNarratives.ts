import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { weeklySeasonNarratives } from "../drizzle/schema";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { aiUsage } from "./aiCost/aiFeatures";

export const WEEK_NARRATIVE_PROMPT_VERSION = "rfsn-week-v2";

export const FACT_GROUP_NAMES = [
  "MATCHUP_FACTS",
  "PLAYER_FACTS",
  "LINEUP_FACTS",
  "RIVALRY_FACTS",
  "LEAGUE_FACTS",
  "HISTORICAL_FACTS",
  "EDITORIAL_CONTEXT",
] as const;

export type FactGroupName = (typeof FACT_GROUP_NAMES)[number];
export type FactValue = string | number | boolean | null;
export type FactMap = Record<string, FactValue>;
export type FactGroups = Partial<Record<FactGroupName, FactMap>>;

export type NarrativeFactPacket = {
  eventId: string;
  eventType: string;
  subject: string;
  opponent?: string | null;
  facts: FactMap;
  factGroups?: FactGroups;
  confidence: number;
  tone: string;
};

const LICENSED_GROUPS: FactGroupName[] = [
  "MATCHUP_FACTS",
  "PLAYER_FACTS",
  "LINEUP_FACTS",
  "RIVALRY_FACTS",
  "LEAGUE_FACTS",
  "HISTORICAL_FACTS",
];

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

export function licensedFacts(packet: NarrativeFactPacket): FactMap {
  if (!packet.factGroups) return { ...packet.facts };
  const out: FactMap = {};
  for (const name of LICENSED_GROUPS) {
    Object.assign(out, packet.factGroups[name] ?? {});
  }
  return out;
}

function isNearlyInteger(n: number): boolean {
  return Math.abs(n - Math.round(n)) < 0.001;
}

function addLicensedNumber(into: Set<string>, n: number): void {
  if (!Number.isFinite(n)) return;
  const exact = String(Math.round(n * 100) / 100);
  into.add(exact);
  into.add(String(n));
  if (isNearlyInteger(n)) into.add(String(Math.round(n)));
}

function harvestNumbersFromValue(into: Set<string>, value: FactValue): void {
  if (typeof value === "number") {
    addLicensedNumber(into, value);
    return;
  }
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    addLicensedNumber(into, Number(trimmed));
    return;
  }
  const record = trimmed.match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  if (record) {
    addLicensedNumber(into, Number(record[1]));
    addLicensedNumber(into, Number(record[2]));
    if (record[3]) addLicensedNumber(into, Number(record[3]));
    return;
  }
  const streak = trimmed.match(/^([WL])(\d+)$/i);
  if (streak) addLicensedNumber(into, Number(streak[2]));
}

export function collectAllowedNumbers(packet: NarrativeFactPacket): Set<string> {
  const into = new Set<string>();
  const facts = licensedFacts(packet);
  for (const v of Object.values(facts)) harvestNumbersFromValue(into, v);
  const share = facts.share ?? facts.percent ?? facts.percentage;
  if (typeof share === "number" && share > 0 && share <= 1) {
    addLicensedNumber(into, Math.round(share * 100));
  }
  return into;
}

export function packetAllowsPercentages(packet: NarrativeFactPacket): boolean {
  const facts = licensedFacts(packet);
  return Object.keys(facts).some((k) => /percent|share|rate/i.test(k) && facts[k] != null);
}

export function factFingerprint(packet: NarrativeFactPacket): string {
  const canonical = JSON.stringify({
    eventId: packet.eventId,
    eventType: packet.eventType,
    facts: licensedFacts(packet),
    promptVersion: WEEK_NARRATIVE_PROMPT_VERSION,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

function formatFactGroups(packet: NarrativeFactPacket): string {
  if (packet.factGroups) {
    const blocks: string[] = [];
    for (const name of FACT_GROUP_NAMES) {
      const group = packet.factGroups[name];
      if (!group) continue;
      const lines = Object.entries(group)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `  - ${k}: ${v}`);
      if (!lines.length) continue;
      blocks.push(`${name}\n${lines.join("\n")}`);
    }
    if (blocks.length) return blocks.join("\n");
  }
  return Object.entries(licensedFacts(packet))
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
}

const BASE_SYSTEM = `You are the Fantasy Football Rivals booth.

You may use colorful language (escaped, crushed, survived, statement win, nightmare lineup decision, rivalry chapter) ONLY as description of supplied facts.

Every externally verifiable factual assertion MUST originate from the supplied fact groups.
You must NEVER invent, calculate, infer, or round into:
percentages, counts, ordinals (1st/2nd/16th), number of historical meetings, streak lengths, rankings, records, projected probabilities, statistical rarity, historical claims, playoff counts, or prior-season facts.

Do not use the number of supplied facts, confidence, or your own knowledge to add quantities.
If a historical record, meeting count, streak, or playoff count is not in HISTORICAL_FACTS or RIVALRY_FACTS, do not mention it.
If a percentage is not in the licensed facts, do not write a percentage.

Return JSON only: {"headline":"...","body":"..."} with body 2-4 sentences.`;

const STRICT_SYSTEM = `${BASE_SYSTEM}

STRICT RETRY: your previous draft added facts that were not in the packet.
Rewrite using ONLY numbers and records printed in the fact groups. Zero inferred ordinals. Zero percentages unless a share/percent fact is listed. Zero meeting counts you were not given.`;

export function sofiaSystemPrompt(strict: boolean): string {
  return strict ? STRICT_SYSTEM : BASE_SYSTEM;
}

function parseModelJson(raw: string, fallbackHeadline: string): { headline: string; body: string } {
  let headline = fallbackHeadline;
  let body = String(raw);
  try {
    const parsed = JSON.parse(body) as { headline?: string; body?: string };
    headline = parsed.headline || headline;
    body = parsed.body || body;
  } catch {
    const match = body.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { headline?: string; body?: string };
      headline = parsed.headline || headline;
      body = parsed.body || body;
    }
  }
  return { headline: String(headline), body: String(body) };
}

export type GroundingClaim = {
  text: string;
  verdict: "SUPPORTED" | "UNSUPPORTED" | "CONTRADICTED";
};

export function groundNarrative(
  body: string,
  packet: NarrativeFactPacket,
  headline?: string | null,
): {
  claims: GroundingClaim[];
  supported: number;
  unsupported: number;
  contradicted: number;
} {
  const text = `${headline ?? ""}\n${body}`;
  const allowedNums = collectAllowedNumbers(packet);
  const claims: GroundingClaim[] = [];

  const ordinals = text.match(/\d+(?:st|nd|rd|th)\b/gi) ?? [];
  for (const raw of ordinals) {
    const n = raw.replace(/(?:st|nd|rd|th)$/i, "");
    claims.push({
      text: raw,
      verdict: allowedNums.has(n) ? "SUPPORTED" : "UNSUPPORTED",
    });
  }

  const percents = text.match(/\d+(?:\.\d+)?\s*%/g) ?? [];
  const percentOk = packetAllowsPercentages(packet);
  for (const raw of percents) {
    const n = raw.replace(/\s*%/, "");
    const rounded = String(Math.round(Number(n) * 100) / 100);
    const ok = percentOk && (allowedNums.has(n) || allowedNums.has(rounded));
    claims.push({ text: raw, verdict: ok ? "SUPPORTED" : "UNSUPPORTED" });
  }

  const nums = text.match(/(?<!\d)-?\d+(?:\.\d+)?/g) ?? [];
  for (const raw of nums) {
    if (ordinals.some((o) => o.startsWith(raw))) continue;
    if (percents.some((p) => p.startsWith(raw))) continue;
    const n = String(Math.round(Number(raw) * 100) / 100);
    const asInt = isNearlyInteger(Number(raw)) ? String(Math.round(Number(raw))) : null;
    const ok = allowedNums.has(n) || allowedNums.has(raw) || (asInt != null && allowedNums.has(asInt));
    claims.push({ text: raw, verdict: ok ? "SUPPORTED" : "UNSUPPORTED" });
  }

  const words = text.toLowerCase().match(/\b[a-z]+\b/g) ?? [];
  for (const w of words) {
    if (!(w in WORD_NUMBERS)) continue;
    const n = WORD_NUMBERS[w];
    claims.push({
      text: w,
      verdict: allowedNums.has(String(n)) ? "SUPPORTED" : "UNSUPPORTED",
    });
  }

  const impact = String(licensedFacts(packet).impact ?? packet.facts.impact ?? "");
  if (impact === "WIN_FLIP" && /would(?: not|n't) have (won|changed|flipped)|did not (change|flip)/i.test(text)) {
    claims.push({ text: "WIN_FLIP denied", verdict: "CONTRADICTED" });
  }

  const contradicted = claims.filter((c) => c.verdict === "CONTRADICTED").length;
  const unsupported = claims.filter((c) => c.verdict === "UNSUPPORTED").length;
  const supported = claims.filter((c) => c.verdict === "SUPPORTED").length;
  return { claims, supported, unsupported, contradicted };
}

export function isPublishableGrounding(g: { unsupported: number; contradicted: number }): boolean {
  return g.contradicted === 0 && g.unsupported === 0;
}

export function deterministicWeeklyNarrative(
  packet: NarrativeFactPacket,
  week: number,
): { headline: string; body: string } {
  const f = licensedFacts(packet);
  const subject = packet.subject;
  const opponent = packet.opponent;
  const home = f.homeScore ?? f.winScore ?? f.score;
  const away = f.awayScore ?? f.loseScore;
  const margin = f.margin ?? f.weekMargin ?? f.net;
  switch (packet.eventType) {
    case "CLOSEST_GAME": {
      const flip =
        f.bench && f.net != null
          ? ` ${f.winFlipOwner ?? opponent} left a legal ${f.net}-point lineup improvement on the bench that would have changed the result.`
          : "";
      return {
        headline: `${subject} defeats ${opponent} in the closest matchup of Week ${week}`,
        body: `${subject} defeated ${opponent} ${home}–${away} in the closest matchup of Week ${week}.${flip}`,
      };
    }
    case "WIN_FLIP":
      return {
        headline: `${subject} left the win on the bench`,
        body: `${subject} sat ${f.bench} (${f.benchPoints}) instead of ${f.starter} (${f.starterPoints}). The ${f.net}-point difference would have flipped the result.`,
      };
    case "BIGGEST_STATEMENT":
      return {
        headline: `${subject} posts the league-high score`,
        body: `${subject} posted the league-high ${f.score ?? home} and won by ${margin}. League average was ${f.leagueAverage}.`,
      };
    case "RIVALRY_RESULT":
      return {
        headline: `${subject} vs ${opponent} rivalry result`,
        body: `${subject} defeated ${opponent} by ${margin}. Series entering the week: ${f.careerEntering}. Series after: ${f.careerAfter}.`,
      };
    default:
      return {
        headline: `${subject}${opponent ? ` vs ${opponent}` : ""}`,
        body: Object.entries(f)
          .filter(([, v]) => v != null && v !== "")
          .slice(0, 6)
          .map(([k, v]) => `${k}: ${v}`)
          .join(". "),
      };
  }
}

export type NarrativeResult = {
  status: "HIT" | "GENERATE" | "PENDING" | "FAILED" | "FALLBACK";
  headline: string | null;
  bodyText: string | null;
  cache: "HIT" | "MISS";
  eventId: string;
  factFingerprint: string;
  source?: "sofia" | "fallback" | "cache";
  grounding?: { supported: number; unsupported: number; contradicted: number };
};

async function readNarrative(opts: {
  leagueId: string;
  season: number;
  week: number;
  eventId: string;
  factFingerprint: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(weeklySeasonNarratives)
    .where(
      and(
        eq(weeklySeasonNarratives.leagueId, opts.leagueId),
        eq(weeklySeasonNarratives.season, opts.season),
        eq(weeklySeasonNarratives.week, opts.week),
        eq(weeklySeasonNarratives.eventId, opts.eventId),
        eq(weeklySeasonNarratives.factFingerprint, opts.factFingerprint),
        eq(weeklySeasonNarratives.promptVersion, WEEK_NARRATIVE_PROMPT_VERSION),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listWeekNarratives(opts: {
  leagueId: string;
  season: number;
  week: number;
}) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(weeklySeasonNarratives)
    .where(
      and(
        eq(weeklySeasonNarratives.leagueId, opts.leagueId),
        eq(weeklySeasonNarratives.season, opts.season),
        eq(weeklySeasonNarratives.week, opts.week),
      ),
    );
}

export function preferPublishedNarratives<
  T extends {
    eventId: string;
    promptVersion?: string | null;
    status?: string | null;
    bodyText?: string | null;
    generatedAt?: Date | string | null;
  },
>(rows: T[]): T[] {
  const byEvent = new Map<string, T[]>();
  for (const row of rows) {
    const arr = byEvent.get(row.eventId) ?? [];
    arr.push(row);
    byEvent.set(row.eventId, arr);
  }
  const out: T[] = [];
  for (const group of byEvent.values()) {
    const generated = group.filter((r) => r.status === "generated" && r.bodyText);
    const current = generated.filter((r) => r.promptVersion === WEEK_NARRATIVE_PROMPT_VERSION);
    const pool = current.length ? current : generated.length ? generated : group;
    pool.sort((a, b) => String(b.generatedAt ?? "").localeCompare(String(a.generatedAt ?? "")));
    out.push(pool[0]);
  }
  return out;
}

async function findCleanCachedBody(opts: {
  leagueId: string;
  season: number;
  week: number;
  eventId: string;
  packet: NarrativeFactPacket;
}) {
  const rows = await listWeekNarratives(opts);
  const generated = rows
    .filter((r) => r.eventId === opts.eventId && r.status === "generated" && r.bodyText)
    .sort((a, b) => String(b.generatedAt ?? "").localeCompare(String(a.generatedAt ?? "")));
  for (const row of generated) {
    const g = groundNarrative(row.bodyText ?? "", opts.packet, row.headline);
    if (isPublishableGrounding(g)) return { row, grounding: g };
  }
  return null;
}

async function invokeSofia(opts: { week: number; packet: NarrativeFactPacket; strict: boolean }) {
  const result = await invokeLLM({
    messages: [
      { role: "system", content: sofiaSystemPrompt(opts.strict) },
      {
        role: "user",
        content: `Week: ${opts.week}
Event: ${opts.packet.eventType}
Subject: ${opts.packet.subject}
Opponent: ${opts.packet.opponent ?? "n/a"}
Tone: ${opts.packet.tone}

Licensed facts (authoritative — do not add quantities that are not printed here):
${formatFactGroups(opts.packet)}`,
      },
    ],
    callType: "weekly_briefing",
    usageContext: aiUsage("WEEKLY_INTEL"),
  });
  const raw = result.choices?.[0]?.message?.content ?? "";
  return parseModelJson(raw, opts.packet.eventType);
}

/**
 * Generate → ground → one strict retry → deterministic fallback.
 * Never publishes CONTRADICTED or UNSUPPORTED copy.
 */
export async function generateGroundedNarrative(opts: {
  week: number;
  packet: NarrativeFactPacket;
}): Promise<{
  headline: string;
  body: string;
  source: "sofia" | "fallback";
  grounding: ReturnType<typeof groundNarrative>;
}> {
  const fallback = deterministicWeeklyNarrative(opts.packet, opts.week);
  const tryOnce = async (strict: boolean) => {
    const draft = await invokeSofia({ week: opts.week, packet: opts.packet, strict });
    const grounding = groundNarrative(draft.body, opts.packet, draft.headline);
    return { draft, grounding };
  };
  try {
    const first = await tryOnce(false);
    if (isPublishableGrounding(first.grounding)) {
      return { headline: first.draft.headline, body: first.draft.body, source: "sofia", grounding: first.grounding };
    }
    const second = await tryOnce(true);
    if (isPublishableGrounding(second.grounding)) {
      return { headline: second.draft.headline, body: second.draft.body, source: "sofia", grounding: second.grounding };
    }
  } catch {
    /* fall through to template */
  }
  const grounding = groundNarrative(fallback.body, opts.packet, fallback.headline);
  return { headline: fallback.headline, body: fallback.body, source: "fallback", grounding };
}

/**
 * At most one billable generation path per (league, week, event, fingerprint, prompt).
 * Concurrent callers: unique insert owns generation; others wait for persist.
 * Clean prior-version rows are reused without a new LLM call.
 */
export async function getOrCreateWeeklyNarrative(opts: {
  leagueId: string;
  season: number;
  week: number;
  packet: NarrativeFactPacket;
}): Promise<NarrativeResult> {
  const fp = factFingerprint(opts.packet);
  const existing = await readNarrative({
    leagueId: opts.leagueId,
    season: opts.season,
    week: opts.week,
    eventId: opts.packet.eventId,
    factFingerprint: fp,
  });
  if (existing?.status === "generated" && existing.bodyText) {
    const grounding = groundNarrative(existing.bodyText, opts.packet, existing.headline);
    if (isPublishableGrounding(grounding)) {
      return {
        status: "HIT",
        headline: existing.headline,
        bodyText: existing.bodyText,
        cache: "HIT",
        eventId: opts.packet.eventId,
        factFingerprint: fp,
        source: "cache",
        grounding,
      };
    }
  }

  const reusable = await findCleanCachedBody({
    leagueId: opts.leagueId,
    season: opts.season,
    week: opts.week,
    eventId: opts.packet.eventId,
    packet: opts.packet,
  });
  if (reusable) {
    return {
      status: "HIT",
      headline: reusable.row.headline,
      bodyText: reusable.row.bodyText,
      cache: "HIT",
      eventId: opts.packet.eventId,
      factFingerprint: fp,
      source: "cache",
      grounding: reusable.grounding,
    };
  }

  const db = await getDb();
  if (!db) {
    return { status: "FAILED", headline: null, bodyText: null, cache: "MISS", eventId: opts.packet.eventId, factFingerprint: fp };
  }

  let ownsGeneration = false;
  try {
    await db.insert(weeklySeasonNarratives).values({
      leagueId: opts.leagueId,
      season: opts.season,
      week: opts.week,
      eventId: opts.packet.eventId,
      factFingerprint: fp,
      promptVersion: WEEK_NARRATIVE_PROMPT_VERSION,
      status: "pending",
    });
    ownsGeneration = true;
  } catch {
    ownsGeneration = false;
  }

  if (!ownsGeneration) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const waited = await readNarrative({
        leagueId: opts.leagueId,
        season: opts.season,
        week: opts.week,
        eventId: opts.packet.eventId,
        factFingerprint: fp,
      });
      if (waited?.status === "generated" && waited.bodyText) {
        return {
          status: "HIT",
          headline: waited.headline,
          bodyText: waited.bodyText,
          cache: "HIT",
          eventId: opts.packet.eventId,
          factFingerprint: fp,
          source: "cache",
        };
      }
      if (waited?.status === "failed") break;
    }
    return { status: "PENDING", headline: null, bodyText: null, cache: "MISS", eventId: opts.packet.eventId, factFingerprint: fp };
  }

  try {
    const produced = await generateGroundedNarrative({ week: opts.week, packet: opts.packet });
    const fallback = deterministicWeeklyNarrative(opts.packet, opts.week);
    const fallbackGrounding = groundNarrative(fallback.body, opts.packet, fallback.headline);
    const persist = isPublishableGrounding(produced.grounding)
      ? produced
      : { headline: fallback.headline, body: fallback.body, source: "fallback" as const, grounding: fallbackGrounding };
    if (!isPublishableGrounding(persist.grounding)) {
      await db
        .update(weeklySeasonNarratives)
        .set({
          status: "failed",
          errorMessage: "grounding-unpublishable",
          generatedAt: new Date(),
        })
        .where(
          and(
            eq(weeklySeasonNarratives.leagueId, opts.leagueId),
            eq(weeklySeasonNarratives.season, opts.season),
            eq(weeklySeasonNarratives.week, opts.week),
            eq(weeklySeasonNarratives.eventId, opts.packet.eventId),
            eq(weeklySeasonNarratives.factFingerprint, fp),
          ),
        );
      return { status: "FAILED", headline: null, bodyText: null, cache: "MISS", eventId: opts.packet.eventId, factFingerprint: fp };
    }
    await db
      .update(weeklySeasonNarratives)
      .set({
        status: "generated",
        headline: persist.headline.slice(0, 256),
        bodyText: persist.body,
        generatedAt: new Date(),
        errorMessage: persist.source === "fallback" ? "grounding-fallback" : null,
      })
      .where(
        and(
          eq(weeklySeasonNarratives.leagueId, opts.leagueId),
          eq(weeklySeasonNarratives.season, opts.season),
          eq(weeklySeasonNarratives.week, opts.week),
          eq(weeklySeasonNarratives.eventId, opts.packet.eventId),
          eq(weeklySeasonNarratives.factFingerprint, fp),
        ),
      );
    return {
      status: persist.source === "fallback" ? "FALLBACK" : "GENERATE",
      headline: persist.headline,
      bodyText: persist.body,
      cache: "MISS",
      eventId: opts.packet.eventId,
      factFingerprint: fp,
      source: persist.source,
      grounding: persist.grounding,
    };
  } catch (e) {
    const fallback = deterministicWeeklyNarrative(opts.packet, opts.week);
    const grounding = groundNarrative(fallback.body, opts.packet, fallback.headline);
    try {
      if (!isPublishableGrounding(grounding)) {
        await db
          .update(weeklySeasonNarratives)
          .set({
            status: "failed",
            errorMessage: "grounding-unpublishable",
            generatedAt: new Date(),
          })
          .where(
            and(
              eq(weeklySeasonNarratives.leagueId, opts.leagueId),
              eq(weeklySeasonNarratives.season, opts.season),
              eq(weeklySeasonNarratives.week, opts.week),
              eq(weeklySeasonNarratives.eventId, opts.packet.eventId),
              eq(weeklySeasonNarratives.factFingerprint, fp),
            ),
          );
        return { status: "FAILED", headline: null, bodyText: null, cache: "MISS", eventId: opts.packet.eventId, factFingerprint: fp };
      }
      await db
        .update(weeklySeasonNarratives)
        .set({
          status: "generated",
          headline: fallback.headline.slice(0, 256),
          bodyText: fallback.body,
          generatedAt: new Date(),
          errorMessage: `fallback:${(e instanceof Error ? e.message : String(e)).slice(0, 480)}`,
        })
        .where(
          and(
            eq(weeklySeasonNarratives.leagueId, opts.leagueId),
            eq(weeklySeasonNarratives.season, opts.season),
            eq(weeklySeasonNarratives.week, opts.week),
            eq(weeklySeasonNarratives.eventId, opts.packet.eventId),
            eq(weeklySeasonNarratives.factFingerprint, fp),
          ),
        );
      return {
        status: "FALLBACK",
        headline: fallback.headline,
        bodyText: fallback.body,
        cache: "MISS",
        eventId: opts.packet.eventId,
        factFingerprint: fp,
        source: "fallback",
        grounding,
      };
    } catch {
      return {
        status: "FAILED",
        headline: null,
        bodyText: null,
        cache: "MISS",
        eventId: opts.packet.eventId,
        factFingerprint: fp,
      };
    }
  }
}
