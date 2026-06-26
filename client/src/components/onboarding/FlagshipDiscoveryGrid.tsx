import { Archive, Binoculars, Flame, Repeat2, Swords } from "lucide-react";
import { IntelPanel } from "@/components/layout";
import { LEAGUE_DISCOVERY_CARDS } from "@/lib/productOnboarding";
import { useLeagueDiscoveryTeasers } from "@/hooks/useLeagueDiscoveryTeasers";
import { FeatureDiscoveryCard } from "./FeatureDiscoveryCard";

const ICONS = {
  "gm-profile": Binoculars,
  "biggest-rivalry": Swords,
  "league-history": Archive,
  "trade-analyzer": Repeat2,
  "notorious-trades": Flame,
} as const;

const ACCENTS = {
  "gm-profile": "text-amber-400",
  "biggest-rivalry": "text-violet-400",
  "league-history": "text-sky-400",
  "trade-analyzer": "text-lime-400",
  "notorious-trades": "text-rose-400",
} as const;

export function FlagshipDiscoveryGrid() {
  const { teasers } = useLeagueDiscoveryTeasers();

  return (
    <IntelPanel variant="elevated" className="overflow-hidden p-4 sm:p-5">
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">League discovery</p>
        <h2 className="mt-1 text-lg font-bold text-foreground">What should I look at first?</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Start with the stories your synced league history already tells.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {LEAGUE_DISCOVERY_CARDS.map((item) => (
          <FeatureDiscoveryCard
            key={item.id}
            title={item.title}
            description={item.description}
            href={item.href}
            ctaLabel={item.cta}
            teaser={teasers[item.id]}
            icon={ICONS[item.id]}
            accentClassName={ACCENTS[item.id]}
          />
        ))}
      </div>
    </IntelPanel>
  );
}
