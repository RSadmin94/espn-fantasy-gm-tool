/**
 * Keeper Center Manage tab — card-first management UX.
 * Saves only via espn.setManualKeeperSelection → gm_manual_keeper_selections.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Loader2, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { PlayerHeadshot } from "@/components/draft/PlayerHeadshot";
import {
  KeeperPlayerPickerDialog,
  type KeeperPickerCandidate,
} from "@/components/keepers/KeeperPlayerPickerDialog";
import {
  countKeepersForOwner,
  formatKeeperRoundPick,
  headerKeeperPickerIntent,
  keeperAddBlockReason,
  planKeeperReplace,
  resolveMyOwnerKey,
  type ManualKeeperRow,
} from "@/lib/keeperManage";

type ValuationRow = KeeperPickerCandidate & {
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

type PickerState =
  | null
  | {
      mode: "add" | "change";
      ownerKey: string;
      ownerName: string;
      /** When changing, the keeper being replaced (removed after save if different player). */
      replace?: ManualKeeperRow;
    };

function costRoundForPlayer(
  valuations: ValuationRow[],
  forecast: ForecastRow[],
  playerId: number,
): number | null {
  const v = valuations.find((r) => r.playerId === playerId);
  if (v?.keeperRoundCost != null && v.keeperRoundCost > 0) return v.keeperRoundCost;
  const f = forecast.find((r) => r.playerId === playerId);
  if (f?.keeperRound != null && f.keeperRound > 0) return f.keeperRound;
  return null;
}

function RoundBadge({ round }: { round: number | null }) {
  if (round == null || round <= 0) {
    return <span className="text-base font-black text-muted-foreground">—</span>;
  }
  return (
    <span className="text-2xl font-black tabular-nums text-foreground tracking-tight">
      {round}
    </span>
  );
}

export function KeeperManagePanel() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );
  const draftYear = new Date().getFullYear();
  const utils = trpc.useUtils();

  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [picker, setPicker] = useState<PickerState>(null);
  const [roundEdit, setRoundEdit] = useState<ManualKeeperRow | null>(null);

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
  const ownerHomeQ = trpc.me.ownerHome.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: leagueKeyReady,
  });

  const invalidateAll = async () => {
    await Promise.all([
      utils.espn.getManualKeeperSelections.invalidate(),
      utils.espn.leagueKeeperForecast.invalidate(),
      utils.espn.keeperValuation.invalidate(),
      utils.draftWarRoom.getDraftWarRoomData.invalidate(),
    ]);
  };

  const setManual = trpc.espn.setManualKeeperSelection.useMutation();

  const persist = async (input: {
    ownerKey: string;
    playerId: number;
    playerName: string;
    position: string;
    keep: boolean;
    keeperRoundPick?: number;
  }) => {
    const res = await setManual.mutateAsync({
      season: draftYear,
      ...input,
    });
    const r = res as { ok?: boolean; error?: string; limit?: number | null } | undefined;
    if (r && r.ok === false) {
      const text =
        r.error === "limit_reached"
          ? `Keeper limit reached — max ${r.limit ?? "?"} per team.`
          : r.error === "table_missing"
            ? "Keeper storage is not provisioned yet."
            : r.error === "no_league"
              ? "No active league."
              : "Could not save that selection.";
      setFeedback({ ok: false, text });
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (!feedback?.ok) return;
    const t = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(t);
  }, [feedback]);

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

  const myOwnerKey = useMemo(
    () => resolveMyOwnerKey(teams, ownerHomeQ.data?.owner?.ownerKey),
    [ownerHomeQ.data, teams],
  );

  const myOwnerName = useMemo(() => {
    if (!myOwnerKey) return "Your team";
    const fromTeams = teams.find((t) => t.ownerKey === myOwnerKey)?.ownerName;
    if (fromTeams) return fromTeams;
    const display = String(ownerHomeQ.data?.owner?.displayName ?? "").trim();
    return display || "Your team";
  }, [myOwnerKey, teams, ownerHomeQ.data]);

  const mySelections = useMemo(
    () => (myOwnerKey ? selections.filter((s) => s.ownerKey === myOwnerKey) : []),
    [selections, myOwnerKey],
  );

  const mySlotCount = useMemo(() => {
    if (keeperLimit != null && keeperLimit > 0) return keeperLimit;
    return Math.max(1, mySelections.length || 1);
  }, [keeperLimit, mySelections.length]);

  const mySlots = useMemo(() => {
    const slots: Array<{ index: number; keeper: ManualKeeperRow | null }> = [];
    for (let i = 0; i < mySlotCount; i++) {
      slots.push({ index: i + 1, keeper: mySelections[i] ?? null });
    }
    return slots;
  }, [mySlotCount, mySelections]);

  const candidatesForOwner = (ownerKey: string): KeeperPickerCandidate[] =>
    valuations.filter((v) => v.ownerKey === ownerKey);

  const saveKeeper = async (args: {
    ownerKey: string;
    player: KeeperPickerCandidate;
    keeperRoundPick: number;
    replace?: ManualKeeperRow;
  }) => {
    setFeedback(null);
    const block = keeperAddBlockReason({
      selections: args.replace
        ? selections.filter((s) => s.playerId !== args.replace!.playerId)
        : selections,
      ownerKey: args.ownerKey,
      playerId: args.player.playerId,
      keeperLimit,
    });
    if (block && keeperLimit !== 1) {
      setFeedback({ ok: false, text: block });
      return;
    }

    const plan = planKeeperReplace({
      keeperLimit,
      replace: args.replace,
      nextPlayerId: args.player.playerId,
    });

    try {
      if (plan.removeFirst && args.replace) {
        const removed = await persist({
          ownerKey: args.replace.ownerKey,
          playerId: args.replace.playerId,
          playerName: args.replace.playerName,
          position: args.replace.position,
          keep: false,
        });
        if (!removed) return;
      }

      const ok = await persist({
        ownerKey: args.ownerKey,
        playerId: args.player.playerId,
        playerName: args.player.playerName,
        position: args.player.position,
        keep: true,
        keeperRoundPick: args.keeperRoundPick,
      });

      if (!ok) {
        // Multi-slot remove-then-add: restore prior so the slot is never left empty.
        if (plan.restoreOnAddFailure && args.replace) {
          await persist({
            ownerKey: args.replace.ownerKey,
            playerId: args.replace.playerId,
            playerName: args.replace.playerName,
            position: args.replace.position,
            keep: true,
            keeperRoundPick: args.replace.keeperRoundPick,
          });
          await invalidateAll();
          await manualQ.refetch();
        }
        return;
      }

      setFeedback({ ok: true, text: "Keeper saved." });
      setPicker(null);
      setRoundEdit(null);
      await invalidateAll();
      await manualQ.refetch();
    } catch {
      if (plan.restoreOnAddFailure && args.replace) {
        try {
          await persist({
            ownerKey: args.replace.ownerKey,
            playerId: args.replace.playerId,
            playerName: args.replace.playerName,
            position: args.replace.position,
            keep: true,
            keeperRoundPick: args.replace.keeperRoundPick,
          });
          await invalidateAll();
          await manualQ.refetch();
        } catch {
          /* restore best-effort */
        }
      }
      setFeedback({ ok: false, text: "Could not save that selection." });
    }
  };

  const removeKeeper = async (s: ManualKeeperRow) => {
    setFeedback(null);
    try {
      const ok = await persist({
        ownerKey: s.ownerKey,
        playerId: s.playerId,
        playerName: s.playerName,
        position: s.position,
        keep: false,
      });
      if (!ok) return;
      setFeedback({ ok: true, text: "Keeper removed." });
      await invalidateAll();
      await manualQ.refetch();
    } catch {
      setFeedback({ ok: false, text: "Could not save that selection." });
    }
  };

  const changeRoundPick = async (s: ManualKeeperRow, pick: number) => {
    setFeedback(null);
    try {
      const ok = await persist({
        ownerKey: s.ownerKey,
        playerId: s.playerId,
        playerName: s.playerName,
        position: s.position,
        keep: true,
        keeperRoundPick: pick,
      });
      if (!ok) return;
      setFeedback({ ok: true, text: "Round updated." });
      setRoundEdit(null);
      await invalidateAll();
      await manualQ.refetch();
    } catch {
      setFeedback({ ok: false, text: "Could not save that selection." });
    }
  };

  const loading = leagueKeyReady && (manualQ.isLoading || valQ.isLoading);
  const disabledPayload =
    valQ.data &&
    typeof valQ.data === "object" &&
    "disabled" in valQ.data &&
    (valQ.data as { disabled?: boolean }).disabled === true;

  const canAddMy =
    myOwnerKey != null &&
    (keeperLimit == null ||
      keeperLimit <= 0 ||
      keeperLimit === 1 ||
      countKeepersForOwner(selections, myOwnerKey) < keeperLimit);

  if (!leagueKeyReady) {
    return (
      <p className="text-sm text-muted-foreground">Sign in and select a league to manage keepers.</p>
    );
  }

  if (disabledPayload) {
    return (
      <div className="rounded-xl border border-border bg-card/40 px-5 py-8 text-sm text-muted-foreground">
        This league does not use keepers (0 keeper slots). Management is disabled.
      </div>
    );
  }

  return (
    <div className="space-y-10" data-keeper-manage>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-base text-foreground/90 leading-relaxed">
            This is where you <span className="font-bold text-lime-300">change keepers</span> for your
            draft scenarios. Selections save to your Fantasy Football Rivals workspace — not ESPN, not
            other users.
          </p>
          {keeperLimit != null ? (
            <p className="mt-2 text-sm text-muted-foreground">{keeperLimit} keeper slot{keeperLimit === 1 ? "" : "s"} per team</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void invalidateAll()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {feedback ? (
        <div
          role="status"
          className={cn(
            "rounded-xl border px-4 py-3 text-sm font-bold",
            feedback.ok
              ? "border-lime-500/40 bg-lime-500/15 text-lime-200"
              : "border-amber-500/40 bg-amber-500/15 text-amber-100",
          )}
          data-keeper-save-feedback={feedback.ok ? "ok" : "error"}
        >
          {feedback.ok ? "✓ " : ""}
          {feedback.text}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading keepers…
        </div>
      ) : null}

      {/* ── SECTION 1: My Keeper Management ───────────────────────── */}
      <section className="space-y-4" data-keeper-my-management>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-foreground">My Keeper Management</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {myOwnerName}
              {myOwnerKey ? "" : " — pick your team in league setup if this looks wrong"}
            </p>
          </div>
          {myOwnerKey && canAddMy ? (
            <button
              type="button"
              onClick={() => {
                const intent = headerKeeperPickerIntent(mySelections);
                setPicker({
                  mode: intent.mode,
                  ownerKey: myOwnerKey,
                  ownerName: myOwnerName,
                  replace: intent.replace,
                });
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-lime-500/50 bg-lime-500/20 px-5 py-3 text-sm font-black text-lime-200 hover:bg-lime-500/30"
              data-keeper-add-cta
            >
              <Plus className="h-4 w-4" />
              {mySelections.length > 0 ? "Add / Change Keeper" : "Add Keeper"}
            </button>
          ) : null}
        </div>

        {!myOwnerKey ? (
          <div className="rounded-2xl border border-border bg-card/40 px-5 py-8 text-sm text-muted-foreground">
            We couldn&apos;t resolve your team yet. Use <span className="text-foreground font-semibold">League Keepers</span>{" "}
            below to edit any team, or finish league setup so My Keepers can focus on you.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {mySlots.map((slot) => {
              const k = slot.keeper;
              const cost = k ? costRoundForPlayer(valuations, forecast, k.playerId) : null;
              return (
                <article
                  key={`my-slot-${slot.index}`}
                  className="rounded-2xl border border-border bg-card/50 p-5 sm:p-6 shadow-sm"
                  data-keeper-my-card
                >
                  {mySlotCount > 1 ? (
                    <p className="text-[11px] font-black uppercase tracking-widest text-lime-400 mb-3">
                      Keeper {slot.index}
                    </p>
                  ) : null}

                  {k ? (
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-4 min-w-0">
                        <PlayerHeadshot
                          variant="hdLg"
                          player={{ id: k.playerId, name: k.playerName, position: k.position }}
                        />
                        <div className="min-w-0 space-y-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              {myOwnerName}
                            </p>
                            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Keeper
                            </p>
                            <p className="text-2xl font-black text-foreground tracking-tight truncate">
                              {k.playerName}
                            </p>
                            <p className={cn("mt-0.5 text-sm font-bold uppercase", POS_TONE[k.position] ?? "text-zinc-400")}>
                              {k.position}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-6">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                Round
                              </p>
                              <RoundBadge round={cost} />
                            </div>
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                Pick in round
                              </p>
                              <p className="text-base font-bold text-foreground mt-0.5">
                                {formatKeeperRoundPick(k.keeperRoundPick)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col sm:items-stretch gap-2 shrink-0 w-full sm:w-44">
                        <button
                          type="button"
                          disabled={setManual.isPending}
                          onClick={() =>
                            setPicker({
                              mode: "change",
                              ownerKey: myOwnerKey,
                              ownerName: myOwnerName,
                              replace: k,
                            })
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold text-foreground hover:bg-white/[0.04]"
                        >
                          <Pencil className="h-4 w-4" /> Change Keeper
                        </button>
                        <button
                          type="button"
                          disabled={setManual.isPending}
                          onClick={() => setRoundEdit(k)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold text-foreground hover:bg-white/[0.04]"
                        >
                          Change Round
                        </button>
                        <button
                          type="button"
                          disabled={setManual.isPending}
                          onClick={() => removeKeeper(k)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200 hover:bg-red-500/20"
                        >
                          <Trash2 className="h-4 w-4" /> Remove Keeper
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {myOwnerName}
                        </p>
                        <p className="mt-2 text-lg font-bold text-muted-foreground">No keeper set</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Add a keeper to model your draft.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPicker({
                            mode: "add",
                            ownerKey: myOwnerKey,
                            ownerName: myOwnerName,
                          })
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/50 bg-lime-500/20 px-5 py-3 text-sm font-black text-lime-200 hover:bg-lime-500/30"
                      >
                        <Plus className="h-4 w-4" /> Add Keeper
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── SECTION 2: League Keepers ─────────────────────────────── */}
      <section className="space-y-4" data-keeper-league>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-foreground">League Keepers</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Model every team in your workspace. Edit and Remove are always visible.
            </p>
          </div>
          <Link
            to="/draft/war-room"
            className="text-sm font-bold text-violet-300 hover:text-violet-200"
          >
            Open Draft War Room →
          </Link>
        </div>

        <div className="rounded-2xl border border-border overflow-hidden bg-card/30">
          <div className="hidden sm:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_5rem_6rem_minmax(10rem,auto)] gap-3 px-5 py-3 border-b border-border bg-background/40 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
            <span>Owner</span>
            <span>Keeper</span>
            <span>Round</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>

          {teams.length === 0 ? (
            <p className="px-5 py-10 text-sm text-muted-foreground italic text-center">
              No teams loaded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {teams.map((team) => {
                const saved = selections.filter((s) => s.ownerKey === team.ownerKey);
                const predicted = forecast.filter(
                  (f) => f.ownerKey === team.ownerKey && f.status !== "MANUAL",
                );
                const rows =
                  saved.length > 0
                    ? saved.map((s) => ({
                        kind: "saved" as const,
                        selection: s,
                        playerName: s.playerName,
                        position: s.position,
                        playerId: s.playerId,
                        round: costRoundForPlayer(valuations, forecast, s.playerId),
                        status: "SAVED" as const,
                      }))
                    : predicted.length > 0
                      ? predicted.map((f) => ({
                          kind: "forecast" as const,
                          selection: null as ManualKeeperRow | null,
                          playerName: f.playerName,
                          position: f.position,
                          playerId: f.playerId,
                          round: f.keeperRound > 0 ? f.keeperRound : null,
                          status: f.status,
                        }))
                      : [
                          {
                            kind: "empty" as const,
                            selection: null as ManualKeeperRow | null,
                            playerName: "—",
                            position: "",
                            playerId: 0,
                            round: null as number | null,
                            status: "OPEN" as const,
                          },
                        ];

                return rows.map((row, idx) => (
                  <li
                    key={`${team.ownerKey}:${row.playerId || "empty"}:${idx}`}
                    className="px-5 py-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_5rem_6rem_minmax(10rem,auto)] gap-3 sm:gap-3 items-center"
                  >
                    <div className="min-w-0">
                      <p className="sm:hidden text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Owner
                      </p>
                      <p className="font-bold text-foreground truncate">{team.ownerName}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="sm:hidden text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Keeper
                      </p>
                      <p className="font-black text-foreground truncate text-base">
                        {row.playerName}
                        {row.position ? (
                          <span className={cn("ml-2 text-xs font-bold uppercase", POS_TONE[row.position] ?? "text-zinc-400")}>
                            {row.position}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div>
                      <p className="sm:hidden text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Round
                      </p>
                      <p className="font-black tabular-nums text-foreground">
                        {row.round != null && row.round > 0 ? row.round : "—"}
                      </p>
                    </div>
                    <div>
                      <span
                        className={cn(
                          "inline-flex text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-md border",
                          row.status === "SAVED" || row.status === "MANUAL"
                            ? "text-lime-300 border-lime-500/30 bg-lime-500/10"
                            : row.status === "CONFIRMED"
                              ? "text-cyan-300 border-cyan-500/30 bg-cyan-500/10"
                              : row.status === "OPEN"
                                ? "text-muted-foreground border-border bg-background/40"
                                : "text-amber-300 border-amber-500/30 bg-amber-500/10",
                        )}
                      >
                        {row.status === "SAVED" ? "Saved" : row.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap sm:justify-end gap-2">
                      <button
                        type="button"
                        disabled={setManual.isPending}
                        onClick={() =>
                          setPicker({
                            mode: row.selection ? "change" : "add",
                            ownerKey: team.ownerKey,
                            ownerName: team.ownerName,
                            replace: row.selection ?? undefined,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-bold text-foreground hover:bg-white/[0.04]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {row.selection || row.kind === "forecast" ? "Edit" : "Set"}
                      </button>
                      {row.selection ? (
                        <button
                          type="button"
                          disabled={setManual.isPending}
                          onClick={() => removeKeeper(row.selection!)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-sm font-bold text-red-200 hover:bg-red-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      ) : null}
                    </div>
                  </li>
                ));
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Player picker */}
      {picker ? (
        <KeeperPlayerPickerDialog
          open
          onOpenChange={(open) => {
            if (!open) setPicker(null);
          }}
          title={picker.mode === "change" ? "Change Keeper" : "Add Keeper"}
          ownerName={picker.ownerName}
          candidates={candidatesForOwner(picker.ownerKey)}
          initialRoundPick={picker.replace?.keeperRoundPick ?? 0}
          excludePlayerIds={
            picker.replace
              ? selections
                  .filter((s) => s.ownerKey === picker.ownerKey && s.playerId !== picker.replace!.playerId)
                  .map((s) => s.playerId)
              : selections.filter((s) => s.ownerKey === picker.ownerKey).map((s) => s.playerId)
          }
          saving={setManual.isPending}
          onSave={({ player, keeperRoundPick }) => {
            void saveKeeper({
              ownerKey: picker.ownerKey,
              player,
              keeperRoundPick,
              replace: picker.replace,
            });
          }}
        />
      ) : null}

      {/* Round pick editor */}
      {roundEdit ? (
        <DialogRoundPick
          ownerName={
            teams.find((t) => t.ownerKey === roundEdit.ownerKey)?.ownerName ?? roundEdit.ownerKey
          }
          playerName={roundEdit.playerName}
          value={roundEdit.keeperRoundPick}
          saving={setManual.isPending}
          onClose={() => setRoundEdit(null)}
          onSave={(pick) => {
            void changeRoundPick(roundEdit, pick);
          }}
        />
      ) : null}
    </div>
  );
}

function DialogRoundPick({
  ownerName,
  playerName,
  value,
  saving,
  onClose,
  onSave,
}: {
  ownerName: string;
  playerName: string;
  value: number;
  saving: boolean;
  onClose: () => void;
  onSave: (pick: number) => void;
}) {
  const [pick, setPick] = useState(value);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Change round"
      data-keeper-round-dialog
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl space-y-4">
        <div>
          <h3 className="text-lg font-black text-foreground">Change Round</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {playerName} · {ownerName}
          </p>
        </div>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span className="font-bold uppercase tracking-wider">Pick in cost round</span>
          <select
            value={pick}
            onChange={(e) => setPick(Number(e.target.value))}
            className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground"
          >
            <option value={0}>Auto (later / less valuable pick)</option>
            <option value={1}>1st pick in round</option>
            <option value={2}>2nd pick in round</option>
            <option value={3}>3rd pick in round</option>
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(pick)}
            className="rounded-lg border border-lime-500/50 bg-lime-500/20 px-5 py-2.5 text-sm font-black text-lime-200 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null} Save
          </button>
        </div>
      </div>
    </div>
  );
}
