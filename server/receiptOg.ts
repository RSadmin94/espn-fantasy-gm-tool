// OG image + meta for shareable DNA Receipts.
//
// /api/receipt-og/:token  -> 1200x630 PNG (hand-rendered SVG, rasterized by resvg).
// /p/:token (production)   -> index.html with og:/twitter: meta injected so the link
//                             unfurls richly in Discord / iMessage / X. The SPA still
//                             boots normally for human visitors.
//
// Token stays stateless (the frozen snapshot is inside it); no DB, no migration.
import fs from "fs";
import path from "path";
import type { Express, Request, Response, NextFunction } from "express";
import { verifyReceipt, type ReceiptPayload } from "./receiptToken";

// Fonts: Poppins, shipped in client/public/fonts -> dist/public/fonts on build.
// resvg loads fonts from directories (no buffer API in 2.6.x), so we resolve the dir.
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
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function htmlAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function clamp(s: string, n: number): string {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "..." : t;
}

// SVG card (1200x630)
const W = 1200, H = 630;
const C = { gold: "#f5c518", lime: "#a3e635", muted: "#8b97a8", text: "#f3f8ff", ink: "#0b0809" };

function frame(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g1" cx="50%" cy="-8%" r="60%"><stop offset="0%" stop-color="rgba(245,197,24,0.14)"/><stop offset="100%" stop-color="rgba(245,197,24,0)"/></radialGradient>
    <radialGradient id="g2" cx="88%" cy="20%" r="55%"><stop offset="0%" stop-color="rgba(139,92,246,0.20)"/><stop offset="100%" stop-color="rgba(139,92,246,0)"/></radialGradient>
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
  <text x="72" y="470" font-family="Poppins" font-weight="400" font-size="32" fill="${C.muted}">Your archetype, your badges, your rank - pulled from your league's real history.</text>
  <rect x="72" y="540" width="300" height="58" rx="29" fill="${C.gold}"/>
  <text x="222" y="578" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="24" fill="${C.ink}">PULL YOUR RECEIPTS</text>
  <text x="${W - 72}" y="578" text-anchor="end" font-family="Poppins" font-weight="400" font-size="26" fill="${C.muted}">gmwarroom.online</text>`;
  return frame(inner);
}

function receiptCard(p: ReceiptPayload): string {
  const name = clamp(p.nm || "Manager", 24);
  const league = clamp(p.lg || "Your League", 42);
  const archetype = clamp(p.ar || "", 28);
  const rank = p.rk ? `#${p.rk[0]}/${p.rk[1]}` : "";
  const receipt = clamp(p.rc || "", 78);
  const champLabel = p.ch > 1 ? `${p.ch}x Champion` : p.ch === 1 ? "Champion" : "";
  const champYears = Array.isArray(p.cy) && p.cy.length ? p.cy.join(", ") : "";
  const champLine = champLabel ? (champYears ? `${champLabel}  \u00b7  ${champYears}` : champLabel) : "";
  const otherBadges = (p.bd || []).filter((b) => b.t !== "champion").map((b) => b.l);
  const badgeLine = clamp(otherBadges.join("   \u00b7   "), 60);

  const archetypeTspans =
    `<tspan fill="${C.lime}">${xml(archetype)}</tspan>` +
    (rank ? `<tspan fill="${C.muted}">   \u00b7   </tspan><tspan fill="${C.gold}">${xml(rank)}</tspan>` : "");

  let y = 452;
  let extra = "";
  if (champLine) {
    extra += `\n  <text x="72" y="${y}" font-family="Poppins" font-weight="700" font-size="38" fill="${C.gold}">${xml(champLine)}</text>`;
    y += 50;
  }
  if (badgeLine) {
    extra += `\n  <text x="72" y="${y}" font-family="Poppins" font-weight="700" font-size="28" fill="${C.gold}">${xml(badgeLine)}</text>`;
  }

  const inner = `
  <text x="72" y="92" font-family="Poppins" font-weight="700" font-size="25" letter-spacing="4" fill="${C.gold}">FANTASY FOOTBALL RIVALS</text>
  <text x="72" y="134" font-family="Poppins" font-weight="400" font-size="28" fill="${C.muted}">${xml(league)}</text>
  <text x="72" y="246" font-family="Poppins" font-weight="700" font-size="86" fill="${C.text}">${xml(name)}</text>
  <text x="72" y="322" font-family="Poppins" font-weight="700" font-size="50">${archetypeTspans}</text>
  <text x="72" y="384" font-family="Poppins" font-weight="400" font-size="30" fill="${C.muted}">${xml(receipt)}</text>${extra}
  <line x1="72" y1="538" x2="${W - 72}" y2="538" stroke="rgba(255,255,255,0.10)"/>
  <rect x="72" y="556" width="300" height="56" rx="28" fill="${C.gold}"/>
  <text x="222" y="592" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="23" fill="${C.ink}">PULL YOUR RECEIPTS</text>
  <text x="${W - 72}" y="592" text-anchor="end" font-family="Poppins" font-weight="400" font-size="26" fill="${C.muted}">gmwarroom.online</text>`;
  return frame(inner);
}

export function receiptSvg(p: ReceiptPayload | null): string {
  return p ? receiptCard(p) : fallbackCard();
}

// OG / Twitter meta for /p/:token
function buildMeta(token: string, p: ReceiptPayload | null, origin: string): { title: string; meta: string } {
  const img = `${origin}/api/receipt-og/${encodeURIComponent(token)}`;
  let title: string, desc: string;
  if (p) {
    title = `${p.nm} - ${p.ar}`;
    const bits: string[] = [];
    if (p.rk) bits.push(`#${p.rk[0]} of ${p.rk[1]}`);
    if (p.ch > 0) bits.push(p.ch > 1 ? `${p.ch}x Champion` : "Champion");
    const tail = bits.length ? ` ${bits.join(" \u00b7 ")} \u00b7` : "";
    desc = `${p.ar} in ${p.lg}.${tail} Pull your receipts at Fantasy Football Rivals.`;
  } else {
    title = "Fantasy Football Rivals";
    desc = "Know your league. Own your rivals. Pull your receipts.";
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
export function injectReceiptMeta(html: string, token: string, p: ReceiptPayload | null, origin: string): string {
  const { title, meta } = buildMeta(token, p, origin);
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, "");
  out = out.replace(/\s*<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>/gi, "");
  out = out.replace("</head>", `    <title>${htmlAttr(title)}</title>\n    ${meta}\n  </head>`);
  return out;
}

export function registerReceiptOg(app: Express) {
  // 1) The PNG. resvg is lazy-imported so a render failure can never crash the server.
  app.get("/api/receipt-og/:token", async (req: Request, res: Response) => {
    try {
      const p = verifyReceipt(String(req.params.token || ""));
      const svg = receiptSvg(p);
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
      console.error("[receipt-og] render failed:", e);
      res.status(500).send("og render error");
    }
  });

  // 2) /p/:token -> index.html + injected meta (production only; dev lets Vite serve the SPA).
  app.get("/p/:token", async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === "development") return next();
    try {
      const token = String(req.params.token || "");
      const p = verifyReceipt(token);
      const indexPath = path.resolve(process.cwd(), "dist", "public", "index.html");
      const html = await fs.promises.readFile(indexPath, "utf-8");
      const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol || "https";
      const origin = `${proto}://${req.get("host")}`;
      res.status(200).type("html").send(injectReceiptMeta(html, token, p, origin));
    } catch (e) {
      console.error("[receipt-og] /p meta inject failed:", e);
      next();
    }
  });
}
