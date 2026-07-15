import { trpc } from "@/lib/trpc";
import { Loader2, TrendingDown } from "lucide-react";

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

export function AdminConversionFunnel() {
  const q = trpc.funnel.getRivalryWallStats.useQuery(undefined, { staleTime: 30_000 });

  if (q.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading funnel…
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">Conversion Funnel</h1>
        <p className="mt-4 text-red-400">
          {q.isError &&
          (q.error.message === "Admin access required" || q.error.data?.code === "FORBIDDEN")
            ? "This page is for admins only."
            : q.error?.message ?? "Could not load funnel data."}
        </p>
      </div>
    );
  }

  const data = q.data;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Rivalry Wall Conversion Funnel</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Beta path: free user sees rivalry wall → upgrade click → Stripe checkout → payment.
        Unique users per step; drop-off is users lost between steps.
      </p>

      {data.conversionRatePct != null && (
        <div className="mt-6 rounded-lg border border-lime-500/30 bg-lime-500/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-lime-400">Overall conversion</div>
          <div className="mt-1 text-3xl font-black tabular-nums">{pct(data.conversionRatePct)}</div>
          <div className="text-xs text-muted-foreground">Payment completed ÷ wall viewed</div>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Step</th>
              <th className="px-4 py-3 font-semibold text-right">Users</th>
              <th className="px-4 py-3 font-semibold text-right">Drop-off</th>
            </tr>
          </thead>
          <tbody>
            {data.steps.map((row) => (
              <tr key={row.event} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{row.step}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.uniqueUsers.toLocaleString()}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {row.dropOffPct != null ? (
                    <span className="inline-flex items-center justify-end gap-1">
                      {row.dropOffPct > 0 && <TrendingDown className="h-3.5 w-3.5 text-amber-400" />}
                      {pct(row.dropOffPct)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            <tr className="bg-muted/20">
              <td className="px-4 py-3 font-medium text-muted-foreground">
                Checkout abandoned (derived)
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{data.checkoutAbandonedUsers.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-xs text-muted-foreground">Opened, no payment in 24h</td>
            </tr>
          </tbody>
        </table>
      </div>

      {data.lastFeatureBreakdown.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold">What tipped them (last free feature before upgrade click)</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Feature</th>
                  <th className="px-4 py-3 font-semibold text-right">Upgrade clicks</th>
                </tr>
              </thead>
              <tbody>
                {data.lastFeatureBreakdown.map((row) => (
                  <tr key={row.feature} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{row.feature}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
