import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type TabBarItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
};

export type TabBarTone = "default" | "hof" | "wire";

export type TabBarLayout = "wrap" | "inline";

const toneActiveClasses: Record<TabBarTone, { border: string; text: string; icon: string }> = {
  default: {
    border: "border-foreground",
    text: "text-foreground",
    icon: "text-foreground",
  },
  hof: {
    border: "border-red-500",
    text: "text-red-400",
    icon: "text-red-400",
  },
  wire: {
    border: "border-foreground",
    text: "text-foreground",
    icon: "text-foreground",
  },
};

const toneInactiveClasses: Record<TabBarTone, { text: string; icon: string }> = {
  default: {
    text: "text-muted-foreground hover:text-foreground",
    icon: "text-muted-foreground",
  },
  hof: {
    text: "text-muted-foreground hover:text-foreground",
    icon: "text-muted-foreground",
  },
  wire: {
    text: "text-muted-foreground hover:text-foreground",
    icon: "text-muted-foreground",
  },
};

export type TabBarProps = {
  tabs: TabBarItem[];
  value: string;
  onChange: (id: string) => void;
  tone?: TabBarTone;
  layout?: TabBarLayout;
  className?: string;
  /** Wire tone uses lime accent on active secondary tab */
  wireSecondaryActive?: boolean;
};

/**
 * Shared tab bar — consolidates HallOfFame, LeagueWire, OwnerProfiles, PlayerDatabase patterns.
 */
export function TabBar({
  tabs,
  value,
  onChange,
  tone = "default",
  layout = "wrap",
  className,
  wireSecondaryActive = false,
}: TabBarProps) {
  const activeTone = toneActiveClasses[tone];
  const inactiveTone = toneInactiveClasses[tone];

  return (
    <div
      data-slot="tab-bar"
      className={cn(
        "flex gap-0 border-b border-[color-mix(in_oklch,var(--color-foreground)_6%,transparent)]",
        layout === "wrap" ? "flex-wrap px-1 sm:px-2" : "items-center",
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab, index) => {
        const active = value === tab.id;
        const Icon = tab.icon;
        const isWireLime =
          tone === "wire" && wireSecondaryActive && active && index > 0;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex min-w-0 items-center justify-center gap-2 border-b-2 py-3.5 text-label font-bold uppercase tracking-[0.1em] transition-colors sm:text-sm",
              layout === "wrap" && "flex-1 basis-[45%] sm:basis-0",
              layout === "inline" && "px-4 py-2 tracking-wider",
              active
                ? cn(
                    isWireLime ? "border-primary text-primary" : activeTone.border,
                    isWireLime ? "text-primary" : activeTone.text,
                  )
                : cn("border-transparent", inactiveTone.text),
            )}
          >
            {Icon ? (
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active
                    ? isWireLime
                      ? "text-primary"
                      : activeTone.icon
                    : inactiveTone.icon,
                )}
                aria-hidden
              />
            ) : null}
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
