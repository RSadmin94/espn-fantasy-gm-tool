import { useMemo, useState } from "react";
import { useAuth } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";
import { setTrpcToken } from "@/lib/trpcAuth";
import { cn } from "@/lib/utils";
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

type DraftPickRow = {
  overallPick: number;
  roundId: number;
  roundPick: number;
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

function PosBadge({ pos }: { pos: string | null | undefined }) {
  const p = (pos || "?").toUpperCase();
  return (
    <span className="inline-flex rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
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

export function DraftHistory() {
  const { getToken } = useAuth();
  const allSeasonsQ = trpc.espn.allSeasons.useQuery();
  const cachedQ = trpc.espn.cachedSeasons.useQuery();
  const allSeasons: number[] = allSeasonsQ.data ?? [];
  const cachedSeasons: number[] = cachedQ.data ?? [];
  const defaultSeason =
    cachedSeasons.length > 0
      ? Math.max(...cachedSeasons)
      : allSeasons.length > 0
        ? allSeasons[allSeasons.length - 1]!
        : 2025;

  const [seasonOverride, setSeasonOverride] = useState<number | null>(null);
  const season = seasonOverride ?? defaultSeason;
  const isLegacySeason = season >= LEGACY_MIN && season <= LEGACY_MAX;

  // ── Manus path: combined ESPN cache ──────────────────────────────────────
  const draftQ = trpc.espn.draftPicks.useQuery({ season });
  const picks = useMemo(
    () => sortDraftPicks((draftQ.data ?? []) as DraftPickRow[]),
    [draftQ.data],
  );

  // ── Legacy path: draft_picks rows with source="legacy_draft_recap" ───────
  const legacyQ = trpc.espn.legacyDraftPicks.useQuery(
    { season },
    { enabled: isLegacySeason },
  );
  const legacyPicks = useMemo(
    () =>
      isLegacySeason
        ? sortDraftPicks((legacyQ.data?.picks ?? []) as DraftPickRow[])
        : [],
    [legacyQ.data?.picks, isLegacySeason],
  );

  // ── Source resolution ─────────────────────────────────────────────────────
  const isLoading = draftQ.isLoading || (isLegacySeason && legacyQ.isLoading);
  const useManusPath = !draftQ.isLoading && picks.length > 0;
  const useLegacyPath = !isLoading && !useManusPath && isLegacySeason && legacyPicks.length > 0;
  const effectivePicks = useManusPath ? picks : useLegacyPath ? legacyPicks : [];
  const sourceLabel = useManusPath
    ? "ESPN mDraftDetail"
    : useLegacyPath
      ? "Legacy Draft Recap Capture"
      : null;

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
          { type: "GMWR_HIST_TEST", id, leagueId: "457622", season, clerkToken },
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
    <div className="mx-auto max-w-6xl space-y-6 px-1 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Draft History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLegacySeason
            ? `Legacy season (${LEGACY_MIN}–${LEGACY_MAX}): ESPN combined cache first, then legacy draft recap capture.`
            : "ESPN combined cache → normalized draft picks."}
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
                      <span className="ml-1 text-xs text-emerald-400">✓</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!isLoading && (
            <span className="text-xs text-muted-foreground">{effectivePicks.length} picks</span>
          )}
        </CardContent>
      </Card>

      {/* Source banner */}
      {sourceLabel !== null && effectivePicks.length > 0 && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-xs font-medium",
            sourceLabel === "ESPN mDraftDetail"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/20 bg-amber-500/10 text-amber-400",
          )}
        >
          Source: {sourceLabel}
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
              <span className="mt-1 block font-mono text-[11px]">
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
                Requires GM War Room extension + ESPN login.
              </span>
            </div>
            {scrapeEspnNote && (
              <p className="text-xs text-emerald-400">{scrapeEspnNote}</p>
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
              <p className="text-xs text-emerald-400">
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
      {effectivePicks.length > 0 && (
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
                {effectivePicks.map((p) => (
                  <tr
                    key={`${p.overallPick}-${p.teamId}-${p.playerName ?? ""}`}
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
                      {p.playerName ?? "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <PosBadge pos={p.position} />
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
    </div>
  );
}
