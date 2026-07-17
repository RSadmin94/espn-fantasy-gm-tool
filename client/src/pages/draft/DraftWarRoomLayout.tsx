/**
 * Shared mount for `/draft/war-room` and `/draft/mock`.
 * Keeps a single DraftWarRoom instance so live sim / clock / pause state survives
 * navigation between the two canonical destinations.
 */
import { Outlet, useLocation } from "react-router";
import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { DraftWarRoom } from "@/pages/DraftWarRoom";

export function DraftWarRoomLayout() {
  const { pathname } = useLocation();
  const focusMock = pathname === "/draft/mock" || pathname.endsWith("/draft/mock");
  const scrollToSection = focusMock ? "dwr-mock" : undefined;

  return (
    <FeatureRouteGate route="/draft-war-room">
      <div
        data-v2-draft-war-room
        data-v2-draft-mock={focusMock ? "true" : undefined}
      >
        <DraftWarRoom scrollToSection={scrollToSection} />
        <Outlet />
      </div>
    </FeatureRouteGate>
  );
}

/** Marker route child — parent layout owns the War Room instance. */
export function DraftWarRoomFocus() {
  return null;
}
