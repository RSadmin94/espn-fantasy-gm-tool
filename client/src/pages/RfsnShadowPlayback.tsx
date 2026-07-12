import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";
import { RfsnBroadcastShell } from "@/components/rfsn";
import {
  type RfsnBroadcastSnapshot,
  type RfsnFixtureScenario,
  fixtureForScenario,
  resolveLayoutMode,
} from "@/lib/rfsnPresentation";
import {
  type RfsnPlaybackBundle,
  type RfsnPlaybackSource,
  RFSN_PLAYBACK_SOURCES,
  isDevPlaybackEnabled,
  parsePlaybackBundle,
  playbackBundleUrl,
} from "@/lib/rfsnPlaybackTypes";
import { cn } from "@/lib/utils";

const FIXTURE_KEYS: RfsnFixtureScenario[] = [
  "routine_pick",
  "notable_pick",
  "major_pick",
  "historic_pick",
  "position_run",
  "league_storyline",
];

function readFixtureParam(): RfsnFixtureScenario | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("fixture");
  if (!param) return null;
  return FIXTURE_KEYS.includes(param as RfsnFixtureScenario)
    ? (param as RfsnFixtureScenario)
    : null;
}

export function RfsnShadowPlayback() {
  const fixtureScenario = useMemo(() => readFixtureParam(), []);
  const [source, setSource] = useState<RfsnPlaybackSource>("scenario");
  const [bundle, setBundle] = useState<RfsnPlaybackBundle | null>(null);
  const [fixtureSnapshot, setFixtureSnapshot] = useState<RfsnBroadcastSnapshot | null>(() =>
    fixtureScenario ? fixtureForScenario(fixtureScenario) : null,
  );
  const [index, setIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [forceMobile, setForceMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("mobile") === "1";
  });
  const [devOpen, setDevOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );

  const enabled = isDevPlaybackEnabled();

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const loadSource = useCallback(async (next: RfsnPlaybackSource) => {
    setLoadError(null);
    try {
      const res = await fetch(playbackBundleUrl(next));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = parsePlaybackBundle(await res.json());
      setBundle(data);
      setSource(next);
      setIndex(0);
      setAutoPlay(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (!enabled || fixtureScenario) return;
    void loadSource("scenario");
  }, [enabled, loadSource, fixtureScenario]);

  const moment = bundle?.moments[index];
  const snapshot = fixtureSnapshot ?? moment?.snapshot;
  const layout = useMemo(() => {
    if (forceMobile) return "mobile" as const;
    return resolveLayoutMode(viewportWidth);
  }, [forceMobile, viewportWidth]);

  useEffect(() => {
    if (!autoPlay || !bundle || fixtureScenario) return;
    const timer = window.setTimeout(() => {
      setIndex((i) => {
        if (i >= bundle.moments.length - 1) {
          setAutoPlay(false);
          return i;
        }
        return i + 1;
      });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [autoPlay, index, bundle, fixtureScenario]);

  if (!enabled) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        RFSN shadow playback is only available in development builds.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020204]" data-rfsn-shadow-playback>
      {!fixtureScenario && (
        <div className="sticky top-0 z-50 border-b border-amber-500/20 bg-[#0a0a0e]/95 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setDevOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-amber-200/80 hover:bg-amber-500/5"
          >
            <span className="inline-flex items-center gap-2 font-semibold uppercase tracking-wider">
              <Wrench className="h-3.5 w-3.5" aria-hidden />
              Developer controls
            </span>
            {devOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {devOpen && (
            <div className="border-t border-amber-500/15 px-3 py-3 text-xs">
              <p className="mb-2 text-muted-foreground">
                Standalone dev entry. Export with{" "}
                <code className="text-[10px]">pnpm exec tsx scripts/_export_rfsn_playback.mts</code>
              </p>
              <div className="flex flex-wrap gap-2">
                {RFSN_PLAYBACK_SOURCES.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void loadSource(key)}
                    className={cn(
                      "rounded-md border px-2 py-1 transition-colors",
                      source === key
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  className="rounded-md border px-2 py-1 hover:bg-muted"
                  disabled={!bundle || index === 0}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.min((bundle?.moments.length ?? 1) - 1, i + 1))}
                  className="rounded-md border px-2 py-1 hover:bg-muted"
                  disabled={!bundle || index >= (bundle?.moments.length ?? 1) - 1}
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => setAutoPlay((v) => !v)}
                  className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
                  disabled={!bundle}
                >
                  {autoPlay ? "Pause" : "Autoplay"}
                </button>
                <button
                  type="button"
                  onClick={() => { setIndex(0); setAutoPlay(false); }}
                  className="rounded-md border px-2 py-1 hover:bg-muted"
                  disabled={!bundle}
                >
                  Reset
                </button>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={forceMobile} onChange={(e) => setForceMobile(e.target.checked)} />
                  Force mobile
                </label>
                {bundle && (
                  <span className="text-muted-foreground">
                    Pick {index + 1} / {bundle.moments.length}
                  </span>
                )}
              </div>
              {moment && (
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                  {moment.pickId} · plan {moment.editorialPlanId} · {moment.diagnostic.sourceLevel} ·{" "}
                  {moment.diagnostic.commentedOrSilent} · lead {moment.diagnostic.frameLeadVoice ?? "—"} →{" "}
                  {moment.diagnostic.snapshotPrimary ?? "—"}
                </p>
              )}
              {loadError && (
                <p className="mt-2 text-destructive">Failed to load bundle: {loadError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {snapshot && (
        <RfsnBroadcastShell
          snapshot={snapshot}
          layout={layout}
        />
      )}
    </div>
  );
}
