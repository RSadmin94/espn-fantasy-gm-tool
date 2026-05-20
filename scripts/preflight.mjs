#!/usr/bin/env node
/**
 * ESPN Fantasy Football GM Tool — Deployment Preflight
 * Run before every build/deploy. Fails fast with plain-English messages.
 * Usage: node scripts/preflight.mjs
 * Windows PowerShell: node scripts/preflight.mjs
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

let passed = 0;
let failed = 0;
const errors = [];

function ok(label) {
  console.log(`  ${GREEN}✓${RESET} ${label}`);
  passed++;
}

function fail(label, hint) {
  console.log(`  ${RED}✗${RESET} ${BOLD}${label}${RESET}`);
  if (hint) console.log(`    ${YELLOW}→ ${hint}${RESET}`);
  errors.push(label);
  failed++;
}

function section(title) {
  console.log(`\n${BOLD}${title}${RESET}`);
}

// ── 1. Node version ───────────────────────────────────────────
section("1. Node.js version");
const nodeVersion = process.versions.node;
const [major] = nodeVersion.split(".").map(Number);
if (major >= 18) {
  ok(`Node.js ${nodeVersion} (>= 18 required)`);
} else {
  fail(
    `Node.js ${nodeVersion} is too old`,
    "Install Node.js 18 or later: https://nodejs.org"
  );
}

// ── 2. Package manager ────────────────────────────────────────
section("2. Package manager");
try {
  const pnpmVersion = execSync("pnpm --version", { encoding: "utf8" }).trim();
  ok(`pnpm ${pnpmVersion}`);
} catch {
  fail(
    "pnpm not found",
    "Install pnpm: npm install -g pnpm  (or: corepack enable)"
  );
}

// ── 3. Required environment variables ─────────────────────────
section("3. Required environment variables");

const REQUIRED_VARS = [
  {
    key: "DATABASE_URL",
    hint: "MySQL connection string — get from Railway MySQL plugin",
  },
  {
    key: "JWT_SECRET",
    hint: 'Random 64-char hex: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  },
  {
    key: "ANTHROPIC_API_KEY",
    hint: "Get from https://console.anthropic.com — powers all AI features",
  },
  {
    key: "ESPN_LEAGUE_ID",
    hint: "Number in your ESPN league URL: fantasy.espn.com/football/league?leagueId=XXXXX",
  },
  {
    key: "ESPN_S2",
    hint: "ESPN auth cookie — DevTools > Application > Cookies > espn_s2",
  },
  {
    key: "ESPN_SWID",
    hint: "ESPN auth cookie — DevTools > Application > Cookies > SWID",
  },
  {
    key: "CREDENTIAL_ENCRYPTION_KEY",
    hint: 'AES-256 key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  },
];

for (const { key, hint } of REQUIRED_VARS) {
  if (process.env[key]) {
    ok(`${key} is set`);
  } else {
    fail(`${key} is missing`, hint);
  }
}

// ── 4. Optional but recommended env vars ──────────────────────
section("4. Optional environment variables (warnings only)");

const OPTIONAL_VARS = [
  { key: "STRIPE_SECRET_KEY", note: "Stripe payments will be disabled" },
  { key: "THE_ODDS_API_KEY", note: "Vegas odds features will be disabled" },
];

for (const { key, note } of OPTIONAL_VARS) {
  if (process.env[key]) {
    ok(`${key} is set`);
  } else {
    console.log(`  ${YELLOW}⚠${RESET}  ${key} not set — ${note}`);
  }
}

// ── 5. Migration files ────────────────────────────────────────
section("5. Migration files");

const MIGRATIONS = [
  "drizzle/migrations/0001_drop_leagueId_from_espn_view_health.sql",
  "drizzle/migrations/0002_espn_view_health_unique_season_view.sql",
  "drizzle/migrations/0003_fantasy_data_cache_tables.sql",
];

for (const migration of MIGRATIONS) {
  const fullPath = resolve(ROOT, migration);
  if (existsSync(fullPath)) {
    ok(migration);
  } else {
    fail(`${migration} is missing`, "Run: git pull — migration files must be committed");
  }
}

// ── 6. Key source files ───────────────────────────────────────
section("6. Key source files");

const KEY_FILES = [
  "server/_core/index.ts",
  "server/_core/env.ts",
  "server/routers.ts",
  "server/db.ts",
  "server/espnService.ts",
  "server/runMigrations.ts",
  "drizzle/schema.ts",
  "drizzle.config.ts",
  "package.json",
];

for (const file of KEY_FILES) {
  const fullPath = resolve(ROOT, file);
  if (existsSync(fullPath)) {
    ok(file);
  } else {
    fail(`${file} is missing`, "Run: git pull — this file must exist");
  }
}

// ── 7. Build check (skipped in CI if BUILD_SKIP=1) ────────────
section("7. Build check");

if (process.env.BUILD_SKIP === "1") {
  console.log(`  ${YELLOW}⚠${RESET}  Build check skipped (BUILD_SKIP=1)`);
} else {
  try {
    console.log("  Running pnpm build (this may take 30-60s)...");
    execSync("pnpm build", {
      cwd: ROOT,
      stdio: "pipe",
      encoding: "utf8",
    });
    ok("pnpm build succeeded");
  } catch (e) {
    const output = (e.stdout || "") + (e.stderr || "");
    fail(
      "pnpm build failed",
      "Fix TypeScript/build errors above, then re-run preflight"
    );
    console.log(`\n${RED}Build output:${RESET}\n${output.slice(-2000)}`);
  }
}

// ── Summary ───────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
if (failed === 0) {
  console.log(
    `${GREEN}${BOLD}✓ All preflight checks passed (${passed} checks)${RESET}`
  );
  console.log(`${GREEN}  Ready to deploy to Railway.${RESET}\n`);
  process.exit(0);
} else {
  console.log(
    `${RED}${BOLD}✗ ${failed} preflight check(s) failed:${RESET}`
  );
  for (const e of errors) {
    console.log(`  ${RED}•${RESET} ${e}`);
  }
  console.log(
    `\n${YELLOW}Fix the issues above, then re-run: node scripts/preflight.mjs${RESET}\n`
  );
  process.exit(1);
}
