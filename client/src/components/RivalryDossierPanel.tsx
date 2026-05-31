import { useEffect, useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Calendar,
  ChartLine,
  Lightbulb,
  Trophy,
  Crosshair,
  HeartCrack,
  ScrollText,
  Swords,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ACCENT_RED = "rgba(248, 113, 113, 0.95)";
const ACCENT_BLUE = "rgba(96, 165, 250, 0.95)";

const getErrorMessage = (err: unknown) =>
  err && typeof err === "object" && "message" in err
    ? String((err as { message?: unknown }).message)
    : String(err ?? "Unknown error");

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0] + p[1]![0]).toUpperCase();
}

export type RivalryPickerOption = { ownerKey: string; label: string };

type Props = {
  focalOwnerKey: string;
  pickerOptions?: RivalryPickerOption[];
  /** Default rivalry filter: current season + recent alumni / champions (omit when historical toggle on). */
  rivalryEligibleOwnerKeys?: string[];
  activeSeason?: number;
};

export function RivalryDossierPanel({
  focalOwnerKey,
  pickerOptions,
  rivalryEligibleOwnerKeys,
  activeSeason,
}: Props) {
  const [queryKey, setQueryKey] = useState(focalOwnerKey.trim());
  const [includeHistoricalOwners, setIncludeHistoricalOwners] = useState(false);
  const [opponentKey, setOpponentKey] = useState<string>("");

  useEffect(() => {
    setQueryKey(focalOwnerKey.trim());
  }, [focalOwnerKey]);

  const rosterSet = useMemo(() => {
    if (!rivalryEligibleOwnerKeys?.length) return null;
    return new Set(rivalryEligibleOwnerKeys);
  }, [rivalryEligibleOwnerKeys?.join("|")]);

  const filteredPickers = useMemo(() => {
    if (!pickerOptions?.length) return [];
    const sorted = [...pickerOptions].sort((a, b) => a.label.localeCompare(b.label));
    if (includeHistoricalOwners || !rosterSet) return sorted;
    const f = sorted.filter((o) => rosterSet.has(o.ownerKey));
    if (queryKey && !rosterSet.has(queryKey)) {
      const cur = sorted.find((x) => x.ownerKey === queryKey);
      if (cur) return [cur, ...f.filter((x) => x.ownerKey !== queryKey)];
    }
    return f;
  }, [pickerOptions, rosterSet, includeHistoricalOwners, queryKey]);

  const eligibleForQuery = useMemo(() => {
    if (includeHistoricalOwners) return undefined;
    if (!rivalryEligibleOwnerKeys?.length) return undefined;
    return [...rivalryEligibleOwnerKeys];
  }, [includeHistoricalOwners, rivalryEligibleOwnerKeys?.join("|")]);

  const q = trpc.owners.rivalryDossier.useQuery(
    {
      ownerKey: queryKey,
      includeHistoricalOwners,
      rivalryEligibleOwnerKeys: eligibleForQuery,
      opponentOwnerKeyForPair: opponentKey || undefined,
    },
    { enabled: queryKey.length > 0, staleTime: 60_000 },
  );

  useEffect(() => {
    const opps = q.data?.opponents;
    if (!opps?.length) {
      setOpponentKey("");
      return;
    }
    setOpponentKey((cur) => {
      if (cur && opps.some((o) => o.opponentOwnerKey === cur)) return cur;
      return opps[0]!.opponentOwnerKey;
    });
  }, [q.data?.opponents]);

  if (!queryKey) {
    return <p className="text-sm text-muted-foreground">Select an owner to load the dossier.</p>;
  }

  if (q.isPending || q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading rivalry dossier…
      </div>
    );
  }

  if (q.isError) {
    return (
      <p className="text-sm text-destructive">
        Could not load dossier: {getErrorMessage(q.error)}
      </p>
    );
  }

  const data = q.data;
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        No dossier for this owner — they may not resolve against gmTeams / gmMatchups yet.
      </p>
    );
  }

  const pd = data.pairDetail;
  const oppRow = data.opponents.find((o) => o.opponentOwnerKey === opponentKey);

  return (
    <div className="space-y-5 rounded-xl border border-white/[0.08] bg-gradient-to-b from-[#0c1018] to-[#070a10] p-4 shadow-[0_0_40px_rgba(0,0,0,0.45)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-zinc-100">
            <ScrollText className="h-4 w-4 text-sky-400/90" />
            <h3 className="text-base font-bold uppercase tracking-[0.18em]">Rivalry Dossier</h3>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            gmMatchups · completed games (RS + playoffs) · {data.matchupRowsUsed} deduped rows · season{" "}
            {activeSeason ?? "—"}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2">
            <Switch
              id="hist-own"
              checked={includeHistoricalOwners}
              onCheckedChange={(v) => setIncludeHistoricalOwners(Boolean(v))}
            />
            <Label htmlFor="hist-own" className="cursor-pointer text-xs text-zinc-300">
              Include Historical Owners
            </Label>
          </div>
          {filteredPickers.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              <span>Focal owner</span>
              <select
                className="rounded-md border border-white/[0.12] bg-[#0b0e14] px-2 py-1.5 text-sm text-zinc-100 min-w-[200px] max-w-full"
                value={queryKey}
                onChange={(e) => setQueryKey(e.target.value)}
              >
                {filteredPickers.map((o) => (
                  <option key={o.ownerKey} value={o.ownerKey}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {data.opponents.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              <span>Rival</span>
              <select
                className="rounded-md border border-white/[0.12] bg-[#0b0e14] px-2 py-1.5 text-sm text-zinc-100 min-w-[200px] max-w-full"
                value={opponentKey}
                onChange={(e) => setOpponentKey(e.target.value)}
              >
                {data.opponents.map((o) => (
                  <option key={o.opponentOwnerKey} value={o.opponentOwnerKey}>
                    {o.opponentDisplayName} ({o.wins}–{o.losses}
                    {o.ties ? `–${o.ties}` : ""})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {!pd || !oppRow ? (
        <p className="rounded-lg border border-dashed border-white/[0.12] py-10 text-center text-sm text-zinc-500">
          {data.opponents.length === 0
            ? "No head-to-head opponents match the current filters."
            : "Select a rival with recorded games to view the dossier."}
        </p>
      ) : (
        <>
          {/* Hero */}
          <div className="relative grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
            <div
              className={cn(
                "relative overflow-hidden rounded-2xl border p-4 shadow-[0_0_24px_rgba(239,68,68,0.12)]",
                "border-red-500/40 bg-gradient-to-br from-red-950/40 to-transparent",
              )}
            >
              <div className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_20%_20%,#f87171,transparent_55%)]" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-red-400/50 bg-red-950/60 text-lg font-bold text-red-100">
                  {initials(pd.focalDisplayName)}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-lg font-semibold text-zinc-50">{pd.focalDisplayName}</div>
                  <div className="inline-flex items-center gap-1 rounded border border-red-500/35 bg-red-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200/90">
                    {pd.focalTag}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Active since {pd.firstMeetingSeason ?? "—"}
                  </p>
                  <p className="text-sm font-medium tabular-nums text-zinc-200">
                    Record vs {pd.opponentDisplayName}: {pd.recordFocalVs.wins}–{pd.recordFocalVs.losses}
                    {pd.recordFocalVs.ties ? `–${pd.recordFocalVs.ties}` : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center py-2 lg:py-0">
              <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-amber-400/50 bg-gradient-to-br from-amber-500/20 to-amber-900/10 text-xl font-black italic tracking-tight text-amber-200 shadow-[0_0_20px_rgba(250,204,21,0.15)]">
                VS
              </div>
            </div>

            <div
              className={cn(
                "relative overflow-hidden rounded-2xl border p-4 shadow-[0_0_24px_rgba(59,130,246,0.12)]",
                "border-blue-500/40 bg-gradient-to-bl from-blue-950/40 to-transparent",
              )}
            >
              <div className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_80%_20%,#60a5fa,transparent_55%)]" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-blue-400/50 bg-blue-950/60 text-lg font-bold text-blue-100">
                  {initials(pd.opponentDisplayName)}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-lg font-semibold text-zinc-50">{pd.opponentDisplayName}</div>
                  <div className="inline-flex items-center gap-1 rounded border border-blue-500/35 bg-blue-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200/90">
                    {pd.opponentTag}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Active since {pd.firstMeetingSeason ?? "—"}
                  </p>
                  <p className="text-sm font-medium tabular-nums text-zinc-200">
                    Record vs {pd.focalDisplayName}: {pd.recordFocalVs.losses}–{pd.recordFocalVs.wins}
                    {pd.recordFocalVs.ties ? `–${pd.recordFocalVs.ties}` : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stat strip */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              icon={<Swords className="h-4 w-4 text-zinc-400" />}
              label="All-Time Record"
              value={`${pd.recordFocalVs.wins}–${pd.recordFocalVs.losses}${pd.recordFocalVs.ties ? `–${pd.recordFocalVs.ties}` : ""}`}
              sub="Head-to-head (RS + playoffs)"
            />
            <StatCard
              icon={<HeartCrack className="h-4 w-4 text-rose-400" />}
              label="Heartbreak Index"
              value={String(pd.heartbreakLossesFocal)}
              sub="Losses by ≤3 pts"
              valueClass="text-rose-300"
            />
            <StatCard
              icon={<Calendar className="h-4 w-4 text-zinc-400" />}
              label="Last Meeting"
              value={pd.lastMeeting ? `${pd.lastMeeting.season} · Wk ${pd.lastMeeting.week}` : "—"}
              sub={
                pd.lastMeeting
                  ? `${pd.lastMeeting.result} ${pd.lastMeeting.ownerScore.toFixed(1)}–${pd.lastMeeting.opponentScore.toFixed(1)}`
                  : "—"
              }
            />
            <StatCard
              icon={<Trophy className="h-4 w-4 text-amber-400/90" />}
              label="Playoff Encounters"
              value={String(pd.playoffEncounters)}
              sub="From playoff gmMatchups"
            />
            <StatCard
              icon={<Crosshair className="h-4 w-4 text-zinc-400" />}
              label="Waiver Snipes"
              value={pd.waiverSnipes.available ? String(pd.waiverSnipes.count) : "—"}
              sub={pd.waiverSnipes.available ? "Detected from transactions" : pd.waiverSnipes.label}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* H2H table */}
            <div className="rounded-xl border border-white/[0.08] bg-black/25 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <ChartLine className="h-4 w-4" />
                Head-to-Head History
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wide text-zinc-500">
                      <th className="py-2 pr-2">Season</th>
                      <th className="py-2 pr-2">Week</th>
                      <th className="py-2 pr-2 text-right text-red-200/90">{pd.focalDisplayName}</th>
                      <th className="py-2 pr-2 text-right text-blue-200/90">{pd.opponentDisplayName}</th>
                      <th className="py-2 text-center">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pd.headToHeadHistory.map((g, i) => (
                      <tr key={`${g.season}-${g.matchupPeriodId}-${i}`} className="border-b border-white/[0.04] text-zinc-300">
                        <td className="py-1.5 pr-2 tabular-nums">{g.season}</td>
                        <td className="py-1.5 pr-2">
                          {g.week}
                          {g.isPlayoff ? <span className="text-amber-400/90"> (P)</span> : null}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-red-200/90">{g.ownerScore.toFixed(1)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-blue-200/90">{g.opponentScore.toFixed(1)}</td>
                        <td
                          className={cn(
                            "py-1.5 text-center font-bold",
                            g.result === "W" && "text-emerald-400",
                            g.result === "L" && "text-rose-400",
                            g.result === "T" && "text-zinc-500",
                          )}
                        >
                          {g.result}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Insights */}
            <div className="rounded-xl border border-amber-500/25 bg-amber-950/10 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-200/90">
                <Lightbulb className="h-4 w-4" />
                Rivalry Insights
              </div>
              {pd.insights.length === 0 ? (
                <p className="text-sm text-zinc-500">Not enough data for rivalry insights yet.</p>
              ) : (
                <ul className="space-y-2">
                  {pd.insights.map((line, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-amber-500/20 bg-black/20 px-3 py-2 text-sm leading-snug text-zinc-200"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="rounded-xl border border-white/[0.08] bg-black/25 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <ChartLine className="h-4 w-4" />
              Matchup History Chart
            </div>
            {pd.chartSeries.length >= 2 ? (
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pd.chartSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#71717a", fontSize: 10 }} width={36} />
                    <Tooltip
                      contentStyle={{ background: "#0b0e14", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
                      labelStyle={{ color: "#a1a1aa" }}
                    />
                    <Line type="monotone" dataKey="ownerScore" name={pd.focalDisplayName} stroke={ACCENT_RED} dot={false} strokeWidth={2} />
                    <Line
                      type="monotone"
                      dataKey="opponentScore"
                      name={pd.opponentDisplayName}
                      stroke={ACCENT_BLUE}
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-zinc-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-4 rounded-sm" style={{ background: ACCENT_RED }} />
                    {pd.focalDisplayName}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-4 rounded-sm" style={{ background: ACCENT_BLUE }} />
                    {pd.opponentDisplayName}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[140px] items-center justify-center rounded-lg border border-dashed border-white/[0.08] text-sm text-zinc-500">
                Matchup History Chart — Coming Soon
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums text-zinc-50", valueClass)}>{value}</div>
      <div className="mt-0.5 text-[10px] leading-snug text-zinc-500">{sub}</div>
    </div>
  );
}
