import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertCircle, Loader2, RefreshCw, Trophy } from "lucide-react";

// ── theme (matches Command Dashboard) ───────────────────────────────────────
const TEXT = "var(--color-foreground)",
  MUTED = "var(--color-muted-foreground)",
  GOLD = "#f5c518",
  ACCENT = "#a3e635",
  RED = "#ef4444",
  LINE = "color-mix(in oklch, var(--color-foreground) 7%, transparent)";
const HEAD = "var(--color-card)";
const PAGEBG: React.CSSProperties = {
  background:
    "radial-gradient(circle at 80% -10%,rgba(139,92,246,.20),transparent 42%),var(--color-background)",
  color: TEXT,
};
const PANEL: React.CSSProperties = {
  background: "var(--color-card)",
  border: `1px solid ${LINE}`,
  borderRadius: 15,
};
const SUB: React.CSSProperties = {
  background: "color-mix(in oklch, var(--color-foreground) 3%, transparent)",
  border: "1px solid color-mix(in oklch, var(--color-foreground) 6%, transparent)",
  borderRadius: 10,
};

function Pill({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span
      className="px-4 py-2.5 rounded-[10px] text-[13px] font-extrabold inline-flex items-center"
      style={
        gold
          ? { color: GOLD, border: "1px solid rgba(245,198,90,.46)", background: "rgba(245,198,90,.10)" }
          : { border: `1px solid ${LINE}`, background: "color-mix(in oklch, var(--color-foreground) 4%, transparent)", color: TEXT }
      }
    >
      {children}
    </span>
  );
}

function SectionHead({
  icon: Icon,
  title,
  caption,
  iconColor = ACCENT,
}: {
  icon: any;
  title: string;
  caption?: string;
  iconColor?: string;
}) {
  return (
    <div>
      <h3 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2">
        <Icon className="h-5 w-5" style={{ color: iconColor }} /> {title}
      </h3>
      {caption && (
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          {caption}
        </p>
      )}
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section style={PANEL} className={`overflow-hidden ${className}`}>
      <div className="p-[18px] md:p-5">{children}</div>
    </section>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamRow {
  teamId: number;
  teamName: string;
  abbrev?: string;
  owners?: unknown;
  wins?: number;
  losses?: number;
  ties?: number;
  pointsFor?: number;
  pointsAgainst?: number;
  rankFinal?: number;
  playoffSeed?: number;
  logoUrl?: string;
  primaryColor?: string;
}

interface TxRow {
  teamId?: number | null;
  transactionId?: string | null;
}

type StandingsMode = "regular" | "final";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const SEASONS_DESC = Array.from({ length: CURRENT_YEAR - 2009 + 1 }, (_, i) => CURRENT_YEAR - i);

function num(n: number | undefined | null): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function fmt1(n: number | undefined | null) {
  return num(n).toFixed(1);
}

function gamesPlayed(t: TeamRow): number {
  const g = num(t.wins) + num(t.losses) + num(t.ties);
  return g > 0 ? g : 1;
}

function winPct(t: TeamRow): number {
  const w = num(t.wins);
  const l = num(t.losses);
  const ti = num(t.ties);
  const g = w + l + ti;
  return g > 0 ? (w + 0.5 * ti) / g : 0;
}

/** Regular season: win pct desc, then PF desc (ESPN-style tiebreak). */
function compareRegular(a: TeamRow, b: TeamRow): number {
  const dPct = winPct(b) - winPct(a);
  if (Math.abs(dPct) > 1e-9) return dPct;
  return num(b.pointsFor) - num(a.pointsFor);
}

/** Final: league final rank, then regular tiebreak. */
function compareFinal(a: TeamRow, b: TeamRow): number {
  const ra = a.rankFinal != null && Number.isFinite(Number(a.rankFinal)) ? Number(a.rankFinal) : 999;
  const rb = b.rankFinal != null && Number.isFinite(Number(b.rankFinal)) ? Number(b.rankFinal) : 999;
  if (ra !== rb) return ra - rb;
  return compareRegular(a, b);
}

function formatRec(t: TeamRow): string {
  return `${num(t.wins)}-${num(t.losses)}-${num(t.ties)}`;
}

function formatDiff(pf: number, pa: number): { text: string; positive: boolean; zero: boolean } {
  const d = pf - pa;
  const zero = Math.abs(d) < 0.05;
  const positive = d > 0;
  const sign = zero ? "" : d > 0 ? "+" : "";
  return { text: `${sign}${d.toFixed(1)}`, positive, zero };
}

/** Normalize ESPN `owners` / member-ish payloads for display (never throws). */
function safeOwnerDisplayLabel(owners: unknown): string {
  if (owners == null || owners === false) return "Unknown";
  if (typeof owners === "string") {
    const t = owners.trim().replace(/\s+/g, " ");
    return t || "Unknown";
  }
  if (typeof owners === "number" || typeof owners === "boolean") {
    return String(owners).trim() || "Unknown";
  }
  if (Array.isArray(owners)) {
    const parts = owners
      .map((x) => safeOwnerDisplayLabel(x))
      .map((s) => s.trim())
      .filter((s) => s && s !== "Unknown");
    const j = parts.join(", ").replace(/\s+/g, " ").trim();
    return j || "Unknown";
  }
  if (typeof owners === "object") {
    const o = owners as Record<string, unknown>;
    for (const k of ["ownerName", "displayName", "name", "fullName", "nickname", "firstName"] as const) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim().replace(/\s+/g, " ");
    }
    const id = o.id ?? o.memberId ?? o.userId;
    if (id != null && String(id).trim()) return `id:${String(id).trim()}`;
    return "Unknown";
  }
  return "Unknown";
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Standings() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );
  const cachedQ = trpc.espn.cachedSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { enabled: leagueKeyReady },
  );

  const cachedSeasons: number[] = leagueKeyReady ? (cachedQ.data ?? []) : [];

  const defaultSeason =
    cachedSeasons.length > 0 ? Math.max(...cachedSeasons) : Math.min(CURRENT_YEAR, 2025);

  const [season, setSeason] = useState<number>(defaultSeason);
  const [mode, setMode] = useState<StandingsMode>("regular");

  useEffect(() => {
    if (cachedSeasons.length > 0) {
      const maxS = Math.max(...cachedSeasons);
      setSeason((s) => (cachedSeasons.includes(s) ? s : maxS));
    }
  }, [cachedSeasons, leagueContextKey]);

  const isNotCached = !cachedSeasons.includes(season);

  const standingsQ = trpc.espn.standings.useQuery(
    withLeagueSalt({ season }, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady && !isNotCached },
  );
  const txsQ = trpc.espn.transactions.useQuery(
    withLeagueSalt({ season, typeFilter: "ALL" }, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady && !isNotCached },
  );

  const rawTeams =
    (leagueKeyReady && !isNotCached
      ? (standingsQ.data as TeamRow[] | undefined)
      : undefined) ?? [];

  const moveCountByTeam = useMemo(() => {
    const txs =
      (leagueKeyReady && !isNotCached ? (txsQ.data as TxRow[] | undefined) : undefined) ?? [];
    const perTeam = new Map<number, Set<string>>();
    for (const row of txs) {
      const tid = row.teamId != null ? Number(row.teamId) : NaN;
      const txid = row.transactionId != null ? String(row.transactionId) : "";
      if (!Number.isFinite(tid) || tid <= 0 || !txid) continue;
      if (!perTeam.has(tid)) perTeam.set(tid, new Set());
      perTeam.get(tid)!.add(txid);
    }
    const counts = new Map<number, number>();
    for (const [tid, set] of perTeam) counts.set(tid, set.size);
    return counts;
  }, [txsQ.data, leagueKeyReady, isNotCached]);

  const teams = useMemo(() => {
    const copy = [...rawTeams];
    copy.sort(mode === "final" ? compareFinal : compareRegular);
    return copy;
  }, [rawTeams, mode]);

  return (
    <div style={PAGEBG} className="-m-4 md:-m-6 p-5 md:p-7 min-h-full">
      {/* ── Header (dashboard style) ─────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <PageHeader
          title="Standings"
          subtitle="League standings in ESPN layout — switch between regular-season order and final ranks."
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <Pill gold>{season} Season</Pill>
          {teams.length > 0 && <Pill>{teams.length} Teams</Pill>}
          <button
            disabled={standingsQ.isFetching || txsQ.isFetching}
            onClick={() => {
              void standingsQ.refetch();
              void txsQ.refetch();
            }}
            className="px-3 py-2.5 rounded-[10px] text-[13px] font-extrabold inline-flex items-center gap-2 disabled:opacity-60"
            style={{ border: `1px solid ${LINE}`, background: "color-mix(in oklch, var(--color-foreground) 4%, transparent)", color: MUTED }}
          >
            {standingsQ.isFetching || txsQ.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* ── Controls ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="w-[7.5rem]">
          <Select value={String(season)} onValueChange={(v) => setSeason(Number(v))}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEASONS_DESC.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  <span className="flex items-center gap-1.5">
                    {s}
                    {cachedSeasons.includes(s) && <span className="text-xs text-lime-400">&#10003;</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => {
            if (v === "regular" || v === "final") setMode(v);
          }}
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          <ToggleGroupItem value="regular" className="text-xs">
            Regular Season
          </ToggleGroupItem>
          <ToggleGroupItem value="final" className="text-xs">
            Final Standings
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {isNotCached && (
        <div style={SUB} className="flex items-center gap-3 p-4 text-sm mb-3">
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
          <span style={{ color: "#e7c46b" }}>
            Season {season} is not in the local cache yet.{" "}
            <a href="/sync" className="underline underline-offset-2">
              Sync data
            </a>{" "}
            to load standings and moves.
          </span>
        </div>
      )}

      {standingsQ.isLoading && (
        <Panel>
          <div className="flex items-center justify-center gap-2 py-20" style={{ color: MUTED }}>
            <Loader2 className="h-5 w-5 animate-spin" /> Loading standings&hellip;
          </div>
        </Panel>
      )}

      {standingsQ.isError && (
        <div style={{ ...SUB, borderColor: "rgba(239,68,68,.3)" }} className="flex items-center gap-3 p-4 text-sm mb-3">
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: RED }} />
          <span style={{ color: "#f3a3a3" }}>{standingsQ.error.message}</span>
        </div>
      )}

      {!standingsQ.isLoading && !standingsQ.isError && teams.length === 0 && (
        <Panel>
          <div className="py-16 text-center text-sm" style={{ color: MUTED }}>
            No standings data for {season}.
          </div>
        </Panel>
      )}

      {teams.length > 0 && (
        <Panel>
          <SectionHead
            icon={Trophy}
            title={`${season} ${mode === "final" ? "Final" : "Regular season"} standings`}
            caption="Logos, records, scoring splits and roster moves — sorted by the active tiebreak."
          />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid color-mix(in oklch, var(--color-foreground) 8%, transparent)" }}>
                  <th className="sticky left-0 z-10 px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ background: HEAD, color: MUTED }}>
                    RK
                  </th>
                  <th className="min-w-[200px] px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                    Team
                  </th>
                  <th className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                    REC
                  </th>
                  <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                    PF
                  </th>
                  <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                    PA
                  </th>
                  <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                    PF/G
                  </th>
                  <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                    PA/G
                  </th>
                  <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                    DIFF
                  </th>
                  <th className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                    MOVES
                  </th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team, idx) => {
                  const rk = idx + 1;
                  const pf = num(team.pointsFor);
                  const pa = num(team.pointsAgainst);
                  const gp = gamesPlayed(team);
                  const pfg = pf / gp;
                  const pag = pa / gp;
                  const diff = formatDiff(pf, pa);
                  const moves = moveCountByTeam.get(team.teamId) ?? 0;
                  const logo = (team.logoUrl || "").trim();
                  const ownerLabel = safeOwnerDisplayLabel(team.owners);
                  const teamNameSafe =
                    typeof team.teamName === "string"
                      ? team.teamName.trim()
                      : team.teamName != null
                        ? safeOwnerDisplayLabel(team.teamName)
                        : "";
                  const abbrevSafe =
                    typeof team.abbrev === "string" ? team.abbrev.trim() : String(team.abbrev ?? "").trim();

                  return (
                    <tr
                      key={team.teamId}
                      className="transition-colors hover:bg-foreground/[0.03]"
                      style={{ borderTop: "1px solid color-mix(in oklch, var(--color-foreground) 6%, transparent)" }}
                    >
                      <td
                        className="sticky left-0 z-10 px-2 py-2.5 text-sm font-black tabular-nums"
                        style={{ background: HEAD, color: rk === 1 ? GOLD : rk <= 4 ? ACCENT : TEXT }}
                      >
                        {rk}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md"
                            style={{ border: "1px solid color-mix(in oklch, var(--color-foreground) 10%, transparent)", background: "color-mix(in oklch, var(--color-foreground) 4%, transparent)" }}
                          >
                            {logo ? (
                              <img src={logo} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[10px] font-bold" style={{ color: MUTED }}>
                                {(abbrevSafe || teamNameSafe || "?").slice(0, 3).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 leading-tight">
                            <div className="truncate font-semibold" style={{ color: TEXT }}>
                              {teamNameSafe || `Team ${team.teamId}`}
                            </div>
                            <div className="truncate text-xs" style={{ color: MUTED }}>
                              {ownerLabel}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-xs tabular-nums" style={{ color: TEXT }}>
                        {formatRec(team)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums" style={{ color: TEXT }}>
                        {fmt1(team.pointsFor)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums" style={{ color: MUTED }}>
                        {fmt1(team.pointsAgainst)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums" style={{ color: TEXT }}>
                        {pfg.toFixed(1)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums" style={{ color: MUTED }}>
                        {pag.toFixed(1)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2.5 text-right font-mono text-xs font-bold tabular-nums",
                          diff.zero && "text-zinc-500",
                          !diff.zero && diff.positive && "text-lime-400",
                          !diff.zero && !diff.positive && "text-red-400"
                        )}
                      >
                        {diff.text}
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-xs tabular-nums" style={{ color: MUTED }}>
                        {txsQ.isLoading ? "…" : moves}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
