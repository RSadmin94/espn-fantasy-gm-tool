import { useSyncExternalStore } from "react";

/**
 * Session-scoped Rivals Pro unlock.
 *
 * Set when an already-entitled founder/owner clicks "Unlock Rivals Pro" and the
 * server confirms entitlement (billing.claimSessionAccess). This is purely a
 * PRESENTATION flag — the server still enforces real entitlement on every data
 * endpoint, so flipping this can never expose data the viewer isn't entitled to.
 *
 * Persists across reloads within the tab session (sessionStorage) and is cleared
 * on sign-out, so access lasts until the user completely logs out.
 */
const KEY = "rivalsProSessionUnlock";
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function isSessionUnlocked(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSessionUnlocked(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* sessionStorage unavailable — ignore */
  }
  emit();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Reactive hook — re-renders consumers when the session unlock flag changes. */
export function useSessionUnlock(): boolean {
  return useSyncExternalStore(subscribe, isSessionUnlocked, () => false);
}
