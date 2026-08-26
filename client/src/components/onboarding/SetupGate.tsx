import { Navigate, useLocation } from "react-router";
import { trpc } from "@/lib/trpc";

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
 * Redirect brand-new users to connect before wandering the app.
 * Demo sessions and connect-flow routes are exempt.
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

  const isDemo = sessionQ.data?.isDemo === true;
  const used = limitsQ.data?.used ?? 0;
  const needsConnect = !isDemo && sessionQ.data?.isAuthenticated && limitsQ.isSuccess && used === 0;
  const needsTeam =
    !isDemo &&
    sessionQ.data?.isAuthenticated &&
    used > 0 &&
    profileQ.isSuccess &&
    profileQ.data?.isSetupComplete === false;

  if (!isExempt(location.pathname) && needsConnect) {
    return <Navigate to="/connect" replace state={{ from: location.pathname }} />;
  }

  if (
    !isExempt(location.pathname) &&
    needsTeam &&
    !location.pathname.startsWith("/connect/sleeper")
  ) {
    return <Navigate to="/connected-leagues" replace />;
  }

  return <>{children}</>;
}