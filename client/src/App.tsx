// FILE: client/src/App.tsx
import { AuthenticateWithRedirectCallback, SignIn, SignUp, useAuth } from "@clerk/react-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { trackEvent, checkReturnVisit } from "@/lib/trackEvent";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
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

function PageTracker() {
  const location = useLocation();
  const page = `${location.pathname}${location.search}`;

  useEffect(() => {
    trackEvent("page_view", page, { page });
  }, [page]);

  return null;
}

function CenteredAuthPage({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      {children}
    </div>
  );
}

function SignInRoute() {
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

function SignUpRoute() {
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

function SsoCallbackRoute() {
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

function ProtectedLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) return <AuthLoadingPage />;

  if (!isSignedIn) {
    const redirectUrl = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/sign-in?redirect_url=${redirectUrl}`} replace />;
  }

  return <Outlet />;
}

function Router() {
  return (
    <>
      <PageTracker />
      <Routes>
        <Route path="/sign-in/*" element={<SignInRoute />} />
        <Route path="/sign-up/*" element={<SignUpRoute />} />
        <Route path="/sso-callback" element={<SsoCallbackRoute />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/command-center" replace />} />
          <Route path="/command-center" element={<CommandCenter />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/draft-war-room" element={<DraftWarRoom />} />
          <Route path="/keeper-lab" element={<KeeperLab />} />
          <Route path="/trade-lab" element={<TradeLab />} />
          <Route path="/waiver-lab" element={<WaiverLab />} />
          <Route path="/opponent-intel" element={<OpponentIntel />} />
          <Route path="/data-center" element={<DataCenter />} />
          <Route path="/backtesting" element={<BacktestingHub />} />
          <Route path="/gm-memory" element={<GMDecisionMemory />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/rosters" element={<Rosters />} />
          <Route path="/draft" element={<DraftHistory />} />
          <Route path="/keepers" element={<Keepers />} />
          <Route path="/keeper-calculator" element={<KeeperCalculator />} />
          <Route path="/matchups" element={<Matchups />} />
          <Route path="/trade" element={<TradeAnalyzer />} />
          <Route path="/waiver" element={<WaiverWire />} />
          <Route path="/advisor" element={<Advisor />} />
          <Route path="/refresh" element={<DataRefresh />} />
          <Route path="/startsit" element={<StartSit />} />
          <Route path="/player-profiles" element={<PlayerProfiles />} />
          <Route path="/owner-stats" element={<OwnerStats />} />
          <Route path="/usage-monitor" element={<UsageMonitor />} />
          <Route path="/pick-value" element={<PickValueCalculator />} />
          <Route path="/pick-tracker" element={<DraftPickTracker />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/dynasty-values" element={<DynastyValues />} />
          <Route path="/keeper-roi" element={<KeeperROI />} />
          <Route path="/trade-offer" element={<TradeOfferGenerator />} />
          <Route path="/data-health" element={<DataHealth />} />
          <Route path="/weekly-stats" element={<WeeklyStats />} />
          <Route path="/analytics" element={<LeagueAnalytics />} />
          <Route path="/manager-behavior" element={<ManagerBehavior />} />
          <Route path="/ml-forecast" element={<MLForecast />} />
          <Route path="/weekly-intelligence" element={<WeeklyIntelligence />} />
          <Route path="/offseason" element={<OffseasonHub />} />
          <Route path="/connect" element={<LeagueConnect />} />
          <Route path="/reveal" element={<Reveal />} />
          <Route path="/billing/success" element={<BillingSuccess />} />
          <Route path="/billing/cancel" element={<BillingCancel />} />
          <Route path="/admin/behavioral" element={<BehavioralAnalytics />} />
          <Route path="/admin/activity-capture" element={<ActivityCaptureDashboard />} />
          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}

function App() {
  // Session start tracking — fires once per browser session
  useEffect(() => {
    const key = "ff_gm_session_tracked";
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      trackEvent("session_start", "app");
      if (checkReturnVisit()) {
        trackEvent("return_visit", "app");
      }
    }
  }, []);

  // Drop-off tracking — fires when user leaves the page
  useEffect(() => {
    const handleDropOff = () => {
      const page = window.location.pathname;
      const timeOnPage = Date.now() - (parseInt(sessionStorage.getItem("ff_gm_page_entered") ?? "0", 10) || Date.now());
      // Use sendBeacon for reliability on page unload
      const payload = JSON.stringify({
        json: {
          eventType: "drop_off",
          featureName: "app",
          page,
          action: "page_exit",
          sessionId: sessionStorage.getItem("ff_gm_session_id"),
          metadata: JSON.stringify({ timeOnPageMs: timeOnPage }),
        },
      });
      navigator.sendBeacon("/api/trpc/usageMonitor.logUIEvent", new Blob([payload], { type: "application/json" }));
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") handleDropOff();
    };
    const handlePageEnter = () => {
      sessionStorage.setItem("ff_gm_page_entered", String(Date.now()));
    };
    window.addEventListener("beforeunload", handleDropOff);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handlePageEnter);
    handlePageEnter();
    return () => {
      window.removeEventListener("beforeunload", handleDropOff);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handlePageEnter);
    };
  }, []);
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
