/**
 * Phase 0 — data readiness for the behavioral draft engine.
 * Read-only: uses person-merged owner keys + DraftTruth open-draft filter.
 */

import {
  attributeOwnedPicks,
  buildNameToOwnerId,
  buildRawKeyToCanonicalProfileKey,
  cleanOwnerDisplay,
  resolveOwnerKey,
  type GmTeamRow,
  type OwnedDraftPick,
} from "../../ownerProfileService";
import type { loadOwnerProfileSharedData } from "../../ownerProfileService";

export type ReadinessTier = "full_fit" | "shrinkage_fit" | "cold_start";

type SharedLeagueData = Awaited<ReturnType<typeof loadOwnerProfileSharedData>>;

/** Map partial DB select rows to the shape owner-profile helpers expect (`name` not `teamName`). */
function toGmTeamRows(allLeagueTeams: SharedLeagueData["allLeagueTeams"]): GmTeamRow[] {
  return allLeagueTeams.map(
    (r) =>
      ({
        ...r,
        name: r.teamName ?? "",
      }) as unknown as GmTeamRow,
  );
}

export interface OwnerReadinessRow {
  profileOwnerKey: string;
  displayName: string;
  memberGuid: string | null;
  seasonsPresent: number;
  seasonsWithOpenDraftPicks: number;
  openDraftPicks: number;
  keeperSlotPicks: number;
  totalAttributedPicks: number;
  keeperDensityPct: number;
  tier: ReadinessTier;
  tierReason: string;
}

export interface LeagueReadinessReport {
  leagueId: string;
  ownerCount: number;
  seasonSpan: { min: number; max: number } | null;
  totalDraftRows: number;
  rows: OwnerReadinessRow[];
  summary: {
    fullFit: number;
    shrinkageFit: number;
    coldStart: number;
  };
}

function tierFor(openPicks: number, seasonsWithOpen: number): { tier: ReadinessTier; reason: string } {
  if (seasonsWithOpen >= 10 && openPicks >= 80) {
    return { tier: "full_fit", reason: "Enough seasons and open-draft choices for per-owner choice modeling." };
  }
  if (seasonsWithOpen >= 4 && openPicks >= 30) {
    return { tier: "shrinkage_fit", reason: "Sparse but usable — hierarchical shrinkage toward league/cluster prior." };
  }
  return { tier: "cold_start", reason: "Too little open-draft history — cluster/league prior only." };
}

function displayNameForKey(
  profileOwnerKey: string,
  allLeagueTeams: SharedLeagueData["allLeagueTeams"],
  keyRemap: Map<string, string>,
): string {
  const gmRows = toGmTeamRows(allLeagueTeams);
  const nameToOwnerId = buildNameToOwnerId(gmRows);
  let bestName = "";
  let bestSeason = -1;
  for (const t of allLeagueTeams) {
    const raw = resolveOwnerKey(
      String(t.ownerId ?? "").trim(),
      t.ownerName ?? "",
      t.teamName ?? "",
      nameToOwnerId,
    );
    const canon = keyRemap.get(raw) ?? raw;
    if (canon !== profileOwnerKey) continue;
    const name = cleanOwnerDisplay(t.ownerName ?? t.teamName ?? "");
    if (t.season > bestSeason && name) {
      bestSeason = t.season;
      bestName = name;
    }
  }
  if (bestName) return bestName;
  if (profileOwnerKey.startsWith("id:")) return profileOwnerKey.slice(3, 11) + "…";
  return profileOwnerKey.replace(/^name:/, "") || "Unknown";
}

function memberGuidFromKey(profileOwnerKey: string): string | null {
  if (profileOwnerKey.startsWith("id:")) {
    const id = profileOwnerKey.slice(3).trim();
    return id.startsWith("{") ? id : `{${id}}`;
  }
  return null;
}

function summarizePicks(picks: OwnedDraftPick[]) {
  const open = picks.filter((p) => p.draftedForAnalytics);
  const keepers = picks.filter((p) => !p.draftedForAnalytics);
  const openSeasons = new Set(open.map((p) => p.season));
  const allSeasons = new Set(picks.map((p) => p.season));
  const total = picks.length;
  const keeperDensityPct = total > 0 ? Math.round((keepers.length / total) * 1000) / 10 : 0;
  return {
    seasonsPresent: allSeasons.size,
    seasonsWithOpenDraftPicks: openSeasons.size,
    openDraftPicks: open.length,
    keeperSlotPicks: keepers.length,
    totalAttributedPicks: total,
    keeperDensityPct,
  };
}

export function buildLeagueReadinessReport(args: {
  leagueId: string;
  shared: SharedLeagueData;
}): LeagueReadinessReport {
  const { leagueId, shared } = args;
  const { allLeagueTeams, teamsBySeason, draftRows } = shared;
  const gmRows = toGmTeamRows(allLeagueTeams);
  const keyRemap = buildRawKeyToCanonicalProfileKey(gmRows);
  const canonicalKeys = [...new Set(keyRemap.values())].sort();

  const seasons = draftRows.map((r) => r.season).filter((s) => s > 0);
  const seasonSpan = seasons.length
    ? { min: Math.min(...seasons), max: Math.max(...seasons) }
    : null;

  const rows: OwnerReadinessRow[] = [];
  for (const profileOwnerKey of canonicalKeys) {
    const { ownedPicks } = attributeOwnedPicks({
      draftRows,
      teamsBySeason,
      profileOwnerKey,
      allLeagueGmRows: gmRows,
    });
    if (ownedPicks.length === 0) continue;

    const stats = summarizePicks(ownedPicks);
    const { tier, reason } = tierFor(stats.openDraftPicks, stats.seasonsWithOpenDraftPicks);

    rows.push({
      profileOwnerKey,
      displayName: displayNameForKey(profileOwnerKey, allLeagueTeams, keyRemap),
      memberGuid: memberGuidFromKey(profileOwnerKey),
      ...stats,
      tier,
      tierReason: reason,
    });
  }

  rows.sort((a, b) => b.openDraftPicks - a.openDraftPicks);

  return {
    leagueId,
    ownerCount: rows.length,
    seasonSpan,
    totalDraftRows: draftRows.length,
    rows,
    summary: {
      fullFit: rows.filter((r) => r.tier === "full_fit").length,
      shrinkageFit: rows.filter((r) => r.tier === "shrinkage_fit").length,
      coldStart: rows.filter((r) => r.tier === "cold_start").length,
    },
  };
}

export function formatReadinessTable(report: LeagueReadinessReport): string {
  const lines: string[] = [
    `League ${report.leagueId} · ${report.ownerCount} person-merged owners`,
    report.seasonSpan
      ? `Draft data span: ${report.seasonSpan.min}–${report.seasonSpan.max} (${report.totalDraftRows} pick rows)`
      : "No draft rows",
    "",
    "Owner | Seasons (open) | Open picks | Keeper slots | Keeper % | Tier",
    "------|----------------|------------|--------------|----------|--------",
  ];

  for (const r of report.rows) {
    const tierLabel = r.tier === "full_fit" ? "FULL" : r.tier === "shrinkage_fit" ? "SHRINK" : "COLD";
    lines.push(
      `${r.displayName} | ${r.seasonsWithOpenDraftPicks}/${r.seasonsPresent} | ${r.openDraftPicks} | ${r.keeperSlotPicks} | ${r.keeperDensityPct}% | ${tierLabel}`,
    );
  }

  lines.push(
    "",
    `Summary: ${report.summary.fullFit} full-fit · ${report.summary.shrinkageFit} shrinkage-fit · ${report.summary.coldStart} cold-start`,
  );
  return lines.join("\n");
}
