/**
 * RFSN-053H — Narration under Story / Viewer / Share Card. Does not change card layout.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { SPACE_CARD, SPACE_CHIP, SPACE_CHIP_GAP } from "@/lib/density";
import {
  NARRATION_VOICE_PROFILES,
  NARRATION_EXPORT_ERROR,
  type HistoricalNarration,
} from "@shared/historicalNarration";
import {
  NARRATION_VOICES,
  type HistoricalStoryPackage,
  type NarrationVoice,
} from "@shared/historicalStoryPackage";

export function HistoricalNarrationPanel({
  storyPackage,
  narration: initial,
  defaultVoice = "sofia",
  readOnly = false,
}: {
  storyPackage?: HistoricalStoryPackage | null;
  narration?: HistoricalNarration | null;
  defaultVoice?: NarrationVoice;
  readOnly?: boolean;
}) {
  const [voice, setVoice] = useState<NarrationVoice>(initial?.voice ?? defaultVoice);
  const [narration, setNarration] = useState<HistoricalNarration | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canGenerate = Boolean(storyPackage) && !readOnly;
  const display = narration ?? initial ?? null;

  const onGenerate = async () => {
    if (!storyPackage || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/trpc/historicalNarration.narrate", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { package: storyPackage, voice } }),
      });
      type NarrationPayload = {
        ok?: boolean;
        error?: string | null;
        narration?: HistoricalNarration | null;
      };
      const raw = (await res.json().catch(() => null)) as unknown;
      let payload: NarrationPayload | null = null;
      if (raw && typeof raw === "object") {
        const wrapped = (raw as { result?: { data?: { json?: NarrationPayload } } }).result?.data?.json;
        if (wrapped && typeof wrapped === "object") payload = wrapped;
        else if ("ok" in raw || "narration" in raw) payload = raw as NarrationPayload;
      }
      if (!payload?.ok || !payload.narration) {
        setNarration(null);
        setError(payload?.error || NARRATION_EXPORT_ERROR);
        return;
      }
      setNarration(payload.narration);
    } catch {
      setNarration(null);
      setError(NARRATION_EXPORT_ERROR);
    } finally {
      setPending(false);
    }
  };

  const voiceLabel = useMemo(() => NARRATION_VOICE_PROFILES[display?.voice ?? voice].label, [display?.voice, voice]);

  return (
    <section
      data-rfsn-053h
      data-historical-narration
      data-narration-voice={display?.voice ?? voice}
      className={cn("rounded-xl border border-border bg-card", SPACE_CARD)}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Story</h2>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{voiceLabel}</span>
      </div>

      {!readOnly ? (
        <div className={cn("mb-3 flex flex-wrap items-center", SPACE_CHIP_GAP)} aria-label="Narration voice">
          {NARRATION_VOICES.map((id) => {
            const pressed = voice === id;
            return (
              <button
                key={id}
                type="button"
                data-narration-voice-chip={id}
                aria-pressed={pressed}
                onClick={() => setVoice(id)}
                className={cn(
                  "inline-flex h-8 items-center rounded-md text-xs font-semibold",
                  SPACE_CHIP,
                  pressed
                    ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                    : "border border-border text-foreground hover:bg-muted/40",
                )}
              >
                {NARRATION_VOICE_PROFILES[id].label}
              </button>
            );
          })}
          {canGenerate ? (
            <button
              type="button"
              data-narration-generate
              disabled={pending}
              onClick={() => void onGenerate()}
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Narrating…" : display ? "Regenerate" : "Narrate"}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p data-narration-error className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {display ? (
        <div data-narration-body className="space-y-2">
          <h3 data-narration-headline className="text-lg font-bold text-foreground sm:text-xl">
            {display.headline}
          </h3>
          {display.subheadline ? (
            <p data-narration-subheadline className="text-sm font-semibold text-muted-foreground">
              {display.subheadline}
            </p>
          ) : null}
          <p data-narration-intro className="text-sm text-foreground">
            {display.intro}
          </p>
          <p data-narration-story className="text-sm leading-relaxed text-foreground">
            {display.story}
          </p>
          <p data-narration-closing className="text-sm font-semibold text-foreground">
            {display.closing}
          </p>
          {display.quote ? (
            <blockquote data-narration-quote className="border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
              {display.quote}
            </blockquote>
          ) : null}
        </div>
      ) : !error ? (
        <p className="text-sm text-muted-foreground">
          Narration uses only recorded Story Collection and matchup facts. Voice changes style, not numbers.
        </p>
      ) : null}
    </section>
  );
}
