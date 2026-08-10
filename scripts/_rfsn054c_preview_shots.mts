/**
 * RFSN-054C Preview human-readability certification shots (founder ESPN 457622).
 * Usage: npx tsx scripts/_rfsn054c_preview_shots.mts before|after
 * Desktop 1440×900 @ 100% zoom. Viewport height 900 to match seated 24–32" desktop.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://sprint-8-preview.fantasyfootballrivals.com";
const PHASE = (process.argv[2] === "after" ? "after" : "before") as "before" | "after";
const OUT = path.resolve(`audit-artifacts/rfsn-054c/screenshots-${PHASE}`);
const WIDTH = 1440;
const HEIGHT = 900;
const PAGES = [
  ["/home", "home"],
  ["/my-team/advisor", "advisor"],
  ["/rivals/owners", "owners"],
  ["/rivals/rivalries", "rivalries"],
  ["/rivals", "rivals-hub"],
  ["/my-team/roster", "roster"],
  ["/my-team/matchup", "matchup"],
  ["/my-team/trades", "trades"],
  ["/my-team/championship-path", "championship-path"],
  ["/league/history/records", "records"],
  ["/league/history/hall-of-fame", "hall-of-fame"],
  ["/league/commissioner", "commissioner"],
  ["/rfsn/stories", "stories"],
  ["/league/history/matchups", "historical-matchups"],
  ["/league/history/transactions", "transactions"],
  ["/draft/live", "draft-live"],
  ["/draft/mock", "draft-mock"],
  ["/draft/keepers", "keepers"],
  ["/draft/history", "draft-history"],
  ["/draft", "draft-hub"],
  ["/league/standings", "standings"],
  ["/league/standings/strength-of-schedule", "schedule"],
  ["/league/standings/power-rankings", "power-rankings"],
  ["/league", "league-hub"],
  ["/settings", "settings"],
  ["/rfsn/live", "rfsn-live"],
  ["/player-database", "player-database"],
  ["/league-dna", "league-dna"],
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
  const notes: string[] = [`phase=${PHASE}`, `viewport=${WIDTH}x${HEIGHT}`];
  try {
    const page = await (await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } })).newPage();
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
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      if (name === "owners") {
        await page.waitForSelector("[data-owner-profiles-mode] button", { timeout: 60_000 }).catch(() => null);
        await page.waitForTimeout(1500);
      } else {
        await page.waitForTimeout(6500);
      }
      const meta = await page.evaluate(() => ({
        path: location.pathname,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      }));
      notes.push(`${name}: ${JSON.stringify(meta)}`);
      await page.screenshot({ path: path.join(OUT, `${name}__1440.png`), fullPage: false });

      if (name === "owners") {
        const clicked = await page.evaluate(() => {
          const btn = document.querySelector<HTMLButtonElement>("[data-owner-profiles-mode] button");
          btn?.click();
          return Boolean(btn);
        });
        if (clicked) {
          await page.waitForURL((u) => /\/rivals\/owners\/[^/]+/.test(u.pathname), { timeout: 45_000 }).catch(() => null);
          await page.waitForSelector("text=Executive Summary", { timeout: 45_000 }).catch(() => null);
          await page.waitForTimeout(1500);
          const dmeta = await page.evaluate(() => ({
            path: location.pathname,
            overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          }));
          notes.push(`dossier: ${JSON.stringify(dmeta)}`);
          await page.screenshot({ path: path.join(OUT, `dossier__1440.png`), fullPage: false });
        } else {
          notes.push("dossier: SKIP no owner button");
        }
      }

      if (name === "historical-matchups") {
        await page.waitForSelector('a[href*="/league/history/matchups/"]', { timeout: 45_000 }).catch(() => null);
        const opened = await page.evaluate(() => {
          const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/league/history/matchups/"]')];
          const link = links.find((a) => {
            const href = a.getAttribute("href") ?? "";
            return /\/league\/history\/matchups\/\d+/.test(href) && !/\/(no-mercy|c\/)/.test(href);
          });
          if (!link) return false;
          link.click();
          return true;
        });
        if (opened) {
          await page.waitForTimeout(5000);
          const vmeta = await page.evaluate(() => ({
            path: location.pathname,
            overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          }));
          notes.push(`viewer: ${JSON.stringify(vmeta)}`);
          await page.screenshot({ path: path.join(OUT, `viewer__1440.png`), fullPage: false });
        } else {
          notes.push("viewer: SKIP no matchup link");
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
