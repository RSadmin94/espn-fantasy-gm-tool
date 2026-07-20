/**
 * Offline generator: fetch Sleeper NFL catalog once → write compact lookup artifact.
 *
 * Usage:
 *   npx tsx scripts/generateSleeperPlayerLookup.mts
 *   npx tsx scripts/generateSleeperPlayerLookup.mts --from-fixture path/to/fixture.json
 *   npx tsx scripts/generateSleeperPlayerLookup.mts --catalog-cache path/to/cache.json
 *
 * Never call this from the bookmarklet or client runtime.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCompactLookupFromCatalog,
  type SleeperCatalogRowLike,
} from "../shared/playerIdentity";

const SLEEPER_URL = "https://api.sleeper.app/v1/players/nfl";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "shared", "data", "sleeperPlayerLookup.compact.json");
const metaPath = path.join(root, "shared", "data", "sleeperPlayerLookup.meta.json");
const defaultCachePath = path.join(root, "shared", "data", ".sleeperNflCatalog.cache.json");

/** Soft budget — keep bookmarklet embed practical. */
const MAX_ARTIFACT_BYTES = 120_000;

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

async function loadCatalog(): Promise<{
  catalog: Record<string, SleeperCatalogRowLike>;
  catalogSha256: string;
  catalogBytes: number;
  loadedFrom: string;
}> {
  const fixturePath = argValue("--from-fixture");
  const cachePath = argValue("--catalog-cache") ?? defaultCachePath;

  if (fixturePath) {
    const raw = fs.readFileSync(path.resolve(fixturePath), "utf8");
    const catalog = JSON.parse(raw) as Record<string, SleeperCatalogRowLike>;
    return {
      catalog,
      catalogSha256: crypto.createHash("sha256").update(raw).digest("hex"),
      catalogBytes: Buffer.byteLength(raw, "utf8"),
      loadedFrom: path.resolve(fixturePath),
    };
  }

  // Prefer explicit cache for deterministic double-runs; otherwise fetch once and cache.
  if (process.argv.includes("--use-cache") && fs.existsSync(cachePath)) {
    const raw = fs.readFileSync(cachePath, "utf8");
    const catalog = JSON.parse(raw) as Record<string, SleeperCatalogRowLike>;
    return {
      catalog,
      catalogSha256: crypto.createHash("sha256").update(raw).digest("hex"),
      catalogBytes: Buffer.byteLength(raw, "utf8"),
      loadedFrom: cachePath,
    };
  }

  const resp = await fetch(SLEEPER_URL, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`sleeper_fetch_${resp.status}`);
  const catalog = (await resp.json()) as Record<string, SleeperCatalogRowLike>;
  // Stable stringify for hashing/caching (sorted keys at top level only).
  const keys = Object.keys(catalog).sort();
  const stable: Record<string, SleeperCatalogRowLike> = {};
  for (const k of keys) stable[k] = catalog[k]!;
  const raw = JSON.stringify(stable);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, raw, "utf8");
  return {
    catalog: stable,
    catalogSha256: crypto.createHash("sha256").update(raw).digest("hex"),
    catalogBytes: Buffer.byteLength(raw, "utf8"),
    loadedFrom: "sleeper:v1/players/nfl+cache",
  };
}

async function main(): Promise<void> {
  const { catalog, catalogSha256, catalogBytes, loadedFrom } = await loadCatalog();
  const artifact = buildCompactLookupFromCatalog(catalog);
  // No trailing fields that vary — single-line JSON + newline for git friendliness.
  const json = `${JSON.stringify(artifact)}\n`;
  const bytes = Buffer.byteLength(json, "utf8");
  const artifactSha256 = crypto.createHash("sha256").update(json).digest("hex");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, json, "utf8");

  const meta = {
    builtAt: new Date().toISOString(),
    artifactVersion: artifact.v,
    source: artifact.source,
    sourcePlayerCount: artifact.sourcePlayerCount,
    includedPlayerCount: artifact.includedPlayerCount,
    contentHash: artifact.contentHash,
    artifactBytes: bytes,
    artifactSha256,
    catalogSha256,
    catalogBytes,
    catalogLoadedFrom: loadedFrom,
    maxArtifactBytes: MAX_ARTIFACT_BYTES,
    withinBudget: bytes <= MAX_ARTIFACT_BYTES,
    outPath: path.relative(root, outPath).replace(/\\/g, "/"),
  };
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  console.log("[player-identity] wrote", meta.outPath);
  console.log(
    `[player-identity] source=${artifact.sourcePlayerCount} included=${artifact.includedPlayerCount} bytes=${bytes}`,
  );
  console.log(`[player-identity] artifactSha256=${artifactSha256}`);
  console.log(`[player-identity] catalogSha256=${catalogSha256}`);
  console.log(`[player-identity] contentHash=${artifact.contentHash}`);
  if (bytes > MAX_ARTIFACT_BYTES) {
    console.warn(
      `[player-identity] WARNING: artifact ${bytes} bytes exceeds budget ${MAX_ARTIFACT_BYTES}`,
    );
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error("[player-identity] failed:", err);
  process.exit(1);
});
