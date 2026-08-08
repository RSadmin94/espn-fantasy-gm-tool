/** RFSN-051A — does var() resolve in an SVG presentation attribute? */
import { chromium } from "playwright";

const BASE = "https://sprint-8-preview.fantasyfootballrivals.com";

const SRC = `(() => {
  var ns = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "100"); svg.setAttribute("height", "40");

  var a = document.createElementNS(ns, "text");
  a.setAttribute("fill", "var(--color-muted-foreground)");
  a.textContent = "attr-var";

  var b = document.createElementNS(ns, "text");
  b.setAttribute("style", "fill: var(--color-muted-foreground)");
  b.textContent = "style-var";

  var c = document.createElementNS(ns, "text");
  c.setAttribute("fill", "#8b97a8");
  c.textContent = "attr-hex";

  svg.appendChild(a); svg.appendChild(b); svg.appendChild(c);
  document.body.appendChild(svg);

  var out = {
    attrVar: getComputedStyle(a).fill,
    styleVar: getComputedStyle(b).fill,
    attrHex: getComputedStyle(c).fill,
    tokenValue: getComputedStyle(document.documentElement).getPropertyValue("--color-muted-foreground").trim()
  };
  svg.remove();
  return out;
})()`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2000);
  console.log(JSON.stringify(await page.evaluate(SRC), null, 2));
  await browser.close();
  process.exit(0);
}
main();
