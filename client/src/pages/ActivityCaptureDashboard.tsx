import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";

const EVENT_TYPE_COLORS: Record<string, string> = {
  TRADE:  "bg-red-500/20 text-red-400 border-red-500/40",
  ADD:    "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  DROP:   "bg-slate-500/20 text-slate-400 border-slate-500/40",
  WAIVER: "bg-amber-500/20 text-amber-400 border-amber-500/40",
};

function EventTypeBadge({ type }: { type: string }) {
  const cls = EVENT_TYPE_COLORS[type] ?? "bg-slate-500/20 text-slate-400 border-slate-500/40";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {type}
    </span>
  );
}

function formatTs(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function ActivityCaptureDashboard() {
  const { user } = useAuth();
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data, isLoading, refetch } = trpc.espn.getActivityEvents.useQuery(
    { season: parseInt(season, 10), limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    { enabled: user?.role === "admin" }
  );

  const { data: summary } = trpc.espn.getActivitySummary.useQuery(
    { season: parseInt(season, 10) },
    { enabled: user?.role === "admin" }
  );

  if (user?.role !== "admin") {
    return (
      <AppLayout>
        <div className="p-8 text-center text-muted-foreground">Admin access required.</div>
      </AppLayout>
    );
  }

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const currentYear = new Date().getFullYear();
  const seasons = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">ESPN Activity Capture</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Debug view — league events captured passively by the Chrome extension
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={season} onValueChange={(v) => { setSeason(v); setPage(0); }}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {seasons.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Events", value: summary.total },
              { label: "Trades", value: summary.byType?.TRADE ?? 0 },
              { label: "Adds / Waivers", value: (summary.byType?.ADD ?? 0) + (summary.byType?.WAIVER ?? 0) },
              { label: "Drops", value: summary.byType?.DROP ?? 0 },
            ].map(({ label, value }) => (
              <Card key={label} className="bg-card/60">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Events table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Events — {season} season
              {total > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({total} total, showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : events.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-muted-foreground text-sm font-medium">No events captured yet for {season}</p>
                <p className="text-muted-foreground text-xs">
                  Install extension v1.5.3 and browse your ESPN league — events will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Type</th>
                      <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Owner</th>
                      <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Players / Picks</th>
                      <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Processed</th>
                      <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">ESPN TX ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => {
                      let payload: { players?: Array<{name: string; pos: string}>; picks?: Array<{round: number}> } = {};
                      try { payload = JSON.parse(ev.payloadJson ?? "{}"); } catch {}
                      const players = payload.players ?? [];
                      const picks = payload.picks ?? [];
                      const summary = [
                        ...players.map(p => `${p.name} (${p.pos})`),
                        ...picks.map(p => `Rd ${p.round} pick`),
                      ].join(", ") || "—";

                      return (
                        <tr key={ev.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2">
                            <EventTypeBadge type={ev.eventType} />
                          </td>
                          <td className="px-4 py-2 text-foreground font-medium">
                            {ev.ownerName || `Team ${ev.teamId}`}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground max-w-xs truncate" title={summary}>
                            {summary}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground text-xs">
                            {formatTs(ev.processedAt)}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground text-xs font-mono">
                            {ev.espnTxId}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
