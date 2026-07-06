/**
 * League 457622 roster slot rules — from ESPN settings.rosterSettings.lineupSlotCounts.
 * Isolated in draftEngine; mirrors server/leagueContext slot mapping with IDP slot 15 → DP.
 */

export type RosterPosition = "QB" | "RB" | "WR" | "TE" | "FLEX" | "K" | "DP" | "DST" | "BENCH" | "IR";

export type LeagueRosterRules = {
  leagueId: string;
  source: "espn_reliable" | "inferred_default";
  /** Starting lineup slot counts (FLEX is RB/WR/TE-eligible). */
  starters: Record<RosterPosition, number>;
  benchSlots: number;
  irSlots: number;
  /** Positions required for a legal lineup that the sim pool may include. */
  poolPositions: RosterPosition[];
  /** Positions required but absent from the partial skill pool — flagged honestly. */
  poolGaps: string[];
  /** Saturation soft caps — pull toward more of this position drops sharply at/after this count. */
  softCap: Partial<Record<RosterPosition, number>>;
  /** Hard caps — position effectively removed from consideration. */
  hardCap: Partial<Record<RosterPosition, number>>;
  /** Minimum counts needed to field a legal starting lineup (conservative for FLEX). */
  starterMinimum: Partial<Record<RosterPosition, number>>;
};

const ESPN_SLOT_TO_LABEL: Record<number, RosterPosition> = {
  0: "QB",
  1: "QB",
  2: "RB",
  4: "WR",
  6: "TE",
  7: "QB", // SUPERFLEX treated as QB depth for saturation
  3: "FLEX",
  5: "FLEX",
  23: "FLEX",
  15: "DP",
  16: "DST",
  17: "K",
  20: "BENCH",
  21: "IR",
  24: "IR",
};

function emptyStarters(): Record<RosterPosition, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DP: 0, DST: 0, BENCH: 0, IR: 0 };
}

/** Parse ESPN lineupSlotCounts into structured roster rules. */
export function rosterRulesFromLineupSlotCounts(args: {
  leagueId: string;
  lineupSlotCounts: Record<string, unknown> | null | undefined;
}): LeagueRosterRules {
  const counts = args.lineupSlotCounts;
  const starters = emptyStarters();
  let benchSlots = 0;
  let irSlots = 0;

  if (counts && typeof counts === "object" && Object.keys(counts).length > 0) {
    for (const [idStr, raw] of Object.entries(counts)) {
      const id = Number(idStr);
      const c = Number(raw);
      if (!Number.isFinite(id) || !Number.isFinite(c) || c <= 0) continue;
      const label = ESPN_SLOT_TO_LABEL[id];
      if (!label) continue;
      if (label === "BENCH") benchSlots += c;
      else if (label === "IR") irSlots += c;
      else starters[label] += c;
    }
  }

  const hasParsedStarters =
    starters.QB + starters.RB + starters.WR + starters.TE + starters.FLEX + starters.K + starters.DP + starters.DST > 0;

  if (!hasParsedStarters) {
    return default457622Rules("inferred_default");
  }

  // League 457622: slot 15 = individual defensive player (IDP), slot 16 = 0 team DST.
  if (starters.DST > 0 && starters.DP === 0) {
    /* team D/ST league — keep DST */
  } else if (starters.DP > 0 && starters.DST === 0) {
    /* IDP — already mapped */
  }

  return buildRulesFromStarters({
    leagueId: args.leagueId,
    source: "espn_reliable",
    starters,
    benchSlots: benchSlots || 5,
    irSlots: irSlots || 2,
  });
}

function default457622Rules(source: LeagueRosterRules["source"]): LeagueRosterRules {
  return buildRulesFromStarters({
    leagueId: "457622",
    source,
    starters: { ...emptyStarters(), QB: 1, RB: 1, WR: 2, TE: 1, FLEX: 2, K: 1, DP: 1 },
    benchSlots: 5,
    irSlots: 2,
  });
}

function buildRulesFromStarters(args: {
  leagueId: string;
  source: LeagueRosterRules["source"];
  starters: Record<RosterPosition, number>;
  benchSlots: number;
  irSlots: number;
}): LeagueRosterRules {
  const { starters } = args;
  const flex = starters.FLEX;
  const skillStarterSlots = starters.RB + starters.WR + starters.TE + flex;

  const poolGaps: string[] = [];
  const poolPositions: RosterPosition[] = ["QB", "RB", "WR", "TE"];
  if (starters.K > 0) {
    poolPositions.push("K");
    poolGaps.push("Kickers not in the ~190-name skill terrain pool — late-round K picks use draft-history fillers when available.");
  }
  if (starters.DP > 0) {
    poolPositions.push("DP");
    poolGaps.push("IDP (DP slot) not in skill terrain — late-round DP picks use draft-history IDP fillers when available.");
  }
  if (starters.DST > 0) {
    poolPositions.push("DST");
    poolGaps.push("Team D/ST not in skill terrain — late-round DST picks use draft-history fillers when available.");
  }

  const starterMinimum: Partial<Record<RosterPosition, number>> = {
    QB: starters.QB,
    RB: starters.RB + Math.min(1, flex),
    WR: starters.WR + Math.min(1, flex),
    TE: starters.TE,
    K: starters.K,
    DP: starters.DP,
    DST: starters.DST,
  };

  // Minimum skill bodies to fill dedicated RB/WR/TE + all FLEX from RB/WR/TE pool.
  const minSkillBodies = starters.RB + starters.WR + starters.TE + flex;

  const softCap: Partial<Record<RosterPosition, number>> = {
    QB: Math.max(starters.QB + 1, 2),
    RB: Math.min(6, Math.max(starters.RB + flex + 2, 5)),
    WR: Math.min(7, Math.max(starters.WR + flex + 2, 6)),
    TE: Math.max(starters.TE + 1, 2),
    K: starters.K,
    DP: Math.max(starters.DP + 1, 2),
    DST: starters.DST,
  };

  const hardCap: Partial<Record<RosterPosition, number>> = {
    QB: (softCap.QB ?? 2) + 1,
    RB: (softCap.RB ?? 6) + 1,
    WR: (softCap.WR ?? 7) + 1,
    TE: softCap.TE ?? 2,
    K: 1,
    DP: (softCap.DP ?? 2) + 1,
    DST: 1,
  };

  void minSkillBodies;
  void skillStarterSlots;

  return {
    leagueId: args.leagueId,
    source: args.source,
    starters,
    benchSlots: args.benchSlots,
    irSlots: args.irSlots,
    poolPositions,
    poolGaps,
    softCap,
    hardCap,
    starterMinimum,
  };
}

/** Known-good rules for league 457622 (ESPN 2025/2026 cache). */
export function league457622RosterRules(): LeagueRosterRules {
  return rosterRulesFromLineupSlotCounts({
    leagueId: "457622",
    lineupSlotCounts: {
      "0": 1,
      "2": 1,
      "4": 2,
      "6": 1,
      "15": 1,
      "16": 0,
      "17": 1,
      "20": 5,
      "21": 2,
      "23": 2,
    },
  });
}
