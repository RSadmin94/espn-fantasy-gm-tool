import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Trophy, Users, ClipboardList, Star, Swords,
  ArrowLeftRight, TrendingUp, Bot, RefreshCw, ChevronRight,
  Activity, Brain, Zap, UserSearch, BarChart3, Calculator, GitCompare,
  Shield, BarChart2, Microscope, Target, Gem, CalendarDays,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const navItems = [
  // Overview
  { href: "/", icon: LayoutDashboard, label: "GM War Room", group: "Overview" },
  { href: "/standings", icon: Trophy, label: "Standings", group: "Overview" },
  { href: "/matchups", icon: Swords, label: "Matchups", group: "Overview" },
  // Team Management
  { href: "/rosters", icon: Users, label: "Rosters", group: "Team Mgmt" },
  { href: "/draft", icon: ClipboardList, label: "Draft History", group: "Team Mgmt" },
  { href: "/keepers", icon: Star, label: "Keeper Tracker", group: "Team Mgmt" },
  { href: "/keeper-calculator", icon: Brain, label: "Keeper Calculator", group: "Team Mgmt", badge: "2026" },
  // Pro Tools
  { href: "/startsit", icon: Zap, label: "Start/Sit Advisor", group: "Pro Tools", badge: "AI" },
  { href: "/trade", icon: ArrowLeftRight, label: "Trade Analyzer", group: "Pro Tools", badge: "AI" },
  { href: "/waiver", icon: TrendingUp, label: "Waiver Wire", group: "Pro Tools", badge: "AI" },
  { href: "/pick-value", icon: Calculator, label: "Pick Value Calc", group: "Pro Tools", badge: "NEW" },
  { href: "/pick-tracker", icon: GitCompare, label: "Pick Trade Tracker", group: "Pro Tools", badge: "NEW" },
  { href: "/keeper-roi", icon: TrendingUp, label: "Keeper ROI Tracker", group: "Pro Tools" },
  { href: "/trade-offer", icon: ArrowLeftRight, label: "Trade Offer Gen", group: "Pro Tools", badge: "NEW" },
  { href: "/draft-optimizer", icon: Target, label: "Draft Optimizer", group: "Pro Tools", badge: "NEW" },
  { href: "/keeper-future-value", icon: Gem, label: "Keeper Future Value", group: "Pro Tools", badge: "NEW" },
  { href: "/schedule-strength", icon: CalendarDays, label: "Schedule Strength", group: "Pro Tools", badge: "NEW" },
  // Intelligence
  { href: "/advisor", icon: Bot, label: "AI GM Advisor", group: "Intelligence", badge: "AI" },
  { href: "/analytics", icon: BarChart2, label: "League Analytics", group: "Intelligence", badge: "NEW" },
  { href: "/manager-behavior", icon: Microscope, label: "Opponent Intel", group: "Intelligence", badge: "NEW" },
  { href: "/player-profiles", icon: UserSearch, label: "Player Profiles", group: "Intelligence" },
  { href: "/owner-stats", icon: BarChart3, label: "Owner Career Stats", group: "Intelligence" },
  // System
  { href: "/refresh", icon: RefreshCw, label: "Data Refresh", group: "System" },
  { href: "/data-health", icon: Shield, label: "Data Health", group: "System" },
];

const groups = ["Overview", "Team Mgmt", "Pro Tools", "Intelligence", "System"];

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
}

export default function AppLayout({ children, title, subtitle, headerRight }: AppLayoutProps) {
  const [location] = useLocation();

  return (
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
  );
}
