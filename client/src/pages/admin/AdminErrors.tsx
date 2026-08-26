import { trpc } from "@/lib/trpc";
import { AdminError, AdminLoading, StatusBadge } from "./adminUi";

export function AdminErrors() {
  const q = trpc.adminConsole.errors.useQuery({}, { staleTime: 15_000 });
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Could not load errors"} />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Errors</h1>
      {q.data.deferred.map((d) => (
        <p key={d} className="text-xs text-amber-300">{d}</p>
      ))}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Area</th>
              <th className="px-3 py-2">Error</th>
              <th className="px-3 py-2 text-right">Count</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">League</th>
              <th className="px-3 py-2">Last</th>
            </tr>
          </thead>
          <tbody>
            {q.data.groups.map((g) => (
              <tr key={g.key} className="border-t border-white/10">
                <td className="px-3 py-2"><StatusBadge status={g.area} /></td>
                <td className="px-3 py-2">{g.error}</td>
                <td className="px-3 py-2 text-right">{g.count}</td>
                <td className="px-3 py-2">{g.userId ?? "—"}</td>
                <td className="px-3 py-2">{g.leagueId ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">{g.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
