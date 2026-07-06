/**
 * Roster construction — separate from personality need drive.
 * Positional saturation + lineup legality for draft simulation.
 */

import { normalizePosition } from "../phase1/types";
import type { SimPlayer } from "./weather";
import type { LeagueRosterRules, RosterPosition } from "./leagueRosterRules";
import type { TerrainDraftPickRow } from "../phase2/types";

export type RosterCounts = Partial<Record<RosterPosition, number>>;

const IDP_POSITIONS = new Set(["DL", "LB", "DB", "S", "CB", "DE", "DT", "DP"]);

export function simPositionToRosterPos(pos: string): RosterPosition | null {
  const p = normalizePosition(pos);
  if (p === "K") return "K";
  if (p === "DST") return "DST";
  if (IDP_POSITIONS.has(p)) return "DP";
  if (p === "QB" || p === "RB" || p === "WR" || p === "TE") return p;
  return null;
}

export function emptyRosterCounts(): RosterCounts {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DP: 0, DST: 0 };
}

export function addToRoster(roster: RosterCounts, player: SimPlayer): RosterCounts {
  const pos = simPositionToRosterPos(player.position);
  if (!pos) return roster;
  return { ...roster, [pos]: (roster[pos] ?? 0) + 1 };
}

/** Skill-only slice for personality need features (unchanged capped need drive). */
export function skillCountsForPersonality(roster: RosterCounts): Record<string, number> {
  return {
    QB: roster.QB ?? 0,
    RB: roster.RB ?? 0,
    WR: roster.WR ?? 0,
    TE: roster.TE ?? 0,
  };
}

export function rosterSaturationPenalty(pos: RosterPosition, have: number, rules: LeagueRosterRules): number {
  const soft = rules.softCap[pos];
  const hard = rules.hardCap[pos];
  if (soft == null || hard == null) return 0;

  if (have >= hard) return -12;
  if (have >= soft) return -5;
  if (pos === "TE" && have >= (rules.starters.TE ?? 1)) return -4;
  if (pos === "QB" && have >= (rules.starters.QB ?? 1)) return -2;
  return 0;
}

export function rosterConstructionUtility(args: {
  player: SimPlayer;
  roster: RosterCounts;
  rules: LeagueRosterRules;
  ownerPicksRemaining: number;
}): number {
  const pos = simPositionToRosterPos(args.player.position);
  if (!pos) return 0;

  const have = args.roster[pos] ?? 0;
  let util = rosterSaturationPenalty(pos, have, args.rules);

  const min = args.rules.starterMinimum[pos] ?? 0;
  const deficit = min - have;
  if (deficit > 0) {
    const urgent =
      args.ownerPicksRemaining <= deficit ||
      ((pos === "DP" || pos === "K") && args.ownerPicksRemaining <= 5);
    const urgency = urgent ? 4.5 : args.ownerPicksRemaining <= deficit + 2 ? 2 : 0.4;
    util += deficit * urgency;
  }

  return util;
}

export function isPositionBlocked(pos: RosterPosition, have: number, rules: LeagueRosterRules): boolean {
  const hard = rules.hardCap[pos];
  return hard != null && have >= hard;
}

/** Exclude from consideration — sharper than hard cap (e.g. second TE after starter filled). */
export function isPositionSaturatedForDraft(pos: RosterPosition, have: number, rules: LeagueRosterRules): boolean {
  if (isPositionBlocked(pos, have, rules)) return true;
  if (pos === "TE" && have >= (rules.starters.TE ?? 1)) return true;
  if (pos === "QB" && have >= (rules.softCap.QB ?? 2)) return true;
  if (pos === "K" && have >= (rules.starters.K ?? 1)) return true;
  if (pos === "DP" && have >= (rules.starters.DP ?? 1)) return true;
  if (pos === "DST" && have >= (rules.starters.DST ?? 1)) return true;
  const soft = rules.softCap[pos];
  return soft != null && have >= soft;
}

/** Starter slots still empty while fillers exist in the pool (QB / K / DP / DST). */
export function unfilledRequiredSlots(
  roster: RosterCounts,
  rules: LeagueRosterRules,
  poolHas: Partial<Record<RosterPosition, boolean>>,
): RosterPosition[] {
  const out: RosterPosition[] = [];
  for (const pos of ["QB", "K", "DP", "DST"] as RosterPosition[]) {
    const min = rules.starterMinimum[pos] ?? rules.starters[pos] ?? 0;
    if (min <= 0) continue;
    if ((roster[pos] ?? 0) >= min) continue;
    if (!poolHas[pos]) continue;
    out.push(pos);
  }
  return out;
}

/**
 * Late completion window for K / DP / DST — same band as K today.
 * Personality may still choose among skill players until this window opens.
 */
export function inSlotCompletionWindow(args: {
  ownerPicksRemaining: number;
  round: number;
  totalRounds: number;
  unfilled: RosterPosition[];
}): boolean {
  if (args.unfilled.length === 0) return false;
  if (args.ownerPicksRemaining <= args.unfilled.length) return true;
  const leagueLate = args.round >= args.totalRounds - 4;
  const ownerLate = args.ownerPicksRemaining <= 5;
  const needsKOrDp = args.unfilled.some((p) => p === "K" || p === "DP");
  if (needsKOrDp && (ownerLate || leagueLate || args.round >= 10)) return true;
  return false;
}

const FORCE_FILL_PRIORITY: RosterPosition[] = ["QB", "DP", "K", "DST"];

/**
 * Positions that must be taken this pick (deterministic filler) — no softmax.
 * DP behaves like K: late completion only, never early attraction.
 */
export function mustForceFillThisPick(args: {
  roster: RosterCounts;
  rules: LeagueRosterRules;
  poolHas: Partial<Record<RosterPosition, boolean>>;
  ownerPicksRemaining: number;
  round: number;
  totalRounds: number;
}): RosterPosition | null {
  const unfilled = unfilledRequiredSlots(args.roster, args.rules, args.poolHas);
  if (unfilled.length === 0) return null;

  if (args.ownerPicksRemaining <= unfilled.length) {
    return FORCE_FILL_PRIORITY.find((p) => unfilled.includes(p)) ?? unfilled[0]!;
  }

  if (!inSlotCompletionWindow({ ...args, unfilled })) return null;

  const lateSlots = unfilled.filter((p): p is "K" | "DP" | "DST" => p === "K" || p === "DP" || p === "DST");
  if (lateSlots.length === 0) return null;

  const lateFillPriority: Array<"K" | "DP" | "DST"> = ["DP", "K", "DST"];
  return lateFillPriority.find((p) => lateSlots.includes(p)) ?? lateSlots[0]!;
}

export function mandatoryFillPositions(args: {
  roster: RosterCounts;
  rules: LeagueRosterRules;
  round: number;
  totalRounds: number;
  ownerPicksRemaining: number;
  poolHas: Partial<Record<RosterPosition, boolean>>;
}): RosterPosition[] {
  const unfilled = unfilledRequiredSlots(args.roster, args.rules, args.poolHas);
  const out: RosterPosition[] = [];
  const leagueLate = args.round >= args.totalRounds - 4;
  const ownerLate = args.ownerPicksRemaining <= 4;
  const completion = inSlotCompletionWindow({ ...args, unfilled });

  for (const pos of unfilled) {
    if (pos === "QB" && (args.ownerPicksRemaining <= 2 || leagueLate)) out.push(pos);
    else if ((pos === "K" || pos === "DP" || pos === "DST") && completion) out.push(pos);
  }

  if (!canFieldSkillLineup(args.roster, args.rules).legal && (ownerLate || leagueLate)) {
    const check = canFieldSkillLineup(args.roster, args.rules);
    for (const gap of check.missing) {
      if (gap === "RB" || gap === "WR" || gap === "TE") out.push(gap);
    }
  }

  return [...new Set(out)];
}

export function canFieldSkillLineup(
  roster: RosterCounts,
  rules: LeagueRosterRules,
): { legal: boolean; missing: RosterPosition[] } {
  const qb = roster.QB ?? 0;
  const rb = roster.RB ?? 0;
  const wr = roster.WR ?? 0;
  const te = roster.TE ?? 0;
  const flex = rules.starters.FLEX;

  const missing: RosterPosition[] = [];
  if (qb < rules.starters.QB) missing.push("QB");
  if (rb < rules.starters.RB) missing.push("RB");
  if (wr < rules.starters.WR) missing.push("WR");
  if (te < rules.starters.TE) missing.push("TE");

  const skillPool = rb + wr + te;
  const dedicated = rules.starters.RB + rules.starters.WR + rules.starters.TE;
  const minSkill = dedicated + flex;
  if (skillPool < minSkill) {
    if (wr < rules.starters.WR + flex) missing.push("WR");
    if (rb < rules.starters.RB + flex) missing.push("RB");
  }

  return { legal: missing.length === 0, missing: [...new Set(missing)] };
}

export type RosterLegalityReport = {
  skillLineupLegal: boolean;
  skillMissing: RosterPosition[];
  kFilled: boolean;
  dpFilled: boolean;
  dstFilled: boolean;
  poolGapNotes: string[];
  honestSummary: string;
};

export function assessRosterLegality(args: {
  roster: RosterCounts;
  rules: LeagueRosterRules;
  poolHas: Partial<Record<RosterPosition, boolean>>;
}): RosterLegalityReport {
  const skill = canFieldSkillLineup(args.roster, args.rules);
  const kNeed = args.rules.starters.K > 0;
  const dpNeed = args.rules.starters.DP > 0;
  const dstNeed = args.rules.starters.DST > 0;

  const kFilled = !kNeed || (args.roster.K ?? 0) >= args.rules.starters.K;
  const dpFilled = !dpNeed || (args.roster.DP ?? 0) >= args.rules.starters.DP;
  const dstFilled = !dstNeed || (args.roster.DST ?? 0) >= args.rules.starters.DST;

  const poolGapNotes = [...args.rules.poolGaps];
  if (kNeed && !args.poolHas.K) poolGapNotes.push("No kickers in sim pool — K slot cannot be filled in this partial gate.");
  if (dpNeed && !args.poolHas.DP) poolGapNotes.push("No IDP players in sim pool — DP slot cannot be filled in this partial gate.");
  if (dstNeed && !args.poolHas.DST) poolGapNotes.push("No team defenses in sim pool — DST slot cannot be filled in this partial gate.");

  const blockers: string[] = [];
  if (!skill.legal) blockers.push(`skill starters incomplete (${skill.missing.join(", ")})`);
  if (kNeed && !kFilled && args.poolHas.K) blockers.push("K");
  if (dpNeed && !dpFilled && args.poolHas.DP) blockers.push("DP");
  if (dstNeed && !dstFilled && args.poolHas.DST) blockers.push("DST");

  let honestSummary: string;
  if (blockers.length === 0 && (kFilled || !kNeed) && (dpFilled || !dpNeed) && (dstFilled || !dstNeed)) {
    honestSummary = "Roster can field a legal starting lineup for league 457622 rules.";
  } else if (blockers.length === 0 && (!kFilled || !dpFilled || !dstFilled)) {
    honestSummary =
      "Skill lineup is legal; K/DP slots not filled because fillers are outside the partial skill pool (see pool gaps).";
  } else {
    honestSummary = `Roster CANNOT field a legal lineup — missing: ${blockers.join(", ")}.`;
  }

  return {
    skillLineupLegal: skill.legal,
    skillMissing: skill.missing,
    kFilled,
    dpFilled,
    dstFilled,
    poolGapNotes,
    honestSummary,
  };
}

const IDP_DRAFT_POSITIONS = new Set(["DL", "LB", "DB", "S", "CB", "DE", "DT", "DP"]);

/** Add K / IDP / DST from historical draft rows so late rounds can fill required slots. */
export function augmentPoolWithRosterFillers(args: {
  skillPool: SimPlayer[];
  draftPicks: TerrainDraftPickRow[];
  /** One roster-filler copy per team so the board does not run dry before round 16. */
  teamCount?: number;
}): { pool: SimPlayer[]; poolHas: Partial<Record<RosterPosition, boolean>> } {
  const teamCount = Math.max(1, args.teamCount ?? 14);
  const seen = new Set(args.skillPool.map((p) => p.playerKey));
  const extra: SimPlayer[] = [];
  const poolHas: Partial<Record<RosterPosition, boolean>> = {
    QB: true,
    RB: true,
    WR: true,
    TE: true,
    K: false,
    DP: false,
    DST: false,
  };

  const sorted = [...args.draftPicks].sort((a, b) => a.overallPick - b.overallPick);
  const templates: Array<{ rosterPos: RosterPosition; row: TerrainDraftPickRow; key: string }> = [];
  const templateKeys = new Set<string>();

  for (const row of sorted) {
    const raw = String(row.position ?? "").trim().toUpperCase();
    let rosterPos: RosterPosition | null = null;
    if (raw === "K") rosterPos = "K";
    else if (raw === "DEF" || raw === "D/ST" || raw === "DST") rosterPos = "DST";
    else if (IDP_DRAFT_POSITIONS.has(raw)) rosterPos = "DP";
    else continue;

    const key = row.playerName.trim().toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key) || templateKeys.has(key)) continue;
    templateKeys.add(key);
    templates.push({ rosterPos, row, key });
  }

  for (const { rosterPos, row, key } of templates) {
    const valueScore = rosterPos === "K" ? 25 : rosterPos === "DP" ? 30 : 28;
    for (let seat = 0; seat < teamCount; seat++) {
      const playerKey = `${key}#${seat + 1}`;
      if (seen.has(playerKey)) continue;
      seen.add(playerKey);
      extra.push({
        playerName: seat === 0 ? row.playerName : `${row.playerName} (${seat + 1})`,
        position: rosterPos === "DP" ? "DP" : rosterPos,
        playerKey,
        valueScore,
        tier: "T5",
      });
      poolHas[rosterPos] = true;
    }
  }

  return { pool: [...args.skillPool, ...extra], poolHas };
}
