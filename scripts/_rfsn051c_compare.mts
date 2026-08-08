/**
 * RFSN-051C — settled-route AA comparison vs 051B + meaningful sub-12px split.
 *
 *   pnpm exec tsx scripts/_rfsn051c_compare.mts
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
  meaningful?: boolean;
  text?: string;
};
type Row = { route: string; settled?: boolean; responsive?: boolean; nodes?: Node[] };

function load(p: string): Row[] {
  return (JSON.parse(readFileSync(p, "utf8")).results as Row[]).filter(
    (r) => !r.responsive && r.nodes,
  );
}

const before = load(path.join(OUT, "census-settled-051b.json"));
const after = load(path.join(OUT, "census.json"));
const beforeBy = new Map(before.map((r) => [r.route, r]));

const comparable: Array<{ route: string; b: Row; a: Row }> = [];
for (const a of after) {
  const b = beforeBy.get(a.route);
  if (!b?.nodes || !a.nodes) continue;
  if (b.settled === false || a.settled === false) continue;
  const bn = b.nodes.length;
  const an = a.nodes.length;
  if (!bn || !an) continue;
  if (Math.abs(an - bn) / Math.max(an, bn) > 0.05) continue;
  comparable.push({ route: a.route, b, a });
}

function bucketFail(n: Node): "purple" | "white" | "ink3" | "other" | null {
  const fail = n.isLarge ? n.contrast < 3 : n.contrast < 4.5;
  if (!fail) return null;
  if (/0\.62 0\.16 295/.test(n.color) || (/\/ 0\.7\)/.test(n.color) && /295/.test(n.color)))
    return "purple";
  if (/oklab\(0\.999994/.test(n.color) || /text-white\//.test(n.cls ?? "")) return "white";
  if (/text-ink-tertiary/.test(n.cls ?? "") || /0\.6[02] 0\.025 300/.test(n.color)) return "ink3";
  return "other";
}

function agg(rows: Row[]) {
  let total = 0, tiny = 0, tinyMean = 0, tinyDeco = 0, low = 0, severe = 0;
  let lowMean = 0, lowDeco = 0, sevMean = 0, sevDeco = 0;
  const buckets = { purple: 0, white: 0, ink3: 0, other: 0 };
  for (const r of rows) {
    for (const n of r.nodes ?? []) {
      total++;
      if (n.fontSize < 12) {
        tiny++;
        if (n.meaningful === false) tinyDeco++;
        else tinyMean++;
      }
      const fail = n.isLarge ? n.contrast < 3 : n.contrast < 4.5;
      const sev = n.isLarge ? n.contrast < 2 : n.contrast < 3;
      const deco = n.meaningful === false;
      if (fail) {
        low++;
        if (deco) lowDeco++;
        else lowMean++;
        const k = bucketFail(n);
        if (k) buckets[k]++;
      }
      if (sev) {
        severe++;
        if (deco) sevDeco++;
        else sevMean++;
      }
    }
  }
  return { total, tiny, tinyMean, tinyDeco, low, lowMean, lowDeco, severe, sevMean, sevDeco, ...buckets };
}

const B = agg(comparable.map((c) => c.b));
const A = agg(comparable.map((c) => c.a));

console.log(`Comparable settled routes: ${comparable.length} of ${after.length}\n`);
console.log("=== Contrast ===");
const lines: Array<[string, number, number]> = [
  ["Text nodes", B.total, A.total],
  ["AA failures", B.low, A.low],
  ["  meaningful AA", B.lowMean, A.lowMean],
  ["  decorative AA", B.lowDeco, A.lowDeco],
  ["Severe (<3:1)", B.severe, A.severe],
  ["  meaningful severe", B.sevMean, A.sevMean],
  ["  decorative severe", B.sevDeco, A.sevDeco],
  ["Purple α failures", B.purple, A.purple],
  ["White α failures", B.white, A.white],
  ["Ink-tertiary AA fails", B.ink3, A.ink3],
  ["Other AA fails", B.other, A.other],
];
for (const [label, x, y] of lines) {
  const d = y - x;
  console.log(
    `${label.padEnd(28)} ${String(x).padStart(6)} → ${String(y).padStart(6)}   ${
      d === 0 ? "no change" : `${d > 0 ? "+" : ""}${d} (${((d / Math.max(x, 1)) * 100).toFixed(1)}%)`
    }`,
  );
}

console.log("\n=== Sub-12px (051D input) ===");
console.log(`${"All sub-12px".padEnd(28)} ${String(A.tiny).padStart(6)}`);
console.log(`${"Meaningful readable <12px".padEnd(28)} ${String(A.tinyMean).padStart(6)}`);
console.log(`${"Decorative / chrome <12px".padEnd(28)} ${String(A.tinyDeco).padStart(6)}`);

console.log("\n=== Per-route AA (largest remaining) ===");
comparable
  .map(({ route, b, a }) => {
    const bb = agg([b]);
    const aa = agg([a]);
    return {
      route,
      bAA: bb.low,
      aAA: aa.low,
      d: aa.low - bb.low,
      sev: aa.severe,
      tiny: aa.tiny,
      tinyM: aa.tinyMean,
    };
  })
  .sort((x, y) => y.aAA - x.aAA || x.d - y.d)
  .slice(0, 18)
  .forEach((r) =>
    console.log(
      `${r.route.padEnd(36)} AA ${String(r.bAA).padStart(4)} → ${String(r.aAA).padStart(4)} (${String(r.d).padStart(5)})  sev ${String(r.sev).padStart(2)}  <12 ${r.tiny} meaningful ${r.tinyM}`,
    ),
  );

console.log("\n=== Remaining AA colours (after) ===");
const colors = new Map<string, number>();
for (const { a } of comparable) {
  for (const n of a.nodes ?? []) {
    const fail = n.isLarge ? n.contrast < 3 : n.contrast < 4.5;
    if (fail) colors.set(n.color, (colors.get(n.color) ?? 0) + 1);
  }
}
[...colors.entries()]
  .sort((x, y) => y[1] - x[1])
  .slice(0, 12)
  .forEach(([c, n]) => console.log(`  ${c.padEnd(44)} ${n}`));

process.exit(0);
