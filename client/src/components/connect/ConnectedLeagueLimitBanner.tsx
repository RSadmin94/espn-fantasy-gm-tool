import { Link } from "react-router";
import { AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CONNECTED_LEAGUE_COPY } from "@/lib/commercialCopy";

/** Blocks connect/import CTAs when the account is at the 5-league cap. */
export function ConnectedLeagueLimitBanner({ className }: { className?: string }) {
  const limitsQ = trpc.league.getConnectionLimits.useQuery();

  if (!limitsQ.data?.atLimit) return null;

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between ${className ?? ""}`}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{CONNECTED_LEAGUE_COPY.atLimitMessage}</p>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0 border-amber-500/40 text-amber-100">
        <Link to="/connected-leagues">{CONNECTED_LEAGUE_COPY.manageCta}</Link>
      </Button>
    </div>
  );
}

export function useConnectedLeagueLimits() {
  const limitsQ = trpc.league.getConnectionLimits.useQuery();
  return {
    ...limitsQ,
    atLimit: limitsQ.data?.atLimit ?? false,
    remaining: limitsQ.data?.remaining ?? 5,
    used: limitsQ.data?.used ?? 0,
    max: limitsQ.data?.max ?? 5,
  };
}
