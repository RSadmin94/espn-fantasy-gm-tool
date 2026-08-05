import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ConnectStepTone = "neutral" | "success" | "warning";

/**
 * The one shape every connect screen takes: a mark, a headline, a single line of plain language,
 * one primary action, one way back. Anything that doesn't fit here doesn't belong on this page.
 */
export function ConnectStepCard({
  tone = "neutral",
  mark,
  headline,
  message,
  children,
  primary,
  secondary,
  footer,
}: {
  tone?: ConnectStepTone;
  mark?: ReactNode;
  headline: string;
  message?: string;
  children?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card/60 px-6 py-10 sm:px-10 sm:py-12",
        tone === "success"
          ? "border-lime-500/30"
          : tone === "warning"
            ? "border-amber-500/30"
            : "border-border/70",
      )}
    >
      <div className="mx-auto flex max-w-sm flex-col items-center text-center">
        {mark && <div className="mb-6">{mark}</div>}

        <h1 className="text-balance text-2xl font-bold leading-tight text-foreground sm:text-3xl">
          {headline}
        </h1>

        {message && (
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{message}</p>
        )}

        {children && <div className="mt-8 w-full">{children}</div>}

        {primary && <div className="mt-8 w-full">{primary}</div>}
        {secondary && <div className="mt-4">{secondary}</div>}
      </div>

      {footer && (
        <div className="mx-auto mt-10 max-w-sm border-t border-border/50 pt-5 text-center">
          {footer}
        </div>
      )}
    </div>
  );
}

/** Understated recovery action — always present, never competing with the primary button. */
export function ConnectStepLink({
  onClick,
  href,
  children,
}: {
  onClick?: () => void;
  href?: string;
  children: ReactNode;
}) {
  const className =
    "text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground";
  if (href) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
