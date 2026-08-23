import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router";
import { Menu, X, ArrowLeft, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ADMIN_NAV } from "./adminNav";

export function AdminConsoleLayout() {
  const location = useLocation();
  const sessionQ = trpc.me.session.useQuery();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchQ = trpc.adminConsole.search.useQuery(
    { q },
    { enabled: q.trim().length >= 2 && !!sessionQ.data?.isAdmin, staleTime: 10_000 },
  );

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (sessionQ.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Checking admin access…
      </div>
    );
  }

  if (!sessionQ.data?.isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-2xl font-bold">Admin Console</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This area is restricted to the application owner. Direct URL access is denied for everyone else.
        </p>
        <Link to="/dashboard" className="text-sm font-semibold text-lime-400 hover:text-lime-300">
          Return to Fantasy Football Rivals
        </Link>
      </div>
    );
  }

  const results = searchQ.data;

  return (
    <div className="flex min-h-screen bg-[#0c0d10] text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 border-r border-white/10 bg-[#111318] p-4 transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-lime-400">Rivals</div>
            <div className="text-sm font-semibold">Admin Console</div>
          </div>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Close admin nav">
            <X className="h-4 w-4" />
          </button>
        </div>
        <Link
          to="/dashboard"
          className="mb-4 flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to app
        </Link>
        <nav className="space-y-4 overflow-y-auto pb-8">
          {ADMIN_NAV.map((group) => (
            <div key={group.id}>
              <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "block rounded-md px-2 py-1.5 text-sm",
                        active
                          ? "bg-lime-500/15 font-semibold text-lime-300"
                          : "text-zinc-400 hover:bg-white/5 hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/10 bg-[#111318] px-4 py-3">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open admin nav">
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search users, emails, league IDs…"
              className="h-9 bg-black/30 pl-8"
            />
            {q.trim().length >= 2 && (results?.users.length || results?.leagues.length) ? (
              <div className="absolute z-30 mt-1 w-full rounded-md border border-white/10 bg-[#16181d] p-2 shadow-xl">
                {results?.users.map((u) => (
                  <Link
                    key={`u-${u.id}`}
                    to={`/admin/users/${u.id}`}
                    className="block rounded px-2 py-1.5 text-sm hover:bg-white/5"
                    onClick={() => setQ("")}
                  >
                    {u.name || u.email || u.openId} <span className="text-zinc-500">#{u.id}</span>
                  </Link>
                ))}
                {results?.leagues.map((l) => (
                  <Link
                    key={`l-${l.provider}-${l.leagueId}`}
                    to={`/admin/leagues/${encodeURIComponent(l.provider)}/${encodeURIComponent(l.leagueId)}`}
                    className="block rounded px-2 py-1.5 text-sm hover:bg-white/5"
                    onClick={() => setQ("")}
                  >
                    {l.leagueName || l.leagueId} <span className="text-zinc-500">{l.provider}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <div className="hidden text-xs text-zinc-500 sm:block">
            {sessionQ.data.isOwner ? "Owner" : "Admin"}
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AdminIndexRedirect() {
  return <Navigate to="/admin/overview" replace />;
}
