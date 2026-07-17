import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { RFSN_ROUTES } from "@/lib/rfsnEditorial";

export type RfsnDestination =
  | "home"
  | "wire"
  | "breaking"
  | "stories"
  | "recaps"
  | "analysts"
  | "news"
  | "live";

const BASE_ITEMS: { id: RfsnDestination; label: string; href: string }[] = [
  { id: "home", label: "Home", href: RFSN_ROUTES.home },
  { id: "wire", label: "Wire", href: RFSN_ROUTES.wire },
  { id: "breaking", label: "Breaking", href: RFSN_ROUTES.breaking },
  { id: "stories", label: "Stories", href: RFSN_ROUTES.stories },
  { id: "recaps", label: "Recaps", href: RFSN_ROUTES.recaps },
  { id: "analysts", label: "Analysts", href: RFSN_ROUTES.analysts },
];

const LIVE_ITEM = { id: "live" as const, label: "Live", href: RFSN_ROUTES.live };

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function pathMatches(pathname: string, href: string): boolean {
  const path = normalizePath(pathname);
  const target = normalizePath(href);
  if (path === target) return true;
  // Legacy news reader is part of Wire/Stories content surface.
  if ((target === RFSN_ROUTES.wire || target === RFSN_ROUTES.stories) && path.startsWith("/rfsn/news")) {
    return target === RFSN_ROUTES.wire;
  }
  return path.startsWith(`${target}/`);
}

export function RfsnDestinationNav({
  active,
  showLive = false,
  className,
}: {
  active?: RfsnDestination;
  showLive?: boolean;
  className?: string;
}) {
  const { pathname } = useLocation();
  const items = showLive ? [...BASE_ITEMS, LIVE_ITEM] : BASE_ITEMS;

  return (
    <nav
      className={cn(
        "flex flex-wrap items-center gap-1 border-b border-white/[0.06] -mb-px",
        className,
      )}
      aria-label="RFSN destinations"
    >
      {items.map((item) => {
        const isActive =
          active != null
            ? item.id === active || (active === "news" && item.id === "wire")
            : item.id === "home"
              ? normalizePath(pathname) === RFSN_ROUTES.home
              : pathMatches(pathname, item.href);

        return (
          <Link
            key={item.id}
            to={item.href}
            className={cn(
              "inline-flex items-center px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors",
              isActive
                ? "border-[#a3e635] text-[#a3e635]"
                : "border-transparent text-[#8b97a8] hover:text-[#dbe4f0]",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
