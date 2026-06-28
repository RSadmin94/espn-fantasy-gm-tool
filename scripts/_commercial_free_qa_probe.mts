/**
 * Free-account commercial QA — read-only tRPC probes (authenticated).
 *
 * YOU run this after logging in as a genuine free user (not founder whitelist).
 *
 * Setup:
 *   1. Sign in at https://gmwarroom.online as your FREE test account.
 *   2. DevTools → Application → Cookies → copy the full Cookie header value
 *      (must include __session / Clerk session cookies for gmwarroom.online).
 *   3. Optional: set LEAGUE_KEY to your activeLeagueKey (default: connected league salt).
 *
 * Usage (PowerShell):
 *   $env:QA_COOKIE="paste cookie header here"
 *   $env:QA_BASE="https://gmwarroom.online"
 *   npx tsx scripts/_commercial_free_qa_probe.mts
 *
 * Does NOT use Stripe keys. Read-only queries + one checkout-session create (returns URL only).
 */
const BASE = process.env.QA_BASE?.replace(/\/$/, "") ?? "https://gmwarroom.online";
const COOKIE = process.env.QA_COOKIE?.trim();
const LEAGUE_KEY = process.env.QA_LEAGUE_KEY ?? "457622";
const SEASON = Number(process.env.QA_SEASON ?? new Date().getFullYear());

if (!COOKIE) {
  console.error("Set QA_COOKIE to your authenticated session cookie string.");
  process.exit(1);
}

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
}

async function trpcGet<T>(path: string, input: Record<string, unknown>): Promise<T> {
  const url = `${BASE}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const res = await fetch(url, { headers: { Cookie: COOKIE! } });
  const body = (await res.json()) as {
    result?: { data?: { json?: T } };
    error?: { json?: { message?: string; code?: string; data?: { code?: string } } };
  };
  if (body.error) {
    const msg = body.error.json?.message ?? JSON.stringify(body.error);
    const code = body.error.json?.data?.code ?? body.error.json?.code ?? "ERROR";
    throw Object.assign(new Error(msg), { trpcCode: code, httpStatus: res.status });
  }
  return body.result?.data?.json as T;
}

async function trpcPost<T>(path: string, input: Record<string, unknown>): Promise<T> {
  const url = `${BASE}/api/trpc/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Cookie: COOKIE!, "Content-Type": "application/json" },
    body: JSON.stringify({ json: input }),
  });
  const body = (await res.json()) as {
    result?: { data?: { json?: T } };
    error?: { json?: { message?: string; data?: { code?: string } } };
  };
  if (body.error) {
    const msg = body.error.json?.message ?? JSON.stringify(body.error);
    const code = body.error.json?.data?.code ?? "ERROR";
    throw Object.assign(new Error(msg), { trpcCode: code, httpStatus: res.status });
  }
  return body.result?.data?.json as T;
}

const salt = { activeLeagueKey: LEAGUE_KEY };

console.log(`\n=== Free Commercial QA Probe ===`);
console.log(`Base: ${BASE}`);
console.log(`League salt: ${LEAGUE_KEY}\n`);

// ── 0. Confirm free entitlement ─────────────────────────────────────────────
try {
  const sub = await trpcGet<{
    hasAccess?: boolean;
    hasRivalsAccess?: boolean;
    status?: string;
    plan?: string | null;
  }>("billing.getSubscriptionStatus", {});
  const isFree =
    sub.hasRivalsAccess === false &&
    sub.hasAccess === false &&
    (sub.status === "free" || sub.status === "canceled" || sub.status === "trialing");
  record(
    "Pre-check — account is free (not entitled)",
    isFree,
    JSON.stringify(sub),
  );
  if (!isFree) {
    console.warn("WARNING: Account appears entitled — use a non-founder free test user.\n");
  }
} catch (e) {
  record("Pre-check — account is free", false, String(e));
}

// ── 1. Rivalry wall ─────────────────────────────────────────────────────────
try {
  const scores = await trpcGet<{
    gated?: boolean;
    entitled?: boolean;
    rivalries?: Array<Record<string, unknown>>;
    totalRivalries?: number;
    lockedRivalries?: number;
  }>("rivalry.getScores", salt);
  const rivals = scores.rivalries ?? [];
  const preview = rivals.filter((r) => r.preview === true);
  const locked = rivals.filter((r) => r.locked === true);
  const lockedHaveNames = locked.every((r) => typeof r.rivalName === "string" && r.rivalName.length > 0);
  const previewHasNoH2H =
    preview.length === 1 &&
    preview[0]?.h2hWins === undefined &&
    preview[0]?.playoffEliminations === undefined;
  record(
    "Rivalry wall — one preview + locked named stubs",
    scores.gated === true &&
      preview.length === 1 &&
      locked.length === (scores.lockedRivalries ?? 0) &&
      locked.length >= 1 &&
      lockedHaveNames &&
      previewHasNoH2H &&
      (scores.totalRivalries ?? 0) === rivals.length,
    `total=${scores.totalRivalries}, preview=${preview.length}, locked=${locked.length}, names=${locked.map((r) => r.rivalName).join(", ")}`,
  );
} catch (e) {
  record("Rivalry wall", false, String(e));
}

// ── 2. Draft War Room — 403 ─────────────────────────────────────────────────
try {
  await trpcGet("draftWarRoom.getDraftWarRoomData", { season: SEASON, ...salt });
  record("Draft War Room — FORBIDDEN for free", false, "Expected 403 but got data");
} catch (e: unknown) {
  const code = (e as { trpcCode?: string }).trpcCode;
  record(
    "Draft War Room — FORBIDDEN for free",
    code === "FORBIDDEN",
    `code=${code}, message=${(e as Error).message}`,
  );
}

// ── 3. Deep Records ─────────────────────────────────────────────────────────
try {
  const records = await trpcGet<{
    gated?: boolean;
    owners?: Array<Record<string, unknown>>;
  }>("espn.ownerAllTimeRecords", salt);
  const owners = records.owners ?? [];
  const noWl = owners.every(
    (o) => o.wins === undefined && o.losses === undefined && o.gamesPlayed === undefined,
  );
  const allLocked = owners.every((o) => o.locked === true);
  record(
    "Deep Records — locked stubs, no W-L in body",
    records.gated === true && owners.length > 0 && noWl && allLocked,
    `gated=${records.gated}, owners=${owners.length}, sample=${JSON.stringify(owners[0] ?? {})}`,
  );
} catch (e) {
  record("Deep Records", false, String(e));
}

// ── 4. Dynasty Rankings ─────────────────────────────────────────────────────
try {
  const dynasty = await trpcGet<{
    gated?: boolean;
    teams?: Array<Record<string, unknown>>;
    lockedTeamCount?: number;
  }>("dynasty.powerRankings", { season: SEASON, ...salt });
  const teams = dynasty.teams ?? [];
  const noScores = teams.every(
    (t) => t.nowScore === undefined && t.laterScore === undefined && t.percentileNow === undefined,
  );
  const allLocked = teams.length === 0 || teams.every((t) => t.locked === true);
  record(
    "Dynasty — locked stubs, no scores in body",
    dynasty.gated === true && allLocked && noScores,
    `gated=${dynasty.gated}, teams=${teams.length}, sample=${JSON.stringify(teams[0] ?? {})}`,
  );
} catch (e) {
  record("Dynasty Rankings", false, String(e));
}

// ── 5. Free DNA ───────────────────────────────────────────────────────────────
try {
  const dna = await trpcGet<{
    gated?: boolean;
    primaryTrait?: unknown;
    blindSpot?: unknown;
    blindSpots?: unknown;
    draftDna?: unknown;
    tradeDna?: unknown;
  }>("dna.myProfile", {});
  record(
    "Free DNA — traits nulled, dossier nulled",
    dna.gated === true &&
      (dna.primaryTrait == null) &&
      (dna.blindSpot == null) &&
      (dna.blindSpots == null) &&
      dna.draftDna == null &&
      dna.tradeDna == null,
    `gated=${dna.gated}, primaryTrait=${dna.primaryTrait}, blindSpot=${dna.blindSpot}`,
  );
} catch (e) {
  record("Free DNA", false, String(e));
}

// ── 6. Checkout defaults Rivals annual ────────────────────────────────────────
try {
  const checkout = await trpcPost<{ url?: string }>("billing.createCheckoutSession", {
    origin: BASE,
    plan: "rivals",
    interval: "year",
  });
  const ok = typeof checkout.url === "string" && checkout.url.includes("checkout.stripe.com");
  record(
    "Checkout — Rivals annual session URL returned",
    ok,
    ok ? checkout.url!.slice(0, 80) + "…" : JSON.stringify(checkout),
  );
  if (ok) {
    console.log("\nOpen checkout URL in browser to inspect Stripe line item ($59.99/yr):\n", checkout.url);
  }
} catch (e) {
  record("Checkout — Rivals annual", false, String(e));
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log("");
for (const c of checks) {
  console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
  console.log(`       ${c.detail}\n`);
}
const passed = checks.filter((c) => c.pass).length;
console.log(`Summary: ${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
