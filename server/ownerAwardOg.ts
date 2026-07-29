/**
 * OG / Twitter meta injection + optional image for public Owner Award shares.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { readFileSync } from "fs";
import { join } from "path";
import { Resvg } from "@resvg/resvg-js";
import { verifyOwnerAwardShare, type OwnerAwardSharePayload } from "./ownerAwardShareToken";
import { getOwnerAwardMetaById } from "../shared/ownerAwardMeta";

function xml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clamp(t: string, n: number): string {
  const s = String(t ?? "");
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "\u2026" : s;
}

function originOf(req: Request): string {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost");
  return `${proto}://${host}`;
}

function renderSvg(p: OwnerAwardSharePayload): string {
  const meta = getOwnerAwardMetaById(p.id);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#120c10"/>
      <stop offset="100%" stop-color="#060405"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="72" y="88" font-family="Poppins, system-ui, sans-serif" font-weight="700" font-size="22" fill="#f5c518" letter-spacing="3">FANTASY FOOTBALL RIVALS</text>
  <text x="72" y="128" font-family="Poppins, system-ui, sans-serif" font-weight="700" font-size="18" fill="#c084fc" letter-spacing="2">${xml((meta?.rarity ?? p.ry).toUpperCase())}</text>
  <text x="72" y="210" font-family="Poppins, system-ui, sans-serif" font-weight="800" font-size="48" fill="#f8fafc">${xml(clamp(p.dn, 40))}</text>
  <text x="72" y="270" font-family="Poppins, system-ui, sans-serif" font-weight="500" font-size="26" fill="#a3e635">${xml(clamp(p.hn ? `Held by ${p.hn}` : "Award Catalog", 48))}</text>
  <text x="72" y="320" font-family="Poppins, system-ui, sans-serif" font-weight="400" font-size="22" fill="#94a3b8">${xml(clamp(p.lg, 50))}</text>
  <text x="72" y="420" font-family="Poppins, system-ui, sans-serif" font-weight="600" font-size="18" fill="#f5c518">WHY THIS MATTERS</text>
  <text x="72" y="460" font-family="Poppins, system-ui, sans-serif" font-weight="400" font-size="24" fill="#e2e8f0">${xml(clamp(p.sd, 70))}</text>
  <text x="72" y="580" font-family="Poppins, system-ui, sans-serif" font-weight="500" font-size="18" fill="#64748b">fantasyfootballrivals.com</text>
</svg>`;
}

function buildMeta(shareCode: string, p: OwnerAwardSharePayload | null, origin: string) {
  if (!p) {
    return {
      title: "Owner Award | Fantasy Football Rivals",
      meta: `
<meta property="og:type" content="website"/>
<meta property="og:title" content="Owner Award | Fantasy Football Rivals"/>
<meta property="og:description" content="League awards from Fantasy Football Rivals."/>
<meta name="twitter:card" content="summary_large_image"/>`,
    };
  }
  const img = `${origin}/api/share/owner-award/${encodeURIComponent(shareCode)}/image`;
  const url = `${origin}/owner-award/${encodeURIComponent(shareCode)}`;
  const title = `${p.dn} | Fantasy Football Rivals`;
  const desc = p.hn
    ? `${p.hn} holds ${p.dn} · ${p.lg}`
    : `${p.sd} · ${p.lg}`;
  return {
    title,
    meta: `
<meta property="og:type" content="website"/>
<meta property="og:title" content="${xml(title)}"/>
<meta property="og:description" content="${xml(desc)}"/>
<meta property="og:url" content="${xml(url)}"/>
<meta property="og:image" content="${xml(img)}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${xml(title)}"/>
<meta name="twitter:description" content="${xml(desc)}"/>
<meta name="twitter:image" content="${xml(img)}"/>`,
  };
}

function injectMeta(html: string, shareCode: string, p: OwnerAwardSharePayload | null, origin: string): string {
  const { title, meta } = buildMeta(shareCode, p, origin);
  return html
    .replace(/<title>[^<]*<\/title>/i, `<title>${xml(title)}</title>`)
    .replace("</head>", `${meta}\n</head>`);
}

export function registerOwnerAwardOg(app: Express) {
  app.get("/api/share/owner-award/:shareCode/image", async (req: Request, res: Response) => {
    try {
      const p = verifyOwnerAwardShare(String(req.params.shareCode || ""));
      if (!p) {
        res.status(404).type("text").send("Not found");
        return;
      }
      const svg = renderSvg(p);
      const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(Buffer.from(png));
    } catch (e) {
      console.error("[owner-award-og] render failed:", e);
      res.status(500).type("text").send("Render failed");
    }
  });

  app.get("/owner-award/:shareCode", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (process.env.NODE_ENV === "development") return next();
      const shareCode = String(req.params.shareCode || "");
      const p = verifyOwnerAwardShare(shareCode);
      const origin = originOf(req);
      const htmlPath = join(process.cwd(), "dist", "public", "index.html");
      const html = readFileSync(htmlPath, "utf8");
      res.status(200).type("html").send(injectMeta(html, shareCode, p, origin));
    } catch (e) {
      console.error("[owner-award-og] meta inject failed:", e);
      next();
    }
  });
}
