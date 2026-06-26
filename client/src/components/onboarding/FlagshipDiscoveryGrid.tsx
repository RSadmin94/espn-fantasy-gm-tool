import { Binoculars, Archive, Repeat2, Swords } from "lucide-react";
import { IntelPanel } from "@/components/layout";
import { FLAGSHIP_DISCOVERY } from "@/lib/productOnboarding";
import { FeatureDiscoveryCard } from "./FeatureDiscoveryCard";

const ICONS = {
  "gm-intelligence": Binoculars,
  "rivalry-documentary": Swords,
  "league-archives": Archive,
  "trade-intelligence": Repeat2,
} as const;

const ACCENTS = {
  "gm-intelligence": "text-amber-400",
  "rivalry-documentary": "text-violet-400",
  "league-archives": "text-sky-400",
  "trade-intelligence": "text-lime-400",
} as const;

export function FlagshipDiscoveryGrid() {
  return (
    <IntelPanel variant="elevated" className="overflow-hidden p-4 sm:p-5">
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Explore GM War Room</p>
        <h2 className="mt-1 text-lg font-bold text-foreground">Flagship experiences</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Years of league history, distilled into intelligence, rivalries, and legacy.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {FLAGSHIP_DISCOVERY.map((item) => (
          <FeatureDiscoveryCard
            key={item.id}
            title={item.title}
            description={item.description}
            href={item.href}
            icon={ICONS[item.id]}
            accentClassName={ACCENTS[item.id]}
          />
        ))}
      </div>
    </IntelPanel>
  );
}
