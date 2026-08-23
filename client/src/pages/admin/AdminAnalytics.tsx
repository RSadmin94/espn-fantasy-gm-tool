import { trpc } from "@/lib/trpc";
import { AdminKpi, AdminLoading, AdminError } from "./adminUi";

export function AdminAnalytics() {
  const q = trpc.adminConsole.analytics.useQuery(undefined, { staleTime: 20_000 });
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Could not load analytics"} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Product Analytics</h1>
      <p className="text-sm text-muted-foreground">
        Active users are distinct IDs on usage_events. Conversion funnel is the existing rivalry-wall funnel.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminKpi label="DAU" value={d.dau} />
        <AdminKpi label="WAU" value={d.wau} />
        <AdminKpi label="MAU" value={d.mau} />
        <AdminKpi label="Signups (30d)" value={d.signups30} />
        <AdminKpi label="League connections (30d)" value={d.leagueConnections30} />
        <AdminKpi
          label="Funnel conversion"
          value={d.funnel.conversionRatePct != null ? `${d.funnel.conversionRatePct.toFixed(1)}%` : "—"}
        />
      </div>
      <p className="text-sm">
        Full funnel table is at <a className="text-lime-300" href="/admin/conversion-funnel">/admin/conversion-funnel</a>.
      </p>
    </div>
  );
}
