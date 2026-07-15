/**
 * Phase 5 partial gate — Bruce's team pick-by-pick transcript.
 */

import { formatRoomStatePlain } from "../phase1/roomState";
import type { DraftSimulationResult, SimPickRecord } from "./simulateDraft";

function formatBrucePick(p: SimPickRecord, pickIndex: number): string[] {
  const m = p.moment!;
  const over =
    m.takenOver.length > 0
      ? m.takenOver.join(", ")
      : m.consideration
          .filter((c) => c.playerKey !== p.chosen.playerKey)
          .slice(0, 2)
          .map((c) => `${c.playerName} (${c.position})`)
          .join(", ");

  const conf = m.lowConfidencePick ? " · PROVISIONAL SOUL" : "";
  const prob = `${(m.pickProbability * 100).toFixed(0)}% pick prob`;
  const construction = m.rosterConstructionNote ? ` · ${m.rosterConstructionNote}` : "";

  const lines = [
    `Round ${p.round} (pick ${p.overallPick}, Bruce pick #${pickIndex})`,
    `  Took: ${p.chosen.playerName} (${p.chosen.position}, ${p.chosen.tier}, value ${p.chosen.valueScore.toFixed(0)})`,
    `  Over: ${over || "(thin board)"}`,
    `  Reason: ${m.winningDriveLabel} won (${prob}${construction}${conf})`,
  ];

  if ((p.round === 2 || p.round === 3) && m.scoreDebug) {
    const d = m.scoreDebug;
    const margin = d.marginOverRunnerUp;
    const marginLabel = margin >= 0 ? `+${margin.toFixed(2)}` : margin.toFixed(2);
    lines.push(
      `  Score margins: personality=${d.personalityUtility.toFixed(2)} · value-drive=${d.valueContribution.toFixed(2)} · need-drive=${d.needContribution.toFixed(2)} · construction=${d.constructionUtility.toFixed(2)} · final=${d.finalUtility.toFixed(2)} (${marginLabel} vs runner-up)`,
    );
  }

  lines.push(`  Consideration set (${m.consideration.length}): ${m.consideration.map((c) => c.playerName).join(" · ")}`, "");

  return lines;
}

export function formatBrucePartialGate(result: DraftSimulationResult, weatherNote?: string): string {
  const starters = result.rosterRules.starters;
  const lineupDesc = `QB${starters.QB} RB${starters.RB} WR${starters.WR} TE${starters.TE} FLEX${starters.FLEX}${starters.DP ? ` DP${starters.DP}` : ""}${starters.K ? ` K${starters.K}` : ""}${starters.DST ? ` DST${starters.DST}` : ""}`;

  const lines = [
    "GATE 5 (PARTIAL) — Bruce Edwards simulated team",
    `League 457622 · season ${result.season} · seed ${result.seed} · ${result.rounds} rounds · partial board`,
    `Lineup rules (${result.rosterRules.source}): ${lineupDesc} · bench ${result.rosterRules.benchSlots}`,
    "Full league drafted in background; only Bruce's picks shown for gut-check.",
    weatherNote ?? "",
    "",
  ].filter(Boolean);

  if (result.brucePicks.length === 0) {
    lines.push("No Bruce picks recorded — check draft order includes Bruce.");
    return lines.join("\n");
  }

  let i = 0;
  for (const p of result.brucePicks) {
    i++;
    lines.push(...formatBrucePick(p, i));
  }

  const roster = summarizeRoster(result.brucePicks);
  lines.push("BRUCE ROSTER SUMMARY:");
  lines.push(`  ${roster}`);
  lines.push("");
  lines.push(`ROSTER LEGALITY: ${result.bruceRosterLegality.honestSummary}`);
  if (result.bruceRosterLegality.poolGapNotes.length) {
    for (const note of result.bruceRosterLegality.poolGapNotes) {
      lines.push(`  · ${note}`);
    }
  }
  lines.push("");
  lines.push(
    `Runs emerged organically: ${result.finalWeather.roomState.runInProgress ? "run live at draft end" : "no active run at end"} · tempo ${result.finalWeather.tempo} · ${result.picksCompleted} total picks`,
  );
  if (result.poolExhaustedAtPick != null) {
    lines.push(
      `PARTIAL POOL NOTE: board exhausted after pick ${result.poolExhaustedAtPick - 1} (${result.picksCompleted}/${result.rounds * 14} planned) — K/IDP fillers from draft history only.`,
    );
  }
  lines.push(formatRoomStatePlain(result.finalWeather.roomState));

  return lines.join("\n");
}

function summarizeRoster(picks: SimPickRecord[]): string {
  const counts: Record<string, number> = {};
  const names: string[] = [];
  for (const p of picks) {
    const pos = p.chosen.position;
    counts[pos] = (counts[pos] ?? 0) + 1;
    names.push(`${p.chosen.playerName} (${pos})`);
  }
  const posLine = Object.entries(counts)
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
  return `${posLine} — ${names.join(", ")}`;
}

export function formatBrucePickOneLine(p: SimPickRecord): string {
  const m = p.moment!;
  const over = m.takenOver[0] ?? "alternates";
  return `R${p.round}: ${p.chosen.playerName} (${p.chosen.position}) over ${over} — ${m.winningDriveLabel}`;
}
