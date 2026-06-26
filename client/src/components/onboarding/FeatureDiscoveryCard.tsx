import { Link } from "react-router";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { IntelPanel } from "@/components/layout";
import { cn } from "@/lib/utils";

export function FeatureDiscoveryCard({
  title,
  description,
  href,
  icon: Icon,
  accentClassName = "text-lime-400",
  className,
}: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  accentClassName?: string;
  className?: string;
}) {
  return (
    <IntelPanel variant="elevated" className={cn("flex h-full flex-col overflow-hidden p-4 sm:p-5", className)}>
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2">
          <Icon className={cn("h-5 w-5", accentClassName)} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <Link
        to={href}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-lime-300 transition-colors hover:text-lime-200"
      >
        Open
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </IntelPanel>
  );
}
