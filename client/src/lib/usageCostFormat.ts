export function formatUsd(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

export function formatPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function formatDelta(deltaPct: number | null | undefined): { text: string; tone: "up" | "down" | "flat" | "none" } {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return { text: "", tone: "none" };
  if (Math.abs(deltaPct) < 0.05) return { text: "0%", tone: "flat" };
  const sign = deltaPct > 0 ? "↑" : "↓";
  return {
    text: `${sign} ${Math.abs(deltaPct).toFixed(1)}%`,
    tone: deltaPct > 0 ? "up" : "down",
  };
}

export function budgetTone(percentUsed: number | null, projectedOver: number | null): "healthy" | "watch" | "over" {
  if (percentUsed != null && percentUsed >= 100) return "over";
  if (projectedOver != null && projectedOver < 0) return "over";
  if (percentUsed != null && percentUsed >= 80) return "watch";
  return "healthy";
}
