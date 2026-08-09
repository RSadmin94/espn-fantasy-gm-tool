import type { CSSProperties } from "react";
import { Mic, Radio, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RfsnCommentaryCard, RfsnCommentatorId } from "@/lib/rfsnPresentation";
import { COMMENTATOR_META } from "@/lib/rfsnPresentation";
import {
  type BoothCardState,
  BOOTH_PORTRAIT_WIDTH_PCT,
  analystOpacity,
  boothCardMinHeight,
  boothDismissLabel,
  boothPortraitMinHeight,
  boothStandbyLine,
  isCommentaryVisibleState,
} from "@/lib/rfsnBoothPresentation";
import { analystLiveIndicatorVisible, BOOTH_ENTER_ANIM_CLASS } from "@/lib/rfsnBroadcastProduction";
import { usePhraseReveal } from "@/hooks/usePhraseReveal";

export type RfsnAnalystBoothCardProps = {
  commentator: RfsnCommentatorId;
  cardState: BoothCardState;
  activeCommentator: RfsnCommentatorId | null;
  commentary: RfsnCommentaryCard | null;
  onDismiss?: () => void;
  layout?: "desktop" | "mobile-tab" | "mobile-expanded" | "mobile-standby";
  className?: string;
  /** Equalizer runs only when this card's HTMLAudioElement is playing. */
  audioIsSpeaking?: boolean;
};

function RfsnBrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("text-label font-black tracking-tight text-white/55", className)}>
      RFS<span className="text-red-500">N</span>
    </span>
  );
}

function Waveform({ active, className }: { active: boolean; className?: string }) {
  if (!active) return null;
  return (
    <div className={cn("flex items-end gap-0.5", className)} aria-hidden>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span
          key={i}
          className="rfsn-waveform-bar w-1 rounded-full bg-emerald-400/80 opacity-80"
          style={{ animationDelay: `${i * 0.09}s` }}
        />
      ))}
    </div>
  );
}

function BoothPortrait({
  commentator,
  isActiveSpeaker,
  illuminated,
  compact = false,
}: {
  commentator: RfsnCommentatorId;
  isActiveSpeaker: boolean;
  illuminated: boolean;
  compact?: boolean;
}) {
  const meta = COMMENTATOR_META[commentator];
  return (
    <div
      className={cn(
        "rfsn-booth-portrait relative shrink-0 self-stretch overflow-hidden rounded-sm border-[3px] bg-black/70 shadow-inner",
        meta.borderClass,
        compact ? "min-h-[7.5rem] w-[38%]" : boothPortraitMinHeight(commentator, isActiveSpeaker),
        !compact && "w-[var(--booth-portrait-w)]",
        illuminated && meta.boothGlowClass,
      )}
      style={
        compact
          ? undefined
          : ({ ["--booth-portrait-w" as string]: `${BOOTH_PORTRAIT_WIDTH_PCT}%` } as CSSProperties)
      }
      aria-hidden
    >
      {meta.portrait ? (
        <img
          src={meta.portrait}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: meta.portraitPosition ?? "center 16%" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-end justify-center pb-4 font-black uppercase",
            meta.accentClass,
            compact ? "text-3xl" : "text-4xl",
          )}
        >
          {meta.displayName[0]}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/35 via-transparent to-white/[0.04]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
    </div>
  );
}

function FullBoothCard({
  commentator,
  cardState,
  activeCommentator,
  commentary,
  onDismiss,
  compact = false,
  className,
  audioIsSpeaking = false,
}: Omit<RfsnAnalystBoothCardProps, "layout"> & { compact?: boolean }) {
  const meta = COMMENTATOR_META[commentator];
  const isActiveSpeaker = activeCommentator === commentator;
  const isSpeaking = isActiveSpeaker && (cardState === "active" || cardState === "entering");
  const showEqualizer = Boolean(audioIsSpeaking && isActiveSpeaker && cardState === "active");
  const showText = Boolean(commentary && isCommentaryVisibleState(cardState) && isActiveSpeaker);
  const opacity = analystOpacity(commentator, activeCommentator, cardState);
  const liveIndicator = analystLiveIndicatorVisible(isActiveSpeaker, cardState);
  const { visiblePhrases } = usePhraseReveal(
    showText ? commentary?.text : undefined,
    Boolean(showText && cardState === "active"),
  );
  const segmentLabel = showText && commentary ? commentary.label : meta.role;
  const entering = cardState === "entering" && isActiveSpeaker;
  const ariaLive = isActiveSpeaker && cardState === "active" ? "polite" : "off";

  return (
    <article
      className={cn(
        "rfsn-booth-card relative flex flex-col overflow-hidden rounded-md border-[3px] transition-all duration-500 ease-out",
        meta.borderClass,
        meta.bgClass,
        boothCardMinHeight(commentator, isSpeaking),
        isSpeaking && cn("rfsn-booth-card--active z-10", meta.boothGlowClass),
        !isSpeaking && "rfsn-booth-card--standby",
        cardState === "dismissing" && "opacity-95",
        entering && BOOTH_ENTER_ANIM_CLASS,
        className,
      )}
      style={{ opacity }}
      aria-label={`${meta.displayName} analyst booth`}
      data-booth-card={commentator}
      data-booth-state={cardState}
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.08] bg-black/50 px-3 py-2">
        <RfsnBrandMark />
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {liveIndicator && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-red-600 px-1.5 py-0.5 text-2xs font-black uppercase tracking-wider text-white shadow-[0_0_12px_rgba(220,38,38,0.45)]">
              <Radio className="h-2.5 w-2.5 rfsn-mic-live" aria-hidden />
              Live
            </span>
          )}
          <span
            className={cn(
              "truncate font-black uppercase tracking-[0.14em]",
              meta.accentClass,
              compact ? "text-base" : "text-lg md:text-xl",
            )}
          >
            {meta.displayName}
          </span>
          {showText && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white"
              aria-label={boothDismissLabel(commentator)}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className={cn("flex min-h-0 flex-1 gap-3 px-3 py-3", compact && "gap-2 px-2.5 py-2")}>
        <BoothPortrait
          commentator={commentator}
          isActiveSpeaker={isSpeaking}
          illuminated={liveIndicator}
          compact={compact}
        />

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-0.5">
          <div
            className={cn(
              "transition-opacity duration-500",
              cardState === "dismissing" && showText && "opacity-0",
            )}
            aria-live={ariaLive}
          >
            {showText && commentary ? (
              <p
                className={cn(
                  "font-medium leading-[1.68] tracking-[0.01em] text-white/95",
                  compact ? "text-[13px] line-clamp-5" : "text-[15px] md:text-base line-clamp-6",
                )}
              >
                {visiblePhrases.map((phrase, i) => (
                  <span key={`${commentary.id}-${i}`} className={cn(i > 0 && "rfsn-phrase-in")}>
                    {i > 0 ? " " : ""}
                    {phrase}
                  </span>
                ))}
              </p>
            ) : (
              <p
                className={cn(
                  "font-medium italic leading-[1.6] text-white/42",
                  compact ? "text-xs" : "text-sm",
                )}
              >
                {boothStandbyLine(commentator)}
              </p>
            )}
          </div>
          <Waveform active={showEqualizer} />
        </div>
      </div>

      <footer className="border-t border-white/[0.08] bg-gradient-to-r from-black/60 via-black/40 to-black/60 px-3 py-2">
        <p
          className={cn(
            "text-label font-black uppercase tracking-[0.24em]",
            meta.segmentClass,
          )}
        >
          {segmentLabel}
        </p>
      </footer>

      {showEqualizer && (
        <span className="sr-only">{meta.displayName} is speaking</span>
      )}
    </article>
  );
}

export function RfsnAnalystBoothCard({
  commentator,
  cardState,
  activeCommentator,
  commentary,
  onDismiss,
  layout = "desktop",
  className,
  audioIsSpeaking = false,
}: RfsnAnalystBoothCardProps) {
  const meta = COMMENTATOR_META[commentator];
  const isActiveSpeaker = activeCommentator === commentator;

  if (layout === "mobile-tab") {
    return (
      <button
        type="button"
        className={cn(
          "relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-[3px] transition-all",
          meta.borderClass,
          isActiveSpeaker && cn("scale-105 ring-2 ring-white/30", meta.boothGlowClass),
          className,
        )}
        aria-current={isActiveSpeaker ? "true" : undefined}
        aria-label={`${meta.displayName}${audioIsSpeaking ? ", speaking" : isActiveSpeaker ? ", on air" : ", standby"}`}
      >
        {meta.portrait ? (
          <img
            src={meta.portrait}
            alt=""
            className="h-full w-full object-cover"
            style={{ objectPosition: meta.portraitPosition ?? "center 16%" }}
          />
        ) : (
          <span className={cn("flex h-full w-full items-center justify-center text-xl font-black", meta.accentClass)}>
            {meta.displayName[0]}
          </span>
        )}
      </button>
    );
  }

  return (
    <FullBoothCard
      commentator={commentator}
      cardState={cardState}
      activeCommentator={activeCommentator}
      commentary={commentary}
      onDismiss={onDismiss}
      compact={layout === "mobile-expanded" || layout === "mobile-standby"}
      className={className}
      audioIsSpeaking={audioIsSpeaking}
    />
  );
}
