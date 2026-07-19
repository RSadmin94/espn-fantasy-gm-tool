/**
 * RFSN-030C — FantasyPros Mock commentary control surface (Simulation Mode).
 * Not an ESPN Live Draft panel.
 */
import { cn } from "@/lib/utils";
import type { FantasyProsMockMonitorStatus } from "@/hooks/useFantasyProsMockDraftMonitor";

type Props = {
  active: boolean;
  status: FantasyProsMockMonitorStatus;
  leagueLabel: string;
  season: number;
  userOwnerPos: number;
  teamCount: number;
  voiceEnabled: boolean;
  commentaryEnabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onNewDraft: () => void;
  onUserOwnerPosChange: (pos: number) => void;
  onVoiceChange: (on: boolean) => void;
  onCommentaryChange: (on: boolean) => void;
};

export function FantasyProsMockControlPanel({
  active,
  status,
  leagueLabel,
  season,
  userOwnerPos,
  teamCount,
  voiceEnabled,
  commentaryEnabled,
  onStart,
  onStop,
  onNewDraft,
  onUserOwnerPosChange,
  onVoiceChange,
  onCommentaryChange,
}: Props) {
  const seats = Array.from({ length: Math.max(2, teamCount) }, (_, i) => i);

  return (
    <div
      className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2.5 text-[11px] text-zinc-300 space-y-2"
      data-fantasypros-mock-control
      data-rfsn-030c
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-black uppercase tracking-wider text-sky-200 text-xs">
            RFSN FantasyPros Mock
          </div>
          <div className="text-[10px] text-sky-300/80 uppercase tracking-wider">
            Simulation Mode
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!active ? (
            <button
              type="button"
              onClick={onStart}
              className="px-2.5 py-1 rounded text-[11px] font-black uppercase tracking-wider bg-sky-600/30 border border-sky-500/50 text-sky-100"
            >
              Start FantasyPros Mock Commentary
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onNewDraft}
                className="px-2 py-1 rounded text-[11px] font-bold border border-zinc-600 text-zinc-300 hover:text-zinc-100"
              >
                New Draft
              </button>
              <button
                type="button"
                onClick={onStop}
                className="px-2.5 py-1 rounded text-[11px] font-black uppercase tracking-wider bg-zinc-800 border border-zinc-500 text-zinc-200"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <div>
          <span className="text-zinc-500">League </span>
          <span className="text-zinc-200">{leagueLabel}</span>
          <span className="text-zinc-600"> · {season}</span>
        </div>
        <div>
          <span className="text-zinc-500">Status </span>
          <span
            className={cn(
              "font-bold uppercase tracking-wider",
              active && status.connectorStatus === "monitoring"
                ? "text-emerald-300"
                : active
                  ? "text-amber-200"
                  : "text-zinc-400",
            )}
          >
            {active
              ? status.connectorStatus === "monitoring"
                ? "Connected · Monitoring picks"
                : status.connectorStatus.replace(/_/g, " ")
              : "Idle"}
          </span>
        </div>
        {active && (
          <>
            <div className="truncate">
              <span className="text-zinc-500">Draft ID </span>
              <span className="text-zinc-300 font-mono text-[10px]">
                {status.draftId || "—"}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Last pick </span>
              <span className="text-zinc-200">
                {status.lastIngestedPick != null
                  ? `#${status.lastIngestedPick}${status.lastPlayerName ? ` · ${status.lastPlayerName}` : ""}`
                  : "—"}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-zinc-400">
          <span>Your FantasyPros seat</span>
          <select
            value={userOwnerPos}
            onChange={(e) => onUserOwnerPosChange(Number(e.target.value))}
            disabled={active}
            className="bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-200"
          >
            {seats.map((pos) => (
              <option key={pos} value={pos}>
                Seat {pos + 1} (ownerPos {pos})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-zinc-400">
          <input
            type="checkbox"
            checked={commentaryEnabled}
            onChange={(e) => onCommentaryChange(e.target.checked)}
          />
          Commentary
        </label>
        <label className="flex items-center gap-1.5 text-zinc-400">
          <input
            type="checkbox"
            checked={voiceEnabled}
            onChange={(e) => onVoiceChange(e.target.checked)}
            disabled={!commentaryEnabled}
          />
          Voice
        </label>
        <span className="text-zinc-600">
          Extension {status.extensionPresent ? "detected" : "missing"}
          {status.fantasyProsTabs != null ? ` · FP tabs ${status.fantasyProsTabs}` : ""}
        </span>
      </div>

      {status.lastError && (
        <div className="text-amber-200/90 text-[11px]" role="status">
          {status.lastError}
        </div>
      )}

      <p className="text-[10px] text-zinc-600 leading-snug">
        Open{" "}
        <a
          className="text-sky-400 underline"
          href="https://draftwizard.fantasypros.com/football/mock-draft-simulator/live/"
          target="_blank"
          rel="noreferrer"
        >
          FantasyPros Mock Draft Simulator (live)
        </a>
        . Solo mocks only — refreshing the FantasyPros room may reset the draft; this
        connector baselines existing picks and does not replay them.
      </p>
    </div>
  );
}
