import type { ReactNode } from "react";
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
  children,
}: {
  active: RfsnDestination;
  leagueName?: string;
  subtitle?: string;
  showLive?: boolean;
  children: ReactNode;
}) {
  const tagline =
    subtitle ??
    (leagueName ? `${leagueName} · League Network` : "Your league's year-round sports network");

  return (
    <div
      className="-m-4 md:-m-6 p-5 md:p-7 min-h-full text-zinc-100"
      style={{ background: RFSN_PAGE_BG }}
    >
      <header className="border-b border-white/[0.06] pb-4 mb-6">
        <RfsnBrandMark />
        <p className="text-[11px] text-[#8b97a8] uppercase tracking-[0.2em] font-bold mt-1">{tagline}</p>
        <RfsnDestinationNav active={active} showLive={showLive} className="mt-4" />
      </header>
      {children}
    </div>
  );
}
