/**
 * RFSN-013 / RFSN-024 — Live Draft Experience Shell (platform-neutral).
 * Source adapters stay behind this control surface; do not name providers here.
 */
import { cn } from "@/lib/utils";
import {
  liveDraftPhaseBadgeLabel,
  liveDraftStatusLines,
  resolveLiveDraftUiPhase,
  type LiveDraftUxStatusInput,
} from "@/lib/liveDraftUx";

export type LiveDraftSource = "connected-league" | "manual";

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

type Props = {
  status: LiveDraftControlStatus;
  onToggleActive: () => void;
  onSourceChange: (source: LiveDraftSource) => void;
};

function toUxInput(status: LiveDraftControlStatus): LiveDraftUxStatusInput {
  return {
    active: status.active,
    source: status.source,
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

export function LiveDraftControlPanel({ status, onToggleActive, onSourceChange }: Props) {
  const ux = toUxInput(status);
  const phase = resolveLiveDraftUiPhase(ux);
  const lines = liveDraftStatusLines(ux);

  return (
    <div
      className="mb-3 sticky top-16 z-10 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-[11px] text-zinc-300 space-y-2 backdrop-blur-md"
      data-live-draft-control
      data-rfsn-013
      data-rfsn-024
      data-live-phase={phase}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-black uppercase tracking-wider text-emerald-200 text-xs">
            Live Draft
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
        >
          {status.active ? "On" : "Off"}
        </button>
      </div>

      {status.active && (
        <>
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

          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Source</div>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-zinc-300">
                <input
                  type="radio"
                  name="live-draft-source"
                  checked={status.source === "connected-league"}
                  onChange={() => onSourceChange("connected-league")}
                  className="accent-emerald-400"
                />
                Connected League
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-zinc-300">
                <input
                  type="radio"
                  name="live-draft-source"
                  checked={status.source === "manual"}
                  onChange={() => onSourceChange("manual")}
                  className="accent-emerald-400"
                />
                Manual Draft
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-500 tabular-nums">
            <span>
              Picks locked {status.lockedCount}
              {status.notifiedCount > 0 ? ` · covered ${status.notifiedCount}` : ""}
            </span>
            {status.source === "connected-league" && status.lastPollAt ? (
              <span>Updated {new Date(status.lastPollAt).toLocaleTimeString()}</span>
            ) : null}
          </div>

          {status.source === "connected-league" && (
            <div className="text-zinc-500">
              {status.connectorReady
                ? "League connection ready"
                : "League connection limited — browser session may be required"}
            </div>
          )}
          {status.source === "connected-league" ? (
            <div className="text-zinc-600">
              League picks feed the booth. Mock simulation notify is paused.
            </div>
          ) : (
            <div className="text-zinc-600">
              Manual picks feed the booth for this session.
            </div>
          )}
          {status.lastError && (
            <div className="text-amber-300" data-live-draft-error>
              {status.lastError}
            </div>
          )}
        </>
      )}
    </div>
  );
}
