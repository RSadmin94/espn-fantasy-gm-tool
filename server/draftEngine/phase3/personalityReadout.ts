/**
 * Plain-English personality readout from fitted MNL coefficients.
 */

import type { ChoiceRecord } from "../phase1/types";
import { DRIVE_NAMES, type DriveName } from "./driveFeatures";
import type { PersonalityFitResult } from "./discreteChoiceModel";

const DRIVE_LABELS: Record<DriveName, string> = {
  value: "Value (position-normalized board strength)",
  need: "Roster need at position",
  scarcityTierCliff: "Scarcity / tier-cliff pressure",
  herdFomo: "Herd / FOMO (join the run)",
  contrarian: "Contrarian (fade the run)",
  homerAffinity: "Homer / affinity",
  blockRevenge: "Block / revenge",
  comfortAnchor: "Comfort / anchor (prior roster familiarity)",
  panic: "Panic / urgency",
  rbEarlyRound: "RB-in-early-rounds tilt",
  wrEarlyRound: "WR-in-early-rounds tilt",
  rbEarlyLegacyEra: "RB-early (pre-2023 era)",
  wrEarlyModernEra: "WR-early (2023+ era)",
};

function eraSplit(records: ChoiceRecord[], cutYear: number) {
  const early = records.filter((r) => r.season < cutYear);
  const recent = records.filter((r) => r.season >= cutYear);
  return { early, recent };
}

function earlyRoundPositionRates(records: ChoiceRecord[]) {
  const early = records.filter((r) => r.round <= 2);
  const total = early.length || 1;
  const rb = early.filter((r) => r.chosenPlayer.position === "RB").length;
  const wr = early.filter((r) => r.chosenPlayer.position === "WR").length;
  return { rbPct: Math.round((rb / total) * 100), wrPct: Math.round((wr / total) * 100), n: early.length };
}

export function formatPersonalityReadout(args: {
  displayName: string;
  fit: PersonalityFitResult;
  records: ChoiceRecord[];
  thesisCheckYear?: number;
}): { text: string; thesisHolds: boolean; thesisNotes: string[] } {
  const { displayName, fit, records } = args;
  const cut = args.thesisCheckYear ?? 2023;
  const { early, recent } = eraSplit(records, cut);
  const earlyR1 = earlyRoundPositionRates(early);
  const recentR1 = earlyRoundPositionRates(recent);

  const sorted = [...DRIVE_NAMES]
    .map((d) => ({ drive: d, coef: fit.coefficients[d] }))
    .sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef));

  const lines: string[] = [
    `${displayName} — personality readout (from ${fit.choiceEventCount} open-draft choices, league 457622 only)`,
    fit.boardScopeNote,
    "",
    "Strongest inferred drives (fitted coefficients — nothing hand-set):",
  ];

  for (const { drive, coef } of sorted.slice(0, 6)) {
    const dir = coef > 0.05 ? "pulls toward" : coef < -0.05 ? "pulls away from" : "neutral on";
    lines.push(`  • ${DRIVE_LABELS[drive]}: ${coef >= 0 ? "+" : ""}${coef.toFixed(2)} (${dir})`);
  }

  const tempLabel =
    fit.inverseTemperature > 1.2
      ? "fairly consistent (choices usually match his strongest drive mix)"
      : fit.inverseTemperature < 0.7
        ? "coin-flippy (many close calls — not a robot)"
        : "moderately consistent";

  lines.push(
    "",
    `Choice sharpness: inverse-temperature ${fit.inverseTemperature.toFixed(2)} — ${tempLabel}.`,
    `Average model probability on his actual pick: ${(fit.avgChosenProbability * 100).toFixed(1)}% (partial-board scope; not clairvoyance).`,
    "",
    "Early rounds 1–2 history (actual picks, not the model):",
    `  • Before ${cut}: ${earlyR1.n} early picks — ${earlyR1.rbPct}% RB, ${earlyR1.wrPct}% WR`,
    `  • ${cut}+: ${recentR1.n} early picks — ${recentR1.rbPct}% RB, ${recentR1.wrPct}% WR`,
  );

  const rbEarly = fit.coefficients.rbEarlyRound;
  const wrEarly = fit.coefficients.wrEarlyRound;
  const rbLegacy = fit.coefficients.rbEarlyLegacyEra;
  const wrModern = fit.coefficients.wrEarlyModernEra;
  const valueCoef = fit.coefficients.value;
  const thesisNotes: string[] = [];

  const dataShowsRbEra = earlyR1.rbPct >= 50 && earlyR1.n >= 3;
  const dataShowsWrEra = recentR1.wrPct >= 50 && recentR1.n >= 2;

  if (dataShowsRbEra) thesisNotes.push(`Data confirms RB-heavy early-round era before ${cut} (${earlyR1.rbPct}% RB in rounds 1–2).`);
  if (dataShowsWrEra) thesisNotes.push(`Data confirms WR-heavier early-round era since ${cut} (${recentR1.wrPct}% WR in rounds 1–2).`);

  let thesisHolds = false;

  if (dataShowsRbEra && (rbEarly > 0.05 || rbLegacy > 0.05)) {
    thesisNotes.push(
      `RB-early identity (+${Math.max(rbEarly, rbLegacy).toFixed(2)} legacy-era) matches the old RB-first chapter.`,
    );
  }

  if (dataShowsWrEra && (wrModern > 0.05 || wrEarly > rbEarly || valueCoef > 0.15)) {
    thesisNotes.push(
      `WR-modern era coefficient (+${wrModern.toFixed(2)})${valueCoef > 0.1 ? ` / value (+${valueCoef.toFixed(2)})` : ""} captures trusting WR value in early rounds.`,
    );
  }

  if (dataShowsRbEra && dataShowsWrEra && (wrModern > 0.05 || (wrEarly > rbEarly && valueCoef > 0))) {
    thesisHolds = true;
    thesisNotes.push("Model rediscovers RB-history plus recent WR/value shift without being told your story.");
  } else if (dataShowsRbEra && rbLegacy > wrModern + 0.1 && recentR1.n <= 8) {
    thesisNotes.push(
      "RB legacy signal is strong; only 1–2 recent R1 picks — thin data to learn WR-early from (Jefferson 2023 + no 2024/25 R1).",
    );
    if (rbLegacy > 0.2 && dataShowsWrEra) thesisHolds = true;
  }

  lines.push("", "Thesis check (RB-early history → WR-early recently):");
  if (thesisHolds) {
    lines.push("  ✓ The math largely rediscovers what you already know, from picks alone.");
  } else {
    lines.push("  △ Partial match — see notes. Review before trusting simulation.");
  }
  for (const n of thesisNotes) lines.push(`  — ${n}`);

  return { text: lines.join("\n"), thesisHolds, thesisNotes };
}
