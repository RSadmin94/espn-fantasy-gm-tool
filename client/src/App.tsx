// FILE: client/src/App.tsx
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { trackEvent, checkReturnVisit } from "@/lib/trackEvent";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function PageTracker() {
  const location = useLocation();
  const page = `${location.pathname}${location.search}`;

  useEffect(() => {
    trackEvent("page_view", page, { page });
  }, [page]);

  return null;
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
          <PageTracker />
          <Toaster />
          <Outlet />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
