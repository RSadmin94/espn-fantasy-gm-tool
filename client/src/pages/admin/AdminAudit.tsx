import { trpc } from "@/lib/trpc";
import { AdminError, AdminLoading } from "./adminUi";

export function AdminAudit() {
  const q = trpc.adminConsole.audit.useQuery({}, { staleTime: 10_000 });
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Could not load audit log"} />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {q.data.rows.map((r) => (
              <tr key={r.id} className="border-t border-white/10">
                <td className="px-3 py-2 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</td>
                <td className="px-3 py-2">{r.actorUserId}</td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="px-3 py-2">{r.targetType}:{r.targetId}</td>
                <td className="px-3 py-2 text-xs">{r.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">{q.data.total} events</p>
    </div>
  );
}
