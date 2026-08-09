import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { Swords } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { displayOwnerName } from "@/lib/ownerName";
import { CinematicPageHeader, IntelPageShell, IntelPanel } from "@/components/layout";
import { MatchupGallery } from "@/components/matchup-gallery/MatchupGallery";
import { MatchupGalleryEmpty } from "@/components/matchup-gallery/MatchupGalleryEmpty";
import { HistoricalMatchupViewer } from "@/components/matchup-gallery/HistoricalMatchupViewer";
import {
  galleryFilterToQueryInput,
  noMercyPresetFilter,
  parseGallerySearchParams,
  serializeGallerySearchParams,
  type GalleryUiFilter,
} from "@/lib/matchupGalleryUi";
import type { GalleryOwnerOption } from "@/components/matchup-gallery/MatchupGalleryFilters";

export function HistoricalMatchupGalleryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNoMercy = /\/no-mercy\/?$/.test(location.pathname);
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn, activeQ } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const leaguesQ = trpc.league.getMyLeagues.useQuery(undefined, { enabled: ready, staleTime: 60_000 });
  const ownersQ = (trpc as any).owners.ownerList.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 120_000,
  });

  const activeOwnerName = useMemo(() => {
    const rows = (leaguesQ.data ?? []) as Array<{
      isActive?: boolean;
      selectedOwnerName?: string | null;
    }>;
    const active = rows.find((r) => r.isActive) ?? rows[0];
    return active?.selectedOwnerName?.trim() || null;
  }, [leaguesQ.data]);

  const filter = useMemo(() => {
    const parsed = parseGallerySearchParams(searchParams.toString(), isNoMercy ? "no-mercy" : undefined);
    if (isNoMercy && !parsed.ownerName && activeOwnerName) {
      return { ...parsed, ...noMercyPresetFilter(activeOwnerName) };
    }
    if (isNoMercy) {
      return { ...noMercyPresetFilter(parsed.ownerName ?? activeOwnerName), ...parsed, noMercy: true, result: parsed.result ?? "win", marginMin: parsed.marginMin ?? 50 };
    }
    return parsed;
  }, [searchParams, isNoMercy, activeOwnerName]);

  useEffect(() => {
    if (!isNoMercy || !activeOwnerName) return;
    if (searchParams.get("ownerName")) return;
    const next = serializeGallerySearchParams(filter);
    if (next !== searchParams.toString()) {
      setSearchParams(new URLSearchParams(next), { replace: true });
    }
  }, [isNoMercy, activeOwnerName, filter, searchParams, setSearchParams]);

  const queryInput = galleryFilterToQueryInput(filter);
  const galleryQ = trpc.matchupGallery.query.useQuery(withLeagueSalt(queryInput, leagueContextKey), {
    enabled: ready,
    staleTime: 30_000,
  });

  const owners: GalleryOwnerOption[] = useMemo(() => {
    const data = ownersQ.data as
      | {
          active?: Array<{ ownerKey?: string; ownerName?: string }>;
          graveyard?: Array<{ ownerKey?: string; ownerName?: string }>;
          allOwners?: Array<{ ownerKey?: string; ownerName?: string }>;
        }
      | undefined;
    const rows = [
      ...(data?.active ?? []),
      ...(data?.graveyard ?? []),
      ...(data?.allOwners ?? []),
    ];
    const seen = new Set<string>();
    const out: GalleryOwnerOption[] = [];
    for (const row of rows) {
      const label = displayOwnerName(row.ownerKey, row.ownerName);
      if (!label || label === "Unknown Owner") continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value: label, label });
    }
    for (const extra of [filter.ownerName, filter.opponentName, activeOwnerName]) {
      const label = extra?.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value: label, label });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [ownersQ.data, filter.ownerName, filter.opponentName, activeOwnerName]);

  const leagueName = activeQ.data?.leagueName ? String(activeQ.data.leagueName) : null;
  const title = isNoMercy ? "NO MERCY RULE" : "Historical Matchups";

  const onFilterChange = (next: GalleryUiFilter) => {
    const qs = serializeGallerySearchParams(next);
    if (isNoMercy && !next.noMercy) {
      navigate(qs ? `/league/history/matchups?${qs}` : "/league/history/matchups");
      return;
    }
    setSearchParams(qs ? new URLSearchParams(qs) : new URLSearchParams(), { replace: true });
  };

  const onNoMercy = () => {
    if (isNoMercy) return;
    const preset = noMercyPresetFilter(filter.ownerName || activeOwnerName);
    navigate(`/league/history/matchups/no-mercy?${serializeGallerySearchParams(preset)}`);
  };

  return (
    <IntelPageShell
      bleed
      minHeight="full"
      background="cinematic-token"
      padding="default"
      data-v2-league-matchups
    >
      <CinematicPageHeader
        eyebrowMono="League History"
        icon={Swords}
        title={title}
        subtitle={
          isNoMercy
            ? "Victory margin of 50+ points. Facts from recorded gmMatchups only."
            : "Browse recorded league games. Filters use the Historical Matchup Gallery contract."
        }
        className="mb-5"
        meta={
          leagueName ? (
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {leagueName}
            </span>
          ) : null
        }
      />

      <main className="mx-auto max-w-[1400px]">
        {!ready ? (
          <IntelPanel variant="card" className="p-8 text-sm text-muted-foreground">
            Connect a league to browse historical matchups.
          </IntelPanel>
        ) : (
          <MatchupGallery
            title={isNoMercy ? "No Mercy Rule gallery" : "Matchup gallery"}
            leagueName={leagueName}
            filter={filter}
            result={galleryQ.data}
            owners={owners}
            loading={galleryQ.isLoading}
            onFilterChange={onFilterChange}
            onNoMercy={onNoMercy}
            noMercyActive={isNoMercy || !!filter.noMercy}
            activeOwnerName={activeOwnerName}
          />
        )}
      </main>
    </IntelPageShell>
  );
}

export function HistoricalMatchupDetailPage() {
  const { matchupId: matchupIdParam } = useParams();
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn, activeQ } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const matchupId = Number(matchupIdParam);

  const viewerQ = trpc.matchupGallery.get.useQuery(
    withLeagueSalt({ matchupId }, leagueContextKey),
    { enabled: ready && Number.isFinite(matchupId), staleTime: 60_000 },
  );

  const leagueName = activeQ.data?.leagueName ? String(activeQ.data.leagueName) : viewerQ.data?.leagueName;
  const matchup = viewerQ.data?.matchup ?? null;

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default" data-v2-matchup-detail>
      <CinematicPageHeader
        eyebrowMono="League History"
        icon={Swords}
        title="Matchup"
        subtitle="Recorded final score, owners, and week lineups when available."
        className="mb-5"
        meta={
          leagueName ? (
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {leagueName}
            </span>
          ) : null
        }
      />
      <main className="mx-auto max-w-5xl">
        {viewerQ.isLoading ? (
          <IntelPanel variant="card" className="p-8 text-sm text-muted-foreground">
            Loading matchup…
          </IntelPanel>
        ) : matchup ? (
          <HistoricalMatchupViewer
            matchup={matchup}
            scoringPrecision={viewerQ.data?.scoringPrecision}
            leagueName={leagueName}
            coverageNote={viewerQ.data?.coverageNote}
            home={viewerQ.data?.home ?? null}
            away={viewerQ.data?.away ?? null}
            lineupNote={viewerQ.data?.lineupNote}
          />
        ) : (
          <MatchupGalleryEmpty
            reason="no_matching_games"
            summary={viewerQ.data?.lineupNote || "No recorded matchup matched that id."}
          />
        )}
      </main>
    </IntelPageShell>
  );
}
