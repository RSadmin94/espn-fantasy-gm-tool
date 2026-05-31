/**
 * Seeds every `scripts/draft-data/YYYY.json` (four-digit year) via `seed-draft-history.ts`.
 * Requires `DATABASE_URL` (e.g. Railway) in the environment.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const draftDir = join(__dirname, "draft-data");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const files = readdirSync(draftDir)
  .filter((f) => /^\d{4}\.json$/.test(f))
  .sort();

if (files.length === 0) {
  console.error(`No YYYY.json files found in ${draftDir}`);
  process.exit(1);
}

for (const f of files) {
  const season = f.replace(/\.json$/i, "");
  const filePath = join(draftDir, f);
  console.log(`\n--- Seeding season ${season} (${filePath}) ---\n`);
  execFileSync(
    "pnpm",
    ["exec", "tsx", join("scripts", "seed-draft-history.ts"), season, `--file=${filePath}`],
    { stdio: "inherit", cwd: repoRoot, env: process.env },
  );
}

console.log(`\nDone. Seeded ${files.length} draft file(s).`);
