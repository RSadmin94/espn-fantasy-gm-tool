import { AuthenticateWithRedirectCallback, ClerkProvider, SignIn, SignUp, useAuth } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import superjson from "superjson";
import App from "./App";
import Dashboard from "./pages/Dashboard";
import Standings from "./pages/Standings";
import Rosters from "./pages/Rosters";
import DraftHistory from "./pages/DraftHistory";
import Transactions from "./pages/Transactions";
import DynastyValues from "./pages/DynastyValues";
import Keepers from "./pages/Keepers";
import Matchups from "./pages/Matchups";
import TradeAnalyzer from "./pages/TradeAnalyzer";
import WaiverWire from "./pages/WaiverWire";
import Advisor from "./pages/Advisor";
import DataRefresh from "./pages/DataRefresh";
import StartSit from "./pages/StartSit";
import KeeperCalculator from "./pages/KeeperCalculator";
import PlayerProfiles from "./pages/PlayerProfiles";
import OwnerStats from "./pages/OwnerStats";
import UsageMonitor from "./pages/UsageMonitor";
import PickValueCalculator from "./pages/PickValueCalculator";
import DraftPickTracker from "./pages/DraftPickTracker";
import KeeperROI from "./pages/KeeperROI";
import TradeOfferGenerator from "./pages/TradeOfferGenerator";
import DataHealth from "./pages/DataHealth";
import WeeklyStats from "./pages/WeeklyStats";
import LeagueAnalytics from "./pages/LeagueAnalytics";
import ManagerBehavior from "./pages/ManagerBehavior";
import CommandCenter from "@/pages/hubs/CommandCenter";
import DraftWarRoom from "@/pages/hubs/DraftWarRoom";
import KeeperLab from "@/pages/hubs/KeeperLab";
import TradeLab from "@/pages/hubs/TradeLab";
import WaiverLab from "@/pages/hubs/WaiverLab";
import OpponentIntel from "@/pages/hubs/OpponentIntel";
import DataCenter from "@/pages/hubs/DataCenter";
import BacktestingHub from "@/pages/hubs/BacktestingHub";
import GMDecisionMemory from "@/pages/hubs/GMDecisionMemory";
import MLForecast from "@/pages/MLForecast";
import WeeklyIntelligence from "@/pages/hubs/WeeklyIntelligence";
import OffseasonHub from "@/pages/hubs/OffseasonHub";
import LeagueConnect from "@/pages/LeagueConnect";
import Reveal from "@/pages/Reveal";
import BillingSuccess from "@/pages/BillingSuccess";
import BillingCancel from "@/pages/BillingCancel";
import BehavioralAnalytics from "@/pages/BehavioralAnalytics";
import ActivityCaptureDashboard from "@/pages/ActivityCaptureDashboard";
import NotFound from "@/pages/NotFound";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  console.warn("[Clerk] VITE_CLERK_PUBLISHABLE_KEY is not set — auth will not work");
}

const queryClient = new QueryClient();

const isUnauthorizedTrpcError = (error: TRPCClientError<any>) => {
  const data = error.data as { code?: string; httpStatus?: number } | undefined;

  if (data?.code === "UNAUTHORIZED" || data?.httpStatus === 401) return true;
  if (data?.code || data?.httpStatus) return false;

  return error.message === UNAUTHED_ERR_MSG;
};

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = isUnauthorizedTrpcError(error);

  if (!isUnauthorized) return;

  const redirectUrl = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  window.location.href = `/sign-in?redirect_url=${redirectUrl}`;
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

function CenteredAuthPage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      {children}
    </div>
  );
}

function SignInPage() {
  return (
    <CenteredAuthPage>
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/command-center"
      />
    </CenteredAuthPage>
  );
}

function SignUpPage() {
  return (
    <CenteredAuthPage>
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/command-center"
      />
    </CenteredAuthPage>
  );
}

function SsoCallbackPage() {
  return (
    <AuthenticateWithRedirectCallback
      signInFallbackRedirectUrl="/command-center"
      signUpFallbackRedirectUrl="/command-center"
    />
  );
}

function AuthLoadingPage() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      Loading...
    </div>
  );
}

function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY ?? ""}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/command-center"
      signUpFallbackRedirectUrl="/command-center"
    >
      <App />
    </ClerkProvider>
  );
}

function ProtectedLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <AuthLoadingPage />;
  if (!isSignedIn) return <Navigate to="/sign-in" replace />;

  return <Outlet />;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { path: "sign-in/*", element: <SignInPage /> },
      { path: "sign-up/*", element: <SignUpPage /> },
      { path: "sso-callback", element: <SsoCallbackPage /> },
      {
        element: <ProtectedLayout />,
        children: [
          { index: true, element: <Navigate to="/command-center" replace /> },
          { path: "command-center", element: <CommandCenter /> },
          { path: "dashboard", element: <Dashboard /> },
          { path: "draft-war-room", element: <DraftWarRoom /> },
          { path: "keeper-lab", element: <KeeperLab /> },
          { path: "trade-lab", element: <TradeLab /> },
          { path: "waiver-lab", element: <WaiverLab /> },
          { path: "opponent-intel", element: <OpponentIntel /> },
          { path: "data-center", element: <DataCenter /> },
          { path: "backtesting", element: <BacktestingHub /> },
          { path: "gm-memory", element: <GMDecisionMemory /> },
          { path: "standings", element: <Standings /> },
          { path: "rosters", element: <Rosters /> },
          { path: "draft", element: <DraftHistory /> },
          { path: "keepers", element: <Keepers /> },
          { path: "keeper-calculator", element: <KeeperCalculator /> },
          { path: "matchups", element: <Matchups /> },
          { path: "trade", element: <TradeAnalyzer /> },
          { path: "waiver", element: <WaiverWire /> },
          { path: "advisor", element: <Advisor /> },
          { path: "refresh", element: <DataRefresh /> },
          { path: "startsit", element: <StartSit /> },
          { path: "player-profiles", element: <PlayerProfiles /> },
          { path: "owner-stats", element: <OwnerStats /> },
          { path: "usage-monitor", element: <UsageMonitor /> },
          { path: "pick-value", element: <PickValueCalculator /> },
          { path: "pick-tracker", element: <DraftPickTracker /> },
          { path: "transactions", element: <Transactions /> },
          { path: "dynasty-values", element: <DynastyValues /> },
          { path: "keeper-roi", element: <KeeperROI /> },
          { path: "trade-offer", element: <TradeOfferGenerator /> },
          { path: "data-health", element: <DataHealth /> },
          { path: "weekly-stats", element: <WeeklyStats /> },
          { path: "analytics", element: <LeagueAnalytics /> },
          { path: "manager-behavior", element: <ManagerBehavior /> },
          { path: "ml-forecast", element: <MLForecast /> },
          { path: "weekly-intelligence", element: <WeeklyIntelligence /> },
          { path: "offseason", element: <OffseasonHub /> },
          { path: "connect", element: <LeagueConnect /> },
          { path: "reveal", element: <Reveal /> },
          { path: "billing/success", element: <BillingSuccess /> },
          { path: "billing/cancel", element: <BillingCancel /> },
          { path: "admin/behavioral", element: <BehavioralAnalytics /> },
          { path: "admin/activity-capture", element: <ActivityCaptureDashboard /> },
          { path: "404", element: <NotFound /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </trpc.Provider>
);
