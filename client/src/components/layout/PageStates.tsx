import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { IntelPanel } from "@/components/layout/IntelPanel";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type IntelPanelVariant = ComponentProps<typeof IntelPanel>["variant"];

/** Full-page / hero loading inside an intel panel */
export function PageLoading({
  message = "Loading…",
  panelVariant = "elevated",
  className,
}: {
  message?: string;
  panelVariant?: IntelPanelVariant;
  className?: string;
}) {
  return (
    <IntelPanel
      variant={panelVariant}
      className={cn(
        "flex items-center justify-center gap-3 p-16 text-muted-foreground",
        className,
      )}
    >
      <Spinner className="h-5 w-5 text-primary" />
      {message}
    </IntelPanel>
  );
}

/** Inline section loading row */
export function SectionLoading({
  message = "Loading…",
  className,
  size = "default",
}: {
  message?: string;
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <div
      data-slot="section-loading"
      className={cn(
        "flex items-center gap-2 text-muted-foreground",
        size === "sm" ? "text-sm" : "text-base",
        className,
      )}
    >
      <Spinner className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
      {message}
    </div>
  );
}

/** Centered empty state with optional next-step action */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  panelVariant = "elevated",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  panelVariant?: IntelPanelVariant;
  className?: string;
}) {
  return (
    <IntelPanel
      variant={panelVariant}
      className={cn("p-8 text-center", className)}
    >
      {Icon ? (
        <Icon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      ) : null}
      <p className="text-xl font-black text-foreground">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </IntelPanel>
  );
}

type ProGateAccent = "lime" | "amber";

const proGateAccentClasses: Record<
  ProGateAccent,
  { icon: string; button: string }
> = {
  lime: {
    icon: "text-primary",
    button:
      "bg-primary text-primary-foreground hover:brightness-110",
  },
  amber: {
    icon: "text-[color-mix(in_oklch,var(--color-brand-gold)_80%,white)]",
    button:
      "bg-[color-mix(in_oklch,var(--color-brand-gold)_90%,white)] text-[color-mix(in_oklch,var(--color-intel-page-from)_90%,black)] hover:brightness-110",
  },
};

/** Rivals Pro paywall gate — consolidates PathPaywall, HofPaywall, etc. */
export function ProGate({
  icon: Icon,
  heading,
  description,
  ctaLabel,
  pendingLabel = "Opening...",
  onUnlock,
  pending = false,
  accent = "lime",
  panelVariant = "elevated",
  className,
}: {
  icon: LucideIcon;
  heading: string;
  description: string;
  ctaLabel: string;
  pendingLabel?: string;
  onUnlock: () => void;
  pending?: boolean;
  accent?: ProGateAccent;
  panelVariant?: IntelPanelVariant;
  className?: string;
}) {
  const accentClasses = proGateAccentClasses[accent];

  return (
    <IntelPanel variant={panelVariant} className={cn("p-8 text-center", className)}>
      <Icon className={cn("mx-auto mb-3 h-8 w-8", accentClasses.icon)} />
      <p className="text-xl font-black text-foreground">{heading}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      <button
        type="button"
        onClick={onUnlock}
        disabled={pending}
        className={cn(
          "mt-5 inline-flex items-center gap-2 rounded-intel-sub px-6 py-3 text-sm font-extrabold transition disabled:opacity-60",
          accentClasses.button,
        )}
      >
        {pending ? pendingLabel : ctaLabel}
      </button>
    </IntelPanel>
  );
}

/** Error state inside an intel panel */
export function PageError({
  message,
  panelVariant = "elevated",
  className,
}: {
  message: string;
  panelVariant?: IntelPanelVariant;
  className?: string;
}) {
  return (
    <IntelPanel
      variant={panelVariant}
      className={cn("p-8 text-center text-destructive", className)}
    >
      {message}
    </IntelPanel>
  );
}
