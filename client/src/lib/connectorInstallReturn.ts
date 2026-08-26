/**
 * Website-side handling for installing the ESPN connector while this tab stays open.
 * Chrome will not inject the existing content script into a tab that was already open.
 */

import { isGmWarRoomExtensionPresent } from "./espnApi";

export const ESPN_AWAITING_INSTALL_KEY = "rfsn.espn.awaitingConnectorInstall";
export const ESPN_RELOADED_ONCE_KEY = "rfsn.espn.connectorReloadedOnce";

export type SessionLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function markAwaitingConnectorInstall(store: SessionLike): void {
  store.setItem(ESPN_AWAITING_INSTALL_KEY, "1");
}

export function clearAwaitingConnectorInstall(store: SessionLike): void {
  store.removeItem(ESPN_AWAITING_INSTALL_KEY);
}

export function hasReloadedEspnConnectOnce(store: SessionLike): boolean {
  return store.getItem(ESPN_RELOADED_ONCE_KEY) === "1";
}

export function markEspnConnectReloadedOnce(store: SessionLike): void {
  store.setItem(ESPN_RELOADED_ONCE_KEY, "1");
}

export function isAwaitingConnectorInstall(store: SessionLike): boolean {
  return store.getItem(ESPN_AWAITING_INSTALL_KEY) === "1";
}

/**
 * Reload the ESPN connect route once after install-in-place so document_start
 * can stamp the presence marker. Never reloads twice in the same session.
 */
export function shouldReloadEspnConnectOnce(args: {
  connectorPresent: boolean;
  awaitingInstall: boolean;
  alreadyReloaded: boolean;
  connectorCapable: boolean;
}): boolean {
  if (!args.connectorCapable) return false;
  if (args.connectorPresent) return false;
  if (!args.awaitingInstall) return false;
  if (args.alreadyReloaded) return false;
  return true;
}

export function consumeEspnConnectReload(store: SessionLike, connectorCapable: boolean): boolean {
  const present = isGmWarRoomExtensionPresent();
  const reload = shouldReloadEspnConnectOnce({
    connectorPresent: present,
    awaitingInstall: isAwaitingConnectorInstall(store),
    alreadyReloaded: hasReloadedEspnConnectOnce(store),
    connectorCapable,
  });
  if (!reload) return false;
  markEspnConnectReloadedOnce(store);
  return true;
}
