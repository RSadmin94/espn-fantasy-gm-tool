/**
 * Phase 4.5 — GATE 4.5 formatted decision-rule readouts.
 */

import { BRUCE_PROFILE_OWNER_KEY } from "../activeOwners";
import type { OwnerDecisionProfile } from "./decisionRules";

function formatEvidence(ev: OwnerDecisionProfile["rules"][0]["evidence"]): string {
  const seasonPart =
    ev.seasons.length > 0 && ev.seasons.length <= 6
      ? `seasons ${ev.seasons.join(", ")}`
      : ev.seasons.length > 6
        ? `${ev.seasons.length} seasons (${ev.seasonRange})`
        : ev.seasonRange;
  return `${ev.matchingPicks} matching picks · ${ev.draftSeasons} drafts · ${seasonPart}`;
}

function formatProfile(p: OwnerDecisionProfile): string {
  const lines: string[] = [
    `${p.displayName} — DECISION-RULE PROFILE (league 457622 · ${p.choiceEventCount} open-draft choices · partial board)`,
    p.provisionalNote ?? "",
    "",
    "RULES (if/then):",
  ].filter(Boolean);

  if (p.rules.length === 0) {
    lines.push("  (no rules met confidence threshold — see provisional note)");
  }
  for (let i = 0; i < p.rules.length; i++) {
    const r = p.rules[i]!;
    lines.push(`  ${i + 1}. IF/THEN: ${r.ifThen}`);
    lines.push(`     Evidence: ${formatEvidence(r.evidence)} · Confidence: ${r.confidencePct}%`);
  }

  lines.push("", "EXCEPTIONS / OVERRIDES:");
  if (p.exceptions.length === 0) {
    lines.push("  (none above threshold)");
  }
  for (let i = 0; i < p.exceptions.length; i++) {
    const ex = p.exceptions[i]!;
    lines.push(`  ${i + 1}. ${ex.unless}`);
    lines.push(`     Evidence: ${formatEvidence(ex.evidence)} · Confidence: ${ex.confidencePct}%`);
  }

  lines.push("", "WHAT CHANGES THESE RULES:");
  for (const m of p.ruleModifiers) lines.push(`  • ${m}`);

  lines.push("", "ERAS (behavioral chapters):");
  if (p.eras.length === 0) {
    lines.push("  (single chapter — not enough season splits)");
  }
  for (const era of p.eras) {
    lines.push(
      `  • ${era.label} (${era.seasonStart}–${era.seasonEnd}): ${era.pickCount} picks, ${era.seasonCount} seasons — confidence: ${era.confidenceLabel.toUpperCase()}`,
    );
    lines.push(`    ${era.summary}`);
  }

  lines.push("", "EXPOSED STABILITY:");
  const top = p.stability.slice(0, 4);
  lines.push(`  ${top.map((s) => `${s.trait} ${s.confidencePct}%`).join(" · ")}`);
  lines.push(`  Overall: ${p.overallStability.toUpperCase()} · avg model pick prob ${(p.avgChosenProbability * 100).toFixed(1)}%`);
  lines.push(`  ${p.boardScopeNote}`);

  return lines.join("\n");
}

export function formatGate45Readouts(profiles: OwnerDecisionProfile[]): string {
  const byKey = new Map(profiles.map((p) => [p.profileOwnerKey, p]));
  const bruce = byKey.get(BRUCE_PROFILE_OWNER_KEY);
  const others = profiles
    .filter((p) => p.profileOwnerKey !== BRUCE_PROFILE_OWNER_KEY)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const lines = [
    "GATE 4.5 — Decision-rule profiles (14 active owners · league 457622 only)",
    "Coefficients unchanged — this layer TRANSLATES fitted souls into human-readable rules.",
    "",
    "══════════════════════════════════════════════════════════════",
    "",
  ];

  if (bruce) {
    lines.push(formatProfile(bruce));
    lines.push("");
    lines.push("══════════════════════════════════════════════════════════════");
    lines.push("");
  }

  for (const p of others) {
    lines.push(formatProfile(p));
    lines.push("");
    lines.push("──────────────────────────────────────────────────────────────");
    lines.push("");
  }

  return lines.join("\n");
}

export function formatSingleProfile(p: OwnerDecisionProfile): string {
  return formatProfile(p);
}
