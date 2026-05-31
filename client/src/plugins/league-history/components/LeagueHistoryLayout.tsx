import { useState, useMemo } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildDefaultRivalryEligibleOwnerKeys } from "@/lib/rivalryOwnerEligibility";
import { useLeagueHistoryModel, type LeagueHistoryTab, type SortKey } from "../hooks/useLeagueHistoryModel";
import { DynastyBoardTab } from "./DynastyBoardTab";
import { SeasonExplorerTab } from "./SeasonExplorerTab";
import { RivalriesTab } from "./RivalriesTab";
import { OwnerProfilesTab } from "./OwnerProfilesTab";

export function LeagueHistoryPlugin() {
  const [tab, setTab] = useState<LeagueHistoryTab>("dynasty");
  const [sortBy, setSortBy] = useState<SortKey>("titles");
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [rivalOwner, setRivalOwner] = useState("");

  const model = useLeagueHistoryModel();

  const sortedOwners = model.sortOwners(sortBy);

  const allSeasons = model.allSeasons;
  const activeSeason = selectedSeason ?? allSeasons[allSeasons.length - 1] ?? null;
  const seasonRows = model.seasonExplorerRows(activeSeason);
  const spotlights = model.medalSpotlights(activeSeason);
  const topScorer =
    seasonRows.length > 0 ? [...seasonRows].sort((a, b) => b.pointsFor - a.pointsFor)[0]! : null;

  const topScorerOwner = topScorer
    ? model.mergedOwners.find((o) => o.displayName === topScorer.owner)
    : undefined;
  const showTopScorer =
    Boolean(topScorer) &&
    !(activeSeason != null && topScorerOwner?.titleSeasons.includes(activeSeason));

  const h2hOwners = model.h2hQ.data?.owners ?? [];
  const h2hMatrix = model.h2hQ.data?.matrix ?? [];
  const h2hDiagnostics = model.h2hQ.data?.diagnostics ?? null;

  const dossierPickerOptions = useMemo(
    () => model.rawOwners.map((o) => ({ ownerKey: o.ownerKey, label: o.displayName })),
    [model.rawOwners],
  );

  const anchorSeasonForRivalry = useMemo(() => {
    if (!allSeasons.length) return new Date().getFullYear();
    return Math.max(...allSeasons);
  }, [allSeasons]);

  const rivalryEligibleOwnerKeys = useMemo(
    () =>
      buildDefaultRivalryEligibleOwnerKeys(
        model.rawOwners.map((o) => ({
          ownerKey: o.ownerKey,
          seasons: o.seasons.map((s) => s.season),
          championships: o.championships,
        })),
        anchorSeasonForRivalry,
      ),
    [model.rawOwners, anchorSeasonForRivalry],
  );

  const standingsLoading = model.standingsLoading;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-12">
      <div className="space-y-0.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">League History</div>
        <h1 className="text-3xl font-bold text-foreground">League Timeline</h1>
        <p className="text-sm text-muted-foreground">History · Dynasties · Rivalries</p>
      </div>

      <ToggleGroup
        type="single"
        value={tab}
        onValueChange={(v) => {
          if (v) setTab(v as LeagueHistoryTab);
        }}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="dynasty">Dynasty Board</ToggleGroupItem>
        <ToggleGroupItem value="seasons">Season Explorer</ToggleGroupItem>
        <ToggleGroupItem value="rivalries">Rivalries</ToggleGroupItem>
        <ToggleGroupItem value="profiles">Owner Profiles</ToggleGroupItem>
      </ToggleGroup>

      {tab === "dynasty" && (
        <DynastyBoardTab
          owners={sortedOwners}
          sortBy={sortBy}
          setSortBy={setSortBy}
          expandedOwner={expandedOwner}
          setExpandedOwner={setExpandedOwner}
          setSelectedSeason={(s) => setSelectedSeason(s)}
          setTab={setTab}
          isLoading={standingsLoading}
        />
      )}

      {tab === "seasons" && (
        <SeasonExplorerTab
          allSeasons={allSeasons}
          activeSeason={activeSeason}
          setSelectedSeason={setSelectedSeason}
          seasonRows={seasonRows}
          medalChampion={spotlights.champion}
          medalRunnerUp={spotlights.runnerUp}
          medalThird={spotlights.third}
          topScorer={topScorer}
          showTopScorer={showTopScorer}
          isLoading={standingsLoading}
        />
      )}

      {tab === "rivalries" && (
        <RivalriesTab
          h2hOwners={h2hOwners}
          h2hMatrix={h2hMatrix}
          rivalOwner={rivalOwner}
          setRivalOwner={setRivalOwner}
          isLoading={model.h2hQ.isLoading}
          diagnostics={h2hDiagnostics}
          dossierPickerOptions={dossierPickerOptions}
          activeSeason={activeSeason}
          rivalryEligibleOwnerKeys={rivalryEligibleOwnerKeys}
          rawOwners={model.rawOwners}
        />
      )}

      {tab === "profiles" && <OwnerProfilesTab />}
    </div>
  );
}
