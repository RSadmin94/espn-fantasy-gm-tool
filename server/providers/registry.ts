/**
 * Provider Registry
 *
 * Central lookup for all fantasy platform adapters.
 * The intelligence engine calls getAdapter(provider) to get the right adapter
 * without knowing anything about the underlying platform.
 */

import type { ProviderAdapter, FantasyProvider } from "./types";
import { EspnAdapter } from "./espnAdapter";
import { SleeperAdapter } from "./sleeperAdapter";

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<FantasyProvider, (leagueId?: string) => ProviderAdapter>();

registry.set("espn", (leagueId?: string) =>
  new EspnAdapter(leagueId ? { leagueId } : undefined)
);

registry.set("sleeper", (leagueId?: string) =>
  new SleeperAdapter({ leagueId: leagueId || "" })
);

// Yahoo, NFL, CBS, Fleaflicker, Fantrax — adapters to be built
// registry.set("yahoo", (leagueId) => new YahooAdapter({ leagueId: leagueId || "" }));
// registry.set("nfl",   (leagueId) => new NflAdapter({ leagueId: leagueId || "" }));

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get an adapter for the given provider.
 * Throws if the provider is not yet supported.
 */
export function getAdapter(provider: FantasyProvider, leagueId?: string): ProviderAdapter {
  const factory = registry.get(provider);
  if (!factory) {
    throw new Error(
      `Provider "${provider}" is not yet supported. ` +
      `Supported providers: ${Array.from(registry.keys()).join(", ")}`
    );
  }
  return factory(leagueId);
}

/**
 * List all supported providers.
 */
export function getSupportedProviders(): FantasyProvider[] {
  return Array.from(registry.keys());
}

/**
 * Check if a provider is supported.
 */
export function isProviderSupported(provider: string): provider is FantasyProvider {
  return registry.has(provider as FantasyProvider);
}

/**
 * Provider metadata for the onboarding UI.
 */
export interface ProviderInfo {
  id: FantasyProvider;
  name: string;
  description: string;
  authRequired: boolean;
  authType?: "cookies" | "oauth" | "none";
  logoEmoji: string;
  status: "live" | "coming_soon";
  importInstructions?: string;
}

export const PROVIDER_INFO: ProviderInfo[] = [
  {
    id: "espn",
    name: "ESPN Fantasy",
    description: "The most popular fantasy platform. Requires SWID + espn_s2 cookies.",
    authRequired: true,
    authType: "cookies",
    logoEmoji: "🏈",
    status: "live",
    importInstructions:
      "Log into ESPN Fantasy, open browser DevTools → Application → Cookies → " +
      "copy the values for `SWID` and `espn_s2`.",
  },
  {
    id: "sleeper",
    name: "Sleeper",
    description: "Modern fantasy platform with a fully public API. No auth required.",
    authRequired: false,
    authType: "none",
    logoEmoji: "😴",
    status: "live",
    importInstructions: "Just enter your Sleeper league ID. No login needed.",
  },
  {
    id: "yahoo",
    name: "Yahoo Fantasy",
    description: "Yahoo Sports fantasy leagues. Requires OAuth login.",
    authRequired: true,
    authType: "oauth",
    logoEmoji: "🟣",
    status: "coming_soon",
  },
  {
    id: "nfl",
    name: "NFL Fantasy",
    description: "The official NFL fantasy platform.",
    authRequired: true,
    authType: "oauth",
    logoEmoji: "🏟️",
    status: "coming_soon",
  },
  {
    id: "fleaflicker",
    name: "Fleaflicker",
    description: "Highly customizable fantasy platform with a public API.",
    authRequired: false,
    authType: "none",
    logoEmoji: "🦟",
    status: "coming_soon",
  },
  {
    id: "fantrax",
    name: "Fantrax",
    description: "Advanced scoring and deep customization.",
    authRequired: true,
    authType: "oauth",
    logoEmoji: "🎯",
    status: "coming_soon",
  },
];
