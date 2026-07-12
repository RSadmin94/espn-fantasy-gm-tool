import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";

export type RfsnDestination = "home" | "news" | "live";

const BASE_ITEMS: { id: RfsnDestination; label: string; href: string }[] = [
  { id: "home", label: "Home", href: "/rfsn" },
  { id: "news", label: "News", href: "/rfsn/news" },
];

const LIVE_ITEM = { id: "live" as const, label: "Live", href: "/rfsn/live" };

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function isNewsPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/rfsn/news" || path.startsWith("/rfsn/news/");
}

function isLivePath(pathname: string): boolean {
  return normalizePath(pathname) === "/rfsn/live";
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
            ? item.id === active
            : item.id === "home"
              ? normalizePath(pathname) === "/rfsn"
              : item.id === "live"
                ? isLivePath(pathname)
                : isNewsPath(pathname);

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
