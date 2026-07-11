import { useCallback, useEffect, useMemo, useState } from "react";
import { RfsnBroadcastShell } from "@/components/rfsn";
import {
  type RfsnBroadcastPhase,
  type RfsnBroadcastSnapshot,
  type RfsnFixtureScenario,
  FIXTURE_SCENARIO_LABELS,
  RFSN_PHASE_BEAT_MS,
  RFSN_PHASE_PRIMARY_MS,
  RFSN_PHASE_SECONDARY_MS,
  applyQueuedMoment,
  commentaryVisibleForPhase,
  dequeueNextMoment,
  fixtureForScenario,
  nextBroadcastPhase,
  resolveLayoutMode,
} from "@/lib/rfsnPresentation";
import { cn } from "@/lib/utils";

const ALL_SCENARIOS = Object.keys(FIXTURE_SCENARIO_LABELS) as RfsnFixtureScenario[];

function readInitialScenario(): RfsnFixtureScenario {
  if (typeof window === "undefined") return "major_pick";
  const param = new URLSearchParams(window.location.search).get("scenario");
  if (param && param in FIXTURE_SCENARIO_LABELS) return param as RfsnFixtureScenario;
  return "major_pick";
}

function initialPhaseForFixture(fixture: RfsnBroadcastSnapshot): RfsnBroadcastPhase {
  if (!fixture.primary) return "idle";
  if (fixture.secondary) return "secondary_in";
  return "primary_in";
}

function readChromeHidden(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("chrome") === "0";
}

function readForceMobile(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("mobile") === "1" || params.get("scenario") === "mobile_narrow";
}

function phaseDelay(phase: RfsnBroadcastPhase, hasSecondary: boolean): number {
  switch (phase) {
    case "beat":
      return RFSN_PHASE_BEAT_MS;
    case "primary_in":
      return RFSN_PHASE_PRIMARY_MS;
    case "secondary_in":
      return RFSN_PHASE_SECONDARY_MS;
    case "exiting":
      return hasSecondary ? 400 : 300;
  }
  return 350;
}

export function RfsnPrototype() {
  const [scenario, setScenario] = useState<RfsnFixtureScenario>(readInitialScenario);
  const [snapshot, setSnapshot] = useState<RfsnBroadcastSnapshot>(() =>
    fixtureForScenario(readInitialScenario()),
  );
  const [phase, setPhase] = useState<RfsnBroadcastPhase>(() =>
    initialPhaseForFixture(fixtureForScenario(readInitialScenario())),
  );
  const [autoPlay, setAutoPlay] = useState(false);
  const [forceMobile, setForceMobile] = useState(readForceMobile);
  const [hideChrome, setHideChrome] = useState(readChromeHidden);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const layout = useMemo(() => {
    if (forceMobile || scenario === "mobile_narrow") return "mobile" as const;
    return resolveLayoutMode(viewportWidth);
  }, [forceMobile, scenario, viewportWidth]);

  const loadScenario = useCallback((next: RfsnFixtureScenario) => {
    setScenario(next);
    const fixture = fixtureForScenario(next);
    setSnapshot(fixture);
    setPhase(initialPhaseForFixture(fixture));
    setAutoPlay(false);
  }, []);

  const runPickSequence = useCallback(() => {
    const fixture = fixtureForScenario(scenario);
    setSnapshot({ ...fixture, primary: undefined, secondary: undefined });
    setPhase("pick_locked");
    setAutoPlay(true);
  }, [scenario]);

  useEffect(() => {
    if (!autoPlay) return;

    const fixture = fixtureForScenario(scenario);
    const hasSecondary = Boolean(fixture.secondary);
    const hasPrimary = Boolean(fixture.primary);
    const delay = phaseDelay(phase, hasSecondary);

    const timer = window.setTimeout(() => {
      if (phase === "pick_locked") {
        setSnapshot(fixture);
      }

      if (phase === "beat" && !hasPrimary) {
        setAutoPlay(false);
        setPhase("idle");
        return;
      }

      const next = nextBroadcastPhase(phase, hasSecondary);

      if (phase === "exiting") {
        setAutoPlay(false);
        setPhase("idle");
        setSnapshot((prev) => {
          const { next: queued, remaining } = dequeueNextMoment(prev.queue);
          if (queued) {
            return { ...applyQueuedMoment(prev, queued), queue: remaining };
          }
          return {
            ...prev,
            primary: undefined,
            secondary: undefined,
            ticker: [
              ...prev.ticker,
              ...(prev.secondary
                ? [
                    {
                      id: `t-${Date.now()}`,
                      commentator: prev.secondary.commentator,
                      text: prev.secondary.text.slice(0, 60),
                    },
                  ]
                : []),
            ],
          };
        });
        return;
      }

      setPhase(next);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [autoPlay, phase, scenario]);

  const dismissPrimary = useCallback(() => {
    setSnapshot((prev) => ({ ...prev, primary: undefined }));
    if (!snapshot.secondary) setPhase("idle");
  }, [snapshot.secondary]);

  const dismissSecondary = useCallback(() => {
    setSnapshot((prev) => ({ ...prev, secondary: undefined }));
    setPhase("idle");
  }, []);

  const phaseLabel = phase.replace(/_/g, " ");

  return (
    <div className="min-h-screen bg-background" data-rfsn-prototype>
      {!hideChrome && (
        <div className="border-b border-border bg-card px-4 py-3">
          <h1 className="text-lg font-bold">RFSN Presentation Prototype</h1>
          <p className="text-sm text-muted-foreground">
            Isolated harness — not registered as a production route. Draft board stays primary;
            commentary uses one primary and at most one secondary card.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ALL_SCENARIOS.map((key) => (
              <button
                key={key}
                type="button"
                data-scenario={key}
                onClick={() => loadScenario(key)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs transition-colors",
                  scenario === key
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border hover:bg-muted",
                )}
              >
                {FIXTURE_SCENARIO_LABELS[key]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={runPickSequence}
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
            >
              Simulate pick sequence
            </button>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={forceMobile}
                onChange={(e) => setForceMobile(e.target.checked)}
              />
              Force mobile layout
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={hideChrome}
                onChange={(e) => setHideChrome(e.target.checked)}
              />
              Hide harness chrome
            </label>
            <span className="text-muted-foreground">
              Phase: <span className="font-mono text-foreground">{phaseLabel}</span>
            </span>
            <span className="text-muted-foreground">
              Primary visible:{" "}
              {commentaryVisibleForPhase(phase, "primary") && snapshot.primary ? "yes" : "no"}
            </span>
            <span className="text-muted-foreground">
              Secondary visible:{" "}
              {commentaryVisibleForPhase(phase, "secondary") && snapshot.secondary ? "yes" : "no"}
            </span>
          </div>
        </div>
      )}

      <div data-rfsn-shell>
        <RfsnBroadcastShell
          snapshot={snapshot}
          layout={layout}
          phase={phase}
          onDismissPrimary={dismissPrimary}
          onDismissSecondary={dismissSecondary}
        />
      </div>
    </div>
  );
}
