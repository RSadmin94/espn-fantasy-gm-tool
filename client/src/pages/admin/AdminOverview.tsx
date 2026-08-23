import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { AdminError, AdminKpi, AdminLoading, StatusBadge, money, pct } from "./adminUi";

export function AdminOverview() {
  const q = trpc.adminConsole.overview.useQuery(undefined, { staleTime: 20_000 });
  if (q.isLoading) return <AdminLoading label="Loading overview…" />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Could not load overview"} />;
  const d = q.data;
  const sha = d.gitSha && d.gitSha !== "unknown" ? d.gitSha.slice(0, 10) : null;
  const deployed = d.buildTime && d.buildTime !== "unknown" ? d.buildTime : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Overview</h1>
        <p className="text-sm text-muted-foreground">Operational command center for Fantasy Football Rivals.</p>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status={d.health} />
        {sha ? <span className="text-xs text-zinc-500">Commit {sha}</span> : <span className="text-xs text-zinc-500">Commit unknown</span>}
        {deployed ? <span className="text-xs text-zinc-500">Build {deployed}</span> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpi label="Active users today" value={d.activeUsers.today} hint={`7d ${d.activeUsers.d7} · 30d ${d.activeUsers.d30}`} />
        <AdminKpi label="Total accounts" value={d.totalAccounts} />
        <AdminKpi label="Connected leagues" value={d.connectedLeagues} hint={`${d.activeLeagues} marked active`} />
        <AdminKpi label="AI spend today" value={money(d.aiSpendToday)} />
        <AdminKpi label="AI spend MTD" value={money(d.aiSpendMtd)} />
        <AdminKpi label="Projected AI spend" value={money(d.projectedAiSpend)} hint={d.monthlyBudgetUsd != null ? `Budget ${money(d.monthlyBudgetUsd)}` : "No budget set"} />
        <AdminKpi label="Requests today" value={d.requestsToday} />
        <AdminKpi label="Error rate" value={pct(d.errorRate)} />
        <AdminKpi label="Failed syncs (7d)" value={d.dataSyncFailures} />
        <AdminKpi label="Accounts needing attention" value={d.accountsRequiringAttention} />
        <AdminKpi label="Most used feature" value={d.mostUsedFeature?.id ?? "—"} hint={d.mostUsedFeature ? `${d.mostUsedFeature.requests} requests` : undefined} />
        <AdminKpi label="Most expensive feature" value={d.mostExpensiveFeature?.id ?? "—"} hint={d.mostExpensiveFeature ? money(d.mostExpensiveFeature.costUsd) : undefined} />
      </div>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Needs attention</h2>
        {d.attention.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attention items from current signals.</p>
        ) : (
          <div className="space-y-2">
            {d.attention.map((item) => (
              <Link
                key={item.id}
                to={item.href}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm hover:border-lime-500/30"
              >
                <span>{item.title}</span>
                <StatusBadge status={item.severity} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
