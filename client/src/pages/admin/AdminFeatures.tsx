import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AdminError, AdminLoading, StatusBadge, money } from "./adminUi";

export function AdminFeatures() {
  const q = trpc.adminConsole.features.useQuery(undefined, { staleTime: 20_000 });
  const session = trpc.me.session.useQuery();
  const setOv = trpc.adminConsole.setFeatureOverride.useMutation({ onSuccess: () => q.refetch() });
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Could not load features"} />;
  const canManage = session.data?.isOwner === true;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Features</h1>
      <p className="text-sm text-muted-foreground">
        Registered product features only. Owner can enable, disable, restrict, or put a feature in maintenance.
        Features without an LLM mapping show <span className="text-amber-400">Partial enforcement</span> — UI/session
        gates apply; non-LLM tRPC routes are not globally blocked.
      </p>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Feature</th>
              <th className="px-3 py-2">Enabled</th>
              <th className="px-3 py-2 text-right">Users</th>
              <th className="px-3 py-2 text-right">Requests</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Errors</th>
              <th className="px-3 py-2">Health</th>
              <th className="px-3 py-2">Controls</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((f) => (
              <tr key={f.id} className="border-t border-white/10">
                <td className="px-3 py-2">
                  <Link className="text-lime-300 hover:underline" to={`/admin/features/${f.id}`}>{f.label}</Link>
                  <div className="text-[11px] text-zinc-500">{f.route ?? f.entryType}</div>
                </td>
                <td className="px-3 py-2">{f.enabled && !f.maintenance ? "Yes" : f.maintenance ? "Maintenance" : "No"}</td>
                <td className="px-3 py-2 text-right">{f.users}</td>
                <td className="px-3 py-2 text-right">{f.requests}</td>
                <td className="px-3 py-2 text-right">{money(f.costUsd)}</td>
                <td className="px-3 py-2 text-right">{f.errors}</td>
                <td className="px-3 py-2"><StatusBadge status={f.health} /></td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" disabled={!canManage || setOv.isPending} onClick={() => setOv.mutate({ featureId: f.id, enabled: true, maintenance: false, restrictTo: "none", reason: "enable" })}>On</Button>
                    <Button size="sm" variant="outline" disabled={!canManage || setOv.isPending} onClick={() => setOv.mutate({ featureId: f.id, enabled: true, maintenance: true, restrictTo: "none", reason: "maintenance" })}>Maint</Button>
                    <Button size="sm" variant="outline" disabled={!canManage || setOv.isPending} onClick={() => setOv.mutate({ featureId: f.id, enabled: false, maintenance: false, restrictTo: "none", reason: "disable" })}>Off</Button>
                    <Button size="sm" variant="outline" disabled={!canManage || setOv.isPending} onClick={() => setOv.mutate({ featureId: f.id, enabled: true, maintenance: false, restrictTo: "admin", reason: "admin only" })}>Admin</Button>
                    <Button size="sm" variant="outline" disabled={!canManage || setOv.isPending} onClick={() => setOv.mutate({ featureId: f.id, enabled: true, maintenance: false, restrictTo: "owner", reason: "owner only" })}>Owner</Button>
                    {f.aiFeatureId ? null : (
                      <span className="text-[10px] uppercase tracking-wide text-amber-400">Partial enforcement</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {setOv.error ? <p className="text-xs text-red-400">{setOv.error.message}</p> : null}
    </div>
  );
}
