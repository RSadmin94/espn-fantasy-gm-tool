import {
  isSkillPosition,
  playerKey,
  type PlayerTerrainCard,
  type PriorSeasonPointsRow,
  type SeasonTerrain,
  type TerrainDraftPickRow,
  type TerrainTier,
  type ValueSource,
} from "./types";

function normalizePosition(pos: string): string {
  const p = String(pos ?? "").trim().toUpperCase();
  if (p === "DEF" || p === "D/ST") return "DST";
  return p.split(/[-/]/)[0] ?? p;
}

function tierFromPositionRank(rank: number, totalAtPos: number): TerrainTier {
  if (totalAtPos <= 0) return "T5";
  const pct = rank / totalAtPos;
  if (pct <= 0.2) return "T1";
  if (pct <= 0.4) return "T2";
  if (pct <= 0.6) return "T3";
  if (pct <= 0.8) return "T4";
  return "T5";
}

function upsideFrom(age: number | null, isRookie: boolean): PlayerTerrainCard["upsideLabel"] {
  if (isRookie) return "high";
  if (age != null && age <= 24) return "high";
  if (age != null && age <= 28) return "moderate";
  if (age != null && age >= 31) return "low";
  return "unknown";
}

function riskFromInjury(injuryStatus: string | null | undefined): { riskScore: number; riskLabel: string } {
  const s = String(injuryStatus ?? "").trim().toUpperCase();
  if (!s || s === "ACTIVE" || s === "OK") return { riskScore: 0.35, riskLabel: "healthy/unknown" };
  if (s.includes("OUT") || s.includes("PUP") || s.includes("IR")) return { riskScore: 0.85, riskLabel: "injury flag" };
  if (s.includes("QUESTIONABLE") || s.includes("DOUBTFUL")) return { riskScore: 0.65, riskLabel: "injury concern" };
  return { riskScore: 0.5, riskLabel: "unknown" };
}

function parseAgeFromRawPlayer(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { age?: number };
    if (typeof o.age === "number" && o.age > 17 && o.age < 50) return o.age;
  } catch {
    /* ignore */
  }
  return null;
}

export function buildSeasonTerrain(args: {
  leagueId: string;
  season: number;
  draftPicks: TerrainDraftPickRow[];
  priorSeasonPoints: PriorSeasonPointsRow[];
  playerCache: Array<{
    playerId: number;
    injuryStatus?: string;
    rawPlayer?: string;
    projectedTotalPoints?: number | null;
  }>;
  teamCount?: number;
}): SeasonTerrain {
  const { leagueId, season, draftPicks } = args;
  const priorById = new Map(args.priorSeasonPoints.map((r) => [r.playerId, r.totalPoints]));
  const cacheById = new Map(args.playerCache.map((r) => [r.playerId, r]));

  const unique = new Map<string, TerrainDraftPickRow>();
  for (const row of draftPicks) {
    const key = playerKey(row.playerName);
    if (!key || !row.playerName.trim()) continue;
    if (!unique.has(key) || row.overallPick < (unique.get(key)?.overallPick ?? 999)) {
      unique.set(key, row);
    }
  }

  const skillRows = [...unique.values()].filter((r) => isSkillPosition(r.position));
  const teamCount = args.teamCount ?? 14;

  const rawScores: Array<{
    row: TerrainDraftPickRow;
    raw: number;
    source: ValueSource;
    prior: number | null;
    notes: string[];
  }> = [];

  for (const row of skillRows) {
    const pid = row.playerId;
    const prior = pid != null ? (priorById.get(pid) ?? null) : null;
    const notes: string[] = [];
    let raw = 0;
    let source: ValueSource = "unranked";

    if (prior != null && prior > 0) {
      raw = prior;
      source = "prior_season_fantasy_points";
    } else if (pid != null) {
      raw = Math.max(0, 300 - row.overallPick);
      source = "league_draft_order_proxy";
      notes.push("No prior-season points — rank from inverse league draft slot (partial board).");
    } else {
      raw = Math.max(0, 300 - row.overallPick);
      source = "retroactive_league_draft_capital";
      notes.push("No playerId — value inferred from eventual league draft slot only.");
    }

    rawScores.push({ row, raw, source, prior, notes });
  }

  const maxRaw = Math.max(1, ...rawScores.map((r) => r.raw));

  const cardsDraft: PlayerTerrainCard[] = rawScores.map(({ row, raw, source, prior, notes }) => {
    const pid = row.playerId;
    const cache = pid != null ? cacheById.get(pid) : undefined;
    const age = parseAgeFromRawPlayer(cache?.rawPlayer ?? null);
    const isRookie = prior == null || prior === 0;
    const { riskScore, riskLabel } = riskFromInjury(cache?.injuryStatus);
    if (cache?.projectedTotalPoints == null) {
      notes.push("No pre-draft ESPN projection in player cache.");
    }

    return {
      playerName: row.playerName,
      playerKey: playerKey(row.playerName),
      position: normalizePosition(row.position),
      playerId: pid,
      rawValueScore: Math.round((raw / maxRaw) * 1000) / 10,
      valueScore: 0,
      valueSource: source,
      tier: "T3",
      positionRank: 0,
      scarcityIndex: 0,
      riskScore,
      riskLabel,
      age,
      ageSource: age != null ? "espn_player_cache" : "unknown",
      upsideLabel: upsideFrom(age, isRookie),
      dataNotes: notes,
      eventualOverallPick: row.overallPick,
      priorSeasonPoints: prior,
    };
  });

  // Position-normalized value: RB vs RBs, WR vs WRs (0–100 within each position).
  const byPosDraft = new Map<string, PlayerTerrainCard[]>();
  for (const c of cardsDraft) {
    if (!byPosDraft.has(c.position)) byPosDraft.set(c.position, []);
    byPosDraft.get(c.position)!.push(c);
  }
  for (const [, list] of byPosDraft) {
    const rawVals = list.map((c) => {
      const row = skillRows.find((r) => playerKey(r.playerName) === c.playerKey);
      const prior = c.priorSeasonPoints;
      const pid = c.playerId;
      if (prior != null && prior > 0) return prior;
      if (row) return Math.max(0, 300 - row.overallPick);
      return 0;
    });
    const min = Math.min(...rawVals);
    const max = Math.max(...rawVals);
    const span = max - min || 1;
    list.forEach((c, i) => {
      if (list.length === 1 || max === min) {
        c.valueScore = 100;
      } else {
        c.valueScore = Math.round(((rawVals[i]! - min) / span) * 1000) / 10;
      }
    });
  }

  const cards = cardsDraft;

  const byPos = new Map<string, PlayerTerrainCard[]>();
  for (const c of cards) {
    if (!byPos.has(c.position)) byPos.set(c.position, []);
    byPos.get(c.position)!.push(c);
  }
  for (const [, list] of byPos) {
    list.sort((a, b) => b.valueScore - a.valueScore);
    list.forEach((c, i) => {
      c.positionRank = i + 1;
      c.tier = tierFromPositionRank(i + 1, list.length);
    });
  }

  const eliteByPos = new Map<string, number>();
  let eliteTotal = 0;
  for (const c of cards) {
    if (c.tier === "T1" || c.tier === "T2") {
      eliteByPos.set(c.position, (eliteByPos.get(c.position) ?? 0) + 1);
      eliteTotal++;
    }
  }
  for (const c of cards) {
    const eliteAtPos = eliteByPos.get(c.position) ?? 0;
    c.scarcityIndex = eliteTotal > 0 ? Math.round((eliteAtPos / eliteTotal) * 1000) / 1000 : 0;
  }

  cards.sort((a, b) => b.valueScore - a.valueScore || a.position.localeCompare(b.position));

  const dataGaps: string[] = [
    "No historical ESPN ADP stored in draft_picks.rawPick for this league.",
    "gmPlayers projectedTotalPoints is null for this season in DB — not used.",
    "Value score is position-normalized (RB vs RBs, WR vs WRs); not a cross-position ADP rank.",
  ];
  if (args.priorSeasonPoints.length === 0) {
    dataGaps.push("gm_weekly_player_stats has no prior-season rows — all values fall back to draft-capital proxy.");
  } else {
    dataGaps.push(
      `Prior-season fantasy points used where available (${args.priorSeasonPoints.length} players with ${season - 1} totals).`,
    );
  }

  return {
    leagueId,
    season,
    teamCount,
    playerCount: cards.length,
    cards,
    dataGaps,
    valueMethodSummary:
      "Position-normalized value (0–100 within RB/WR/QB/TE) from prior-season points or league draft-order proxy on the partial pool.",
  };
}

export function topTerrainCards(terrain: SeasonTerrain, n = 40): PlayerTerrainCard[] {
  const perPos = Math.max(1, Math.ceil(n / 4));
  const positions = ["RB", "WR", "QB", "TE"];
  const out: PlayerTerrainCard[] = [];
  for (const pos of positions) {
    const atPos = terrain.cards.filter((c) => c.position === pos).sort((a, b) => a.positionRank - b.positionRank);
    out.push(...atPos.slice(0, perPos));
  }
  return out.slice(0, n);
}

export function formatTerrainTable(terrain: SeasonTerrain, n = 40): string {
  const lines = [
    `Season ${terrain.season} terrain — top ${n} skill players (${terrain.valueMethodSummary})`,
    "",
    "Rank | Player | Pos | Value | Tier | PosRank | Scarcity | Risk | Age | Upside | Value source",
    "-----|--------|-----|-------|------|---------|----------|------|-----|--------|-------------",
  ];
  for (const [i, c] of topTerrainCards(terrain, n).entries()) {
    lines.push(
      `${i + 1} | ${c.playerName} | ${c.position} | ${c.valueScore} | ${c.tier} | #${c.positionRank} ${c.position} | ${c.scarcityIndex} | ${c.riskLabel} | ${c.age ?? "?"} | ${c.upsideLabel} | ${c.valueSource}`,
    );
  }
  lines.push("", "Data gaps:");
  for (const g of terrain.dataGaps) lines.push(`- ${g}`);
  return lines.join("\n");
}
