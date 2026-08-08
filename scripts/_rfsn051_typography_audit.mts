/**
 * RFSN-051 — Application-wide typography & readability audit harness (READ ONLY).
 *
 * Captures, per customer-facing route:
 *   - full-page screenshots at multiple viewports
 *   - a computed-style census of every visible text node
 *     (font-size, weight, effective color after opacity, effective background,
 *      WCAG contrast ratio, line-height, letter-spacing, class names)
 *
 * Writes artifacts to audit-artifacts/rfsn-051/.
 * Makes no changes to the application.
 *
 *   pnpm exec tsx scripts/_rfsn051_typography_audit.mts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const BASE = (
  process.env.QA_BASE ?? "https://sprint-8-preview.fantasyfootballrivals.com"
).replace(/\/$/, "");
const FOUNDER_CLERK_ID =
  process.env.SMOKE_CLERK_USER_ID ?? "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo";
const ESPN_LEAGUE = "457622";
const OUT = path.resolve("audit-artifacts/rfsn-051");
const SHOTS = path.join(OUT, "screenshots");

type Viewport = { name: string; width: number; height: number };
const PRIMARY: Viewport = { name: "1920x1080", width: 1920, height: 1080 };
const EXTRA_VIEWPORTS: Viewport[] = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "390x844", width: 390, height: 844 },
];

/** Routes audited at the primary viewport. */
const ROUTES: Array<{ path: string; group: string; label: string }> = [
  { path: "/home", group: "HOME", label: "Home" },
  { path: "/dashboard", group: "HOME", label: "Dashboard" },
  { path: "/rivals", group: "RIVALS", label: "Rivals Hub" },
  { path: "/rivals/cast", group: "RIVALS", label: "The Cast" },
  { path: "/rivals/owners", group: "RIVALS", label: "Owners" },
  { path: "/rivals/rivalries", group: "RIVALS", label: "Rivalries" },
  { path: "/rivals/league-map", group: "RIVALS", label: "League Map" },
  { path: "/rivals/relationships", group: "RIVALS", label: "Relationships" },
  { path: "/my-team", group: "MY TEAM", label: "My Team Hub" },
  { path: "/my-team/roster", group: "MY TEAM", label: "Roster" },
  { path: "/my-team/matchup", group: "MY TEAM", label: "Matchup" },
  { path: "/my-team/trades", group: "MY TEAM", label: "Trades" },
  { path: "/my-team/advisor", group: "MY TEAM", label: "GM Advisor" },
  { path: "/my-team/profile", group: "MY TEAM", label: "My GM" },
  { path: "/my-team/championship-path", group: "MY TEAM", label: "Championship Path" },
  { path: "/rfsn", group: "RFSN", label: "RFSN Home" },
  { path: "/rfsn/live", group: "RFSN", label: "RFSN Live" },
  { path: "/rfsn/stories", group: "RFSN", label: "RFSN Stories" },
  { path: "/rfsn/recaps", group: "RFSN", label: "RFSN Recaps" },
  { path: "/draft", group: "DRAFT", label: "Draft Hub" },
  { path: "/draft/live", group: "DRAFT", label: "Live Draft" },
  { path: "/draft/mock", group: "DRAFT", label: "Mock Draft" },
  { path: "/draft/keepers", group: "DRAFT", label: "Keeper Center" },
  { path: "/draft/history", group: "DRAFT", label: "Draft History" },
  { path: "/league", group: "LEAGUE", label: "League Hub" },
  { path: "/league/standings", group: "LEAGUE", label: "Standings" },
  { path: "/league/standings/power-rankings", group: "LEAGUE", label: "Power Rankings" },
  { path: "/league/standings/playoffs", group: "LEAGUE", label: "Playoff Picture" },
  { path: "/league/history", group: "LEAGUE", label: "League History" },
  { path: "/league/history/records", group: "LEAGUE", label: "Records" },
  { path: "/league/history/hall-of-fame", group: "LEAGUE", label: "Hall of Fame" },
  { path: "/league/history/timeline", group: "LEAGUE", label: "Timeline" },
  { path: "/league/history/transactions", group: "LEAGUE", label: "Transactions" },
  { path: "/league-dna", group: "LEAGUE", label: "League DNA" },
  { path: "/player-database", group: "LEAGUE", label: "Players" },
  { path: "/connect", group: "CONNECT", label: "Connect ESPN" },
  { path: "/connect/sleeper", group: "CONNECT", label: "Connect Sleeper" },
  { path: "/import/sleeper-workbook", group: "CONNECT", label: "Sleeper Workbook" },
  { path: "/connected-leagues", group: "CONNECT", label: "Connected Leagues" },
  { path: "/sync", group: "CONNECT", label: "Sync Data" },
  { path: "/settings", group: "BILLING", label: "Settings / Subscription" },
  { path: "/league-settings", group: "ADMIN", label: "League Settings" },
  { path: "/league/commissioner", group: "ADMIN", label: "Commissioner" },
  { path: "/sync", group: "ADMIN", label: "Sync (repeat)" },
];

/** Routes that also get the responsive sweep. */
const RESPONSIVE_ROUTES = [
  "/dashboard",
  "/league/standings",
  "/my-team/roster",
  "/rivals/owners",
  "/draft/history",
];

type TextNode = {
  text: string;
  tag: string;
  cls: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  lineHeight: number;
  letterSpacing: string;
  color: string;
  bg: string;
  opacity: number;
  contrast: number;
  isLarge: boolean;
  meaningful: boolean;
  w: number;
  h: number;
};

async function mintFounderSignInUrl(): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error("CLERK_SECRET_KEY missing");
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: FOUNDER_CLERK_ID, expires_in_seconds: 600 }),
  });
  if (!res.ok) throw new Error(`Clerk token mint failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { url?: string; token?: string };
  if (data.url) {
    const u = new URL(data.url);
    u.protocol = "https:";
    u.host = new URL(BASE).host;
    return u.toString();
  }
  if (!data.token) throw new Error("Clerk token response missing url/token");
  return `${BASE}/sign-in?__clerk_ticket=${encodeURIComponent(data.token)}`;
}

/**
 * Runs inside the browser: census every visible text-bearing element.
 * Kept as a source string so the tsx/esbuild `keepNames` helper (`__name`)
 * is never injected into code shipped across the CDP boundary.
 */
const CENSUS_SRC = `(() => {
  // The app uses oklch()/oklab() tokens, so parse via canvas rather than a
  // regex: canvas resolves any CSS color string to unpremultiplied sRGB.
  var _c = document.createElement("canvas");
  _c.width = 1; _c.height = 1;
  var _ctx = _c.getContext("2d", { willReadFrequently: true });
  var _cache = {};
  var parse = function (c) {
    if (!c) return [0, 0, 0, 0];
    if (_cache[c]) return _cache[c];
    var res;
    try {
      _ctx.clearRect(0, 0, 1, 1);
      _ctx.fillStyle = "#000";
      _ctx.fillStyle = c;
      _ctx.fillRect(0, 0, 1, 1);
      var d = _ctx.getImageData(0, 0, 1, 1).data;
      res = [d[0], d[1], d[2], d[3] / 255];
    } catch (err) {
      res = [0, 0, 0, 0];
    }
    _cache[c] = res;
    return res;
  };
  var lum = function (r, g, b) {
    var f = function (v) {
      var s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  var blend = function (fg, bg) {
    return [
      fg[0] * fg[3] + bg[0] * (1 - fg[3]),
      fg[1] * fg[3] + bg[1] * (1 - fg[3]),
      fg[2] * fg[3] + bg[2] * (1 - fg[3])
    ];
  };
  var effectiveBg = function (el) {
    var node = el;
    var stack = [];
    while (node) {
      var c = parse(getComputedStyle(node).backgroundColor);
      if (c[3] > 0) { stack.push(c); if (c[3] >= 1) break; }
      node = node.parentElement;
    }
    var base = [0, 0, 0];
    for (var i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base);
    return base;
  };
  var chainOpacity = function (el) {
    var o = 1;
    var node = el;
    while (node) {
      var v = parseFloat(getComputedStyle(node).opacity || "1");
      if (!isNaN(v)) o *= v;
      node = node.parentElement;
    }
    return o;
  };

  var out = [];
  var all = document.body.querySelectorAll("*");
  var skip = ["script", "style", "svg", "path", "noscript", "head"];
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var tag = el.tagName.toLowerCase();
    if (skip.indexOf(tag) !== -1) continue;
    var text = "";
    for (var j = 0; j < el.childNodes.length; j++) {
      var n = el.childNodes[j];
      if (n.nodeType === 3) text += n.textContent || "";
    }
    text = text.replace(/\\s+/g, " ").trim();
    if (!text) continue;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    var cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    var op = chainOpacity(el);
    if (op < 0.02) continue;

    var fontSize = parseFloat(cs.fontSize) || 0;
    var fontWeight = parseInt(cs.fontWeight, 10) || 400;
    var bg = effectiveBg(el);
    var fgRaw = parse(cs.color);
    var fg = blend([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * op], bg);
    var l1 = lum(fg[0], fg[1], fg[2]);
    var l2 = lum(bg[0], bg[1], bg[2]);
    var contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    var isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    var lh = parseFloat(cs.lineHeight);
    if (isNaN(lh)) lh = fontSize * 1.2;

    var clsFull = el.getAttribute("class") || "";
    var decorative = false;
    if (el.getAttribute("aria-hidden") === "true") decorative = true;
    if (/\\bsr-only\\b|\\banimate-pulse\\b/.test(clsFull)) decorative = true;
    if (cs.verticalAlign === "super" || fontSize < 9) decorative = true;
    if (text.length <= 2 && /^[·•—–|™®©✓×▼▲▸‹›]$/.test(text)) decorative = true;
    if (/\\bbadge\\b/i.test(clsFull) && fontSize < 11 && text.length <= 12) decorative = true;
    if (fontSize <= 9 && text.length <= 4 && (cs.textTransform === "uppercase" || /uppercase/.test(clsFull))) decorative = true;

    out.push({
      text: text.slice(0, 70),
      tag: tag,
      cls: clsFull.slice(0, 220),
      fontSize: Math.round(fontSize * 100) / 100,
      fontWeight: fontWeight,
      fontFamily: cs.fontFamily.split(",")[0].replace(/["']/g, ""),
      lineHeight: Math.round(lh * 100) / 100,
      letterSpacing: cs.letterSpacing,
      color: cs.color,
      bg: "rgb(" + bg.map(function (v) { return Math.round(v); }).join(",") + ")",
      opacity: Math.round(op * 100) / 100,
      contrast: Math.round(contrast * 100) / 100,
      isLarge: isLarge,
      meaningful: !decorative,
      w: Math.round(rect.width),
      h: Math.round(rect.height)
    });
  }
  return out;
})()`;

/** Cheap proxy for "how much text is on screen", matching what the census counts. */
const TEXT_COUNT_SRC = `(function(){
  var n = 0;
  var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  while (w.nextNode()) { if ((w.currentNode.nodeValue || "").trim()) n++; }
  return n;
})()`;

/**
 * Wait until a route stops changing before measuring it.
 *
 * A fixed settle delay is not a trustworthy benchmark: at 3.8s the same route
 * reported 764 text nodes on one run and 43 on the next, purely from server
 * cache warmth. Comparing those numbers measures load timing, not typography.
 *
 * Require the visible text-node count to repeat across consecutive samples,
 * with no skeletons left on screen. Returns `settled: false` on timeout so the
 * caller can record the route as unreliable instead of silently comparing it.
 */
async function waitForStableText(
  page: Page,
  { samples = 3, interval = 900, timeout = 40_000 } = {},
): Promise<{ settled: boolean; count: number; history: number[] }> {
  const history: number[] = [];
  const deadline = Date.now() + timeout;

  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

  while (Date.now() < deadline) {
    await page.waitForTimeout(interval);
    const [count, skeletons] = await Promise.all([
      page.evaluate(TEXT_COUNT_SRC) as Promise<number>,
      page.evaluate(() => document.querySelectorAll(".animate-pulse").length) as Promise<number>,
    ]);
    history.push(count);

    // `.animate-pulse` marks loading skeletons but also decorative live
    // indicators, which never stop. Treating it as a hard gate hung /rfsn/stories
    // for the full timeout while its text count sat unchanged at 293. So use it
    // only to demand a longer confirmation window, never to block outright.
    const required = skeletons > 0 ? samples * 2 : samples;
    if (history.length < required) continue;

    const window = history.slice(-required);
    if (window[0] > 0 && window.every((v) => v === window[0])) {
      return { settled: true, count: window[0], history };
    }
  }
  return { settled: false, count: history.at(-1) ?? 0, history };
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const signInUrl = await mintFounderSignInUrl();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: PRIMARY.width, height: PRIMARY.height },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  await page.goto(signInUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForURL(
    (url) =>
      url.hostname.includes("fantasyfootballrivals.com") && !url.pathname.includes("sign-in"),
    { timeout: 90_000 },
  );
  await page.waitForTimeout(3000);

  await page
    .evaluate(async (leagueKey) => {
      await fetch("/api/trpc/league.setActive", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          json: { provider: "espn", leagueKey, season: 2025 },
        }),
      });
    }, ESPN_LEAGUE)
    .catch(() => undefined);

  const sha = await page.evaluate(async () => {
    const r = await fetch("/api/health");
    const j = await r.json();
    return j.gitSha as string;
  });
  console.log(`Preview SHA: ${sha}\nBase: ${BASE}\n`);

  const results: Record<string, unknown>[] = [];

  for (const route of ROUTES) {
    const slug = route.path.replace(/\//g, "_").replace(/^_/, "") || "root";
    try {
      await page.goto(`${BASE}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      const stability = await waitForStableText(page);
      const url = page.url();
      const shot = path.join(SHOTS, `${slug}__${PRIMARY.name}.png`);
      if (!process.env.SKIP_SHOTS) await page.screenshot({ path: shot, fullPage: true });
      const nodes = (await page.evaluate(CENSUS_SRC)) as unknown as TextNode[];

      const tiny = nodes.filter((n) => n.fontSize < 12);
      const tinyMeaningful = tiny.filter((n) => n.meaningful);
      const small = nodes.filter((n) => n.fontSize >= 12 && n.fontSize < 14);
      const lowContrast = nodes.filter(
        (n) => (n.isLarge ? n.contrast < 3 : n.contrast < 4.5),
      );
      const severe = nodes.filter(
        (n) => (n.isLarge ? n.contrast < 2 : n.contrast < 3),
      );
      results.push({
        route: route.path,
        group: route.group,
        label: route.label,
        finalUrl: url,
        redirected: !url.includes(route.path),
        screenshot: shot,
        settled: stability.settled,
        settleHistory: stability.history,
        totalTextNodes: nodes.length,
        tinyCount: tiny.length,
        tinyMeaningfulCount: tinyMeaningful.length,
        smallCount: small.length,
        lowContrastCount: lowContrast.length,
        severeContrastCount: severe.length,
        nodes,
      });
      console.log(
        `${route.group.padEnd(8)} ${route.path.padEnd(38)} nodes=${String(nodes.length).padStart(4)} <12px=${String(tiny.length).padStart(3)} meaningful=${String(tinyMeaningful.length).padStart(3)} contrast<4.5=${String(lowContrast.length).padStart(3)} severe=${String(severe.length).padStart(3)} ${stability.settled ? "settled" : `UNSETTLED [${stability.history.join(",")}]`}${url.includes(route.path) ? "" : `  [redirected → ${url.replace(BASE, "")}]`}`,
      );
    } catch (e) {
      console.log(`ERROR ${route.path}: ${String(e).slice(0, 160)}`);
      results.push({ route: route.path, group: route.group, error: String(e).slice(0, 300) });
    }
  }

  // Responsive sweep
  for (const vp of EXTRA_VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const r of RESPONSIVE_ROUTES) {
      const slug = r.replace(/\//g, "_").replace(/^_/, "");
      try {
        await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        const stability = await waitForStableText(page);
        if (!process.env.SKIP_SHOTS) {
          await page.screenshot({
            path: path.join(SHOTS, `${slug}__${vp.name}.png`),
            fullPage: true,
          });
        }
        const nodes = (await page.evaluate(CENSUS_SRC)) as unknown as TextNode[];
        const tiny = nodes.filter((n) => n.fontSize < 12).length;
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        );
        console.log(
          `${vp.name.padEnd(10)} ${r.padEnd(30)} nodes=${nodes.length} <12px=${tiny} ${stability.settled ? "settled" : "UNSETTLED"}${overflow ? "  [HORIZONTAL OVERFLOW]" : ""}`,
        );
        results.push({
          route: r,
          viewport: vp.name,
          responsive: true,
          settled: stability.settled,
          totalTextNodes: nodes.length,
          tinyCount: tiny,
          horizontalOverflow: overflow,
        });
      } catch (e) {
        console.log(`ERROR ${vp.name} ${r}: ${String(e).slice(0, 140)}`);
      }
    }
  }

  writeFileSync(path.join(OUT, "census.json"), JSON.stringify({ sha, base: BASE, results }, null, 2));
  console.log(`\nWrote ${path.join(OUT, "census.json")}`);
  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
