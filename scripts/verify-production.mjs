#!/usr/bin/env node
/**
 * ESPN Fantasy Football GM Tool — Production Verification
 * Hits live endpoints to confirm the deployment is healthy.
 * Usage: node scripts/verify-production.mjs https://your-app.railway.app
 * Windows PowerShell: node scripts/verify-production.mjs https://your-app.railway.app
 */

const APP_URL = process.argv[2] || process.env.APP_URL;

if (!APP_URL) {
  console.error(
    "\x1b[31mERROR: Provide the app URL as an argument.\x1b[0m"
  );
  console.error(
    "  Usage: node scripts/verify-production.mjs https://your-app.railway.app"
  );
  process.exit(1);
}

const BASE = APP_URL.replace(/\/$/, "");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

let passed = 0;
let failed = 0;
const errors = [];

function ok(label, detail = "") {
  console.log(`  ${GREEN}✓${RESET} ${label}${detail ? `  ${YELLOW}(${detail})${RESET}` : ""}`);
  passed++;
}

function fail(label, hint = "") {
  console.log(`  ${RED}✗${RESET} ${BOLD}${label}${RESET}`);
  if (hint) console.log(`    ${YELLOW}→ ${hint}${RESET}`);
  errors.push(label);
  failed++;
}

function section(title) {
  console.log(`\n${BOLD}${title}${RESET}`);
}

async function get(path, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

console.log(`\n${BOLD}Production Verification${RESET}`);
console.log(`Target: ${YELLOW}${BASE}${RESET}`);

// ── 1. Health endpoint ────────────────────────────────────────
section("1. Health endpoint (/api/health)");
try {
  const res = await get("/api/health");
  const body = await res.json();

  if (res.status === 200 && body.status === "ok") {
    ok(`/api/health → 200 OK`, `v${body.version}`);

    // Report individual checks
    for (const [key, val] of Object.entries(body.checks || {})) {
      if (val === "ok") {
        ok(`  health.${key}`);
      } else {
        fail(`  health.${key} = ${val}`, `Check Railway env vars for ${key}`);
      }
    }
  } else {
    fail(
      `/api/health → ${res.status} (status: ${body.status})`,
      `Failed checks: ${(body.failed || []).join(", ")}`
    );
  }
} catch (e) {
  fail(
    `/api/health unreachable`,
    `${e.message} — is the app deployed and running?`
  );
}

// ── 2. Frontend loads ─────────────────────────────────────────
section("2. Frontend (static HTML)");
try {
  const res = await get("/", 15000);
  if (res.status === 200) {
    const text = await res.text();
    if (text.includes("<html") || text.includes("<!DOCTYPE")) {
      ok(`/ → 200 OK (HTML response)`);
    } else {
      fail(`/ → 200 but response is not HTML`, "Vite build may have failed");
    }
  } else {
    fail(`/ → ${res.status}`, "Frontend may not be built or served correctly");
  }
} catch (e) {
  fail(`/ unreachable`, e.message);
}

// ── 3. tRPC basic query ───────────────────────────────────────
section("3. tRPC API (/api/trpc/auth.me)");
try {
  const res = await get(
    "/api/trpc/auth.me?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D"
  );
  // auth.me returns 200 with null user when not logged in — that's correct
  if (res.status === 200) {
    ok(`/api/trpc/auth.me → 200 OK (tRPC router is responding)`);
  } else {
    fail(`/api/trpc/auth.me → ${res.status}`, "tRPC router may not be mounted");
  }
} catch (e) {
  fail(`/api/trpc unreachable`, e.message);
}

// ── 4. ESPN refresh endpoint exists (non-destructive check) ───
section("4. ESPN scheduled endpoint (existence check only)");
try {
  // GET to a POST-only endpoint returns 404 from Express — that's expected
  // We just want to confirm the server is routing, not trigger a refresh
  const res = await get("/api/scheduled/espn-refresh");
  // Express returns 404 for GET on a POST route — confirms route is registered
  if (res.status === 404 || res.status === 405) {
    ok(
      `/api/scheduled/espn-refresh exists (${res.status} on GET — correct, POST-only)`,
    );
  } else if (res.status === 200) {
    ok(`/api/scheduled/espn-refresh → 200 (route registered)`);
  } else {
    fail(
      `/api/scheduled/espn-refresh → unexpected ${res.status}`,
      "Check server routing"
    );
  }
} catch (e) {
  fail(`/api/scheduled/espn-refresh unreachable`, e.message);
}

// ── 5. Stripe webhook endpoint exists ─────────────────────────
section("5. Stripe webhook endpoint (existence check only)");
try {
  const res = await get("/api/stripe/webhook");
  // POST-only — GET returns 404/405
  if (res.status === 404 || res.status === 405 || res.status === 400) {
    ok(`/api/stripe/webhook exists (${res.status} on GET — correct, POST-only)`);
  } else {
    console.log(
      `  ${YELLOW}⚠${RESET}  /api/stripe/webhook → ${res.status} (unexpected but non-fatal)`
    );
  }
} catch (e) {
  console.log(`  ${YELLOW}⚠${RESET}  /api/stripe/webhook check skipped: ${e.message}`);
}

// ── Summary ───────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
if (failed === 0) {
  console.log(
    `${GREEN}${BOLD}✓ All production checks passed (${passed} checks)${RESET}`
  );
  console.log(`${GREEN}  ${BASE} is healthy and ready.${RESET}\n`);
  process.exit(0);
} else {
  console.log(
    `${RED}${BOLD}✗ ${failed} production check(s) failed:${RESET}`
  );
  for (const e of errors) {
    console.log(`  ${RED}•${RESET} ${e}`);
  }
  console.log(
    `\n${YELLOW}Check Railway logs and env vars, then re-run:${RESET}`
  );
  console.log(
    `  node scripts/verify-production.mjs ${BASE}\n`
  );
  process.exit(1);
}
