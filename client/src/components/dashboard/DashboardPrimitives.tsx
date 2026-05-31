import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const accentRing: Record<"none" | "gold" | "red" | "green" | "blue", string> = {
  none: "border-white/[0.06] shadow-sm shadow-black/20",
  gold: "border-amber-500/20 shadow-[0_0_24px_-8px_rgba(245,158,11,0.35)]",
  red: "border-red-500/20 shadow-[0_0_24px_-8px_rgba(239,68,68,0.25)]",
  green: "border-emerald-500/20 shadow-[0_0_24px_-8px_rgba(16,185,129,0.22)]",
  blue: "border-blue-500/20 shadow-[0_0_24px_-8px_rgba(59,130,246,0.22)]",
};

export function DashboardCard({
  title,
  subtitle,
  children,
  to,
  toLabel = "View",
  accent = "none",
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  to?: string;
  toLabel?: string;
  accent?: keyof typeof accentRing;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-[#0f131c]/90 backdrop-blur-sm",
        accentRing[accent],
        className,
      )}
    >
      <div className="border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex flex-1 flex-col px-4 py-3">{children}</div>
      {to ? (
        <div className="border-t border-white/[0.06] px-4 py-2">
          <Link
            to={to}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 transition-colors hover:text-blue-300"
          >
            {toLabel}
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function DashboardSectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="h-4 w-0.5 rounded-full bg-red-500" aria-hidden />
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function MetricPill({
  label,
  value,
  variant = "neutral",
}: {
  label: string;
  value: ReactNode;
  variant?: "neutral" | "gold" | "red" | "green" | "blue";
}) {
  const v =
    variant === "gold"
      ? "border-amber-500/25 bg-amber-500/10 text-amber-200"
      : variant === "red"
        ? "border-red-500/25 bg-red-500/10 text-red-200"
        : variant === "green"
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
          : variant === "blue"
            ? "border-blue-500/25 bg-blue-500/10 text-blue-200"
            : "border-white/[0.08] bg-white/[0.03] text-foreground";
  return (
    <div className={cn("rounded-lg border px-2.5 py-1.5", v)}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function MiniTable({
  columns,
  rows,
  dense,
}: {
  columns: string[];
  rows: ReactNode[][];
  dense?: boolean;
}) {
  const cell = dense ? "px-2 py-1.5 text-xs" : "px-2 py-2 text-sm";
  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
      <table className="w-full min-w-[280px] text-left">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {columns.map((c) => (
              <th key={c} className={cn(cell, "font-semibold")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
              {r.map((cellContent, j) => (
                <td key={j} className={cn(cell, "text-foreground")}>
                  {cellContent}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "default" | "success" | "warning" | "danger" | "info";
}) {
  const cls =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/15 text-amber-200"
        : tone === "danger"
          ? "border-red-500/30 bg-red-500/15 text-red-200"
          : tone === "info"
            ? "border-blue-500/30 bg-blue-500/15 text-blue-200"
            : "border-white/[0.1] bg-white/[0.04] text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cls)}>
      {children}
    </span>
  );
}
