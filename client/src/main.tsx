import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, Navigate, Outlet, RouterProvider, useParams } from "react-router";
import superjson from "superjson";
import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  SignIn,
  useAuth,
} from "@clerk/react-router";
import { AppShell } from "./components/AppShell";
import { DemoBanner } from "./components/DemoBanner";
import { SetupGate } from "./components/onboarding/SetupGate";
import { TryDemoButton } from "./components/TryDemoButton";
import { ThemeProvider } from "./context/ThemeContext";
import { ConnectESPN } from "./pages/ConnectESPN";
import { ConnectSleeper } from "./pages/ConnectSleeper";
import { ImportSleeperWorkbook } from "./pages/ImportSleeperWorkbook";
import { LandingPage } from "./pages/LandingPage";
import { ReceiptShare } from "./pages/ReceiptShare";
import { RivalryShare } from "./pages/RivalryShare";
import { Claim } from "./pages/Claim";
import { SyncData } from "./pages/SyncData";
import { Dashboard } from "./pages/Dashboard";
import { LeagueDna } from "./pages/LeagueDna";
import { Settings } from "./pages/Settings";
import { ConnectedLeagues } from "./pages/ConnectedLeagues";
import { EspnSelectTeam } from "./pages/EspnSelectTeam";
import { LeagueHistory } from "./pages/LeagueHistory";
import { LeagueSettings } from "./pages/LeagueSettings";
import { DraftRealitySimulator } from "./pages/DraftRealitySimulator";
import { LeagueDataHealth } from "./pages/LeagueDataHealth";
import { OwnerIdentityReview } from "./pages/OwnerIdentityReview";
import { PlayerDatabase }    from "./pages/PlayerDatabase";
import { RfsnHome } from "./pages/rfsn/RfsnHome";
import { RfsnLive } from "./pages/rfsn/RfsnLive";
import { RfsnWire } from "./pages/rfsn/RfsnWire";
import { RfsnBreaking } from "./pages/rfsn/RfsnBreaking";
import { RfsnStories } from "./pages/rfsn/RfsnStories";
import { RfsnRecaps } from "./pages/rfsn/RfsnRecaps";
import { RfsnAnalysts } from "./pages/rfsn/RfsnAnalysts";
import { DraftWarRoom }      from "./pages/DraftWarRoom";
import { DraftCommentary }   from "./pages/DraftCommentary";
import { AdminConversionFunnel } from "./pages/AdminConversionFunnel";
import { FeatureRouteGate } from "./components/FeatureRouteGate";
import { SignatureReveal } from "./pages/SignatureReveal";
import { Home } from "./pages/Home";
import { RivalsHub } from "./pages/rivals/RivalsHub";
import { RivalsCast } from "./pages/rivals/RivalsCast";
import { RivalsOwners } from "./pages/rivals/RivalsOwners";
import { RivalsOwnerDossier } from "./pages/rivals/RivalsOwnerDossier";
import { RivalsRivalries } from "./pages/rivals/RivalsRivalries";
import { RivalsLeagueMap } from "./pages/rivals/RivalsLeagueMap";
import { RivalsRelationships } from "./pages/rivals/RivalsRelationships";
import { MyTeamHub } from "./pages/my-team/MyTeamHub";
import { MyTeamRoster } from "./pages/my-team/MyTeamRoster";
import { MyTeamMatchup } from "./pages/my-team/MyTeamMatchup";
import { MyTeamTrades } from "./pages/my-team/MyTeamTrades";
import { MyTeamAdvisor } from "./pages/my-team/MyTeamAdvisor";
import { MyTeamProfile } from "./pages/my-team/MyTeamProfile";
import { MyTeamChampionshipPath } from "./pages/my-team/MyTeamChampionshipPath";
import { DraftHub } from "./pages/draft/DraftHub";
import { DraftWarRoomLayout, DraftWarRoomFocus } from "./pages/draft/DraftWarRoomLayout";
import { DraftKeepers } from "./pages/draft/DraftKeepers";
import { DraftHistoryPage } from "./pages/draft/DraftHistoryPage";
import { LeagueHub } from "./pages/league/LeagueHub";
import { LeagueStandings } from "./pages/league/LeagueStandings";
import { LeaguePowerRankings } from "./pages/league/LeaguePowerRankings";
import { LeaguePlayoffs } from "./pages/league/LeaguePlayoffs";
import { LeagueStrengthOfSchedule } from "./pages/league/LeagueStrengthOfSchedule";
import { LeagueArchiveLayout, LeagueArchiveFocus } from "./pages/league/LeagueArchiveLayout";
import { LeagueTransactions } from "./pages/league/LeagueTransactions";
import { LeagueAcquisitionImpact } from "./pages/league/LeagueAcquisitionImpact";
import { LeagueCommissioner } from "./pages/league/LeagueCommissioner";
import { V2PlaceholderRoute } from "./pages/v2/V2PlaceholderRoute";
import { getV2CanonicalRoutes, getV2DestinationByRoute, V2_PARAM_ROUTES } from "@/lib/v2Navigation";
import { trpc } from "@/lib/trpc";
import { getTrpcToken } from "@/lib/trpcAuth";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

if (!PUBLISHABLE_KEY) {
  console.warn("[Clerk] VITE_CLERK_PUBLISHABLE_KEY is not set — auth will not work");
}

const queryClient = new QueryClient();

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers: () => {
        const t = getTrpcToken();
        console.log("[TRPC HEADER]", !!t);
        return t ? { Authorization: `Bearer ${t}` } : {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

function LegacyWireArticleRedirect() {
  const { articleId } = useParams();
  if (!articleId) return <Navigate to="/rfsn/wire" replace />;
  return <Navigate to={`/rfsn/wire/article/${articleId}`} replace />;
}

function LegacyRfsnNewsArticleRedirect() {
  const { articleId } = useParams();
  if (!articleId) return <Navigate to="/rfsn/wire" replace />;
  return <Navigate to={`/rfsn/wire/article/${articleId}`} replace />;
}

function LoadingSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background">
      <SignIn routing="path" path="/sign-in" signUpUrl={undefined} fallbackRedirectUrl="/connect" signUpFallbackRedirectUrl="/connect" />
      <div className="flex flex-col items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">or</div>
        <TryDemoButton />
        <div className="max-w-xs text-center text-xs text-muted-foreground">
          Explore a real league read-only. No account, no ESPN connection.
        </div>
      </div>
    </div>
  );
}

function SSOCallbackPage() {
  return <AuthenticateWithRedirectCallback />;
}

function ProtectedLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingSpinner />;
  if (!isSignedIn) return <Navigate to="/sign-in" replace />;
  return (
    <>
      <DemoBanner />
      <SetupGate>
        <AppShell />
      </SetupGate>
    </>
  );
}

/** Register canonical V2 paths not yet mounted as live pages (Commit 8: all destinations live). */
const LIVE_PARAM_ROUTES = new Set(V2_PARAM_ROUTES);

const v2PlaceholderRoutes = getV2CanonicalRoutes()
  .filter((route) => {
    if (LIVE_PARAM_ROUTES.has(route)) return false;
    if (route.includes(":")) return true;
    const destination = getV2DestinationByRoute(route);
    return destination == null || destination.kind === "placeholder";
  })
  .map((route) => ({
    path: route,
    element: <V2PlaceholderRoute route={route.includes(":") ? route.replace(/\/:[^/]+/g, "") : route} />,
  }));

// Branded catch-all for unmatched routes (replaces React Router's default error UI).
function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-lime-400">
        Fantasy Football Rivals
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="text-6xl font-black tracking-tight">404</div>
        <h1 className="text-xl font-bold">Off the grid.</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The page you requested does not exist or may have moved. Head back to the war
          room to keep scouting.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/dashboard"
          className="rounded-lg bg-lime-500 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-lime-400"
        >
          Back to The Briefing
        </Link>
        <Link
          to="/connect"
          className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
        >
          Connect ESPN
        </Link>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY ?? ""}>
        <Outlet />
      </ClerkProvider>
    ),
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/sign-in", element: <SignInPage /> },
      { path: "/sign-in/*", element: <SignInPage /> },
      { path: "/sso-callback", element: <SSOCallbackPage /> },
      { path: "/p/:token", element: <ReceiptShare /> },
      { path: "/r/:code", element: <ReceiptShare /> },
      { path: "/rivalry/:shareCode", element: <RivalryShare /> },
      { path: "/claim", element: <Claim /> },
      { path: "/reveal", element: <SignatureReveal /> },
      {
        element: <ProtectedLayout />,
        children: [
          // ── Active routes ─────────────────────────────────────────────
          ...v2PlaceholderRoutes,
          { path: "/home", element: <Home /> },
          { path: "/rivals", element: <RivalsHub /> },
          { path: "/rivals/cast", element: <RivalsCast /> },
          { path: "/rivals/owners", element: <RivalsOwners /> },
          { path: "/rivals/owners/:ownerId", element: <RivalsOwnerDossier /> },
          { path: "/rivals/head-to-head", element: <Navigate to="/rivals/rivalries" replace /> },
          { path: "/rivals/rivalries", element: <RivalsRivalries /> },
          { path: "/rivals/league-map", element: <RivalsLeagueMap /> },
          { path: "/rivals/relationships", element: <RivalsRelationships /> },
          { path: "/my-team", element: <MyTeamHub /> },
          { path: "/my-team/roster", element: <MyTeamRoster /> },
          { path: "/my-team/matchup", element: <MyTeamMatchup /> },
          { path: "/my-team/trades", element: <MyTeamTrades /> },
          { path: "/my-team/advisor", element: <MyTeamAdvisor /> },
          { path: "/my-team/profile", element: <MyTeamProfile /> },
          { path: "/my-team/championship-path", element: <MyTeamChampionshipPath /> },
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/connect", element: <ConnectESPN /> },
          { path: "/connect/sleeper", element: <ConnectSleeper /> },
          { path: "/import/sleeper-workbook", element: <ImportSleeperWorkbook /> },
          { path: "/sync", element: <SyncData /> },
          { path: "/commissioner-command-center", element: <Navigate to="/league/commissioner" replace /> },
          { path: "/league-settings",      element: <LeagueSettings /> },
          { path: "/owner-profiles", element: <Navigate to="/rivals/owners" replace /> },
          { path: "/league-data-health",     element: <LeagueDataHealth /> },
          { path: "/owner-identity-review",  element: <OwnerIdentityReview /> },
          { path: "/player-intelligence",    element: <Navigate to="/player-database" replace /> },
          { path: "/player-database",         element: <PlayerDatabase /> },
          { path: "/rfsn", element: <RfsnHome /> },
          { path: "/rfsn/wire", element: <RfsnWire /> },
          { path: "/rfsn/wire/article/:articleId", element: <RfsnWire /> },
          { path: "/rfsn/breaking", element: <RfsnBreaking /> },
          { path: "/rfsn/stories", element: <RfsnStories /> },
          { path: "/rfsn/stories/article/:articleId", element: <RfsnStories /> },
          { path: "/rfsn/recaps", element: <RfsnRecaps /> },
          { path: "/rfsn/analysts", element: <RfsnAnalysts /> },
          { path: "/rfsn/news", element: <Navigate to="/rfsn/wire" replace /> },
          { path: "/rfsn/news/article/:articleId", element: <LegacyRfsnNewsArticleRedirect /> },
          { path: "/rfsn/live", element: <RfsnLive /> },
          { path: "/league-wire", element: <Navigate to="/rfsn/wire" replace /> },
          { path: "/league-wire/article/:articleId", element: <LegacyWireArticleRedirect /> },
          { path: "/draft", element: <DraftHub /> },
          {
            element: <DraftWarRoomLayout />,
            children: [
              { path: "/draft/war-room", element: <DraftWarRoomFocus /> },
              { path: "/draft/mock", element: <DraftWarRoomFocus /> },
            ],
          },
          { path: "/draft/keepers", element: <DraftKeepers /> },
          { path: "/draft/history", element: <DraftHistoryPage /> },
          { path: "/league", element: <LeagueHub /> },
          { path: "/league/standings", element: <LeagueStandings /> },
          { path: "/league/standings/power-rankings", element: <LeaguePowerRankings /> },
          { path: "/league/standings/playoffs", element: <LeaguePlayoffs /> },
          { path: "/league/standings/strength-of-schedule", element: <LeagueStrengthOfSchedule /> },
          {
            element: <LeagueArchiveLayout />,
            children: [
              { path: "/league/history", element: <LeagueArchiveFocus /> },
              { path: "/league/history/champions", element: <LeagueArchiveFocus /> },
              { path: "/league/history/hall-of-fame", element: <LeagueArchiveFocus /> },
              { path: "/league/history/records", element: <LeagueArchiveFocus /> },
              { path: "/league/history/dynasties", element: <LeagueArchiveFocus /> },
              { path: "/league/history/timeline", element: <LeagueArchiveFocus /> },
            ],
          },
          { path: "/league/history/transactions", element: <LeagueTransactions /> },
          { path: "/league/acquisition-impact", element: <LeagueAcquisitionImpact /> },
          { path: "/league/commissioner", element: <LeagueCommissioner /> },
          { path: "/draft-war-room",           element: <FeatureRouteGate route="/draft-war-room"><DraftWarRoom /></FeatureRouteGate> },
          { path: "/draft-commentary",         element: <FeatureRouteGate route="/draft-commentary"><DraftCommentary /></FeatureRouteGate> },
          { path: "/transactions", element: <Navigate to="/league/history/transactions" replace /> },
          { path: "/standings", element: <Navigate to="/league/standings" replace /> },
          { path: "/dynasty-power-rankings", element: <Navigate to="/league/standings/power-rankings" replace /> },
          { path: "/matchups", element: <Navigate to="/my-team/matchup" replace /> },
          { path: "/rivalry-center", element: <Navigate to="/rivals/rivalries" replace /> },
          { path: "/history", element: <LeagueHistory /> },
          { path: "/league-timeline", element: <Navigate to="/history" replace /> },
          { path: "/draft-history", element: <Navigate to="/draft/history" replace /> },
          { path: "/keeper-advisor", element: <Navigate to="/draft/keepers" replace /> },
          { path: "/keeper-forecast", element: <Navigate to="/draft/keepers" replace /> },
          { path: "/hall-of-fame", element: <Navigate to="/league/history/hall-of-fame" replace /> },
          { path: "/draft-reality", element: <DraftRealitySimulator /> },
          { path: "/why-havent-i-won", element: <Navigate to="/my-team/championship-path" replace /> },
          { path: "/championship-diagnosis", element: <Navigate to="/my-team/championship-path" replace /> },
          { path: "/league-dna", element: <LeagueDna /> },
          { path: "/the-cast", element: <Navigate to="/rivals/cast" replace /> },
          { path: "/championship-path", element: <Navigate to="/my-team/championship-path" replace /> },
          { path: "/acquisition-impact", element: <Navigate to="/league/acquisition-impact" replace /> },
          { path: "/ring-of-honor", element: <Navigate to="/league/history/hall-of-fame" replace /> },
          { path: "/roster", element: <Navigate to="/my-team/roster" replace /> },
          { path: "/trades", element: <Navigate to="/my-team/trades" replace /> },
          { path: "/advisor", element: <Navigate to="/my-team/advisor" replace /> },
          { path: "/settings", element: <Settings /> },
          { path: "/connected-leagues", element: <ConnectedLeagues /> },
          { path: "/select-team/espn/:leagueId", element: <EspnSelectTeam /> },

          // ── Legacy route redirects ────────────────────────────────────
          { path: "/command-center", element: <Navigate to="/dashboard" replace /> },
          { path: "/championships", element: <Navigate to="/league/history/hall-of-fame" replace /> },
          { path: "/rosters", element: <Navigate to="/my-team/roster" replace /> },
          { path: "/refresh", element: <Navigate to="/sync" replace /> },
          { path: "/data-center", element: <Navigate to="/sync" replace /> },
          { path: "/data-health", element: <Navigate to="/sync" replace /> },
          { path: "/trade", element: <Navigate to="/my-team/trades" replace /> },
          { path: "/trade-lab", element: <Navigate to="/my-team/trades" replace /> },
          { path: "/trade-offer", element: <Navigate to="/my-team/trades" replace /> },
          { path: "/billing/success", element: <Navigate to="/settings" replace /> },
          { path: "/billing/cancel", element: <Navigate to="/settings" replace /> },
          { path: "/keeper-lab", element: <Navigate to="/dashboard" replace /> },
          { path: "/waiver-lab", element: <Navigate to="/dashboard" replace /> },
          { path: "/waiver", element: <Navigate to="/dashboard" replace /> },
          { path: "/opponent-intel", element: <Navigate to="/dashboard" replace /> },
          { path: "/backtesting", element: <Navigate to="/dashboard" replace /> },
          { path: "/gm-memory", element: <Navigate to="/dashboard" replace /> },
          // `/draft` is owned by V2 Draft hub (placeholder) — do not redirect to dashboard.
          { path: "/keepers", element: <Navigate to="/dashboard" replace /> },
          { path: "/keeper-calculator", element: <Navigate to="/dashboard" replace /> },
          { path: "/keeper-roi", element: <Navigate to="/dashboard" replace /> },
          { path: "/startsit", element: <Navigate to="/dashboard" replace /> },
          { path: "/player-profiles", element: <Navigate to="/dashboard" replace /> },
          { path: "/owner-stats", element: <Navigate to="/dashboard" replace /> },
          { path: "/usage-monitor", element: <Navigate to="/settings" replace /> },
          { path: "/pick-value", element: <Navigate to="/dashboard" replace /> },
          { path: "/pick-tracker", element: <Navigate to="/dashboard" replace /> },
          { path: "/dynasty-values", element: <Navigate to="/dashboard" replace /> },
          { path: "/weekly-stats", element: <Navigate to="/dashboard" replace /> },
          { path: "/analytics", element: <Navigate to="/dashboard" replace /> },
          { path: "/manager-behavior", element: <Navigate to="/dashboard" replace /> },
          { path: "/ml-forecast", element: <Navigate to="/dashboard" replace /> },
          { path: "/weekly-intelligence", element: <Navigate to="/dashboard" replace /> },
          { path: "/offseason", element: <Navigate to="/dashboard" replace /> },
          { path: "/admin/behavioral", element: <Navigate to="/dashboard" replace /> },
          { path: "/admin/activity-capture", element: <Navigate to="/dashboard" replace /> },
          { path: "/admin/conversion-funnel", element: <AdminConversionFunnel /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <Toaster richColors closeButton />
      <RouterProvider router={router} />
    </QueryClientProvider>
  </trpc.Provider>
  </ThemeProvider>
);
