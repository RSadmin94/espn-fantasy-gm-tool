import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AdminKpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardHeader className="pb-1">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export function StatusBadge({
  status,
}: {
  status: string;
}) {
  const tone =
    status === "HEALTHY" || status === "healthy" || status === "Healthy" || status === "ok" || status === "active"
      ? "bg-lime-500/15 text-lime-300"
      : status === "DEGRADED" || status === "degraded" || status === "Degraded" || status === "warning" || status === "stale" || status === "watched" || status === "throttled"
        ? "bg-amber-500/15 text-amber-300"
        : status === "DOWN" || status === "failed" || status === "Critical" || status === "suspended" || status === "restricted"
          ? "bg-red-500/15 text-red-300"
          : "bg-white/10 text-zinc-400";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase", tone)}>
      {status}
    </span>
  );
}

export function AdminLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function AdminError({ message }: { message: string }) {
  return <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{message}</div>;
}

export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

export function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
