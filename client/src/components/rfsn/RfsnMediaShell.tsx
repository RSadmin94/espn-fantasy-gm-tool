import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RfsnDestinationNav, type RfsnDestination } from "./RfsnDestinationNav";

export const RFSN_PAGE_BG =
  "radial-gradient(60% 80% at 80% -10%, rgba(139,92,246,.10), transparent 42%), #130e16";

export function RfsnBrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("text-3xl md:text-4xl font-black tracking-tight text-[#f3f8ff] leading-none", className)}>
      RFS<span className="text-red-500">N</span>
    </span>
  );
}

export function RfsnMediaShell({
  active,
  leagueName,
  subtitle,
  showLive = false,
  compactHeader = false,
  children,
  className,
  ...rest
}: {
  active: RfsnDestination;
  leagueName?: string;
  subtitle?: string;
  showLive?: boolean;
  /** RFSN-054A — tighter title/nav rhythm on Live Draft only. */
  compactHeader?: boolean;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const tagline =
    subtitle ??
    (leagueName ? `${leagueName} · League Network` : "Your league's year-round sports network");

  return (
    <div
      className={cn("-m-4 md:-m-6 p-5 md:p-7 min-h-full text-zinc-100", className)}
      style={{ background: RFSN_PAGE_BG }}
      {...rest}
    >
      <header className={cn("border-b border-white/[0.06]", compactHeader ? "pb-2.5 mb-3" : "pb-4 mb-6")}>
        <RfsnBrandMark />
        <p className={cn("text-2xs text-ink-tertiary uppercase tracking-wide font-semibold", compactHeader ? "mt-0.5" : "mt-1")}>{tagline}</p>
        <RfsnDestinationNav active={active} showLive={showLive} className={compactHeader ? "mt-2" : "mt-4"} />
      </header>
      {children}
    </div>
  );
}
