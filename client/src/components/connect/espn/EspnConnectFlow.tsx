import { Loader2 } from "lucide-react";
import { useEspnConnectFlow } from "@/hooks/useEspnConnectFlow";
import { ConnectStepCard } from "./ConnectStepCard";
import {
  ChooseLeagueStep,
  ConnectProblemStep,
  ConnectedStep,
  ConnectingStep,
  InstallConnectorStep,
  SignInEspnStep,
  StartConnectStep,
} from "./EspnConnectSteps";

/**
 * One screen at a time, chosen by the connect state machine. This component decides nothing about
 * connecting — it only picks which step the user is looking at.
 */
export function EspnConnectFlow() {
  const { state, busy, connectedLeagues, atLimit, remainingSlots, recheck, connect, chooseLeagues } =
    useEspnConnectFlow();

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
        />
      );

    case "problem":
      return state.problem ? (
        <ConnectProblemStep problem={state.problem} onRetry={connect} busy={busy} />
      ) : null;

    case "ready":
    default: {
      // Connector and ESPN are both ready but we did not auto-connect: this account already has a
      // league (or is at its limit), so show where they stand rather than reconnecting silently.
      const existing = connectedLeagues.filter((l) => l.provider === "espn");
      const shown = existing.length ? existing : connectedLeagues;
      if (shown.length && !atLimit) {
        return (
          <ConnectedStep
            leagues={shown.map((l) => ({ id: l.leagueId, name: l.leagueName || "Your league" }))}
            onConnectAnother={connect}
            canConnectAnother
          />
        );
      }
      return <StartConnectStep onConnect={connect} busy={busy} atLimit={atLimit} />;
    }
  }
}
