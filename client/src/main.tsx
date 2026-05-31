import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import superjson from "superjson";
import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  SignIn,
  useAuth,
} from "@clerk/react-router";
import { AppShell } from "./components/AppShell";
import { ConnectESPN } from "./pages/ConnectESPN";
import { SyncData } from "./pages/SyncData";
import { Dashboard } from "./pages/Dashboard";
import { Transactions } from "./pages/Transactions";
import { Standings } from "./pages/Standings";
import { Roster } from "./pages/Roster";
import { Trades } from "./pages/Trades";
import { Advisor } from "./pages/Advisor";
import { Settings } from "./pages/Settings";
import { Matchups } from "./pages/Matchups";
import { LeagueHistory } from "./pages/LeagueHistory";
import { LeagueTimeline } from "./pages/LeagueTimeline";
import { DraftHistory } from "./pages/DraftHistory";
import { KeeperAdvisor } from "./pages/KeeperAdvisor";
import { LeagueSettings } from "./pages/LeagueSettings";
import { OwnerProfiles } from "./pages/OwnerProfiles";
import { HallOfFame } from "./pages/HallOfFame";
import { LeagueDataHealth } from "./pages/LeagueDataHealth";
import { OwnerIdentityReview } from "./pages/OwnerIdentityReview";
import { PlayerIntelligence } from "./pages/PlayerIntelligence";
import { PlayerDatabase }    from "./pages/PlayerDatabase";
import { LeagueWire }         from "./pages/LeagueWire";
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
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn routing="path" path="/sign-in" signUpUrl={undefined} />
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
    <AppShell>
      <Outlet />
    </AppShell>
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

const router = createBrowserRouter([
  {
    element: (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY ?? ""}>
        <Outlet />
      </ClerkProvider>
    ),
    children: [
      { path: "/sign-in", element: <SignInPage /> },
      { path: "/sign-in/*", element: <SignInPage /> },
      { path: "/sso-callback", element: <SSOCallbackPage /> },
      {
        element: <ProtectedLayout />,
        children: [
          // ── Active routes ─────────────────────────────────────────────
          { path: "/", element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/connect", element: <ConnectESPN /> },
          { path: "/sync", element: <SyncData /> },
          { path: "/league-settings",      element: <LeagueSettings /> },
          { path: "/owner-profiles",         element: <OwnerProfiles /> },
          { path: "/league-data-health",     element: <LeagueDataHealth /> },
          { path: "/owner-identity-review",  element: <OwnerIdentityReview /> },
          { path: "/player-intelligence",    element: <PlayerIntelligence /> },
          { path: "/player-database",         element: <PlayerDatabase /> },
          { path: "/league-wire",               element: <LeagueWire /> },
          { path: "/transactions", element: <Transactions /> },
          { path: "/standings", element: <Standings /> },
          { path: "/matchups", element: <Matchups /> },
          { path: "/history", element: <LeagueHistory /> },
          { path: "/league-timeline", element: <LeagueTimeline /> },
          { path: "/draft-history", element: <DraftHistory /> },
          { path: "/keeper-advisor", element: <KeeperAdvisor /> },
          { path: "/hall-of-fame", element: <HallOfFame /> },
          { path: "/ring-of-honor", element: <Navigate to="/hall-of-fame" replace /> },
          { path: "/roster", element: <Roster /> },
          { path: "/trades", element: <Trades /> },
          { path: "/advisor", element: <Advisor /> },
          { path: "/settings", element: <Settings /> },

          // ── Legacy route redirects ────────────────────────────────────
          // Chrome extension posts here after ESPN connect
          { path: "/command-center", element: <Navigate to="/dashboard" replace /> },
          // Renamed routes
          { path: "/championships", element: <Navigate to="/hall-of-fame" replace /> },
          { path: "/rosters", element: <Navigate to="/roster" replace /> },
          { path: "/refresh", element: <Navigate to="/sync" replace /> },
          { path: "/data-center", element: <Navigate to="/sync" replace /> },
          { path: "/data-health", element: <Navigate to="/sync" replace /> },
          // Trade-related old paths
          { path: "/trade", element: <Navigate to="/trades" replace /> },
          { path: "/trade-lab", element: <Navigate to="/trades" replace /> },
          { path: "/trade-offer", element: <Navigate to="/trades" replace /> },
          // Billing routes now live under settings
          { path: "/billing/success", element: <Navigate to="/settings" replace /> },
          { path: "/billing/cancel", element: <Navigate to="/settings" replace /> },
          // All other old hub/feature paths → dashboard
          { path: "/draft-war-room", element: <Navigate to="/dashboard" replace /> },
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
          { path: "/reveal", element: <Navigate to="/dashboard" replace /> },
          { path: "/admin/behavioral", element: <Navigate to="/dashboard" replace /> },
          { path: "/admin/activity-capture", element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <Toaster richColors closeButton />
      <RouterProvider router={router} />
    </QueryClientProvider>
  </trpc.Provider>
);
