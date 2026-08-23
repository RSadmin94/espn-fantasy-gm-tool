import { trpc } from "@/lib/trpc";
import { AdminError, AdminLoading, StatusBadge } from "./adminUi";

export function AdminJobs() {
  const q = trpc.adminConsole.jobs.useQuery(undefined, { staleTime: 20_000 });
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Could not load jobs"} />;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Jobs / Queues</h1>
      <p className="text-sm text-amber-200">{q.data.note}</p>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Scheduled jobs</h2>
        {q.data.scheduled.length === 0 ? <p className="text-sm text-muted-foreground">No scheduled_jobs rows.</p> : (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Cron</th>
                  <th className="px-3 py-2">Last run</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Next</th>
                </tr>
              </thead>
              <tbody>
                {q.data.scheduled.map((j) => (
                  <tr key={j.id} className="border-t border-white/10">
                    <td className="px-3 py-2">{j.name}</td>
                    <td className="px-3 py-2 text-xs">{j.cronExpression ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2"><StatusBadge status={j.lastRunStatus ?? (j.isEnabled ? "queued" : "unknown")} /></td>
                    <td className="px-3 py-2 text-xs">{j.nextRunAt ? new Date(j.nextRunAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Recent sync runs</h2>
        {q.data.recentSyncs.map((r) => (
          <div key={r.id} className="border-b border-white/10 py-2 text-xs">
            {String(r.startedAt)} · {r.leagueId} · season {r.season} · {r.status}
            {r.errorMessage ? ` · ${r.errorMessage}` : ""}
          </div>
        ))}
      </section>
    </div>
  );
}
