/**
 * Weekly editorial layer — presentation aggregation over certified Week Pack facts.
 * Does not replace detectors. Does not invent a second story engine.
 */
import type { DetectedEvent, InspectedMatchup } from "./weeklyWeekInspect";
import type { BenchRegret } from "./weeklyLineupOutcomes";
import type { RivalryReceipt, TeamWeekPacket } from "./weeklyWeekReceipts";
import { licensedFacts, type FactGroups, type FactMap, type NarrativeFactPacket } from "./weeklySeasonNarratives";

export type StoryScope = "LEAGUE" | "MATCHUP" | "OWNER" | "HISTORICAL";
export type StoryRole = "HEADLINE" | "LEAGUE_STORY" | "OWNER_TAKE" | "SIDEBAR";
export type ContextKind = "EVENT" | "CONTEXT";

export type HeadlineDimensions = {
  drama: number;
  consequence: number;
  historical: number;
  dominance: number;
  rarity: number;
  total: number;
};

export type EditorialStory = {
  eventId: string;
  canonicalId: string;
  eventType: string;
  presentationLabel: string;
  scope: StoryScope;
  role: StoryRole;
  subject: string;
  opponent: string | null;
  dek: string;
  facts: Record<string, string | number | boolean | null>;
  composedFrom: string[];
  headlineScore?: HeadlineDimensions;
  diversityKey: string;
  generateSofia: boolean;
};

export type OwnerTake = {
  teamId: number;
  ownerName: string;
  eventType: string;
  presentationLabel: string;
  dek: string;
  generateSofia: boolean;
  eventId: string;
  facts: Record<string, string | number | boolean | null>;
};

export type WeeklyEdition = {
  season: number;
  week: number;
  leagueId: string;
  weeklyEventCount: number;
  historicalContextCount: number;
  canonicalEditorialEventCount: number;
  headline: EditorialStory | null;
  majorStories: EditorialStory[];
  superlatives: {
    highScore: { name: string; owner: string; score: number } | null;
    lowScore: { name: string; owner: string; score: number } | null;
    closestGame: { home: string; away: string; margin: number; homeScore: number; awayScore: number } | null;
    biggestBlowout: { winner: string; loser: string; margin: number } | null;
    weekMvp: { player: string; points: number; position: string; owner: string; teamId: number; share: number | null } | null;
    biggestLineupRegret: { owner: string; player: string; net: number; impact: string } | null;
    leagueAverage: number;
  };
  matchups: InspectedMatchup[];
  ownerTakes: OwnerTake[];
  oneThatGotAway: EditorialStory | null;
  rivalryStory: EditorialStory | null;
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function pairId(a: number, b: number, week: number): string {
  return `matchup:${[a, b].sort((x, y) => x - y).join("-")}:w${week}`;
}

export function classifyContextKind(event: DetectedEvent): ContextKind {
  if (event.source === "RFSN Story Engine") return "CONTEXT";
  return "EVENT";
}

export function scoreHeadlineDimensions(opts: {
  drama: number;
  consequence: number;
  historical: number;
  dominance: number;
  rarity: number;
}): HeadlineDimensions {
  const drama = clamp(opts.drama);
  const consequence = clamp(opts.consequence);
  const historical = clamp(opts.historical);
  const dominance = clamp(opts.dominance);
  const rarity = clamp(opts.rarity);
  const total = r2(drama * 0.3 + consequence * 0.25 + historical * 0.15 + dominance * 0.2 + rarity * 0.1);
  return { drama, consequence, historical, dominance, rarity, total };
}

function dramaFromMargin(margin: number): number {
  if (margin <= 1.5) return 100;
  if (margin <= 3) return 88;
  if (margin <= 5) return 75;
  if (margin <= 8) return 55;
  return 12;
}

function dominanceFrom(score: number, avg: number, margin: number): number {
  const vsAvg = avg > 0 ? ((score - avg) / avg) * 100 : 0;
  return clamp(vsAvg * 1.4 + Math.min(40, margin * 0.5));
}

function parseWl(record: string | null): { w: number; l: number; games: number } | null {
  if (!record) return null;
  const m = record.match(/^(\d+)-(\d+)/);
  if (!m) return null;
  const w = Number(m[1]);
  const l = Number(m[2]);
  return { w, l, games: w + l };
}

export function rivalryWeeklySignificance(r: RivalryReceipt, winnerOwner: string): number {
  let s = 0;
  if (r.playoffMeetings >= 3) s += 35;
  else if (r.playoffMeetings >= 1) s += 12;
  const entering = parseWl(r.careerEntering);
  if (entering && entering.games >= 10) {
    const underdog = entering.w <= entering.l * 0.35;
    const winnerWasTrailer =
      (r.homeOwner === winnerOwner && entering.w < entering.l) ||
      (r.awayOwner === winnerOwner && entering.l < entering.w);
    if (underdog && winnerWasTrailer) s += 32;
    if (Math.max(entering.w, entering.l) - Math.min(entering.w, entering.l) >= 8) s += 10;
  }
  if (r.streak && /^L[3-9]/.test(r.streak) && r.homeOwner === winnerOwner) s += 20;
  if (r.closeGames >= 4) s += 8;
  return clamp(s);
}

function rivalryForMatchup(matchup: InspectedMatchup, rivalry: RivalryReceipt[]): RivalryReceipt | null {
  return (
    rivalry.find(
      (r) =>
        (r.homeOwner === matchup.homeOwner && r.awayOwner === matchup.awayOwner) ||
        (r.homeOwner === matchup.awayOwner && r.awayOwner === matchup.homeOwner),
    ) ?? null
  );
}

function winnerLoser(m: InspectedMatchup): { winner: string; loser: string; winnerOwner: string; loserOwner: string; winScore: number; loseScore: number } {
  const homeWon = m.winnerTeamId === m.homeTeamId;
  return homeWon
    ? { winner: m.homeName, loser: m.awayName, winnerOwner: m.homeOwner, loserOwner: m.awayOwner, winScore: m.homeScore, loseScore: m.awayScore }
    : { winner: m.awayName, loser: m.homeName, winnerOwner: m.awayOwner, loserOwner: m.homeOwner, winScore: m.awayScore, loseScore: m.homeScore };
}

function pickFacts(facts: FactMap, keys: string[]): FactMap {
  const out: FactMap = {};
  for (const k of keys) {
    const v = facts[k];
    if (v != null && v !== "") out[k] = v;
  }
  return out;
}

export function storyFactPacket(
  story: EditorialStory,
  ctx: { week: number; season: number },
): NarrativeFactPacket {
  const f = story.facts;
  const factGroups: FactGroups = {};
  const matchup = pickFacts(f, ["homeScore", "awayScore", "margin", "winScore", "loseScore", "score", "winner", "loser"]);
  const player = pickFacts(f, ["pog", "pogPoints", "player", "position", "points", "owner"]);
  const lineup = pickFacts(f, ["bench", "benchPoints", "starter", "starterPoints", "net", "impact", "winFlipOwner"]);
  const rivalry = pickFacts(f, ["careerEntering", "careerAfter", "streak", "playoffMeetings", "closeGames", "weekMargin"]);
  const historical = pickFacts(f, [
    "careerEnteringWins",
    "careerEnteringLosses",
    "careerAfterWins",
    "careerAfterLosses",
    "regularSeasonMeetingsEntering",
    "playoffMeetings",
    "closeGames",
    "careerEntering",
    "careerAfter",
    "streak",
  ]);
  const league: FactMap = { week: ctx.week, season: ctx.season };
  if (f.leagueAverage != null) league.leagueAverage = f.leagueAverage;
  if (Object.keys(matchup).length) factGroups.MATCHUP_FACTS = matchup;
  if (Object.keys(player).length) factGroups.PLAYER_FACTS = player;
  if (Object.keys(lineup).length) factGroups.LINEUP_FACTS = lineup;
  if (Object.keys(rivalry).length) factGroups.RIVALRY_FACTS = rivalry;
  if (Object.keys(historical).length) factGroups.HISTORICAL_FACTS = historical;
  factGroups.LEAGUE_FACTS = league;
  factGroups.EDITORIAL_CONTEXT = {
    presentationLabel: story.presentationLabel,
    eventType: story.eventType,
    composedFrom: story.composedFrom.join(","),
  };
  const packet: NarrativeFactPacket = {
    eventId: story.eventId,
    eventType: story.eventType,
    subject: story.subject,
    opponent: story.opponent,
    facts: {},
    factGroups,
    confidence: 90,
    tone: "Rivals booth — specific, not generic recap. Compose supplied MATCHUP/PLAYER/LINEUP/RIVALRY/LEAGUE/HISTORICAL facts into one story. Do not invent or calculate extra quantities.",
  };
  packet.facts = licensedFacts(packet);
  return packet;
}

export function composeWeeklyEdition(input: {
  leagueId: string;
  season: number;
  week: number;
  matchups: InspectedMatchup[];
  events: DetectedEvent[];
  rivalry: RivalryReceipt[];
  teams: TeamWeekPacket[];
  leagueAverage: number;
  mvp: { player: string; points: number; position: string; owner: string; teamId: number } | null;
  strongestRegret: BenchRegret | null;
}): WeeklyEdition {
  const { week, matchups, events, rivalry, teams, leagueAverage, mvp } = input;
  const weeklyEvents = events.filter((e) => classifyContextKind(e) === "EVENT");
  const historical = events.filter((e) => classifyContextKind(e) === "CONTEXT");

  const closest = matchups.reduce<InspectedMatchup | null>((a, b) => (!a || b.margin < a.margin ? b : a), null);
  const blowout = matchups.reduce<InspectedMatchup | null>((a, b) => (!a || b.margin > a.margin ? b : a), null);
  const high = teams[0] ?? null;
  const low = teams.length ? teams[teams.length - 1] : null;
  const winFlips = matchups
    .map((m) => ({ m, regret: m.benchRegret }))
    .filter((x): x is { m: InspectedMatchup; regret: BenchRegret } => x.regret?.impact === "WIN_FLIP")
    .sort((a, b) => b.regret.netImprovement - a.regret.netImprovement);
  const strongestFlip = winFlips[0] ?? null;

  const candidates: EditorialStory[] = [];

  if (closest) {
    const wl = winnerLoser(closest);
    const flip = closest.benchRegret?.impact === "WIN_FLIP" ? closest.benchRegret : null;
    const riv = rivalryForMatchup(closest, rivalry);
    const dims = scoreHeadlineDimensions({
      drama: dramaFromMargin(closest.margin),
      consequence: flip ? 95 : 20,
      historical: riv ? rivalryWeeklySignificance(riv, wl.winnerOwner) : 0,
      dominance: 18,
      rarity: closest.margin <= 2 ? 80 : 40,
    });
    const composed = ["CLOSEST_GAME", "WIN", "LOSS"];
    if (flip) composed.push("WIN_FLIP");
    if (closest.playerOfGame) composed.push("MATCHUP_PLAYER_OF_GAME");
    if (riv) composed.push("RIVALRY_CONTEXT");
    candidates.push({
      eventId: `${pairId(closest.homeTeamId, closest.awayTeamId, week)}:close`,
      canonicalId: pairId(closest.homeTeamId, closest.awayTeamId, week),
      eventType: "CLOSEST_GAME",
      presentationLabel: "THE STORY OF THE WEEK",
      scope: "LEAGUE",
      role: "HEADLINE",
      subject: wl.winnerOwner,
      opponent: wl.loserOwner,
      dek: `${wl.winnerOwner} escaped ${wl.loserOwner} ${wl.winScore}–${wl.loseScore} by ${closest.margin}${flip ? `, and ${flip.ownerName} had a legal WIN_FLIP on the bench` : ""}.`,
      facts: {
        homeScore: closest.homeScore,
        awayScore: closest.awayScore,
        margin: closest.margin,
        winner: wl.winnerOwner,
        loser: wl.loserOwner,
        pog: closest.playerOfGame?.playerName ?? null,
        pogPoints: closest.playerOfGame ? r2(closest.playerOfGame.points) : null,
        winFlipOwner: flip?.ownerName ?? null,
        bench: flip?.playerName ?? null,
        benchPoints: flip?.benchPoints ?? null,
        starter: flip?.replacedStarterName ?? null,
        starterPoints: flip?.lowestStarterPoints ?? null,
        net: flip?.netImprovement ?? null,
        careerEntering: riv?.careerEntering ?? null,
        careerAfter: riv?.careerAfter ?? null,
        careerEnteringWins: riv ? parseWl(riv.careerEntering)?.w ?? null : null,
        careerEnteringLosses: riv ? parseWl(riv.careerEntering)?.l ?? null : null,
        careerAfterWins: riv ? parseWl(riv.careerAfter)?.w ?? null : null,
        careerAfterLosses: riv ? parseWl(riv.careerAfter)?.l ?? null : null,
        regularSeasonMeetingsEntering: riv ? parseWl(riv.careerEntering)?.games ?? null : null,
        playoffMeetings: riv?.playoffMeetings ?? null,
      },
      composedFrom: composed,
      headlineScore: dims,
      diversityKey: "closest",
      generateSofia: true,
    });
  }

  const highMatchup = high
    ? matchups.find((m) => m.homeTeamId === high.teamId || m.awayTeamId === high.teamId) ?? null
    : null;
  if (high && highMatchup) {
    const wl = winnerLoser(highMatchup);
    const riv = rivalryForMatchup(highMatchup, rivalry);
    const sameAsBlowout = blowout
      ? pairId(highMatchup.homeTeamId, highMatchup.awayTeamId, week) === pairId(blowout.homeTeamId, blowout.awayTeamId, week)
      : false;
    const dims = scoreHeadlineDimensions({
      drama: 8,
      consequence: 10,
      historical: riv ? rivalryWeeklySignificance(riv, wl.winnerOwner) : 0,
      dominance: dominanceFrom(high.score ?? 0, leagueAverage, highMatchup.margin),
      rarity: (high.score ?? 0) >= leagueAverage * 1.25 ? 70 : 40,
    });
    candidates.push({
      eventId: `${pairId(highMatchup.homeTeamId, highMatchup.awayTeamId, week)}:statement`,
      canonicalId: pairId(highMatchup.homeTeamId, highMatchup.awayTeamId, week),
      eventType: "BIGGEST_STATEMENT",
      presentationLabel: "AROUND THE LEAGUE",
      scope: "LEAGUE",
      role: "LEAGUE_STORY",
      subject: high.ownerName,
      opponent: high.opponent ?? null,
      dek: `${high.ownerName} posted the league-high ${high.score}${sameAsBlowout ? ` and won by ${highMatchup.margin}` : ""}.`,
      facts: {
        score: high.score ?? null,
        margin: highMatchup.margin,
        winScore: wl.winScore,
        loseScore: wl.loseScore,
        leagueAverage,
        winner: wl.winnerOwner,
        loser: wl.loserOwner,
        careerEntering: riv?.careerEntering ?? null,
        careerAfter: riv?.careerAfter ?? null,
        careerEnteringWins: riv ? parseWl(riv.careerEntering)?.w ?? null : null,
        careerEnteringLosses: riv ? parseWl(riv.careerEntering)?.l ?? null : null,
        careerAfterWins: riv ? parseWl(riv.careerAfter)?.w ?? null : null,
        careerAfterLosses: riv ? parseWl(riv.careerAfter)?.l ?? null : null,
        regularSeasonMeetingsEntering: riv ? parseWl(riv.careerEntering)?.games ?? null : null,
        playoffMeetings: riv?.playoffMeetings ?? null,
      },
      composedFrom: sameAsBlowout ? ["BIGGEST_STATEMENT", "BIGGEST_BLOWOUT"] : ["BIGGEST_STATEMENT"],
      headlineScore: dims,
      diversityKey: "statement",
      generateSofia: true,
    });
  }
  if (blowout && highMatchup && pairId(blowout.homeTeamId, blowout.awayTeamId, week) !== pairId(highMatchup.homeTeamId, highMatchup.awayTeamId, week) && blowout.margin >= 25) {
    const wl = winnerLoser(blowout);
    candidates.push({
      eventId: `${pairId(blowout.homeTeamId, blowout.awayTeamId, week)}:blowout`,
      canonicalId: pairId(blowout.homeTeamId, blowout.awayTeamId, week),
      eventType: "BIGGEST_BLOWOUT",
      presentationLabel: "AROUND THE LEAGUE",
      scope: "LEAGUE",
      role: "LEAGUE_STORY",
      subject: wl.winnerOwner,
      opponent: wl.loserOwner,
      dek: `${wl.winnerOwner} won by ${blowout.margin}: ${wl.winScore}–${wl.loseScore}.`,
      facts: { margin: blowout.margin, winner: wl.winnerOwner, loser: wl.loserOwner, winScore: wl.winScore, loseScore: wl.loseScore },
      composedFrom: ["BIGGEST_BLOWOUT"],
      headlineScore: scoreHeadlineDimensions({ drama: 6, consequence: 8, historical: 0, dominance: clamp(blowout.margin), rarity: 35 }),
      diversityKey: "blowout",
      generateSofia: true,
    });
  }

  if (mvp) {
    const team = teams.find((t) => t.teamId === mvp.teamId);
    const share = team?.score && team.score > 0 ? r2(mvp.points / team.score) : null;
    const dims = scoreHeadlineDimensions({
      drama: 5,
      consequence: 5,
      historical: 0,
      dominance: clamp(mvp.points * 1.4),
      rarity: mvp.points >= 45 ? 85 : 55,
    });
    candidates.push({
      eventId: `player-mvp:${mvp.teamId}:w${week}`,
      canonicalId: `player-mvp:${mvp.teamId}:w${week}`,
      eventType: "LEAGUE_WEEK_MVP",
      presentationLabel: "WEEK MVP",
      scope: "LEAGUE",
      role: "SIDEBAR",
      subject: mvp.player,
      opponent: null,
      dek: `${mvp.player} (${mvp.position}) scored ${mvp.points} for ${mvp.owner}${share != null ? ` — ${Math.round(share * 100)}% of the team` : ""}.`,
      facts: {
        player: mvp.player,
        position: mvp.position,
        points: mvp.points,
        owner: mvp.owner,
        teamScore: team?.score ?? null,
        share,
        result: team?.result ?? null,
      },
      composedFrom: ["LEAGUE_WEEK_MVP"],
      headlineScore: dims,
      diversityKey: "mvp",
      generateSofia: false,
    });
  }

  let oneThatGotAway: EditorialStory | null = null;
  if (strongestFlip) {
    const dims = scoreHeadlineDimensions({
      drama: 25,
      consequence: 100,
      historical: 0,
      dominance: 10,
      rarity: strongestFlip.regret.netImprovement >= 30 ? 80 : 50,
    });
    oneThatGotAway = {
      eventId: `bench:${strongestFlip.regret.playerId}:w${week}`,
      canonicalId: pairId(strongestFlip.m.homeTeamId, strongestFlip.m.awayTeamId, week),
      eventType: "WIN_FLIP",
      presentationLabel: "THE ONE THAT GOT AWAY",
      scope: "LEAGUE",
      role: "LEAGUE_STORY",
      subject: strongestFlip.regret.ownerName,
      opponent: null,
      dek: `${strongestFlip.regret.ownerName} sat ${strongestFlip.regret.playerName} (${strongestFlip.regret.benchPoints}) instead of ${strongestFlip.regret.replacedStarterName} (${strongestFlip.regret.lowestStarterPoints}); +${strongestFlip.regret.netImprovement} would have flipped the result.`,
      facts: {
        bench: strongestFlip.regret.playerName,
        benchPoints: strongestFlip.regret.benchPoints,
        starter: strongestFlip.regret.replacedStarterName,
        starterPoints: strongestFlip.regret.lowestStarterPoints,
        net: strongestFlip.regret.netImprovement,
        impact: "WIN_FLIP",
        owner: strongestFlip.regret.ownerName,
      },
      composedFrom: ["WIN_FLIP"],
      headlineScore: dims,
      diversityKey: "win_flip",
      generateSofia: true,
    };
    candidates.push(oneThatGotAway);
  }

  let rivalryStory: EditorialStory | null = null;
  let bestRivScore = 0;
  for (const m of matchups) {
    const riv = rivalryForMatchup(m, rivalry);
    if (!riv) continue;
    const wl = winnerLoser(m);
    const score = rivalryWeeklySignificance(riv, wl.winnerOwner);
    if (score < 55) continue;
    if (score > bestRivScore) {
      bestRivScore = score;
      rivalryStory = {
        eventId: `${pairId(m.homeTeamId, m.awayTeamId, week)}:rivalry`,
        canonicalId: pairId(m.homeTeamId, m.awayTeamId, week),
        eventType: "RIVALRY_RESULT",
        presentationLabel: "RIVALRY RECEIPT",
        scope: "HISTORICAL",
        role: "LEAGUE_STORY",
        subject: wl.winnerOwner,
        opponent: wl.loserOwner,
        dek: riv.note,
        facts: {
          careerEntering: riv.careerEntering,
          careerAfter: riv.careerAfter,
          careerEnteringWins: parseWl(riv.careerEntering)?.w ?? null,
          careerEnteringLosses: parseWl(riv.careerEntering)?.l ?? null,
          careerAfterWins: parseWl(riv.careerAfter)?.w ?? null,
          careerAfterLosses: parseWl(riv.careerAfter)?.l ?? null,
          regularSeasonMeetingsEntering: parseWl(riv.careerEntering)?.games ?? null,
          streak: riv.streak,
          playoffMeetings: riv.playoffMeetings,
          closeGames: riv.closeGames,
          weekMargin: m.margin,
          winScore: wl.winScore,
          loseScore: wl.loseScore,
          winner: wl.winnerOwner,
          loser: wl.loserOwner,
        },
        composedFrom: ["RIVALRY_RESULT", "RIVALRY_CONTEXT"],
        headlineScore: scoreHeadlineDimensions({ drama: 15, consequence: 20, historical: score, dominance: 10, rarity: 30 }),
        diversityKey: "rivalry",
        generateSofia: score >= 70,
      };
    }
  }
  if (rivalryStory) candidates.push(rivalryStory);

  const headline = [...candidates]
    .filter((c) => c.headlineScore)
    .sort((a, b) => (b.headlineScore?.total ?? 0) - (a.headlineScore?.total ?? 0))[0] ?? null;
  if (headline) {
    headline.role = "HEADLINE";
    headline.presentationLabel = "THE STORY OF THE WEEK";
    headline.generateSofia = true;
  }

  const usedDiversity = new Set<string>();
  const usedCanonical = new Set<string>();
  if (headline) {
    usedDiversity.add(headline.diversityKey);
    usedCanonical.add(headline.canonicalId);
  }
  const majors: EditorialStory[] = [];
  const majorPool = candidates
    .filter((c) => c !== headline)
    .sort((a, b) => (b.headlineScore?.total ?? 0) - (a.headlineScore?.total ?? 0));
  for (const c of majorPool) {
    if (majors.length >= 4) break;
    if (usedDiversity.has(c.diversityKey)) continue;
    if (usedCanonical.has(c.canonicalId) && c.diversityKey !== "mvp") continue;
    if (c.diversityKey === "win_flip" && usedDiversity.has("win_flip")) continue;
    c.role = c.role === "SIDEBAR" ? "SIDEBAR" : "LEAGUE_STORY";
    majors.push(c);
    usedDiversity.add(c.diversityKey);
    usedCanonical.add(c.canonicalId);
  }

  const ownerTakes: OwnerTake[] = teams.map((t) => pickOwnerTake(t, matchups, closest, high, strongestFlip, week));

  const editorialIds = new Set<string>();
  if (headline) editorialIds.add(headline.canonicalId);
  for (const m of majors) editorialIds.add(m.canonicalId);

  return {
    leagueId: input.leagueId,
    season: input.season,
    week,
    weeklyEventCount: weeklyEvents.length,
    historicalContextCount: historical.length,
    canonicalEditorialEventCount: editorialIds.size,
    headline,
    majorStories: majors,
    superlatives: {
      highScore: high ? { name: high.teamName, owner: high.ownerName, score: high.score ?? 0 } : null,
      lowScore: low ? { name: low.teamName, owner: low.ownerName, score: low.score ?? 0 } : null,
      closestGame: closest
        ? {
            home: closest.homeOwner,
            away: closest.awayOwner,
            margin: closest.margin,
            homeScore: closest.homeScore,
            awayScore: closest.awayScore,
          }
        : null,
      biggestBlowout: blowout
        ? { winner: winnerLoser(blowout).winnerOwner, loser: winnerLoser(blowout).loserOwner, margin: blowout.margin }
        : null,
      weekMvp: mvp
        ? {
            ...mvp,
            share: (() => {
              const team = teams.find((x) => x.teamId === mvp.teamId);
              return team?.score && team.score > 0 ? r2(mvp.points / team.score) : null;
            })(),
          }
        : null,
      biggestLineupRegret: input.strongestRegret
        ? {
            owner: input.strongestRegret.ownerName,
            player: input.strongestRegret.playerName,
            net: input.strongestRegret.netImprovement,
            impact: input.strongestRegret.impact,
          }
        : null,
      leagueAverage,
    },
    matchups,
    ownerTakes,
    oneThatGotAway,
    rivalryStory,
  };
}

function pickOwnerTake(
  team: TeamWeekPacket,
  matchups: InspectedMatchup[],
  closest: InspectedMatchup | null,
  high: TeamWeekPacket | null,
  strongestFlip: { m: InspectedMatchup; regret: BenchRegret } | null,
  week: number,
): OwnerTake {
  const m = matchups.find((x) => x.homeTeamId === team.teamId || x.awayTeamId === team.teamId);
  const myFlip = m?.benchRegret?.teamId === team.teamId && m.benchRegret.impact === "WIN_FLIP" ? m.benchRegret : null;
  const isClosestWinner =
    closest && closest.winnerTeamId === team.teamId && closest.margin <= 3;
  const isHigh = high?.teamId === team.teamId;

  if (myFlip) {
    const isTheOne = strongestFlip?.regret.playerId === myFlip.playerId;
    return {
      teamId: team.teamId,
      ownerName: team.ownerName,
      eventType: "WIN_FLIP",
      presentationLabel: isTheOne ? "THE ONE THAT GOT AWAY" : "RIVALS TAKE",
      dek: `Sat ${myFlip.playerName} (${myFlip.benchPoints}) over ${myFlip.replacedStarterName} (${myFlip.lowestStarterPoints}); +${myFlip.netImprovement} would have flipped the matchup.`,
      generateSofia: true,
      eventId: `bench:${myFlip.playerId}:w${week}`,
      facts: {
        bench: myFlip.playerName,
        benchPoints: myFlip.benchPoints,
        starter: myFlip.replacedStarterName,
        starterPoints: myFlip.lowestStarterPoints,
        net: myFlip.netImprovement,
        impact: "WIN_FLIP",
        owner: myFlip.ownerName,
      },
    };
  }
  if (isClosestWinner && closest) {
    return {
      teamId: team.teamId,
      ownerName: team.ownerName,
      eventType: "CLOSEST_GAME",
      presentationLabel: "RIVALS TAKE",
      dek: `Survived by ${closest.margin}: ${closest.homeScore}–${closest.awayScore}.`,
      generateSofia: true,
      eventId: `${pairId(closest.homeTeamId, closest.awayTeamId, week)}:close`,
      facts: {
        homeScore: closest.homeScore,
        awayScore: closest.awayScore,
        margin: closest.margin,
        winner: team.ownerName,
      },
    };
  }
  if (isHigh && high) {
    return {
      teamId: team.teamId,
      ownerName: team.ownerName,
      eventType: "BIGGEST_STATEMENT",
      presentationLabel: "RIVALS TAKE",
      dek: `League-high ${high.score} and a ${m?.margin ?? 0}-point win.`,
      generateSofia: true,
      eventId: m ? `${pairId(m.homeTeamId, m.awayTeamId, week)}:statement` : `team:${team.teamId}:w${week}:statement`,
      facts: { score: high.score ?? null, margin: m?.margin ?? null, owner: team.ownerName },
    };
  }
  const bench = team.meaningfulBenchIssue;
  if (bench && bench.impact !== "INSIGNIFICANT") {
    return {
      teamId: team.teamId,
      ownerName: team.ownerName,
      eventType: "BENCH_DISASTER",
      presentationLabel: "RIVALS TAKE",
      dek: `${bench.playerName} on the bench (${bench.benchPoints}) vs ${bench.replacedStarterName} (${bench.lowestStarterPoints}).`,
      generateSofia: false,
      eventId: `bench:${bench.playerId}:w${week}`,
      facts: { bench: bench.playerName, net: bench.netImprovement, impact: bench.impact },
    };
  }
  return {
    teamId: team.teamId,
    ownerName: team.ownerName,
    eventType: team.result === "W" ? "WIN" : "LOSS",
    presentationLabel: "RIVALS TAKE",
    dek: `${team.result} ${team.score} vs ${team.opponent} (scoring rank ${team.scoringRank}).`,
    generateSofia: false,
    eventId: `team:${team.teamId}:w${week}:result`,
    facts: { result: team.result ?? null, score: team.score ?? null, rank: team.scoringRank ?? null },
  };
}

export function sofiaStoriesFromEdition(edition: WeeklyEdition): EditorialStory[] {
  const out: EditorialStory[] = [];
  if (edition.headline?.generateSofia) out.push(edition.headline);
  for (const s of edition.majorStories) {
    if (s.generateSofia) out.push(s);
  }
  return out;
}

export function resolvedEditionWeek(opts: {
  explicitWeek?: number;
  currentWeek: number;
  currentStatus: "UPCOMING" | "SCORING" | "FINAL";
  latestFinalWeek: number | null;
}): number | null {
  if (opts.explicitWeek != null) return opts.explicitWeek;
  if (opts.currentStatus === "FINAL") return opts.currentWeek;
  return opts.latestFinalWeek;
}
