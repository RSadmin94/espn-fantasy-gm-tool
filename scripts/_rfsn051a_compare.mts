/**
 * RFSN-051A — before/after comparison of the runtime typography census.
 *
 *   pnpm exec tsx scripts/_rfsn051a_compare.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("audit-artifacts/rfsn-051");

type Node = {
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  contrast: number;
  isLarge: boolean;
  color: string;
  text?: string;
  classes?: string;
  tag?: string;
};
type Row = {
  route: string;
  group?: string;
  viewport?: string;
  responsive?: boolean;
  settled?: boolean;
  nodes?: Node[];
  totalTextNodes?: number;
  tinyCount?: number;
  error?: string;
};

function load(p: string): Row[] {
  return (JSON.parse(readFileSync(p, "utf8")).results as Row[]).filter((r) => !r.responsive);
}

const before = load(path.join(OUT, "baseline", "census.json"));
const after = load(path.join(OUT, "census.json"));

function agg(rows: Row[]) {
  let total = 0,
    tiny = 0,
    small = 0,
    low = 0,
    severe = 0,
    tightLeading = 0,
    leadingKnown = 0;
  const leadingRatios: number[] = [];
  for (const r of rows) {
    for (const n of r.nodes ?? []) {
      total++;
      if (n.fontSize < 12) tiny++;
      if (n.fontSize >= 12 && n.fontSize < 14) small++;
      if (n.isLarge ? n.contrast < 3 : n.contrast < 4.5) low++;
      if (n.isLarge ? n.contrast < 2 : n.contrast < 3) severe++;
      if (n.lineHeight > 0 && n.fontSize > 0) {
        const ratio = n.lineHeight / n.fontSize;
        leadingRatios.push(ratio);
        leadingKnown++;
        if (ratio < 1.25) tightLeading++;
      }
    }
  }
  leadingRatios.sort((a, b) => a - b);
  const median = leadingRatios.length
    ? leadingRatios[Math.floor(leadingRatios.length / 2)]
    : 0;
  return { total, tiny, small, low, severe, tightLeading, leadingKnown, medianLeading: median };
}

/*
 * Route rendering is non-deterministic at a fixed settle time: a data-heavy
 * route can report ~1800 nodes on one run and ~40 on the next depending on
 * cache warmth. Comparing raw totals therefore measures load timing, not
 * typography. Restrict the comparison to routes whose node count is stable
 * across both runs, which isolates the effect of the CSS changes.
 */
const beforeByKey = new Map(before.map((r) => [r.route, r]));
const stableRoutes = new Set<string>();
for (const r of after) {
  const prev = beforeByKey.get(r.route);
  if (!prev) continue;
  const bn = (prev.nodes ?? []).length;
  const an = (r.nodes ?? []).length;
  if (!bn || !an) continue;

  // Prefer the harness's own readiness flag when both runs recorded one
  // (censuses taken before the stability gate existed have `settled` undefined,
  // so fall back to requiring the node count to agree).
  if (typeof prev.settled === "boolean" && typeof r.settled === "boolean") {
    if (prev.settled && r.settled) stableRoutes.add(r.route);
    continue;
  }
  if (Math.abs(an - bn) / Math.max(an, bn) <= 0.05) stableRoutes.add(r.route);
}
const beforeStable = before.filter((r) => stableRoutes.has(r.route));
const afterStable = after.filter((r) => stableRoutes.has(r.route));
console.log(
  `Comparable routes (node count stable within 5%): ${stableRoutes.size} of ${after.length}\n` +
    `Excluded as load-variant: ${after
      .filter((r) => !stableRoutes.has(r.route))
      .map((r) => r.route)
      .join(", ")}\n`,
);

const b = agg(beforeStable);
const a = agg(afterStable);

const pct = (x: number, y: number) => (y === 0 ? "—" : `${(((x - y) / y) * 100).toFixed(1)}%`);

console.log("=== RFSN-051A — runtime census, before → after ===\n");
const metrics: Array<[string, number, number]> = [
  ["Text nodes measured", b.total, a.total],
  ["Sub-12px nodes", b.tiny, a.tiny],
  ["12–14px nodes", b.small, a.small],
  ["Contrast below AA", b.low, a.low],
  ["Severe contrast (<3:1)", b.severe, a.severe],
  ["Tight leading (<1.25×)", b.tightLeading, a.tightLeading],
];
for (const [label, x, y] of metrics) {
  console.log(
    `${label.padEnd(26)} ${String(x).padStart(6)} → ${String(y).padStart(6)}   ${
      y - x === 0 ? "no change" : `${y - x > 0 ? "+" : ""}${y - x} (${pct(y, x)})`
    }`,
  );
}
console.log(
  `${"Median leading ratio".padEnd(26)} ${b.medianLeading.toFixed(2)}× → ${a.medianLeading.toFixed(2)}×`,
);

// Per-route movement on the metrics Phase 1 should touch.
console.log("\n=== Routes with the largest movement ===");
const beforeByRoute = new Map(beforeStable.map((r) => [r.route, r]));
type Delta = {
  route: string;
  dTiny: number;
  dLow: number;
  dSevere: number;
  dTight: number;
  dNodes: number;
};
const deltas: Delta[] = [];
for (const r of after) {
  const prev = beforeByRoute.get(r.route);
  if (!prev?.nodes || !r.nodes) continue;
  const pa = agg([prev]);
  const na = agg([r]);
  deltas.push({
    route: r.route,
    dTiny: na.tiny - pa.tiny,
    dLow: na.low - pa.low,
    dSevere: na.severe - pa.severe,
    dTight: na.tightLeading - pa.tightLeading,
    dNodes: na.total - pa.total,
  });
}
deltas
  .filter((d) => d.dTight || d.dLow || d.dSevere || d.dTiny)
  .sort((x, y) => Math.abs(y.dTight) + Math.abs(y.dLow) - (Math.abs(x.dTight) + Math.abs(x.dLow)))
  .slice(0, 25)
  .forEach((d) =>
    console.log(
      `${d.route.padEnd(36)} tight ${String(d.dTight).padStart(5)}  contrast<AA ${String(d.dLow).padStart(5)}  severe ${String(d.dSevere).padStart(5)}  <12px ${String(d.dTiny).padStart(5)}  nodes ${String(d.dNodes).padStart(5)}`,
    ),
  );

// Did the MUTED normalization actually change rendered colors?
function colorHistogram(rows: Row[]) {
  const m = new Map<string, number>();
  for (const r of rows) for (const n of r.nodes ?? []) m.set(n.color, (m.get(n.color) ?? 0) + 1);
  return m;
}
const cb = colorHistogram(before);
const ca = colorHistogram(after);
const keys = new Set([...cb.keys(), ...ca.keys()]);
console.log("\n=== Rendered text colors with the biggest swing ===");
[...keys]
  .map((k) => ({ k, b: cb.get(k) ?? 0, a: ca.get(k) ?? 0 }))
  .filter((x) => Math.abs(x.a - x.b) >= 15)
  .sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))
  .slice(0, 18)
  .forEach((x) =>
    console.log(`${x.k.padEnd(34)} ${String(x.b).padStart(5)} → ${String(x.a).padStart(5)}`),
  );

process.exit(0);
