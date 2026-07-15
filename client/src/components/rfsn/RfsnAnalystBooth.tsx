import { cn } from "@/lib/utils";
import type { RfsnCommentaryCard, RfsnCommentatorId } from "@/lib/rfsnPresentation";
import { BOOTH_ANALYST_ORDER, type BoothCardState } from "@/lib/rfsnBoothPresentation";
import { RfsnAnalystBoothCard } from "./RfsnAnalystBoothCard";

export type RfsnAnalystBoothProps = {
  cardStates: Record<RfsnCommentatorId, BoothCardState>;
  activeCommentator: RfsnCommentatorId | null;
  activeCard: RfsnCommentaryCard | null;
  sequence: RfsnCommentaryCard[];
  onDismiss: (commentator: RfsnCommentatorId) => void;
  layout?: "desktop" | "mobile";
  className?: string;
  /** True only while HTMLAudioElement is actively playing for the booth speaker. */
  audioIsSpeaking?: boolean;
};

function commentaryForAnalyst(
  commentator: RfsnCommentatorId,
  sequence: RfsnCommentaryCard[],
  activeCard: RfsnCommentaryCard | null,
): RfsnCommentaryCard | null {
  if (activeCard?.commentator === commentator) return activeCard;
  return sequence.find((c) => c.commentator === commentator) ?? null;
}

export function RfsnAnalystBooth({
  cardStates,
  activeCommentator,
  activeCard,
  sequence,
  onDismiss,
  layout = "desktop",
  className,
  audioIsSpeaking = false,
}: RfsnAnalystBoothProps) {
  const isMobile = layout === "mobile";

  if (isMobile) {
    if (activeCommentator) {
      return (
        <div className={cn("flex flex-col gap-2", className)} aria-label="Analyst booth">
          <div className="flex items-center justify-center gap-2.5">
            {BOOTH_ANALYST_ORDER.map((id) => (
              <RfsnAnalystBoothCard
                key={id}
                commentator={id}
                cardState={cardStates[id]}
                activeCommentator={activeCommentator}
                commentary={commentaryForAnalyst(id, sequence, activeCard)}
                layout="mobile-tab"
                audioIsSpeaking={audioIsSpeaking && id === activeCommentator}
              />
            ))}
          </div>
          <div className="rfsn-booth-desk rounded-lg p-2">
            <RfsnAnalystBoothCard
              commentator={activeCommentator}
              cardState={cardStates[activeCommentator]}
              activeCommentator={activeCommentator}
              commentary={activeCard}
              onDismiss={() => onDismiss(activeCommentator)}
              layout="mobile-expanded"
              audioIsSpeaking={audioIsSpeaking}
            />
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn("rfsn-booth-desk flex flex-col gap-1.5 rounded-lg p-2", className)}
        aria-label="Analyst booth"
        role="group"
      >
        {BOOTH_ANALYST_ORDER.map((id) => (
          <RfsnAnalystBoothCard
            key={id}
            commentator={id}
            cardState={cardStates[id]}
            activeCommentator={activeCommentator}
            commentary={commentaryForAnalyst(id, sequence, activeCard)}
            layout="mobile-standby"
            audioIsSpeaking={false}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("rfsn-booth-desk flex min-h-0 flex-1 flex-col gap-1.5", className)}
      aria-label="Analyst booth"
      role="group"
      data-rfsn-focus-target
    >
      {BOOTH_ANALYST_ORDER.map((id) => (
        <RfsnAnalystBoothCard
          key={id}
          commentator={id}
          cardState={cardStates[id]}
          activeCommentator={activeCommentator}
          commentary={commentaryForAnalyst(id, sequence, activeCard)}
          onDismiss={() => onDismiss(id)}
          layout="desktop"
          audioIsSpeaking={audioIsSpeaking && id === activeCommentator}
        />
      ))}
    </div>
  );
}
