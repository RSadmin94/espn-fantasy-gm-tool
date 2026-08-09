/**
 * RFSN-053E — Preview founder validation: Historical Story Collections.
 * ESPN 457622 only. Defaults to Preview. No screenshots. No Production.
 *
 *   npx tsx scripts/rfsn-053e-preview-validation.mts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  compileStoryCollectionFilters,
  STORY_COLLECTION_IDS,
  type StoryCollectionId,
} from "../shared/matchupStoryCollections";

const PREVIEW_HOST =
  process.env.RFSN_053E_HOST?.trim() || "sprint-8-preview.fantasyfootballrivals.com";
const BASE = `https://${PREVIEW_HOST}`;
const ESPN_LEAGUE = "457622";
const LABEL = /www\.fantasyfootballrivals\.com/i.test(PREVIEW_HOST) ? "production" : "preview";
const OUT_DIR = path.resolve("audit-artifacts/rfsn-053");
const OUT_MD = path.join(OUT_DIR, `RFSN-053E-${LABEL}-validation.md`);
const OUT_JSON = path.join(OUT_DIR, `RFSN-053E-${LABEL}-validation.json`);
const GAP_MS = 6500;

type Probe = {
  name: string;
  verdict: "PASS" | "FAIL";
  failures: string[];
  sample?: string;
};

type CollectionRow = {
  id: string;
  title?: string;
  badge?: string;
  count?: number;
  empty?: boolean;
  emptyReason?: string | null;
  href?: string;
  filters?: Record<string, unknown>;
};

type GalleryPayload = {
  total?: number;
  empty?: boolean;
  emptyReason?: string | null;
  summary?: string;
  matchups?: Array<{ matchupId?: number; viewerHref?: string; margin?: number }>;
};

type ChatOut = {
  message?: string;
  tool?: string;
  visual?: {
    type?: string;
    collection?: string;
    preset?: string;
    filters?: Record<string, unknown>;
    href?: string;
    result?: GalleryPayload;
  };
  meta?: { intent?: string };
};

async function mintUrl(base: string): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error("CLERK_SECRET_KEY required");
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: process.env.SMOKE_CLERK_USER_ID ?? "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo",
      expires_in_seconds: 300,
    }),
  });
  if (!res.ok) throw new Error(`Clerk mint failed ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { url?: string; token?: string };
  let token = data.token;
  if (!token && data.url) {
    try {
      token = new URL(data.url).searchParams.get("__clerk_ticket") ?? undefined;
    } catch {
      token = undefined;
    }
  }
  if (!token) throw new Error("Clerk mint missing ticket token");
  return `${base}/sign-in?__clerk_ticket=${encodeURIComponent(token)}`;
}

function unwrap(data: unknown): unknown {
  if (data && typeof data === "object" && "result" in data) {
    const r = (data as { result?: { data?: { json?: unknown } } }).result?.data;
    return r && typeof r === "object" && "json" in r ? (r as { json: unknown }).json : r;
  }
  return data;
}

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof import("playwright")["chromium"]["launch"]>>["newPage"]>>;

async function trpcGet(page: Page, pathName: string, input: unknown) {
  return page.evaluate(
    async ({ pathName, input }) => {
      const res = await fetch(
        `/api/trpc/${pathName}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`,
        { credentials: "include" },
      );
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { pathName, input },
  );
}

async function trpcMutate(page: Page, pathName: string, input: unknown) {
  return page.evaluate(
    async ({ pathName, input }) => {
      const res = await fetch(`/api/trpc/${pathName}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { pathName, input },
  );
}

async function chat(page: Page, leagueId: string, message: string): Promise<ChatOut> {
  return page.evaluate(
    async ({ leagueId, message }) => {
      const res = await fetch(`/api/trpc/advisor.chat`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { message, activeLeagueKey: leagueId } }),
      });
      const body = await res.json();
      return (body?.result?.data?.json ?? body?.result?.data ?? body) as ChatOut;
    },
    { leagueId, message },
  );
}

async function clearHistory(page: Page, leagueId: string): Promise<void> {
  await page.evaluate(async ({ leagueId }) => {
    await fetch(`/api/trpc/advisor.clearHistory`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { activeLeagueKey: leagueId } }),
    });
  }, { leagueId });
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY?.trim()) throw new Error("CLERK_SECRET_KEY required");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const probes: Probe[] = [];
  let health: Record<string, unknown> | null = null;
  let lastAt = 0;
  let ownerName = "";

  const waitGap = async () => {
    const elapsed = Date.now() - lastAt;
    if (lastAt > 0 && elapsed < GAP_MS) await page.waitForTimeout(GAP_MS - elapsed);
  };

  const push = (row: Probe) => {
    probes.push(row);
    console.log(
      `${row.verdict} | ${row.name}${row.sample ? `\n  ${row.sample}` : ""}${
        row.failures.length ? `\n  !! ${row.failures.join("; ")}` : ""
      }`,
    );
  };

  try {
    await page.goto(await mintUrl(BASE), { waitUntil: "domcontentloaded", timeout: 90_000 });
    const expectedHost = new URL(BASE).hostname;
    await page.waitForURL(
      (url) => url.hostname === expectedHost && !url.pathname.includes("sign-in"),
      { timeout: 90_000 },
    );
    await page.waitForTimeout(2000);

    health = (await page.evaluate(async () => {
      const res = await fetch("/api/health", { credentials: "include" });
      return res.json();
    })) as Record<string, unknown>;
    console.log(
      `host=${new URL(page.url()).hostname} health buildTime=${String(health?.buildTime ?? "?")} gitSha=${String(health?.gitSha ?? "?").slice(0, 12)}`,
    );

    type LiveLeague = { id: number; provider: string; leagueId: string; selectedOwnerName?: string | null };
    const connections = unwrap(
      (
        await trpcGet(page, "league.getMyLeagues", null)
      ).body,
    ) as LiveLeague[];
    const espn = (connections ?? []).find((l) => l.provider === "espn" && l.leagueId === ESPN_LEAGUE);
    if (!espn) throw new Error("ESPN 457622 not connected on Preview founder account");
    ownerName = espn.selectedOwnerName?.trim() || "";
    await trpcMutate(page, "league.setActive", { leagueConnectionId: espn.id });
    await page.waitForTimeout(800);

    const collectionsRes = await trpcGet(page, "matchupGallery.collections", {
      ownerName: ownerName || undefined,
    });
    const collections = (unwrap(collectionsRes.body) as CollectionRow[]) ?? [];
    const missing = STORY_COLLECTION_IDS.filter((id) => !collections.some((c) => c.id === id));
    push({
      name: "collections catalog",
      verdict: collectionsRes.status === 200 && missing.length === 0 ? "PASS" : "FAIL",
      failures: [
        ...(collectionsRes.status !== 200 ? [`http ${collectionsRes.status}`] : []),
        ...(missing.length ? [`missing ${missing.join(", ")}`] : []),
      ],
      sample: collections.map((c) => `${c.id}:${c.count}`).join(", "),
    });

    for (const id of STORY_COLLECTION_IDS as readonly StoryCollectionId[]) {
      const row = collections.find((c) => c.id === id);
      const compiled = compileStoryCollectionFilters(id, {
        ownerName: ownerName || (id === "blood-rival" ? "Rod Sellers" : undefined),
        opponentName: id === "blood-rival" ? "Bruce Edwards" : undefined,
      });
      const queryRes = await trpcGet(page, "matchupGallery.query", compiled);
      const g = (unwrap(queryRes.body) as GalleryPayload) ?? {};
      const failures: string[] = [];
      if (queryRes.status !== 200) failures.push(`query http ${queryRes.status}`);
      if (!row) failures.push("collection row missing");
      if (id === "blood-rival") {
        const h2h = await trpcGet(page, "matchupGallery.query", compiled);
        const h2hG = (unwrap(h2h.body) as GalleryPayload) ?? {};
        if ((h2hG.total ?? -1) < 1) failures.push("Rod vs Bruce H2H empty");
      } else if (row && (row.count ?? -1) !== (g.total ?? -2)) {
        failures.push(`count ${row.count} != query ${g.total}`);
      }
      if (id === "championship" && g.emptyReason && g.emptyReason !== "insufficient_playoff_tier" && g.emptyReason !== "no_matching_games") {
        failures.push(`champ emptyReason=${g.emptyReason}`);
      }
      if (id === "championship" && (g.matchups?.length ?? 0) > 0 && g.emptyReason === "insufficient_playoff_tier") {
        failures.push("invented championship games");
      }
      push({
        name: `count ${id}`,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        sample: `collection=${row?.count ?? "?"} query=${g.total ?? "?"} empty=${g.emptyReason ?? "none"}`,
      });
    }

    await page.goto(`${BASE}/league/history/matchups`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-story-collections]", { timeout: 45_000 }).catch(() => null);
    const homeOk = Boolean(await page.$("[data-story-collections]"));
    const cardCount = await page.$$eval("[data-story-collection-card]", (els) => els.length).catch(() => 0);
    push({
      name: "gallery home Story Collections",
      verdict: homeOk && cardCount === STORY_COLLECTION_IDS.length ? "PASS" : "FAIL",
      failures: [
        ...(!homeOk ? ["missing data-story-collections"] : []),
        ...(cardCount !== STORY_COLLECTION_IDS.length ? [`cards=${cardCount}`] : []),
      ],
      sample: `cards=${cardCount}`,
    });

    const clickIds: StoryCollectionId[] = [
      "no-mercy",
      "heartbreak",
      "championship",
      "blood-rival",
      "closest-calls",
      "statement-wins",
      "cashier",
    ];
    for (const id of clickIds) {
      const href =
        id === "blood-rival"
          ? `/league/history/matchups/c/blood-rival?ownerName=${encodeURIComponent(ownerName || "Rod Sellers")}&opponentName=${encodeURIComponent("Bruce Edwards")}`
          : `/league/history/matchups/c/${id}`;
      await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector(`[data-story-collection='${id}']`, { timeout: 30_000 }).catch(() => null);
      const header = Boolean(await page.$(`[data-story-collection='${id}']`));
      const gallery = Boolean(await page.$("[data-matchup-gallery]"));
      const emptyState = Boolean(await page.$("[data-gallery-empty]"));
      const failures: string[] = [];
      if (!header) failures.push("missing collection header");
      if (!gallery && !emptyState) failures.push("missing gallery");
      if (id === "championship" && !emptyState && !gallery) failures.push("championship surface missing");
      push({
        name: `open ${id}`,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        sample: page.url().replace(BASE, ""),
      });
    }

    await page.goto(`${BASE}/league/history/matchups/c/no-mercy`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-matchup-card]", { timeout: 30_000 }).catch(() => null);
    const viewHref = await page.$eval("[data-matchup-card] a[href*='/league/history/matchups/']", (a) =>
      (a as HTMLAnchorElement).getAttribute("href"),
    ).catch(() => null);
    if (viewHref) {
      await page.goto(`${BASE}${viewHref}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector("[data-matchup-viewer]", { timeout: 30_000 }).catch(() => null);
      const viewer = Boolean(await page.$("[data-matchup-viewer]"));
      const badge = Boolean(await page.$("[data-collection-badge], [data-collection-theme]"));
      push({
        name: "viewer collection badge",
        verdict: viewer && badge ? "PASS" : "FAIL",
        failures: [...(!viewer ? ["missing viewer"] : []), ...(!badge ? ["missing collection badge/theme"] : [])],
        sample: viewHref,
      });
    } else {
      push({
        name: "viewer collection badge",
        verdict: "FAIL",
        failures: ["no View Matchup link on No Mercy gallery"],
      });
    }

    await clearHistory(page, ESPN_LEAGUE);
    const advisorQs: Array<{ name: string; q: string; collection: string }> = [
      { name: "Advisor No Mercy", q: "Show me my No Mercy games", collection: "no-mercy" },
      { name: "Advisor Heartbreak", q: "Show my Heartbreak games", collection: "heartbreak" },
      { name: "Advisor Blood Rival", q: "Show Rod vs Bruce", collection: "blood-rival" },
    ];
    for (const row of advisorQs) {
      await waitGap();
      const out = await chat(page, ESPN_LEAGUE, row.q);
      lastAt = Date.now();
      const failures: string[] = [];
      if (out.tool !== "query_matchup_gallery") failures.push(`tool=${out.tool ?? "none"}`);
      if (out.visual?.type !== "matchup_gallery") failures.push("missing visual");
      if (out.visual?.collection !== row.collection) failures.push(`collection=${out.visual?.collection ?? "none"}`);
      if (!out.visual?.href?.includes(`/league/history/matchups/c/${row.collection}`)) {
        failures.push(`href=${out.visual?.href ?? "none"}`);
      }
      push({
        name: row.name,
        verdict: failures.length ? "FAIL" : "PASS",
        failures,
        sample: String(out.message ?? "").replace(/\s+/g, " ").slice(0, 240),
      });
    }

    await waitGap();
    const follow = await chat(page, ESPN_LEAGUE, "Now only 2018.");
    lastAt = Date.now();
    const followFail: string[] = [];
    if (follow.visual?.type !== "matchup_gallery") followFail.push("follow-up lost gallery");
    const season =
      follow.visual?.filters?.season ?? follow.visual?.filters?.seasonFrom ?? follow.visual?.result?.filter;
    const seasonOk =
      follow.visual?.filters?.season === 2018 ||
      follow.visual?.filters?.seasonFrom === 2018 ||
      (follow.visual?.result as { filter?: { seasonFrom?: number } } | undefined)?.filter?.seasonFrom === 2018;
    if (!seasonOk) followFail.push(`season not 2018 (${JSON.stringify(season)})`);
    push({
      name: "Advisor follow-up 2018",
      verdict: followFail.length ? "FAIL" : "PASS",
      failures: followFail,
      sample: String(follow.message ?? "").replace(/\s+/g, " ").slice(0, 240),
    });
  } finally {
    await browser.close();
  }

  const passed = probes.filter((p) => p.verdict === "PASS").length;
  const failed = probes.filter((p) => p.verdict === "FAIL").length;
  const md = [
    `# RFSN-053E ${LABEL} validation`,
    "",
    `- Host: ${BASE}`,
    `- League: ESPN ${ESPN_LEAGUE}`,
    `- buildTime: ${String(health?.buildTime ?? "?")}`,
    `- Result: **${passed}/${probes.length}** (${failed} fail)`,
    "",
    "| Probe | Verdict | Notes |",
    "| --- | --- | --- |",
    ...probes.map(
      (p) =>
        `| ${p.name} | ${p.verdict} | ${(p.failures.join("; ") || p.sample || "").replace(/\|/g, "/").slice(0, 180)} |`,
    ),
    "",
  ].join("\n");
  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify({ label: LABEL, host: BASE, health, passed, failed, probes }, null, 2),
  );
  console.log(`\n${passed}/${probes.length} PASS → ${OUT_MD}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
