/**
 * reputationService.ts
 * ────────────────────
 * Sprint 4: League Reputation System
 *
 * Detects reputation-modifying behaviours for each manager across all
 * cached seasons. Each behaviour earns a "reputation event" — a labelled
 * entry that modifies how the GM archetype is perceived over time.
 *
 * Event types (8 total):
 *   PANIC_SELLER       — 3+ desperation trades in one season
 *                        (proxy: 3+ trades in a season where team was losing)
 *   SILENT_ASSASSIN    — won 6+ games with ≤ 3 total transactions in a season
 *   TRADE_SHARK        — positive trade verdict in 3+ trades in a season
 *   WAIVER_GRINDER     — top-2 waiver pickup count in a season
 *   PLAYOFF_CHOKER     — made playoffs but lost in round 1 in 2+ consecutive seasons
 *   DYNASTY_BUILDER    — gave up 2+ future picks in a single trade in a season
 *   REVENGE_SEEKER     — beat their #1 rival after 3+ consecutive losses to them
 *   CHAOS_AGENT        — made 5+ trades in a single season
 *
 * Severity:
 *   NOTABLE    — happened once
 *   DEFINING   — happened 2+ times or in consecutive seasons
 *   LEGENDARY  — happened 3+ times or is historically extreme
 *
 * Exports:
 *   detectReputationEvents()     — pure function, no DB (testable)
 *   refreshReputationEvents()    — detect + LLM + persist to DB
 *   getReputationEventsFromDb()  — read cached rows from DB
 */

import { getAllCachedSeasons, getCachedView, getDb } from "./db";
import { reputationEvents } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import {
  normalizeTeams,
  normalizeTransactions,
  normalizeMatchups,
} from "./espnService";
import { invokeLLM } from "./_core/llm";
import { getNotoriousTradesFromDb } from "./tradeNarrativeService";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReputationEventType =
  | "PANIC_SELLER"
  | "SILENT_ASSASSIN"
  | "TRADE_SHARK"
  | "WAIVER_GRINDER"
  | "PLAYOFF_CHOKER"
  | "DYNASTY_BUILDER"
  | "REVENGE_SEEKER"
  | "CHAOS_AGENT";

export type Severity = "NOTABLE" | "DEFINING" | "LEGENDARY";

export interface ReputationEventDetected {
  memberId: string;
  ownerName: string;
  season: number;
  eventType: ReputationEventType;
  eventLabel: string;
  supportingStat: string;
  severity: Severity;
}

// Human-readable labels for each event type
export const REPUTATION_LABELS: Record<ReputationEventType, string> = {
  PANIC_SELLER: "Panic Seller",
  SILENT_ASSASSIN: "Silent Assassin",
  TRADE_SHARK: "Trade Shark",
  WAIVER_GRINDER: "Waiver Grinder",
  PLAYOFF_CHOKER: "Playoff Choker",
  DYNASTY_BUILDER: "Dynasty Builder",
  REVENGE_SEEKER: "Revenge Seeker",
  CHAOS_AGENT: "Chaos Agent",
};

// ─── Input type ───────────────────────────────────────────────────────────────

export interface ReputationSeasonData {
  season: number;
  /** teamId → memberId */
  teamMemberMap: Record<number, string>;
  /** memberId → ownerName */
  memberNameMap: Record<string, string>;
  /** memberId → wins */
  winsMap: Record<string, number>;
  /** memberId → losses */
  lossesMap: Record<string, number>;
  /** memberId → total transactions (waivers + trades) */
  txCountMap: Record<string, number>;
  /** memberId → trade count */
  tradeCountMap: Record<string, number>;
  /** memberId → waiver add count */
  waiverCountMap: Record<string, number>;
  /** memberId → madePlayoffs */
  madePlayoffsMap: Record<string, boolean>;
  /** memberId → won first playoff round */
  wonFirstRoundMap: Record<string, boolean>;
}

// ─── Pure detection (no DB, fully testable) ───────────────────────────────────

/**
 * Detect reputation events for a single season from pre-built season data.
 * Returns all events detected for that season.
 */
export function detectReputationEventsForSeason(
  data: ReputationSeasonData,
  /** Optional: trade narratives for TRADE_SHARK and DYNASTY_BUILDER detection */
  tradeNarratives?: Array<{
    season: number;
    sideAOwner: string;
    sideBOwner: string;
    verdict: string;
    narrativeLabel: string;
  }>
): ReputationEventDetected[] {
  const events: ReputationEventDetected[] = [];
  const {
    season,
    memberNameMap,
    winsMap,
    lossesMap,
    txCountMap,
    tradeCountMap,
    waiverCountMap,
    madePlayoffsMap,
    wonFirstRoundMap,
  } = data;

  const memberIds = Object.keys(memberNameMap);

  // League-wide max waiver count for WAIVER_GRINDER detection
  const maxWaivers = Math.max(1, ...Object.values(waiverCountMap));
  const sortedWaivers = Object.entries(waiverCountMap)
    .sort((a, b) => b[1] - a[1]);
  const top2WaiverMembers = new Set(sortedWaivers.slice(0, 2).map(([id]) => id));

  for (const memberId of memberIds) {
    const ownerName = memberNameMap[memberId] || memberId;
    const wins = winsMap[memberId] || 0;
    const losses = lossesMap[memberId] || 0;
    const totalTx = txCountMap[memberId] || 0;
    const trades = tradeCountMap[memberId] || 0;
    const waivers = waiverCountMap[memberId] || 0;

    // ── SILENT_ASSASSIN: 6+ wins with ≤ 3 total transactions ────────────────
    if (wins >= 6 && totalTx <= 3) {
      events.push({
        memberId,
        ownerName,
        season,
        eventType: "SILENT_ASSASSIN",
        eventLabel: REPUTATION_LABELS.SILENT_ASSASSIN,
        supportingStat: `${wins}-${losses} record with only ${totalTx} transactions`,
        severity: wins >= 9 ? "LEGENDARY" : wins >= 7 ? "DEFINING" : "NOTABLE",
      });
    }

    // ── CHAOS_AGENT: 5+ trades in a season ─────────────────────────────────
    if (trades >= 5) {
      events.push({
        memberId,
        ownerName,
        season,
        eventType: "CHAOS_AGENT",
        eventLabel: REPUTATION_LABELS.CHAOS_AGENT,
        supportingStat: `${trades} trades in a single season`,
        severity: trades >= 8 ? "LEGENDARY" : trades >= 6 ? "DEFINING" : "NOTABLE",
      });
    }

    // ── PANIC_SELLER: 3+ trades while team was losing (losses > wins) ───────
    if (trades >= 3 && losses > wins) {
      events.push({
        memberId,
        ownerName,
        season,
        eventType: "PANIC_SELLER",
        eventLabel: REPUTATION_LABELS.PANIC_SELLER,
        supportingStat: `${trades} trades while ${wins}-${losses}`,
        severity: trades >= 5 ? "DEFINING" : "NOTABLE",
      });
    }

    // ── WAIVER_GRINDER: top-2 waiver pickup count in a season ───────────────
    if (top2WaiverMembers.has(memberId) && waivers >= 5) {
      events.push({
        memberId,
        ownerName,
        season,
        eventType: "WAIVER_GRINDER",
        eventLabel: REPUTATION_LABELS.WAIVER_GRINDER,
        supportingStat: `${waivers} waiver pickups (top-2 in league)`,
        severity: waivers >= maxWaivers * 0.9 ? "DEFINING" : "NOTABLE",
      });
    }

    // ── PLAYOFF_CHOKER: made playoffs but lost in round 1 ───────────────────
    if (madePlayoffsMap[memberId] && !wonFirstRoundMap[memberId]) {
      events.push({
        memberId,
        ownerName,
        season,
        eventType: "PLAYOFF_CHOKER",
        eventLabel: REPUTATION_LABELS.PLAYOFF_CHOKER,
        supportingStat: `Made playoffs but lost in round 1 (${wins}-${losses})`,
        severity: "NOTABLE",
      });
    }
  }

  // ── Trade-based events (require trade narrative data) ─────────────────────
  if (tradeNarratives) {
    const seasonTrades = tradeNarratives.filter((t) => t.season === season);

    // TRADE_SHARK: positive trade verdict in 3+ trades in a season
    const tradeWins: Record<string, number> = {};
    for (const t of seasonTrades) {
      if (t.verdict === "sideA") {
        const key = t.sideAOwner;
        tradeWins[key] = (tradeWins[key] || 0) + 1;
      } else if (t.verdict === "sideB") {
        const key = t.sideBOwner;
        tradeWins[key] = (tradeWins[key] || 0) + 1;
      }
    }
    for (const [ownerName, wins] of Object.entries(tradeWins)) {
      if (wins >= 3) {
        // Find memberId for this owner
        const memberId = Object.entries(memberNameMap).find(
          ([, name]) => name === ownerName || name.toLowerCase() === ownerName.toLowerCase()
        )?.[0];
        if (memberId) {
          events.push({
            memberId,
            ownerName,
            season,
            eventType: "TRADE_SHARK",
            eventLabel: REPUTATION_LABELS.TRADE_SHARK,
            supportingStat: `Won ${wins} trade verdicts in a single season`,
            severity: wins >= 5 ? "LEGENDARY" : wins >= 4 ? "DEFINING" : "NOTABLE",
          });
        }
      }
    }

    // DYNASTY_BUILDER: gave up 2+ future picks in a single trade
    const dynastyLabels = new Set(["Future Sacrificed", "Win-Now Desperation"]);
    const dynastyBuilders = new Set<string>();
    for (const t of seasonTrades) {
      if (dynastyLabels.has(t.narrativeLabel)) {
        // The winner (who received picks) is the dynasty builder
        const builderName = t.verdict === "sideA" ? t.sideAOwner : t.sideBOwner;
        dynastyBuilders.add(builderName);
      }
    }
    for (const ownerName of Array.from(dynastyBuilders)) {
      const memberId = Object.entries(memberNameMap).find(
        ([, name]) => name === ownerName || name.toLowerCase() === ownerName.toLowerCase()
      )?.[0];
      if (memberId) {
        events.push({
          memberId,
          ownerName,
          season,
          eventType: "DYNASTY_BUILDER",
          eventLabel: REPUTATION_LABELS.DYNASTY_BUILDER,
          supportingStat: `Acquired future picks via trade in ${season}`,
          severity: "NOTABLE",
        });
      }
    }
  }

  return events;
}

/**
 * Detect REVENGE_SEEKER events across all seasons.
 * A manager earns this when they beat their H2H nemesis after 3+ consecutive losses.
 */
export function detectRevengeSeeker(
  allSeasonData: Array<{
    season: number;
    matchups: ReturnType<typeof normalizeMatchups>;
    teamMemberMap: Record<number, string>;
    memberNameMap: Record<string, string>;
  }>
): ReputationEventDetected[] {
  const events: ReputationEventDetected[] = [];

  // Build H2H loss streaks per member pair across seasons
  const h2hHistory: Record<string, Record<string, number[]>> = {};
  // memberId → rivalMemberId → array of results (1=win, 0=loss) in chronological order

  for (const { season, matchups, teamMemberMap, memberNameMap } of allSeasonData) {
    for (const m of matchups as Array<Record<string, unknown>>) {
      const homeId = teamMemberMap[m.homeTeamId as number];
      const awayId = teamMemberMap[m.awayTeamId as number];
      if (!homeId || !awayId) continue;
      const homePts = (m.homeTotalPoints as number) || 0;
      const awayPts = (m.awayTotalPoints as number) || 0;
      if (homePts === 0 && awayPts === 0) continue;

      if (!h2hHistory[homeId]) h2hHistory[homeId] = {};
      if (!h2hHistory[awayId]) h2hHistory[awayId] = {};
      if (!h2hHistory[homeId][awayId]) h2hHistory[homeId][awayId] = [];
      if (!h2hHistory[awayId][homeId]) h2hHistory[awayId][homeId] = [];

      h2hHistory[homeId][awayId].push(homePts > awayPts ? 1 : 0);
      h2hHistory[awayId][homeId].push(awayPts > homePts ? 1 : 0);
    }
  }

  // Find revenge moments: win after 3+ consecutive losses
  const lastSeasonData = allSeasonData[allSeasonData.length - 1];
  const memberNameMap = lastSeasonData?.memberNameMap || {};

  for (const [memberId, rivals] of Object.entries(h2hHistory)) {
    for (const [rivalId, results] of Object.entries(rivals)) {
      if (results.length < 4) continue;
      // Check if last result is a win after 3+ consecutive losses
      const lastResult = results[results.length - 1];
      if (lastResult !== 1) continue;
      let consecutiveLosses = 0;
      for (let i = results.length - 2; i >= 0; i--) {
        if (results[i] === 0) consecutiveLosses++;
        else break;
      }
      if (consecutiveLosses >= 3) {
        const ownerName = memberNameMap[memberId] || memberId;
        const rivalName = memberNameMap[rivalId] || rivalId;
        // Attribute to the most recent season where the win occurred
        const recentSeason = allSeasonData[allSeasonData.length - 1]?.season || 2025;
        events.push({
          memberId,
          ownerName,
          season: recentSeason,
          eventType: "REVENGE_SEEKER",
          eventLabel: REPUTATION_LABELS.REVENGE_SEEKER,
          supportingStat: `Beat ${rivalName} after ${consecutiveLosses} consecutive losses`,
          severity: consecutiveLosses >= 5 ? "LEGENDARY" : consecutiveLosses >= 4 ? "DEFINING" : "NOTABLE",
        });
      }
    }
  }

  return events;
}

// ─── LLM sentence generation ─────────────────────────────────────────────────

/** Generate a 1-sentence narrative for a reputation event. */
export async function generateReputationSentence(
  event: ReputationEventDetected,
  careerPlayoffRecord?: { playoffWins: number; playoffLosses: number }
): Promise<string> {
  try {
    const playoffContext = careerPlayoffRecord && (careerPlayoffRecord.playoffWins + careerPlayoffRecord.playoffLosses) > 0
      ? `\nCareer Playoff Record: ${careerPlayoffRecord.playoffWins}W-${careerPlayoffRecord.playoffLosses}L all-time in playoff matchups`
      : '';
    const prompt = `You are writing a one-sentence reputation entry for a fantasy football league history book.

Manager: ${event.ownerName}
Season: ${event.season}
Reputation Event: ${event.eventLabel}
Supporting Stat: ${event.supportingStat}
Severity: ${event.severity}${playoffContext}

Write exactly one sentence (max 25 words) in the voice of a sports journalist. Be specific, punchy, and slightly dramatic. Use the manager's name. Reference playoff record only if it directly reinforces the reputation event (e.g., PLAYOFF_CHOKER). Do not use quotes.`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You write punchy one-sentence reputation entries for a fantasy football league history book." },
        { role: "user", content: prompt },
      ],
    });
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim().length > 0) {
      return content.trim().replace(/^["']|["']$/g, "");
    }
  } catch (_e) {
    // Fall through to fallback
  }
  return `${event.ownerName} earned the "${event.eventLabel}" reputation in ${event.season}: ${event.supportingStat}.`;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/** Upsert a reputation event row. */
async function upsertReputationEvent(
  event: ReputationEventDetected,
  sentence: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(reputationEvents)
    .values({
      memberId: event.memberId,
      ownerName: event.ownerName,
      season: event.season,
      eventType: event.eventType,
      eventLabel: event.eventLabel,
      eventSentence: sentence,
      supportingStat: event.supportingStat,
      severity: event.severity,
    })
    .onDuplicateKeyUpdate({
      set: {
        eventLabel: event.eventLabel,
        supportingStat: event.supportingStat,
        severity: event.severity,
        // Only update sentence if we have a new one
        eventSentence: sentence,
      },
    });
}

/** Read all reputation events for a member, sorted by season desc. */
export async function getReputationEventsFromDb(
  memberId: string
): Promise<Array<{
  memberId: string;
  ownerName: string;
  season: number;
  eventType: string;
  eventLabel: string;
  eventSentence: string | null;
  supportingStat: string | null;
  severity: string;
  detectedAt: Date;
}>> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reputationEvents)
    .where(eq(reputationEvents.memberId, memberId))
    .orderBy(desc(reputationEvents.season));
}

/** Read all reputation events for a season. */
export async function getSeasonReputationEventsFromDb(
  season: number
): Promise<Array<{
  memberId: string;
  ownerName: string;
  season: number;
  eventType: string;
  eventLabel: string;
  eventSentence: string | null;
  supportingStat: string | null;
  severity: string;
  detectedAt: Date;
}>> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reputationEvents)
    .where(eq(reputationEvents.season, season))
    .orderBy(desc(reputationEvents.season));
}

/** Read all reputation events for all members (for the reputation timeline). */
export async function getAllReputationEventsFromDb(): Promise<Array<{
  memberId: string;
  ownerName: string;
  season: number;
  eventType: string;
  eventLabel: string;
  eventSentence: string | null;
  supportingStat: string | null;
  severity: string;
  detectedAt: Date;
}>> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reputationEvents)
    .orderBy(desc(reputationEvents.season));
}

// ─── Refresh (compute + persist) ─────────────────────────────────────────────

/**
 * Detect and persist reputation events across all cached seasons.
 * Called from weeklyIntelHandler after each ESPN data refresh.
 * LLM sentences are generated once per event and cached.
 */
export async function refreshReputationEvents(
  opts: { generateLLM?: boolean } = {}
): Promise<{ processed: number; newLLM: number; skipped: number }> {
  const { generateLLM = true } = opts;
  const cachedSeasons = await getAllCachedSeasons();
  if (cachedSeasons.length === 0) return { processed: 0, newLLM: 0, skipped: 0 };

  // Load existing events to avoid re-generating LLM sentences
  const existingEvents = await getAllReputationEventsFromDb();
  const existingKeys = new Set(
    existingEvents.map((e) => `${e.memberId}:${e.season}:${e.eventType}`)
  );

  // Load trade narratives for trade-based event detection
  let tradeNarratives: Array<{
    season: number;
    sideAOwner: string;
    sideBOwner: string;
    verdict: string;
    narrativeLabel: string;
  }> = [];
  try {
    const notorious = await getNotoriousTradesFromDb(1000);
    tradeNarratives = notorious.map((t) => ({
      season: t.season,
      sideAOwner: t.sideAOwner,
      sideBOwner: t.sideBOwner,
      verdict: t.verdict,
      narrativeLabel: t.narrativeLabel,
    }));
  } catch (_e) { /* non-fatal */ }

  // Build per-season data and collect all season matchup data for REVENGE_SEEKER
  const allSeasonMatchupData: Array<{
    season: number;
    matchups: ReturnType<typeof normalizeMatchups>;
    teamMemberMap: Record<number, string>;
    memberNameMap: Record<string, string>;
  }> = [];

  const allDetected: ReputationEventDetected[] = [];

  for (const season of cachedSeasons) {
    try {
      const payload = await getCachedView(season, "combined");
      if (!payload) continue;

      const teams = normalizeTeams(payload as Record<string, unknown>);
      const matchups = normalizeMatchups(payload as Record<string, unknown>);
      const txs = normalizeTransactions(payload as Record<string, unknown>);

      // Build maps
      const teamMemberMap: Record<number, string> = {};
      const memberNameMap: Record<string, string> = {};
      const winsMap: Record<string, number> = {};
      const lossesMap: Record<string, number> = {};
      const txCountMap: Record<string, number> = {};
      const tradeCountMap: Record<string, number> = {};
      const waiverCountMap: Record<string, number> = {};
      const madePlayoffsMap: Record<string, boolean> = {};
      const wonFirstRoundMap: Record<string, boolean> = {};

      for (const t of teams) {
        const tid = t.teamId as number;
        const memberId = (t.memberIds as string[])?.[0] || "";
        if (!memberId) continue;
        teamMemberMap[tid] = memberId;
        memberNameMap[memberId] = t.owners as string || `Team ${tid}`;
        winsMap[memberId] = (t.wins as number) || 0;
        lossesMap[memberId] = (t.losses as number) || 0;
        // Playoff detection: top 6 of 14 teams (or top 4 of 10) made playoffs
        const rank = (t.rankFinal as number) || (t.playoffSeed as number) || 99;
        const teamCount = teams.length;
        const playoffCutoff = teamCount >= 12 ? 6 : teamCount >= 10 ? 4 : Math.ceil(teamCount / 2);
        madePlayoffsMap[memberId] = rank <= playoffCutoff;
        // Won first round: rough proxy — rank <= playoffCutoff/2
        wonFirstRoundMap[memberId] = rank <= Math.ceil(playoffCutoff / 2);
      }

      // Transaction counts
      for (const tx of txs as Array<Record<string, unknown>>) {
        const tid = tx.teamId as number;
        const memberId = teamMemberMap[tid];
        if (!memberId) continue;
        txCountMap[memberId] = (txCountMap[memberId] || 0) + 1;
        const txType = (tx.type as string) || "";
        if (txType === "TRADE") {
          tradeCountMap[memberId] = (tradeCountMap[memberId] || 0) + 1;
        } else if (txType === "WAIVER" || txType === "FREE_AGENT") {
          waiverCountMap[memberId] = (waiverCountMap[memberId] || 0) + 1;
        }
      }

      const seasonData: ReputationSeasonData = {
        season,
        teamMemberMap,
        memberNameMap,
        winsMap,
        lossesMap,
        txCountMap,
        tradeCountMap,
        waiverCountMap,
        madePlayoffsMap,
        wonFirstRoundMap,
      };

      const detected = detectReputationEventsForSeason(seasonData, tradeNarratives);
      allDetected.push(...detected);

      allSeasonMatchupData.push({ season, matchups, teamMemberMap, memberNameMap });
    } catch (err) {
      console.warn(`[reputation] Failed to process season ${season}:`, err);
    }
  }

  // Detect REVENGE_SEEKER across all seasons
  try {
    const revengeEvents = detectRevengeSeeker(allSeasonMatchupData);
    allDetected.push(...revengeEvents);
  } catch (_e) { /* non-fatal */ }

  // Build career playoff W/L records for narrative context
  const careerPlayoffRecords: Record<string, { playoffWins: number; playoffLosses: number }> = {};
  try {
    const { buildLiveOpponentProfiles } = await import('./liveOpponentProfile');
    const profiles = await buildLiveOpponentProfiles() as Map<string, { career: { playoffWins: number; playoffLosses: number } }>;
    for (const [memberId, profile] of Array.from(profiles.entries())) {
      careerPlayoffRecords[memberId] = {
        playoffWins: profile.career.playoffWins ?? 0,
        playoffLosses: profile.career.playoffLosses ?? 0,
      };
    }
  } catch { /* non-fatal */ }

  // Persist events with LLM sentences
  let processed = 0;
  let newLLM = 0;
  let skipped = 0;

  for (const event of allDetected) {
    const key = `${event.memberId}:${event.season}:${event.eventType}`;
    const existing = existingEvents.find(
      (e) => e.memberId === event.memberId && e.season === event.season && e.eventType === event.eventType
    );

    let sentence: string;
    if (existing?.eventSentence) {
      sentence = existing.eventSentence;
      skipped++;
    } else if (generateLLM) {
      const careerPoRec = careerPlayoffRecords[event.memberId];
      sentence = await generateReputationSentence(event, careerPoRec);
      newLLM++;
    } else {
      sentence = `${event.ownerName} earned the "${event.eventLabel}" reputation in ${event.season}: ${event.supportingStat}.`;
    }

    await upsertReputationEvent(event, sentence);
    processed++;
    void key; // suppress unused variable warning
  }

  console.log(`[reputation] Processed ${processed} events (${newLLM} new LLM, ${skipped} cached)`);
  return { processed, newLLM, skipped };
}
