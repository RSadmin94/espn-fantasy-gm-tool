import type {
  TradeFinderAsset,
  TradeFinderFilters,
  TradeFinderLeague,
  TradeFinderPick,
  TradeFinderTeam,
  TradePosition,
  TradeShape,
  TradeSideAsset,
} from "./types";
import { TRADE_FINDER_BOUNDS, TRADE_FINDER_VALUE_BANDS } from "./weights";
import { needMap } from "./needSurplus";
import {
  isDeprioritizedStreamer,
  isSkillOffense,
  skillOffensePositions,
  tradePriorityScore,
} from "./priority";

export interface RankedPartner {
  team: TradeFinderTeam;
  complementScore: number;
}

export interface GeneratedTrade {
  partner: TradeFinderTeam;
  give: TradeFinderAsset[];
  receive: TradeFinderAsset[];
  shape: TradeShape;
}

function toSideAsset(a: TradeFinderAsset): TradeSideAsset {
  return {
    kind: a.kind,
    assetId: a.assetId,
    playerId: a.playerId,
    name: a.name,
    position: a.position,
    tradeValue: a.tradeValue,
  };
}

export { toSideAsset };

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 1) return arr.map((x) => [x]);
  if (k <= 0 || arr.length < k) return [];
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

function pickAsAsset(p: TradeFinderPick): TradeFinderAsset {
  return {
    kind: "pick",
    assetId: p.pickId,
    playerId: null,
    name: p.label,
    position: "PICK",
    nflTeam: "",
    tradeValue: p.tradeValue,
    weeklyProjection: null,
    starter: false,
    bench: false,
    ir: false,
    injuryStatus: "",
    unavailable: false,
  };
}

function valueSum(assets: TradeFinderAsset[]): number {
  return assets.reduce((s, a) => s + (Number.isFinite(a.tradeValue) ? a.tradeValue : 0), 0);
}

function inBand(give: number, receive: number, filters: TradeFinderFilters): boolean {
  if (give <= 0 || receive <= 0) return false;
  const ratio = receive / give;
  const band = TRADE_FINDER_VALUE_BANDS[filters.risk];
  return ratio >= band.min && ratio <= band.max;
}

function positionsOf(assets: TradeFinderAsset[]): string[] {
  return assets.map((a) => a.position);
}

function matchesTarget(receive: TradeFinderAsset[], filters: TradeFinderFilters): boolean {
  if (filters.targetPosition === "ANY") return true;
  if (filters.targetPosition === "FLEX") {
    return receive.some((a) => a.position === "RB" || a.position === "WR" || a.position === "TE");
  }
  return receive.some((a) => a.position === filters.targetPosition);
}

/**
 * Partner rank uses trade-priority scores, not raw roster need.
 * complement = Σ (userPriNeed[P]*oppPriSur[P] + userPriSur[P]*oppPriNeed[P]) / (100*100*n)
 * K/DST are scaled by TRADE_FINDER_PRIORITY_MULTIPLIER unless explicitly targeted.
 */
export function rankPartners(
  league: TradeFinderLeague,
  filters: TradeFinderFilters,
): RankedPartner[] {
  const user = league.teams.find((t) => t.teamId === league.userTeamId);
  if (!user) return [];
  const userNeeds = needMap(user);
  const ranked: RankedPartner[] = [];
  for (const opp of league.teams) {
    if (opp.teamId === user.teamId) continue;
    if (filters.partnerTeamId != null && opp.teamId !== filters.partnerTeamId) continue;
    const oppNeeds = needMap(opp);
    let num = 0;
    let denom = 0;
    const positions = new Set([...userNeeds.keys(), ...oppNeeds.keys()]);
    for (const pos of positions) {
      const u = userNeeds.get(pos);
      const o = oppNeeds.get(pos);
      const uNeed = tradePriorityScore(u?.needScore ?? 0, pos, filters, league.slots);
      const uSur = tradePriorityScore(u?.surplusScore ?? 0, pos, filters, league.slots);
      const oNeed = tradePriorityScore(o?.needScore ?? 0, pos, filters, league.slots);
      const oSur = tradePriorityScore(o?.surplusScore ?? 0, pos, filters, league.slots);
      num += uNeed * oSur + uSur * oNeed;
      denom += 100 * 100;
    }
    ranked.push({ team: opp, complementScore: denom > 0 ? num / denom : 0 });
  }
  ranked.sort((a, b) => b.complementScore - a.complementScore || a.team.teamId - b.team.teamId);
  if (filters.partnerTeamId != null) return ranked.slice(0, 1);
  return ranked.slice(0, TRADE_FINDER_BOUNDS.maxPartners);
}

/** Positions we try to acquire: skill offense always, plus high trade-priority needs. */
export function discoveryNeedPositions(
  team: TradeFinderTeam,
  filters: TradeFinderFilters,
  slots: TradeFinderLeague["slots"],
): TradePosition[] {
  const labeled = team.needs
    .filter((n) => n.label === "NEED" && !isDeprioritizedStreamer(n.position, filters))
    .map((n) => n.position);
  const rankedPriority = [...team.needs]
    .map((n) => ({ n, pri: tradePriorityScore(n.needScore, n.position, filters, slots) }))
    .filter((x) => x.pri >= 20 && !isDeprioritizedStreamer(x.n.position, filters))
    .sort((a, b) => b.pri - a.pri)
    .map((x) => x.n.position);
  const targeted: TradePosition[] = [];
  if (filters.targetPosition === "DST" || filters.targetPosition === "K") {
    targeted.push(filters.targetPosition);
  }
  if (filters.targetPosition === "QB" || filters.targetPosition === "RB" || filters.targetPosition === "WR" || filters.targetPosition === "TE") {
    targeted.push(filters.targetPosition);
  }
  return [...new Set([...targeted, ...labeled, ...rankedPriority, ...skillOffensePositions()])];
}

function surplusAssets(team: TradeFinderTeam, want: TradePosition[]): TradeFinderAsset[] {
  const surplusPos = new Set(
    team.needs.filter((n) => n.label === "SURPLUS" || want.includes(n.position)).map((n) => n.position),
  );
  return team.roster
    .filter((a) => a.kind === "player" && a.tradeValue > 0 && !a.ir)
    .filter((a) => surplusPos.has(a.position as TradePosition) || a.bench)
    .sort((a, b) => {
      const aBench = a.starter ? 0 : 1;
      const bBench = b.starter ? 0 : 1;
      if (aBench !== bBench) return bBench - aBench;
      return b.tradeValue - a.tradeValue;
    });
}

function needAssets(team: TradeFinderTeam, want: TradePosition[]): TradeFinderAsset[] {
  const needPos = new Set(want);
  return team.roster
    .filter((a) => a.kind === "player" && a.tradeValue > 0 && !a.ir && !a.unavailable)
    .filter((a) => needPos.has(a.position as TradePosition) || a.starter)
    .sort((a, b) => {
      const aNeed = needPos.has(a.position as TradePosition) ? 1 : 0;
      const bNeed = needPos.has(b.position as TradePosition) ? 1 : 0;
      if (aNeed !== bNeed) return bNeed - aNeed;
      return b.tradeValue - a.tradeValue;
    });
}

export function receiveHitsFormalNeed(user: TradeFinderTeam, receive: TradeFinderAsset[]): boolean {
  const u = needMap(user);
  return receive.some((a) => {
    if (a.kind === "pick") return true;
    const n = u.get(a.position as TradePosition);
    return n != null && (n.label === "NEED" || n.needScore >= 32);
  });
}

function complementOk(
  user: TradeFinderTeam,
  opp: TradeFinderTeam,
  give: TradeFinderAsset[],
  receive: TradeFinderAsset[],
  filters: TradeFinderFilters,
): boolean {
  const o = needMap(opp);
  const receiveUseful = receive.some((a) => {
    if (a.kind === "pick") return true;
    if (isDeprioritizedStreamer(a.position, filters)) return false;
    if (receiveHitsFormalNeed(user, [a])) return true;
    // Fallback: skill/IDP lineup-improvement candidate even if not labeled NEED.
    return isSkillOffense(a.position) || a.position === "DP";
  });
  const giveHitsTheirNeed = give.some((a) => {
    if (a.kind === "pick") return true;
    const n = o.get(a.position as TradePosition);
    return n != null && (n.label === "NEED" || n.needScore >= 32);
  });
  return receiveUseful && giveHitsTheirNeed;
}

function pushCandidate(
  out: GeneratedTrade[],
  seen: Set<string>,
  partner: TradeFinderTeam,
  give: TradeFinderAsset[],
  receive: TradeFinderAsset[],
  filters: TradeFinderFilters,
  user: TradeFinderTeam,
): void {
  if (out.length >= TRADE_FINDER_BOUNDS.maxCandidates) return;
  if (give.length === 0 || receive.length === 0) return;
  if (give.length > filters.maxAssets || receive.length > filters.maxAssets) return;
  if (!matchesTarget(receive, filters)) return;
  if (receive.some((a) => isDeprioritizedStreamer(a.position, filters))) return;
  const ids = [...give, ...receive].map((a) => a.assetId);
  if (new Set(ids).size !== ids.length) return;
  if (!inBand(valueSum(give), valueSum(receive), filters)) return;
  if (!complementOk(user, partner, give, receive, filters)) return;
  const key = `${partner.teamId}|${give.map((a) => a.assetId).sort().join(",")}|${receive.map((a) => a.assetId).sort().join(",")}`;
  if (seen.has(key)) return;
  const shape: TradeShape =
    give.length === 1 && receive.length === 1
      ? "1-for-1"
      : give.length === 2 && receive.length === 1
        ? "2-for-1"
        : give.length === 1 && receive.length === 2
          ? "1-for-2"
          : "2-for-2";
  const shapeCount = out.filter((c) => c.shape === shape).length;
  if (shapeCount >= TRADE_FINDER_BOUNDS.maxPerShape) return;
  seen.add(key);
  out.push({ partner, give, receive, shape });
}

export function generateCandidates(
  league: TradeFinderLeague,
  partners: RankedPartner[],
  filters: TradeFinderFilters,
): GeneratedTrade[] {
  const user = league.teams.find((t) => t.teamId === league.userTeamId);
  if (!user) return [];
  const userSurplusPos = user.needs.filter((n) => n.label === "SURPLUS").map((n) => n.position);
  const wantNeed = discoveryNeedPositions(user, filters, league.slots);
  const wantGive = userSurplusPos.length ? userSurplusPos : skillFallback(user);

  const out: GeneratedTrade[] = [];
  const seen = new Set<string>();
  const B = TRADE_FINDER_BOUNDS;

  for (const { team: opp } of partners) {
    if (out.length >= B.maxCandidates) break;
    const oppNeedPos = opp.needs.filter((n) => n.label === "NEED").map((n) => n.position);
    const givePool = surplusAssets(user, [...wantGive, ...oppNeedPos]).slice(0, B.maxGivePool);
    const getPool = needAssets(opp, wantNeed).slice(0, B.maxGetPool);
    const userPicks = filters.includeDraftPicks ? user.picks.slice(0, 4).map(pickAsAsset) : [];
    const oppPicks = filters.includeDraftPicks ? opp.picks.slice(0, 4).map(pickAsAsset) : [];

    // 1-for-1
    for (const g of givePool) {
      for (const r of getPool) {
        pushCandidate(out, seen, opp, [g], [r], filters, user);
      }
    }

    if (filters.maxAssets >= 2) {
      const givePairs = combinations(givePool.slice(0, B.maxPairPool), 2);
      const getNeed = getPool.filter((a) => wantNeed.includes(a.position as TradePosition));
      const oppBalancers = opp.roster
        .filter((a) => a.kind === "player" && a.tradeValue > 0 && !a.ir && !a.unavailable)
        .sort((a, b) => a.tradeValue - b.tradeValue)
        .slice(0, 6);

      // 1-for-2: need-matching primary + cheaper balancer so the package can sit in-band
      for (const g of givePool) {
        for (const primary of getNeed.slice(0, 6)) {
          for (const bal of oppBalancers) {
            if (bal.assetId === primary.assetId) continue;
            pushCandidate(out, seen, opp, [g], [primary, bal], filters, user);
          }
        }
      }
      // 2-for-1
      for (const gp of givePairs) {
        for (const r of getPool) {
          pushCandidate(out, seen, opp, gp, [r], filters, user);
        }
      }
      // 2-for-2 (tight bound)
      const getPairs = combinations(getPool.slice(0, B.maxPairPool), 2);
      for (const gp of givePairs) {
        for (const rp of getPairs) {
          pushCandidate(out, seen, opp, gp, rp, filters, user);
        }
      }
    }

    if (filters.includeDraftPicks) {
      for (const g of givePool.slice(0, 6)) {
        for (const r of getPool.slice(0, 6)) {
          for (const pk of userPicks) {
            pushCandidate(out, seen, opp, [g, pk], [r], { ...filters, maxAssets: 2 }, user);
          }
          for (const pk of oppPicks) {
            pushCandidate(out, seen, opp, [g], [r, pk], { ...filters, maxAssets: 2 }, user);
          }
        }
      }
    }
  }
  return out;
}

function skillFallback(team: TradeFinderTeam): TradePosition[] {
  return team.needs
    .filter((n) => n.position === "QB" || n.position === "RB" || n.position === "WR" || n.position === "TE")
    .sort((a, b) => b.surplusScore - a.surplusScore)
    .slice(0, 2)
    .map((n) => n.position);
}

export function describeShape(_give: TradeFinderAsset[], _receive: TradeFinderAsset[]): string {
  return positionsOf(_give).join("/") + " → " + positionsOf(_receive).join("/");
}

export function isCanonicalDuplicateSafe(give: TradeFinderAsset[], receive: TradeFinderAsset[]): boolean {
  const playerIds = [...give, ...receive].map((a) => a.playerId).filter((id): id is number => id != null);
  return new Set(playerIds).size === playerIds.length;
}
