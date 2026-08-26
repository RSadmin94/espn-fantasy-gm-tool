import { describe, expect, it } from "vitest";
import {
  ESPN_AWAITING_INSTALL_KEY,
  ESPN_RELOADED_ONCE_KEY,
  clearAwaitingConnectorInstall,
  consumeEspnConnectReload,
  hasReloadedEspnConnectOnce,
  isAwaitingConnectorInstall,
  markAwaitingConnectorInstall,
  markEspnConnectReloadedOnce,
  shouldReloadEspnConnectOnce,
} from "./connectorInstallReturn";

function memoryStore(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

describe("shouldReloadEspnConnectOnce", () => {
  const base = {
    connectorPresent: false,
    awaitingInstall: true,
    alreadyReloaded: false,
    connectorCapable: true,
  };

  it("reloads once after install-in-place when the marker is still missing", () => {
    expect(shouldReloadEspnConnectOnce(base)).toBe(true);
  });

  it("never reloads a second time", () => {
    expect(shouldReloadEspnConnectOnce({ ...base, alreadyReloaded: true })).toBe(false);
  });

  it("does not reload when the connector is already present", () => {
    expect(shouldReloadEspnConnectOnce({ ...base, connectorPresent: true })).toBe(false);
  });

  it("does not reload unless we were waiting on install", () => {
    expect(shouldReloadEspnConnectOnce({ ...base, awaitingInstall: false })).toBe(false);
  });

  it("does not reload on mobile / unsupported browsers", () => {
    expect(shouldReloadEspnConnectOnce({ ...base, connectorCapable: false })).toBe(false);
  });
});

describe("session guards", () => {
  it("records awaiting-install and one-shot reload flags", () => {
    const store = memoryStore();
    markAwaitingConnectorInstall(store);
    expect(isAwaitingConnectorInstall(store)).toBe(true);
    markEspnConnectReloadedOnce(store);
    expect(hasReloadedEspnConnectOnce(store)).toBe(true);
    expect(store.getItem(ESPN_AWAITING_INSTALL_KEY)).toBe("1");
    expect(store.getItem(ESPN_RELOADED_ONCE_KEY)).toBe("1");
    clearAwaitingConnectorInstall(store);
    expect(isAwaitingConnectorInstall(store)).toBe(false);
  });

  it("consumeEspnConnectReload stamps the one-shot flag so a loop cannot start", () => {
    const store = memoryStore();
    markAwaitingConnectorInstall(store);
    const first = consumeEspnConnectReload(store, true);
    const second = consumeEspnConnectReload(store, true);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
