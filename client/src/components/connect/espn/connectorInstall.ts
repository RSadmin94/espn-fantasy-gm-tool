/**
 * Where "Install the connector" sends people.
 *
 * Isolated configuration dependency. Do not invent a Chrome Web Store URL here.
 * When the listing is published, set VITE_CONNECTOR_INSTALL_URL (or this constant) to that URL.
 * Empty means the listing is not available — never point users at a fake store page.
 */
const FROM_ENV =
  typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env.VITE_CONNECTOR_INSTALL_URL === "string"
    ? import.meta.env.VITE_CONNECTOR_INSTALL_URL.trim()
    : "";

export const CONNECTOR_INSTALL_URL = FROM_ENV;

export function hasConnectorInstallUrl(): boolean {
  return CONNECTOR_INSTALL_URL.trim().length > 0;
}
