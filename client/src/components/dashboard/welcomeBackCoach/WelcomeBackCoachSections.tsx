import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { V1 } from "@/lib/v1Copy";
import type { IntelligenceBeat } from "@/lib/welcomeBackCoachBriefing";
import { IntelPanel } from "@/components/layout";

export function IntelligenceTrioCard({ beat }: { beat: IntelligenceBeat }) {
  const questionLabel = V1.home.questions[beat.question];
  return (
    <IntelPanel variant="card" className="flex h-full flex-col p-4 sm:p-5">
      <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{beat.label}</p>
      <p className="mt-2 text-base font-bold leading-snug text-foreground">{beat.headline}</p>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{beat.detail}</p>
      <div className="mt-4 space-y-2 border-t border-border pt-3">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{questionLabel}</p>
        <Link
          to={beat.href}
          className="inline-flex items-center gap-1 text-sm font-semibold text-lime-400/90 hover:text-lime-300"
        >
          {beat.cta}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </IntelPanel>
  );
}

export function ExecutiveBriefingSection({
  paragraph,
  actionLabel,
  actionHref,
}: {
  paragraph: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <section aria-label={V1.home.executiveBriefing} className="rounded-2xl border border-lime-500/20 bg-card p-5 sm:p-6">
      <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-lime-400/90">{V1.home.executiveBriefing}</p>
      <p className="mt-3 text-base leading-relaxed text-foreground sm:text-lg">{paragraph}</p>
      <Link
        to={actionHref}
        className="mt-4 inline-flex items-center gap-1 rounded-lg border border-lime-500/30 bg-lime-500/10 px-4 py-2 text-sm font-semibold text-lime-300 hover:bg-lime-500/15"
      >
        {actionLabel}
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-bold text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function CoachCardShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card/95", className)}>
      {children}
    </div>
  );
}
