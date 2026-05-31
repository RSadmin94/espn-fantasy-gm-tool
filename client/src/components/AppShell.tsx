import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useUser, useClerk } from "@clerk/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Plug,
  RefreshCw,
  ArrowLeftRight,
  Award,
  Trophy,
  Users,
  Repeat2,
  Bot,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronRight,
  ChevronDown,
  Calculator,
  ChevronsUpDown,
  Loader2,
  ShieldCheck,
  UserSearch,
  Calendar,
  Building2,
  Swords,
  Dna,
  Database,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    title: "COMMAND CENTER",
    items: [
      { kind: "link", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { kind: "link", label: "AI Advisor", href: "/advisor", icon: Bot },
    ],
  },
  {
    id: "dynasty",
    title: "DYNASTY",
    items: [
      { kind: "placeholder", label: "Franchise Dashboard", icon: Building2 },
      { kind: "link", label: "Owner Profiles", href: "/owner-profiles", icon: Users },
      { kind: "link", label: "Hall of Fame", href: "/hall-of-fame", icon: Award },
      { kind: "link", label: "League Timeline", href: "/league-timeline", icon: Calendar },
    ],
  },
  {
    id: "intelligence",
    title: "INTELLIGENCE",
    items: [
      { kind: "link", label: "Rivalry Center", href: "/matchups", icon: Swords },
      { kind: "placeholder", label: "Draft DNA", icon: Dna },
      { kind: "link", label: "Player Intelligence", href: "/player-intelligence", icon: UserSearch },
      { kind: "link", label: "Player Database", href: "/player-database", icon: Database },
      { kind: "link", label: "Trade Analyzer", href: "/trades", icon: Repeat2 },
    ],
  },
  {
    id: "league",
    title: "LEAGUE",
    items: [
      { kind: "link", label: "Standings", href: "/standings", icon: Trophy },
      { kind: "link", label: "Matchups", href: "/matchups", icon: Swords },
      { kind: "link", label: "Rosters", href: "/roster", icon: Users },
      { kind: "link", label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
    ],
  },
  {
    id: "commissioner",
    title: "COMMISSIONER",
    items: [
      { kind: "link", label: "League Settings", href: "/league-settings", icon: Settings },
      { kind: "link", label: "Sync Data", href: "/sync", icon: RefreshCw },
      { kind: "link", label: "Data Health", href: "/league-data-health", icon: ShieldCheck },
      { kind: "link", label: "Identity Review", href: "/owner-identity-review", icon: UserSearch },
    ],
  },
];

function formatLeagueSeason(season: number | null | undefined): string {
  if (season != null && season > 0) return String(season);
  return "—";
}

function LeagueSwitcher({ onAfterSwitch }: { onAfterSwitch?: () => void }) {
  const queryClient = useQueryClient();
  const leaguesQ = trpc.league.getMyLeagues.useQuery(undefined, { staleTime: 30_000 });
  const activeQ = trpc.league.getActive.useQuery(undefined, { staleTime: 30_000 });

  const setActive = trpc.league.setActive.useMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onAfterSwitch?.();
    },
  });

  const leagues = leaguesQ.data ?? [];
  const busy = setActive.isPending;

  if (leaguesQ.isLoading || activeQ.isLoading) {
    return (
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-3 text-zinc-500">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span className="text-xs">Loading leagues…</span>
      </div>
    );
  }

  if (leagues.length === 0) {
    return (
      <div className="border-b border-white/[0.06] px-3 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          League
        </p>
        <Button asChild variant="outline" size="sm" className="h-auto w-full justify-center gap-2 py-2">
          <Link to="/connect" onClick={onAfterSwitch}>
            <Plug className="h-4 w-4 shrink-0" />
            Connect ESPN
          </Link>
        </Button>
      </div>
    );
  }

  const activeId = activeQ.data?.id ?? leagues.find((l) => l.isActive)?.id;
  const current = leagues.find((l) => l.id === activeId) ?? leagues[0]!;
  const label = current.leagueName?.trim() || `League ${current.leagueId}`;
  const year = formatLeagueSeason(current.season);

  if (leagues.length === 1) {
    return (
      <div className="border-b border-white/[0.06] px-3 py-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Active league
        </p>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <p className="truncate text-sm font-medium text-zinc-100">{label}</p>
          <p className="text-xs text-zinc-500">{year}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-white/[0.06] px-3 py-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Active league
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="h-auto min-h-10 w-full justify-between gap-2 px-3 py-2 text-left font-normal"
            aria-label="Switch active league"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-zinc-100">{label}</span>
              <span className="text-xs text-zinc-500">{year}</span>
            </span>
            {busy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" />
            ) : (
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          {leagues.map((l) => {
            const isCurrent = l.id === activeId;
            const itemLabel = l.leagueName?.trim() || `League ${l.leagueId}`;
            return (
              <DropdownMenuItem
                key={l.id}
                disabled={isCurrent || busy}
                className={cn("flex cursor-pointer flex-col items-start gap-0.5 py-2", isCurrent && "bg-accent/50")}
                onSelect={(e) => {
                  e.preventDefault();
                  if (isCurrent || busy) return;
                  setActive.mutate({ leagueConnectionId: l.id });
                }}
              >
                <span className="font-medium leading-tight">{itemLabel}</span>
                <span className="text-xs text-zinc-500">{formatLeagueSeason(l.season)}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

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

function SidebarGroupTitle({ title, isFirst }: { title: string; isFirst?: boolean }) {
  return (
    <div
      className={cn(
        "px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600",
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
          className="flex cursor-not-allowed items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-zinc-600 opacity-90"
          aria-disabled
        >
          <Icon className="h-4 w-4 shrink-0 text-zinc-600" />
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          <Badge
            variant="outline"
            className="shrink-0 border-red-500/25 bg-red-500/[0.04] px-1.5 py-0 text-[10px] font-medium text-red-300/90"
          >
            Coming Soon
          </Badge>
        </div>
      </li>
    );
  }

  const Icon = entry.icon;
  const isActive =
    pathname === entry.href ||
    (entry.href === "/hall-of-fame" &&
      (pathname === "/ring-of-honor" || pathname === "/championships"));
  return (
    <li>
      <Link
        to={entry.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
          isActive
            ? "border border-red-500/40 border-l-[3px] border-l-red-500 bg-gradient-to-r from-red-500/20 via-red-500/10 to-transparent text-red-50 shadow-[0_0_26px_-12px_rgba(239,68,68,0.5)]"
            : "border border-transparent text-zinc-400 hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-100"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-red-400" : "text-zinc-500")} />
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-red-400/80" />}
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

function SidebarFooter() {
  const { user, isLoaded } = useUser();
  return (
    <div className="space-y-2 border-t border-white/[0.06] p-3">
      {isLoaded && user ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
          <img
            src={user.imageUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full ring-1 ring-white/10"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-zinc-100">
              {user.fullName || user.username || "GM"}
            </p>
            {user.primaryEmailAddress?.emailAddress ? (
              <p className="truncate text-[10px] text-zinc-500">
                {user.primaryEmailAddress.emailAddress}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="rounded-lg border border-red-500/10 bg-red-500/[0.03] px-3 py-2 text-[10px] leading-snug text-zinc-500">
        <span className="font-semibold text-red-400/90">ESPN Fantasy</span> · GM War Room
      </div>
    </div>
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
    <div className="flex h-full flex-col border-r border-white/[0.06] bg-[#070a10]">
      {/* Logo */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">
            <span className="text-red-500">GM</span>
            <span className="text-zinc-100"> War Room</span>
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

      <LeagueSwitcher onAfterSwitch={onClose} />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col">
          {NAV_GROUPS.map((group, idx) => {
            if (!isMobile) {
              return (
                <div key={group.id} className={cn(idx > 0 && "mt-1 border-t border-white/[0.06] pt-2")}>
                  <SidebarGroupTitle title={group.title} isFirst={idx === 0} />
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
                className={cn(idx > 0 && "mt-1 border-t border-white/[0.06] pt-1")}
              >
                <CollapsibleTrigger
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
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
      <SidebarFooter />
    </div>
  );
}

function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#070a10]/95 px-4 backdrop-blur-md md:px-6">
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
          <span className="text-red-500">GM</span>
          <span className="text-zinc-100"> War Room</span>
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
    <div className="flex h-screen overflow-hidden bg-[#0b0e14]">
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
        <main className="flex-1 overflow-y-auto bg-[#0b0e14] p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
