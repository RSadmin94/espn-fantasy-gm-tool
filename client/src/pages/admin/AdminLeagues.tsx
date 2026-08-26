import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { AdminError, AdminKpi, AdminLoading, StatusBadge } from "./adminUi";

export function AdminLeagues() {
  const q = trpc.adminConsole.leagues.useQuery(undefined, { staleTime: 20_000 });
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Could not load leagues"} />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Leagues</h1>
      <div className="grid gap-3 sm:grid-cols-4">
        <AdminKpi label="Healthy" value={q.data.summary.healthy} />
        <AdminKpi label="Degraded" value={q.data.summary.degraded} />
        <AdminKpi label="Failed" value={q.data.summary.failed} />
        <AdminKpi label="Stale" value={q.data.summary.stale} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">League</th>
              <th className="px-3 py-2">Platform</th>
              <th className="px-3 py-2 text-right">Members</th>
              <th className="px-3 py-2">Season</th>
              <th className="px-3 py-2">Last sync</th>
              <th className="px-3 py-2">Health</th>
              <th className="px-3 py-2">Errors</th>
            </tr>
          </thead>
          <tbody>
            {q.data.rows.map((l) => (
              <tr key={l.key} className="border-t border-white/10">
                <td className="px-3 py-2">
                  <Link className="text-lime-300 hover:underline" to={`/admin/leagues/${encodeURIComponent(l.provider)}/${encodeURIComponent(l.leagueId)}`}>
                    {l.leagueName}
                  </Link>
                </td>
                <td className="px-3 py-2">{l.provider}</td>
                <td className="px-3 py-2 text-right">{l.members}</td>
                <td className="px-3 py-2">{l.season}</td>
                <td className="px-3 py-2 text-zinc-400">{l.lastSyncedAt ? new Date(l.lastSyncedAt).toLocaleString() : "—"}</td>
                <td className="px-3 py-2"><StatusBadge status={l.health} /></td>
                <td className="px-3 py-2 text-xs text-red-300">{l.lastSyncError ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminDataHealth() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Global Data Health</h1>
      <p className="text-sm text-muted-foreground">
        League completeness from connected-league sync state and stored team/draft/matchup counts.
        Per-league feature gates remain available on the product Data Health page after selecting a league.
      </p>
      <AdminLeagues />
    </div>
  );
}
