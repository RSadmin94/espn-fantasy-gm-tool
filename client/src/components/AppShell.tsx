import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useUser, useClerk } from "@clerk/react-router";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Plug,
  RefreshCw,
  ArrowLeftRight,
  Trophy,
  Users,
  Repeat2,
  ListOrdered,
  LayoutGrid,
  Bot,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronRight,
  ChevronDown,
  Calculator,
  ScrollText,
  BarChart2,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type NavEntry =
  | { kind: "link"; label: string; href: string; icon: LucideIcon }
  | { kind: "placeholder"; label: string; icon: LucideIcon };

type NavGroup = { id: string; title: string; items: NavEntry[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "command-center",
    title: "Command Center",
    items: [
      { kind: "link", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { kind: "link", label: "AI Advisor", href: "/advisor", icon: Bot },
    ],
  },
  {
    id: "my-league",
    title: "My League",
    items: [
      { kind: "link", label: "Standings", href: "/standings", icon: Trophy },
      { kind: "link", label: "Matchups", href: "/matchups", icon: LayoutGrid },
      { kind: "link", label: "Rosters", href: "/roster", icon: Users },
      { kind: "link", label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
    ],
  },
  {
    id: "draft-keepers",
    title: "Draft & Keepers",
    items: [
      { kind: "link", label: "Draft History", href: "/draft-history", icon: ListOrdered },
      { kind: "placeholder", label: "Keeper Calculator", icon: Calculator },
      { kind: "placeholder", label: "Draft Strategy", icon: ScrollText },
    ],
  },
  {
    id: "intelligence",
    title: "Intelligence",
    items: [
      { kind: "placeholder", label: "Owner Career Stats", icon: BarChart2 },
      { kind: "placeholder", label: "Player Profiles", icon: UserCircle },
      { kind: "link", label: "Trade Analyzer", href: "/trades", icon: Repeat2 },
    ],
  },
  {
    id: "data",
    title: "Data",
    items: [
      { kind: "link", label: "Sync Data", href: "/sync", icon: RefreshCw },
      { kind: "link", label: "Connect ESPN", href: "/connect", icon: Plug },
    ],
  },
  {
    id: "account",
    title: "Account",
    items: [{ kind: "link", label: "Settings", href: "/settings", icon: Settings }],
  },
];

function useViewportMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof globalThis !== "undefined" &&
    globalThis.matchMedia?.("(max-width: 767px)")?.matches === true
  );

  useEffect(() => {
    const mq = globalThis.matchMedia?.("(max-width: 767px)");
    if (!mq) return;
    const go = () => setIsMobile(mq.matches);
    go();
    mq.addEventListener("change", go);
    return () => mq.removeEventListener("change", go);
  }, []);

  return isMobile;
}

function SectionHeader({ title, isFirst }: { title: string; isFirst?: boolean }) {
  return (
    <div
      className={cn(
        "px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        isFirst ? "pt-0" : "pt-4"
      )}
    >
      {title}
    </div>
  );
}

function NavItemRow({
  entry,
  pathname,
  onNavigate,
}: {
  entry: NavEntry;
  pathname: string;
  onNavigate?: () => void;
}) {
  if (entry.kind === "placeholder") {
    const Icon = entry.icon;
    return (
      <li>
        <div
          className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground/60 opacity-70"
          aria-disabled
        >
          <Icon className="h-4 w-4 shrink-0 opacity-60" />
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          <Badge
            variant="outline"
            className="shrink-0 border-muted-foreground/25 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
          >
            Coming Soon
          </Badge>
        </div>
      </li>
    );
  }

  const Icon = entry.icon;
  const isActive = pathname === entry.href;
  return (
    <li>
      <Link
        to={entry.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
          isActive
            ? "border border-primary/20 bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-primary/60" />}
      </Link>
    </li>
  );
}

function NavGroupList({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5 pb-1">
      {group.items.map((entry) => (
        <NavItemRow
          key={entry.kind === "link" ? entry.href : entry.label}
          entry={entry}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const location = useLocation();
  const pathname = location.pathname;
  const isMobile = useViewportMobile();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    const mobile =
      typeof globalThis !== "undefined" &&
      globalThis.matchMedia?.("(max-width: 767px)")?.matches === true;
    for (const g of NAV_GROUPS) init[g.id] = !mobile;
    return init;
  });

  useEffect(() => {
    if (!isMobile) {
      setOpenGroups(() => Object.fromEntries(NAV_GROUPS.map((g) => [g.id, true])));
      return;
    }
    setOpenGroups(() => Object.fromEntries(NAV_GROUPS.map((g) => [g.id, false])));
  }, [isMobile]);

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex items-center justify-between border-b border-border px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-primary">GM</span>
            <span className="text-foreground"> War Room</span>
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col">
          {NAV_GROUPS.map((group, idx) => {
            if (!isMobile) {
              return (
                <div key={group.id} className={cn(idx > 0 && "mt-1 border-t border-border/60 pt-2")}>
                  <SectionHeader title={group.title} isFirst={idx === 0} />
                  <NavGroupList group={group} pathname={pathname} onNavigate={onClose} />
                </div>
              );
            }

            const open = openGroups[group.id] ?? false;
            return (
              <Collapsible
                key={group.id}
                open={open}
                onOpenChange={(next) =>
                  setOpenGroups((s) => ({ ...s, [group.id]: next }))
                }
                className={cn(idx > 0 && "mt-1 border-t border-border/60 pt-1")}
              >
                <CollapsibleTrigger
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent/40 hover:text-accent-foreground"
                >
                  <span>{group.title}</span>
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <NavGroupList group={group} pathname={pathname} onNavigate={onClose} />
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <div className="rounded-lg border border-primary/10 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-primary">ESPN Fantasy</span> GM Tool
        </div>
      </div>
    </div>
  );
}

function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="text-muted-foreground transition-colors hover:text-foreground md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-lg font-bold md:hidden">
          <span className="text-primary">GM</span>
          <span className="text-foreground"> War Room</span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <span className="hidden text-sm text-muted-foreground sm:block">
            {user.primaryEmailAddress?.emailAddress}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden w-64 shrink-0 md:block">
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          role="presentation"
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute left-0 top-0 h-full w-64"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
