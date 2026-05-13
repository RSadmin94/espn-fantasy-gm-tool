// FILE: client/src/components/AppLayout.tsx
import React, { createContext, useContext, useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ClipboardList, Star, ArrowLeftRight, Bot, ChevronRight,
  Activity, Brain, Zap, Shield, Microscope, AlertTriangle, XCircle, X, Target, BarChart3, Link2, Sunrise,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import AdvisorPanel from "./AdvisorPanel";

type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  group: string;
  badge?: string;
  panel?: string;
};

const navItems: NavItem[] = [
  // Command Center
  { href: "/command-center", icon: LayoutDashboard, label: "Command Center", group: "Overview" },
  { href: "/connect", icon: Link2, label: "Connect League", group: "Overview", badge: "NEW" },
  // Draft & Keepers
  { href: "/offseason", icon: Sunrise, label: "Offseason Intel", group: "Draft & Keepers", badge: "2026" },
  { href: "/draft-war-room", icon: ClipboardList, label: "Draft War Room", group: "Draft & Keepers" },
  { href: "/keeper-lab", icon: Star, label: "Keeper Lab", group: "Draft & Keepers" },
  // Decision Tools
  { href: "/trade-lab", icon: ArrowLeftRight, label: "Trade Lab", group: "Decision Tools", badge: "AI" },
  { href: "/waiver-lab", icon: Zap, label: "Waiver Lab", group: "Decision Tools", badge: "AI" },
  // Intelligence
  { href: "/advisor", icon: Bot, label: "AI GM Advisor", group: "Intelligence", badge: "AI", panel: "advisor" },
  { href: "/opponent-intel", icon: Microscope, label: "Opponent Intel", group: "Intelligence" },
  // System
  { href: "/data-center", icon: Shield, label: "Data Center", group: "System" },
  { href: "/weekly-stats", icon: Activity, label: "Weekly Stats", group: "System" },
  { href: "/backtesting", icon: Target, label: "Backtesting", group: "System", badge: "NEW" },
  { href: "/gm-memory", icon: Brain, label: "GM Memory", group: "System", badge: "NEW" },
  { href: "/ml-forecast", icon: BarChart3, label: "ML Forecast", group: "System", badge: "ML" },
  { href: "/weekly-intelligence", icon: Activity, label: "Weekly Intel", group: "Intelligence", badge: "NEW" },
];

const groups = ["Overview", "Draft & Keepers", "Decision Tools", "Intelligence", "System"];

// ── Data Health Banner ────────────────────────────────────────────────────────
function DataHealthBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { data } = trpc.pipeline.health.useQuery(
    {},
    { refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000 }
  );

  if (dismissed || !data) return null;

  const { cookiesPresent, overallHealth, staleSeasons, partialSeasons } = data;

  let variant: "red" | "amber" | "yellow" | null = null;
  if (!cookiesPresent) {
    variant = "red";
  } else if (overallHealth === "critical" || overallHealth === "degraded" || staleSeasons > 3) {
    variant = "amber";
  } else if (overallHealth === "warning") {
    variant = "yellow";
  }

  if (!variant) return null;

  const config = {
    red: {
      wrapper: "bg-red-950/60 border-red-500/40 text-red-200",
      icon: <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />,
      message: (
        <>
          ESPN cookies are missing or expired. Live data is unavailable.{" "}
          <Link href="/data-center" className="underline underline-offset-2 hover:text-red-100 font-semibold">
            Go to Data Center → Credentials
          </Link>{" "}
          to update.
        </>
      ),
    },
    amber: {
      wrapper: "bg-amber-950/60 border-amber-500/40 text-amber-200",
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />,
      message: (
        <>
          League data is stale ({staleSeasons} season{staleSeasons !== 1 ? "s" : ""} not refreshed in 7+ days). Recommendations may be less accurate.{" "}
          <Link href="/data-center" className="underline underline-offset-2 hover:text-amber-100 font-semibold">
            Go to Data Center
          </Link>{" "}
          to sync.
        </>
      ),
    },
    yellow: {
      wrapper: "bg-yellow-950/40 border-yellow-500/30 text-yellow-200",
      icon: <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />,
      message: (
        <>
          Some league data may be incomplete ({partialSeasons} partial season{partialSeasons !== 1 ? "s" : ""}). Recommendations may be less accurate.{" "}
          <Link href="/data-center" className="underline underline-offset-2 hover:text-yellow-100 font-semibold">
            Go to Data Center
          </Link>{" "}
          to review.
        </>
      ),
    },
  };

  const { wrapper, icon, message } = config[variant];

  return (
    <div className={cn("flex-shrink-0 border-b px-6 py-2.5 flex items-center gap-3 text-xs", wrapper)}>
      {icon}
      <span className="flex-1">{message}</span>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Embedded context ─────────────────────────────────────────────────────────
const InsideLayoutContext = createContext(false);

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
}

export default function AppLayout({ children, title, subtitle, headerRight }: AppLayoutProps) {
  const [location] = useLocation();
  const alreadyInsideLayout = useContext(InsideLayoutContext);
  const [advisorOpen, setAdvisorOpen] = useState(false);

  // Nested call: skip shell, render children only
  if (alreadyInsideLayout) {
    return <>{children}</>;
  }

  return (
    <InsideLayoutContext.Provider value={true}>
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-62 flex-shrink-0 flex flex-col border-r border-border bg-card" style={{ width: "15.5rem" }}>
        {/* Logo */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl espn-gradient flex items-center justify-center flex-shrink-0 shadow-lg">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground leading-tight tracking-tight">ATLANTAS FINEST</p>
              <p className="text-[11px] text-muted-foreground leading-tight">GM Command Center</p>
            </div>
          </div>
          {/* Season badge */}
          <div className="flex items-center gap-2 mt-3">
            <div className="flex-1 h-px bg-border" />
            <Badge variant="outline" className="text-[9px] px-2 border-primary/30 text-primary font-mono">
              2009 – 2026
            </Badge>
            <div className="flex-1 h-px bg-border" />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {groups.map((group) => {
            const items = navItems.filter((n) => n.group === group);
            return (
              <div key={group} className="mb-4">
                <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest px-2 mb-1">
                  {group}
                </p>
                {items.map((item) => {
                  const isPanel = item.panel === "advisor";
                  const active = isPanel
                    ? advisorOpen
                    : location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  const cls = cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 mb-0.5 group w-full text-left",
                    active
                      ? "bg-primary/15 text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  );
                  const inner = (
                    <>
                      <item.icon className={cn("w-4 h-4 flex-shrink-0 transition-colors", active ? "text-primary" : "group-hover:text-foreground")} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <Badge className="text-[8px] px-1 py-0 h-3.5 espn-gradient text-white border-0 font-bold">
                          {item.badge}
                        </Badge>
                      )}
                      {active && !isPanel && <ChevronRight className="w-3 h-3 text-primary flex-shrink-0" />}
                    </>
                  );

                  if (isPanel) {
                    return (
                      <button key={item.href} onClick={() => setAdvisorOpen(true)} className={cls}>
                        {inner}
                      </button>
                    );
                  }
                  return (
                    <Link key={item.href} href={item.href} className={cls}>
                      {inner}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border">
          <div className="flex items-center gap-2">
            <Brain className="w-3 h-3 text-primary/60" />
            <p className="text-[10px] text-muted-foreground">AI-Powered · League ID: 457622</p>
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">18 Seasons of Data</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        {(title || subtitle) && (
          <header className="flex-shrink-0 px-8 py-4 border-b border-border bg-card/50 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div>
                {title && <h1 className="text-lg font-bold text-foreground tracking-tight">{title}</h1>}
                {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
              </div>
              {headerRight && <div>{headerRight}</div>}
            </div>
          </header>
        )}

        {/* Data health alert banner */}
        <DataHealthBanner />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>

    {/* AI GM Advisor slide-in panel */}
    <AdvisorPanel open={advisorOpen} onClose={() => setAdvisorOpen(false)} />

    </InsideLayoutContext.Provider>
  );
}
