import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLeagueHistoryModel, type SortKey } from "../hooks/useLeagueHistoryModel";
import { DynastyBoardTab } from "./DynastyBoardTab";
import { V1 } from "@/lib/v1Copy";

export function LeagueHistoryPlugin() {
  const [sortBy, setSortBy] = useState<SortKey>("titles");
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null);

  const model = useLeagueHistoryModel();
  const sortedOwners = model.sortOwners(sortBy);
  const allSeasons = model.allSeasons;
  const subtitle =
    allSeasons.length >= 2
      ? `${allSeasons[0]}–${allSeasons[allSeasons.length - 1]}`
      : allSeasons.length === 1
        ? String(allSeasons[0])
        : "Explore every season in your league's history.";

  if (!model.leagueKeyReady) {
    return (
      <div className="mx-auto flex max-w-7xl items-center justify-center px-1 py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading league…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-12">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-foreground">{V1.features.leagueTimeline}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <DynastyBoardTab
        owners={sortedOwners}
        sortBy={sortBy}
        setSortBy={setSortBy}
        expandedOwner={expandedOwner}
        setExpandedOwner={setExpandedOwner}
        isLoading={model.standingsLoading}
      />
    </div>
  );
}
