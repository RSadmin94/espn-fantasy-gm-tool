/**
 * RFSN-051A — corrected runtime verification of the six Phase 1 changes.
 *
 * Fixes over v1:
 *   - probes the `dark:` variant with classes that actually exist in source
 *     (Tailwind only emits utilities it finds during the content scan)
 *   - composites foreground alpha over the background before computing contrast
 *   - waits for skeletons to clear so data-bearing routes actually render
 *   - opens an article so the `prose` wrapper is mounted
 *
 *   pnpm exec tsx scripts/_rfsn051a_verify2.mts
 */
import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClerkClient } from "@clerk/clerk-sdk-node";
import { chromium, type Page } from "playwright";

const BASE = (
  process.env.QA_BASE ?? "https://sprint-8-preview.fantasyfootballrivals.com"
).replace(/\/$/, "");
const FOUNDER_CLERK_ID =
  process.env.SMOKE_CLERK_USER_ID ?? "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo";
const SHOTS = path.resolve("audit-artifacts/rfsn-051/screenshots-after");

/** Contrast helpers that composite alpha over the resolved backdrop. */
const HELPERS = `
  var __cv = document.createElement("canvas"); __cv.width = __cv.height = 1;
  var __cx = __cv.getContext("2d", { willReadFrequently: true });
  function __parse(c) {
    __cx.clearRect(0,0,1,1); __cx.fillStyle = "#000"; __cx.fillStyle = c;
    __cx.fillRect(0,0,1,1);
    var d = __cx.getImageData(0,0,1,1).data;
    return [d[0], d[1], d[2], d[3]/255];
  }
  function __lum(rgb) {
    var f = [rgb[0],rgb[1],rgb[2]].map(function(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2];
  }
  function __over(fg, bg) {
    var a = fg[3];
    return [fg[0]*a + bg[0]*(1-a), fg[1]*a + bg[1]*(1-a), fg[2]*a + bg[2]*(1-a), 1];
  }
  function __bgOf(el) {
    var n = el;
    while (n && n !== document.documentElement) {
      var c = __parse(getComputedStyle(n).backgroundColor);
      if (c[3] > 0.85) return c;
      n = n.parentElement;
    }
    return [10,8,12,1];
  }
  function __contrast(el) {
    var bg = __bgOf(el);
    var fg = __over(__parse(getComputedStyle(el).color), bg);
    var a = __lum(fg), b = __lum(bg);
    var hi = Math.max(a,b), lo = Math.min(a,b);
    return (hi + 0.05) / (lo + 0.05);
  }
`;

async function settle(page: Page, ms = 4000) {
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => undefined);
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, undefined, {
      timeout: 25_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(ms);
}

/** Mirrors the census harness: use Clerk's own ticket URL, rebased onto the app host. */
async function mintSignInUrl(): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error("CLERK_SECRET_KEY missing");
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: FOUNDER_CLERK_ID, expires_in_seconds: 900 }),
  });
  if (!res.ok) throw new Error(`Clerk token mint failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { url?: string; token?: string };
  if (data.url) {
    const u = new URL(data.url);
    u.protocol = "https:";
    u.host = new URL(BASE).host;
    return u.toString();
  }
  return `${BASE}/sign-in#__clerk_ticket=${data.token}`;
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();

  // ---------- landing: MONO kicker contrast, correctly composited ----------
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(2500);
  const mono = await page.evaluate(
    new Function(`
      ${HELPERS}
      var out = [];
      var els = document.querySelectorAll("*");
      for (var i = 0; i < els.length; i++) {
        var e = els[i];
        if (typeof e.className !== "string") continue;
        if (!/font-mono/.test(e.className)) continue;
        if (!e.textContent || e.textContent.trim().length < 2) continue;
        if (e.children.length > 0) continue;
        var cs = getComputedStyle(e);
        out.push({
          text: e.textContent.trim().slice(0, 30),
          size: cs.fontSize,
          contrast: Number(__contrast(e).toFixed(2))
        });
        if (out.length >= 10) break;
      }
      return out;
    `) as () => unknown,
  );
  console.log("[mono] landing kicker contrast (alpha composited):");
  for (const m of mono as Array<Record<string, unknown>>) {
    console.log(`        ${String(m.contrast).padStart(5)}:1  ${m.size}  "${m.text}"`);
  }
  await page.screenshot({ path: path.join(SHOTS, "landing.png"), fullPage: false });

  // ---------- authenticate ----------
  await page.goto(await mintSignInUrl(), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForURL(
    (u) => u.hostname.includes("fantasyfootballrivals.com") && !u.pathname.includes("sign-in"),
    { timeout: 90_000 },
  );
  await page.waitForTimeout(3000);

  // Fail loudly rather than silently measuring a signed-out shell.
  const signedIn = await page.evaluate(
    () => !document.body.innerText.includes("Sign in to My Application"),
  );
  if (!signedIn) throw new Error("Authentication failed — measuring would be meaningless.");
  console.log("[auth] signed in as founder");
  await page
    .evaluate(async () => {
      await fetch("/api/trpc/league.setActive", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { provider: "espn", leagueKey: "457622", season: 2025 } }),
      });
    })
    .catch(() => undefined);

  // ---------- dark: variant, probed with real classes ----------
  await page.goto(`${BASE}/connect`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await settle(page, 3000);
  const darkProbe = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")].filter(
      (i) => i.offsetParent !== null && /border-input/.test(i.className),
    );
    const tab = document.querySelector('[role="tab"][data-state="inactive"]');
    return {
      theme: document.documentElement.getAttribute("data-theme"),
      inputCount: inputs.length,
      inputBg: inputs[0] ? getComputedStyle(inputs[0]).backgroundColor : null,
      inputClasses: inputs[0] ? inputs[0].className.slice(0, 70) : null,
      inactiveTabColor: tab ? getComputedStyle(tab).color : null,
    };
  });
  console.log(`\n[dark] ${JSON.stringify(darkProbe)}`);
  console.log("       (dark: active ⇒ input background is a translucent fill, not rgba(0,0,0,0))");

  // ---------- prose: open an article so ArticleBody mounts ----------
  await page.goto(`${BASE}/rfsn/stories`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await settle(page, 4000);
  const opened = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>("button, [role=button], article, .cursor-pointer")];
    const target = cards.find((c) => (c.textContent ?? "").trim().length > 60);
    if (!target) return false;
    target.click();
    return true;
  });
  await page.waitForTimeout(3500);
  const prose = await page.evaluate(() => {
    const el = document.querySelector('[class*="prose"]');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const p = el.querySelector("p");
    const pcs = p ? getComputedStyle(p) : null;
    return {
      found: true,
      wrapperMaxWidth: cs.maxWidth,
      wrapperFontSize: cs.fontSize,
      paragraphSize: pcs?.fontSize ?? null,
      paragraphLeading: pcs?.lineHeight ?? null,
    };
  });
  console.log(`\n[prose] opened article: ${opened} → ${JSON.stringify(prose)}`);
  await page.screenshot({ path: path.join(SHOTS, "rfsn-stories-article.png"), fullPage: false });

  // ---------- MUTED normalization on pages that use the constants ----------
  for (const route of ["/league-dna", "/dashboard", "/rivals/rivalries"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await settle(page, 4500);
    const res = await page.evaluate(
      new Function(`
        ${HELPERS}
        var hard = 0, token = 0, samples = [];
        var els = document.querySelectorAll("[style]");
        for (var i = 0; i < els.length; i++) {
          var raw = els[i].getAttribute("style") || "";
          if (!/color/.test(raw)) continue;
          if (/var\\(--color-muted-foreground\\)/.test(raw)) {
            token++;
            if (samples.length < 3 && els[i].textContent && els[i].textContent.trim())
              samples.push({ t: els[i].textContent.trim().slice(0,24), c: Number(__contrast(els[i]).toFixed(2)) });
          } else if (/139,\\s*151,\\s*168|#8b97a8/i.test(raw)) hard++;
        }
        return { hard: hard, token: token, samples: samples, totalNodes: document.querySelectorAll("*").length };
      `) as () => unknown,
    );
    console.log(`[muted] ${route.padEnd(20)} ${JSON.stringify(res)}`);
    await page.screenshot({
      path: path.join(SHOTS, `${route.replace(/\//g, "_").replace(/^_/, "")}.png`),
      fullPage: false,
    });
  }

  // ---------- dense surface screenshots for layout regression review ----------
  for (const route of ["/league/standings", "/draft/history", "/my-team/roster"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await settle(page, 4500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    );
    console.log(`[layout] ${route.padEnd(20)} horizontalOverflow=${overflow}`);
    await page.screenshot({
      path: path.join(SHOTS, `${route.replace(/\//g, "_").replace(/^_/, "")}.png`),
      fullPage: false,
    });
  }

  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
