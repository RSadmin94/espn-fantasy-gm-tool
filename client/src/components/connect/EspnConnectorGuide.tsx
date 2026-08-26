import { Link } from "react-router";
import { Plug, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const CONNECTOR_NAME = "Fantasy Football Rivals ESPN Connector";

export const ESPN_CONNECTOR_STEPS = [
  {
    step: 1,
    title: `Install ${CONNECTOR_NAME}`,
    detail: "Add the Chrome extension — it is the secure bridge for private ESPN league data.",
  },
  {
    step: 2,
    title: "Open ESPN Fantasy Football",
    detail: "Log in at fantasy.espn.com with the account that can see your league.",
  },
  {
    step: 3,
    title: "Connect your league",
    detail: "Link your league here so Fantasy Football Rivals knows which league to load.",
  },
  {
    step: 4,
    title: "Sync league history",
    detail: "Run Sync my league or Import league history to pull seasons into the app.",
  },
] as const;

const CONNECTOR_NOTES = [
  `The ${CONNECTOR_NAME} is required for private ESPN league data the app cannot fetch on its own.`,
  "It does not replace Fantasy Football Rivals — you still use this site for rivalries, profiles, and league history.",
  "It only passes your ESPN session and league data securely to Fantasy Football Rivals. We never ask for your ESPN password in the app.",
];

type EspnConnectorGuideProps = {
  /** Highlight the active step in the 4-step path (1–4). */
  highlightStep?: 1 | 2 | 3 | 4;
  className?: string;
  /** Shorter layout for Sync Data when league is already connected. */
  variant?: "full" | "compact";
};

export function EspnConnectorGuide({
  highlightStep,
  className,
  variant = "full",
}: EspnConnectorGuideProps) {
  if (variant === "compact") {
    return (
      <div
        className={cn(
          "rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3 text-sm text-muted-foreground",
          className,
        )}
      >
        <p className="font-medium text-foreground">{CONNECTOR_NAME}</p>
        <p className="mt-1 leading-relaxed">
          Required for private ESPN data. It does not replace this app — it only passes your ESPN session and league
          data securely to Fantasy Football Rivals.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card/60 px-4 py-4 sm:px-5 sm:py-5",
        className,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">ESPN setup</p>
      <h2 className="mt-1 text-base font-bold text-foreground">{CONNECTOR_NAME}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Four steps to get your league into Fantasy Football Rivals.
      </p>

      <ol className="mt-4 space-y-3">
        {ESPN_CONNECTOR_STEPS.map((item) => {
          const active = highlightStep === item.step;
          return (
            <li
              key={item.step}
              className={cn(
                "flex gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                active
                  ? "border-primary/35 bg-primary/[0.06]"
                  : "border-transparent bg-muted/20",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {item.step}
              </span>
              <div className="min-w-0">
                <p className={cn("text-sm font-semibold", active ? "text-foreground" : "text-foreground/90")}>
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <ul className="mt-4 space-y-2 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
        {CONNECTOR_NOTES.map((note) => (
          <li key={note} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/80" aria-hidden />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EspnConnectorCtaRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Link
        to="/connect/espn"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <Plug className="h-3.5 w-3.5" />
        Connect ESPN
      </Link>
      <Link
        to="/sync"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Sync Data
      </Link>
    </div>
  );
}
