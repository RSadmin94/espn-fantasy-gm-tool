/**
 * Post-deploy commercial verification — health gitSha + Mark free + Rod founder probes.
 *
 *   $env:QA_COOKIE="Mark free session cookies"
 *   $env:QA_FOUNDER_COOKIE="Rod founder session cookies"
 *   $env:QA_BASE="https://gmwarroom.online"
 *   $env:EXPECTED_SHA="6255cf5"
 *   npx tsx scripts/_commercial_postdeploy_verify.mts
 */
const BASE = process.env.QA_BASE?.replace(/\/$/, "") ?? "https://gmwarroom.online";
const EXPECTED_SHA = (process.env.EXPECTED_SHA ?? "6255cf5").trim();
const MARK_COOKIE = process.env.QA_COOKIE?.trim();
const FOUNDER_COOKIE = process.env.QA_FOUNDER_COOKIE?.trim() ?? process.env.QA_ADMIN_COOKIE?.trim();
const LEAGUE_KEY = process.env.QA_LEAGUE_KEY ?? "457622";
const salt = { activeLeagueKey: LEAGUE_KEY };

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
}

async function trpcGet<T>(path: string, input: Record<string, unknown>, cookie: string): Promise<T> {
  const url = `${BASE}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const res = await fetch(url, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(20000) });
  const body = (await res.json()) as {
    result?: { data?: { json?: T } };
    error?: { json?: { message?: string; data?: { code?: string } } };
  };
  if (body.error) {
    const msg = body.error.json?.message ?? JSON.stringify(body.error);
    throw Object.assign(new Error(msg), { trpcCode: body.error.json?.data?.code ?? "ERROR" });
  }
  return body.result?.data?.json as T;
}

console.log(`\n=== Commercial Post-Deploy Verify ===`);
console.log(`Base: ${BASE}`);
console.log(`Expected gitSha prefix: ${EXPECTED_SHA}\n`);

try {
  const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json()) as {
    status?: string;
    gitSha?: string;
    gitBranch?: string;
  };
  record(
    "Prod health gitSha",
    health.status === "ok" && String(health.gitSha ?? "").startsWith(EXPECTED_SHA),
    `status=${health.status}, gitSha=${health.gitSha}, branch=${health.gitBranch}`,
  );
} catch (e) {
  record("Prod health gitSha", false, String(e));
}

async function markFreeQa() {
  if (!MARK_COOKIE) {
    record("Mark free QA", false, "QA_COOKIE not set — skip");
    return;
  }
  const sub = await trpcGet<{ hasAccess?: boolean; hasRivalsAccess?: boolean; status?: string }>(
    "billing.getSubscriptionStatus",
    {},
    MARK_COOKIE,
  );
  record(
    "Mark — free entitlement",
    sub.hasRivalsAccess === false && sub.hasAccess === false,
    JSON.stringify(sub),
  );

  const scores = await trpcGet<{
    gated?: boolean;
    rivalries?: Array<Record<string, unknown>>;
    lockedRivalries?: number;
  }>("rivalry.getScores", salt, MARK_COOKIE);
  const preview = (scores.rivalries ?? []).filter((r) => r.preview === true);
  const locked = (scores.rivalries ?? []).filter((r) => r.locked === true);
  record(
    "Mark — one rivalry preview, locked rivals",
    scores.gated === true &&
      preview.length === 1 &&
      preview[0]?.h2hWins === undefined &&
      locked.length >= 1,
    `preview=${preview.length}, locked=${locked.length}`,
  );

  const owners = await trpcGet<{
    gated?: boolean;
    active?: Array<Record<string, unknown>>;
    powerRankings?: unknown[];
  }>("owners.ownerList", { expectedLeagueId: LEAGUE_KEY, ...salt }, MARK_COOKIE);
  const previewOwners = (owners.active ?? []).filter((o) => o.preview === true);
  const lockedOwners = (owners.active ?? []).filter((o) => o.locked === true);
  record(
    "Mark — owner list gated",
    owners.gated === true &&
      previewOwners.length === 1 &&
      lockedOwners.length >= 1 &&
      (owners.powerRankings ?? []).length === 0,
    `previewOwners=${previewOwners.length}, lockedOwners=${lockedOwners.length}`,
  );

  const viewerKey = String(previewOwners[0]?.ownerKey ?? "");
  if (viewerKey) {
    const own = await trpcGet<Record<string, unknown>>(
      "owners.ownerProfile",
      { ownerKey: viewerKey, expectedLeagueId: LEAGUE_KEY, ...salt },
      MARK_COOKIE,
    );
    record(
      "Mark — own profile identity shell only",
      own.gated === true &&
        own.ownProfile === true &&
        own.draftDNA == null &&
        own.activityDNA == null &&
        Array.isArray((own.snapshot as { seasonRecords?: unknown[] })?.seasonRecords) &&
        ((own.snapshot as { seasonRecords?: unknown[] }).seasonRecords?.length ?? 0) === 0,
      `draftDNA=${own.draftDNA == null}, activityDNA=${own.activityDNA == null}`,
    );
  }

  const otherKey = String(lockedOwners[0]?.ownerKey ?? "");
  if (otherKey) {
    const other = await trpcGet<Record<string, unknown>>(
      "owners.ownerProfile",
      { ownerKey: otherKey, expectedLeagueId: LEAGUE_KEY, ...salt },
      MARK_COOKIE,
    );
    record(
      "Mark — other owner locked profile",
      other.locked === true && other.snapshot == null && other.draftDNA == null,
      `locked=${other.locked}, snapshot=${other.snapshot}`,
    );
  }

  const story = await trpcGet<{ gated?: boolean; stories?: Array<Record<string, unknown>> }>(
    "rivalryStory.forOwner",
    { focalOwnerKey: viewerKey || "id:unknown", ...salt },
    MARK_COOKIE,
  ).catch(() => ({ gated: true, stories: [] }));
  const s0 = story.stories?.[0];
  record(
    "Mark — no full documentary on free",
    story.gated === true &&
      (s0?.documentaryFacts == null || (Array.isArray(s0.documentaryFacts) && s0.documentaryFacts.length === 0)),
    `gated=${story.gated}, facts=${Array.isArray(s0?.documentaryFacts) ? s0.documentaryFacts.length : "n/a"}`,
  );
}

async function rodFounderQa() {
  if (!FOUNDER_COOKIE) {
    record("Rod founder QA", false, "QA_FOUNDER_COOKIE not set — skip");
    return;
  }
  const sub = await trpcGet<{ hasAccess?: boolean; hasRivalsAccess?: boolean }>(
    "billing.getSubscriptionStatus",
    {},
    FOUNDER_COOKIE,
  );
  record(
    "Rod — founder entitlement",
    sub.hasAccess === true || sub.hasRivalsAccess === true,
    JSON.stringify(sub),
  );

  const scores = await trpcGet<{ gated?: boolean; rivalries?: unknown[] }>(
    "rivalry.getScores",
    salt,
    FOUNDER_COOKIE,
  );
  record(
    "Rod — all rivalries ungated",
    scores.gated !== true && (scores.rivalries?.length ?? 0) > 0,
    `gated=${scores.gated}, count=${scores.rivalries?.length ?? 0}`,
  );

  const owners = await trpcGet<{ gated?: boolean; active?: unknown[]; powerRankings?: unknown[] }>(
    "owners.ownerList",
    { expectedLeagueId: LEAGUE_KEY, ...salt },
    FOUNDER_COOKIE,
  );
  record(
    "Rod — full owner list",
    owners.gated !== true && (owners.active?.length ?? 0) > 0,
    `gated=${owners.gated}, active=${owners.active?.length ?? 0}, rankings=${owners.powerRankings?.length ?? 0}`,
  );

  const firstKey = String((owners.active?.[0] as { ownerKey?: string })?.ownerKey ?? "");
  if (firstKey) {
    const profile = await trpcGet<Record<string, unknown>>(
      "owners.ownerProfile",
      { ownerKey: firstKey, expectedLeagueId: LEAGUE_KEY, ...salt },
      FOUNDER_COOKIE,
    );
    record(
      "Rod — full owner profile",
      profile.gated !== true && profile.draftDNA != null,
      `gated=${profile.gated}, draftDNA=${profile.draftDNA != null}`,
    );
  }
}

await markFreeQa();
await rodFounderQa();

console.log("");
for (const c of checks) {
  console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
  console.log(`       ${c.detail}\n`);
}
const passed = checks.filter((c) => c.pass).length;
console.log(`Summary: ${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
