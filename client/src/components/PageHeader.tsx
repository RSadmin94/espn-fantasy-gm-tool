import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
};

/**
 * Canonical page header for GM War Room: large black title + muted subtitle
 * + right-aligned actions, built on theme tokens so it works in dark and light.
 * Use instead of ad-hoc <h1>/<h2> markup for visual consistency across pages.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  icon: Icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={`mb-6 flex flex-wrap items-start justify-between gap-4 ${className ?? ""}`}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <span className="h-1 w-6 rounded-full bg-primary" />
            {eyebrow}
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-primary">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <h1 className="text-3xl font-black leading-none tracking-tight text-foreground md:text-4xl">
            {title}
          </h1>
        </div>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      ) : null}
    </div>
  );
}
