/**
 * Keeper Center — authoritative manage surface for this user's workspace keepers.
 * Saves only via espn.setManualKeeperSelection → gm_manual_keeper_selections.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Loader2, Plus, Trash2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { PlayerHeadshot } from "@/components/draft/PlayerHeadshot";
import {
  formatKeeperRoundPick,
  keeperAddBlockReason,
  keeperSlotsLabel,
  type ManualKeeperRow,
} from "@/lib/keeperManage";

type ValuationRow = {
  ownerKey: string;
  ownerName: string;
  playerId: number;
  playerName: string;
  position: string;
  keeperRoundCost?: number;
  recommendation?: string;
};

type ForecastRow = {
  ownerKey: string;
  ownerName: string;
  playerId: number;
  playerName: string;
  position: string;
  keeperRound: number;
  status: "MANUAL" | "CONFIRMED" | "PREDICTED";
};

const POS_TONE: Record<string, string> = {
  QB: "text-red-300",
  RB: "text-lime-300",
  WR: "text-violet-300",
  TE: "text-orange-300",
  K: "text-zinc-400",
  DEF: "text-violet-300",
  "D/ST": "text-violet-300",
};

export function KeeperManagePanel() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );
  const draftYear = new Date().getFullYear();
  const utils = trpc.useUtils();

  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [addOwnerKey, setAddOwnerKey] = useState("");
  const [addPlayerId, setAddPlayerId] = useState<number | "">("");
  const [addRoundPick, setAddRoundPick] = useState(0);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const manualQ = trpc.espn.getManualKeeperSelections.useQuery(
    { season: draftYear },
    { enabled: leagueKeyReady },
  );
  const forecastQ = trpc.espn.leagueKeeperForecast.useQuery(
    withLeagueSalt({ draftYear }, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const valQ = trpc.espn.keeperValuation.useQuery(
    withLeagueSalt({ draftYear }, leagueContextKey),
    { enabled: leagueKeyReady },
  );

  const invalidateAll = async () => {
    await Promise.all([
      utils.espn.getManualKeeperSelections.invalidate(),
      utils.espn.leagueKeeperForecast.invalidate(),
      utils.espn.keeperValuation.invalidate(),
      utils.draftWarRoom.getDraftWarRoomData.invalidate(),
    ]);
  };

  const setManual = trpc.espn.setManualKeeperSelection.useMutation({
    onSuccess: async (res) => {
      const r = res as { ok?: boolean; error?: string; limit?: number | null } | undefined;
      if (r && r.ok === false) {
        setFeedback({
          ok: false,
          text:
            r.error === "limit_reached"
              ? `Keeper limit reached — max ${r.limit ?? "?"} per team.`
              : r.error === "table_missing"
                ? "Keeper storage is not provisioned yet."
                : r.error === "no_league"
                  ? "No active league."
                  : "Could not save that selection.",
        });
        return;
      }
      setFeedback({ ok: true, text: "Keeper selection saved." });
      setAddPlayerId("");
      setSearch("");
      await invalidateAll();
      await manualQ.refetch();
    },
    onError: () => setFeedback({ ok: false, text: "Could not save that selection." }),
  });

  const selections = useMemo((): ManualKeeperRow[] => {
    const raw = (manualQ.data as { selections?: ManualKeeperRow[] } | undefined)?.selections;
    return Array.isArray(raw) ? raw : [];
  }, [manualQ.data]);

  const keeperLimit =
    (manualQ.data as { keeperLimit?: number | null } | undefined)?.keeperLimit ?? null;

  const valuations = useMemo((): ValuationRow[] => {
    const raw = (valQ.data as { valuations?: ValuationRow[] } | undefined)?.valuations;
    return Array.isArray(raw) ? raw : [];
  }, [valQ.data]);

  const forecast = useMemo((): ForecastRow[] => {
    const raw = (forecastQ.data as { forecast?: ForecastRow[] } | undefined)?.forecast;
    return Array.isArray(raw) ? raw : [];
  }, [forecastQ.data]);

  const teams = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of valuations) {
      if (v.ownerKey) map.set(v.ownerKey, v.ownerName || v.ownerKey);
    }
    for (const f of forecast) {
      if (f.ownerKey && !map.has(f.ownerKey)) map.set(f.ownerKey, f.ownerName || f.ownerKey);
    }
    for (const s of selections) {
      if (s.ownerKey && !map.has(s.ownerKey)) map.set(s.ownerKey, s.ownerKey);
    }
    return [...map.entries()]
      .map(([ownerKey, ownerName]) => ({ ownerKey, ownerName }))
      .sort((a, b) => a.ownerName.localeCompare(b.ownerName));
  }, [valuations, forecast, selections]);

  const ownerNameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.ownerKey, t.ownerName);
    return m;
  }, [teams]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return valuations
      .filter((v) => {
        if (addOwnerKey && v.ownerKey !== addOwnerKey) return false;
        if (!q) return true;
        return (
          v.playerName.toLowerCase().includes(q) ||
          v.position.toLowerCase().includes(q) ||
          v.ownerName.toLowerCase().includes(q)
        );
      })
      .slice(0, 80);
  }, [valuations, addOwnerKey, search]);

  const filteredSelections = useMemo(() => {
    if (ownerFilter === "all") return selections;
    return selections.filter((s) => s.ownerKey === ownerFilter);
  }, [selections, ownerFilter]);

  const leagueRows = useMemo(() => {
    // Prefer MANUAL/CONFIRMED from forecast; fall back to saved selections.
    const manualIds = new Set(selections.map((s) => s.playerId));
    const fromForecast = forecast.filter(
      (r) => r.status === "MANUAL" || r.status === "CONFIRMED" || manualIds.has(r.playerId),
    );
    if (fromForecast.length > 0) return fromForecast;
    return selections.map(
      (s): ForecastRow => ({
        ownerKey: s.ownerKey,
        ownerName: ownerNameByKey.get(s.ownerKey) ?? s.ownerKey,
        playerId: s.playerId,
        playerName: s.playerName,
        position: s.position,
        keeperRound: 0,
        status: "MANUAL",
      }),
    );
  }, [forecast, selections, ownerNameByKey]);

  const loading = leagueKeyReady && (manualQ.isLoading || valQ.isLoading);
  const disabledPayload =
    valQ.data &&
    typeof valQ.data === "object" &&
    "disabled" in valQ.data &&
    (valQ.data as { disabled?: boolean }).disabled === true;

  const submitAdd = () => {
    setFeedback(null);
    const playerId = typeof addPlayerId === "number" ? addPlayerId : Number(addPlayerId);
    const block = keeperAddBlockReason({
      selections,
      ownerKey: addOwnerKey,
      playerId,
      keeperLimit,
    });
    if (block) {
      setFeedback({ ok: false, text: block });
      return;
    }
    const row = valuations.find((v) => v.playerId === playerId);
    if (!row) {
      setFeedback({ ok: false, text: "Could not resolve that player." });
      return;
    }
    setManual.mutate({
      season: draftYear,
      ownerKey: addOwnerKey || row.ownerKey,
      playerId: row.playerId,
      playerName: row.playerName,
      position: row.position,
      keep: true,
      keeperRoundPick: addRoundPick,
    });
  };

  const removeKeeper = (s: ManualKeeperRow) => {
    setFeedback(null);
    setManual.mutate({
      season: draftYear,
      ownerKey: s.ownerKey,
      playerId: s.playerId,
      playerName: s.playerName,
      position: s.position,
      keep: false,
    });
  };

  const changeRoundPick = (s: ManualKeeperRow, pick: number) => {
    setFeedback(null);
    setManual.mutate({
      season: draftYear,
      ownerKey: s.ownerKey,
      playerId: s.playerId,
      playerName: s.playerName,
      position: s.position,
      keep: true,
      keeperRoundPick: pick,
    });
  };

  if (!leagueKeyReady) {
    return (
      <p className="text-sm text-muted-foreground">Sign in and select a league to manage keepers.</p>
    );
  }

  if (disabledPayload) {
    return (
      <div className="rounded-lg border border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
        This league does not use keepers (0 keeper slots). Management is disabled.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-keeper-manage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-foreground">Manage Keepers</h2>
          <p className="mt-1 text-xs text-muted-foreground max-w-xl">
            Saved selections for <span className="text-foreground/80">your</span> Fantasy Football Rivals
            workspace. They do not write to ESPN or other users. Model any team&apos;s keepers before the draft.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {keeperSlotsLabel(selections.length, keeperLimit ? keeperLimit * Math.max(1, teams.length) : null)}
            {keeperLimit != null ? ` · ${keeperLimit} per team` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void invalidateAll()}
          className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {feedback ? (
        <div
          role="status"
          className={cn(
            "rounded-lg border px-3 py-2 text-xs font-semibold",
            feedback.ok
              ? "border-lime-500/30 bg-lime-500/10 text-lime-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200",
          )}
          data-keeper-save-feedback={feedback.ok ? "ok" : "error"}
        >
          {feedback.text}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading keepers…
        </div>
      ) : null}

      {/* A. My / workspace keepers (saved) */}
      <section className="rounded-lg border border-border bg-card/30 p-4 space-y-3" data-keeper-my-keepers>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-lime-400">Your saved keepers</h3>
          <select
            className="text-xs bg-background border border-border rounded px-2 py-1"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.ownerKey} value={t.ownerKey}>
                {t.ownerName}
              </option>
            ))}
          </select>
        </div>

        {filteredSelections.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No saved keepers yet — add one below.</p>
        ) : (
          <ul className="space-y-2">
            {filteredSelections.map((s) => (
              <li
                key={`${s.ownerKey}:${s.playerId}`}
                className="flex items-center gap-3 rounded-md border border-border/80 bg-background/40 px-3 py-2"
              >
                <PlayerHeadshot
                  variant="hdCompact"
                  player={{
                    id: s.playerId,
                    name: s.playerName,
                    position: s.position,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-foreground truncate">{s.playerName}</span>
                    <span className={cn("text-[10px] font-bold uppercase", POS_TONE[s.position] ?? "text-zinc-400")}>
                      {s.position}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wide text-lime-400 bg-lime-500/10 border border-lime-500/25 px-1.5 rounded">
                      Saved
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {ownerNameByKey.get(s.ownerKey) ?? s.ownerKey} · {formatKeeperRoundPick(s.keeperRoundPick)}
                  </div>
                </div>
                <select
                  className="text-[11px] bg-background border border-border rounded px-1.5 py-1 shrink-0"
                  value={s.keeperRoundPick ?? 0}
                  disabled={setManual.isPending}
                  onChange={(e) => changeRoundPick(s, Number(e.target.value))}
                  aria-label="Keeper pick in round"
                >
                  <option value={0}>Auto</option>
                  <option value={1}>1st</option>
                  <option value={2}>2nd</option>
                  <option value={3}>3rd</option>
                </select>
                <button
                  type="button"
                  disabled={setManual.isPending}
                  onClick={() => removeKeeper(s)}
                  className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* B. Add / replace */}
      <section className="rounded-lg border border-border bg-card/30 p-4 space-y-3" data-keeper-add>
        <h3 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5 text-lime-400" /> Add or change keeper
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="text-[11px] text-muted-foreground space-y-1">
            <span>Fantasy team</span>
            <select
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground"
              value={addOwnerKey}
              onChange={(e) => {
                setAddOwnerKey(e.target.value);
                setAddPlayerId("");
              }}
            >
              <option value="">Select team…</option>
              {teams.map((t) => (
                <option key={t.ownerKey} value={t.ownerKey}>
                  {t.ownerName}
                  {keeperLimit != null
                    ? ` (${selections.filter((s) => s.ownerKey === t.ownerKey).length}/${keeperLimit})`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-muted-foreground space-y-1 sm:col-span-1 lg:col-span-2">
            <span>Search roster / candidates</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Player name…"
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground"
            />
          </label>
          <label className="text-[11px] text-muted-foreground space-y-1">
            <span>Pick in cost round</span>
            <select
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5"
              value={addRoundPick}
              onChange={(e) => setAddRoundPick(Number(e.target.value))}
            >
              <option value={0}>Auto (later)</option>
              <option value={1}>1st</option>
              <option value={2}>2nd</option>
              <option value={3}>3rd</option>
            </select>
          </label>
        </div>
        <div className="max-h-48 overflow-y-auto rounded border border-border divide-y divide-border/60">
          {candidates.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground italic">
              {addOwnerKey ? "No matching players for this team." : "Select a team to list candidates."}
            </p>
          ) : (
            candidates.map((v) => {
              const selected = addPlayerId === v.playerId;
              return (
                <button
                  key={`${v.ownerKey}:${v.playerId}`}
                  type="button"
                  onClick={() => {
                    setAddPlayerId(v.playerId);
                    if (!addOwnerKey) setAddOwnerKey(v.ownerKey);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/[0.04]",
                    selected && "bg-lime-500/10",
                  )}
                >
                  <PlayerHeadshot
                    variant="hdCompact"
                    player={{ id: v.playerId, name: v.playerName, position: v.position }}
                  />
                  <span className="font-semibold text-foreground truncate flex-1">{v.playerName}</span>
                  <span className={cn("font-bold uppercase", POS_TONE[v.position] ?? "text-zinc-400")}>
                    {v.position}
                  </span>
                  {v.keeperRoundCost != null ? (
                    <span className="text-muted-foreground tabular-nums">Rd {v.keeperRoundCost}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={setManual.isPending || !addOwnerKey || !addPlayerId}
            onClick={submitAdd}
            className="inline-flex items-center gap-1.5 rounded bg-lime-500/15 border border-lime-500/40 px-3 py-1.5 text-xs font-black text-lime-300 hover:bg-lime-500/25 disabled:opacity-40"
          >
            {setManual.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Save keeper
          </button>
          <button
            type="button"
            onClick={() => {
              setAddPlayerId("");
              setSearch("");
              setFeedback(null);
            }}
            className="rounded border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </section>

      {/* D. League-wide view */}
      <section className="rounded-lg border border-border bg-card/20 p-4 space-y-3" data-keeper-league>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">League keepers</h3>
          <Link to="/draft/war-room" className="text-[11px] font-bold text-violet-300 hover:text-violet-200">
            Open Draft War Room →
          </Link>
        </div>
        {leagueRows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No confirmed or saved keepers to show.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-2 pr-2 font-bold">Team / Owner</th>
                  <th className="py-2 pr-2 font-bold">Keeper</th>
                  <th className="py-2 pr-2 font-bold">Pos</th>
                  <th className="py-2 pr-2 font-bold">Cost</th>
                  <th className="py-2 font-bold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {leagueRows.map((r) => (
                  <tr key={`${r.ownerKey}:${r.playerId}:${r.status}`}>
                    <td className="py-2 pr-2 text-foreground/90">{r.ownerName}</td>
                    <td className="py-2 pr-2 font-semibold text-foreground">{r.playerName}</td>
                    <td className="py-2 pr-2">{r.position}</td>
                    <td className="py-2 pr-2 tabular-nums">
                      {r.keeperRound > 0 ? `Rd ${r.keeperRound}` : "—"}
                    </td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded border",
                          r.status === "MANUAL"
                            ? "text-lime-300 border-lime-500/30 bg-lime-500/10"
                            : r.status === "CONFIRMED"
                              ? "text-cyan-300 border-cyan-500/30 bg-cyan-500/10"
                              : "text-amber-300 border-amber-500/30 bg-amber-500/10",
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
