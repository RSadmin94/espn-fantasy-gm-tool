/**
 * RFSN-056A — live Preview audit: ESPN txs vs meaningful filter vs grouping.
 *
 *   npx tsx scripts/rfsn-056a-transaction-audit.mts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  clusterIsExecuted,
  summarizeTradePipeline,
  tradeClusterKey,
  tradePartyTeamIds,
} from "../shared/transactionDisplay";

const PREVIEW_HOST =
  process.env.RFSN_056A_HOST?.trim() || "sprint-8-preview.fantasyfootballrivals.com";
const BASE = `https://${PREVIEW_HOST}`;
const ESPN_LEAGUE = "457622";
const SEASON = 2026;
const OUT_DIR = path.resolve("audit-artifacts/rfsn-056a");

type TxnRow = {
  type?: string;
  transactionId?: string;
  relatedTransactionId?: string;
  playerId?: number | null;
  playerName?: string | null;
  position?: string | null;
  teamId?: number | null;
  fromTeamId?: number | null;
  toTeamId?: number | null;
  proposedDate?: number | null;
  processedDate?: number | null;
  status?: string | null;
  itemType?: string | null;
  overallPickNumber?: number | null;
  round?: number | null;
  pickInRound?: number | null;
  rawTransaction?: string | null;
  executionType?: string | null;
  _source?: string;
};

function isTradeType(type: string | undefined): boolean {
  const t = (type || "").toUpperCase();
  return t === "TRADE" || t.startsWith("TRADE_");
}

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

async function main() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await page.goto(await mintUrl(BASE), { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForURL(
      (url) => url.hostname === PREVIEW_HOST && !url.pathname.includes("sign-in"),
      { timeout: 90_000 },
    );
    await page.waitForTimeout(2500);

    const connections = (await page.evaluate(async () => {
      const res = await fetch(
        `/api/trpc/league.getMyLeagues?input=${encodeURIComponent(JSON.stringify({ json: null }))}`,
        { credentials: "include" },
      );
      const body = await res.json();
      return body?.result?.data?.json ?? body?.result?.data ?? [];
    })) as Array<{ id: number; provider: string; leagueId: string }>;
    const espn = connections.find((l) => l.provider === "espn" && l.leagueId === ESPN_LEAGUE);
    if (!espn) throw new Error("ESPN 457622 not connected");

    await page.evaluate(async ({ id }) => {
      const res = await fetch(`/api/trpc/league.setActive`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { leagueConnectionId: id } }),
      });
      const body = await res.json();
      if (body?.error) throw new Error(JSON.stringify(body.error));
    }, { id: espn.id });
    await page.waitForTimeout(600);

    const txs = (await page.evaluate(async ({ season }) => {
      const res = await fetch(
        `/api/trpc/espn.transactions?input=${encodeURIComponent(JSON.stringify({ json: { season } }))}`,
        { credentials: "include" },
      );
      const body = await res.json();
      return body?.result?.data?.json ?? body?.result?.data ?? [];
    }, { season: SEASON })) as TxnRow[];

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const r of txs) {
      const t = String(r.type || "UNKNOWN");
      byType[t] = (byType[t] || 0) + 1;
      const st = String(r.status || "(null)").toUpperCase();
      byStatus[st] = (byStatus[st] || 0) + 1;
    }

    const tradeRows = txs.filter((r) => isTradeType(r.type));
    const allSummary = summarizeTradePipeline(tradeRows, "ALL");
    const executedSummary = summarizeTradePipeline(tradeRows, "EXECUTED");
    const buckets = new Map<string, TxnRow[]>();
    for (const r of tradeRows) {
      const k = tradeClusterKey(r) || "(empty)";
      const arr = buckets.get(k) ?? [];
      arr.push(r);
      buckets.set(k, arr);
    }

    const clusters = [...buckets.entries()].map(([key, rows]) => {
      const types = [...new Set(rows.map((r) => String(r.type)))];
      const statuses = [...new Set(rows.map((r) => String(r.status ?? "")))];
      const execTypes = [...new Set(rows.map((r) => String(r.executionType ?? "")))];
      const sources = [...new Set(rows.map((r) => String(r._source ?? "")))];
      const relIds = [...new Set(rows.map((r) => String(r.relatedTransactionId ?? "")))];
      const txIds = [...new Set(rows.map((r) => String(r.transactionId ?? "")))];
      const evald = allSummary.kept.concat(allSummary.filtered).find((c) => c.key === key);
      return {
        key,
        rowCount: rows.length,
        types,
        statuses,
        execTypes,
        sources,
        relIds,
        txIds,
        teams: tradePartyTeamIds(rows),
        assetRows: evald?.assetCount ?? 0,
        sampleNames: rows.map((r) => r.playerName).filter(Boolean).slice(0, 6),
        ok: evald?.ok ?? false,
        reason: evald?.reason ?? "unknown",
        executed: clusterIsExecuted(rows),
      };
    });

    const kept = clusters.filter((c) => c.ok);
    const dropped = clusters.filter((c) => !c.ok);

    const summary = {
      host: BASE,
      leagueId: ESPN_LEAGUE,
      season: SEASON,
      rawRowCount: txs.length,
      tradeRowCount: tradeRows.length,
      byType,
      byStatus,
      clusterCount: clusters.length,
      displayedMeaningfulTrades: kept.length,
      filteredTradeClusters: dropped.length,
      executedFilter: {
        displayed: executedSummary.displayedTrades,
        executedClusters: executedSummary.executedClusters,
        kept: executedSummary.kept,
        filtered: executedSummary.filtered,
      },
      missingVsClusters: Math.max(0, clusters.length - kept.length),
      kept,
      dropped,
      sampleNonTrade: txs.filter((r) => !isTradeType(r.type)).slice(0, 8),
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const outName = PREVIEW_HOST.includes("fantasyfootballrivals.com") && !PREVIEW_HOST.startsWith("sprint-8-preview")
      ? "RFSN-056A-production-validation.json"
      : "RFSN-056A-preview-audit.json";
    fs.writeFileSync(path.join(OUT_DIR, outName), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({
      rawRowCount: summary.rawRowCount,
      tradeRowCount: summary.tradeRowCount,
      byType: summary.byType,
      byStatus: summary.byStatus,
      clusterCount: summary.clusterCount,
      displayedMeaningfulTrades: summary.displayedMeaningfulTrades,
      filteredTradeClusters: summary.filteredTradeClusters,
      executedFilterDisplayed: executedSummary.displayedTrades,
      executedClusters: executedSummary.executedClusters,
      droppedReasons: dropped.reduce<Record<string, number>>((acc, c) => {
        acc[c.reason] = (acc[c.reason] || 0) + 1;
        return acc;
      }, {}),
    }, null, 2));
    console.log("\nKEPT:");
    for (const c of kept) console.log(`  ${c.key.slice(0, 40)} types=${c.types.join(",")} status=${c.statuses.join(",")} teams=${c.teams.join("/")} assets=${c.assetRows} names=${c.sampleNames.join("|")}`);
    const executedish = tradeRows.filter((r) => {
      const t = String(r.type || "").toUpperCase();
      const st = String(r.status || "").toUpperCase();
      return (
        t === "TRADE_UPHOLD" ||
        t === "TRADE_ACCEPT" ||
        st === "EXECUTED" ||
        st === "COMPLETED" ||
        st === "PROCESSED" ||
        String(r.executionType || "").toUpperCase() === "EXECUTE"
      );
    });
    console.log("\nEXECUTED-ISH ROWS:");
    for (const r of executedish) {
      console.log(
        JSON.stringify({
          type: r.type,
          status: r.status,
          exec: r.executionType,
          tx: r.transactionId,
          rel: r.relatedTransactionId,
          cluster: tradeClusterKey(r),
          from: r.fromTeamId,
          to: r.toTeamId,
          team: r.teamId,
          item: r.itemType,
          pid: r.playerId,
          pick: r.overallPickNumber,
          name: r.playerName,
          src: r._source,
        }),
      );
    }

    console.log("\nDROPPED (first 20):");
    for (const c of dropped.slice(0, 20)) {
      console.log(`  ${c.reason} | ${c.key.slice(0, 36)} types=${c.types.join(",")} status=${c.statuses.join(",")} rel=${c.relIds.join("|")} src=${c.sources.join("|")} teams=${c.teams.join("/")}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
