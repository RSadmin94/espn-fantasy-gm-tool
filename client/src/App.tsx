import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Standings from "./pages/Standings";
import Rosters from "./pages/Rosters";
import DraftHistory from "./pages/DraftHistory";
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
import PickValueCalculator from "./pages/PickValueCalculator";
import DraftPickTracker from "./pages/DraftPickTracker";
import KeeperROI from "./pages/KeeperROI";
import TradeOfferGenerator from "./pages/TradeOfferGenerator";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/standings" component={Standings} />
      <Route path="/rosters" component={Rosters} />
      <Route path="/draft" component={DraftHistory} />
      <Route path="/keepers" component={Keepers} />
      <Route path="/keeper-calculator" component={KeeperCalculator} />
      <Route path="/matchups" component={Matchups} />
      <Route path="/trade" component={TradeAnalyzer} />
      <Route path="/waiver" component={WaiverWire} />
      <Route path="/advisor" component={Advisor} />
      <Route path="/refresh" component={DataRefresh} />
      <Route path="/startsit" component={StartSit} />
      <Route path="/player-profiles" component={PlayerProfiles} />
      <Route path="/owner-stats" component={OwnerStats} />
      <Route path="/pick-value" component={PickValueCalculator} />
      <Route path="/pick-tracker" component={DraftPickTracker} />
      <Route path="/keeper-roi" component={KeeperROI} />
      <Route path="/trade-offer" component={TradeOfferGenerator} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
