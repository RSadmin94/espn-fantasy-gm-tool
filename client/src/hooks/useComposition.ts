import * as React from "react";

interface UseCompositionOptions<T extends HTMLElement> {
  onKeyDown?: (e: React.KeyboardEvent<T>) => void;
  onCompositionStart?: (e: React.CompositionEvent<T>) => void;
  onCompositionEnd?: (e: React.CompositionEvent<T>) => void;
}

interface UseCompositionResult<T extends HTMLElement> {
  onKeyDown: (e: React.KeyboardEvent<T>) => void;
  onCompositionStart: (e: React.CompositionEvent<T>) => void;
  onCompositionEnd: (e: React.CompositionEvent<T>) => void;
  isComposing: boolean;
}

export function useComposition<T extends HTMLElement>(
  options: UseCompositionOptions<T> = {}
): UseCompositionResult<T> {
  const [isComposing, setIsComposing] = React.useState(false);

  const onCompositionStart = (e: React.CompositionEvent<T>) => {
    setIsComposing(true);
    options.onCompositionStart?.(e);
  };

  const onCompositionEnd = (e: React.CompositionEvent<T>) => {
    setIsComposing(false);
    options.onCompositionEnd?.(e);
  };

  const onKeyDown = (e: React.KeyboardEvent<T>) => {
    options.onKeyDown?.(e);
  };

  return { onKeyDown, onCompositionStart, onCompositionEnd, isComposing };
}
