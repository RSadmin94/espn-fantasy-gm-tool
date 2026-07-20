/**
 * One-shot coverage report: 2025 Atlantas Finest 196-pick draft vs shared identity.
 * Usage: npx tsx scripts/reportPlayerIdentityDraftCoverage.mts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPlayerIdentityIndex,
  resolvePlayerIdentity,
  type CompactPlayerLookupArtifact,
} from "../shared/playerIdentity";
import artifactJson from "../shared/data/sleeperPlayerLookup.compact.json";
import metaJson from "../shared/data/sleeperPlayerLookup.meta.json";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifact = artifactJson as CompactPlayerLookupArtifact;
const index = createPlayerIdentityIndex(artifact);

const picks = (
  JSON.parse(fs.readFileSync(path.join(root, "player-profiles-clean.json"), "utf8"))
    .uniquePicks as Array<{
    season: number;
    overallPick: number;
    playerId: number | null;
    playerName: string;
    position: string;
  }>
).filter((p) => p.season === 2025);

const POS_MAP: Record<string, string | null> = {
  POS10: "DL",
  POS11: "LB",
  POS13: "DB",
  UNK: null,
  "D/ST": "DEF",
  DST: "DEF",
  DEF: "DEF",
};

const counts: Record<string, number> = {
  sleeper_id: 0,
  espn_id: 0,
  name_team_pos: 0,
  name_team: 0,
  name_pos: 0,
  name_unique: 0,
  unresolved: 0,
  ambiguous: 0,
};

const misses: Array<Record<string, unknown>> = [];
const samples = {
  modern: [] as Array<Record<string, unknown>>,
  idp: [] as Array<Record<string, unknown>>,
  changedTeam: [] as Array<Record<string, unknown>>,
  def: [] as Array<Record<string, unknown>>,
};

const modernNames = new Set([
  "Ja'Marr Chase",
  "Saquon Barkley",
  "Amon-Ra St. Brown",
  "Jahmyr Gibbs",
  "Justin Jefferson",
  "CeeDee Lamb",
  "Puka Nacua",
  "Bijan Robinson",
]);
const idpNames = new Set([
  "Fred Warner",
  "Micah Parsons",
  "Myles Garrett",
  "Budda Baker",
  "T.J. Watt",
  "Roquan Smith",
  "Zack Baun",
  "Maxx Crosby",
]);

for (const p of picks) {
  const posRaw = String(p.position || "");
  const pos = POS_MAP[posRaw] ?? posRaw;
  const name = String(p.playerName || "");
  const isPlaceholder = /^Player\s+\d+$/i.test(name);
  const r = resolvePlayerIdentity(
    {
      espnPlayerId: p.playerId != null ? String(p.playerId) : null,
      playerName: isPlaceholder ? null : name,
      position: pos,
    },
    index,
  );

  if (r.matchSource === "unresolved") {
    counts.unresolved += 1;
    if (r.unresolvedReason?.startsWith("ambiguous")) counts.ambiguous += 1;
    misses.push({
      overall: p.overallPick,
      name,
      pos: posRaw,
      espnId: p.playerId,
      reason: r.unresolvedReason,
      headshotFallback: Boolean(r.headshotUrl),
    });
  } else {
    counts[r.matchSource] = (counts[r.matchSource] ?? 0) + 1;
  }

  if (modernNames.has(name)) {
    samples.modern.push({
      name,
      source: r.matchSource,
      sleeper: r.sleeperPlayerId,
      espn: r.espnPlayerId,
      canonical: r.canonicalName,
    });
  }
  if (idpNames.has(name)) {
    samples.idp.push({
      name,
      source: r.matchSource,
      sleeper: r.sleeperPlayerId,
      canonical: r.canonicalName,
      headshot: r.headshotUrl,
    });
  }
  if (name === "Saquon Barkley") {
    const indexed = index.byEspnId.get(String(p.playerId));
    samples.changedTeam.push({
      name,
      source: r.matchSource,
      indexTeam: indexed?.nflTeam ?? null,
      note: "Draft-time team may differ; ESPN id still resolves",
    });
  }
}

for (const def of [
  { sleeperPlayerId: "SF" },
  { sleeperPlayerId: "PHI" },
  { playerName: "San Francisco 49ers", position: "DEF" },
  { playerName: "Philadelphia Eagles", position: "DEF" },
]) {
  const r = resolvePlayerIdentity(def, index);
  samples.def.push({ query: def, source: r.matchSource, sleeper: r.sleeperPlayerId, reason: r.unresolvedReason });
}

const report = {
  artifactVersion: artifact.v,
  contentHash: artifact.contentHash,
  catalogSha256: (metaJson as { catalogSha256?: string }).catalogSha256,
  includedPlayerCount: artifact.includedPlayerCount,
  draft: { season: 2025, pickCount: picks.length },
  counts,
  resolved: `${picks.length - counts.unresolved}/${picks.length}`,
  misses,
  samples,
};

const out = path.join(root, "shared/data/playerIdentity-draft2025-coverage.json");
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log("WROTE", out);
