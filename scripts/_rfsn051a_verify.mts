/**
 * RFSN-051A — targeted verification that each Phase 1 change took effect at runtime.
 * Checks the six specific changes rather than aggregate node counts.
 *
 *   pnpm exec tsx scripts/_rfsn051a_verify.mts
 */
import "dotenv/config";
import { createClerkClient } from "@clerk/clerk-sdk-node";
import { chromium } from "playwright";

const BASE = (
  process.env.QA_BASE ?? "https://sprint-8-preview.fantasyfootballrivals.com"
).replace(/\/$/, "");
const FOUNDER_CLERK_ID =
  process.env.SMOKE_CLERK_USER_ID ?? "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo";

/** Resolve any CSS color (incl. oklch) to sRGB and compute WCAG contrast. */
const CONTRAST_HELPERS = `
  var __cv = document.createElement("canvas"); __cv.width = __cv.height = 1;
  var __cx = __cv.getContext("2d", { willReadFrequently: true });
  function __parse(c) {
    __cx.clearRect(0,0,1,1); __cx.fillStyle = "#000"; __cx.fillStyle = c;
    __cx.fillRect(0,0,1,1);
    var d = __cx.getImageData(0,0,1,1).data;
    return [d[0], d[1], d[2], d[3]/255];
  }
  function __lum(rgb) {
    var f = rgb.slice(0,3).map(function(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2];
  }
  function __ratio(fg, bg) {
    var a = __lum(fg), b = __lum(bg);
    var hi = Math.max(a,b), lo = Math.min(a,b);
    return (hi + 0.05) / (lo + 0.05);
  }
  function __bgOf(el) {
    var n = el;
    while (n && n !== document.documentElement) {
      var c = __parse(getComputedStyle(n).backgroundColor);
      if (c[3] > 0.85) return c;
      n = n.parentElement;
    }
    return __parse(getComputedStyle(document.body).backgroundColor);
  }
`;

async function mintSignInUrl() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const t = await clerk.signInTokens.createSignInToken({
    userId: FOUNDER_CLERK_ID,
    expiresInSeconds: 900,
  });
  return `${BASE}/sign-in#__clerk_ticket=${t.token}`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();

  // ---- 1. Correct bundle is being served -------------------------------
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90_000 });
  const bundle = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map((l) => (l as HTMLLinkElement).href.split("/").pop())
      .join(","),
  );
  console.log(`[bundle]  stylesheet served: ${bundle}`);

  // ---- 2. body line-height baseline ------------------------------------
  const bodyLh = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { lineHeight: cs.lineHeight, fontSize: cs.fontSize };
  });
  console.log(
    `[leading] body line-height = ${bodyLh.lineHeight} at font-size ${bodyLh.fontSize} (expect 24px @16px = 1.5)`,
  );

  // ---- 3. dark: variant now resolves against data-theme ----------------
  const darkVariant = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "dark:bg-red-500";
    document.body.appendChild(probe);
    const bg = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { themeAttr: document.documentElement.getAttribute("data-theme"), bg };
  });
  console.log(
    `[dark]    data-theme="${darkVariant.themeAttr}", dark:bg-red-500 resolves to ${darkVariant.bg} (expect a red, not transparent)`,
  );

  // ---- 4. --text-* tokens still generate utilities ---------------------
  const tokens = await page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const cls of ["text-2xs", "text-label", "text-caption"]) {
      const probe = document.createElement("div");
      probe.className = cls;
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      out[cls] = `${cs.fontSize} / ${cs.lineHeight}`;
      probe.remove();
    }
    return out;
  });
  console.log(
    `[tokens]  text-2xs ${tokens["text-2xs"]} | text-label ${tokens["text-label"]} | text-caption ${tokens["text-caption"]}`,
  );

  // ---- 5. Landing MONO kicker contrast ---------------------------------
  const mono = await page.evaluate(
    new Function(`
      ${CONTRAST_HELPERS}
      var els = [...document.querySelectorAll("*")].filter(function(e){
        return e.className && typeof e.className === "string"
          && /font-mono/.test(e.className) && /tracking-\\[0\\.2em\\]/.test(e.className)
          && e.textContent && e.textContent.trim().length > 1;
      });
      return els.slice(0, 8).map(function(e){
        var cs = getComputedStyle(e);
        return {
          text: e.textContent.trim().slice(0, 34),
          size: cs.fontSize,
          color: cs.color,
          contrast: Number(__ratio(__parse(cs.color), __bgOf(e)).toFixed(2))
        };
      });
    `) as () => unknown,
  );
  console.log(`[mono]    landing kicker samples:`);
  for (const m of mono as Array<Record<string, unknown>>) {
    console.log(
      `            ${String(m.contrast).padStart(5)}:1  ${m.size}  ${m.color}  "${m.text}"`,
    );
  }

  // ---- 6. Authenticated checks: prose + MUTED normalization ------------
  await page.goto(await mintSignInUrl(), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page
    .waitForURL((u) => u.hostname.includes("fantasyfootballrivals.com") && !u.pathname.includes("sign-in"), {
      timeout: 90_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(3000);

  await page.goto(`${BASE}/rfsn/stories`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(4000);
  const prose = await page.evaluate(() => {
    const el = document.querySelector('[class*="prose"]');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const p = el.querySelector("p");
    const pcs = p ? getComputedStyle(p) : null;
    return {
      found: true,
      classes: (el.className as string).slice(0, 90),
      maxWidth: cs.maxWidth,
      paraSize: pcs?.fontSize ?? null,
      paraLeading: pcs?.lineHeight ?? null,
      paraMargin: pcs?.marginBottom ?? null,
    };
  });
  console.log(`[prose]   /rfsn/stories → ${JSON.stringify(prose)}`);

  // MUTED constant pages: the hardcoded rgb(139,151,168) should be gone from
  // inline styles, replaced by the token's oklch.
  for (const route of ["/rivals/rivalries", "/league-dna", "/dashboard"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 90_000 });
    await page.waitForTimeout(4000);
    const counts = await page.evaluate(() => {
      let hardcoded = 0,
        token = 0;
      for (const el of document.querySelectorAll<HTMLElement>("[style]")) {
        const inline = el.style.color;
        if (!inline) continue;
        if (/var\(--color-muted-foreground\)/.test(inline)) token++;
        else if (/#8b97a8/i.test(inline)) hardcoded++;
      }
      return { hardcoded, token };
    });
    console.log(
      `[muted]   ${route.padEnd(20)} inline color=#8b97a8: ${counts.hardcoded}, inline color=var(token): ${counts.token}`,
    );
  }

  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
