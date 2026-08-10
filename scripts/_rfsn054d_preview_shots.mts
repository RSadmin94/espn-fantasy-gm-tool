/**
 * RFSN-054D Preview shots — Trade Analyzer, GM Advisor, Championship Path, Draft History.
 * Usage: npx tsx scripts/_rfsn054d_preview_shots.mts before|after
 * 1440 screenshots + overflow probe at 1366/1440/1600/1920.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://sprint-8-preview.fantasyfootballrivals.com";
const PHASE = (process.argv[2] === "after" ? "after" : "before") as "before" | "after";
const OUT = path.resolve(`audit-artifacts/rfsn-054d/screenshots-${PHASE}`);
const HEIGHT = 900;
const WIDTHS = [1366, 1440, 1600, 1920] as const;
const PAGES = [
  ["/my-team/trades", "trades"],
  ["/my-team/advisor", "advisor"],
  ["/my-team/championship-path", "championship-path"],
  ["/draft/history", "draft-history"],
] as const;

async function mint(): Promise<string> {
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
  if (!res.ok) throw new Error(`Clerk mint failed ${res.status}`);
  const data = (await res.json()) as { url?: string; token?: string };
  if (data.url) {
    const u = new URL(data.url);
    u.protocol = "https:";
    u.host = new URL(BASE).host;
    return u.toString();
  }
  return `${BASE}/sign-in?__clerk_ticket=${encodeURIComponent(data.token!)}`;
}

async function main() {
  const { chromium } = await import("playwright");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const notes: string[] = [`phase=${PHASE}`, "gate=054D targeted fonts"];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: HEIGHT } })).newPage();
    await page.goto(await mint(), { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForURL((u) => u.hostname.includes("fantasyfootballrivals.com") && !u.pathname.includes("sign-in"), {
      timeout: 90_000,
    });
    await page.waitForTimeout(2500);

    const health = await page.evaluate(async () => {
      const res = await fetch("/api/health", { credentials: "include" });
      return res.json();
    });
    notes.push(`buildTime=${health?.buildTime}`);
    notes.push(`gitSha=${health?.gitSha}`);

    const connections = await page.evaluate(async () => {
      const res = await fetch(
        `/api/trpc/league.getMyLeagues?input=${encodeURIComponent(JSON.stringify({ json: null }))}`,
        { credentials: "include" },
      );
      const body = await res.json();
      return (body?.result?.data?.json ?? body?.result?.data ?? []) as Array<{
        id: number;
        provider: string;
        leagueId: string;
      }>;
    });
    const espn = connections.find((l) => l.provider === "espn" && l.leagueId === "457622");
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
    await page.waitForTimeout(800);

    for (const [route, name] of PAGES) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        if (name === "advisor") {
          await page.waitForSelector("textarea, [data-advisor-messages]", { timeout: 45_000 }).catch(() => null);
          await page.waitForTimeout(8000);
        } else if (name === "championship-path") {
          await page.waitForTimeout(8000);
        } else if (name === "draft-history") {
          await page.waitForSelector("table, [data-v2-draft-history]", { timeout: 45_000 }).catch(() => null);
          await page.waitForTimeout(5000);
        } else {
          await page.waitForTimeout(6500);
        }
        const meta = await page.evaluate(() => ({
          path: location.pathname,
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        }));
        notes.push(`${name}__${width}: ${JSON.stringify(meta)}`);
        if (width === 1440) {
          await page.screenshot({ path: path.join(OUT, `${name}__1440.png`), fullPage: false });
        }
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "notes.txt"), `${notes.join("\n")}\n`);
  console.log(notes.join("\n"));
  console.log(`Wrote shots to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
