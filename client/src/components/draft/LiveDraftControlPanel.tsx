/**
 * RFSN-013 — Live Draft Experience Shell (platform-neutral).
 * Source adapters stay behind this control surface; do not name providers here.
 */
import { cn } from "@/lib/utils";

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
};

type Props = {
  status: LiveDraftControlStatus;
  onToggleActive: () => void;
  onSourceChange: (source: LiveDraftSource) => void;
};

export function LiveDraftControlPanel({ status, onToggleActive, onSourceChange }: Props) {
  const statusLabel = !status.active
    ? "Idle"
    : status.draftComplete
      ? "Draft complete"
      : status.monitoring
        ? "Monitoring"
        : "Standby";

  return (
    <div
      className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-[11px] text-zinc-300 space-y-2"
      data-live-draft-control
      data-rfsn-013
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-black uppercase tracking-wider text-emerald-200 text-xs">
          Live Draft
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

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Status </span>
              <span className={status.monitoring ? "text-emerald-300" : "text-zinc-400"}>
                {status.monitoring ? "● " : ""}
                {statusLabel}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Booth </span>
              <span className={status.boothOnAir ? "text-red-300 font-bold" : "text-zinc-500"}>
                {status.boothOnAir ? "ON AIR" : "Standby"}
              </span>
            </div>
            <div className="text-zinc-500 tabular-nums">
              locked {status.lockedCount} · notified {status.notifiedCount}
            </div>
          </div>

          {status.source === "connected-league" && (
            <div className="text-zinc-500">
              {status.connectorReady
                ? "League connection ready"
                : "League connection limited — browser session may be required"}
              {status.lastPollAt
                ? ` · updated ${new Date(status.lastPollAt).toLocaleTimeString()}`
                : ""}
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
          {status.lastError && <div className="text-amber-300">{status.lastError}</div>}
        </>
      )}
    </div>
  );
}
