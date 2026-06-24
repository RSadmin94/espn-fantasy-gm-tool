import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useUser, useClerk } from "@clerk/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
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
  Newspaper,
  Zap,
  Crown,
  Sun,
  Moon,
  FlaskConical,
  HelpCircle,
  Route,
  ShoppingCart,
  Clapperboard,
  Gem,
  ListChecks,
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
import { useTheme, LOCK_DARK } from "@/context/ThemeContext";

type NavEntry =
  | { kind: "link"; label: string; href: string; icon: LucideIcon }
  | { kind: "placeholder"; label: string; icon: LucideIcon };

type NavGroup = { id: string; title: string; items: NavEntry[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    title: "HOME",
    items: [
      { kind: "link", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    id: "my-team",
    title: "MY TEAM",
    items: [
      { kind: "link", label: "Rosters", href: "/roster", icon: Users },
      { kind: "link", label: "Trade Analyzer", href: "/trades", icon: Repeat2 },
      { kind: "link", label: "LeagueDNA Advisor", href: "/advisor", icon: Dna },
      { kind: "link", label: "League Wire", href: "/league-wire", icon: Newspaper },
    ],
  },
  {
    id: "league-intel",
    title: "LEAGUE INTEL",
    items: [
      { kind: "link", label: "League DNA", href: "/league-dna", icon: Dna },
      { kind: "link", label: "The Cast", href: "/the-cast", icon: Clapperboard },
      { kind: "link", label: "Owner Profiles", href: "/owner-profiles", icon: Users },
      { kind: "link", label: "Dynasty Power Rankings", href: "/dynasty-power-rankings", icon: Gem },
      { kind: "link", label: "Championship Diagnosis", href: "/championship-diagnosis", icon: Route },
      { kind: "link", label: "Acquisition Impact", href: "/acquisition-impact", icon: ShoppingCart },
      { kind: "link", label: "Rivalry Center", href: "/rivalry-center", icon: Swords },
      { kind: "link", label: "Commissioner Hub", href: "/commissioner-command-center", icon: Crown },
    ],
  },
  {
    id: "history-records",
    title: "HISTORY & RECORDS",
    items: [
      { kind: "link", label: "League Legacy Center", href: "/hall-of-fame", icon: Award },
      { kind: "link", label: "League History", href: "/history", icon: Building2 },
      { kind: "link", label: "Standings", href: "/standings", icon: Trophy },
      { kind: "link", label: "Matchups", href: "/matchups", icon: Swords },
      { kind: "link", label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
      { kind: "link", label: "Draft History", href: "/draft-history", icon: Calendar },
    ],
  },
  {
    id: "draft",
    title: "DRAFT",
    items: [
      { kind: "link", label: "Draft War Room", href: "/draft-war-room", icon: Zap },
      { kind: "link", label: "Draft Reality Sim", href: "/draft-reality", icon: FlaskConical },
      { kind: "link", label: "Keeper Advisor", href: "/keeper-advisor", icon: Calculator },
      { kind: "link", label: "League Keeper Forecast", href: "/keeper-forecast", icon: ListChecks },
      { kind: "link", label: "Player Database", href: "/player-database", icon: Database },
    ],
  },
  {
    id: "data-admin",
    title: "DATA & ADMIN",
    items: [
      { kind: "link", label: "Sync Data", href: "/sync", icon: RefreshCw },
      { kind: "link", label: "Data Health", href: "/league-data-health", icon: ShieldCheck },
      { kind: "link", label: "Identity Review", href: "/owner-identity-review", icon: UserSearch },
      { kind: "link", label: "League Settings", href: "/league-settings", icon: Settings },
    ],
  },
];

function formatLeagueSeason(season: number | null | undefined): string {
  if (season != null && season > 0) return String(season);
  return "—";
}

type LeagueRow = {
  id: number;
  leagueId: string;
  leagueName: string | null;
  season: number | null;
  isActive?: boolean | null;
};

function leagueRowLabel(l: { leagueId: string; leagueName: string | null }) {
  const last4 = l.leagueId.slice(-4);
  const name = l.leagueName?.trim();
  if (name && !name.includes(l.leagueId)) return `${name} · ${last4}`;
  return name || `ESPN League ${l.leagueId}`;
}

/** Committed shell + menu “current” row: prefer `getActive` only; avoid `getMyLeagues.isActive` when it can race `getActive`. */
function committedActiveConnectionId(
  activeData: { id: number } | null | undefined,
  leagues: LeagueRow[],
): number | undefined {
  if (activeData?.id != null) return activeData.id;
  const byFlag = leagues.find((l) => l.isActive)?.id;
  return byFlag;
}

function LeagueSwitcher({
  onAfterSwitch,
  onOverlayDepth,
}: {
  onAfterSwitch?: () => void;
  /** Increment while this instance is blocking (mutation + post-switch work); AppShell sums depths for a single overlay. */
  onOverlayDepth?: (delta: 1 | -1) => void;
}) {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const leaguesQ = trpc.league.getMyLeagues.useQuery(undefined, { staleTime: 30_000 });
  const activeQ = trpc.league.getActive.useQuery(undefined, { staleTime: 30_000 });

  /** While set + until post-mutation refetch invalidation finishes: freeze shell to pre-switch league so shell never races page `leagueContextKey`. */
  const [switchUi, setSwitchUi] = useState<{
    label: string;
    year: string;
    priorConnectionId: number | null;
  } | null>(null);

  const setActive = trpc.league.setActive.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.league.getActive.invalidate();
      await utils.league.getActive.refetch();
      const activeKey = getQueryKey(trpc.league.getActive, undefined, "query");
      const nextRow = queryClient.getQueryData(activeKey) as { id?: number } | null | undefined;
      if (nextRow?.id != null && nextRow.id !== variables.leagueConnectionId) {
        // eslint-disable-next-line no-console -- rare server mismatch; surfaces in QA
        console.warn("[LeagueSwitcher] getActive id after setActive != selected connection", {
          expected: variables.leagueConnectionId,
          got: nextRow.id,
        });
      }
      await utils.league.getMyLeagues.invalidate();
      await utils.league.getMyLeagues.refetch();
      await queryClient.invalidateQueries();
      onAfterSwitch?.();
    },
    onSettled: () => {
      setSwitchUi(null);
    },
  });

  const leagues = leaguesQ.data ?? [];
  const busy = setActive.isPending || switchUi != null;

  useEffect(() => {
    if (!onOverlayDepth) return;
    if (busy) {
      onOverlayDepth(1);
      return () => {
        onOverlayDepth(-1);
      };
    }
  }, [busy, onOverlayDepth]);

  if (leaguesQ.isLoading || activeQ.isLoading) {
    return (
      <div className="flex items-center gap-2 border-b border-border px-3 py-3 text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span className="text-xs">Loading leagues…</span>
      </div>
    );
  }

  if (leagues.length === 0) {
    return (
      <div className="border-b border-border px-3 py-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
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

  const activeConnId = committedActiveConnectionId(activeQ.data, leagues);
  const currentRow =
    activeConnId != null ? leagues.find((l) => l.id === activeConnId) ?? null : null;
  const labelFromGetActive =
    activeQ.data != null
      ? currentRow != null
        ? leagueRowLabel(currentRow)
        : leagueRowLabel({ leagueId: activeQ.data.leagueId, leagueName: activeQ.data.leagueName })
      : leagueRowLabel(leagues.find((l) => l.isActive) ?? leagues[0]!);
  const yearFromGetActive =
    activeQ.data != null
      ? currentRow != null
        ? formatLeagueSeason(currentRow.season)
        : formatLeagueSeason(activeQ.data.season)
      : formatLeagueSeason((leagues.find((l) => l.isActive) ?? leagues[0]!).season);

  const label = switchUi?.label ?? labelFromGetActive;
  const year = switchUi?.year ?? yearFromGetActive;
  const menuCurrentId = switchUi?.priorConnectionId ?? activeConnId;

  if (leagues.length === 1) {
    return (
      <div className="border-b border-border px-3 py-3">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Active league
        </p>
        <div className="rounded-lg border border-border bg-muted px-3 py-2">
          <p className="truncate text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{year}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border px-3 py-3">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
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
              <span className="truncate text-sm font-semibold text-foreground">
                {busy && switchUi == null ? "Switching league…" : label}
              </span>
              <span className="text-xs text-muted-foreground">{busy && switchUi == null ? "—" : year}</span>
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
            const isCurrent = menuCurrentId != null && l.id === menuCurrentId;
            const itemLabel = leagueRowLabel(l);
            return (
              <DropdownMenuItem
                key={l.id}
                disabled={isCurrent || busy}
                className={cn("flex cursor-pointer flex-col items-start gap-0.5 py-2", isCurrent && "bg-accent/50")}
                onSelect={(e) => {
                  e.preventDefault();
                  if (isCurrent || busy) return;
                  const priorConn = committedActiveConnectionId(activeQ.data, leagues) ?? null;
                  const priorRow =
                    priorConn != null ? leagues.find((r) => r.id === priorConn) ?? null : null;
                  const snapRow = priorRow ?? leagues.find((r) => r.isActive) ?? leagues[0]!;
                  setSwitchUi({
                    label: leagueRowLabel(snapRow),
                    year: formatLeagueSeason(snapRow.season),
                    priorConnectionId: priorConn,
                  });
                  setActive.mutate({ leagueConnectionId: l.id });
                }}
              >
                <span className="font-medium leading-tight">{itemLabel}</span>
                <span className="text-xs text-muted-foreground">{formatLeagueSeason(l.season)}</span>
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
        "px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground",
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
          className="flex cursor-not-allowed items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-xs font-medium text-muted-foreground"
          aria-disabled
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          <Badge
            variant="outline"
            className="shrink-0 border-lime-500/25 bg-lime-500/[0.05] px-1.5 py-0 text-[10px] font-medium text-lime-300/90"
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
          "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
          isActive
            ? "border border-lime-500/30 border-l-2 border-l-lime-400 bg-lime-500/10 text-foreground"
            : "border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-lime-300" : "text-muted-foreground group-hover:text-foreground")} />
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-lime-400/80" />}
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
    <ul className="space-y-0.5">
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
    <div className="space-y-2 border-t border-border/60 p-3">
      {isLoaded && user ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-2">
          <img
            src={user.imageUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full ring-1 ring-white/10"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {user.fullName || user.username || "GM"}
            </p>
            {user.primaryEmailAddress?.emailAddress ? (
              <p className="truncate text-[10px] text-muted-foreground">
                {user.primaryEmailAddress.emailAddress}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-[10px] leading-snug text-muted-foreground">
        <span className="font-semibold text-lime-500/80">ESPN Fantasy</span> · Fantasy Football Rivals
      </div>
    </div>
  );
}

function Sidebar({
  onClose,
  onLeagueSwitchOverlayDepth,
}: {
  onClose?: () => void;
  onLeagueSwitchOverlayDepth?: (delta: 1 | -1) => void;
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const isMobile = useViewportMobile();
  const { theme, toggle } = useTheme();
  const adpMutation = trpc.playerStats.refreshAdpFromEspn.useMutation();
  useEffect(() => {
    if (sessionStorage.getItem("gmwr-adp-refreshed")) return;
    sessionStorage.setItem("gmwr-adp-refreshed", "1");
    adpMutation.mutate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <img src="/logo.png" alt="Fantasy Football Rivals - Own Your Rivals" className="max-h-[132px] w-auto object-contain" />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!LOCK_DARK && (
            <button
              type="button"
              onClick={toggle}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Toggle colour scheme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}
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
      </div>

      <LeagueSwitcher onAfterSwitch={onClose} onOverlayDepth={onLeagueSwitchOverlayDepth} />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col">
          {NAV_GROUPS.map((group, idx) => {
            if (!isMobile) {
              return (
                <div key={group.id} className={cn(idx > 0 && "mt-2 border-t border-border/40 pt-2")}>
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
                className={cn(idx > 0 && "mt-1 border-t border-border pt-1")}
              >
                <CollapsibleTrigger
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="text-muted-foreground transition-colors hover:text-foreground md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="flex items-center md:hidden">
          <img src="/logo.png" alt="Fantasy Football Rivals" className="h-[59px] w-auto object-contain" />
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
  const [leagueSwitchOverlayDepth, setLeagueSwitchOverlayDepth] = useState(0);
  const bumpLeagueSwitchOverlay = useCallback((delta: 1 | -1) => {
    setLeagueSwitchOverlayDepth((d) => Math.max(0, d + delta));
  }, []);
  const leagueSwitchBlocking = leagueSwitchOverlayDepth > 0;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden w-64 shrink-0 md:block">
        <Sidebar onLeagueSwitchOverlayDepth={bumpLeagueSwitchOverlay} />
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
            <Sidebar
              onClose={() => setSidebarOpen(false)}
              onLeagueSwitchOverlayDepth={bumpLeagueSwitchOverlay}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6">{children}</main>
      </div>

      {leagueSwitchBlocking ? (
        <div
          className="pointer-events-auto fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-background/88 px-6 text-center backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-8 w-8 shrink-0 animate-spin text-lime-400" aria-hidden />
          <p className="text-lg font-semibold tracking-tight text-foreground">Switching league…</p>
          <p className="max-w-sm text-sm leading-snug text-muted-foreground">
            Loading the selected league context.
          </p>
        </div>
      ) : null}
    </div>
  );
}