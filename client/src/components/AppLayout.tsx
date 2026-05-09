// FILE: client/src/components/AppLayout.tsx
import { createContext, useContext } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ClipboardList, Star, ArrowLeftRight, Bot, ChevronRight,
  Activity, Brain, Zap, Shield, Microscope,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const navItems = [
  // Command Center
  { href: "/command-center", icon: LayoutDashboard, label: "Command Center", group: "Overview" },
  // Draft & Keepers
  { href: "/draft-war-room", icon: ClipboardList, label: "Draft War Room", group: "Draft & Keepers", badge: "2026" },
  { href: "/keeper-lab", icon: Star, label: "Keeper Lab", group: "Draft & Keepers" },
  // Decision Tools
  { href: "/trade-lab", icon: ArrowLeftRight, label: "Trade Lab", group: "Decision Tools", badge: "AI" },
  { href: "/waiver-lab", icon: Zap, label: "Waiver Lab", group: "Decision Tools", badge: "AI" },
  // Intelligence
  { href: "/advisor", icon: Bot, label: "AI GM Advisor", group: "Intelligence", badge: "AI" },
  { href: "/opponent-intel", icon: Microscope, label: "Opponent Intel", group: "Intelligence" },
  // System
  { href: "/data-center", icon: Shield, label: "Data Center", group: "System" },
  { href: "/weekly-stats", icon: Activity, label: "Weekly Stats", group: "System" },
];

const groups = ["Overview", "Draft & Keepers", "Decision Tools", "Intelligence", "System"];

// ── Embedded context ─────────────────────────────────────────────────────────
// Prevents double sidebar: if AppLayout is already rendered by a parent
// (e.g. a hub page), any nested AppLayout renders only its children.
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
                  const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 mb-0.5 group",
                        active
                          ? "bg-primary/15 text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                      )}
                    >
                      <item.icon className={cn("w-4 h-4 flex-shrink-0 transition-colors", active ? "text-primary" : "group-hover:text-foreground")} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <Badge className="text-[8px] px-1 py-0 h-3.5 espn-gradient text-white border-0 font-bold">
                          {item.badge}
                        </Badge>
                      )}
                      {active && <ChevronRight className="w-3 h-3 text-primary flex-shrink-0" />}
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

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
    </InsideLayoutContext.Provider>
  );
}
