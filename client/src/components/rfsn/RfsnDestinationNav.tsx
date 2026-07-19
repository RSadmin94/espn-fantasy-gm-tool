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

/** RFSN-027C — primary destinations only (Live · Stories · Recaps). */
const BASE_ITEMS: { id: RfsnDestination; label: string; href: string }[] = [
  { id: "home", label: "Home", href: RFSN_ROUTES.home },
  { id: "live", label: "Live", href: RFSN_ROUTES.live },
  { id: "stories", label: "Stories", href: RFSN_ROUTES.stories },
  { id: "recaps", label: "Recaps", href: RFSN_ROUTES.recaps },
];

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function pathMatches(pathname: string, href: string): boolean {
  const path = normalizePath(pathname);
  const target = normalizePath(href);
  if (path === target) return true;
  // Wire/news deep links redirect to Stories — highlight Stories while resolving.
  if (
    target === RFSN_ROUTES.stories &&
    (path.startsWith("/rfsn/wire") || path.startsWith("/rfsn/news") || path.startsWith("/league-wire"))
  ) {
    return true;
  }
  return path.startsWith(`${target}/`);
}

export function RfsnDestinationNav({
  active,
  showLive = true,
  className,
}: {
  active?: RfsnDestination;
  /** @deprecated Live is always in primary nav (RFSN-027C). Kept for call-site compat. */
  showLive?: boolean;
  className?: string;
}) {
  const { pathname } = useLocation();
  void showLive;
  const items = BASE_ITEMS;

  return (
    <nav
      className={cn(
        "flex flex-wrap items-center gap-1 border-b border-white/[0.06] -mb-px",
        className,
      )}
      aria-label="RFSN destinations"
      data-rfsn-027c-nav
    >
      {items.map((item) => {
        const isActive =
          active != null
            ? item.id === active ||
              (active === "news" && item.id === "stories") ||
              (active === "wire" && item.id === "stories") ||
              (active === "breaking" && item.id === "home") ||
              (active === "analysts" && item.id === "home")
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
