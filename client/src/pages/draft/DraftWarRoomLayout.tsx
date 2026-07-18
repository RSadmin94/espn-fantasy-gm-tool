/**
 * Shared mount for `/draft/live`, `/draft/war-room`, and `/draft/mock`.
 * Keeps a single DraftWarRoom instance so live / clock / pause state survives
 * navigation between canonical destinations.
 *
 * RFSN-013 — Live Draft is the platform-neutral real-draft entry; Mock is practice only.
 */
import { Outlet, useLocation } from "react-router";
import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { DraftWarRoom } from "@/pages/DraftWarRoom";

export function DraftWarRoomLayout() {
  const { pathname } = useLocation();
  const focusLive = pathname === "/draft/live" || pathname.endsWith("/draft/live");
  const focusMock = pathname === "/draft/mock" || pathname.endsWith("/draft/mock");
  const scrollToSection = focusLive || focusMock ? "dwr-mock" : undefined;

  return (
    <FeatureRouteGate route="/draft-war-room">
      <div
        data-v2-draft-war-room
        data-v2-draft-live={focusLive ? "true" : undefined}
        data-v2-draft-mock={focusMock ? "true" : undefined}
      >
        <DraftWarRoom scrollToSection={scrollToSection} preferLiveDraft={focusLive} />
        <Outlet />
      </div>
    </FeatureRouteGate>
  );
}

/** Marker route child — parent layout owns the War Room instance. */
export function DraftWarRoomFocus() {
  return null;
}
