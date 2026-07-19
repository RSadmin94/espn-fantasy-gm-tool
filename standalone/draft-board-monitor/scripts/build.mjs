/**
 * Bundle standalone Draft Board Monitor as a browser IIFE.
 * Usage: node standalone/draft-board-monitor/scripts/build.mjs
 */
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "dist", "draft-board-monitor.iife.js");

await esbuild.build({
  entryPoints: [path.join(root, "src", "draft-monitor", "browserEntry.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  outfile,
  minify: false,
  sourcemap: true,
  logLevel: "info",
});

const code = fs.readFileSync(outfile, "utf8");
const bookmarklet = `javascript:${encodeURIComponent(code + ";void 0;")}`;
fs.writeFileSync(
  path.join(root, "dist", "bookmarklet.txt"),
  bookmarklet.slice(0, 2000) + (bookmarklet.length > 2000 ? "\n/* truncated — use install.html console snippet for full bundle */\n" : ""),
  "utf8",
);

// Console paste helper (more reliable than giant bookmarklets)
const paste = `(() => {\n${code}\n})();`;
fs.writeFileSync(path.join(root, "dist", "console-paste.js"), paste, "utf8");

console.log(`[draft-board-monitor] wrote ${outfile}`);
console.log(`[draft-board-monitor] wrote dist/console-paste.js (${paste.length} chars)`);
