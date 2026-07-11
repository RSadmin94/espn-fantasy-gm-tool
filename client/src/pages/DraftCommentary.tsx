import { ScrollText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { PageHeader } from "@/components/PageHeader";
import {
  mapSofiaErrorCopy,
  resolveDraftCommentaryViewState,
  SOFIA_FEED_CONTAINER_CLASS,
} from "@/lib/sofiaPresentation";
import { SofiaFeed } from "@/components/sofia/SofiaFeed";
import { SofiaLoadingState } from "@/components/sofia/SofiaLoadingState";
import { SofiaEmptyState } from "@/components/sofia/SofiaEmptyState";
import { SofiaErrorState } from "@/components/sofia/SofiaErrorState";

export function DraftCommentary() {
  const { activeQ, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const profileQ = trpc.me.activeProfile.useQuery(undefined, {
    enabled: Boolean(authLoaded && userLoaded && isSignedIn),
    staleTime: 60_000,
  });

  const activeLeague = activeQ.data;
  const leagueId = activeLeague?.leagueId?.trim() ?? "";
  const season = activeLeague?.season ?? new Date().getFullYear();
  const setupComplete = profileQ.data?.isSetupComplete === true;

  const commentaryQ = trpc.sofia.getDraftCommentary.useQuery(
    { leagueId, season },
    {
      enabled: Boolean(leagueId && setupComplete && !activeQ.isLoading && profileQ.isSuccess),
      retry: false,
    },
  );

  const viewState = resolveDraftCommentaryViewState({
    gateLoading: activeQ.isLoading || profileQ.isLoading,
    profile: profileQ.data,
    activeLeagueId: leagueId || null,
    commentaryLoading: commentaryQ.isLoading,
    commentaryError: commentaryQ.isError,
    commentary: commentaryQ.data,
  });

  const errorCopy = mapSofiaErrorCopy(commentaryQ.error?.message);
  const subtitle = activeLeague
    ? `${activeLeague.leagueName || `League ${leagueId}`} · ${season} season · active league`
    : "Sofia's evidence-grounded takes on your mock draft picks";

  return (
    <div className="pb-10">
      <div className={SOFIA_FEED_CONTAINER_CLASS}>
        <PageHeader
          title="Draft Commentary"
          subtitle={subtitle}
          icon={ScrollText}
        />
      </div>

      <div className={SOFIA_FEED_CONTAINER_CLASS}>
        {(viewState === "loading_gate" || viewState === "loading_commentary") && (
          <SofiaLoadingState />
        )}

        {viewState === "setup_incomplete" && <SofiaEmptyState variant="setup_incomplete" />}

        {viewState === "no_active_league" && <SofiaEmptyState variant="no_active_league" />}

        {viewState === "empty" && <SofiaEmptyState variant="no_commentary" />}

        {viewState === "error" && errorCopy.showDraftWarRoom && (
          <SofiaEmptyState variant="no_season" />
        )}

        {viewState === "error" && !errorCopy.showDraftWarRoom && (
          <SofiaErrorState
            title={errorCopy.title}
            body={errorCopy.body}
            showLeagueSwitch={errorCopy.showLeagueSwitch}
            showDraftWarRoom={errorCopy.showDraftWarRoom}
            onRetry={() => void commentaryQ.refetch()}
          />
        )}

        {viewState === "ready" && commentaryQ.data && <SofiaFeed items={commentaryQ.data} />}
      </div>
    </div>
  );
}
