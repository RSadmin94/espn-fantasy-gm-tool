/**
 * OG / share images for Historical Receipts.
 * Formats: og (1200×630), square (1080×1080), portrait (1080×1350), story (1080×1920)
 */
import fs from "fs";
import path from "path";
import type { Express, Request, Response, NextFunction } from "express";
import {
  verifyHistoricalReceipt,
  payloadToPublicReceipt,
  type HistoricalReceiptSharePayload,
} from "./historicalReceiptShareToken";
import { formatSeasonWeekLabel } from "../shared/historicalReceipts";

const BRAND_HOST = "fantasyfootballrivals.com";

let FONT_DIR: string | null = null;
function fontDir(): string {
  if (FONT_DIR) return FONT_DIR;
  const dirs = [
    path.resolve(process.cwd(), "dist", "public", "fonts"),
    path.resolve(process.cwd(), "client", "public", "fonts"),
  ];
  FONT_DIR = dirs.find((d) => fs.existsSync(path.join(d, "Poppins-Bold.ttf"))) || dirs[0];
  return FONT_DIR;
}

function xml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function htmlAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function clamp(s: string, n: number): string {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "\u2026" : t;
}

export type ReceiptImageFormat = "og" | "square" | "portrait" | "story";

const FORMAT_SIZE: Record<ReceiptImageFormat, { w: number; h: number }> = {
  og: { w: 1200, h: 630 },
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

function parseFormat(raw: unknown): ReceiptImageFormat {
  const s = String(raw ?? "og").toLowerCase();
  if (s === "square" || s === "portrait" || s === "story" || s === "og") return s;
  return "og";
}

const C = { gold: "#f5c518", lime: "#a3e635", red: "#ef4444", muted: "#8b97a8", text: "#f3f8ff" };

function frame(w: number, h: number, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="g1" cx="50%" cy="-8%" r="60%"><stop offset="0%" stop-color="rgba(245,197,24,0.14)"/><stop offset="100%" stop-color="rgba(245,197,24,0)"/></radialGradient>
    <radialGradient id="g2" cx="88%" cy="20%" r="55%"><stop offset="0%" stop-color="rgba(239,68,68,0.18)"/><stop offset="100%" stop-color="rgba(239,68,68,0)"/></radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0809"/><stop offset="100%" stop-color="#060405"/></linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#g1)"/>
  <rect width="${w}" height="${h}" fill="url(#g2)"/>
  <rect x="24" y="24" width="${w - 48}" height="${h - 48}" rx="24" fill="none" stroke="rgba(255,255,255,0.08)"/>
  ${inner}
</svg>`;
}

export function historicalReceiptSvg(
  p: HistoricalReceiptSharePayload | null,
  format: ReceiptImageFormat = "og",
): string {
  const { w, h } = FORMAT_SIZE[format];
  if (!p) {
    return frame(
      w,
      h,
      `
  <text x="72" y="96" font-family="Poppins" font-weight="700" font-size="26" letter-spacing="4" fill="${C.gold}">FANTASY FOOTBALL RIVALS</text>
  <text x="72" y="${Math.round(h * 0.42)}" font-family="Poppins" font-weight="700" font-size="64" fill="${C.text}">Historical Receipt</text>
  <text x="72" y="${Math.round(h * 0.52)}" font-family="Poppins" font-weight="400" font-size="28" fill="${C.muted}">Import your league. Own your rivals.</text>
  <text x="${w - 72}" y="${h - 52}" text-anchor="end" font-family="Poppins" font-weight="400" font-size="24" fill="${C.muted}">${BRAND_HOST}</text>`,
    );
  }

  const tone = p.tn === "good" ? C.lime : C.red;
  const when = formatSeasonWeekLabel(p.se, p.wk);
  const headlineSize = format === "og" ? 48 : format === "story" ? 56 : 52;
  const resultSize = format === "og" ? 36 : 40;
  const whyY = format === "og" ? h - 140 : Math.round(h * 0.72);

  const inner = `
  <text x="72" y="88" font-family="Poppins" font-weight="700" font-size="22" letter-spacing="3" fill="${C.gold}">FANTASY FOOTBALL RIVALS</text>
  <text x="72" y="130" font-family="Poppins" font-weight="600" font-size="20" fill="${tone}">${xml(clamp(p.tl.toUpperCase(), 40))}</text>
  <text x="72" y="210" font-family="Poppins" font-weight="700" font-size="${headlineSize}" fill="${C.text}">${xml(clamp(p.hl, format === "og" ? 42 : 36))}</text>
  <text x="72" y="270" font-family="Poppins" font-weight="700" font-size="${resultSize}" fill="${C.lime}">${xml(clamp(p.cr, 48))}</text>
  <text x="72" y="320" font-family="Poppins" font-weight="500" font-size="26" fill="${C.muted}">${xml(when)} · ${xml(clamp(p.lg, 40))}</text>
  <text x="72" y="${whyY}" font-family="Poppins" font-weight="700" font-size="18" letter-spacing="2" fill="${C.gold}">WHY THIS MATTERS</text>
  <text x="72" y="${whyY + 40}" font-family="Poppins" font-weight="400" font-size="24" fill="${C.text}">${xml(clamp(p.wm, format === "og" ? 70 : 90))}</text>
  <text x="${w - 72}" y="${h - 52}" text-anchor="end" font-family="Poppins" font-weight="400" font-size="22" fill="${C.muted}">${BRAND_HOST}</text>`;

  return frame(w, h, inner);
}

function buildMeta(shareCode: string, p: HistoricalReceiptSharePayload | null, origin: string): { title: string; meta: string } {
  const img = `${origin}/api/share/historical-receipt/${encodeURIComponent(shareCode)}/image?format=og`;
  const url = `${origin}/historical-receipt/${encodeURIComponent(shareCode)}`;
  if (!p) {
    const title = "Historical Receipt | Fantasy Football Rivals";
    const desc = "League history receipts from Fantasy Football Rivals.";
    return {
      title,
      meta: [
        `<meta property="og:type" content="website"/>`,
        `<meta property="og:title" content="${htmlAttr(title)}"/>`,
        `<meta property="og:description" content="${htmlAttr(desc)}"/>`,
        `<meta property="og:url" content="${htmlAttr(url)}"/>`,
        `<meta property="og:image" content="${htmlAttr(img)}"/>`,
        `<meta property="og:image:width" content="1200"/>`,
        `<meta property="og:image:height" content="630"/>`,
        `<meta name="twitter:card" content="summary_large_image"/>`,
        `<meta name="twitter:title" content="${htmlAttr(title)}"/>`,
        `<meta name="twitter:description" content="${htmlAttr(desc)}"/>`,
        `<meta name="twitter:image" content="${htmlAttr(img)}"/>`,
      ].join("\n    "),
    };
  }
  const pub = payloadToPublicReceipt(p);
  const title = `${pub.headline} | Fantasy Football Rivals`;
  const desc = `${pub.centralResult} · ${pub.whenLabel} · ${pub.leagueName}`;
  return {
    title,
    meta: [
      `<meta property="og:type" content="website"/>`,
      `<meta property="og:title" content="${htmlAttr(title)}"/>`,
      `<meta property="og:description" content="${htmlAttr(desc)}"/>`,
      `<meta property="og:url" content="${htmlAttr(url)}"/>`,
      `<meta property="og:image" content="${htmlAttr(img)}"/>`,
      `<meta property="og:image:width" content="1200"/>`,
      `<meta property="og:image:height" content="630"/>`,
      `<meta name="twitter:card" content="summary_large_image"/>`,
      `<meta name="twitter:title" content="${htmlAttr(title)}"/>`,
      `<meta name="twitter:description" content="${htmlAttr(desc)}"/>`,
      `<meta name="twitter:image" content="${htmlAttr(img)}"/>`,
    ].join("\n    "),
  };
}

function injectMeta(html: string, shareCode: string, p: HistoricalReceiptSharePayload | null, origin: string): string {
  const { title, meta } = buildMeta(shareCode, p, origin);
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, "");
  out = out.replace(/\s*<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>/gi, "");
  out = out.replace("</head>", `    <title>${htmlAttr(title)}</title>\n    ${meta}\n  </head>`);
  return out;
}

export function registerHistoricalReceiptOg(app: Express) {
  app.get("/api/share/historical-receipt/:shareCode/image", async (req: Request, res: Response) => {
    try {
      const format = parseFormat(req.query.format);
      const { w } = FORMAT_SIZE[format];
      const p = verifyHistoricalReceipt(String(req.params.shareCode || ""));
      const svg = historicalReceiptSvg(p, format);
      const { Resvg } = await import("@resvg/resvg-js");
      const r = new Resvg(svg, {
        fitTo: { mode: "width", value: w },
        font: { fontDirs: [fontDir()], loadSystemFonts: false, defaultFontFamily: "Poppins" },
      });
      const png = r.render().asPng();
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.status(200).end(png);
    } catch (e) {
      console.error("[historical-receipt-og] render failed:", e);
      res.status(500).send("og render error");
    }
  });

  app.get("/historical-receipt/:shareCode", async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === "development") return next();
    try {
      const shareCode = String(req.params.shareCode || "");
      const p = verifyHistoricalReceipt(shareCode);
      const indexPath = path.resolve(process.cwd(), "dist", "public", "index.html");
      const html = await fs.promises.readFile(indexPath, "utf-8");
      const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol || "https";
      const origin = `${proto}://${req.get("host")}`;
      res.status(200).type("html").send(injectMeta(html, shareCode, p, origin));
    } catch (e) {
      console.error("[historical-receipt-og] meta inject failed:", e);
      next();
    }
  });
}
