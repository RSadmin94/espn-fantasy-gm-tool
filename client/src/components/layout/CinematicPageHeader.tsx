import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";

type CinematicBadge = {
  label: string;
  icon?: LucideIcon;
  /** Championship Diagnosis violet pill */
  tone?: "violet" | "lime" | "default";
};

export type CinematicPageHeaderProps = {
  title: string;
  subtitle?: string;
  /** PageHeader-style eyebrow with lime bar */
  eyebrow?: string;
  /** OwnerProfiles-style mono uppercase eyebrow */
  eyebrowMono?: string;
  icon?: LucideIcon;
  /** Purple-tinted icon box (OwnerProfiles) vs default PageHeader box */
  iconAccent?: "default" | "purple";
  actions?: ReactNode;
  /** Pill badge above title (Championship Diagnosis) */
  badge?: CinematicBadge;
  /** Right-aligned meta pills (season count, confidence, etc.) */
  meta?: ReactNode;
  /** Large cinematic title sizing */
  titleSize?: "default" | "large";
  className?: string;
};

const badgeToneClasses = {
  violet:
    "border-brand-purple/30 bg-brand-purple/10 text-[color-mix(in_oklch,var(--color-brand-purple)_70%,white)]",
  lime: "border-primary/30 bg-primary/10 text-primary",
  default: "border-border bg-muted text-muted-foreground",
} as const;

/**
 * Cinematic page header — extends PageHeader with badge, mono eyebrow,
 * large title, and meta pills used across intel / storytelling pages.
 */
export function CinematicPageHeader({
  title,
  subtitle,
  eyebrow,
  eyebrowMono,
  icon: Icon,
  iconAccent = "default",
  actions,
  badge,
  meta,
  titleSize = "default",
  className,
}: CinematicPageHeaderProps) {
  const BadgeIcon = badge?.icon;
  const badgeTone = badge?.tone ?? "violet";

  if (
    !badge &&
    !eyebrowMono &&
    !meta &&
    titleSize === "default" &&
    iconAccent === "default"
  ) {
    return (
      <PageHeader
        title={title}
        subtitle={subtitle}
        eyebrow={eyebrow}
        icon={Icon}
        actions={actions}
        className={className}
      />
    );
  }

  return (
    <div
      data-slot="cinematic-page-header"
      className={cn(
        "mb-6 flex flex-wrap items-start justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        {badge ? (
          <div
            className={cn(
              "mb-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider",
              badgeToneClasses[badgeTone],
            )}
          >
            {BadgeIcon ? <BadgeIcon className="h-3.5 w-3.5" /> : null}
            {badge.label}
          </div>
        ) : null}

        {eyebrowMono ? (
          <div className="mb-1 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrowMono}
          </div>
        ) : eyebrow ? (
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <span className="h-1 w-6 rounded-full bg-primary" />
            {eyebrow}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          {Icon ? (
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                iconAccent === "purple"
                  ? "border-brand-purple/30 bg-brand-purple/10 text-primary"
                  : "border-border bg-card text-primary",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <h1
            className={cn(
              "font-black leading-none tracking-tight text-foreground",
              titleSize === "large"
                ? "text-[34px] sm:text-[42px] leading-[1.05]"
                : "text-3xl md:text-4xl",
            )}
          >
            {title}
          </h1>
        </div>

        {subtitle ? (
          <p
            className={cn(
              "mt-2 max-w-2xl text-muted-foreground",
              titleSize === "large" ? "text-[15px]" : "text-sm",
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      {(actions || meta) && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-1">
          {meta}
          {actions ? (
            <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Meta pill used beside cinematic headers (season count, confidence, etc.) */
export function CinematicMetaPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "violet";
  className?: string;
}) {
  const toneClasses = {
    neutral: "border-border bg-muted text-muted-foreground",
    good: "border-primary/30 bg-primary/10 text-primary",
    warn: "border-[color-mix(in_oklch,var(--color-brand-gold)_30%,transparent)] bg-[color-mix(in_oklch,var(--color-brand-gold)_10%,transparent)] text-[color-mix(in_oklch,var(--color-brand-gold)_80%,white)]",
    violet:
      "border-brand-purple/30 bg-brand-purple/10 text-[color-mix(in_oklch,var(--color-brand-purple)_70%,white)]",
  } as const;

  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-semibold",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
