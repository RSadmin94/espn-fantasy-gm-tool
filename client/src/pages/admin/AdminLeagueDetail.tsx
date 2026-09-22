import { Link, useParams } from "react-router";
import { trpc } from "@/lib/trpc";
import { AdminError, AdminLoading, StatusBadge, money } from "./adminUi";

function WeeklyWeekPanel({ leagueId }: { leagueId: string }) {
  const q = trpc.adminConsole.weeklyWeek.useQuery({ leagueId, week: 1 }, { staleTime: 20_000 });
  if (q.isLoading) return <p className="text-xs text-zinc-500">Loading Week 1 pack???</p>;
  if (q.isError || !q.data) return <p className="text-xs text-red-400">{q.error?.message ?? "Week pack unavailable"}</p>;
  const d = q.data;
  const cost = (d.usage ?? []).reduce((s, u) => s + Number(u.estimatedCostUsd ?? 0), 0);
  return (
    <div className="space-y-2 text-sm">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 p-3">Season {d.season}</div>
        <div className="rounded-lg border border-white/10 p-3">Week {d.week} ?? {d.weekStatus}</div>
        <div className="rounded-lg border border-white/10 p-3">Stats {d.weeklyStatsStatus ?? "???"}</div>
        <div className="rounded-lg border border-white/10 p-3">AI {money(cost)}</div>
      </div>
      <p className="text-xs text-zinc-500">
        Roster snapshot {d.snapshots.roster} ?? week-0 {d.snapshots.week0Roster} ?? standings {d.snapshots.standings}
        {" ?? "}raw events {d.detections.raw} / canonical {d.detections.canonical}
        {" ?? "}weekly events {d.edition?.weeklyEventCount ?? "???"} / context {d.edition?.historicalContextCount ?? "???"}
        {" ?? "}storylines {d.detections.storylines} ?? fear {d.detections.fear}
      </p>
      <p className="text-xs text-zinc-500">
        Narratives: {d.narratives.length === 0 ? "none" : d.narratives.map((n) => `${n.eventId}:${n.status}`).join(" ?? ")}
      </p>
      {d.edition?.headline && (
        <p className="text-xs text-zinc-300">Headline: {d.edition.headline}</p>
      )}
      {d.warnings.length > 0 ? (
        <p className="text-xs text-amber-400">Warnings: {d.warnings.join(" | ")}</p>
      ) : (
        <p className="text-xs text-zinc-500">No engine warnings.</p>
      )}
    </div>
  );
}

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
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Weekly season engine</h2>
        <WeeklyWeekPanel leagueId={decodeURIComponent(leagueId)} />
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
