/**
 * Live / Mock draft control strip — source selection + session status.
 * Provider adapters feed the shared Draft Engine; this panel only chooses
 * which adapter is armed. Does not implement grading/commentary/booth.
 *
 * RFSN-041 — compact layout only; behavior unchanged.
 */
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  liveDraftPhaseBadgeLabel,
  liveDraftStatusLines,
  resolveLiveDraftUiPhase,
  type LiveDraftUxStatusInput,
} from "@/lib/liveDraftUx";
import {
  type DraftControlSource,
  type LiveDraftSource,
  type MockDraftSource,
  normalizeDraftControlSource,
  normalizeLiveDraftSource,
  normalizeMockDraftSource,
} from "@/lib/liveDraftSource";
import {
  LIVE_DRAFT_SOURCES,
  MOCK_DRAFT_SOURCES,
} from "@shared/draftSource";

export type { LiveDraftSource, MockDraftSource, DraftControlSource };

export type LiveDraftControlStatus = {
  active: boolean;
  source: DraftControlSource;
  monitoring: boolean;
  boothOnAir: boolean;
  lockedCount: number;
  notifiedCount: number;
  draftComplete: boolean;
  lastError: string | null;
  lastPollAt: string | null;
  connectorReady: boolean;
  draftPaused?: boolean;
  /** When set, reconnect/status copy follows ESPN Mirror transport — not league-fetch. */
  transportKind?: "espn-mirror" | null;
  lastRevision?: number | null;
  connectorStatus?: string | null;
};

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
  /** live = real league; mock = RFSN local / FantasyPros / … */
  experience: "live" | "mock";
  status: LiveDraftControlStatus;
  onToggleActive: () => void;
  onSourceChange: (source: DraftControlSource) => void;
  sessionActions?: LiveDraftSessionActions | null;
};

function toUxInput(status: LiveDraftControlStatus): LiveDraftUxStatusInput {
  const source = normalizeDraftControlSource(status.source);
  return {
    active: status.active,
    source: source === "fantasypros" ? "manual" : source === "rfsn" ? "rfsn" : "espn",
    monitoring: status.monitoring,
    boothOnAir: status.boothOnAir,
    draftComplete: status.draftComplete,
    lastError: status.lastError,
    connectorReady: status.connectorReady,
    draftPaused: status.draftPaused,
    hasLockedPicks: status.lockedCount > 0,
    transportKind: status.transportKind ?? null,
    lastRevision: status.lastRevision ?? null,
    lockedCount: status.lockedCount,
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

function sourceDisplayLabel(source: DraftControlSource): string {
  if (source === "espn") return "ESPN";
  if (source === "fantasypros") return "FantasyPros";
  if (source === "rfsn") return "RFSN";
  return String(source);
}

function mirrorDisplayLabel(status: LiveDraftControlStatus): string {
  if (status.transportKind === "espn-mirror") {
    return status.connectorReady ? "Connected" : "Waiting";
  }
  if (normalizeDraftControlSource(status.source) === "espn") {
    return status.connectorReady ? "Connected" : "Waiting";
  }
  return "—";
}

function Metric({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="min-w-0" data-live-metric={testId ?? label.toLowerCase()}>
      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="truncate text-[11px] font-semibold text-zinc-100 tabular-nums">{value}</div>
    </div>
  );
}

export function LiveDraftControlPanel({
  experience,
  status,
  onToggleActive,
  onSourceChange,
  sessionActions = null,
}: Props) {
  const ux = toUxInput(status);
  const phase = resolveLiveDraftUiPhase(ux);
  const lines = liveDraftStatusLines(ux);
  const source = normalizeDraftControlSource(status.source);
  const isEspn = source === "espn";
  const isRfsnLocal = source === "rfsn";
  const catalog = experience === "live" ? LIVE_DRAFT_SOURCES : MOCK_DRAFT_SOURCES;
  const primaryStatus = lines[0] ?? liveDraftPhaseBadgeLabel(phase);

  return (
    <div
      className="mb-2 sticky top-16 z-10 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2 text-[11px] text-zinc-300 backdrop-blur-md"
      data-live-draft-control
      data-live-draft-ops
      data-draft-experience={experience}
      data-rfsn-013
      data-rfsn-024
      data-rfsn-041
      data-live-phase={phase}
      data-live-draft-source={source}
    >
      {/* Title + session power */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-black uppercase tracking-wider text-emerald-200 text-[11px]">
            {experience === "live" ? "Live Draft" : "Mock Draft"}
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
            "shrink-0 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border",
            status.active
              ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-200"
              : "border-zinc-600 text-zinc-400 hover:text-zinc-200",
          )}
          data-live-draft-power
        >
          {status.active ? "Session On" : "Session Off"}
        </button>
      </div>

      {/* Compact status card */}
      <div
        className="mt-1.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-1"
        data-live-compact-status
      >
        <Metric label="Status" value={primaryStatus} testId="status" />
        <Metric label="Source" value={sourceDisplayLabel(source)} testId="source" />
        <Metric label="Session" value={status.active ? "ON" : "OFF"} testId="session" />
        <Metric label="Mirror" value={mirrorDisplayLabel(status)} testId="mirror" />
        <Metric
          label="Picks Locked"
          value={
            status.active
              ? `${status.lockedCount}${
                  status.notifiedCount > 0 ? ` · covered ${status.notifiedCount}` : ""
                }`
              : "0"
          }
          testId="picks"
        />
      </div>

      {/* Source radios — single compact row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-live-source-picker>
        <span className="text-[9px] uppercase tracking-wider text-zinc-500">Draft source</span>
        {catalog.map((entry) => {
          const controlId: DraftControlSource =
            entry.id === "espn-live"
              ? "espn"
              : entry.id === "fantasypros-mock"
                ? "fantasypros"
                : entry.id === "rfsn-local-mock"
                  ? "rfsn"
                  : "espn";
          const checked =
            experience === "live"
              ? normalizeLiveDraftSource(source) === "espn" && entry.id === "espn-live"
              : normalizeMockDraftSource(source) === controlId ||
                (controlId === "rfsn" && source === "rfsn") ||
                (controlId === "fantasypros" && source === "fantasypros");
          return (
            <label
              key={entry.id}
              className={cn(
                "inline-flex items-center gap-1 text-[11px] text-zinc-200",
                entry.available ? "cursor-pointer" : "opacity-40 cursor-not-allowed",
              )}
            >
              <input
                type="radio"
                name={`draft-source-${experience}`}
                checked={Boolean(checked && entry.available)}
                disabled={!entry.available}
                onChange={() => {
                  if (!entry.available) return;
                  if (experience === "live") onSourceChange("espn");
                  else if (entry.id === "fantasypros-mock") onSourceChange("fantasypros");
                  else if (entry.id === "rfsn-local-mock") onSourceChange("rfsn");
                }}
                className="accent-emerald-400"
              />
              {entry.label}
              {!entry.available ? (
                <span className="text-[9px] uppercase text-zinc-600">Soon</span>
              ) : null}
            </label>
          );
        })}
      </div>

      {/* Primary actions / ESPN status chip */}
      {status.active && isRfsnLocal && sessionActions && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-live-session-actions>
          {sessionActions.canStart && (
            <button
              type="button"
              onClick={sessionActions.onStart}
              className="px-3 py-1 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300 text-[11px] font-black hover:bg-violet-500/25"
              data-live-action-start
            >
              ▶ Start Draft
            </button>
          )}
          {sessionActions.canResume && (
            <button
              type="button"
              onClick={sessionActions.onResume}
              className="px-3 py-1 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300 text-[11px] font-black hover:bg-violet-500/25"
              data-live-action-resume
            >
              ▶ Resume
            </button>
          )}
          {sessionActions.canPause && (
            <button
              type="button"
              onClick={sessionActions.onPause}
              className="px-3 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-black"
              data-live-action-pause
            >
              ⏸ Pause
            </button>
          )}
          {sessionActions.canNewDraft && (
            <button
              type="button"
              onClick={sessionActions.onNewDraft}
              className="px-2.5 py-1 rounded text-zinc-300 text-[11px] font-bold hover:text-zinc-100 border border-zinc-600"
              data-live-action-new
            >
              Start new draft
            </button>
          )}
          {sessionActions.canReset && (
            <button
              type="button"
              onClick={sessionActions.onReset}
              className="px-2.5 py-1 rounded text-zinc-400 text-[11px] hover:text-zinc-200 border border-zinc-700"
              data-live-action-reset
            >
              ↺ Reset
            </button>
          )}
          <span className="text-[10px] text-zinc-400 tabular-nums ml-0.5">
            {sessionActions.pickLabel}
          </span>
        </div>
      )}

      {status.active && isEspn && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2" data-live-espn-connect>
          <span
            className={cn(
              "px-2.5 py-1 rounded text-[11px] font-black border",
              status.connectorReady
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                : "bg-amber-500/10 border-amber-500/30 text-amber-200",
            )}
            data-live-espn-connect-badge
          >
            {status.transportKind === "espn-mirror"
              ? status.connectorReady
                ? "Connected to ESPN Mirror"
                : "Waiting for ESPN Mirror"
              : status.connectorReady
                ? "Connected to league draft"
                : "Waiting for league connection"}
          </span>
        </div>
      )}

      {status.lastError && (
        <div className="mt-1 text-[11px] text-amber-300" data-live-draft-error>
          {status.lastError}
        </div>
      )}

      {/* Diagnostics — collapsed by default */}
      <details
        className="group mt-1.5 border-t border-emerald-500/15 pt-1"
        data-live-advanced
      >
        <summary className="cursor-pointer list-none flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 select-none">
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
          Advanced
        </summary>
        <div className="mt-1.5 space-y-1.5 pb-0.5">
          <p className="text-[10px] text-zinc-500 leading-snug" data-live-board-driver>
            {isEspn
              ? status.transportKind === "espn-mirror"
                ? "Board driver: ESPN Mirror (bookmarklet) → extension transport → shared Draft Engine."
                : "Board driver: ESPN League feed → shared Draft Engine."
              : source === "fantasypros"
                ? "Board driver: FantasyPros Mock adapter → shared Draft Engine."
                : "Board driver: RFSN Local Mock adapter → shared Draft Engine."}
          </p>
          <div className="space-y-0.5" data-live-status-lines>
            {lines.map((line, i) => (
              <div
                key={`${i}:${line}`}
                className={cn(
                  i === 0
                    ? "text-[11px] font-bold text-zinc-200"
                    : "text-[10px] text-zinc-500",
                )}
              >
                {line}
              </div>
            ))}
          </div>
          {status.active && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-500 tabular-nums">
              <span>
                Picks locked {status.lockedCount}
                {status.notifiedCount > 0 ? ` · covered ${status.notifiedCount}` : ""}
                {status.transportKind === "espn-mirror" && status.lastRevision != null
                  ? ` · rev ${status.lastRevision}`
                  : ""}
              </span>
              {status.lastPollAt ? (
                <span>Updated {new Date(status.lastPollAt).toLocaleTimeString()}</span>
              ) : null}
              {status.connectorStatus ? (
                <span data-live-connector-status>Connector: {status.connectorStatus}</span>
              ) : null}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
