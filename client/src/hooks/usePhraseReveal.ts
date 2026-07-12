import { useEffect, useMemo, useState } from "react";
import { phraseRevealIntervalMs, splitCommentaryPhrases } from "@/lib/rfsnBroadcastProduction";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export function usePhraseReveal(text: string | undefined, active: boolean): {
  phrases: string[];
  visiblePhrases: string[];
  complete: boolean;
} {
  const reducedMotion = usePrefersReducedMotion();
  const phrases = useMemo(() => (text ? splitCommentaryPhrases(text) : []), [text]);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!active || !text) {
      setVisibleCount(0);
      return;
    }

    if (reducedMotion || phrases.length <= 1) {
      setVisibleCount(phrases.length);
      return;
    }

    setVisibleCount(1);
    const intervalMs = phraseRevealIntervalMs(phrases.length, reducedMotion);
    if (intervalMs <= 0) {
      setVisibleCount(phrases.length);
      return;
    }

    let count = 1;
    const timer = window.setInterval(() => {
      count += 1;
      setVisibleCount(count);
      if (count >= phrases.length) {
        window.clearInterval(timer);
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [active, text, phrases, reducedMotion]);

  const visiblePhrases = phrases.slice(0, visibleCount);
  return {
    phrases,
    visiblePhrases,
    complete: visibleCount >= phrases.length,
  };
}
