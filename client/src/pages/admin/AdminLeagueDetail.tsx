import { Link, useParams } from "react-router";
import { trpc } from "@/lib/trpc";
import { AdminError, AdminLoading, StatusBadge, money } from "./adminUi";

export function AdminLeagueDetail() {
  const { provider = "", leagueId = "" } = useParams();
  const q = trpc.adminConsole.leagueDetail.useQuery(
    { provider: decodeURIComponent(provider), leagueId: decodeURIComponent(leagueId) },
    { enabled: !!provider && !!leagueId },
  );
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "League not found"} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <Link to="/admin/leagues" className="text-xs text-zinc-500 hover:text-foreground">← Leagues</Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{d.leagueName}</h1>
        <StatusBadge status={d.health} />
      </div>
      <p className="text-sm text-muted-foreground">{d.provider} · {d.leagueId} · season {d.season}</p>
      <div className="grid gap-3 sm:grid-cols-4 text-sm">
        <div className="rounded-lg border border-white/10 p-3">Teams {d.counts.teams}</div>
        <div className="rounded-lg border border-white/10 p-3">Drafts {d.counts.drafts}</div>
        <div className="rounded-lg border border-white/10 p-3">Matchups {d.counts.matchups}</div>
        <div className="rounded-lg border border-white/10 p-3">MTD AI {money(d.usageMtd.costUsd)}</div>
      </div>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Members</h2>
        {d.connections.map((c) => (
          <div key={c.userId} className="flex justify-between border-b border-white/10 py-2 text-sm">
            <Link className="text-lime-300" to={`/admin/users/${c.userId}`}>{c.userName || c.userEmail || `User ${c.userId}`}</Link>
            <span className="text-zinc-500">{c.selectedOwnerName || c.selectedFranchiseName || "—"}</span>
          </div>
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Recent syncs</h2>
        {d.recentSyncs.map((r) => (
          <div key={r.id} className="border-b border-white/10 py-2 text-xs">
            {String(r.startedAt)} · {r.status} · season {r.season} {r.errorMessage ? `· ${r.errorMessage}` : ""}
          </div>
        ))}
      </section>
    </div>
  );
}
