/**
 * Summarise the stabilised census: the Phase 2 (RFSN-051B/C) starting point.
 *
 *   pnpm exec tsx scripts/_rfsn051a_baseline_summary.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("audit-artifacts/rfsn-051");
type Node = { fontSize: number; contrast: number; isLarge: boolean; cls?: string; color: string };
type Row = { route: string; settled?: boolean; responsive?: boolean; nodes?: Node[] };

const rows = (JSON.parse(readFileSync(path.join(OUT, "census.json"), "utf8")).results as Row[])
  .filter((r) => !r.responsive && r.nodes);

const settled = rows.filter((r) => r.settled);
console.log(`Routes: ${rows.length}, settled: ${settled.length}, unsettled: ${rows.length - settled.length}\n`);

let total = 0, tiny = 0, small = 0, low = 0, severe = 0;
const bySize = new Map<number, number>();
for (const r of settled) {
  for (const n of r.nodes!) {
    total++;
    bySize.set(n.fontSize, (bySize.get(n.fontSize) ?? 0) + 1);
    if (n.fontSize < 12) tiny++;
    else if (n.fontSize < 14) small++;
    if (n.isLarge ? n.contrast < 3 : n.contrast < 4.5) low++;
    if (n.isLarge ? n.contrast < 2 : n.contrast < 3) severe++;
  }
}
console.log(`Text nodes         ${total}`);
console.log(`Sub-12px           ${tiny}  (${((tiny / total) * 100).toFixed(1)}%)`);
console.log(`12-14px            ${small}  (${((small / total) * 100).toFixed(1)}%)`);
console.log(`Contrast below AA  ${low}  (${((low / total) * 100).toFixed(1)}%)`);
console.log(`Severe (<3:1)      ${severe}\n`);

console.log("Font-size histogram (px → nodes):");
[...bySize.entries()]
  .sort((a, b) => a[0] - b[0])
  .filter(([px]) => px < 16)
  .forEach(([px, n]) => console.log(`  ${String(px).padStart(6)}  ${String(n).padStart(5)}  ${"#".repeat(Math.min(60, Math.round(n / 60)))}`));

console.log("\nWorst routes by sub-12px count (RFSN-051C targets):");
settled
  .map((r) => ({
    route: r.route,
    tiny: r.nodes!.filter((n) => n.fontSize < 12).length,
    total: r.nodes!.length,
  }))
  .sort((a, b) => b.tiny - a.tiny)
  .slice(0, 12)
  .forEach((r) =>
    console.log(
      `  ${r.route.padEnd(36)} ${String(r.tiny).padStart(5)} / ${String(r.total).padStart(5)}  (${((r.tiny / r.total) * 100).toFixed(0)}%)`,
    ),
  );

console.log("\nMost common sub-12px colours (RFSN-051B token check):");
const colors = new Map<string, number>();
for (const r of settled)
  for (const n of r.nodes!) if (n.fontSize < 12) colors.set(n.color, (colors.get(n.color) ?? 0) + 1);
[...colors.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([c, n]) => console.log(`  ${c.padEnd(34)} ${n}`));

process.exit(0);
