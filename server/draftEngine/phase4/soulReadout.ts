/**
 * One-paragraph plain-English soul readouts for Gate 4.
 * Emphasizes deviation from league baseline — need is table stakes, not identity.
 */

import type { ChoiceRecord } from "../phase1/types";
import type { DriveName } from "../phase3/driveFeatures";
import type { OwnerSoulProfile } from "./fitAllSouls";
import { TABLE_STAKES_DRIVES } from "./personalityDeviations";

const DEVIATION_PHRASES: Partial<
  Record<DriveName, { above: string; below: string }>
> = {
  value: {
    above: "chases board value more than most leaguemates",
    below: "cares less about raw board value than the league average — roster shape over BPA",
  },
  rbEarlyRound: { above: "pays up for RBs early relative to this league", below: "waits longer on RBs early than most here" },
  wrEarlyRound: { above: "pays up for WRs early relative to this league", below: "lets WR value come to him more than most" },
  rbEarlyLegacyEra: { above: "was distinctly RB-first before 2023", below: "" },
  wrEarlyModernEra: {
    above: "has shifted WR-forward since 2023 more than peers",
    below: "has not joined the league's recent WR-first wave",
  },
  herdFomo: { above: "joins position runs more than most", below: "ignores the herd more than most" },
  contrarian: { above: "fades runs and zigs when others zag", below: "chases the crowd more than most" },
  comfortAnchor: { above: "re-drafts familiar names more than most", below: "rarely circles back to prior players" },
  panic: { above: "gets urgent when tiers thin — more than league average", below: "stays patient under tier pressure" },
  scarcityTierCliff: { above: "reacts harder to tier cliffs", below: "" },
};

function earlyRoundMixFromSoul(soul: OwnerSoulProfile, records?: ChoiceRecord[]) {
  if (soul.earlyRoundPickCount > 0) {
    return { rb: soul.earlyRoundRbPct, wr: soul.earlyRoundWrPct, n: soul.earlyRoundPickCount };
  }
  if (!records?.length) return { rb: 0, wr: 0, n: 0 };
  const early = records.filter((r) => r.round <= 2);
  const n = early.length || 1;
  return {
    rb: Math.round((early.filter((r) => r.chosenPlayer.position === "RB").length / n) * 100),
    wr: Math.round((early.filter((r) => r.chosenPlayer.position === "WR").length / n) * 100),
    n: early.length,
  };
}

function phraseForDeviation(drive: DriveName, delta: number): string | null {
  const p = DEVIATION_PHRASES[drive];
  if (!p) return null;
  if (delta > 0.08) return p.above;
  if (delta < -0.08) return p.below;
  return null;
}

function distinctiveTraitText(soul: OwnerSoulProfile): string {
  const phrases = soul.distinctiveDrives
    .map(({ drive, delta }) => phraseForDeviation(drive as DriveName, delta))
    .filter(Boolean) as string[];

  if (phrases.length >= 2) return `${phrases[0]} and ${phrases[1]}`;
  if (phrases.length === 1) return phrases[0]!;
  return "tracks close to the league baseline on distinctive drives — no strong tilt beyond table-stakes roster building";
}

function eraEvolutionFromDeviation(soul: OwnerSoulProfile): string | null {
  const d = soul.deviationCoefficients;
  const legacyRb = d.rbEarlyLegacyEra > 0.15;
  const modernWr = d.wrEarlyModernEra > 0.08;
  if (legacyRb && modernWr) {
    return "His personal arc stands out: more RB-forward than peers in the legacy era, then a recent WR tilt (modern sample still thin). ";
  }
  if (legacyRb) return "He was more RB-forward than peers before 2023. ";
  if (modernWr) return "Since 2023 he has been more WR-forward than most leaguemates. ";
  return null;
}

export function soulParagraph(soul: OwnerSoulProfile, records?: ChoiceRecord[]): string {
  const early = earlyRoundMixFromSoul(soul, records);
  const distinct = distinctiveTraitText(soul);
  const needDelta = soul.deviationCoefficients.need;
  const needNote =
    Math.abs(needDelta) < 0.08
      ? "Like most of this league, he drafts to roster need — that's table stakes, not what separates him. "
      : needDelta > 0.08
        ? "He weights roster need even more than the typical leaguemate here. "
        : "He departs from league norms by caring less about filling holes on the board. ";

  const consistency =
    soul.inverseTemperature > 1.15
      ? "fairly consistent pick-to-pick"
      : soul.inverseTemperature < 0.75
        ? "willing to leave coin-flip decisions open"
        : "moderately consistent";

  let body = `${soul.displayName} — ${soul.distinctiveArchetype}: ${needNote}What sets him apart: ${distinct}. `;
  const era = eraEvolutionFromDeviation(soul);
  if (era) body += era;
  body += `Early-round tape: ${early.rb}% RB / ${early.wr}% WR (${early.n} picks in rounds 1–2). `;
  body += `~${(soul.avgChosenProbability * 100).toFixed(0)}% avg pick probability on ${soul.choiceEventCount} open-draft choices (league 457622, partial board). `;
  body += `${consistency}. `;

  if (soul.personalityFitTier === "shrinkage_cold" && soul.shrinkage) {
    const ownPct = Math.round(soul.shrinkage.ownWeight * 100);
    const clusterPct = Math.round(soul.shrinkage.clusterWeight * 100);
    const leaguePct = Math.round(soul.shrinkage.leagueWeight * 100);
    body += `Thin history (${soul.choiceEventCount} picks): ~${ownPct}% own signal, ~${clusterPct}% from nearest cluster (“${soul.clusterLabel}”), ~${leaguePct}% league average — provisional until more seasons import.`;
  } else {
    body += `Full personal fit — distinctive read is his own signal, not borrowed.`;
  }

  return body;
}

export function formatGate4Readouts(souls: OwnerSoulProfile[]): string {
  const lines = [
    "GATE 4 — Active owner souls (league 457622, deviation-from-league readouts)",
    "",
  ];
  for (const soul of [...souls].sort((a, b) => a.displayName.localeCompare(b.displayName))) {
    lines.push(`${soul.displayName}`);
    lines.push(soulParagraph(soul, soul.records));
    lines.push("");
  }
  return lines.join("\n");
}

export function formatBeforeAfterSpread(args: {
  before: Array<{ displayName: string; clusterLabel: string; topDrive: string; needCoef: number }>;
  after: Array<{ displayName: string; archetype: string; topDrive: string; needCoef: number }>;
  spreadBefore: { uniqueLabels: number; meanNeed: number };
  spreadAfter: { uniqueArchetypes: number; meanAbsDeviation: number };
}): string {
  const lines = [
    "BEFORE / AFTER — personality separation",
    "",
    `Before: ${args.spreadBefore.uniqueLabels} cluster labels; mean need coefficient ${args.spreadBefore.meanNeed.toFixed(2)} (need dominated).`,
    `After:  ${args.spreadAfter.uniqueArchetypes} distinctive archetypes; mean |deviation| on distinctive drives ${args.spreadAfter.meanAbsDeviation.toFixed(3)}.`,
    "",
    "Owner          | Before (cluster)     | Top drive before | After (archetype)        | Top gap drive",
    "---------------|----------------------|------------------|--------------------------|---------------",
  ];
  const beforeMap = new Map(args.before.map((b) => [b.displayName, b]));
  for (const a of args.after) {
    const b = beforeMap.get(a.displayName);
    if (!b) continue;
    const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
    lines.push(
      `${pad(a.displayName, 14)} | ${pad(b.clusterLabel, 20)} | ${pad(b.topDrive, 16)} | ${pad(a.archetype, 24)} | ${a.topDrive}`,
    );
  }
  return lines.join("\n");
}

/** @deprecated use deviation-based readout fields */
export { TABLE_STAKES_DRIVES };
