/**
 * Where "Install Connector" sends people.
 *
 * The Chrome Web Store listing does not exist yet. Until it does, the install step falls back to
 * load-unpacked instructions so the screen is never a dead end; publishing is a one-line change
 * here and nowhere else.
 */
export const CONNECTOR_INSTALL_URL = "";

export function hasConnectorInstallUrl(): boolean {
  return CONNECTOR_INSTALL_URL.trim().length > 0;
}

export const CONNECTOR_MANUAL_INSTALL_STEPS = [
  "Open chrome://extensions in a new tab.",
  "Turn on Developer mode, top right.",
  "Choose Load unpacked, then pick the Rivals Connector folder.",
  "Come back here and choose Check again.",
] as const;
