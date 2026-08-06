/**
 * RFSN-048B — Map Owner Dossier rivalry cards onto existing narrative authorities.
 *
 * Does NOT invent rivalry prose. Assembles explanations from:
 * - rivalryStoryAuthority + rivalryNarrativeTemplates
 * - rivalryService loreSentence / playoffEliminations (when documentary facts support)
 * - biggestThreatService.reason (only when member matches selected active threat)
 * - h2hAuthority verified fields (career / playoffs / streak / lastMeeting)
 *
 * Threat definition note (do not unify in this task):
 * - Advisor/Home: computeBiggestThreat composite score
 * - Rivalry Center: often max playoffEliminations
 * - Owner Dossier RFSN-048: active-season H2H "Active matchup threat"
 */
import { buildH2HAuthority, type H2HResult } from "./h2hAuthority";
import {
  buildRivalryStoryForPair,
  normalizeOwnerKey,
  type RivalryHeadlineKey,
  type RivalryStoryResult,
} from "./rivalryStoryAuthority";
import {
  buildRivalryNarrativeStatements,
  type RivalryNarrativeStatement,
} from "./rivalryNarrativeTemplates";
import { resolveReceiptsForStory } from "./rivalryStoryReceipts";
import { computeBiggestThreat } from "./biggestThreatService";
import { computeRivalryScores } from "./rivalryService";

export type DossierCardKind = "historical" | "currentRival" | "activeThreat";

export type DossierExplanationBullet = {
  text: string;
  factKeys: string[];
  receiptIds: string[];
};

export type DossierRivalryExplanation = {
  cardKind: DossierCardKind;
  opponentOwnerKey: string;
  opponentOwnerName: string;
  headline: string | null;
  reason: string | null;
  bullets: DossierExplanationBullet[];
  /** Machine-readable provenance for UI/debug. */
  provenance: string[];
  coverageQualifier: string | null;
  /** True only when activeThreat card reused Advisor biggestThreat.reason. */
  matchedAdvisorThreat: boolean;
};

export type DossierCardRequest = {
  cardKind: DossierCardKind;
  opponentOwnerKey: string;
  opponentOwnerName?: string;
};

const HEADLINE_LABEL: Record<RivalryHeadlineKey, string> = {
  THREE_ELIMINATIONS: "Playoff executioner",
  GATEKEEPER: "Playoff gatekeeper",
  EXECUTIONER: "Series executioner",
  DYNASTY_BREAKER: "Dynasty breaker",
  PLAYOFF_OWNER: "Owns the playoff chapter",
  REVENGE_COMPLETE: "Revenge complete",
  DEAD_EVEN_DIFFERENT_LEGACIES: "Dead even — different legacies",
  DEAD_EVEN: "Dead-even series",
  OWNS_SERIES: "Owns the series",
  NEMESIS: "Historical nemesis",
  SERIES_ACTIVE: "Active series",
};

function memberIdFromOwnerKey(ownerKey: string): string {
  const n = normalizeOwnerKey(ownerKey);
  return n.replace(/^id:/i, "").replace(/[{}]/g, "").trim().toUpperCase();
}

function ownerKeysMatch(a: string, b: string): boolean {
  const left = memberIdFromOwnerKey(a);
  const right = memberIdFromOwnerKey(b);
  if (!left || !right) return false;
  return left === right;
}

function formatRecord(wins: number, losses: number, ties = 0): string {
  return ties > 0 ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

function effectivePct(wins: number, losses: number, ties: number, games: number): number {
  if (games <= 0) return 0;
  return Number((((wins + 0.5 * ties) / games) * 100).toFixed(1));
}

function coverageQualifierFromH2H(h2h: H2HResult): string | null {
  const games = h2h.career.games;
  if (games <= 0 && h2h.playoffs.games <= 0) return null;
  const seasons = h2h.meetings.map((m) => m.season).filter((s) => s > 0);
  if (seasons.length === 0) {
    return games > 0 ? `across ${games} recorded meetings` : null;
  }
  const min = Math.min(...seasons);
  const max = Math.max(...seasons);
  if (min === max) return `in ${min} recorded history`;
  return `across ${games} recorded meetings (${min}–${max})`;
}

function lastMeetingBullet(h2h: H2HResult): DossierExplanationBullet | null {
  const last = h2h.lastMeeting;
  if (!last) return null;
  return {
    text: `Last recorded meeting: ${last.season} week ${last.week}`,
    factKeys: [],
    receiptIds: [`gm:${last.season}:${last.matchupPeriodId}`],
  };
}

function streakBullet(h2h: H2HResult): DossierExplanationBullet | null {
  const streak = h2h.streak;
  if (!streak || streak.count < 3) return null;
  if (streak.type !== "W" && streak.type !== "L") return null;
  return {
    text:
      streak.type === "L"
        ? `Current recorded streak: ${streak.count} straight losses`
        : `Current recorded streak: ${streak.count} straight wins`,
    factKeys: ["STREAK_ACTIVE"],
    receiptIds: [],
  };
}

function h2hFallbackReason(
  cardKind: DossierCardKind,
  rivalName: string,
  h2h: H2HResult,
  qualifier: string | null,
): string {
  const { wins, losses, ties, games } = h2h.career;
  const record = formatRecord(wins, losses, ties);
  const q = qualifier ? ` ${qualifier}` : ` across ${games} recorded meetings`;
  if (cardKind === "activeThreat") {
    const oppEff = effectivePct(losses, wins, ties, games); // rival's result % vs focal
    const qBit = qualifier ? ` ${qualifier}` : ` across ${games} recorded meetings`;
    return `${rivalName} owns the strongest sustained active edge against you (${Math.round(oppEff)}% of meetings)${qBit}.`;
  }
  if (cardKind === "currentRival") {
    const tied = Math.abs(wins - losses) <= 1 || Math.abs(effectivePct(wins, losses, ties, games) - 50) <= 2;
    const qBit = qualifier ? ` ${qualifier}` : ` across ${games} recorded meetings`;
    if (tied) {
      return `This is your closest high-volume active rivalry at ${record}${qBit}.`;
    }
    return `${rivalName} is your current rivalry focus at ${record}${qBit}.`;
  }
  // historical
  if (wins === 0 && losses >= 3) {
    return `${rivalName} remains your strongest historical nemesis across the recorded series (${record}).`;
  }
  const qBit = qualifier ? ` ${qualifier}` : ` across ${games} recorded meetings`;
  return `${rivalName} tops your historical rivalry ledger at ${record}${qBit}.`;
}

/**
 * Pure assembly of a dossier card explanation from already-loaded authorities.
 * Exported for unit tests — does not invent facts beyond formatting verified fields.
 */
export function assembleDossierRivalryExplanation(args: {
  cardKind: DossierCardKind;
  opponentOwnerKey: string;
  opponentOwnerName: string;
  story: RivalryStoryResult | null;
  statements: RivalryNarrativeStatement[];
  h2h: H2HResult | null;
  loreSentence: string | null;
  advisorThreatReason: string | null;
  advisorThreatMatched: boolean;
  rivalryPlayoffEliminations: number | null;
}): DossierRivalryExplanation {
  const {
    cardKind,
    opponentOwnerKey,
    opponentOwnerName,
    story,
    statements,
    h2h,
    loreSentence,
    advisorThreatReason,
    advisorThreatMatched,
    rivalryPlayoffEliminations,
  } = args;

  const provenance = new Set<string>();
  const bullets: DossierExplanationBullet[] = [];
  const qualifier = h2h ? coverageQualifierFromH2H(h2h) : null;

  const coldOpen = statements.find((s) => s.block === "coldOpen") ?? null;
  if (coldOpen) provenance.add("rivalryNarrativeTemplates.coldOpen");
  if (story) provenance.add("rivalryStoryAuthority");
  if (h2h) provenance.add("h2hAuthority");

  let headline: string | null = null;
  if (story?.headline?.key) {
    headline = HEADLINE_LABEL[story.headline.key] ?? story.headline.key;
    provenance.add("rivalryStoryAuthority.headline");
  }

  let reason: string | null = null;
  let matchedAdvisorThreat = false;

  if (cardKind === "activeThreat" && advisorThreatMatched && advisorThreatReason) {
    reason = advisorThreatReason;
    matchedAdvisorThreat = true;
    provenance.add("biggestThreatService.reason");
  } else if (coldOpen?.text) {
    reason = coldOpen.text;
  } else if (loreSentence) {
    reason = loreSentence;
    provenance.add("rivalryService.loreSentence");
  } else if (h2h) {
    reason = h2hFallbackReason(cardKind, opponentOwnerName, h2h, qualifier);
    provenance.add("h2hAuthority.fallbackReason");
  }

  // Verified statement bullets (exclude cold open — used as reason)
  for (const s of statements.filter((x) => x.block !== "coldOpen")) {
    if (bullets.length >= 3) break;
    bullets.push({
      text: s.text,
      factKeys: [...s.factKeys],
      receiptIds: [...s.receiptIds],
    });
    provenance.add(`rivalryNarrativeTemplates.${s.statementKey}`);
  }

  // Only cite eliminations when documentary authority includes the fact
  const hasElimFact = Boolean(
    story?.documentaryFacts.some((f) => f.factKey === "PLAYOFF_ELIMINATION"),
  );
  if (
    hasElimFact &&
    rivalryPlayoffEliminations != null &&
    rivalryPlayoffEliminations > 0 &&
    bullets.length < 3 &&
    !bullets.some((b) => /eliminat|ended .* season/i.test(b.text))
  ) {
    bullets.push({
      text:
        rivalryPlayoffEliminations === 1
          ? "1 verified playoff elimination in available playoff history"
          : `${rivalryPlayoffEliminations} verified playoff eliminations in available playoff history`,
      factKeys: ["PLAYOFF_ELIMINATION"],
      receiptIds: [],
    });
    provenance.add("rivalryService.playoffEliminations");
  }

  if (h2h && bullets.length < 3) {
    const streak = streakBullet(h2h);
    if (streak && !bullets.some((b) => /streak/i.test(b.text))) {
      bullets.push(streak);
    }
  }
  if (h2h && bullets.length < 3) {
    const last = lastMeetingBullet(h2h);
    if (last) bullets.push(last);
  }

  // Career volume bullet if still thin
  if (h2h && h2h.career.games > 0 && bullets.length < 3) {
    const alreadyCareer = bullets.some((b) => /Career:|recorded meetings/i.test(b.text));
    if (!alreadyCareer) {
      bullets.push({
        text: `${h2h.career.games} recorded meetings (${formatRecord(h2h.career.wins, h2h.career.losses, h2h.career.ties)})`,
        factKeys: [],
        receiptIds: [],
      });
    }
  }

  return {
    cardKind,
    opponentOwnerKey: normalizeOwnerKey(opponentOwnerKey),
    opponentOwnerName,
    headline,
    reason,
    bullets: bullets.slice(0, 3),
    provenance: [...provenance],
    coverageQualifier: qualifier,
    matchedAdvisorThreat,
  };
}

export async function buildDossierRivalryExplanations(args: {
  leagueId: string;
  userId: number;
  focalOwnerKey: string;
  cards: DossierCardRequest[];
}): Promise<DossierRivalryExplanation[]> {
  const focal = normalizeOwnerKey(args.focalOwnerKey);
  const h2hAuth = await buildH2HAuthority(args.leagueId);

  const [advisorThreat, rivalryPairs] = await Promise.all([
    computeBiggestThreat(args.userId).catch(() => null),
    computeRivalryScores(args.userId).catch(() => [] as Awaited<ReturnType<typeof computeRivalryScores>>),
  ]);

  const out: DossierRivalryExplanation[] = [];

  for (const card of args.cards) {
    const rivalKey = normalizeOwnerKey(card.opponentOwnerKey);
    if (!rivalKey || rivalKey === focal) continue;

    let h2h: H2HResult | null = null;
    try {
      h2h = h2hAuth.getH2H(focal, rivalKey);
    } catch {
      h2h = null;
    }

    const displayName =
      (card.opponentOwnerName ?? "").trim() ||
      h2h?.displayB ||
      rivalKey;

    const story = await buildRivalryStoryForPair({
      leagueId: args.leagueId,
      focalOwnerKey: focal,
      rivalOwnerKey: rivalKey,
    }).catch(() => null);

    let statements: RivalryNarrativeStatement[] = [];
    if (story && h2h) {
      const receipts = await resolveReceiptsForStory({
        leagueId: args.leagueId,
        story,
      }).catch(() => []);
      statements = buildRivalryNarrativeStatements({
        story,
        receipts,
        h2h,
        focalName: h2h.displayA,
        rivalName: h2h.displayB || displayName,
      });
    }

    const rivalMember = memberIdFromOwnerKey(rivalKey);
    const pair =
      rivalryPairs.find((p) => memberIdFromOwnerKey(`id:${p.rivalId}`) === rivalMember) ??
      rivalryPairs.find((p) => ownerKeysMatch(`id:${p.rivalId}`, rivalKey)) ??
      null;

    const advisorPrimary = advisorThreat?.threat ?? null;
    const advisorMatched =
      card.cardKind === "activeThreat" &&
      advisorPrimary != null &&
      memberIdFromOwnerKey(`id:${advisorPrimary.memberId}`) === rivalMember;

    out.push(
      assembleDossierRivalryExplanation({
        cardKind: card.cardKind,
        opponentOwnerKey: rivalKey,
        opponentOwnerName: displayName,
        story,
        statements,
        h2h,
        loreSentence: pair?.loreSentence ?? null,
        advisorThreatReason: advisorMatched ? advisorPrimary?.reason ?? null : null,
        advisorThreatMatched: Boolean(advisorMatched),
        rivalryPlayoffEliminations: pair?.playoffEliminations ?? null,
      }),
    );
  }

  return out;
}
