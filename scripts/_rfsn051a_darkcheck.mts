/**
 * RFSN-051A — did enabling the `dark:` variant change any component's readability?
 * Activating it turns on stock shadcn rules that had never applied, notably
 * `dark:text-muted-foreground` on inactive tabs and `dark:bg-input/30` on fields.
 *
 *   pnpm exec tsx scripts/_rfsn051a_darkcheck.mts
 */
import "dotenv/config";
import { chromium, type Page } from "playwright";

const BASE = (
  process.env.QA_BASE ?? "https://sprint-8-preview.fantasyfootballrivals.com"
).replace(/\/$/, "");
const FOUNDER_CLERK_ID =
  process.env.SMOKE_CLERK_USER_ID ?? "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo";

const PROBE = `(function(){
  var cv = document.createElement("canvas"); cv.width = cv.height = 1;
  var cx = cv.getContext("2d", { willReadFrequently: true });
  function parse(c){ cx.clearRect(0,0,1,1); cx.fillStyle="#000"; cx.fillStyle=c; cx.fillRect(0,0,1,1);
    var d = cx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255]; }
  function lum(r){ var f=[r[0],r[1],r[2]].map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2]; }
  function over(f,b){ var a=f[3]; return [f[0]*a+b[0]*(1-a), f[1]*a+b[1]*(1-a), f[2]*a+b[2]*(1-a),1]; }
  function bgOf(el){ var n=el; while(n && n!==document.documentElement){ var c=parse(getComputedStyle(n).backgroundColor);
    if(c[3]>0.85) return c; n=n.parentElement; } return [10,8,12,1]; }
  function contrast(el){ var b=bgOf(el); var f=over(parse(getComputedStyle(el).color), b);
    var l1=lum(f), l2=lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); }

  var out = { tabs: [], inputs: [], destructive: [] };
  document.querySelectorAll('[role="tab"]').forEach(function(t){
    if (out.tabs.length >= 6) return;
    var cs = getComputedStyle(t);
    out.tabs.push({
      label: (t.textContent||"").trim().slice(0,22),
      state: t.getAttribute("data-state"),
      color: cs.color,
      size: cs.fontSize,
      contrast: Number(contrast(t).toFixed(2))
    });
  });
  document.querySelectorAll("input,textarea").forEach(function(i){
    if (out.inputs.length >= 5) return;
    if (i.offsetParent === null) return;
    var cs = getComputedStyle(i);
    out.inputs.push({
      type: i.getAttribute("type") || i.tagName.toLowerCase(),
      bg: cs.backgroundColor,
      border: cs.borderTopColor,
      size: cs.fontSize
    });
  });
  return out;
})()`;

async function mintSignInUrl(): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error("CLERK_SECRET_KEY missing");
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: FOUNDER_CLERK_ID, expires_in_seconds: 900 }),
  });
  const data = (await res.json()) as { url?: string; token?: string };
  if (data.url) {
    const u = new URL(data.url);
    u.protocol = "https:";
    u.host = new URL(BASE).host;
    return u.toString();
  }
  return `${BASE}/sign-in#__clerk_ticket=${data.token}`;
}

async function settle(page: Page, ms = 4000) {
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => undefined);
  await page.waitForTimeout(ms);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();

  await page.goto(await mintSignInUrl(), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForURL(
    (u) => u.hostname.includes("fantasyfootballrivals.com") && !u.pathname.includes("sign-in"),
    { timeout: 90_000 },
  );
  await page.waitForTimeout(2500);

  for (const route of ["/connected-leagues", "/settings"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await settle(page, 4000);
    const r = (await page.evaluate(PROBE)) as {
      tabs: Array<Record<string, unknown>>;
      inputs: Array<Record<string, unknown>>;
    };
    console.log(`\n── ${route}`);
    for (const t of r.tabs)
      console.log(
        `   tab   [${String(t.state).padEnd(8)}] ${String(t.contrast).padStart(6)}:1  ${t.size}  ${t.color}  "${t.label}"`,
      );
    for (const i of r.inputs)
      console.log(`   input ${String(i.type).padEnd(10)} bg=${i.bg}  border=${i.border}  ${i.size}`);
    if (!r.tabs.length && !r.inputs.length) console.log("   (no tabs or inputs rendered)");
  }

  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
