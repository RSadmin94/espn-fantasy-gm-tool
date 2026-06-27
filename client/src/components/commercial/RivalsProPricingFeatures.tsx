import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPricingFeatureGroups } from "@/lib/featureRegistry";

type RivalsProPricingFeaturesProps = {
  /** Condensed: category headings only, one line per feature (label). */
  variant?: "full" | "condensed";
  className?: string;
  checkClassName?: string;
  itemClassName?: string;
};

export function RivalsProPricingFeatures({
  variant = "full",
  className,
  checkClassName = "text-lime-400",
  itemClassName,
}: RivalsProPricingFeaturesProps) {
  const groups = getPricingFeatureGroups();

  if (variant === "condensed") {
    return (
      <div className={cn("space-y-4", className)}>
        {groups.map((group) => (
          <div key={group.category}>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {group.category}
            </p>
            <ul className="mt-2 space-y-1.5">
              {group.items.map((item) => (
                <li
                  key={item.id}
                  className={cn("flex items-center gap-2 text-[13px] text-foreground/85", itemClassName)}
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", checkClassName)} />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {groups.map((group) => (
        <div key={group.category}>
          <h3 className="text-[13px] font-bold uppercase tracking-[0.14em] text-lime-400/90">
            {group.category}
          </h3>
          <ul className="mt-2.5 space-y-2.5">
            {group.items.map((item) => (
              <li key={item.id} className={cn("flex gap-2 text-[14px] leading-snug text-white/75", itemClassName)}>
                <Check className={cn("mt-0.5 h-4 w-4 shrink-0", checkClassName)} />
                <span>
                  <span className="font-semibold text-white/90">{item.label}</span>
                  {" — "}
                  {item.marketingDescription}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
