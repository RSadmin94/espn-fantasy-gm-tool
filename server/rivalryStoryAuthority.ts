/**
 * rivalryStoryAuthority.ts
 *
 * Deterministic documentary metadata for a rivalry pair: tier, single headline
 * identity, receipt-backed facts, and story-block eligibility.
 *
 * Consumes H2H Authority, Championship Authority, Owner Identity Authority,
 * Completed Trade Authority (read-only), and optionally weekly stats for block
 * gating. Does not recompute H2H records or championship totals.
 */
import { getDb } from "./db";
import { buildH2HAuthority, type H2HAuthority, type H2HMeeting, type H2HResult } from "./h2hAuthority";
import { buildChampionshipAuthority, type ChampionshipAuthority } from "./championshipAuthority";
import { buildOwnerIdentityAuthority } from "./ownerIdentityAuthority";
import { loadCompletedTradeIntelligence, type CompletedTradeIntel } from "./completedTradeAuthority";
import { getLeagueWeeklyStats } from "./leagueWeeklyStats";

// ── Public types ──────────────────────────────────────────────────────────────

export type RivalryTier = "legendary" | "real" | "quiet";

export type RivalryHeadlineKey =
  | "THREE_ELIMINATIONS"
  | "GATEKEEPER"
  | "EXECUTIONER"
  | "DYNASTY_BREAKER"
  | "PLAYOFF_OWNER"
  | "REVENGE_COMPLETE"
  | "DEAD_EVEN_DIFFERENT_LEGACIES"
  | "DEAD_EVEN"
  | "OWNS_SERIES"
  | "NEMESIS"
  | "SERIES_ACTIVE";

export type StoryBlockKey =
  | "coldOpen"
  | "taleOfTape"
  | "ghosts"
  | "turningPoint"
  | "autopsy"
  | "currentState"
  | "playoffWar"
  | "championship"
  | "tradeLedger"
  | "positional";

export type DocumentaryFactKey =
  | "PLAYOFF_ELIMINATION"
  | "PLAYOFF_WIN"
  | "HEARTBREAK_LOSS"
  | "BLOWOUT_LOSS"
  | "BLOWOUT_WIN"
  | "STREAK_ACTIVE"
  | "LEAD_FLIP"
  | "TITLE_DIVERGENCE"
  | "TRADE_VERDICT_LOSS"
  | "CLOSE_LOSS"
  | "OUTSCORED_TRAILED_RECORD"
  | "PLAYOFF_MEETING";

export interface DocumentaryFact {
  factKey: DocumentaryFactKey;
  supportingGameIds: string[];
  confidence: number;
}

export interface RivalryStoryHeadline {
  key: RivalryHeadlineKey;
  confidence: number;
  receiptIds: string[];
}

export interface RivalryStoryResult {
  focalOwnerKey: string;
  rivalOwnerKey: string;
  tier: RivalryTier;
  headline: RivalryStoryHeadline;
  documentaryFacts: DocumentaryFact[];
  availableBlocks: StoryBlockKey[];
}

export interface RivalryStoryInputs {
  focalOwnerKey: string;
  rivalOwnerKey: string;
  h2h: H2HResult;
  focalTitles: number;
  rivalTitles: number;
  /** Completed trades between the pair only. */
  pairTrades: CompletedTradeIntel[];
  /** True when weekly stats exist for ≥2 H2H meeting weeks. */
  positionalStatsAvailable: boolean;
}

// ── Receipt ids ─────────────────────────────────────────────────────────────────

export function meetingReceiptId(m: Pick<H2HMeeting, "season" | "matchupPeriodId">): string {
  return `gm:${m.season}:${m.matchupPeriodId}`;
}

export function tradeReceiptId(trade: Pick<CompletedTradeIntel, "clusterId">): string {
  return `trade:${trade.clusterId}`;
}

// ── Key normalization (identity ↔ championship) ─────────────────────────────

export function normalizeOwnerKey(key: string): string {
  const raw = key.startsWith("id:") ? key.slice(3) : key;
  const guid = raw.replace(/[{}]/g, "").trim().toUpperCase();
  if (!guid) return key;
  return `id:{${guid}}`;
}

export function titlesForOwnerKey(
  championship: ChampionshipAuthority,
  ownerKey: string,
): number {
  const want = normalizeOwnerKey(ownerKey);
  for (const [k, count] of championship.titlesByKey) {
    if (normalizeOwnerKey(k) === want) return count;
  }
  return 0;
}

// ── Pure analysis helpers ─────────────────────────────────────────────────────

const DYNASTY_WINDOW_SEASONS = 5;
const DYNASTY_MIN_TITLES = 2;

export interface TurningPointAnalysis {
  proven: boolean;
  flipMeetingId: string | null;
  /** Which rule satisfied the turning-point gate, when proven. */
  provenBy: "meeting_flip" | "era_flip" | "playoff_chapter" | null;
}

/** Proven lead-flip: cumulative RS leader changed and never flipped back. */
export function analyzeTurningPoint(
  h2h: H2HResult,
  focalOwnerKey: string,
  rivalOwnerKey: string,
): TurningPointAnalysis {
  const regular = h2h.meetings
    .filter((m) => !m.isPlayoff)
    .sort((a, b) => a.season - b.season || a.matchupPeriodId - b.matchupPeriodId);

  if (regular.length < 2) return { proven: false, flipMeetingId: null, provenBy: null };

  type Leader = "focal" | "rival" | "even";

  const leaderOf = (focalWins: number, rivalWins: number): Leader =>
    focalWins > rivalWins ? "focal" : rivalWins > focalWins ? "rival" : "even";

  // Meeting-by-meeting flip (fine-grained).
  let focalWins = 0;
  let rivalWins = 0;
  let prevLeader: Leader = "even";
  let lastFlipMeetingId: string | null = null;

  for (const m of regular) {
    if (m.winner === focalOwnerKey) focalWins++;
    else if (m.winner === rivalOwnerKey) rivalWins++;

    const leader = leaderOf(focalWins, rivalWins);
    if (leader !== "even" && prevLeader !== "even" && leader !== prevLeader) {
      lastFlipMeetingId = meetingReceiptId(m);
    }
    if (leader !== "even") prevLeader = leader;
  }

  const finalLeader = leaderOf(focalWins, rivalWins);
  if (lastFlipMeetingId !== null && finalLeader !== "even") {
    return { proven: true, flipMeetingId: lastFlipMeetingId, provenBy: "meeting_flip" };
  }

  // Season-era flip: leader after a season boundary changed and held through the end.
  const bySeason = new Map<number, H2HMeeting[]>();
  for (const m of regular) {
    if (!bySeason.has(m.season)) bySeason.set(m.season, []);
    bySeason.get(m.season)!.push(m);
  }
  const seasons = [...bySeason.keys()].sort((a, b) => a - b);
  focalWins = 0;
  rivalWins = 0;
  prevLeader = "even";
  let eraFlipMeetingId: string | null = null;

  for (const season of seasons) {
    for (const m of bySeason.get(season)!) {
      if (m.winner === focalOwnerKey) focalWins++;
      else if (m.winner === rivalOwnerKey) rivalWins++;
    }
    const leader = leaderOf(focalWins, rivalWins);
    if (leader !== "even" && prevLeader !== "even" && leader !== prevLeader) {
      const seasonMeetings = bySeason.get(season)!;
      eraFlipMeetingId = meetingReceiptId(seasonMeetings[seasonMeetings.length - 1]!);
    }
    if (leader !== "even") prevLeader = leader;
  }

  if (eraFlipMeetingId !== null && finalLeader !== "even") {
    return { proven: true, flipMeetingId: eraFlipMeetingId, provenBy: "era_flip" };
  }

  // Playoff chapter diverges from regular-season career leader (≥2 playoff meetings).
  if (h2h.playoffs.games >= 2) {
    const rsLeader = leaderOf(h2h.career.wins, h2h.career.losses);
    const poLeader = leaderOf(h2h.playoffs.wins, h2h.playoffs.losses);
    const chapterDiverges =
      poLeader !== "even" && (rsLeader === "even" || rsLeader !== poLeader);
    if (chapterDiverges) {
      const lastPlayoff = h2h.meetings.filter((m) => m.isPlayoff).at(-1)!;
      return {
        proven: true,
        flipMeetingId: meetingReceiptId(lastPlayoff),
        provenBy: "playoff_chapter",
      };
    }
  }

  return { proven: false, flipMeetingId: null, provenBy: null };
}

function distinctEliminationSeasons(
  meetings: H2HMeeting[],
  focalOwnerKey: string,
  rivalOwnerKey: string,
): number[] {
  const seasons = new Set<number>();
  for (const m of meetings) {
    if (!m.isPlayoff) continue;
    if (m.winner === rivalOwnerKey) seasons.add(m.season);
  }
  return [...seasons].sort((a, b) => a - b);
}

function hasDynastyInWindow(
  championship: Pick<ChampionshipAuthority, "championSeasonsByKey" | "latestCompletedSeason">,
  ownerKey: string,
): boolean {
  const normKey = normalizeOwnerKey(ownerKey);
  const latest = championship.latestCompletedSeason;
  if (latest == null) return false;
  const windowStart = latest - (DYNASTY_WINDOW_SEASONS - 1);
  for (const [k, seasons] of championship.championSeasonsByKey) {
    if (normalizeOwnerKey(k) !== normKey) continue;
    const inWindow = seasons.filter((s) => s >= windowStart && s <= latest);
    if (inWindow.length >= DYNASTY_MIN_TITLES) return true;
  }
  return false;
}

function hasChampionshipImplication(args: {
  h2h: H2HResult;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  focalTitles: number;
  rivalTitles: number;
  championship: Pick<ChampionshipAuthority, "championKeyBySeason">;
}): boolean {
  const { h2h, focalOwnerKey, rivalOwnerKey, focalTitles, rivalTitles, championship } = args;
  if (focalTitles > 0 || rivalTitles > 0) {
    if (focalTitles !== rivalTitles) return true;
    if (focalTitles > 0 && rivalTitles > 0) return true;
  }

  const focalNorm = normalizeOwnerKey(focalOwnerKey);
  const rivalNorm = normalizeOwnerKey(rivalOwnerKey);

  for (const m of h2h.meetings.filter((x) => x.isPlayoff)) {
    const champKey = championship.championKeyBySeason.get(m.season);
    if (!champKey) continue;
    const champNorm = normalizeOwnerKey(champKey);
    if (champNorm === focalNorm || champNorm === rivalNorm) return true;
  }
  return false;
}

export function classifyRivalryTier(args: {
  h2h: H2HResult;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  focalTitles: number;
  rivalTitles: number;
  championship: Pick<
    ChampionshipAuthority,
    "championKeyBySeason" | "championSeasonsByKey" | "latestCompletedSeason"
  >;
}): RivalryTier {
  const totalMeetings = args.h2h.career.games + args.h2h.playoffs.games;
  const hasPlayoffHistory = args.h2h.playoffs.games > 0;
  const turningPoint = analyzeTurningPoint(args.h2h, args.focalOwnerKey, args.rivalOwnerKey);
  const champImplication = hasChampionshipImplication({
    h2h: args.h2h,
    focalOwnerKey: args.focalOwnerKey,
    rivalOwnerKey: args.rivalOwnerKey,
    focalTitles: args.focalTitles,
    rivalTitles: args.rivalTitles,
    championship: args.championship,
  });

  if (
    hasPlayoffHistory &&
    turningPoint.proven &&
    (champImplication || totalMeetings >= 12)
  ) {
    return "legendary";
  }
  if (totalMeetings >= 8 || hasPlayoffHistory) return "real";
  return "quiet";
}

interface HeadlineCandidate {
  key: RivalryHeadlineKey;
  confidence: number;
  receiptIds: string[];
  priority: number;
}

export function selectRivalryHeadline(args: {
  h2h: H2HResult;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  focalTitles: number;
  rivalTitles: number;
  championship: Pick<
    ChampionshipAuthority,
    "championKeyBySeason" | "championSeasonsByKey" | "latestCompletedSeason"
  >;
  pairTrades: CompletedTradeIntel[];
  turningPoint: TurningPointAnalysis;
}): RivalryStoryHeadline {
  const { h2h, focalOwnerKey, rivalOwnerKey, focalTitles, rivalTitles, championship, pairTrades, turningPoint } =
    args;

  const playoffLosses = h2h.playoffs.losses;
  const playoffWinsRival = h2h.playoffs.losses; // focal losses = rival playoff wins
  const elimSeasons = distinctEliminationSeasons(h2h.meetings, focalOwnerKey, rivalOwnerKey);
  const totalRs = h2h.career.games;
  const recordGap = Math.abs(h2h.career.wins - h2h.career.losses);
  const focalNorm = normalizeOwnerKey(focalOwnerKey);

  const candidates: HeadlineCandidate[] = [];

  if (playoffLosses >= 3) {
    const ids = h2h.meetings
      .filter((m) => m.isPlayoff && m.winner === rivalOwnerKey)
      .map(meetingReceiptId);
    candidates.push({
      key: "THREE_ELIMINATIONS",
      priority: 100,
      confidence: Math.min(1, 0.75 + playoffLosses * 0.05),
      receiptIds: ids.slice(0, playoffLosses),
    });
  }

  if (elimSeasons.length >= 2) {
    const ids = h2h.meetings
      .filter((m) => m.isPlayoff && m.winner === rivalOwnerKey && elimSeasons.includes(m.season))
      .map(meetingReceiptId);
    candidates.push({
      key: "GATEKEEPER",
      priority: 95,
      confidence: Math.min(1, 0.7 + elimSeasons.length * 0.1),
      receiptIds: ids,
    });
  }

  if (playoffWinsRival >= 3 && playoffLosses < 3) {
    const ids = h2h.meetings
      .filter((m) => m.isPlayoff && m.winner === rivalOwnerKey)
      .map(meetingReceiptId);
    candidates.push({
      key: "EXECUTIONER",
      priority: 90,
      confidence: Math.min(1, 0.7 + playoffWinsRival * 0.08),
      receiptIds: ids,
    });
  }

  const rivalDynasty = hasDynastyInWindow(championship, rivalOwnerKey);
  const focalDynasty = hasDynastyInWindow(championship, focalOwnerKey);
  const playoffMeetings = h2h.meetings.filter((m) => m.isPlayoff);
  if ((rivalDynasty || focalDynasty) && playoffMeetings.length > 0) {
    candidates.push({
      key: "DYNASTY_BREAKER",
      priority: 85,
      confidence: 0.85,
      receiptIds: playoffMeetings.map(meetingReceiptId),
    });
  }

  if (
    h2h.playoffs.games >= 2 &&
    playoffWinsRival >= 2 &&
    h2h.playoffs.wins < h2h.playoffs.losses
  ) {
    candidates.push({
      key: "PLAYOFF_OWNER",
      priority: 80,
      confidence: Math.min(1, 0.65 + h2h.playoffs.games * 0.05),
      receiptIds: playoffMeetings.map(meetingReceiptId),
    });
  }

  const meetings = [...h2h.meetings].sort(
    (a, b) => a.season - b.season || a.matchupPeriodId - b.matchupPeriodId,
  );
  const last = meetings[meetings.length - 1];
  const prev = meetings.length >= 2 ? meetings[meetings.length - 2] : null;
  if (
    last &&
    last.winner === focalOwnerKey &&
    prev &&
    prev.winner === rivalOwnerKey
  ) {
    candidates.push({
      key: "REVENGE_COMPLETE",
      priority: 75,
      confidence: 0.8,
      receiptIds: [meetingReceiptId(prev), meetingReceiptId(last)],
    });
  }

  if (totalRs >= 8 && recordGap <= 1 && focalTitles !== rivalTitles) {
    candidates.push({
      key: "DEAD_EVEN_DIFFERENT_LEGACIES",
      priority: 70,
      confidence: Math.min(1, 0.6 + totalRs * 0.02),
      receiptIds: [`title:focal:${focalTitles}`, `title:rival:${rivalTitles}`],
    });
  }

  if (totalRs >= 8 && recordGap <= 1 && focalTitles === rivalTitles) {
    candidates.push({
      key: "DEAD_EVEN",
      priority: 65,
      confidence: Math.min(1, 0.6 + totalRs * 0.02),
      receiptIds: h2h.meetings.filter((m) => !m.isPlayoff).slice(-3).map(meetingReceiptId),
    });
  }

  const winPct = totalRs > 0 ? h2h.career.wins / totalRs : 0;
  if ((totalRs >= 10 && winPct >= 0.7) || (totalRs >= 4 && h2h.career.losses === 0)) {
    candidates.push({
      key: "OWNS_SERIES",
      priority: 60,
      confidence: Math.min(1, 0.55 + winPct * 0.4),
      receiptIds: h2h.meetings.filter((m) => !m.isPlayoff && m.winner === focalOwnerKey).slice(-3).map(meetingReceiptId),
    });
  }

  if (totalRs >= 3 && winPct <= 0.35 && playoffLosses >= 2) {
    candidates.push({
      key: "NEMESIS",
      priority: 55,
      confidence: Math.min(1, 0.6 + playoffLosses * 0.1),
      receiptIds: h2h.meetings
        .filter((m) => m.winner === rivalOwnerKey)
        .slice(-3)
        .map(meetingReceiptId),
    });
  }

  if (candidates.length === 0) {
    const ids =
      h2h.meetings.length > 0
        ? [meetingReceiptId(h2h.meetings[h2h.meetings.length - 1]!)]
        : pairTrades.length > 0
          ? [tradeReceiptId(pairTrades[pairTrades.length - 1]!)]
          : [];
    return { key: "SERIES_ACTIVE", confidence: 0.5, receiptIds: ids };
  }

  candidates.sort((a, b) => b.priority - a.priority || b.confidence - a.confidence);
  const top = candidates[0]!;
  return { key: top.key, confidence: top.confidence, receiptIds: top.receiptIds };
}

export function collectDocumentaryFacts(args: {
  h2h: H2HResult;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  focalTitles: number;
  rivalTitles: number;
  pairTrades: CompletedTradeIntel[];
  turningPoint: TurningPointAnalysis;
}): DocumentaryFact[] {
  const { h2h, focalOwnerKey, rivalOwnerKey, focalTitles, rivalTitles, pairTrades, turningPoint } =
    args;
  const facts: DocumentaryFact[] = [];

  const playoffLosses = h2h.meetings.filter((m) => m.isPlayoff && m.winner === rivalOwnerKey);
  if (playoffLosses.length > 0) {
    facts.push({
      factKey: "PLAYOFF_ELIMINATION",
      supportingGameIds: playoffLosses.map(meetingReceiptId),
      confidence: Math.min(1, 0.7 + playoffLosses.length * 0.1),
    });
  }

  const playoffWins = h2h.meetings.filter((m) => m.isPlayoff && m.winner === focalOwnerKey);
  if (playoffWins.length > 0) {
    facts.push({
      factKey: "PLAYOFF_WIN",
      supportingGameIds: playoffWins.map(meetingReceiptId),
      confidence: Math.min(1, 0.7 + playoffWins.length * 0.1),
    });
  }

  if (h2h.playoffs.games > 0) {
    facts.push({
      factKey: "PLAYOFF_MEETING",
      supportingGameIds: h2h.meetings.filter((m) => m.isPlayoff).map(meetingReceiptId),
      confidence: 0.95,
    });
  }

  const heartbreaks = h2h.meetings.filter(
    (m) => !m.isPlayoff && m.winner === rivalOwnerKey && m.marginA > -3 && m.marginA < 0,
  );
  if (heartbreaks.length > 0) {
    facts.push({
      factKey: "HEARTBREAK_LOSS",
      supportingGameIds: heartbreaks.map(meetingReceiptId),
      confidence: 0.9,
    });
  }

  const closeLosses = h2h.meetings.filter(
    (m) => !m.isPlayoff && m.winner === rivalOwnerKey && m.marginA > -5 && m.marginA < 0,
  );
  if (closeLosses.length >= 2) {
    facts.push({
      factKey: "CLOSE_LOSS",
      supportingGameIds: closeLosses.map(meetingReceiptId),
      confidence: Math.min(1, 0.6 + closeLosses.length * 0.08),
    });
  }

  if (h2h.largestLoss) {
    facts.push({
      factKey: "BLOWOUT_LOSS",
      supportingGameIds: [meetingReceiptId(h2h.largestLoss)],
      confidence: h2h.largestLoss.marginA <= -25 ? 0.95 : 0.75,
    });
  }

  if (h2h.largestVictory) {
    facts.push({
      factKey: "BLOWOUT_WIN",
      supportingGameIds: [meetingReceiptId(h2h.largestVictory)],
      confidence: h2h.largestVictory.marginA >= 25 ? 0.95 : 0.75,
    });
  }

  if (h2h.streak.count >= 3 && h2h.streak.type !== "none") {
    const streakMeetings = h2h.meetings
      .filter((m) => !m.isPlayoff)
      .slice(-h2h.streak.count);
    facts.push({
      factKey: "STREAK_ACTIVE",
      supportingGameIds: streakMeetings.map(meetingReceiptId),
      confidence: Math.min(1, 0.65 + h2h.streak.count * 0.08),
    });
  }

  if (turningPoint.proven && turningPoint.flipMeetingId) {
    facts.push({
      factKey: "LEAD_FLIP",
      supportingGameIds: [turningPoint.flipMeetingId],
      confidence: 0.9,
    });
  }

  if (focalTitles !== rivalTitles && (focalTitles > 0 || rivalTitles > 0)) {
    facts.push({
      factKey: "TITLE_DIVERGENCE",
      supportingGameIds: [`title:focal:${focalTitles}`, `title:rival:${rivalTitles}`],
      confidence: 0.95,
    });
  }

  const focalTradeLosses = pairTrades.filter(
    (t) =>
      t.winnerOwnerKey &&
      t.winnerOwnerKey !== focalOwnerKey &&
      (t.sideA.ownerKey === focalOwnerKey || t.sideB.ownerKey === focalOwnerKey),
  );
  if (focalTradeLosses.length > 0) {
    facts.push({
      factKey: "TRADE_VERDICT_LOSS",
      supportingGameIds: focalTradeLosses.map(tradeReceiptId),
      confidence: 0.9,
    });
  }

  const rsGames = h2h.career.games;
  if (rsGames >= 3 && h2h.averageMarginA > 0 && h2h.career.wins < h2h.career.losses) {
    facts.push({
      factKey: "OUTSCORED_TRAILED_RECORD",
      supportingGameIds: h2h.meetings.filter((m) => !m.isPlayoff).slice(-5).map(meetingReceiptId),
      confidence: 0.85,
    });
  }

  return facts;
}

export function eligibleStoryBlocks(args: {
  tier: RivalryTier;
  h2h: H2HResult;
  turningPoint: TurningPointAnalysis;
  focalTitles: number;
  rivalTitles: number;
  pairTrades: CompletedTradeIntel[];
  documentaryFacts: DocumentaryFact[];
  positionalStatsAvailable: boolean;
  championship: Pick<ChampionshipAuthority, "championKeyBySeason">;
  focalOwnerKey: string;
  rivalOwnerKey: string;
}): StoryBlockKey[] {
  const blocks = new Set<StoryBlockKey>();
  const totalMeetings = args.h2h.career.games + args.h2h.playoffs.games;

  if (totalMeetings > 0 || args.pairTrades.length > 0) blocks.add("coldOpen");

  if (totalMeetings > 0) blocks.add("taleOfTape");

  const factKeys = new Set(args.documentaryFacts.map((f) => f.factKey));
  if (
    factKeys.has("HEARTBREAK_LOSS") ||
    factKeys.has("PLAYOFF_ELIMINATION") ||
    factKeys.has("BLOWOUT_LOSS")
  ) {
    blocks.add("ghosts");
  }

  if (args.turningPoint.proven) blocks.add("turningPoint");

  if (
    factKeys.has("OUTSCORED_TRAILED_RECORD") ||
    factKeys.has("CLOSE_LOSS") ||
    factKeys.has("BLOWOUT_LOSS")
  ) {
    blocks.add("autopsy");
  }

  if (totalMeetings >= 3 || args.h2h.streak.count >= 2) blocks.add("currentState");

  if (args.h2h.playoffs.games > 0) blocks.add("playoffWar");

  if (
    hasChampionshipImplication({
      h2h: args.h2h,
      focalOwnerKey: args.focalOwnerKey,
      rivalOwnerKey: args.rivalOwnerKey,
      focalTitles: args.focalTitles,
      rivalTitles: args.rivalTitles,
      championship: args.championship,
    })
  ) {
    blocks.add("championship");
  }

  if (args.pairTrades.length > 0) blocks.add("tradeLedger");

  if (
    args.positionalStatsAvailable &&
    (args.tier === "legendary" || args.tier === "real") &&
    totalMeetings >= 3
  ) {
    blocks.add("positional");
  }

  if (args.tier === "quiet") {
    const minimal: StoryBlockKey[] = ["coldOpen"];
    if (totalMeetings > 0) minimal.push("taleOfTape");
    return minimal.filter((b) => blocks.has(b));
  }

  return [...blocks].sort();
}

/** Pure classifier — unit-test entry point. */
export function classifyRivalryStory(inputs: RivalryStoryInputs & {
  championship: Pick<
    ChampionshipAuthority,
    "championKeyBySeason" | "championSeasonsByKey" | "latestCompletedSeason"
  >;
}): RivalryStoryResult {
  const turningPoint = analyzeTurningPoint(inputs.h2h, inputs.focalOwnerKey, inputs.rivalOwnerKey);
  const tier = classifyRivalryTier({
    h2h: inputs.h2h,
    focalOwnerKey: inputs.focalOwnerKey,
    rivalOwnerKey: inputs.rivalOwnerKey,
    focalTitles: inputs.focalTitles,
    rivalTitles: inputs.rivalTitles,
    championship: inputs.championship,
  });
  const documentaryFacts = collectDocumentaryFacts({
    h2h: inputs.h2h,
    focalOwnerKey: inputs.focalOwnerKey,
    rivalOwnerKey: inputs.rivalOwnerKey,
    focalTitles: inputs.focalTitles,
    rivalTitles: inputs.rivalTitles,
    pairTrades: inputs.pairTrades,
    turningPoint,
  });
  const headline = selectRivalryHeadline({
    h2h: inputs.h2h,
    focalOwnerKey: inputs.focalOwnerKey,
    rivalOwnerKey: inputs.rivalOwnerKey,
    focalTitles: inputs.focalTitles,
    rivalTitles: inputs.rivalTitles,
    championship: inputs.championship,
    pairTrades: inputs.pairTrades,
    turningPoint,
  });
  const availableBlocks = eligibleStoryBlocks({
    tier,
    h2h: inputs.h2h,
    turningPoint,
    focalTitles: inputs.focalTitles,
    rivalTitles: inputs.rivalTitles,
    pairTrades: inputs.pairTrades,
    documentaryFacts,
    positionalStatsAvailable: inputs.positionalStatsAvailable,
    championship: inputs.championship,
    focalOwnerKey: inputs.focalOwnerKey,
    rivalOwnerKey: inputs.rivalOwnerKey,
  });

  return {
    focalOwnerKey: inputs.focalOwnerKey,
    rivalOwnerKey: inputs.rivalOwnerKey,
    tier,
    headline,
    documentaryFacts,
    availableBlocks,
  };
}

// ── Async builder ─────────────────────────────────────────────────────────────

function filterPairTrades(
  trades: CompletedTradeIntel[],
  focalOwnerKey: string,
  rivalOwnerKey: string,
): CompletedTradeIntel[] {
  const focal = normalizeOwnerKey(focalOwnerKey);
  const rival = normalizeOwnerKey(rivalOwnerKey);
  return trades.filter((t) => {
    const a = t.sideA.ownerKey ? normalizeOwnerKey(t.sideA.ownerKey) : null;
    const b = t.sideB.ownerKey ? normalizeOwnerKey(t.sideB.ownerKey) : null;
    return (a === focal && b === rival) || (a === rival && b === focal);
  });
}

async function positionalStatsAvailableForPair(
  leagueId: string,
  h2h: H2HResult,
  focalOwnerKey: string,
  rivalOwnerKey: string,
): Promise<boolean> {
  const meetings = h2h.meetings;
  if (meetings.length < 2) return false;
  const seasons = [...new Set(meetings.map((m) => m.season))];
  const { rows } = await getLeagueWeeklyStats(leagueId, { startersOnly: true, seasons });
  if (rows.length === 0) return false;

  const focalNorm = normalizeOwnerKey(focalOwnerKey);
  const rivalNorm = normalizeOwnerKey(rivalOwnerKey);
  let covered = 0;
  for (const m of meetings) {
    const hasFocal = rows.some(
      (r) =>
        r.season === m.season &&
        r.week === m.week &&
        normalizeOwnerKey(r.ownerKey) === focalNorm,
    );
    const hasRival = rows.some(
      (r) =>
        r.season === m.season &&
        r.week === m.week &&
        normalizeOwnerKey(r.ownerKey) === rivalNorm,
    );
    if (hasFocal && hasRival) covered++;
  }
  return covered >= 2;
}

export async function buildRivalryStoryForPair(args: {
  leagueId: string;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  seasons?: number[];
}): Promise<RivalryStoryResult | null> {
  const db = await getDb();
  if (!db) return null;

  const h2hAuth = await buildH2HAuthority(args.leagueId);
  const h2h = h2hAuth.getH2H(args.focalOwnerKey, args.rivalOwnerKey);
  if (h2h.career.games + h2h.playoffs.games === 0 && h2h.meetings.length === 0) {
    const tradesOnly = args.seasons?.length
      ? await loadCompletedTradeIntelligence({ db, leagueId: args.leagueId, seasons: args.seasons })
      : [];
    const pairTrades = filterPairTrades(tradesOnly, args.focalOwnerKey, args.rivalOwnerKey);
    if (pairTrades.length === 0) return null;
  }

  const championship = await buildChampionshipAuthority({ db, leagueId: args.leagueId });
  const focalTitles = titlesForOwnerKey(championship, args.focalOwnerKey);
  const rivalTitles = titlesForOwnerKey(championship, args.rivalOwnerKey);

  const seasons =
    args.seasons ??
    [...new Set(h2h.meetings.map((m) => m.season))].sort((a, b) => a - b);

  const allTrades =
    seasons.length > 0
      ? await loadCompletedTradeIntelligence({ db, leagueId: args.leagueId, seasons })
      : [];
  const pairTrades = filterPairTrades(allTrades, args.focalOwnerKey, args.rivalOwnerKey);

  const positionalStatsAvailable = await positionalStatsAvailableForPair(
    args.leagueId,
    h2h,
    args.focalOwnerKey,
    args.rivalOwnerKey,
  );

  return classifyRivalryStory({
    focalOwnerKey: args.focalOwnerKey,
    rivalOwnerKey: args.rivalOwnerKey,
    h2h,
    focalTitles,
    rivalTitles,
    pairTrades,
    positionalStatsAvailable,
    championship,
  });
}

export async function buildRivalryStoryAuthority(args: {
  leagueId: string;
  focalOwnerKey: string;
  seasons?: number[];
}): Promise<Map<string, RivalryStoryResult>> {
  const h2hAuth = await buildH2HAuthority(args.leagueId);
  const rivals = h2hAuth.opponentsOf(args.focalOwnerKey);
  const out = new Map<string, RivalryStoryResult>();
  for (const rival of rivals) {
    const story = await buildRivalryStoryForPair({
      leagueId: args.leagueId,
      focalOwnerKey: args.focalOwnerKey,
      rivalOwnerKey: rival,
      seasons: args.seasons,
    });
    if (story) out.set(rival, story);
  }
  return out;
}
