import { Link } from "react-router";
import { trpc } from "@/lib/trpc";

/**
 * DEMO MODE banner. Renders on every protected page ONLY when the current session is the
 * curated read-only demo account (server-authoritative via me.session.isDemo). Renders
 * nothing for every real user, so it has zero effect on normal sessions.
 */
export function DemoBanner() {
  const { data } = trpc.me.session.useQuery(undefined, { staleTime: 60_000 });
  if (!data?.isDemo) return null;

  return (
    <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-lime-500/30 bg-lime-500/10 px-4 py-2 text-center text-sm text-lime-100 backdrop-blur">
      <span className="font-bold">🏈 DEMO MODE</span>
      <span className="text-lime-100/80">
        You're exploring Fantasy Football Rivals using a sample league. Import your own ESPN
        league to unlock your personal league history.
      </span>
      <Link
        to="/sign-in"
        className="rounded-md bg-lime-500 px-3 py-1 text-xs font-bold text-black transition-colors hover:bg-lime-400"
      >
        Import My League
      </Link>
    </div>
  );
}

export default DemoBanner;
