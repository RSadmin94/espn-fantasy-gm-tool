import { useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  Plug,
  Puzzle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { buildEspnFantasyFootballConnectUrl } from "@/lib/espnConnectUrl";
import { defaultLeagueSelection } from "@/lib/espnConnectFlow";
import type {
  EspnConnectLeagueRef,
  EspnConnectPending,
  EspnConnectProblem,
  EspnConnectProgress,
} from "@/lib/espnConnectFlow";
import type { EspnConnectLeagueOption } from "@/lib/espnApi";
import { cn } from "@/lib/utils";
import { ConnectStepCard, ConnectStepLink } from "./ConnectStepCard";
import {
  CONNECTOR_INSTALL_URL,
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

export function MobileEspnUnsupportedStep() {
  return (
    <ConnectStepCard
      mark={
        <Mark tone="warning">
          <Puzzle className="h-6 w-6" />
        </Mark>
      }
      headline="ESPN needs a desktop browser"
      message="Connecting ESPN currently requires the Fantasy Football Rivals connector on desktop Chrome. Your place in setup is saved — finish on a computer, or connect a Sleeper league from here."
      primary={
        <Button asChild size="lg" className="w-full font-semibold">
          <Link to="/connect/sleeper">Connect Sleeper instead</Link>
        </Button>
      }
      secondary={<ConnectStepLink href="/connect">Choose a different site</ConnectStepLink>}
    />
  );
}

export function InstallConnectorStep({
  onRecheck,
  busy,
}: {
  onRecheck: () => void;
  busy: boolean;
}) {
  return (
    <ConnectStepCard
      mark={
        <Mark>
          <Puzzle className="h-6 w-6" />
        </Mark>
      }
      headline="Connect ESPN securely"
      message="Install the Fantasy Football Rivals connector. It lets Rivals securely connect to the ESPN leagues you're already signed into."
      primary={
        hasConnectorInstallUrl() ? (
          <Button asChild size="lg" className="w-full gap-2 font-semibold">
            <a href={CONNECTOR_INSTALL_URL} target="_blank" rel="noopener noreferrer">
              <Plug className="h-4 w-4" />
              Install the connector
            </a>
          </Button>
        ) : (
          <Button size="lg" className="w-full gap-2 font-semibold" disabled>
            <Plug className="h-4 w-4" />
            Install listing coming soon
          </Button>
        )
      }
      secondary={
        <ConnectStepLink onClick={onRecheck}>
          {busy ? "Checking…" : "I installed it — check again"}
        </ConnectStepLink>
      }
      footer={
        <ConnectStepLink href="/connect/sleeper">Not on ESPN? Connect Sleeper</ConnectStepLink>
      }
    />
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
      message="ESPN login is required. Use the account that can see your league, then come back here — we'll continue automatically."
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
  pending,
}: {
  progress: EspnConnectProgress;
  pending: EspnConnectPending | null;
}) {
  const many = (pending?.total ?? 1) > 1;
  const headline =
    progress === "searching"
      ? "Finding your leagues"
      : progress === "linking"
        ? many
          ? `Linking league ${(pending?.index ?? 0) + 1} of ${pending?.total}`
          : "Linking your league"
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
          {pending?.name ? `Linking ${pending.name}` : "Linking your leagues"}
        </ChecklistRow>
        <ChecklistRow state={confirmState}>Confirming</ChecklistRow>
      </ul>
    </ConnectStepCard>
  );
}

// ── 4. League selection ───────────────────────────────────────────────────────

export function ChooseLeagueStep({
  leagues,
  onConnect,
  disabled,
  remainingSlots,
}: {
  leagues: readonly EspnConnectLeagueOption[];
  onConnect: (picks: readonly EspnConnectLeagueRef[]) => void;
  disabled?: boolean;
  remainingSlots: number | null;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    defaultLeagueSelection(leagues, remainingSlots),
  );

  const cap = remainingSlots == null ? leagues.length : Math.max(0, remainingSlots);
  const capped = cap < leagues.length;
  const allSelected = selected.length === Math.min(cap, leagues.length) && selected.length > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= cap) return prev;
      return [...prev, id];
    });
  }

  function toggleAll() {
    setSelected(allSelected ? [] : defaultLeagueSelection(leagues, remainingSlots));
  }

  const picks = leagues
    .filter((league) => selected.includes(league.id))
    .map((league) => ({ id: league.id, name: league.name }));

  return (
    <ConnectStepCard
      headline="Which leagues are yours?"
      message={
        capped
          ? `We found ${leagues.length} on your ESPN account. You can connect ${cap} more.`
          : `We found ${leagues.length} on your ESPN account. Pick as many as you like.`
      }
      primary={
        <Button
          size="lg"
          disabled={disabled || picks.length === 0}
          className="w-full gap-2 font-semibold"
          onClick={() => onConnect(picks)}
        >
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          {picks.length > 1 ? `Connect ${picks.length} leagues` : "Connect league"}
        </Button>
      }
      secondary={
        <ConnectStepLink onClick={toggleAll}>
          {allSelected ? "Clear all" : "Select all"}
        </ConnectStepLink>
      }
    >
      <ul className="space-y-2 text-left">
        {leagues.map((league) => {
          const checked = selected.includes(league.id);
          const full = !checked && selected.length >= cap;
          return (
            <li key={league.id}>
              <label
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-4 transition-colors",
                  checked
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/70 bg-card/40 hover:border-primary/30",
                  (disabled || full) && "cursor-not-allowed opacity-50",
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled || full}
                  onCheckedChange={() => toggle(league.id)}
                />
                <span className="truncate text-sm font-semibold text-foreground">
                  {league.name || "ESPN league"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </ConnectStepCard>
  );
}

// ── 5. Connected ──────────────────────────────────────────────────────────────

export function ConnectedStep({
  leagues,
  failed = [],
  onConnectAnother,
  canConnectAnother,
  continueTo,
}: {
  leagues: readonly EspnConnectLeagueRef[];
  failed?: readonly EspnConnectLeagueRef[];
  onConnectAnother: () => void;
  canConnectAnother: boolean;
  continueTo: { href: string; label: string };
}) {
  const many = leagues.length > 1;

  return (
    <ConnectStepCard
      tone="success"
      mark={
        <Mark tone="success">
          <Check className="h-7 w-7" />
        </Mark>
      }
      headline={many ? `${leagues.length} leagues connected` : leagues[0]?.name || "Your league"}
      message={
        failed.length === 0
          ? "Connected. We're pulling in your league history now."
          : failed.length === 1
            ? "We're pulling in your league history now. One league didn't link — you can try it again."
            : "We're pulling in your league history now. Some leagues didn't link — you can try them again."
      }
      primary={
        <Button asChild size="lg" className="w-full gap-2 font-semibold">
          <Link to={continueTo.href}>{continueTo.label}</Link>
        </Button>
      }
      secondary={
        canConnectAnother ? (
          <ConnectStepLink onClick={onConnectAnother}>Connect another league</ConnectStepLink>
        ) : undefined
      }
    >
      {many && (
        <ul className="space-y-2 text-left">
          {leagues.map((league) => (
            <li
              key={league.id}
              className="flex items-center gap-3 rounded-xl border border-lime-500/20 bg-lime-500/5 px-4 py-3"
            >
              <Check className="h-4 w-4 shrink-0 text-lime-400" />
              <span className="truncate text-sm font-medium text-foreground">{league.name}</span>
            </li>
          ))}
        </ul>
      )}
      {failed.length > 0 && (
        <ul className="space-y-2 text-left">
          {failed.map((league) => (
            <li
              key={league.id}
              className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span className="truncate text-sm font-medium text-muted-foreground">
                {league.name} didn't link
              </span>
            </li>
          ))}
        </ul>
      )}
    </ConnectStepCard>
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
