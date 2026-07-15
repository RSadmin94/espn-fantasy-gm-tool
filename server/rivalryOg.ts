// OG image + meta for shareable Rivalries.
//
// /api/share/rivalry/:shareCode/image -> 1200x630 PNG (hand-rendered SVG, rasterized by resvg).
// /rivalry/:shareCode (production)     -> index.html with og:/twitter: meta injected so the
//                                         link unfurls richly in iMessage / Discord / X / FB.
//                                         The SPA still boots normally for human visitors.
//
// The share code IS a stateless signed token (frozen snapshot inside it); no DB, no migration.
// Mirrors receiptOg.ts.
import fs from "fs";
import path from "path";
import type { Express, Request, Response, NextFunction } from "express";
import { verifyRivalry, type RivalrySharePayload } from "./rivalryShareToken";

const BRAND_HOST = "fantasyfootballrivals.com";

// Fonts: Poppins, shipped in client/public/fonts -> dist/public/fonts on build.
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

// ── SVG card (1200x630) ─────────────────────────────────────────────────────
const W = 1200, H = 630;
const C = { gold: "#f5c518", lime: "#a3e635", red: "#ef4444", muted: "#8b97a8", text: "#f3f8ff", ink: "#0b0809" };

function frame(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g1" cx="50%" cy="-8%" r="60%"><stop offset="0%" stop-color="rgba(245,197,24,0.14)"/><stop offset="100%" stop-color="rgba(245,197,24,0)"/></radialGradient>
    <radialGradient id="g2" cx="88%" cy="20%" r="55%"><stop offset="0%" stop-color="rgba(239,68,68,0.20)"/><stop offset="100%" stop-color="rgba(239,68,68,0)"/></radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0809"/><stop offset="100%" stop-color="#060405"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="24" fill="none" stroke="rgba(255,255,255,0.08)"/>
  ${inner}
</svg>`;
}

function fallbackCard(): string {
  const inner = `
  <text x="72" y="96" font-family="Poppins" font-weight="700" font-size="26" letter-spacing="4" fill="${C.gold}">FANTASY FOOTBALL RIVALS</text>
  <text x="72" y="300" font-family="Poppins" font-weight="700" font-size="92" fill="${C.text}">Know your league.</text>
  <text x="72" y="392" font-family="Poppins" font-weight="700" font-size="92" fill="${C.lime}">Own your rivals.</text>
  <text x="72" y="470" font-family="Poppins" font-weight="400" font-size="32" fill="${C.muted}">Every head-to-head record, heat, and playoff scar — from your league's real history.</text>
  <text x="${W - 72}" y="578" text-anchor="end" font-family="Poppins" font-weight="400" font-size="26" fill="${C.muted}">${BRAND_HOST}</text>`;
  return frame(inner);
}

function rivalryCard(p: RivalrySharePayload): string {
  const league = clamp(p.lg || "Your League", 46);
  const a = clamp(p.an || "Owner A", 20);
  const b = clamp(p.bn || "Owner B", 20);
  const record = p.at > 0 ? `${p.aw}\u2013${p.al}\u2013${p.at}` : `${p.aw}\u2013${p.al}`;
  const meetings = `${p.tm} meeting${p.tm === 1 ? "" : "s"}`;
  const playoff = p.pw || p.pl ? `Playoffs ${p.pw}\u2013${p.pl}` : "";
  const heat = clamp(p.ht || "", 18).toUpperCase();
  const summary = clamp(p.sm || "", 74);

  let y = 470;
  let extra = "";
  if (summary) {
    extra += `\n  <text x="72" y="${y}" font-family="Poppins" font-weight="400" font-size="30" fill="${C.muted}">${xml(summary)}</text>`;
    y += 52;
  }

  const inner = `
  <text x="72" y="92" font-family="Poppins" font-weight="700" font-size="25" letter-spacing="4" fill="${C.gold}">FANTASY FOOTBALL RIVALS</text>
  <text x="72" y="134" font-family="Poppins" font-weight="400" font-size="28" fill="${C.muted}">${xml(league)}</text>
  <rect x="72" y="168" width="220" height="42" rx="21" fill="rgba(239,68,68,0.14)"/>
  <text x="182" y="196" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="20" letter-spacing="2" fill="${C.red}">${xml(heat)} RIVALRY</text>
  <text x="72" y="286" font-family="Poppins" font-weight="700" font-size="72" fill="${C.text}">${xml(a)}</text>
  <text x="72" y="350" font-family="Poppins" font-weight="700" font-size="34" fill="${C.muted}">vs</text>
  <text x="150" y="350" font-family="Poppins" font-weight="700" font-size="72" fill="${C.lime}">${xml(b)}</text>
  <text x="72" y="452" font-family="Poppins" font-weight="700" font-size="40" fill="${C.gold}">${xml(record)}</text>
  <text x="${72 + 12 + record.length * 26}" y="452" font-family="Poppins" font-weight="400" font-size="30" fill="${C.muted}">head-to-head \u00b7 ${xml(meetings)}${playoff ? " \u00b7 " + xml(playoff) : ""}</text>${extra}
  <line x1="72" y1="538" x2="${W - 72}" y2="538" stroke="rgba(255,255,255,0.10)"/>
  <rect x="72" y="556" width="470" height="56" rx="28" fill="${C.lime}"/>
  <text x="307" y="592" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="21" fill="${C.ink}">IMPORT YOUR LEAGUE \u00b7 FIND YOUR RIVAL</text>
  <text x="${W - 72}" y="592" text-anchor="end" font-family="Poppins" font-weight="400" font-size="26" fill="${C.muted}">${BRAND_HOST}</text>`;
  return frame(inner);
}

export function rivalrySvg(p: RivalrySharePayload | null): string {
  return p ? rivalryCard(p) : fallbackCard();
}

// ── OG / Twitter meta for /rivalry/:shareCode ────────────────────────────────
function buildMeta(shareCode: string, p: RivalrySharePayload | null, origin: string): { title: string; meta: string } {
  const img = `${origin}/api/share/rivalry/${encodeURIComponent(shareCode)}/image`;
  let title: string, desc: string;
  if (p) {
    const record = p.at > 0 ? `${p.aw}\u2013${p.al}\u2013${p.at}` : `${p.aw}\u2013${p.al}`;
    title = `${p.an} vs ${p.bn}`;
    const meetings = `${p.tm} meeting${p.tm === 1 ? "" : "s"}`;
    desc = `${record} head-to-head across ${meetings} in ${p.lg}. ${p.sm ? p.sm + " " : ""}Import your league and find your biggest rival at Fantasy Football Rivals.`;
  } else {
    title = "Fantasy Football Rivals";
    desc = "Know your league. Own your rivals. Import your league and find your biggest rival.";
  }
  const meta = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Fantasy Football Rivals" />`,
    `<meta property="og:title" content="${htmlAttr(title)}" />`,
    `<meta property="og:description" content="${htmlAttr(desc)}" />`,
    `<meta property="og:image" content="${htmlAttr(img)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${htmlAttr(title)}" />`,
    `<meta name="twitter:description" content="${htmlAttr(desc)}" />`,
    `<meta name="twitter:image" content="${htmlAttr(img)}" />`,
  ].join("\n    ");
  return { title: `${title} | Fantasy Football Rivals`, meta };
}

/** Pure transform: strip existing title + og/twitter meta, inject ours. Testable. */
export function injectRivalryMeta(html: string, shareCode: string, p: RivalrySharePayload | null, origin: string): string {
  const { title, meta } = buildMeta(shareCode, p, origin);
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, "");
  out = out.replace(/\s*<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>/gi, "");
  out = out.replace("</head>", `    <title>${htmlAttr(title)}</title>\n    ${meta}\n  </head>`);
  return out;
}

export function registerRivalryOg(app: Express) {
  // 1) The PNG. resvg is lazy-imported so a render failure can never crash the server.
  app.get("/api/share/rivalry/:shareCode/image", async (req: Request, res: Response) => {
    try {
      const p = verifyRivalry(String(req.params.shareCode || ""));
      const svg = rivalrySvg(p);
      const { Resvg } = await import("@resvg/resvg-js");
      const r = new Resvg(svg, {
        fitTo: { mode: "width", value: W },
        font: { fontDirs: [fontDir()], loadSystemFonts: false, defaultFontFamily: "Poppins" },
      });
      const png = r.render().asPng();
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.status(200).end(png);
    } catch (e) {
      console.error("[rivalry-og] render failed:", e);
      res.status(500).send("og render error");
    }
  });

  // 2) /rivalry/:shareCode -> index.html + injected meta (production only; dev uses Vite).
  app.get("/rivalry/:shareCode", async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === "development") return next();
    try {
      const shareCode = String(req.params.shareCode || "");
      const p = verifyRivalry(shareCode);
      const indexPath = path.resolve(process.cwd(), "dist", "public", "index.html");
      const html = await fs.promises.readFile(indexPath, "utf-8");
      const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol || "https";
      const origin = `${proto}://${req.get("host")}`;
      res.status(200).type("html").send(injectRivalryMeta(html, shareCode, p, origin));
    } catch (e) {
      console.error("[rivalry-og] /rivalry meta inject failed:", e);
      next();
    }
  });
}
