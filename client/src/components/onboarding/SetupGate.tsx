import { Navigate, useLocation } from "react-router";
import { trpc } from "@/lib/trpc";
import {
  incompleteLeague,
  setupGateDestination,
  setupPhase,
  type OnboardingLeagueRow,
} from "@/lib/onboardingSetup";

const EXEMPT_PREFIXES = [
  "/connect",
  "/import/sleeper-workbook",
  "/connected-leagues",
  "/select-team",
  "/settings",
  "/claim",
  "/sync",
  "/sign-in",
  "/admin",
];

function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Redirect incomplete users using server setup authority.
 * Connected Leagues stays reachable as a management page — it is not the default next step.
 */
export function SetupGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const sessionQ = trpc.me.session.useQuery();
  const limitsQ = trpc.league.getConnectionLimits.useQuery(undefined, {
    enabled: sessionQ.data?.isAuthenticated && !sessionQ.data?.isDemo,
  });
  const profileQ = trpc.me.activeProfile.useQuery(undefined, {
    enabled: sessionQ.data?.isAuthenticated && !sessionQ.data?.isDemo,
  });
  const leaguesQ = trpc.league.getMyLeagues.useQuery(undefined, {
    enabled: sessionQ.data?.isAuthenticated && !sessionQ.data?.isDemo,
  });

  if (isExempt(location.pathname)) return <>{children}</>;

  const isDemo = sessionQ.data?.isDemo === true;
  const used = limitsQ.data?.used ?? null;
  const phase = setupPhase({
    isAuthenticated: sessionQ.data?.isAuthenticated === true,
    isDemo,
    connectedLeagueCount: limitsQ.isSuccess ? used : null,
    isSetupComplete: profileQ.isSuccess ? profileQ.data?.isSetupComplete === true : null,
  });
  const incomplete = incompleteLeague((leaguesQ.data ?? []) as OnboardingLeagueRow[]);
  const dest = setupGateDestination({
    phase,
    pathname: location.pathname,
    incomplete,
  });

  if (dest) {
    return <Navigate to={dest} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
