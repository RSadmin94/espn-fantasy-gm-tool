import { trpc } from "@/lib/trpc";
import { AdminError, AdminLoading, StatusBadge, money } from "./adminUi";

export function AdminIntegrations() {
  const q = trpc.adminConsole.integrations.useQuery(undefined, { staleTime: 20_000 });
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Could not load integrations"} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Integrations & System Health</h1>
      <p className="text-sm text-muted-foreground">API keys are shown only as Configured / Not configured. {d.secretsNeverExposed ? "No secrets are included in this payload." : ""}</p>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Component</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Keys</th>
              <th className="px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {d.components.map((c) => (
              <tr key={c.id} className="border-t border-white/10">
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                <td className="px-3 py-2">{c.configured ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">{c.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">{d.qwen.note}</p>
      <p className="text-xs text-zinc-500">
        Last health check {d.health.timestamp}
        {d.health.gitSha && d.health.gitSha !== "unknown" ? ` · ${d.health.gitSha.slice(0, 10)}` : " · commit unknown"}
      </p>
    </div>
  );
}

export function AdminProviders() {
  const q = trpc.adminConsole.integrations.useQuery(undefined, { staleTime: 20_000 });
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Could not load providers"} />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Providers & Models</h1>
      <p className="text-sm text-muted-foreground">MTD usage from usage_events. Feature mapping lives on Usage & Cost.</p>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2 text-right">Calls</th>
              <th className="px-3 py-2 text-right">Tokens</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Errors</th>
              <th className="px-3 py-2 text-right">Avg latency</th>
            </tr>
          </thead>
          <tbody>
            {q.data.providerUsage.map((p) => (
              <tr key={`${p.provider}-${p.model}`} className="border-t border-white/10">
                <td className="px-3 py-2">{p.provider}</td>
                <td className="px-3 py-2">{p.model}</td>
                <td className="px-3 py-2 text-right">{p.requests}</td>
                <td className="px-3 py-2 text-right">{p.tokens}</td>
                <td className="px-3 py-2 text-right">{money(p.costUsd)}</td>
                <td className="px-3 py-2 text-right">{p.errors}</td>
                <td className="px-3 py-2 text-right">{Math.round(p.avgLatencyMs)}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
