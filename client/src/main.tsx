import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, Navigate, Outlet, RouterProvider } from "react-router";
import superjson from "superjson";
import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  SignIn,
  useAuth,
} from "@clerk/react-router";
import { AppShell } from "./components/AppShell";
import { DemoBanner } from "./components/DemoBanner";
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
import { Transactions } from "./pages/Transactions";
import { Standings } from "./pages/Standings";
import DynastyPowerRankings from "./pages/DynastyPowerRankings";
import { Roster } from "./pages/Roster";
import { Trades } from "./pages/Trades";
import { Advisor } from "./pages/Advisor";
import { LeagueDna } from "./pages/LeagueDna";
import { TheCast } from "./pages/TheCast";
import { Settings } from "./pages/Settings";
import { Matchups } from "./pages/Matchups";
import { LeagueHistory } from "./pages/LeagueHistory";
import { DraftHistory } from "./pages/DraftHistory";
import { KeeperAdvisor } from "./pages/KeeperAdvisor";
import { LeagueKeeperForecast } from "./pages/LeagueKeeperForecast";
import { LeagueSettings } from "./pages/LeagueSettings";
import { OwnerProfiles } from "./pages/OwnerProfiles";
import { HallOfFame } from "./pages/HallOfFame";
import { DraftRealitySimulator } from "./pages/DraftRealitySimulator";
import { WhyHaventIWon } from "./pages/WhyHaventIWon";
import { ChampionshipDiagnosis } from "./pages/ChampionshipDiagnosis";
import { AcquisitionImpact } from "./pages/AcquisitionImpact";
import { LeagueDataHealth } from "./pages/LeagueDataHealth";
import { OwnerIdentityReview } from "./pages/OwnerIdentityReview";
import { PlayerDatabase }    from "./pages/PlayerDatabase";
import { LeagueWire }         from "./pages/LeagueWire";
import { DraftWarRoom }      from "./pages/DraftWarRoom";
import { RivalryCenter }     from "./pages/RivalryCenter";
import { AdminConversionFunnel } from "./pages/AdminConversionFunnel";
import { CommissionerCommandCenter } from "./pages/CommissionerCommandCenter";
import { FeatureRouteGate } from "./components/FeatureRouteGate";
import { SignatureReveal } from "./pages/SignatureReveal";
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
      <AppShell />
    </>
  );
}

// Placeholder page component
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold text-foreground">{title}</h1>
      <p className="mt-4 text-muted-foreground">Coming soon</p>
    </div>
  );
}

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
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/connect", element: <ConnectESPN /> },
          { path: "/connect/sleeper", element: <ConnectSleeper /> },
          { path: "/import/sleeper-workbook", element: <ImportSleeperWorkbook /> },
          { path: "/sync", element: <SyncData /> },
          { path: "/commissioner-command-center", element: <FeatureRouteGate route="/commissioner-command-center"><CommissionerCommandCenter /></FeatureRouteGate> },
          { path: "/league-settings",      element: <LeagueSettings /> },
          { path: "/owner-profiles",         element: <FeatureRouteGate route="/owner-profiles"><OwnerProfiles /></FeatureRouteGate> },
          { path: "/league-data-health",     element: <LeagueDataHealth /> },
          { path: "/owner-identity-review",  element: <OwnerIdentityReview /> },
          { path: "/player-intelligence",    element: <Navigate to="/player-database" replace /> },
          { path: "/player-database",         element: <PlayerDatabase /> },
          { path: "/league-wire",               element: <LeagueWire /> },
          { path: "/draft-war-room",           element: <FeatureRouteGate route="/draft-war-room"><DraftWarRoom /></FeatureRouteGate> },
          { path: "/transactions", element: <FeatureRouteGate route="/transactions"><Transactions /></FeatureRouteGate> },
          { path: "/standings", element: <Standings /> },
          { path: "/dynasty-power-rankings", element: <DynastyPowerRankings /> },
          { path: "/matchups", element: <Matchups /> },
          { path: "/rivalry-center", element: <RivalryCenter /> },
          { path: "/history", element: <LeagueHistory /> },
          { path: "/league-timeline", element: <Navigate to="/history" replace /> },
          { path: "/draft-history", element: <DraftHistory /> },
          { path: "/keeper-advisor", element: <KeeperAdvisor /> },
      { path: "/keeper-forecast", element: <LeagueKeeperForecast /> },
          { path: "/hall-of-fame", element: <HallOfFame /> },
          { path: "/draft-reality", element: <DraftRealitySimulator /> },
          { path: "/why-havent-i-won", element: <Navigate to="/championship-diagnosis" replace /> },
      { path: "/championship-diagnosis", element: <FeatureRouteGate route="/championship-diagnosis"><ChampionshipDiagnosis /></FeatureRouteGate> },
      { path: "/league-dna", element: <LeagueDna /> },
          { path: "/the-cast", element: <TheCast /> },
          { path: "/championship-path", element: <Navigate to="/championship-diagnosis" replace /> },
          { path: "/acquisition-impact", element: <FeatureRouteGate route="/acquisition-impact"><AcquisitionImpact /></FeatureRouteGate> },
          { path: "/ring-of-honor", element: <Navigate to="/hall-of-fame" replace /> },
          { path: "/roster", element: <Roster /> },
          { path: "/trades", element: <FeatureRouteGate route="/trades"><Trades /></FeatureRouteGate> },
          { path: "/advisor", element: <FeatureRouteGate route="/advisor"><Advisor /></FeatureRouteGate> },
          { path: "/settings", element: <Settings /> },

          // ── Legacy route redirects ────────────────────────────────────
          { path: "/command-center", element: <Navigate to="/dashboard" replace /> },
          { path: "/championships", element: <Navigate to="/hall-of-fame" replace /> },
          { path: "/rosters", element: <Navigate to="/roster" replace /> },
          { path: "/refresh", element: <Navigate to="/sync" replace /> },
          { path: "/data-center", element: <Navigate to="/sync" replace /> },
          { path: "/data-health", element: <Navigate to="/sync" replace /> },
          { path: "/trade", element: <Navigate to="/trades" replace /> },
          { path: "/trade-lab", element: <Navigate to="/trades" replace /> },
          { path: "/trade-offer", element: <Navigate to="/trades" replace /> },
          { path: "/billing/success", element: <Navigate to="/settings" replace /> },
          { path: "/billing/cancel", element: <Navigate to="/settings" replace /> },
          { path: "/keeper-lab", element: <Navigate to="/dashboard" replace /> },
          { path: "/waiver-lab", element: <Navigate to="/dashboard" replace /> },
          { path: "/waiver", element: <Navigate to="/dashboard" replace /> },
          { path: "/opponent-intel", element: <Navigate to="/dashboard" replace /> },
          { path: "/backtesting", element: <Navigate to="/dashboard" replace /> },
          { path: "/gm-memory", element: <Navigate to="/dashboard" replace /> },
          { path: "/draft", element: <Navigate to="/dashboard" replace /> },
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
