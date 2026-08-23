import { Link, useParams } from "react-router";
import { trpc } from "@/lib/trpc";
import { AdminError, AdminLoading, money } from "./adminUi";

export function AdminFeatureDetail() {
  const { featureId = "" } = useParams();
  const q = trpc.adminConsole.featureDetail.useQuery({ featureId }, { enabled: !!featureId });
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Feature not found"} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <Link to="/admin/features" className="text-xs text-zinc-500 hover:text-foreground">← Features</Link>
      <h1 className="text-2xl font-bold">{d.feature.label}</h1>
      <p className="text-sm text-muted-foreground">
        {d.feature.route ?? "Capability (no standalone route)"}
        {d.aiLabel ? ` · AI: ${d.aiLabel}` : " · No LLM attribution mapped"}
      </p>
      {d.summary ? (
        <div className="grid gap-3 sm:grid-cols-4 text-sm">
          <div className="rounded-lg border border-white/10 p-3">Users {d.summary.users}</div>
          <div className="rounded-lg border border-white/10 p-3">Requests {d.summary.requests}</div>
          <div className="rounded-lg border border-white/10 p-3">Cost {money(d.summary.costUsd)}</div>
          <div className="rounded-lg border border-white/10 p-3">Errors {d.summary.errors}</div>
        </div>
      ) : null}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">30-day trend</h2>
        {d.trend.length === 0 ? <p className="text-sm text-muted-foreground">No AI events in range.</p> : d.trend.map((t) => (
          <div key={t.day} className="flex justify-between border-b border-white/10 py-1 text-sm">
            <span>{t.day}</span><span>{t.requests} · {money(t.costUsd)}</span>
          </div>
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Top users</h2>
        {d.topUsers.map((u) => (
          <div key={String(u.userId)} className="flex justify-between py-1 text-sm">
            {u.userId ? <Link className="text-lime-300" to={`/admin/users/${u.userId}`}>{u.userId}</Link> : <span>unattributed</span>}
            <span>{u.requests} · {money(u.costUsd)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
