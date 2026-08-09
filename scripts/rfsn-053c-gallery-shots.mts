/**
 * RFSN-053C gallery screenshots.
 * Localhost: injects gallery chrome into the public landing page (real app CSS).
 * QA_BASE: Clerk mint + live /league/history/matchups routes.
 *
 *   npx tsx scripts/rfsn-053c-gallery-shots.mts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.QA_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = path.resolve("audit-artifacts/rfsn-053/screenshots");
const LOCAL = /localhost|127\.0\.0\.1/i.test(BASE);
const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "390x844", width: 390, height: 844 },
] as const;

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
  if (data.url) {
    const u = new URL(data.url);
    u.protocol = new URL(base).protocol;
    u.host = new URL(base).host;
    return u.toString();
  }
  return `${base}/sign-in?__clerk_ticket=${encodeURIComponent(data.token!)}`;
}

function chip(label: string): string {
  return `<li class="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-semibold text-foreground">${label}</li>`;
}

function badge(kind: string, cls: string): string {
  return `<li data-badge="${kind}" class="rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${cls}">${kind}</li>`;
}

function side(align: "left" | "right", owner: string, team: string | null, score: string, winner: boolean): string {
  const right = align === "right";
  return `<div class="min-w-0${right ? " text-right" : ""}">
    <div class="flex items-start gap-2${right ? " flex-row-reverse" : ""}">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
        <span class="text-xs font-bold text-muted-foreground">${(team || owner).slice(0, 2).toUpperCase()}</span>
      </div>
      <div class="min-w-0">
        <p class="truncate text-base font-semibold ${winner ? "text-primary" : "text-foreground"}">${owner}</p>
        ${team ? `<p class="truncate text-xs text-muted-foreground">${team}</p>` : ""}
      </div>
    </div>
    <p class="mt-2 text-2xl font-black tabular-nums ${winner ? "text-primary" : "text-foreground"}">${score}</p>
  </div>`;
}

function card(opts: {
  id: number;
  season: number;
  week: number;
  phase: string;
  badges: string;
  home: string;
  away: string;
  homeTeam: string | null;
  awayTeam: string | null;
  homeScore: string;
  awayScore: string;
  winner: "home" | "away";
  recap: string;
}): string {
  return `<article data-matchup-card data-matchup-id="${opts.id}" class="flex h-full flex-col rounded-xl border border-border bg-card p-4 sm:p-5">
    <div class="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span>${opts.season}</span><span aria-hidden="true">·</span>
      <span>Week ${opts.week}</span><span aria-hidden="true">·</span>
      <span>${opts.phase}</span>
    </div>
    <ul class="mt-3 flex flex-wrap gap-1.5" aria-label="Matchup badges">${opts.badges}</ul>
    <div class="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
      ${side("left", opts.home, opts.homeTeam, opts.homeScore, opts.winner === "home")}
      <div class="pt-6 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">vs</div>
      ${side("right", opts.away, opts.awayTeam, opts.awayScore, opts.winner === "away")}
    </div>
    <p class="mt-4 text-sm text-foreground">${opts.recap}</p>
    <div class="mt-auto flex flex-wrap gap-2 pt-4">
      <a href="/league/history/matchups/${opts.id}?season=${opts.season}&week=${opts.week}" class="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">View Matchup</a>
    </div>
  </article>`;
}

function filterField(label: string, value: string): string {
  return `<label class="block space-y-1.5">
    <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">${label}</span>
    <div class="border-input flex h-9 w-full items-center rounded-md border bg-transparent px-3 text-sm text-foreground">${value}</div>
  </label>`;
}

function toggle(label: string, active: boolean): string {
  return `<button type="button" class="${
    active
      ? "inline-flex h-9 items-center rounded-md bg-primary/15 px-3 text-sm font-semibold text-primary ring-1 ring-primary/40"
      : "inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-semibold text-foreground"
  }">${label}</button>`;
}

function galleryPage(kind: "matchups" | "no-mercy" | "empty"): string {
  const noMercy = kind === "no-mercy";
  const empty = kind === "empty";
  const title = noMercy ? "NO MERCY RULE" : "Historical Matchups";
  const galleryTitle = noMercy ? "No Mercy Rule gallery" : "Matchup gallery";
  const subtitle = noMercy
    ? "Victory margin of 50+ points. Facts from recorded gmMatchups only."
    : "Browse recorded league games. Filters use the Historical Matchup Gallery contract.";
  const chips = noMercy
    ? [chip("NO MERCY RULE"), chip("Owner: Rod Sellers"), chip("Wins only")].join("")
    : "";
  const cards = empty
    ? ""
    : noMercy
      ? [
          card({
            id: 11,
            season: 2011,
            week: 1,
            phase: "Regular season",
            badges: badge("NO MERCY", "border-amber-400/40 bg-amber-400/15 text-amber-200"),
            home: "Rod Sellers",
            away: "Bruce Edwards",
            homeTeam: "Rod FC",
            awayTeam: "Bruce FC",
            homeScore: "180.00",
            awayScore: "120.00",
            winner: "home",
            recap: `<span class="font-semibold">Rod Sellers</span> defeated <span class="font-semibold">Bruce Edwards</span><span class="text-muted-foreground"> · won by 60.00</span>`,
          }),
          card({
            id: 18,
            season: 2018,
            week: 9,
            phase: "Regular season",
            badges: badge("NO MERCY", "border-amber-400/40 bg-amber-400/15 text-amber-200"),
            home: "Rod Sellers",
            away: "Demetri Clark",
            homeTeam: "Rod FC",
            awayTeam: "Demetri FC",
            homeScore: "210.00",
            awayScore: "150.00",
            winner: "home",
            recap: `<span class="font-semibold">Rod Sellers</span> defeated <span class="font-semibold">Demetri Clark</span><span class="text-muted-foreground"> · won by 60.00</span>`,
          }),
        ].join("")
      : [
          card({
            id: 11,
            season: 2011,
            week: 1,
            phase: "Regular season",
            badges: badge("NO MERCY", "border-amber-400/40 bg-amber-400/15 text-amber-200"),
            home: "Rod Sellers",
            away: "Bruce Edwards",
            homeTeam: "Rod FC",
            awayTeam: "Bruce FC",
            homeScore: "180.00",
            awayScore: "120.00",
            winner: "home",
            recap: `<span class="font-semibold">Rod Sellers</span> defeated <span class="font-semibold">Bruce Edwards</span><span class="text-muted-foreground"> · won by 60.00</span>`,
          }),
          card({
            id: 40,
            season: 2014,
            week: 2,
            phase: "Regular season",
            badges: badge("ONE-POINT", "border-sky-400/40 bg-sky-400/15 text-sky-200"),
            home: "Rod Sellers",
            away: "Bruce Edwards",
            homeTeam: "Rod FC",
            awayTeam: "Bruce FC",
            homeScore: "100.80",
            awayScore: "100.00",
            winner: "home",
            recap: `<span class="font-semibold">Rod Sellers</span> defeated <span class="font-semibold">Bruce Edwards</span><span class="text-muted-foreground"> · won by 0.80</span>`,
          }),
          card({
            id: 55,
            season: 2016,
            week: 16,
            phase: "Playoffs",
            badges:
              badge("CHAMPIONSHIP", "border-violet-400/40 bg-violet-400/15 text-violet-200") +
              badge("PLAYOFF", "border-lime-400/40 bg-lime-400/15 text-lime-200"),
            home: "Rod Sellers",
            away: "Bruce Edwards",
            homeTeam: "Rod FC",
            awayTeam: "Bruce FC",
            homeScore: "140.00",
            awayScore: "132.00",
            winner: "home",
            recap: `<span class="font-semibold">Rod Sellers</span> defeated <span class="font-semibold">Bruce Edwards</span><span class="text-muted-foreground"> · won by 8.00</span>`,
          }),
        ].join("");

  const empties = [
    ["missing_dataset", "No recorded matchups yet", "This league has no completed historical matchups to browse. Sync league history, then return here."],
    ["unresolved_owner", "Owner not found", "No owner in this league matched that name. Pick an owner from the list or clear the filter."],
    ["unresolved_opponent", "Opponent not found", "No opponent in this league matched that name. Pick an opponent from the list or clear the filter."],
    ["no_matching_games", "No matching games", "No recorded games match these filters. Broaden the season, phase, or margin and try again."],
    ["insufficient_playoff_tier", "Championship games cannot be proven", "ESPN playoff-tier coverage is not strong enough to label title games. Playoff flags alone are not enough."],
  ]
    .map(
      ([reason, titleText, desc]) => `<div data-gallery-empty="${reason}" class="mb-4">
        <div data-slot="intel-panel" data-variant="card" class="rounded-intel border border-border bg-card p-8 text-center">
          <p class="text-xl font-black text-foreground">${titleText}</p>
          <p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">${desc}</p>
        </div>
      </div>`,
    )
    .join("");

  return `<div class="-m-4 md:-m-6 min-h-screen w-full bg-intel-page-cinematic-token text-foreground p-5 md:p-7" data-v2-league-matchups>
    <div data-slot="cinematic-page-header" class="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="mb-1 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">League History</div>
        <h1 class="font-black leading-none tracking-tight text-foreground text-3xl md:text-4xl">${title}</h1>
        <p class="mt-2 max-w-2xl text-sm text-muted-foreground">${subtitle}</p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-1">
        <span class="rounded-full border border-border px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">ATLANTAS FINEST FF</span>
      </div>
    </div>
    <main class="mx-auto max-w-[1400px]">
      <div data-matchup-gallery class="space-y-5">
        <header data-gallery-header class="space-y-3">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="text-xl font-bold text-foreground sm:text-2xl">${galleryTitle}</h2>
              <p class="mt-1 text-sm text-muted-foreground">ATLANTAS FINEST FF</p>
            </div>
            <div class="flex flex-wrap gap-2 text-sm text-foreground">
              <span data-gallery-coverage class="rounded-full border border-border px-3 py-1 font-semibold">2010–2025</span>
              <span data-gallery-count class="rounded-full border border-border px-3 py-1 font-semibold">${empty ? "0 games" : noMercy ? "2 games" : "3 games"}</span>
            </div>
          </div>
          ${
            chips
              ? `<ul data-gallery-active-filters class="flex flex-wrap gap-2" aria-label="Active filters">${chips}</ul>`
              : ""
          }
        </header>
        <section data-gallery-filters class="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">Filters</h2>
            <button type="button" class="${
              noMercy
                ? "inline-flex h-9 items-center rounded-md bg-amber-400/20 px-3 text-sm font-semibold text-amber-200 ring-1 ring-amber-400/40"
                : "inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-semibold text-foreground"
            }">NO MERCY RULE</button>
          </div>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            ${filterField("Owner", noMercy ? "Rod Sellers" : "Any owner")}
            ${filterField("Opponent", "Any opponent")}
            ${filterField("Season from", "")}
            ${filterField("Season to", "")}
            ${filterField("Phase", "All games")}
            ${filterField("Result", noMercy ? "Wins only" : "Any result")}
            ${filterField("Margin min", noMercy ? "50" : "")}
            ${filterField("Margin max", "")}
            ${filterField("Score min", "")}
            ${filterField("Score max", "")}
          </div>
          <div class="flex flex-wrap gap-2">
            ${toggle("One-point games", false)}
            ${toggle("Closest", false)}
            ${toggle("Highest score", false)}
            ${toggle("Lowest score", false)}
          </div>
        </section>
        ${
          empty
            ? empties
            : `<div data-gallery-grid class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">${cards}</div>`
        }
      </div>
    </main>
  </div>`;
}

async function captureLocal(page: import("playwright").Page, kind: "matchups" | "no-mercy" | "empty", file: string) {
  await page.evaluate((html) => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.body.innerHTML = html as string;
    document.body.className = "bg-background text-foreground min-h-screen";
  }, galleryPage(kind));
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`Wrote ${file}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    if (LOCAL) {
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();
        await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90_000 });
        await page.waitForTimeout(800);
        await captureLocal(page, "matchups", path.join(OUT, `matchups__${vp.name}.png`));
        await captureLocal(page, "no-mercy", path.join(OUT, `no-mercy__${vp.name}.png`));
        if (vp.name === "1440x900" || vp.name === "390x844") {
          await captureLocal(page, "empty", path.join(OUT, `empty-states__${vp.name}.png`));
        }
        await context.close();
      }
      return;
    }

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto(await mintUrl(BASE), { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForURL((url) => !url.pathname.includes("sign-in"), { timeout: 90_000 });
      await page.waitForTimeout(2000);
      for (const route of [
        { id: "matchups", path: "/league/history/matchups" },
        { id: "no-mercy", path: "/league/history/matchups/no-mercy" },
      ] as const) {
        await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForTimeout(2500);
        const file = path.join(OUT, `${route.id}__${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`Wrote ${file}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
