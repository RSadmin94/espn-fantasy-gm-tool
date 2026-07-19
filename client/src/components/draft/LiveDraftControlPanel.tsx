/**
 * RFSN-013 / RFSN-024 — Live Draft Experience Shell (platform-neutral).
 * Source adapters stay behind this control surface.
 * Operational control center: source, connection, start/pause, new draft, board driver.
 */
import { cn } from "@/lib/utils";
import {
  liveDraftPhaseBadgeLabel,
  liveDraftStatusLines,
  resolveLiveDraftUiPhase,
  type LiveDraftUxStatusInput,
} from "@/lib/liveDraftUx";
import {
  type LiveDraftSource,
  normalizeLiveDraftSource,
} from "@/lib/liveDraftSource";

export type { LiveDraftSource };

export type LiveDraftControlStatus = {
  active: boolean;
  source: LiveDraftSource;
  monitoring: boolean;
  boothOnAir: boolean;
  lockedCount: number;
  notifiedCount: number;
  draftComplete: boolean;
  lastError: string | null;
  lastPollAt: string | null;
  connectorReady: boolean;
  /** User paused the draft session. */
  draftPaused?: boolean;
};

/** Built-in RFSN draft session actions (hidden for Connected League). */
export type LiveDraftSessionActions = {
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canReset: boolean;
  canNewDraft: boolean;
  pickLabel: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onNewDraft: () => void;
};

type Props = {
  status: LiveDraftControlStatus;
  onToggleActive: () => void;
  onSourceChange: (source: LiveDraftSource) => void;
  sessionActions?: LiveDraftSessionActions | null;
};

function toUxInput(status: LiveDraftControlStatus): LiveDraftUxStatusInput {
  return {
    active: status.active,
    source: normalizeLiveDraftSource(status.source),
    monitoring: status.monitoring,
    boothOnAir: status.boothOnAir,
    draftComplete: status.draftComplete,
    lastError: status.lastError,
    connectorReady: status.connectorReady,
    draftPaused: status.draftPaused,
    hasLockedPicks: status.lockedCount > 0,
  };
}

const PHASE_TONE: Record<string, string> = {
  idle: "text-zinc-400",
  connected: "text-emerald-300",
  waiting: "text-sky-300",
  paused: "text-amber-300",
  reconnecting: "text-amber-200",
  complete: "text-emerald-200",
};

export function LiveDraftControlPanel({
  status,
  onToggleActive,
  onSourceChange,
  sessionActions = null,
}: Props) {
  const ux = toUxInput(status);
  const phase = resolveLiveDraftUiPhase(ux);
  const lines = liveDraftStatusLines(ux);
  const source = normalizeLiveDraftSource(status.source);
  const isEspn = source === "espn";

  return (
    <div
      className="mb-3 sticky top-16 z-10 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 text-[11px] text-zinc-300 space-y-3 backdrop-blur-md"
      data-live-draft-control
      data-live-draft-ops
      data-rfsn-013
      data-rfsn-024
      data-live-phase={phase}
      data-live-draft-source={source}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-black uppercase tracking-wider text-emerald-200 text-xs">
            Live Draft Control
          </div>
          <span
            className={cn(
              "text-[10px] font-black uppercase tracking-wider",
              PHASE_TONE[phase] ?? "text-zinc-400",
            )}
            data-live-phase-badge
          >
            {status.active && (phase === "connected" || phase === "waiting") ? "● " : ""}
            {liveDraftPhaseBadgeLabel(phase)}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleActive}
          className={cn(
            "px-2.5 py-1 rounded text-[11px] font-black uppercase tracking-wider border",
            status.active
              ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-200"
              : "border-zinc-600 text-zinc-400 hover:text-zinc-200",
          )}
          data-live-draft-power
        >
          {status.active ? "Session On" : "Session Off"}
        </button>
      </div>

      {/* Source — always visible so the board driver is chosen before starting */}
      <div className="space-y-1.5" data-live-source-picker>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Draft source</div>
        <div className="flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-zinc-200">
            <input
              type="radio"
              name="live-draft-source"
              checked={source === "rfsn"}
              onChange={() => onSourceChange("rfsn")}
              className="accent-emerald-400"
            />
            RFSN Draft
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-zinc-200">
            <input
              type="radio"
              name="live-draft-source"
              checked={source === "espn"}
              onChange={() => onSourceChange("espn")}
              className="accent-emerald-400"
            />
            Connected League
          </label>
        </div>
        <p className="text-[11px] text-zinc-500" data-live-board-driver>
          {isEspn
            ? "Board driver: Connected League feed (ESPN). Built-in RFSN pick generation is paused."
            : "Board driver: Built-in RFSN Draft. Picks are generated here and feed the booth."}
        </p>
      </div>

      {/* Connection / session status */}
      <div className="space-y-1" data-live-status-lines>
        {lines.map((line, i) => (
          <div
            key={`${i}:${line}`}
            className={cn(
              i === 0
                ? "text-sm font-bold text-zinc-100"
                : i === 1
                  ? "text-xs text-zinc-300"
                  : "text-[11px] text-zinc-500",
            )}
          >
            {line}
          </div>
        ))}
      </div>

      {/* Primary session actions */}
      {status.active && !isEspn && sessionActions && (
        <div className="flex flex-wrap items-center gap-2" data-live-session-actions>
          {sessionActions.canStart && (
            <button
              type="button"
              onClick={sessionActions.onStart}
              className="px-4 py-1.5 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300 text-xs font-black hover:bg-violet-500/25"
              data-live-action-start
            >
              ▶ Start Draft
            </button>
          )}
          {sessionActions.canResume && (
            <button
              type="button"
              onClick={sessionActions.onResume}
              className="px-4 py-1.5 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300 text-xs font-black hover:bg-violet-500/25"
              data-live-action-resume
            >
              ▶ Resume
            </button>
          )}
          {sessionActions.canPause && (
            <button
              type="button"
              onClick={sessionActions.onPause}
              className="px-4 py-1.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-black"
              data-live-action-pause
            >
              ⏸ Pause
            </button>
          )}
          {sessionActions.canNewDraft && (
            <button
              type="button"
              onClick={sessionActions.onNewDraft}
              className="px-3 py-1.5 rounded text-zinc-300 text-xs font-bold hover:text-zinc-100 border border-zinc-600"
              data-live-action-new
            >
              Start new draft
            </button>
          )}
          {sessionActions.canReset && (
            <button
              type="button"
              onClick={sessionActions.onReset}
              className="px-3 py-1.5 rounded text-zinc-400 text-xs hover:text-zinc-200 border border-zinc-700"
              data-live-action-reset
            >
              ↺ Reset
            </button>
          )}
          <span className="text-[11px] text-zinc-400 tabular-nums ml-1">
            {sessionActions.pickLabel}
          </span>
        </div>
      )}

      {status.active && isEspn && (
        <div className="flex flex-wrap items-center gap-2" data-live-espn-connect>
          <span
            className={cn(
              "px-3 py-1.5 rounded text-xs font-black border",
              status.connectorReady
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                : "bg-amber-500/10 border-amber-500/30 text-amber-200",
            )}
          >
            {status.connectorReady ? "Connected to league draft" : "Waiting for league connection"}
          </span>
          {status.lastPollAt ? (
            <span className="text-zinc-500 tabular-nums">
              Updated {new Date(status.lastPollAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      )}

      {status.active && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-500 tabular-nums">
          <span>
            Picks locked {status.lockedCount}
            {status.notifiedCount > 0 ? ` · covered ${status.notifiedCount}` : ""}
          </span>
          {isEspn && !status.connectorReady && (
            <span>League connection limited — browser session may be required</span>
          )}
        </div>
      )}

      {status.lastError && (
        <div className="text-amber-300" data-live-draft-error>
          {status.lastError}
        </div>
      )}
    </div>
  );
}
