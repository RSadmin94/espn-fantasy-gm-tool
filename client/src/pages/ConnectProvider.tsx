import { Link } from "react-router";
import { ChevronRight } from "lucide-react";

const PROVIDERS = [
  {
    id: "espn",
    title: "ESPN",
    description: "Connect the leagues you're already playing on ESPN.",
    href: "/connect/espn",
  },
  {
    id: "sleeper",
    title: "Sleeper",
    description: "Connect with your Sleeper league — no browser add-on required.",
    href: "/connect/sleeper",
  },
] as const;

export function ConnectProvider() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-8 px-4 py-8 sm:py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Where do you play?</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Pick the site that hosts your fantasy league. You can add another later.
        </p>
      </div>
      <div className="grid gap-3">
        {PROVIDERS.map((p) => (
          <Link
            key={p.id}
            to={p.href}
            className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-5 text-left transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>
              <span className="block text-lg font-semibold text-foreground">{p.title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                {p.description}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
