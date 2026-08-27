/**
 * Deterministic first-run onboarding helpers.
 * Setup completion is decided from server profile + connection counts, never from UI copy.
 */

export type SetupPhase =
  | "NEW"
  | "PROVIDER_SELECTED"
  | "CONNECTING"
  | "LEAGUE_CONNECTED"
  | "TEAM_REQUIRED"
  | "SETUP_COMPLETE";

export type OnboardingLeagueRow = {
  provider: string;
  leagueId: string;
  selectedTeamId?: number | null;
  isSetupComplete?: boolean;
};

export function setupPhase(args: {
  isAuthenticated: boolean;
  isDemo: boolean;
  connectedLeagueCount: number | null;
  isSetupComplete: boolean | null;
}): SetupPhase {
  if (!args.isAuthenticated || args.isDemo) return "SETUP_COMPLETE";
  if (args.connectedLeagueCount == null || args.isSetupComplete == null) return "CONNECTING";
  if (args.isSetupComplete) return "SETUP_COMPLETE";
  if (args.connectedLeagueCount === 0) return "NEW";
  return "TEAM_REQUIRED";
}

export function teamSetupPath(league: OnboardingLeagueRow | null | undefined): string {
  if (!league?.leagueId) return "/connect";
  if (league.provider === "sleeper") return "/connect/sleeper";
  if (league.provider === "sleeper_workbook") return "/import/sleeper-workbook";
  if (league.provider === "yahoo") return "/connect/yahoo";
  return `/select-team/espn/${encodeURIComponent(league.leagueId)}`;
}

export function incompleteLeague(rows: readonly OnboardingLeagueRow[]): OnboardingLeagueRow | null {
  return (
    rows.find((row) => row.isSetupComplete === false || row.selectedTeamId == null) ?? null
  );
}

export function setupGateDestination(args: {
  phase: SetupPhase;
  pathname: string;
  incomplete: OnboardingLeagueRow | null;
}): string | null {
  if (args.phase === "SETUP_COMPLETE" || args.phase === "CONNECTING") return null;
  if (args.phase === "NEW") {
    if (args.pathname === "/connect" || args.pathname.startsWith("/connect/")) return null;
    return "/connect";
  }
  if (args.phase === "TEAM_REQUIRED") {
    const dest = teamSetupPath(args.incomplete);
    if (args.pathname === dest || args.pathname.startsWith(`${dest}/`)) return null;
    if (dest === "/connect/sleeper" && args.pathname.startsWith("/connect/sleeper")) return null;
    if (dest.startsWith("/select-team/") && args.pathname.startsWith("/select-team/")) return null;
    return dest;
  }
  return null;
}

export function nextAfterEspnConnected(args: {
  isSetupComplete: boolean;
  leagueId: string | null;
}): { href: string; label: string } {
  if (args.isSetupComplete || !args.leagueId) {
    return { href: "/dashboard", label: "Go to dashboard" };
  }
  return {
    href: `/select-team/espn/${encodeURIComponent(args.leagueId)}`,
    label: "Select your team",
  };
}

export function nextAfterSleeperConnected(args: { isSetupComplete: boolean }): {
  href: string;
  label: string;
} {
  if (args.isSetupComplete) return { href: "/dashboard", label: "Go to dashboard" };
  return { href: "/connect/sleeper", label: "Select your team" };
}

/** Chrome/Edge desktop only. Mobile Chrome cannot run the ESPN connector. */
export function isConnectorCapableBrowser(userAgent: string): boolean {
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return false;
  return /Chrome|Chromium|Edg\//i.test(userAgent);
}

export const INITIAL_ONBOARDING_PROVIDERS = ["espn", "sleeper"] as const;
