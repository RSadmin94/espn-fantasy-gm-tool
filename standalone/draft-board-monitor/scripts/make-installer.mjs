// Generates dist/install-mirror.html — a drag-to-bookmarks installer carrying the FULL bundle.
// Helper artifact only; not app source. Run: node scripts/make-installer.mjs (from package root)
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const iifePath = path.join(root, "dist", "draft-board-monitor.iife.js");
const outPath = path.join(root, "dist", "install-mirror.html");

const code = fs.readFileSync(iifePath, "utf8");
const href = "javascript:" + encodeURIComponent(code);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>ESPN Board Mirror — Install</title>
<style>
body{font-family:Segoe UI,system-ui,sans-serif;background:#0d0d12;color:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0}
a.bm{display:inline-block;background:#7c3aed;color:#fff;font-weight:700;font-size:20px;padding:16px 34px;border-radius:12px;text-decoration:none;cursor:grab}
p{max-width:520px;line-height:1.5;color:#bbb;text-align:center}
strong{color:#fff}
</style></head><body>
<h1>ESPN Board Mirror</h1>
<p><strong>Drag the purple button</strong> up onto your Chrome <strong>bookmarks bar</strong>. Do this once.</p>
<a class="bm" href="${href.replace(/"/g, "&quot;")}">📋 Board Mirror</a>
<p>Then, during any ESPN draft: open the draft room tab and <strong>click the bookmark</strong>. The mirror board opens in its own window. Don't click the button on this page — drag it.</p>
<p style="color:#777;font-size:13px">Bundle size: ${code.length.toLocaleString()} chars · generated ${new Date().toISOString().slice(0,16).replace("T"," ")}</p>
</body></html>`;

fs.writeFileSync(outPath, html);
console.log("[installer] wrote", outPath, "href length:", href.length);
