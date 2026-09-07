/**
 * storyEngine/storyDetectors.ts
 * ─────────────────────────────
 * Deterministic story detectors. No LLM, no network — pure functions over the
 * StoryLeagueFacts contract. Each detector encodes a trigger from the RFSN
 * story taxonomy as a data condition, so every story it emits is receipt-backed.
 */
import type {
  DetectedStory,
  DraftPickFact,
  OwnerFacts,
  OwnerSeasonRecord,
  RivalryFacts,
  StoryLeagueFacts,
  SupportingFact,
  TradeSagaFacts,
} from "./storyTypes";

// ─── shared helpers ────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

const games = (r: OwnerSeasonRecord): number => r.wins + r.losses + r.ties;

const winPct = (r: OwnerSeasonRecord): number => {
  const g = games(r);
  return g > 0 ? (r.wins + 0.5 * r.ties) / g : 0;
};

const rec = (owner: OwnerFacts, season: number): OwnerSeasonRecord | null =>
  owner.seasons.find((s) => s.season === season) ?? null;

/** the completed/played season immediately before `season` for this owner. */
const priorPlayed = (
  owner: OwnerFacts,
  season: number,
): OwnerSeasonRecord | null => {
  const before = owner.seasons
    .filter((s) => s.season < season && games(s) > 0)
    .sort((a, b) => b.season - a.season);
  return before[0] ?? null;
};

/** order a pair by ownerKey so a story id is independent of argument order. */
const orderPair = (
  aKey: string,
  aDisp: string,
  bKey: string,
  bDisp: string,
): { owners: string[]; ownerDisplay: string[] } =>
  aKey <= bKey
    ? { owners: [aKey, bKey], ownerDisplay: [aDisp, bDisp] }
    : { owners: [bKey, aKey], ownerDisplay: [bDisp, aDisp] };

const recStr = (r: OwnerSeasonRecord): string =>
  r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;

// ─── 1. Dynasty ────────────────────────────────────────────────────────────────
/** ≥2 titles inside any 4-season window (the era-defining reign). */
export function detectDynasty(facts: StoryLeagueFacts): DetectedStory[] {
  const out: DetectedStory[] = [];
  for (const owner of facts.owners) {
    const titles = [...owner.titleSeasons].sort((a, b) => a - b);
    if (titles.length < 2) continue;
    let bestWindow = 0;
    for (let i = 0; i < titles.length; i++) {
      const inWin = titles.filter(
        (s) => s >= titles[i] && s <= titles[i] + 3,
      ).length;
      if (inWin > bestWindow) bestWindow = inWin;
    }
    if (bestWindow < 2) continue;
    const facts2: SupportingFact[] = [
      { kind: "titles", text: `${titles.length} titles (${titles.join(", ")})`, value: titles.length },
      { kind: "window", text: `${bestWindow} titles inside a 4-season window`, value: bestWindow },
    ];
    out.push({
      storyType: "dynasty",
      owners: [owner.ownerKey],
      ownerDisplay: [owner.displayName],
      headline: `${owner.displayName} has built a dynasty — ${titles.length} titles`,
      priority: clamp(78 + (bestWindow - 2) * 4 + (titles.length - 2) * 2, 0, 96),
      confidence: clamp(0.55 + 0.12 * titles.length, 0, 1),
      supportingFacts: facts2,
    });
  }
  return out;
}

// ─── 2. Championship Chase ──────────────────────────────────────────────────────
/** Top current-season contenders (top-2 win%, or the reigning champ over .500). */
export function detectChampionshipChase(facts: StoryLeagueFacts): DetectedStory[] {
  const rows = facts.owners
    .map((o) => ({ o, r: rec(o, facts.currentSeason) }))
    .filter((x): x is { o: OwnerFacts; r: OwnerSeasonRecord } => x.r != null && games(x.r) >= 3)
    .map((x) => ({ ...x, wp: winPct(x.r) }))
    .sort((a, b) => b.wp - a.wp);
  if (rows.length === 0) return [];
  const top2 = new Set(rows.slice(0, 2).map((x) => x.o.ownerKey));
  const reigning =
    facts.latestCompletedSeason != null
      ? new Set(
          facts.owners
            .filter((o) => o.titleSeasons.includes(facts.latestCompletedSeason as number))
            .map((o) => o.ownerKey),
        )
      : new Set<string>();
  const out: DetectedStory[] = [];
  for (const x of rows) {
    const isContender = top2.has(x.o.ownerKey) || (reigning.has(x.o.ownerKey) && x.wp >= 0.5);
    if (!isContender) continue;
    out.push({
      storyType: "championship_chase",
      owners: [x.o.ownerKey],
      ownerDisplay: [x.o.displayName],
      headline: `${x.o.displayName} is ${recStr(x.r)} and chasing the ${facts.currentSeason} title`,
      priority: clamp(64 + Math.round(x.wp * 20) + (reigning.has(x.o.ownerKey) ? 4 : 0), 0, 92),
      confidence: clamp(0.4 + x.wp * 0.5, 0, 1),
      supportingFacts: [
        { kind: "record", text: `${facts.currentSeason}: ${recStr(x.r)}`, season: facts.currentSeason },
        ...(reigning.has(x.o.ownerKey) ? [{ kind: "reigning", text: "Reigning champion" }] : []),
      ],
    });
  }
  return out;
}

// ─── 3. Rise ────────────────────────────────────────────────────────────────────
/** Untitled owner starting far stronger than last year (ascent into relevance). */
export function detectRise(facts: StoryLeagueFacts): DetectedStory[] {
  const out: DetectedStory[] = [];
  for (const owner of facts.owners) {
    if (owner.totalTitles > 0) continue; // titled owners rise as redemption/dynasty
    const cur = rec(owner, facts.currentSeason);
    if (!cur || games(cur) < 4) continue;
    const prev = priorPlayed(owner, facts.currentSeason);
    if (!prev) continue;
    const delta = winPct(cur) - winPct(prev);
    if (winPct(cur) < 0.6 || delta < 0.2) continue;
    out.push({
      storyType: "rise",
      owners: [owner.ownerKey],
      ownerDisplay: [owner.displayName],
      headline: `${owner.displayName} is ${recStr(cur)} after last season's ${recStr(prev)}`,
      priority: clamp(52 + Math.round(delta * 40), 0, 82),
      confidence: clamp(0.4 + delta, 0, 1),
      supportingFacts: [
        { kind: "record", text: `${facts.currentSeason}: ${recStr(cur)}`, season: facts.currentSeason },
        { kind: "prior", text: `${prev.season}: ${recStr(prev)}`, season: prev.season },
      ],
    });
  }
  return out;
}

// ─── 4. Collapse ────────────────────────────────────────────────────────────────
/** A strong team falling apart season-over-season. */
export function detectCollapse(facts: StoryLeagueFacts): DetectedStory[] {
  const out: DetectedStory[] = [];
  for (const owner of facts.owners) {
    const cur = rec(owner, facts.currentSeason);
    if (!cur || games(cur) < 4) continue;
    const prev = priorPlayed(owner, facts.currentSeason);
    if (!prev) continue;
    const drop = winPct(prev) - winPct(cur);
    if (winPct(prev) < 0.6 || winPct(cur) > 0.4 || drop < 0.25) continue;
    out.push({
      storyType: "collapse",
      owners: [owner.ownerKey],
      ownerDisplay: [owner.displayName],
      headline: `${owner.displayName} has collapsed to ${recStr(cur)} after ${prev.season}'s ${recStr(prev)}`,
      priority: clamp(56 + Math.round(drop * 40), 0, 88),
      confidence: clamp(0.45 + drop, 0, 1),
      supportingFacts: [
        { kind: "record", text: `${facts.currentSeason}: ${recStr(cur)}`, season: facts.currentSeason },
        { kind: "prior", text: `${prev.season}: ${recStr(prev)}`, season: prev.season },
      ],
    });
  }
  return out;
}

// ─── 5. Redemption ──────────────────────────────────────────────────────────────
/** Made playoffs (or a title) two years ago, missed last year, strong now. */
export function detectRedemption(facts: StoryLeagueFacts): DetectedStory[] {
  const out: DetectedStory[] = [];
  for (const owner of facts.owners) {
    const cur = rec(owner, facts.currentSeason);
    if (!cur || games(cur) < 4 || winPct(cur) < 0.55) continue;
    const prev1 = priorPlayed(owner, facts.currentSeason);
    if (!prev1) continue;
    const prev2 = priorPlayed(owner, prev1.season);
    const fell = !prev1.madePlayoffs; // last completed year was a down year
    const wasGood =
      (prev2 != null && prev2.madePlayoffs) ||
      owner.titleSeasons.some((s) => s < facts.currentSeason);
    if (!fell || !wasGood) continue;
    out.push({
      storyType: "redemption",
      owners: [owner.ownerKey],
      ownerDisplay: [owner.displayName],
      headline: `${owner.displayName} is ${recStr(cur)}, a year after missing the playoffs`,
      priority: clamp(58 + Math.round(winPct(cur) * 16), 0, 84),
      confidence: clamp(0.45 + (winPct(cur) - 0.5), 0, 1),
      supportingFacts: [
        { kind: "record", text: `${facts.currentSeason}: ${recStr(cur)}`, season: facts.currentSeason },
        { kind: "down_year", text: `${prev1.season}: ${recStr(prev1)}, missed playoffs`, season: prev1.season },
      ],
    });
  }
  return out;
}

// ─── 6. Rivalry ─────────────────────────────────────────────────────────────────
/** Close, recent, or playoff-tested head-to-head history. */
export function detectRivalry(facts: StoryLeagueFacts): DetectedStory[] {
  const out: DetectedStory[] = [];
  for (const rv of facts.rivalries) {
    const close = rv.games >= 6 && Math.abs(rv.winsA - rv.winsB) <= 2;
    const playoffTested = rv.playoffGames >= 1;
    const recent =
      rv.lastMeetingSeason != null && rv.lastMeetingSeason >= facts.currentSeason - 2;
    if (!(close || playoffTested) || !recent) continue;
    const { owners, ownerDisplay } = orderPair(rv.ownerA, rv.displayA, rv.ownerB, rv.displayB);
    const sf: SupportingFact[] = [
      { kind: "h2h", text: `${rv.displayA} vs ${rv.displayB}: ${rv.winsA}-${rv.winsB} all-time`, value: rv.games },
    ];
    if (rv.playoffGames > 0) sf.push({ kind: "playoff", text: `${rv.playoffGames} playoff meeting(s)`, value: rv.playoffGames });
    out.push({
      storyType: "rivalry",
      owners,
      ownerDisplay,
      headline: `${rv.displayA} vs ${rv.displayB}: ${rv.winsA}-${rv.winsB} all-time`,
      priority: clamp(68 + (playoffTested ? 10 : 0) + (close ? 6 : 0), 0, 94),
      confidence: clamp(0.5 + Math.min(rv.games, 12) * 0.03, 0, 1),
      supportingFacts: sf,
    });
  }
  return out;
}

// ─── 7. Trade Saga ──────────────────────────────────────────────────────────────
/** Two owners who keep trading with each other (repeat-trade arc). */
export function detectTradeSaga(facts: StoryLeagueFacts): DetectedStory[] {
  const out: DetectedStory[] = [];
  for (const ts of facts.tradeSagas) {
    if (ts.tradeCount < 2) continue;
    const { owners, ownerDisplay } = orderPair(ts.ownerA, ts.displayA, ts.ownerB, ts.displayB);
    out.push({
      storyType: "trade_saga",
      owners,
      ownerDisplay,
      headline: `${ts.displayA} & ${ts.displayB}: ${ts.tradeCount} trades and counting`,
      priority: clamp(48 + ts.tradeCount * 4, 0, 78),
      confidence: clamp(0.4 + ts.tradeCount * 0.08, 0, 1),
      supportingFacts: [
        { kind: "trades", text: `${ts.tradeCount} completed trades between them`, value: ts.tradeCount },
      ],
    });
  }
  return out;
}

// ─── 8 & 9. Reach / Steal ───────────────────────────────────────────────────────
const REACH_GAP = 12; // picked >=12 slots earlier than expected
const STEAL_GAP = 18; // fell >=18 slots past expected

export function detectReach(facts: StoryLeagueFacts): DetectedStory[] {
  return draftGap(facts.draftPicks, "reach");
}

export function detectSteal(facts: StoryLeagueFacts): DetectedStory[] {
  return draftGap(facts.draftPicks, "steal");
}

function draftGap(picks: DraftPickFact[], mode: "reach" | "steal"): DetectedStory[] {
  const out: DetectedStory[] = [];
  for (const p of picks) {
    if (p.expectedPick == null) continue;
    const gap = mode === "reach" ? p.expectedPick - p.overallPick : p.overallPick - p.expectedPick;
    const threshold = mode === "reach" ? REACH_GAP : STEAL_GAP;
    if (gap < threshold) continue;
    const verb = mode === "reach" ? "reached for" : "stole";
    out.push({
      storyType: mode,
      owners: [p.ownerKey],
      ownerDisplay: [p.displayName],
      headline: `${p.displayName} ${verb} ${p.playerName} at ${p.overallPick} (expected ~${p.expectedPick})`,
      priority: clamp((mode === "reach" ? 42 : 46) + Math.round(gap / 4), 0, 74),
      confidence: clamp(0.45 + gap / 60, 0, 1),
      supportingFacts: [
        { kind: "draft", text: `${p.playerName}: pick ${p.overallPick} vs expected ${p.expectedPick}`, season: p.season, value: gap },
      ],
    });
  }
  return out;
}

// ─── 10. Historic Season ────────────────────────────────────────────────────────
/** A season that ties/breaks the league single-season wins record (or undefeated). */
export function detectHistoricSeason(facts: StoryLeagueFacts): DetectedStory[] {
  const out: DetectedStory[] = [];
  const record = facts.leagueRecordWins;
  for (const owner of facts.owners) {
    const cur = rec(owner, facts.currentSeason);
    if (!cur || games(cur) < 6) continue;
    const undefeated = cur.losses === 0 && cur.ties === 0;
    const tiesRecord = record != null && cur.wins >= record;
    if (!undefeated && !tiesRecord) continue;
    const completed =
      facts.latestCompletedSeason != null && facts.currentSeason <= facts.latestCompletedSeason;
    const label = tiesRecord
      ? `the best regular-season record in league history (${recStr(cur)})`
      : `a perfect ${recStr(cur)} season`;
    out.push({
      storyType: "historic_season",
      owners: [owner.ownerKey],
      ownerDisplay: [owner.displayName],
      headline: `${owner.displayName} is putting together ${label}`,
      priority: clamp(66 + (undefeated ? 8 : 0), 0, 90),
      confidence: clamp(0.6 + (undefeated ? 0.2 : 0), 0, 1),
      supportingFacts: [
        { kind: "record", text: `${facts.currentSeason}: ${recStr(cur)}`, season: facts.currentSeason },
        ...(record != null ? [{ kind: "league_record", text: `prior record: ${record} wins`, value: record }] : []),
      ],
      resolution: completed ? `Finished ${recStr(cur)} — ${label}` : null,
    });
  }
  return out;
}

// ─── aggregator ─────────────────────────────────────────────────────────────────
/** Run every detector and return all detected candidate stories for the league. */
export function detectStories(facts: StoryLeagueFacts): DetectedStory[] {
  return [
    ...detectDynasty(facts),
    ...detectChampionshipChase(facts),
    ...detectRise(facts),
    ...detectCollapse(facts),
    ...detectRedemption(facts),
    ...detectRivalry(facts),
    ...detectTradeSaga(facts),
    ...detectReach(facts),
    ...detectSteal(facts),
    ...detectHistoricSeason(facts),
  ];
}
