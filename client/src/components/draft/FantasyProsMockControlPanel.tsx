/**
 * RFSN-030C — FantasyPros Mock commentary control surface (Simulation Mode).
 * External mock source only — not ESPN Live / not built-in RFSN Live Draft.
 */
import { useState } from "react";
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
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const seats = Array.from({ length: Math.max(2, teamCount) }, (_, i) => i);
  const waiting =
    active &&
    (status.connectorStatus === "monitoring" || status.connectorStatus === "waiting_for_fantasypros_tab") &&
    status.lastIngestedPick == null;
  const statusLabel = !active
    ? "Idle"
    : status.connectorStatus === "monitoring"
      ? "Connected · Waiting for next pick"
      : status.connectorStatus.replace(/_/g, " ");

  return (
    <div
      className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2.5 text-label text-zinc-300 space-y-2"
      data-fantasypros-mock-control
      data-rfsn-030c
      data-mock-draft-source="fantasypros"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-black uppercase tracking-wider text-sky-200 text-xs">
            FantasyPros Mock
          </div>
          <div className="text-label text-sky-300/80">
            External simulated draft · {leagueLabel} · {season}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!active ? (
            <button
              type="button"
              onClick={onStart}
              className="px-2.5 py-1 rounded text-label font-black uppercase tracking-wider bg-sky-600/30 border border-sky-500/50 text-sky-100"
            >
              Start Mock Commentary
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onNewDraft}
                className="px-2 py-1 rounded text-label font-bold border border-zinc-600 text-zinc-300 hover:text-zinc-100"
              >
                New session
              </button>
              <button
                type="button"
                onClick={onStop}
                className="px-2.5 py-1 rounded text-label font-black uppercase tracking-wider bg-zinc-800 border border-zinc-500 text-zinc-200"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div>
          <span className="text-ink-secondary">Status </span>
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
            {statusLabel}
          </span>
        </div>
        {active && (
          <>
            <div>
              <span className="text-ink-secondary">Picks received </span>
              <span className="text-zinc-200 tabular-nums">{status.notifiedCount}</span>
            </div>
            <div>
              <span className="text-ink-secondary">Last pick </span>
              <span className="text-zinc-200">
                {status.lastIngestedPick != null
                  ? `#${status.lastIngestedPick}${status.lastPlayerName ? ` · ${status.lastPlayerName}` : ""}`
                  : waiting
                    ? "Waiting…"
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
                Seat {pos + 1}
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
      </div>

      {status.lastError && (
        <div className="text-amber-200/90 text-label" role="status">
          {status.lastError}
        </div>
      )}

      <p className="text-label text-ink-tertiary leading-snug">
        Open the{" "}
        <a
          className="text-sky-400 underline"
          href="https://draftwizard.fantasypros.com/football/mock-draft-simulator/live/"
          target="_blank"
          rel="noreferrer"
        >
          FantasyPros Mock Draft Simulator (live)
        </a>
        . Solo mocks only — existing picks are baselined; only new picks feed commentary.
      </p>

      <details
        className="rounded border border-zinc-800/80 bg-zinc-950/40 px-2 py-1"
        open={diagnosticsOpen}
        onToggle={(e) => setDiagnosticsOpen((e.target as HTMLDetailsElement).open)}
        data-fp-diagnostics
      >
        <summary className="cursor-pointer text-label uppercase tracking-wider text-ink-secondary select-none">
          Diagnostics
        </summary>
        <div className="mt-1.5 space-y-0.5 text-label text-ink-secondary font-mono">
          <div>extension: {status.extensionPresent ? "detected" : "missing"}</div>
          <div>connector: {status.connectorStatus}</div>
          <div>draftId: {status.draftId || "—"}</div>
          <div>providerDraftId: {status.providerDraftId || "—"}</div>
          <div>fpTabs: {status.fantasyProsTabs ?? "—"}</div>
          <div>lockedCount: {status.lockedCount}</div>
          <div>notifiedCount: {status.notifiedCount}</div>
        </div>
      </details>
    </div>
  );
}
