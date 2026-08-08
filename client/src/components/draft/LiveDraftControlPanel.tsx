/**
 * Live / Mock draft control strip — source selection + session status.
 * Provider adapters feed the shared Draft Engine; this panel only chooses
 * which adapter is armed. Does not implement grading/commentary/booth.
 *
 * RFSN-041 — compact dashboard layout only; behavior unchanged.
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

/** Secondary instructional lines — not shown in the primary dashboard. */
const HIDDEN_PRIMARY_EXPLANATIONS = new Set([
  "Live Draft will resume when the Mirror recovers",
  "Live Draft will resume when the feed recovers",
  "Keep the ESPN draft tab open — extension injects Board Mirror",
  "Turn on Live Draft to open the booth",
]);

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

function InlineMetric({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div
      className="inline-flex items-baseline gap-1.5 min-w-0"
      data-live-metric={testId ?? label.toLowerCase()}
    >
      <span className="text-[9px] font-bold uppercase tracking-wider text-ink-secondary shrink-0">
        {label}
      </span>
      <span className="truncate text-[11px] font-semibold text-zinc-100 tabular-nums">
        {value}
      </span>
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
  /** Short phase label for the dashboard (not the long instructional stack). */
  const primaryStatus = liveDraftPhaseBadgeLabel(phase);
  const advancedLines = lines.filter((line) => !HIDDEN_PRIMARY_EXPLANATIONS.has(line));

  return (
    <div
      className="mb-1.5 sticky top-16 z-10 rounded-md border border-emerald-500/25 bg-emerald-500/[0.04] px-2 py-1.5 text-[11px] text-zinc-300 backdrop-blur-md"
      data-live-draft-control
      data-live-draft-ops
      data-draft-experience={experience}
      data-rfsn-013
      data-rfsn-024
      data-rfsn-041
      data-live-phase={phase}
      data-live-draft-source={source}
    >
      {/* Title + session power — one row */}
      <div className="flex items-center justify-between gap-2">
        <div className="font-black uppercase tracking-wider text-emerald-200 text-[10px]">
          {experience === "live" ? "Live Draft Control" : "Mock Draft Control"}
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

      {/* Dashboard metrics — single dense wrap row */}
      <div
        className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5"
        data-live-compact-status
      >
        <InlineMetric label="Status" value={primaryStatus} testId="status" />
        <InlineMetric label="Mirror" value={mirrorDisplayLabel(status)} testId="mirror" />
        <InlineMetric label="Session" value={status.active ? "ON" : "OFF"} testId="session" />
        <InlineMetric label="Source" value={sourceDisplayLabel(source)} testId="source" />
        <InlineMetric
          label="Picks"
          value={String(status.active ? status.lockedCount : 0)}
          testId="picks"
        />
        <span className="sr-only" data-live-phase-badge>
          {primaryStatus}
        </span>
      </div>

      {/* Primary chip + timestamp on one row */}
      {status.active && isEspn && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5" data-live-espn-connect>
          <span
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-black border",
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
          {status.lastPollAt ? (
            <span className="text-[10px] text-ink-secondary tabular-nums">
              Updated {new Date(status.lastPollAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      )}

      {status.active && isRfsnLocal && sessionActions && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5" data-live-session-actions>
          {sessionActions.canStart && (
            <button
              type="button"
              onClick={sessionActions.onStart}
              className="px-2.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300 text-[10px] font-black hover:bg-violet-500/25"
              data-live-action-start
            >
              ▶ Start Draft
            </button>
          )}
          {sessionActions.canResume && (
            <button
              type="button"
              onClick={sessionActions.onResume}
              className="px-2.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300 text-[10px] font-black hover:bg-violet-500/25"
              data-live-action-resume
            >
              ▶ Resume
            </button>
          )}
          {sessionActions.canPause && (
            <button
              type="button"
              onClick={sessionActions.onPause}
              className="px-2.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-black"
              data-live-action-pause
            >
              ⏸ Pause
            </button>
          )}
          {sessionActions.canNewDraft && (
            <button
              type="button"
              onClick={sessionActions.onNewDraft}
              className="px-2 py-0.5 rounded text-zinc-300 text-[10px] font-bold hover:text-zinc-100 border border-zinc-600"
              data-live-action-new
            >
              Start new draft
            </button>
          )}
          {sessionActions.canReset && (
            <button
              type="button"
              onClick={sessionActions.onReset}
              className="px-2 py-0.5 rounded text-zinc-400 text-[10px] hover:text-zinc-200 border border-zinc-700"
              data-live-action-reset
            >
              ↺ Reset
            </button>
          )}
          <span className="text-[10px] text-zinc-400 tabular-nums">
            {sessionActions.pickLabel}
          </span>
        </div>
      )}

      {/* Diagnostics — collapsed; board driver, source radios, errors, detail lines */}
      <details className="group mt-1 border-t border-emerald-500/10 pt-0.5" data-live-advanced>
        <summary className="cursor-pointer list-none inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-ink-secondary hover:text-zinc-300 select-none">
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
          Advanced
        </summary>
        <div className="mt-1 space-y-1 pb-0.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-live-source-picker>
            <span className="text-[9px] uppercase tracking-wider text-ink-secondary">Draft source</span>
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
                    "inline-flex items-center gap-1 text-[10px] text-zinc-200",
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
                    <span className="text-[9px] uppercase text-ink-tertiary">Soon</span>
                  ) : null}
                </label>
              );
            })}
          </div>

          <p className="text-[10px] text-ink-secondary leading-snug" data-live-board-driver>
            {isEspn
              ? status.transportKind === "espn-mirror"
                ? "Board driver: ESPN Mirror (bookmarklet) → extension transport → shared Draft Engine."
                : "Board driver: ESPN League feed → shared Draft Engine."
              : source === "fantasypros"
                ? "Board driver: FantasyPros Mock adapter → shared Draft Engine."
                : "Board driver: RFSN Local Mock adapter → shared Draft Engine."}
          </p>

          <div className="space-y-0.5" data-live-status-lines>
            {advancedLines.map((line, i) => (
              <div
                key={`${i}:${line}`}
                className={cn(
                  i === 0 ? "text-[10px] font-semibold text-zinc-300" : "text-[10px] text-ink-secondary",
                )}
              >
                {line}
              </div>
            ))}
          </div>

          {status.active && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-ink-secondary tabular-nums">
              <span>
                Picks locked {status.lockedCount}
                {status.notifiedCount > 0 ? ` · covered ${status.notifiedCount}` : ""}
                {status.transportKind === "espn-mirror" && status.lastRevision != null
                  ? ` · rev ${status.lastRevision}`
                  : ""}
              </span>
              {status.connectorStatus ? (
                <span data-live-connector-status>Connector: {status.connectorStatus}</span>
              ) : null}
            </div>
          )}

          {status.lastError ? (
            <div className="text-[10px] text-amber-300/90 font-mono" data-live-draft-error>
              {status.lastError}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
