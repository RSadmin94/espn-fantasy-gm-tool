/**
 * Standalone development entry for RFSN shadow playback.
 * Intentionally isolated from Clerk, tRPC, auth, and production routing.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RfsnShadowPlayback } from "./pages/RfsnShadowPlayback";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("RFSN playback root element not found");
}

createRoot(root).render(
  <StrictMode>
    <RfsnShadowPlayback />
  </StrictMode>,
);
