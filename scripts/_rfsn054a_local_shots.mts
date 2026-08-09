/**
 * RFSN-054A local 1440 visual check — Live Draft Control compact strip.
 * Compares viewport metrics + screenshots for /draft/live and /rfsn/live.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.QA_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = path.resolve("audit-artifacts/rfsn-054/screenshots-054a-local");
const PAGES = [
  ["/draft/live", "draft-live"],
  ["/rfsn/live", "rfsn-live"],
] as const;

async function mint(): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error("CLERK_SECRET_KEY required");
  const { createClerkClient } = await import("@clerk/clerk-sdk-node");
  const clerk = createClerkClient({ secretKey: secret });
  const t = await clerk.signInTokens.createSignInToken({
    userId: process.env.SMOKE_CLERK_USER_ID ?? "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo",
    expiresInSeconds: 300,
  });
  return `${BASE}/sign-in#__clerk_ticket=${t.token}`;
}

async function main() {
  const { chromium } = await import("playwright");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const notes: string[] = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(await mint(), { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 90_000 });
    await page.waitForTimeout(2500);

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
      await page.waitForTimeout(4500);
      const meta = await page.evaluate(() => {
        const strip = document.querySelector("[data-live-compact-strip]") as HTMLElement | null;
        const control = document.querySelector("[data-live-draft-control]") as HTMLElement | null;
        const advanced = document.querySelector("[data-live-advanced]") as HTMLElement | null;
        const recent = document.body.innerText.includes("RECENT ACTIVITY") || document.body.innerText.includes("Recent Activity");
        const playerRows = document.querySelectorAll(
          "[data-draft-surface] [data-player-row], [data-draft-surface] tbody tr, .live-draft-surface [data-player-id]",
        );
        const visiblePlayers = Array.from(
          document.querySelectorAll(".live-draft-surface"),
        ).flatMap((root) =>
          Array.from(root.querySelectorAll("button, a, [data-player-id], li")).filter((el) => {
            const r = (el as HTMLElement).getBoundingClientRect();
            const text = (el as HTMLElement).innerText ?? "";
            return r.bottom > 0 && r.top < window.innerHeight && /ADP|Value|WR|RB|QB|TE/.test(text);
          }),
        );
        return {
          path: location.pathname,
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          controlHeight: control ? Math.round(control.getBoundingClientRect().height) : null,
          stripHeight: strip ? Math.round(strip.getBoundingClientRect().height) : null,
          advancedOpen: advanced ? (advanced as HTMLDetailsElement).open : null,
          has054a: Boolean(document.querySelector("[data-rfsn-054a]")),
          hasSessionButton: Boolean(document.querySelector("[data-live-draft-power]")),
          recentVisible: recent,
          playerRowHint: playerRows.length,
          visiblePlayerish: visiblePlayers.length,
        };
      });
      notes.push(`${name}: ${JSON.stringify(meta)}`);
      await page.screenshot({ path: path.join(OUT, `${name}__1440.png`), fullPage: false });

      if (meta.advancedOpen === false) {
        await page.click("[data-live-advanced] summary");
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, `${name}__1440-advanced.png`), fullPage: false });
        notes.push(`${name}-advanced-opened`);
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "notes.txt"), `${notes.join("\n")}\n`);
  console.log(notes.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
