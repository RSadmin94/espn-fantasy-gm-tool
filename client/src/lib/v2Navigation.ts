import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Swords,
  Award,
  Building2,
  Trophy,
  Radio,
  ArrowLeftRight,
  Clapperboard,
  Gem,
  Repeat2,
  Bot,
  Route,
  ShoppingCart,
  Calendar,
  Crown,
  ScrollText,
  Newspaper,
  Zap,
  BookOpen,
  Film,
  Mic2,
  Map as MapIcon,
  Network,
  FileText,
  History,
  Shield,
} from "lucide-react";
import type { RequiredPlan } from "@/lib/featureRegistry";
import { V2 } from "@/lib/v2Copy";

/**
 * Locked FFR 2.0 sidebar — exactly six primary sections.
 * Authority: docs/architecture/FFR_2.0_Product_Architecture.md
 */
export type V2NavCategory =
  | "home"
  | "rivals"
  | "myTeam"
  | "rfsn"
  | "draft"
  | "league";

export const V2_NAV_CATEGORY_ORDER: V2NavCategory[] = [
  "home",
  "rivals",
  "myTeam",
  "rfsn",
  "draft",
  "league",
];

export type V2DestinationKind = "placeholder" | "live";

export type V2Destination = {
  id: string;
  label: string;
  navCategory: V2NavCategory;
  /** Canonical V2 route. */
  route: string;
  icon: LucideIcon;
  requiredPlan: RequiredPlan;
  kind: V2DestinationKind;
  /** Sidebar visibility at this level. */
  showInSidebar: boolean;
  /**
   * Phase 1: temporary href so existing functionality stays reachable
   * while the canonical route still serves a placeholder.
   */
  legacyRoute?: string;
  /** Nested destinations (Standings / History under League). */
  children?: V2Destination[];
};

/**
 * Canonical V2 destinations from the locked Product Architecture.
 * Phase 1: placeholders for new paths; legacyRoute preserves working UX.
 */
export const V2_DESTINATIONS: V2Destination[] = [
  // ── Home ──────────────────────────────────────────────────────────────
  {
    id: "home",
    label: "Home",
    navCategory: "home",
    route: "/home",
    icon: LayoutDashboard,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: true,
  },

  // ── Rivals ────────────────────────────────────────────────────────────
  {
    id: "rivals-hub",
    label: "Rivals",
    navCategory: "rivals",
    route: "/rivals",
    icon: Swords,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: false,
  },
  {
    id: "rivals-cast",
    label: "The Cast",
    navCategory: "rivals",
    route: "/rivals/cast",
    icon: Clapperboard,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "rivals-owner-dossier",
    label: "Owner Dossier",
    navCategory: "rivals",
    route: "/rivals/owners",
    icon: Users,
    requiredPlan: "pro",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "rivals-head-to-head",
    label: "Head-to-Head Ledger",
    navCategory: "rivals",
    // Merged into Rivalries (full RivalryCenter) — route redirects; not a sidebar entry.
    route: "/rivals/head-to-head",
    icon: ScrollText,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: false,
  },
  {
    id: "rivals-rivalries",
    label: "Rivalries",
    navCategory: "rivals",
    route: "/rivals/rivalries",
    icon: Swords,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "rivals-league-map",
    label: "League Map",
    navCategory: "rivals",
    route: "/rivals/league-map",
    icon: MapIcon,
    requiredPlan: "free",
    kind: "live",
    // Deep-link / hub previews only — not a sidebar entry.
    showInSidebar: false,
  },
  {
    id: "rivals-relationships",
    label: "Relationship Map",
    navCategory: "rivals",
    route: "/rivals/relationships",
    icon: Network,
    requiredPlan: "free",
    kind: "live",
    // Deep-link / hub previews only — not a sidebar entry.
    showInSidebar: false,
  },

  // ── My Team ───────────────────────────────────────────────────────────
  {
    id: "my-team-hub",
    label: "My Team",
    navCategory: "myTeam",
    route: "/my-team",
    icon: Users,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: false,
  },
  {
    id: "my-team-roster",
    label: "Roster",
    navCategory: "myTeam",
    route: "/my-team/roster",
    icon: Users,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "my-team-matchup",
    label: "Matchup",
    navCategory: "myTeam",
    route: "/my-team/matchup",
    icon: Swords,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "my-team-trades",
    label: "Trades",
    navCategory: "myTeam",
    route: "/my-team/trades",
    icon: Repeat2,
    requiredPlan: "pro",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "my-team-advisor",
    label: "GM Advisor",
    navCategory: "myTeam",
    route: "/my-team/advisor",
    icon: Bot,
    requiredPlan: "pro",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "my-team-profile",
    label: "My GM",
    navCategory: "myTeam",
    route: "/my-team/profile",
    icon: Users,
    requiredPlan: "pro",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "my-team-championship-path",
    label: "Championship Path",
    navCategory: "myTeam",
    route: "/my-team/championship-path",
    icon: Route,
    requiredPlan: "pro",
    kind: "live",
    showInSidebar: true,
  },

  // ── RFSN (027C: Live · Stories · Recaps — Wire/Breaking/Analysts not primary nav) ──
  {
    id: "rfsn-hub",
    label: "RFSN",
    navCategory: "rfsn",
    route: "/rfsn",
    icon: Radio,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: false,
  },
  {
    id: "rfsn-live",
    label: "Live",
    navCategory: "rfsn",
    route: "/rfsn/live",
    icon: Radio,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "rfsn-stories",
    label: "Stories",
    navCategory: "rfsn",
    route: "/rfsn/stories",
    icon: BookOpen,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "rfsn-recaps",
    label: "Recaps",
    navCategory: "rfsn",
    route: "/rfsn/recaps",
    icon: Film,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: true,
  },
  // Kept for deep links / redirects — not sidebar destinations (RFSN-027C)
  {
    id: "rfsn-wire",
    label: "Wire",
    navCategory: "rfsn",
    route: "/rfsn/wire",
    icon: Newspaper,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: false,
  },
  {
    id: "rfsn-breaking",
    label: "Breaking News",
    navCategory: "rfsn",
    route: "/rfsn/breaking",
    icon: Zap,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: false,
  },
  {
    id: "rfsn-analysts",
    label: "Analysts",
    navCategory: "rfsn",
    route: "/rfsn/analysts",
    icon: Mic2,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: false,
  },

  // ── Draft ─────────────────────────────────────────────────────────────
  {
    id: "draft-hub",
    label: "Draft",
    navCategory: "draft",
    route: "/draft",
    icon: Calendar,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: false,
  },
  {
    id: "draft-live",
    label: "Live Draft",
    navCategory: "draft",
    route: "/draft/live",
    icon: Radio,
    requiredPlan: "pro",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "draft-mock",
    label: "Mock Draft",
    navCategory: "draft",
    route: "/draft/mock",
    icon: Clapperboard,
    requiredPlan: "pro",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "draft-war-room",
    label: "War Room",
    navCategory: "draft",
    route: "/draft/war-room",
    icon: Calendar,
    requiredPlan: "pro",
    kind: "live",
    /** Prep desk — reachable from hub; Live Draft is the primary real-draft entry. */
    showInSidebar: false,
  },
  {
    id: "draft-keepers",
    label: "Keeper Center",
    navCategory: "draft",
    route: "/draft/keepers",
    icon: Crown,
    requiredPlan: "pro",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "draft-history",
    label: "Draft History",
    navCategory: "draft",
    route: "/draft/history",
    icon: ScrollText,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: true,
  },

  // ── League ────────────────────────────────────────────────────────────
  {
    id: "league-hub",
    label: "League",
    navCategory: "league",
    route: "/league",
    icon: Building2,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: false,
  },
  {
    id: "league-standings",
    label: "Standings",
    navCategory: "league",
    route: "/league/standings",
    icon: Trophy,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: true,
    children: [
      {
        id: "league-standings-record",
        label: "Record",
        navCategory: "league",
        route: "/league/standings",
        icon: Trophy,
        requiredPlan: "free",
        kind: "live",
        showInSidebar: true,
      },
      {
        id: "league-standings-power-rankings",
        label: "Power Rankings",
        navCategory: "league",
        route: "/league/standings/power-rankings",
        icon: Gem,
        requiredPlan: "free",
        kind: "live",
        showInSidebar: true,
      },
      {
        id: "league-standings-playoffs",
        label: "Playoff Picture",
        navCategory: "league",
        route: "/league/standings/playoffs",
        icon: Trophy,
        requiredPlan: "free",
        kind: "live",
        showInSidebar: true,
      },
      {
        id: "league-standings-sos",
        label: "Strength of Schedule",
        navCategory: "league",
        route: "/league/standings/strength-of-schedule",
        icon: Calendar,
        requiredPlan: "free",
        kind: "live",
        showInSidebar: true,
      },
    ],
  },
  {
    id: "league-history",
    label: "History",
    navCategory: "league",
    route: "/league/history",
    icon: History,
    requiredPlan: "free",
    kind: "live",
    showInSidebar: true,
    children: [
      {
        id: "league-history-champions",
        label: "Champions",
        navCategory: "league",
        route: "/league/history/champions",
        icon: Crown,
        requiredPlan: "free",
        kind: "live",
        showInSidebar: true,
      },
      {
        id: "league-history-hof",
        label: "Hall of Fame",
        navCategory: "league",
        route: "/league/history/hall-of-fame",
        icon: Award,
        requiredPlan: "free",
        kind: "live",
        showInSidebar: true,
      },
      {
        id: "league-history-records",
        label: "Records",
        navCategory: "league",
        route: "/league/history/records",
        icon: FileText,
        requiredPlan: "free",
        kind: "live",
        showInSidebar: true,
      },
      {
        id: "league-history-dynasties",
        label: "Dynasties",
        navCategory: "league",
        route: "/league/history/dynasties",
        icon: Building2,
        requiredPlan: "free",
        kind: "live",
        showInSidebar: true,
      },
      {
        id: "league-history-timeline",
        label: "Timeline",
        navCategory: "league",
        route: "/league/history/timeline",
        icon: History,
        requiredPlan: "free",
        kind: "live",
        showInSidebar: true,
      },
      {
        id: "league-history-matchups",
        label: "Matchups",
        navCategory: "league",
        route: "/league/history/matchups",
        icon: Swords,
        requiredPlan: "free",
        kind: "live",
        showInSidebar: true,
      },
      {
        id: "league-history-transactions",
        label: "Transactions",
        navCategory: "league",
        route: "/league/history/transactions",
        icon: ArrowLeftRight,
        requiredPlan: "pro",
        kind: "live",
        showInSidebar: true,
      },
    ],
  },
  {
    id: "league-acquisition-impact",
    label: "Acquisition Impact",
    navCategory: "league",
    route: "/league/acquisition-impact",
    icon: ShoppingCart,
    requiredPlan: "pro",
    kind: "live",
    showInSidebar: true,
  },
  {
    id: "league-commissioner",
    label: "Commissioner",
    navCategory: "league",
    route: "/league/commissioner",
    icon: Shield,
    requiredPlan: "pro",
    kind: "live",
    showInSidebar: true,
  },
];

/** Extra parameterized routes registered but not shown as separate sidebar rows. */
export const V2_PARAM_ROUTES: string[] = [
  "/rivals/owners/:ownerId",
  "/league/history/matchups/c/:collectionId",
  "/league/history/matchups/:matchupId",
];

function normalizeV2Route(route: string): string {
  if (route.length > 1 && route.endsWith("/")) return route.slice(0, -1);
  return route;
}

function flattenDestinations(destinations: V2Destination[]): V2Destination[] {
  const out: V2Destination[] = [];
  for (const d of destinations) {
    out.push(d);
    if (d.children?.length) out.push(...flattenDestinations(d.children));
  }
  return out;
}

export function getAllV2Destinations(): V2Destination[] {
  return flattenDestinations(V2_DESTINATIONS);
}

const destinationByRoute = new Map(
  getAllV2Destinations().map((d) => [normalizeV2Route(d.route), d] as const),
);

export function getV2DestinationByRoute(route: string): V2Destination | undefined {
  return destinationByRoute.get(normalizeV2Route(route));
}

export function getV2PlaceholderDestinations(): V2Destination[] {
  return getAllV2Destinations().filter((d) => d.kind === "placeholder");
}

/** Unique canonical paths that need a router entry (placeholders + hubs). */
export function getV2CanonicalRoutes(): string[] {
  const routes = new Set<string>();
  for (const d of getAllV2Destinations()) {
    routes.add(normalizeV2Route(d.route));
  }
  for (const p of V2_PARAM_ROUTES) {
    routes.add(p);
  }
  return [...routes].sort();
}

export function getV2NavHref(destination: V2Destination): string {
  if (destination.kind === "placeholder" && destination.legacyRoute) {
    return destination.legacyRoute;
  }
  return destination.route;
}

export type V2NavGroup = {
  id: V2NavCategory;
  title: string;
  items: V2Destination[];
};

export function buildV2NavGroups(): V2NavGroup[] {
  const itemsByCategory = new Map<V2NavCategory, V2Destination[]>();
  for (const category of V2_NAV_CATEGORY_ORDER) {
    itemsByCategory.set(category, []);
  }
  for (const destination of V2_DESTINATIONS) {
    if (!destination.showInSidebar) continue;
    itemsByCategory.get(destination.navCategory)?.push(destination);
  }
  return V2_NAV_CATEGORY_ORDER.map((category) => ({
    id: category,
    title: V2.navGroups[category],
    items: itemsByCategory.get(category) ?? [],
  }));
}

export function isV2RouteActive(pathname: string, destination: V2Destination): boolean {
  const path = normalizeV2Route(pathname);
  const canonical = normalizeV2Route(destination.route);
  const href = normalizeV2Route(getV2NavHref(destination));

  if (destination.children?.length) {
    const childActive = destination.children.some((child) => isV2RouteActive(path, child));
    if (childActive) return true;
  }

  if (path === canonical || path.startsWith(`${canonical}/`)) return true;
  if (href !== canonical && (path === href || path.startsWith(`${href}/`))) return true;
  return false;
}

/** Confirm locked architecture invariants used by tests. */
export function assertLockedV2NavigationInvariants(): {
  sectionCount: number;
  sectionIds: V2NavCategory[];
  hasSeason: boolean;
  hasTopLevelHistory: boolean;
  rivalsIsPrimary: boolean;
  historyNestedInLeague: boolean;
} {
  const groups = buildV2NavGroups();
  const sectionIds = groups.map((g) => g.id);
  const historyParent = getAllV2Destinations().find((d) => d.id === "league-history");
  return {
    sectionCount: groups.length,
    sectionIds,
    hasSeason: sectionIds.includes("season" as V2NavCategory),
    hasTopLevelHistory: sectionIds.includes("history" as V2NavCategory),
    rivalsIsPrimary: sectionIds[1] === "rivals",
    historyNestedInLeague:
      historyParent?.navCategory === "league" &&
      (historyParent.children?.length ?? 0) > 0,
  };
}
