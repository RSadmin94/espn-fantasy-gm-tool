/**
 * RFSN-053G — Rasterize ShareCardRenderer HTML to PNG (server-side Playwright).
 * Cache key = visual hash + theme + layout + renderer version + scale.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Express, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import {
  SHARE_CARD_EXPORT_ERROR,
  SHARE_CARD_RENDERER_VERSION,
  isShareCardScale,
  parseShareCardModel,
  shareCardExportFilename,
  shareCardExportSize,
  shareCardVisualHashInput,
  type ShareCardScale,
} from "@shared/shareCardExport";
import type { ShareCardModel } from "@shared/historicalShareCard";
import { buildShareCardExportHtml } from "./shareCardHtml";

const memoryCache = new Map<string, Buffer>();
const MEMORY_MAX = 40;

export type ShareCardRasterize = (
  html: string,
  size: { width: number; height: number; scale: ShareCardScale },
) => Promise<Buffer>;

let rasterizeImpl: ShareCardRasterize = playwrightRasterize;

export function setShareCardRasterizeForTests(fn: ShareCardRasterize | null): void {
  rasterizeImpl = fn ?? playwrightRasterize;
}

export function shareCardCacheKey(model: ShareCardModel, scale: ShareCardScale): string {
  const payload = JSON.stringify({
    visual: shareCardVisualHashInput(model),
    theme: model.theme,
    layout: model.layout,
    scale,
    renderer: SHARE_CARD_RENDERER_VERSION,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function readPngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (buf.subarray(0, 8).toString("binary") !== "\u0089PNG\r\n\u001a\n") return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function isPngBuffer(buf: Buffer): boolean {
  return buf.length >= 24 && buf.subarray(0, 8).toString("binary") === "\u0089PNG\r\n\u001a\n";
}

function cacheDir(): string {
  const dir = path.join(os.tmpdir(), "ffr-share-card-png");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cachePath(key: string): string {
  return path.join(cacheDir(), `${key}.png`);
}

function remember(key: string, buf: Buffer): void {
  memoryCache.set(key, buf);
  if (memoryCache.size > MEMORY_MAX) {
    const first = memoryCache.keys().next().value;
    if (typeof first === "string") memoryCache.delete(first);
  }
  try {
    fs.writeFileSync(cachePath(key), buf);
  } catch {
    /* disk cache is best-effort */
  }
}

function lookup(key: string): Buffer | null {
  const mem = memoryCache.get(key);
  if (mem) return mem;
  try {
    const file = cachePath(key);
    if (!fs.existsSync(file)) return null;
    const buf = fs.readFileSync(file);
    if (!isPngBuffer(buf)) return null;
    memoryCache.set(key, buf);
    return buf;
  } catch {
    return null;
  }
}

function resolveChromiumExecutable(): string | undefined {
  const envPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || process.env.CHROMIUM_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) return envPath;
  for (const candidate of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/bin/chromium"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const cmd =
      process.platform === "win32"
        ? "where chromium 2>nul"
        : "command -v chromium || command -v chromium-browser || true";
    const found = execSync(cmd, {
      encoding: "utf8",
      shell: process.platform === "win32" ? undefined : "/bin/sh",
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && fs.existsSync(line));
    if (found) return found;
  } catch {
    /* fall through to Playwright's bundled Chromium */
  }
  return undefined;
}

async function playwrightRasterize(
  html: string,
  size: { width: number; height: number; scale: ShareCardScale },
): Promise<Buffer> {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH?.trim() && fs.existsSync("/app/ms-playwright")) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = "/app/ms-playwright";
  }
  const { chromium } = await import("playwright");
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: size.width / size.scale, height: size.height / size.scale },
      deviceScaleFactor: size.scale,
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => undefined);
    await page.waitForSelector("[data-share-card-root]", { timeout: 10_000 });
    const el = page.locator("[data-share-card-root]").first();
    const buf = await el.screenshot({ type: "png", omitBackground: false, animations: "disabled" });
    return Buffer.from(buf);
  } finally {
    await browser.close();
  }
}

export async function exportShareCardPng(
  model: ShareCardModel,
  scale: ShareCardScale = 2,
): Promise<{ png: Buffer; filename: string; cacheHit: boolean; key: string }> {
  const key = shareCardCacheKey(model, scale);
  const filename = shareCardExportFilename(model);
  const cached = lookup(key);
  if (cached) return { png: cached, filename, cacheHit: true, key };

  const html = buildShareCardExportHtml(model);
  const size = shareCardExportSize(model.layout, scale);
  const png = await rasterizeImpl(html, size);
  if (!isPngBuffer(png)) throw new Error(SHARE_CARD_EXPORT_ERROR);
  const dims = readPngSize(png);
  if (!dims || dims.width !== size.width || dims.height !== size.height) {
    throw new Error(SHARE_CARD_EXPORT_ERROR);
  }
  remember(key, png);
  return { png, filename, cacheHit: false, key };
}

export function clearShareCardPngCacheForTests(): void {
  memoryCache.clear();
  try {
    const dir = cacheDir();
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".png")) fs.unlinkSync(path.join(dir, f));
    }
  } catch {
    /* ignore */
  }
}

export function registerShareCardPng(app: Express): void {
  app.post("/api/share-card/png", async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth.userId) {
        res.status(401).json({ error: SHARE_CARD_EXPORT_ERROR });
        return;
      }
      const model = parseShareCardModel(req.body?.model);
      const scale = isShareCardScale(req.body?.scale) ? req.body.scale : 2;
      if (!model) {
        res.status(400).json({ error: SHARE_CARD_EXPORT_ERROR });
        return;
      }
      const out = await exportShareCardPng(model, scale);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
      res.setHeader("X-Share-Card-Cache", out.cacheHit ? "hit" : "miss");
      res.setHeader("X-Share-Card-Key", out.key);
      res.setHeader("X-Share-Card-Renderer", SHARE_CARD_RENDERER_VERSION);
      res.status(200).send(out.png);
    } catch (err) {
      console.error("[share-card-png]", err instanceof Error ? err.stack || err.message : err);
      if (!res.headersSent) {
        res.status(500).json({ error: SHARE_CARD_EXPORT_ERROR });
      }
    }
  });
}
