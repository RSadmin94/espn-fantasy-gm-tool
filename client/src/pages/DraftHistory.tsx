import { useEffect, useMemo, useState } from "react";
import { useAuth, useUser } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";
import { setTrpcToken } from "@/lib/trpcAuth";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { TYPE_READABLE_BODY, TYPE_READABLE_LABEL, TYPE_READABLE_SECTION } from "@/lib/typeScale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import {
  draftBoardPickDisplayName,
  draftBoardPositionLabel,
} from "@shared/draftPickIdentity";

type HistoricalOwnerEval = {
  ownerKey: string;
  ownerName: string;
  teamId: number;
  draftNight: {
    available: boolean;
    reason: string | null;
    grade: string | null;
    valueScore: number | null;
    pickCount: number;
    adpPickCount: number;
    biggestReach: { playerName: string; pick: number; adp: number; delta: number; round: number } | null;
    biggestSteal: { playerName: string; pick: number; adp: number; delta: number; round: number } | null;
  };
  draftReality: {
    available: boolean;
    reason: string | null;
    draftGrade: number | null;
    simulatedRank: number | null;
    teamCount: number | null;
    simulatedRecord: string | null;
    actualRecord: string | null;
    simulatedWins: number | null;
    actualWins: number | null;
    winDifference: number | null;
    rosterMgmtGrade: number | null;
  };
};

function normOwnerLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findOwnerEval(
  owners: HistoricalOwnerEval[],
  g: { teamId: number; ownerName: string | null; teamName: string },
): HistoricalOwnerEval | undefined {
  if (g.teamId > 0) {
    const byTeam = owners.find((o) => o.teamId === g.teamId);
    if (byTeam) return byTeam;
  }
  const n = normOwnerLabel(g.ownerName || g.teamName || "");
  if (!n) return undefined;
  return owners.find((o) => normOwnerLabel(o.ownerName) === n);
}

function ordinalRank(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function winDiffLabel(diff: number): string {
  if (diff > 0) return `+${diff} win${diff === 1 ? "" : "s"}`;
  if (diff < 0) return `${diff} win${diff === -1 ? "" : "s"}`;
  return "0 wins";
}

type DraftPickRow = {
  overallPick: number;
  roundId: number;
  roundPick: number;
  playerId?: number | null;
  playerName: string | null;
  position: string | null;
  nflTeam: string;
  teamName: string;
  ownerName?: string | null;
  teamId: number;
  isKeeper: boolean;
};

type ParsedPickInput = {
  overallPick: number;
  roundId: number;
  roundPick: number;
  playerName: string;
  position: string;
  nflTeam: string;
  teamName: string;
};

const LEGACY_MAX = 2017;
const LEGACY_MIN = 2010;

/**
 * Parse tab-separated text pasted from an ESPN Draft Recap page.
 * Auto-detects header row; falls back to fixed column order:
 *   Overall | Round | Round Pick | Player | Position | NFL Team | Fantasy Team
 */
function parseDraftRecapText(text: string): { rows: ParsedPickInput[]; error: string | null } {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], error: "Paste is empty." };

  const firstLower = lines[0].toLowerCase();
  const hasHeader = /\b(overall|round|pick|player|pos|team)\b/.test(firstLower);

  // Default column positions (0-indexed): overall, round, roundPick, player, pos, nfl, team
  let ciOverall = 0, ciRound = 1, ciRoundPick = 2, ciPlayer = 3, ciPos = 4, ciNfl = 5, ciTeam = 6;

  if (hasHeader) {
    const hdrs = lines[0].split("\t").map((h) => h.trim().toLowerCase());
    const fi = (keys: string[]) => hdrs.findIndex((h) => keys.some((k) => h.includes(k)));
    const oIdx = fi(["overall"]);
    const rIdx = fi(["round"]);
    const pIdx = fi(["pick"]);
    const playerIdx = fi(["player", "name"]);
    const posIdx = fi(["pos", "position"]);
    const nflIdx = fi(["nfl", "pro team", "pro"]);
    const teamIdx = fi(["team", "owner", "fantasy"]);
    if (oIdx >= 0) ciOverall = oIdx;
    if (rIdx >= 0) ciRound = rIdx;
    if (pIdx >= 0 && pIdx !== rIdx) ciRoundPick = pIdx;
    if (playerIdx >= 0) ciPlayer = playerIdx;
    if (posIdx >= 0) ciPos = posIdx;
    if (nflIdx >= 0) ciNfl = nflIdx;
    if (teamIdx >= 0) ciTeam = teamIdx;
  }

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows: ParsedPickInput[] = [];
  const errs: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const cols = dataLines[i].split("\t");
    const get = (ci: number) => (cols[ci] ?? "").trim();
    const overall = parseInt(get(ciOverall), 10);
    const round = parseInt(get(ciRound), 10);
    const roundPick = parseInt(get(ciRoundPick), 10);
    if (!Number.isFinite(overall) || overall <= 0 || !Number.isFinite(round) || round <= 0) {
      errs.push(`Row ${i + 1}: cannot parse pick numbers from "${dataLines[i].slice(0, 60)}"`);
      if (errs.length >= 3) break;
      continue;
    }
    rows.push({
      overallPick: overall,
      roundId: round,
      roundPick: Number.isFinite(roundPick) && roundPick > 0 ? roundPick : 0,
      playerName: get(ciPlayer),
      position: get(ciPos),
      nflTeam: get(ciNfl),
      teamName: get(ciTeam),
    });
  }

  return { rows, error: errs.length > 0 ? errs.join("; ") : null };
}

function PosBadge({
  pos,
  playerId,
}: {
  pos: string | null | undefined;
  playerId?: number | null;
}) {
  const p = draftBoardPositionLabel(pos, playerId).toUpperCase();
  return (
    <span className="inline-flex rounded border border-border bg-muted/40 px-1.5 py-0.5 text-2xs font-semibold uppercase text-ink-secondary">
      {p}
    </span>
  );
}

function sortDraftPicks(rows: DraftPickRow[]): DraftPickRow[] {
  return [...rows].sort((a, b) => {
    const ao = a.overallPick > 0 ? a.overallPick : 0;
    const bo = b.overallPick > 0 ? b.overallPick : 0;
    if (ao > 0 && bo > 0 && ao !== bo) return ao - bo;
    if (a.roundId !== b.roundId) return a.roundId - b.roundId;
    return (a.roundPick > 0 ? a.roundPick : 0) - (b.roundPick > 0 ? b.roundPick : 0);
  });
}

function GradeStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-[7.5rem]">
      <div className={cn(TYPE_READABLE_LABEL, "uppercase tracking-wide text-ink-secondary")}>{label}</div>
      <div className="mt-0.5 text-3xl font-bold tabular-nums leading-none tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}

function ReachStealLine({
  label,
  row,
  earlyLabel,
}: {
  label: string;
  row: { playerName: string; pick: number; adp: number; delta: number } | null;
  earlyLabel: boolean;
}) {
  return (
    <div>
      <div className={cn(TYPE_READABLE_LABEL, "text-ink-secondary")}>{label}</div>
      {row ? (
        <p className={cn(TYPE_READABLE_BODY, "mt-0.5 text-foreground")}>
          {row.playerName}
          <span className="mt-0.5 block text-ink-secondary">
            Pick {row.pick} · ADP {Number.isInteger(row.adp) ? row.adp : row.adp.toFixed(1)}
            {" · "}
            {earlyLabel ? `${Math.round(row.delta)} spots early` : `+${Math.round(row.delta)} spots`}
          </span>
        </p>
      ) : (
        <p className={cn(TYPE_READABLE_BODY, "mt-0.5 text-ink-secondary")}>—</p>
      )}
    </div>
  );
}

function TeamDraftEvalPanel({
  ev,
  loading,
  nightSeasonReason,
  realitySeasonReason,
}: {
  ev: HistoricalOwnerEval | undefined;
  loading: boolean;
  nightSeasonReason: string | null;
  realitySeasonReason: string | null;
}) {
  if (loading && !ev) {
    return (
      <div className="mb-3 flex items-center gap-2 text-ink-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className={TYPE_READABLE_LABEL}>Loading draft evaluation…</span>
      </div>
    );
  }
  if (!ev) {
    if (!nightSeasonReason && !realitySeasonReason) return null;
    return (
      <div className="mb-4 space-y-3 border-b border-border/50 pb-4">
        {nightSeasonReason && (
          <section className="space-y-1">
            <h3 className={TYPE_READABLE_SECTION}>Draft Night</h3>
            <p className={cn(TYPE_READABLE_BODY, "text-ink-secondary")}>{nightSeasonReason}</p>
          </section>
        )}
        {realitySeasonReason && (
          <section className="space-y-1">
            <h3 className={TYPE_READABLE_SECTION}>Draft Reality</h3>
            <p className={cn(TYPE_READABLE_BODY, "text-ink-secondary")}>{realitySeasonReason}</p>
          </section>
        )}
      </div>
    );
  }
  const night = ev.draftNight;
  const reality = ev.draftReality;

  return (
    <div className="mb-4 space-y-4 border-b border-border/50 pb-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="space-y-2">
          <h3 className={TYPE_READABLE_SECTION}>Draft Night</h3>
          {!night.available && (
            <p className={cn(TYPE_READABLE_BODY, "text-ink-secondary")}>
              {night.reason ?? "Historical ADP unavailable for this season."}
            </p>
          )}
          {night.available && (
            <>
              <p className={cn(TYPE_READABLE_BODY, "text-foreground")}>
                Grade {night.grade ?? "—"}
              </p>
              <p className={cn(TYPE_READABLE_BODY, "text-ink-secondary")}>
                Same-season ESPN ADP on {night.adpPickCount} of {night.pickCount} drafted picks.
              </p>
              <ReachStealLine label="Biggest Reach" row={night.biggestReach} earlyLabel />
              <ReachStealLine label="Biggest Steal" row={night.biggestSteal} earlyLabel={false} />
            </>
          )}
        </section>

        <section className="space-y-2">
          <h3 className={TYPE_READABLE_SECTION}>Draft Reality</h3>
          <p className={cn(TYPE_READABLE_BODY, "text-ink-secondary")}>
            How your original drafted roster performed using actual weekly results.
          </p>
          {!reality.available && (
            <p className={cn(TYPE_READABLE_BODY, "text-ink-secondary")}>
              {reality.reason ?? "Insufficient weekly player data."}
            </p>
          )}
          {reality.available && (
            <>
              <p className={cn(TYPE_READABLE_BODY, "text-foreground")}>
                {reality.draftGrade != null ? `${reality.draftGrade} / 100` : "—"}
                {reality.simulatedRank != null && reality.teamCount != null
                  ? ` · Untouched roster: ${ordinalRank(reality.simulatedRank)} of ${reality.teamCount}`
                  : ""}
              </p>
              {reality.simulatedRecord != null && (
                <div className={cn(TYPE_READABLE_BODY, "space-y-0.5 text-foreground")}>
                  <div className={cn(TYPE_READABLE_LABEL, "uppercase tracking-wide text-ink-secondary")}>
                    If you never touched your roster
                  </div>
                  <p>Projected record {reality.simulatedRecord}</p>
                  {reality.actualRecord != null && <p>Actual record {reality.actualRecord}</p>}
                  {reality.winDifference != null && (
                    <p>Difference {winDiffLabel(reality.winDifference)}</p>
                  )}
                </div>
              )}
              {reality.rosterMgmtGrade != null && (
                <div>
                  <div className={TYPE_READABLE_SECTION}>Roster Management</div>
                  <p className={cn(TYPE_READABLE_BODY, "mt-0.5 text-foreground")}>
                    {reality.rosterMgmtGrade} / 100
                  </p>
                  <p className={cn(TYPE_READABLE_BODY, "mt-0.5 text-ink-secondary")}>
                    Compares actual season results with the draft-only roster simulation. It does not
                    score individual trades.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function DraftHistory() {
  const { getToken, isLoaded: authLoaded, isSignedIn: isSignedInRaw } = useAuth();
  const { isLoaded: userLoaded } = useUser();
  const isSignedIn = Boolean(isSignedInRaw);
  const { leagueId, leagueContextKey } = useLeagueContext();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );
  const allSeasonsQ = trpc.espn.allSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const cachedQ = trpc.espn.cachedSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const allSeasons: number[] = leagueKeyReady ? (allSeasonsQ.data ?? []) : [];
  const cachedSeasons: number[] = leagueKeyReady ? (cachedQ.data ?? []) : [];
  const defaultSeason =
    cachedSeasons.length > 0
      ? Math.max(...cachedSeasons)
      : allSeasons.length > 0
        ? allSeasons[allSeasons.length - 1]!
        : 2025;

  const [seasonOverride, setSeasonOverride] = useState<number | null>(null);
  const season = seasonOverride ?? defaultSeason;
  const isLegacySeason = season >= LEGACY_MIN && season <= LEGACY_MAX;

  useEffect(() => {
    setSeasonOverride((prev) => {
      if (prev == null) return null;
      return cachedSeasons.includes(prev) ? prev : null;
    });
  }, [cachedSeasons, leagueContextKey]);

  // ── Manus path: combined ESPN cache ──────────────────────────────────────
  const draftQ = trpc.espn.draftPicks.useQuery(
    withLeagueSalt({ season }, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const picks = useMemo(
    () =>
      sortDraftPicks(((leagueKeyReady ? draftQ.data : undefined) ?? []) as DraftPickRow[]),
    [draftQ.data, leagueKeyReady],
  );

  // ── Legacy path: draft_picks rows with source="legacy_draft_recap" ───────
  const legacyQ = trpc.espn.legacyDraftPicks.useQuery(
    withLeagueSalt({ season }, leagueContextKey),
    { enabled: leagueKeyReady && isLegacySeason },
  );
  const legacyPicks = useMemo(
    () =>
      isLegacySeason && leagueKeyReady
        ? sortDraftPicks((legacyQ.data?.picks ?? []) as DraftPickRow[])
        : [],
    [legacyQ.data?.picks, isLegacySeason, leagueKeyReady],
  );

  // ── Source resolution ─────────────────────────────────────────────────────
  const isLoading =
    !leagueKeyReady || draftQ.isLoading || (isLegacySeason && legacyQ.isLoading);
  const useManusPath = !draftQ.isLoading && picks.length > 0;
  const useLegacyPath = !isLoading && !useManusPath && isLegacySeason && legacyPicks.length > 0;
  const effectivePicks = useManusPath ? picks : useLegacyPath ? legacyPicks : [];
  /** Combined ESPN API board (not scraped recap) — honest label for dynasty keeper slots. */
  const isApiCombinedLedger = useManusPath;
  const sourceLabel = isApiCombinedLedger
    ? "ESPN API Dynasty Ledger"
    : useLegacyPath
      ? "Legacy Draft Recap Capture"
      : null;

  type LedgerFilter = "all" | "drafted" | "keepers";
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all");
  // Draft History view: "board" = pick ledger (default);
  // "team" = Draft Grades — one owner card with Night / Results / Management.
  const [viewMode, setViewMode] = useState<"board" | "team">("board");
  const evalQ = trpc.espn.historicalDraftEvaluation.useQuery(
    withLeagueSalt({ season }, leagueContextKey),
    {
      enabled: leagueKeyReady && viewMode === "team",
      staleTime: 5 * 60 * 1000,
    },
  );
  const evalOwners = (evalQ.data?.owners ?? []) as HistoricalOwnerEval[];

  useEffect(() => {
    setLedgerFilter("all");
  }, [season, leagueContextKey]);

  const keeperCount = useMemo(
    () => effectivePicks.filter((p) => p.isKeeper === true).length,
    [effectivePicks],
  );
  const draftedCount = effectivePicks.length - keeperCount;
  const filteredPicks = useMemo(() => {
    if (ledgerFilter === "keepers") return effectivePicks.filter((p) => p.isKeeper === true);
    if (ledgerFilter === "drafted") return effectivePicks.filter((p) => p.isKeeper !== true);
    return effectivePicks;
  }, [effectivePicks, ledgerFilter]);

  // Draft Grades grouping: one card per owner, holding their full draft class.
  // Reuses existing pick data only (no new draft metrics). Label prefers the clean
  // ownerName and falls back to teamName; a key/GUID is never used as a label.
  const teamGroups = useMemo(() => {
    if (viewMode !== "team") return [];
    const isKeyLike = (s: string) =>
      /^id:/.test(s) || /^\{?[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
    // Group key: a real positive teamId when present (modern seasons). Legacy Draft
    // Recap picks all carry teamId 0, so fall back to owner/team name there — keying
    // on teamId alone would collapse every legacy owner into a single card.
    const groupKeyOf = (p: DraftPickRow) =>
      p.teamId && p.teamId > 0
        ? `t:${p.teamId}`
        : `n:${((p.ownerName ?? p.teamName) ?? "").trim().toLowerCase()}`;
    const byKey = new Map<
      string,
      { key: string; teamId: number; ownerName: string | null; teamName: string; picks: DraftPickRow[] }
    >();
    for (const p of effectivePicks) {
      const k = groupKeyOf(p);
      let g = byKey.get(k);
      if (!g) {
        g = { key: k, teamId: p.teamId, ownerName: null, teamName: "", picks: [] };
        byKey.set(k, g);
      }
      g.picks.push(p);
      const on = (p.ownerName ?? "").trim();
      if (!g.ownerName && on && !isKeyLike(on)) g.ownerName = on;
      const tn = (p.teamName ?? "").trim();
      if (!g.teamName && tn && !isKeyLike(tn)) g.teamName = tn;
    }
    const groups = [...byKey.values()].map((g) => {
      const sorted = sortDraftPicks(g.picks);
      const r1 = sorted.find((p) => p.roundId === 1);
      return {
        key: g.key,
        teamId: g.teamId,
        ownerName: g.ownerName,
        teamName: g.teamName || (g.teamId > 0 ? `Team ${g.teamId}` : "Unknown Team"),
        picks: sorted,
        totalPicks: sorted.length,
        keeperCount: sorted.filter((p) => p.isKeeper).length,
        draftSlot: r1 && r1.roundPick > 0 ? r1.roundPick : null,
        earliest: sorted.reduce(
          (m, p) => (p.overallPick > 0 ? Math.min(m, p.overallPick) : m),
          Number.POSITIVE_INFINITY,
        ),
      };
    });
    // Across owners: order by earliest overall pick (existing draft order, not a new ranking).
    groups.sort((a, b) => a.earliest - b.earliest);
    return groups;
  }, [viewMode, effectivePicks]);

  // ── Legacy import state ───────────────────────────────────────────────────
  const [pasteText, setPasteText] = useState("");
  const [parsedPreview, setParsedPreview] = useState<ParsedPickInput[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [scrapeEspnBusy, setScrapeEspnBusy] = useState(false);
  const [scrapeEspnNote, setScrapeEspnNote] = useState<string | null>(null);
  const [scrapeEspnErr, setScrapeEspnErr] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const ingestLegacyMutation = trpc.espn.ingestLegacyDraftRecap.useMutation({
    onSuccess: () => {
      void utils.espn.legacyDraftPicks.invalidate();
      setParsedPreview(null);
      setPasteText("");
      setParseError(null);
    },
  });

  const handleParse = () => {
    const { rows, error } = parseDraftRecapText(pasteText);
    setParseError(rows.length === 0 && !error ? "No valid rows found." : error);
    setParsedPreview(rows.length > 0 ? rows : null);
  };

  const handleScrapeFromEspn = async () => {
    setScrapeEspnErr(null);
    setScrapeEspnNote("Posting to extension…");
    setScrapeEspnBusy(true);
    try {
      const clerkToken = (await getToken()) ?? "";
      const id = `legacy-draft-${season}-${Date.now()}`;
      console.log("[GMWR:DH] posting GMWR_HIST_TEST", { id, season, hasToken: clerkToken.length > 0 });
      const extResult = await new Promise<Record<string, unknown>>((resolve) => {
        // Spy: log every GMWR_* message that arrives — helps identify which hop fails
        function spyMsg(ev: MessageEvent) {
          if (ev.source !== window) return;
          const d = ev.data as Record<string, unknown> | null;
          if (!d || typeof d.type !== "string" || !String(d.type).startsWith("GMWR_")) return;
          console.log("[GMWR:DH] window msg received", String(d.type), { id: d.id, ok: d.ok, error: d.error, mode: d.mode });
        }
        window.addEventListener("message", spyMsg);

        const timeout = window.setTimeout(() => {
          window.removeEventListener("message", onMsg);
          window.removeEventListener("message", spyMsg);
          console.warn("[GMWR:DH] 120s timeout — no GMWR_HIST_TEST_REPLY for id", id);
          resolve({ ok: false, error: "Extension request timed out" });
        }, 120_000);
        function onMsg(ev: MessageEvent) {
          if (ev.source !== window) return;
          const d = ev.data as Record<string, unknown> | null;
          if (!d || d.type !== "GMWR_HIST_TEST_REPLY" || d.id !== id) return;
          console.log("[GMWR:DH] GMWR_HIST_TEST_REPLY matched", { id, ok: d.ok, error: d.error, picks: Array.isArray(d.picks) ? d.picks.length : "n/a" });
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMsg);
          window.removeEventListener("message", spyMsg);
          resolve(d);
        }
        window.addEventListener("message", onMsg);
        window.postMessage(
          { type: "GMWR_HIST_TEST", id, leagueId: leagueId || "", season, clerkToken },
          "*",
        );
        console.log("[GMWR:DH] GMWR_HIST_TEST posted — awaiting GMWR_HIST_TEST_REPLY");
      });

      if (!extResult.ok) {
        setScrapeEspnErr(extResult.error ? String(extResult.error) : "Extension scrape failed.");
        return;
      }

      const picks = Array.isArray(extResult.picks) ? extResult.picks : [];
      if (picks.length === 0) {
        setScrapeEspnErr("Extension returned no picks for this season.");
        return;
      }

      setTrpcToken(clerkToken);
      try {
        const result = await ingestLegacyMutation.mutateAsync({
          season,
          picks: picks as ParsedPickInput[],
        });
        setScrapeEspnNote(`Scraped ${result.upserted} picks from ESPN and imported.`);
      } finally {
        setTrpcToken(null);
      }
    } catch (e) {
      setScrapeEspnErr(e instanceof Error ? e.message : String(e));
    } finally {
      setScrapeEspnBusy(false);
    }
  };

  const showImportCard =
    isLegacySeason && !useManusPath && !useLegacyPath && !isLoading;

  return (
    <div data-rfsn-054d className="mx-auto max-w-6xl space-y-6 px-1 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Draft History</h1>
        <p className={cn("mt-1", TYPE_READABLE_BODY, "text-ink-secondary")}>
          Draft Board is the pick ledger. Draft Grades evaluate each owner's draft night and results.
        </p>
      </div>

      {/* Season selector */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="w-28">
            <Select value={String(season)} onValueChange={(v) => setSeasonOverride(Number(v))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...allSeasons].reverse().map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                    {cachedSeasons.includes(s) && (
                      <span className="ml-1 text-xs text-lime-400">✓</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!isLoading && (
            <span className="text-xs text-muted-foreground">
              {ledgerFilter === "all"
                ? `${effectivePicks.length} picks`
                : `${filteredPicks.length} shown · ${effectivePicks.length} total`}
            </span>
          )}
          {effectivePicks.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              {(
                [
                  { id: "board" as const, label: "Draft Board" },
                  { id: "team" as const, label: "Draft Grades" },
                ] satisfies { id: "board" | "team"; label: string }[]
              ).map((v) => (
                <Button
                  key={v.id}
                  type="button"
                  size="sm"
                  variant={viewMode === v.id ? "default" : "outline"}
                  className={cn("h-8", TYPE_READABLE_LABEL)}
                  onClick={() => setViewMode(v.id)}
                >
                  {v.label}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Source banner + dynasty ledger filters */}
      {sourceLabel !== null && effectivePicks.length > 0 && (
        <div
          className={cn(
            "rounded-lg border px-3 py-3 text-xs",
            isApiCombinedLedger
              ? "border-lime-500/20 bg-lime-500/10 text-lime-400"
              : "border-amber-500/20 bg-amber-500/10 text-amber-400",
          )}
        >
          <div className="font-semibold">Source: {sourceLabel}</div>
          {isApiCombinedLedger && (
            <p className="mt-1.5 font-normal text-lime-200/90">
              Includes ESPN keeper/retained slots when available.
            </p>
          )}
          {isApiCombinedLedger && keeperCount > 0 && (
            <p className="mt-2 font-medium text-lime-50">
              Dynasty ledger: {effectivePicks.length} slots · {keeperCount} keeper/retained ·{" "}
              {draftedCount} drafted.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                { id: "all" as const, label: "All", count: effectivePicks.length },
                { id: "drafted" as const, label: "Drafted", count: draftedCount },
                { id: "keepers" as const, label: "Keepers", count: keeperCount },
              ] satisfies { id: LedgerFilter; label: string; count: number }[]
            ).map((tab) => (
              <Button
                key={tab.id}
                type="button"
                size="sm"
                variant={ledgerFilter === tab.id ? "default" : "outline"}
                className="h-8 gap-1.5 text-xs"
                onClick={() => setLedgerFilter(tab.id)}
              >
                {tab.label}
                <span className="tabular-nums opacity-80">({tab.count})</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {draftQ.isError && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {draftQ.error.message}
        </div>
      )}

      {/* Empty state — non-legacy seasons only */}
      {!isLoading && !draftQ.isError && effectivePicks.length === 0 && !isLegacySeason && (
        <p className="text-sm text-muted-foreground">
          No draft picks for {season}. Sync or cache this season&apos;s combined ESPN data first.
        </p>
      )}

      {/* Legacy import card (shown when no picks exist for a legacy season) */}
      {showImportCard && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Legacy Draft Recap — {season}</CardTitle>
            <CardDescription>
              Paste rows from the ESPN Draft Recap page for {season}. The Fantasy Team column is the
              canonical owner truth — team names are stored exactly as captured.
              <span className="mt-1 block font-mono text-caption text-ink-secondary">
                Expected columns (tab-separated): Overall · Round · Pick · Player · Position · NFL
                Team · Fantasy Team
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Scrape from ESPN via extension */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                disabled={scrapeEspnBusy || ingestLegacyMutation.isPending}
                onClick={() => void handleScrapeFromEspn()}
              >
                {scrapeEspnBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {scrapeEspnBusy ? "Scraping…" : "Scrape from ESPN"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Requires Fantasy Football Rivals ESPN Connector + ESPN login.
              </span>
            </div>
            {scrapeEspnNote && (
              <p className="text-xs text-lime-400">{scrapeEspnNote}</p>
            )}
            {scrapeEspnErr && (
              <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                {scrapeEspnErr}
              </div>
            )}

            <div className="border-t border-border/40 pt-2">
              <p className="mb-2 text-xs text-muted-foreground">Or paste manually:</p>
            </div>

            <textarea
              className="w-full resize-y rounded border border-border bg-muted/30 p-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              rows={8}
              placeholder={
                "1\t1\t1\tPlayer Name\tQB\tKC\tMy Fantasy Team\n2\t1\t2\tAnother Player\tWR\tNE\tOther Team\n..."
              }
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setParsedPreview(null);
                setParseError(null);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!pasteText.trim()}
                onClick={handleParse}
              >
                Parse{pasteText.trim() ? ` (~${pasteText.trim().split("\n").length} rows)` : ""}
              </Button>
              {parsedPreview && parsedPreview.length > 0 && (
                <Button
                  size="sm"
                  disabled={ingestLegacyMutation.isPending}
                  onClick={() =>
                    ingestLegacyMutation.mutate({ season, picks: parsedPreview })
                  }
                >
                  {ingestLegacyMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    `Import ${parsedPreview.length} picks`
                  )}
                </Button>
              )}
            </div>

            {parseError && (
              <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                {parseError}
              </div>
            )}
            {ingestLegacyMutation.isError && (
              <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                {ingestLegacyMutation.error.message}
              </div>
            )}
            {ingestLegacyMutation.isSuccess && (
              <p className="text-xs text-lime-400">
                Imported {ingestLegacyMutation.data.upserted} picks for {season}.
              </p>
            )}

            {/* Parse preview table */}
            {parsedPreview && parsedPreview.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Preview — {parsedPreview.length} picks parsed
                </p>
                <div className="max-h-48 overflow-auto rounded border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/80">
                      <tr className="border-b border-border">
                        <th className="px-2 py-1 font-medium">Overall</th>
                        <th className="px-2 py-1 font-medium">Rd</th>
                        <th className="px-2 py-1 font-medium">Pick</th>
                        <th className="px-2 py-1 font-medium">Player</th>
                        <th className="px-2 py-1 font-medium">Pos</th>
                        <th className="px-2 py-1 font-medium">NFL</th>
                        <th className="px-2 py-1 font-medium">Fantasy Team</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedPreview.slice(0, 25).map((p, i) => (
                        <tr key={i} className="border-b border-border/40 odd:bg-muted/10">
                          <td className="px-2 py-0.5 font-mono tabular-nums">{p.overallPick}</td>
                          <td className="px-2 py-0.5 font-mono tabular-nums">{p.roundId}</td>
                          <td className="px-2 py-0.5 font-mono tabular-nums">{p.roundPick || "—"}</td>
                          <td className="px-2 py-0.5 text-foreground">{p.playerName || "—"}</td>
                          <td className="px-2 py-0.5">{p.position || "—"}</td>
                          <td className="px-2 py-0.5 text-muted-foreground">{p.nflTeam || "—"}</td>
                          <td className="px-2 py-0.5 text-foreground/90">{p.teamName || "—"}</td>
                        </tr>
                      ))}
                      {parsedPreview.length > 25 && (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-2 py-1 text-center text-muted-foreground"
                          >
                            +{parsedPreview.length - 25} more rows
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Picks table */}
      {effectivePicks.length > 0 && viewMode === "board" && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Overall Pick</th>
                  <th className="px-3 py-2 font-medium">Round</th>
                  <th className="px-3 py-2 font-medium">Round Pick</th>
                  <th className="px-3 py-2 font-medium">Player</th>
                  <th className="px-3 py-2 font-medium">Position</th>
                  <th className="px-3 py-2 font-medium">NFL Team</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium">Team Id</th>
                  <th className="px-3 py-2 font-medium">Keeper</th>
                </tr>
              </thead>
              <tbody>
                {filteredPicks.map((p, pickIdx) => (
                  <tr
                    key={`${pickIdx}-${p.overallPick}-${p.teamId}`}
                    className={cn(
                      "border-b border-border/40",
                      p.isKeeper && "bg-amber-500/5",
                    )}
                  >
                    <td className="px-3 py-1.5 font-mono tabular-nums text-muted-foreground">
                      {p.overallPick > 0 ? p.overallPick : "—"}
                    </td>
                    <td className="px-3 py-1.5 font-mono tabular-nums">{p.roundId || "—"}</td>
                    <td className="px-3 py-1.5 font-mono tabular-nums">
                      {p.roundPick > 0 ? p.roundPick : "—"}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-foreground">
                      {draftBoardPickDisplayName(p)}
                    </td>
                    <td className="px-3 py-1.5">
                      <PosBadge pos={p.position} playerId={p.playerId} />
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {(p.nflTeam || "").trim() || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-foreground/90">
                      {p.ownerName
                        ? <><span className="font-medium">{p.ownerName}</span><br /><span className="text-xs text-muted-foreground">{p.teamName}</span></>
                        : p.teamName}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                      {p.teamId || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {p.isKeeper ? (
                        <span className="text-xs font-semibold text-amber-400">K</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Draft Grades — one card per owner with Night / Results / Management */}
      {effectivePicks.length > 0 && viewMode === "team" && (
        <div className="space-y-3">
          {teamGroups.map((g) => {
            const ev = findOwnerEval(evalOwners, g);
            return (
            <Card key={g.key}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <CardTitle className="text-base">
                    {g.ownerName ? (
                      <>
                        <span className="text-foreground">{g.ownerName}</span>
                        <span className="text-muted-foreground"> — {g.teamName}</span>
                      </>
                    ) : (
                      <span className="text-foreground">{g.teamName}</span>
                    )}
                  </CardTitle>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {g.draftSlot ? `Slot ${g.draftSlot} · ` : ""}
                    {g.totalPicks} pick{g.totalPicks === 1 ? "" : "s"}
                    {g.keeperCount > 0
                      ? ` · ${g.keeperCount} keeper${g.keeperCount === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
                  <GradeStat
                    label="Draft Night"
                    value={ev?.draftNight.available ? (ev.draftNight.grade ?? "—") : "—"}
                  />
                  <GradeStat
                    label="Draft Results"
                    value={
                      ev?.draftReality.available && ev.draftReality.draftGrade != null
                        ? String(ev.draftReality.draftGrade)
                        : "—"
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <TeamDraftEvalPanel
                  ev={ev}
                  loading={evalQ.isLoading}
                  nightSeasonReason={evalQ.data?.draftNightCoverageReason ?? null}
                  realitySeasonReason={evalQ.data?.draftRealityCoverageReason ?? null}
                />
                <ul className="divide-y divide-border/40">
                  {g.picks.map((p, pickIdx) => (
                    <li
                      key={`${g.key}-${pickIdx}-${p.overallPick}-${p.teamId}`}
                      className={cn(
                        "flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm",
                        p.isKeeper && "rounded bg-amber-500/5 px-1",
                      )}
                    >
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        R{p.roundId || "—"}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        · Pick {p.overallPick > 0 ? p.overallPick : "—"}
                      </span>
                      <span className="font-medium text-foreground">
                        {draftBoardPickDisplayName(p)}
                      </span>
                      <PosBadge pos={p.position} playerId={p.playerId} />
                      {(p.nflTeam || "").trim() && (
                        <span className="text-xs text-muted-foreground">{p.nflTeam}</span>
                      )}
                      {p.isKeeper && (
                        <span className="ml-auto text-xs font-semibold text-amber-400">K</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
