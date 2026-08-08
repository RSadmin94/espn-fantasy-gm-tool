/**
 * Which colours actually drive the AA failures? Determines whether raising
 * --color-muted-foreground (RFSN-051B) is sufficient on its own.
 *
 *   pnpm exec tsx scripts/_rfsn051a_contrast_targets.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("audit-artifacts/rfsn-051");
type Node = {
  fontSize: number;
  contrast: number;
  isLarge: boolean;
  color: string;
  cls?: string;
};
type Row = { route: string; settled?: boolean; responsive?: boolean; nodes?: Node[] };

const rows = (
  JSON.parse(readFileSync(path.join(OUT, "census.json"), "utf8")).results as Row[]
).filter((r) => !r.responsive && r.settled && r.nodes);

const fails: Node[] = [];
const all: Node[] = [];
for (const r of rows)
  for (const n of r.nodes!) {
    all.push(n);
    if (n.isLarge ? n.contrast < 3 : n.contrast < 4.5) fails.push(n);
  }

const byColor = new Map<string, { fails: number; total: number; minC: number; maxC: number }>();
for (const n of all) {
  const e = byColor.get(n.color) ?? { fails: 0, total: 0, minC: 99, maxC: 0 };
  e.total++;
  e.minC = Math.min(e.minC, n.contrast);
  e.maxC = Math.max(e.maxC, n.contrast);
  byColor.set(n.color, e);
}
for (const n of fails) byColor.get(n.color)!.fails++;

console.log(`AA failures: ${fails.length} of ${all.length} nodes\n`);
console.log("Colour                              fails  /  uses   contrast range");
[...byColor.entries()]
  .filter(([, e]) => e.fails > 0)
  .sort((a, b) => b[1].fails - a[1].fails)
  .slice(0, 15)
  .forEach(([c, e]) =>
    console.log(
      `${c.padEnd(36)} ${String(e.fails).padStart(5)}  / ${String(e.total).padStart(5)}   ${e.minC.toFixed(2)}–${e.maxC.toFixed(2)}:1`,
    ),
  );

// How much does the muted token alone account for?
const MUTED = "oklch(0.64 0.03 300)";
const mutedFails = byColor.get(MUTED)?.fails ?? 0;
const mutedUses = byColor.get(MUTED)?.total ?? 0;
console.log(
  `\n--color-muted-foreground (${MUTED}): ${mutedUses} uses, ${mutedFails} AA failures ` +
    `(${((mutedFails / fails.length) * 100).toFixed(1)}% of all failures)`,
);

// Which Tailwind colour classes are the failures wearing?
const clsHits = new Map<string, number>();
for (const n of fails) {
  for (const m of (n.cls ?? "").matchAll(/\b(text-(?:zinc|slate|gray|neutral|stone)-\d{3}|text-white\/\d+|text-muted-foreground)\b/g)) {
    clsHits.set(m[1], (clsHits.get(m[1]) ?? 0) + 1);
  }
}
console.log("\nFailing nodes by colour class:");
[...clsHits.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .forEach(([c, n]) => console.log(`  ${c.padEnd(26)} ${n}`));

process.exit(0);
