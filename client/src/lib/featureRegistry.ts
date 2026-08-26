import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Dna,
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
  GitCompare,
  Crown,
  Target,
  Film,
  FileText,
  Library,
  ScrollText,
} from "lucide-react";

/** V1 paid tier is Rivals (pro). Commissioner subscription deferred. */
export type RequiredPlan = "free" | "pro";

export type NavCategory =
  | "home"
  | "media"
  | "weekly"
  | "knowRivals"
  | "knowYourself"
  | "league"
  | "history";

/** Extensible — e.g. "AI Intelligence" can be added later. */
export type ExperienceCategory =
  | "GM Intelligence"
  | "League Intelligence"
  | "Draft Intelligence"
  | "Historical Intelligence";

type RegistryEntryBase = {
  id: string;
  label: string;
  icon: LucideIcon;
  requiredPlan: RequiredPlan;
  discoverable: boolean;
  showInOnboarding: boolean;
  showInPricing: boolean;
  showInDashboard: boolean;
  /** Pricing / upgrade grouping — null hides from experience-category pricing groups. */
  experienceCategory: ExperienceCategory | null;
  marketingDescription: string;
};

export type RouteFeatureEntry = RegistryEntryBase & {
  entryType: "route";
  route: string;
  navCategory: NavCategory;
};

export type CapabilityFeatureEntry = RegistryEntryBase & {
  entryType: "capability";
};

export type FeatureEntry = RouteFeatureEntry | CapabilityFeatureEntry;

/** Sidebar nav group order — preserve when deriving NAV_GROUPS. */
export const NAV_CATEGORY_ORDER: NavCategory[] = [
  "home",
  "media",
  "weekly",
  "knowRivals",
  "knowYourself",
  "league",
  "history",
];

export const EXPERIENCE_CATEGORY_ORDER: ExperienceCategory[] = [
  "GM Intelligence",
  "League Intelligence",
  "Draft Intelligence",
  "Historical Intelligence",
];

/**
 * Product feature registry — routes (sidebar) and capabilities (paid layers inside free pages).
 * Array order defines nav item order within each nav group.
 */
export const FEATURE_REGISTRY: FeatureEntry[] = [
  {
    entryType: "route",
    id: "dashboard",
    label: "The Briefing",
    route: "/dashboard",
    navCategory: "home",
    icon: LayoutDashboard,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: false,
    experienceCategory: null,
    marketingDescription:
      "Your league command center — state of the week, executive briefing, and where to go next.",
  },
  {
    entryType: "route",
    id: "rfsn",
    label: "RFSN",
    route: "/rfsn",
    navCategory: "media",
    icon: Radio,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription:
      "Your league's year-round sports network — news, wire reports, and broadcast coverage.",
  },
  {
    entryType: "route",
    id: "rosters",
    label: "Rosters",
    route: "/roster",
    navCategory: "weekly",
    icon: Users,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription: "Every roster in your league — starters, bench, and roster construction at a glance.",
  },
  {
    // Keeper Advisor now lives as a tab inside the Rosters page (a free route),
    // so it is a paid capability rather than its own sidebar route.
    entryType: "capability",
    id: "keeper-advisor",
    label: "Keeper Advisor",
    icon: Crown,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: false,
    experienceCategory: "Draft Intelligence",
    marketingDescription:
      "Set each team's keeper before the draft — keeper values, savings, and draft-board impact.",
  },
  {
    entryType: "route",
    id: "matchups",
    label: "Matchups",
    route: "/matchups",
    navCategory: "weekly",
    icon: Swords,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription: "This week's head-to-head matchups, scores, and who's on the hot seat.",
  },
  {
    entryType: "route",
    id: "trades",
    label: "Trade Analyzer",
    route: "/trades",
    navCategory: "weekly",
    icon: Repeat2,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "League Intelligence",
    marketingDescription:
      "Model trades with league context — fairness, positional impact, and rival leverage before you send the offer.",
  },
  {
    entryType: "route",
    id: "advisor",
    label: "GM Advisor",
    route: "/advisor",
    navCategory: "weekly",
    icon: Bot,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "GM Intelligence",
    marketingDescription:
      "AI-powered GM counsel trained on your league history — ask what to do, not just what happened.",
  },
  {
    entryType: "route",
    id: "draft-war-room",
    label: "Draft War Room",
    route: "/draft-war-room",
    navCategory: "knowRivals",
    icon: Calendar,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "Draft Intelligence",
    marketingDescription:
      "Live draft intelligence — pick board, rival threat windows, and a decision memo for every pick.",
  },
  {
    entryType: "route",
    id: "draft-commentary",
    label: "Draft Commentary",
    route: "/draft-commentary",
    navCategory: "knowRivals",
    icon: ScrollText,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "Draft Intelligence",
    marketingDescription:
      "Sofia's evidence-grounded commentary on every pick in your mock draft — verified against league facts.",
  },
  {
    entryType: "route",
    id: "post-draft-evaluation",
    label: "Post-Draft Evaluation",
    route: "/post-draft-evaluation",
    navCategory: "knowRivals",
    icon: GitCompare,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "Draft Intelligence",
    marketingDescription:
      "Who you should have drafted at each pick — roster need, scarcity, and players actually available on the clock.",
  },
  {
    entryType: "route",
    id: "rivalries",
    label: "Rivalries",
    route: "/rivalry-center",
    navCategory: "knowRivals",
    icon: Swords,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription:
      "Your league's blood feuds — head-to-head records, playoff eliminations, and the matchups that define eras.",
  },
  {
    entryType: "route",
    id: "owner-profiles",
    label: "My GM Profile",
    route: "/owner-profiles",
    navCategory: "knowYourself",
    icon: Users,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription:
      "Who you are as a GM — draft tendencies, championship history, and the patterns your league already knows.",
  },
  {
    entryType: "route",
    id: "championship-path",
    label: "Championship Path",
    route: "/championship-diagnosis",
    navCategory: "knowYourself",
    icon: Route,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "GM Intelligence",
    marketingDescription:
      "Why you haven't won yet — and the prescription for what to change. Includes the full championship diagnosis and action plan.",
  },
  {
    entryType: "route",
    id: "league-dna",
    label: "League DNA",
    route: "/league-dna",
    navCategory: "league",
    icon: Dna,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription:
      "Your league's personality — draft culture, risk appetite, and the traits that separate champions from also-rans.",
  },
  {
    entryType: "route",
    id: "the-cast",
    label: "The Cast",
    route: "/the-cast",
    navCategory: "league",
    icon: Clapperboard,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription: "The characters in your league story — owners, archetypes, and the roles they play.",
  },
  {
    entryType: "route",
    id: "power-rankings",
    label: "Power Rankings",
    route: "/dynasty-power-rankings",
    navCategory: "league",
    icon: Gem,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription: "Dynasty power tiers — who runs the league now and who's building for tomorrow.",
  },
  {
    entryType: "route",
    id: "acquisition-impact",
    label: "Acquisition Impact",
    route: "/acquisition-impact",
    navCategory: "league",
    icon: ShoppingCart,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "League Intelligence",
    marketingDescription:
      "How much of each owner's success came after draft day — waivers, trades, and free-agent wins ranked.",
  },
  {
    entryType: "route",
    id: "standings",
    label: "Standings",
    route: "/standings",
    navCategory: "league",
    icon: Trophy,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription: "Current standings, points for, and the playoff picture as it stands today.",
  },
  {
    entryType: "route",
    id: "commissioner-command-center",
    label: "Commissioner Command Center",
    route: "/commissioner-command-center",
    navCategory: "league",
    icon: Crown,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: false,
    experienceCategory: null,
    marketingDescription:
      "Commissioner tools — league health, owner identity, and admin intelligence for running the show.",
  },
  {
    entryType: "route",
    id: "hall-of-fame",
    label: "Hall of Fame",
    route: "/hall-of-fame",
    navCategory: "history",
    icon: Award,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription:
      "Legacy leaderboard — championships, win rates, and the dynasty hierarchy your league argues about.",
  },
  {
    entryType: "route",
    id: "league-history",
    label: "League History",
    route: "/history",
    navCategory: "history",
    icon: Building2,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription:
      "The full timeline — champions, era shifts, and the seasons that shaped your league.",
  },
  {
    entryType: "route",
    id: "transactions",
    label: "Transactions",
    route: "/transactions",
    navCategory: "history",
    icon: ArrowLeftRight,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    experienceCategory: null,
    marketingDescription: "Every trade, waiver, and roster move — searchable league transaction history.",
  },
  {
    entryType: "capability",
    id: "why-havent-i-won",
    label: "Why Haven't I Won?",
    icon: Target,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "GM Intelligence",
    marketingDescription:
      "The full championship blocker report — every factor, the evidence behind it, and the ranked plan to fix what keeps costing you titles.",
  },
  {
    entryType: "capability",
    id: "complete-rivalry-documentaries",
    label: "Complete Rivalry Documentaries",
    icon: Film,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "Historical Intelligence",
    marketingDescription:
      "Full documentary rivalries — cold opens become complete stories with receipts, turning points, trade chapters, and the evidence your league still argues about.",
  },
  {
    entryType: "capability",
    id: "historic-trade-intelligence",
    label: "Historic Trade Intelligence",
    icon: Repeat2,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "Historical Intelligence",
    marketingDescription:
      "League-wide completed trade intelligence — biggest fleeces, lopsided deals, and the ledger that explains who really won each era.",
  },
  {
    entryType: "capability",
    id: "championship-reports",
    label: "Championship Reports",
    icon: FileText,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "Historical Intelligence",
    marketingDescription:
      "Per-owner championship readiness reports — full diagnosis, blockers, and prescription for every GM in your league, not just a teaser.",
  },
  {
    entryType: "capability",
    id: "deep-league-records",
    label: "Deep League Records",
    icon: Library,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    experienceCategory: "Historical Intelligence",
    marketingDescription:
      "The deep record book — single-game, season, and rivalry records that turn bragging rights into dynasty proof.",
  },
];

const routeRegistryByPath = new Map(
  FEATURE_REGISTRY.filter((f): f is RouteFeatureEntry => f.entryType === "route").map(
    (f) => [normalizeRoute(f.route), f] as const,
  ),
);

const registryById = new Map(FEATURE_REGISTRY.map((f) => [f.id, f] as const));

function normalizeRoute(route: string): string {
  if (route.length > 1 && route.endsWith("/")) return route.slice(0, -1);
  return route;
}

export function getFeatureByRoute(route: string): RouteFeatureEntry | undefined {
  return routeRegistryByPath.get(normalizeRoute(route));
}

export function getFeatureById(id: string): FeatureEntry | undefined {
  return registryById.get(id);
}

export function getRouteFeatures(): RouteFeatureEntry[] {
  return FEATURE_REGISTRY.filter((f): f is RouteFeatureEntry => f.entryType === "route");
}

export function getProFeatures(): FeatureEntry[] {
  return FEATURE_REGISTRY.filter((f) => f.requiredPlan === "pro");
}

export type PricingFeatureGroup = {
  category: ExperienceCategory;
  items: FeatureEntry[];
};

/** Entries with showInPricing, grouped by experienceCategory in product order. */
export function getPricingFeatureGroups(): PricingFeatureGroup[] {
  const priced = FEATURE_REGISTRY.filter(
    (f) => f.showInPricing && f.experienceCategory != null,
  );
  return EXPERIENCE_CATEGORY_ORDER.map((category) => ({
    category,
    items: priced.filter((f) => f.experienceCategory === category),
  })).filter((g) => g.items.length > 0);
}

export function buildNavGroups(getGroupTitle: (category: NavCategory) => string) {
  const itemsByCategory = new Map<NavCategory, RouteFeatureEntry[]>();
  for (const category of NAV_CATEGORY_ORDER) {
    itemsByCategory.set(category, []);
  }
  for (const feature of getRouteFeatures()) {
    itemsByCategory.get(feature.navCategory)?.push(feature);
  }
  return NAV_CATEGORY_ORDER.map((category) => ({
    id: category,
    title: getGroupTitle(category),
    items: itemsByCategory.get(category) ?? [],
  })).filter((group) => group.items.length > 0);
}
