/**
 * Phase 5 full gate — complete 14-team draft transcript + owner scout reads.
 */

import { CONFIRMED_ACTIVE_OWNERS, shrinkageColdOwners } from "../activeOwners";
import { normalizePosition } from "../phase1/types";
import type { OwnerSoulProfile } from "../phase4/fitAllSouls";
import type { DraftSimulationResult, SimPickRecord } from "./simulateDraft";
import { assessRosterLegality, emptyRosterCounts, addToRoster } from "./rosterConstruction";

const PROVISIONAL_KEYS = new Set(shrinkageColdOwners().map((o) => o.profileOwnerKey));

export type EmergentRun = {
  position: string;
  startPick: number;
  endPick: number;
  pickCount: number;
};

export function detectEmergentRuns(picks: SimPickRecord[]): EmergentRun[] {
  const recent: string[] = [];
  const runs: EmergentRun[] = [];
  let active: EmergentRun | null = null;

  for (const p of picks) {
    const pos = normalizePosition(p.chosen.position);
    recent.push(pos);
    if (recent.length > 6) recent.shift();

    const last4 = recent.slice(-4);
    const count = last4.filter((x) => x === pos).length;

    if (count >= 3) {
      if (active?.position === pos) {
        active.endPick = p.overallPick;
        active.pickCount += 1;
      } else {
        if (active) runs.push(active);
        active = { position: pos, startPick: p.overallPick, endPick: p.overallPick, pickCount: 1 };
      }
    } else if (active && active.position !== pos) {
      runs.push(active);
      active = null;
    }
  }
  if (active) runs.push(active);
  return runs.filter((r) => r.pickCount >= 2);
}

function takenOverLine(p: SimPickRecord): string {
  const m = p.moment;
  if (!m) return "(no moment)";
  if (m.takenOver.length > 0) return m.takenOver.join(", ");
  return (
    m.consideration
      .filter((c) => c.playerKey !== p.chosen.playerKey)
      .slice(0, 2)
      .map((c) => `${c.playerName} (${c.position})`)
      .join(", ") || "(thin board)"
  );
}

function reasonLine(p: SimPickRecord): string {
  const m = p.moment;
  if (!m) return "unknown";
  const base = m.winningDriveLabel;
  if (m.rosterConstructionNote) return `${base} (${m.rosterConstructionNote})`;
  return base;
}

export function formatPickTranscriptLine(p: SimPickRecord): string {
  const prov = PROVISIONAL_KEYS.has(p.chooserProfileKey) || p.lowConfidencePick ? " [PROVISIONAL]" : "";
  return `#${p.overallPick} R${p.round} · ${p.chooserDisplayName}${prov} · ${p.chosen.playerName} (${p.chosen.position}) · over ${takenOverLine(p)} · ${reasonLine(p)}`;
}

export function formatFullDraftGate(args: {
  result: DraftSimulationResult;
  souls: OwnerSoulProfile[];
  skillPoolSize: number;
  augmentedPoolSize: number;
}): string {
  const { result } = args;
  const teamCount = CONFIRMED_ACTIVE_OWNERS.length;
  const planned = result.rounds * teamCount;
  const starters = result.rosterRules.starters;
  const lineupDesc = `QB${starters.QB} RB${starters.RB} WR${starters.WR} TE${starters.TE} FLEX${starters.FLEX}${starters.DP ? ` DP${starters.DP}` : ""}${starters.K ? ` K${starters.K}` : ""}`;

  const lines: string[] = [
    "GATE 5 (FULL) — 14-team simulated draft · league 457622 only",
    `Season ${result.season} · seed ${result.seed} · ${result.picksCompleted}/${planned} picks · partial board (~${args.skillPoolSize} skill names + K/IDP fillers)`,
    `Lineup (${result.rosterRules.source}): ${lineupDesc} · bench ${result.rosterRules.benchSlots}`,
    "steven hibbard: departed — board context only, no sim seat.",
    "",
  ];

  if (result.poolExhaustedAtPick != null || result.picksCompleted < planned) {
    lines.push(
      `POOL LIMIT (data, not bug): sim completed ${result.picksCompleted}/${planned} picks (~${Math.ceil(result.picksCompleted / teamCount)} rounds of ${result.rounds}). Partial board (~${args.skillPoolSize} skill + K/IDP fillers); board ran dry or consideration sets emptied. Most teams missing K and/or DP — not personality bugs.`,
      "",
    );
  }

  lines.push("── PICK-BY-PICK (draft order) ──", "");

  for (const p of result.picks) {
    lines.push(formatPickTranscriptLine(p));
  }

  lines.push("", "── EMERGENT RUNS ──", "");
  const runs = detectEmergentRuns(result.picks);
  if (runs.length === 0) {
    lines.push("No sustained position runs (3+ of last 4 at same position).");
  } else {
    for (const r of runs) {
      lines.push(
        `${r.position} run · picks ${r.startPick}–${r.endPick} (${r.pickCount} consecutive ${r.position} picks in run window)`,
      );
    }
  }

  lines.push("", "── PER-OWNER SCOUT ──", "");
  lines.push(...formatOwnerScoutReads(result, args.souls));

  lines.push("", "── ROSTER LEGALITY (honest) ──", "");
  const soulByKey = new Map(args.souls.map((s) => [s.profileOwnerKey, s]));
  for (const owner of CONFIRMED_ACTIVE_OWNERS) {
    const ownerPicks = result.picks.filter((p) => p.chooserProfileKey === owner.profileOwnerKey);
    let roster = emptyRosterCounts();
    for (const p of ownerPicks) roster = addToRoster(roster, p.chosen);
    const leg = assessRosterLegality({ roster, rules: result.rosterRules, poolHas: result.poolHas });
    const counts = summarizeCounts(ownerPicks);
    const flag = leg.skillLineupLegal ? "skill OK" : `skill gap: ${leg.skillMissing.join(",")}`;
    const kdp =
      !leg.dpFilled && (result.rosterRules.starters.DP ?? 0) > 0
        ? " · DP unfilled"
        : leg.kFilled
          ? ""
          : " · K unfilled";
    lines.push(`${owner.displayName}: ${counts}${flag}${kdp}${owner.personalityFitTier === "shrinkage_cold" ? " · PROVISIONAL soul" : ""}`);
  }

  return lines.join("\n");
}

function summarizeCounts(picks: SimPickRecord[]): string {
  const c: Record<string, number> = {};
  for (const p of picks) {
    const pos = p.chosen.position;
    c[pos] = (c[pos] ?? 0) + 1;
  }
  const parts = Object.entries(c)
    .map(([k, v]) => `${k}${v}`)
    .join(" ");
  return `[${picks.length} picks · ${parts}] `;
}

function formatOwnerScoutReads(result: DraftSimulationResult, souls: OwnerSoulProfile[]): string[] {
  const soulByKey = new Map(souls.map((s) => [s.profileOwnerKey, s]));
  const lines: string[] = [];

  for (const owner of CONFIRMED_ACTIVE_OWNERS) {
    const picks = result.picks.filter((p) => p.chooserProfileKey === owner.profileOwnerKey);
    const soul = soulByKey.get(owner.profileOwnerKey);
    if (!picks.length || !soul) {
      lines.push(`${owner.displayName}: no picks recorded.`);
      continue;
    }

    const early = picks.filter((p) => p.round <= 3).map((p) => p.chosen.position);
    const driveCounts = new Map<string, number>();
    for (const p of picks) {
      const label = p.moment?.winningDriveLabel ?? "?";
      driveCounts.set(label, (driveCounts.get(label) ?? 0) + 1);
    }
    const topDrives = [...driveCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    const comfort = picks.filter((p) => p.moment?.winningDrive === "comfortAnchor").length;
    const rbEarly = picks.filter((p) => p.round === 1 && p.chosen.position === "RB").length;
    const wrEarly = picks.filter((p) => p.round <= 2 && p.chosen.position === "WR").length;

    const distinctive = soul.distinctiveDrives.slice(0, 2).map((d) => d.drive).join(", ") || "baseline";
    let verdict = "In-character";
    const notes: string[] = [];

    if (soul.deviationCoefficients.rbEarlyRound + soul.deviationCoefficients.rbEarlyLegacyEra > 0.12 && rbEarly === 0 && early.includes("WR")) {
      notes.push("RB-leaning soul opened non-RB");
    }
    if (soul.deviationCoefficients.wrEarlyModernEra > 0.08 && wrEarly >= 1) {
      notes.push("modern WR tilt visible early");
    }
    if (soul.deviationCoefficients.comfortAnchor > 0.1 && comfort >= 2) {
      notes.push(`${comfort} comfort re-drafts`);
    }
    if (soul.deviationCoefficients.herdFomo > 0.1 && topDrives.some(([d]) => d.includes("run"))) {
      notes.push("joined herd runs");
    }
    if (notes.length === 0) notes.push(`top drives: ${topDrives.map(([d, n]) => `${d}×${n}`).join(", ")}`);

    if (owner.personalityFitTier === "shrinkage_cold") {
      verdict = "Provisional read";
      notes.push("thin/shrinkage soul — treat as directional only");
    }

    lines.push(
      `${owner.displayName} (${soul.distinctiveArchetype}): ${verdict}. Early: ${early.join("→") || "—"}. ${notes.join("; ")}. Distinctive fit: ${distinctive}.`,
    );
  }

  return lines;
}

export function formatFullDraftJson(args: {
  result: DraftSimulationResult;
  souls: OwnerSoulProfile[];
  draftOrder: string[];
  skillPoolSize: number;
  augmentedPoolSize: number;
}) {
  return {
    seed: args.result.seed,
    season: args.result.season,
    leagueId: args.result.leagueId,
    draftOrder: args.draftOrder,
    picksCompleted: args.result.picksCompleted,
    plannedPicks: args.result.rounds * 14,
    poolExhaustedAtPick: args.result.poolExhaustedAtPick,
    skillPoolSize: args.skillPoolSize,
    augmentedPoolSize: args.augmentedPoolSize,
    emergentRuns: detectEmergentRuns(args.result.picks),
    picks: args.result.picks.map((p) => ({
      overallPick: p.overallPick,
      round: p.round,
      owner: p.chooserDisplayName,
      provisional: PROVISIONAL_KEYS.has(p.chooserProfileKey),
      player: p.chosen.playerName,
      position: p.chosen.position,
      takenOver: p.moment?.takenOver,
      winningDrive: p.moment?.winningDrive,
      winningDriveLabel: p.moment?.winningDriveLabel,
      rosterConstructionNote: p.moment?.rosterConstructionNote,
    })),
  };
}
