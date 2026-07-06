/**
 * Phase 5 — lightweight wall-clock instrumentation for draft sim profiling.
 */

export type SimTimingBucket = {
  label: string;
  ms: number;
  count: number;
};

export type SimTimingReport = {
  buckets: SimTimingBucket[];
  totalMs: number;
  pickCount: number;
  /** Plain-language hot-path summary for gate output. */
  summary: string;
};

export class SimTimer {
  private buckets = new Map<string, { ms: number; count: number }>();
  private pickMs: number[] = [];
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  time<T>(label: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const t0 = performance.now();
    const out = fn();
    this.add(label, performance.now() - t0);
    return out;
  }

  async timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();
    const t0 = performance.now();
    const out = await fn();
    this.add(label, performance.now() - t0);
    return out;
  }

  recordPick(ms: number): void {
    if (this.enabled) this.pickMs.push(ms);
  }

  add(label: string, ms: number, count = 1): void {
    if (!this.enabled) return;
    const cur = this.buckets.get(label) ?? { ms: 0, count: 0 };
    cur.ms += ms;
    cur.count += count;
    this.buckets.set(label, cur);
  }

  report(): SimTimingReport {
    const buckets = [...this.buckets.entries()]
      .map(([label, v]) => ({ label, ms: Math.round(v.ms * 10) / 10, count: v.count }))
      .sort((a, b) => b.ms - a.ms);
    const totalMs = buckets.reduce((s, b) => s + b.ms, 0);
    const pickCount = this.pickMs.length;
    const avgPick =
      pickCount > 0 ? Math.round((this.pickMs.reduce((a, b) => a + b, 0) / pickCount) * 100) / 100 : 0;
    const top = buckets[0];
    const summary = top
      ? `Hot path: ${top.label} (${top.ms}ms, ${Math.round((top.ms / (totalMs || 1)) * 100)}% of measured time) · ${pickCount} picks avg ${avgPick}ms/pick`
      : "No timing samples recorded.";
    return { buckets, totalMs: Math.round(totalMs * 10) / 10, pickCount, summary };
  }

  formatLines(): string[] {
    const r = this.report();
    const lines = ["── SIM TIMING ──", r.summary];
    for (const b of r.buckets.slice(0, 8)) {
      lines.push(`  ${b.label}: ${b.ms}ms (${b.count} calls)`);
    }
    return lines;
  }
}
