import { useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plug,
  Puzzle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildEspnFantasyFootballConnectUrl } from "@/lib/espnConnectUrl";
import type {
  EspnConnectProblem,
  EspnConnectProgress,
} from "@/lib/espnConnectFlow";
import type { EspnConnectLeagueOption } from "@/lib/espnApi";
import { cn } from "@/lib/utils";
import { ConnectStepCard, ConnectStepLink } from "./ConnectStepCard";
import {
  CONNECTOR_INSTALL_URL,
  CONNECTOR_MANUAL_INSTALL_STEPS,
  hasConnectorInstallUrl,
} from "./connectorInstall";

function Mark({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-14 w-14 items-center justify-center rounded-full border",
        tone === "success"
          ? "border-lime-500/30 bg-lime-500/10 text-lime-400"
          : tone === "warning"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
            : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

function openEspn(leagueId?: string) {
  window.open(
    buildEspnFantasyFootballConnectUrl(leagueId?.trim() || undefined),
    "_blank",
    "noopener,noreferrer",
  );
}

// ── 1. Connector missing ──────────────────────────────────────────────────────

export function InstallConnectorStep({
  onRecheck,
  busy,
}: {
  onRecheck: () => void;
  busy: boolean;
}) {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <ConnectStepCard
      mark={
        <Mark>
          <Puzzle className="h-6 w-6" />
        </Mark>
      }
      headline="Connect your ESPN league"
      message="Fantasy Football Rivals reads your league through the Rivals Connector. Add it once and you're done."
      primary={
        hasConnectorInstallUrl() ? (
          <Button asChild size="lg" className="w-full gap-2 font-semibold">
            <a href={CONNECTOR_INSTALL_URL} target="_blank" rel="noopener noreferrer">
              <Plug className="h-4 w-4" />
              Install Connector
            </a>
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full gap-2 font-semibold"
            onClick={() => setShowSteps(true)}
          >
            <Plug className="h-4 w-4" />
            Install Connector
          </Button>
        )
      }
      secondary={
        <ConnectStepLink onClick={onRecheck}>
          {busy ? "Checking…" : "Already installed? Check again"}
        </ConnectStepLink>
      }
      footer={
        <ConnectStepLink href="/connect/sleeper">Not on ESPN? Connect Sleeper</ConnectStepLink>
      }
    >
      {showSteps && (
        <ol className="space-y-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-4 text-left text-xs leading-relaxed text-muted-foreground">
          {CONNECTOR_MANUAL_INSTALL_STEPS.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="font-semibold text-foreground">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
    </ConnectStepCard>
  );
}

// ── 2. ESPN not signed in ─────────────────────────────────────────────────────

export function SignInEspnStep({ onRecheck, busy }: { onRecheck: () => void; busy: boolean }) {
  return (
    <ConnectStepCard
      mark={
        <Mark>
          <ExternalLink className="h-6 w-6" />
        </Mark>
      }
      headline="Sign in to ESPN"
      message="Use the account that can see your league. We'll pick it up from there — nothing to copy or paste."
      primary={
        <Button size="lg" className="w-full gap-2 font-semibold" onClick={() => openEspn()}>
          <ExternalLink className="h-4 w-4" />
          Open ESPN
        </Button>
      }
      secondary={
        <ConnectStepLink onClick={onRecheck}>{busy ? "Checking…" : "I'm signed in"}</ConnectStepLink>
      }
    />
  );
}

// ── 3. Connecting ─────────────────────────────────────────────────────────────

function ChecklistRow({
  state,
  children,
}: {
  state: "done" | "active" | "waiting";
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        {state === "done" ? (
          <Check className="h-4 w-4 text-lime-400" />
        ) : state === "active" ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
        )}
      </span>
      <span
        className={cn(
          "text-sm",
          state === "waiting" ? "text-muted-foreground/60" : "text-foreground",
        )}
      >
        {children}
      </span>
    </li>
  );
}

export function ConnectingStep({
  progress,
  leagueName,
}: {
  progress: EspnConnectProgress;
  leagueName: string | null;
}) {
  const headline =
    progress === "searching"
      ? "Finding your leagues"
      : progress === "linking"
        ? "Linking your league"
        : "Almost there";

  const searchState = progress === "searching" ? "active" : "done";
  const linkState =
    progress === "searching" ? "waiting" : progress === "linking" ? "active" : "done";
  const confirmState = progress === "confirming" ? "active" : "waiting";

  return (
    <ConnectStepCard headline={headline}>
      <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-muted/20 text-left">
        <ChecklistRow state="done">Connector detected</ChecklistRow>
        <ChecklistRow state="done">ESPN session found</ChecklistRow>
        <ChecklistRow state={searchState}>Searching your leagues</ChecklistRow>
        <ChecklistRow state={linkState}>
          {leagueName ? `Linking ${leagueName}` : "Linking your league"}
        </ChecklistRow>
        <ChecklistRow state={confirmState}>Confirming</ChecklistRow>
      </ul>
    </ConnectStepCard>
  );
}

// ── 4. League selection ───────────────────────────────────────────────────────

export function ChooseLeagueStep({
  leagues,
  onChoose,
  disabled,
}: {
  leagues: readonly EspnConnectLeagueOption[];
  onChoose: (leagueId: string, leagueName: string) => void;
  disabled?: boolean;
}) {
  return (
    <ConnectStepCard
      headline="Which league is yours?"
      message={`We found ${leagues.length} on your ESPN account.`}
    >
      <ul className="space-y-2 text-left">
        {leagues.map((league) => (
          <li key={league.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChoose(league.id, league.name)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
            >
              <span className="truncate text-sm font-semibold text-foreground">
                {league.name || "ESPN league"}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </ConnectStepCard>
  );
}

// ── 5. Connected ──────────────────────────────────────────────────────────────

export function ConnectedStep({
  leagueName,
  onConnectAnother,
  canConnectAnother,
}: {
  leagueName: string;
  onConnectAnother: () => void;
  canConnectAnother: boolean;
}) {
  return (
    <ConnectStepCard
      tone="success"
      mark={
        <Mark tone="success">
          <Check className="h-7 w-7" />
        </Mark>
      }
      headline={leagueName}
      message="Connected. We're pulling in your league history now."
      primary={
        <Button asChild size="lg" className="w-full gap-2 font-semibold">
          <Link to="/connected-leagues">Pick your team</Link>
        </Button>
      }
      secondary={
        canConnectAnother ? (
          <ConnectStepLink onClick={onConnectAnother}>Connect another league</ConnectStepLink>
        ) : undefined
      }
    />
  );
}

// ── 6. Something went wrong ───────────────────────────────────────────────────

export function ConnectProblemStep({
  problem,
  onRetry,
  busy,
}: {
  problem: EspnConnectProblem;
  onRetry: () => void;
  busy: boolean;
}) {
  const espnFirst = problem.kind === "no_leagues";

  return (
    <ConnectStepCard
      tone="warning"
      mark={
        <Mark tone="warning">
          <AlertTriangle className="h-6 w-6" />
        </Mark>
      }
      headline={problem.headline}
      message={problem.message}
      primary={
        espnFirst ? (
          <Button size="lg" className="w-full gap-2 font-semibold" onClick={() => openEspn()}>
            <ExternalLink className="h-4 w-4" />
            Open ESPN
          </Button>
        ) : (
          <Button
            size="lg"
            disabled={busy}
            className="w-full gap-2 font-semibold"
            onClick={onRetry}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            {busy ? "Trying again…" : "Try again"}
          </Button>
        )
      }
      secondary={
        espnFirst ? (
          <ConnectStepLink onClick={onRetry}>Try again</ConnectStepLink>
        ) : (
          <ConnectStepLink href="/settings">Get help</ConnectStepLink>
        )
      }
    />
  );
}

// ── Ready, but waiting on the user (already has a league, or at the plan limit) ──

export function StartConnectStep({
  onConnect,
  busy,
  atLimit,
}: {
  onConnect: () => void;
  busy: boolean;
  atLimit: boolean;
}) {
  if (atLimit) {
    return (
      <ConnectStepCard
        tone="warning"
        mark={
          <Mark tone="warning">
            <AlertTriangle className="h-6 w-6" />
          </Mark>
        }
        headline="You've connected all your leagues"
        message="Disconnect one to make room for another."
        primary={
          <Button asChild size="lg" className="w-full font-semibold">
            <Link to="/connected-leagues">Manage leagues</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ConnectStepCard
      mark={
        <Mark>
          <Plug className="h-6 w-6" />
        </Mark>
      }
      headline="Ready when you are"
      message="Your ESPN session is set. We'll find your leagues and link them."
      primary={
        <Button
          size="lg"
          disabled={busy}
          className="w-full gap-2 font-semibold"
          onClick={onConnect}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          {busy ? "Connecting…" : "Connect my league"}
        </Button>
      }
    />
  );
}
