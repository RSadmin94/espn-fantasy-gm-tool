import { Loader2 } from "lucide-react";
import { useEspnConnectFlow } from "@/hooks/useEspnConnectFlow";
import { nextAfterEspnConnected } from "@/lib/onboardingSetup";
import { ConnectStepCard } from "./ConnectStepCard";
import {
  ChooseLeagueStep,
  ConnectProblemStep,
  ConnectedStep,
  ConnectingStep,
  InstallConnectorStep,
  MobileEspnUnsupportedStep,
  SignInEspnStep,
  StartConnectStep,
} from "./EspnConnectSteps";

/**
 * One screen at a time, chosen by the connect state machine. This component decides nothing about
 * connecting — it only picks which step the user is looking at.
 */
export function EspnConnectFlow() {
  const {
    state,
    busy,
    connectedLeagues,
    atLimit,
    remainingSlots,
    connectorCapable,
    isSetupComplete,
    recheck,
    connect,
    chooseLeagues,
  } = useEspnConnectFlow();

  if (!connectorCapable) {
    return <MobileEspnUnsupportedStep />;
  }

  const continueTo = nextAfterEspnConnected({
    isSetupComplete,
    leagueId: state.connected[0]?.id ?? connectedLeagues.find((l) => l.provider === "espn")?.leagueId ?? null,
  });

  switch (state.step) {
    case "preflight":
      return (
        <ConnectStepCard
          headline="Getting set up"
          mark={<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
        />
      );

    case "connector_missing":
      return <InstallConnectorStep onRecheck={recheck} busy={busy} />;

    case "espn_signed_out":
      return <SignInEspnStep onRecheck={recheck} busy={busy} />;

    case "connecting":
      return <ConnectingStep progress={state.progress} pending={state.pending} />;

    case "choose":
      return (
        <ChooseLeagueStep
          leagues={state.leagues}
          onConnect={chooseLeagues}
          disabled={busy}
          remainingSlots={remainingSlots}
        />
      );

    case "connected":
      return (
        <ConnectedStep
          leagues={state.connected}
          failed={state.failed}
          onConnectAnother={connect}
          canConnectAnother={!atLimit}
          continueTo={continueTo}
        />
      );

    case "problem":
      return state.problem ? (
        <ConnectProblemStep problem={state.problem} onRetry={connect} busy={busy} />
      ) : null;

    case "ready":
    default: {
      const existing = connectedLeagues.filter((l) => l.provider === "espn");
      const shown = existing.length ? existing : connectedLeagues;
      if (shown.length && !atLimit) {
        return (
          <ConnectedStep
            leagues={shown.map((l) => ({ id: l.leagueId, name: l.leagueName || "Your league" }))}
            onConnectAnother={connect}
            canConnectAnother
            continueTo={continueTo}
          />
        );
      }
      return <StartConnectStep onConnect={connect} busy={busy} atLimit={atLimit} />;
    }
  }
}

