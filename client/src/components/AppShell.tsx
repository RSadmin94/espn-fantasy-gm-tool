import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useUser, useClerk } from "@clerk/react-router";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Connect ESPN", href: "/connect", icon: Plug },
  { label: "Sync Data", href: "/sync", icon: RefreshCw },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
  { label: "Draft History", href: "/draft-history", icon: ListOrdered },
  { label: "Standings", href: "/standings", icon: Trophy },
  { label: "Matchups", href: "/matchups", icon: LayoutGrid },
  { label: "Roster", href: "/roster", icon: Users },
  { label: "Trades", href: "/trades", icon: Repeat2 },
  { label: "AI Advisor", href: "/advisor", icon: Bot },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

function Sidebar({ onClose }: { onClose?: () => void }) {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col bg-card border-r border-border">
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-primary">GM</span>
            <span className="text-foreground"> War Room</span>
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary/15 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                  {isActive && (
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-primary/60" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 text-xs text-muted-foreground">
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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4 md:px-6">
      {/* Left: hamburger (mobile) + logo text */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="text-muted-foreground hover:text-foreground transition-colors md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-lg font-bold md:hidden">
          <span className="text-primary">GM</span>
          <span className="text-foreground"> War Room</span>
        </span>
      </div>

      {/* Right: user info + sign out */}
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
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 md:block">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute left-0 top-0 h-full w-64"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
