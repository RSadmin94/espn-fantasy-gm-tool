import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Dna,
  Swords,
  Award,
  Building2,
  Trophy,
  Newspaper,
  ArrowLeftRight,
  Clapperboard,
  Gem,
  Repeat2,
  Bot,
  Route,
  ShoppingCart,
  Calendar,
  Crown,
} from "lucide-react";

/** Extensible plan tier — "league" / "commissioner" can be added later. */
export type RequiredPlan = "free" | "pro";

export type FeatureCategory =
  | "home"
  | "weekly"
  | "knowRivals"
  | "knowYourself"
  | "league"
  | "history";

export type FeatureEntry = {
  id: string;
  label: string;
  route: string;
  category: FeatureCategory;
  icon: LucideIcon;
  requiredPlan: RequiredPlan;
  discoverable: boolean;
  showInOnboarding: boolean;
  showInPricing: boolean;
  showInDashboard: boolean;
  marketingDescription: string;
};

/** Sidebar nav group order — preserve when deriving NAV_GROUPS. */
export const NAV_CATEGORY_ORDER: FeatureCategory[] = [
  "home",
  "weekly",
  "knowRivals",
  "knowYourself",
  "league",
  "history",
];

/**
 * One entry per product feature. Array order defines item order within each nav group.
 * Step 2 will wire onboarding, pricing, and dashboard surfaces to this registry.
 */
export const FEATURE_REGISTRY: FeatureEntry[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    route: "/dashboard",
    category: "home",
    icon: LayoutDashboard,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: false,
    marketingDescription:
      "Your league command center — state of the week, executive briefing, and where to go next.",
  },
  {
    id: "league-wire",
    label: "League Wire",
    route: "/league-wire",
    category: "weekly",
    icon: Newspaper,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription:
      "The week's headlines — trades, injuries, and league drama as they happen.",
  },
  {
    id: "rosters",
    label: "Rosters",
    route: "/roster",
    category: "weekly",
    icon: Users,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription: "Every roster in your league — starters, bench, and roster construction at a glance.",
  },
  {
    id: "matchups",
    label: "Matchups",
    route: "/matchups",
    category: "weekly",
    icon: Swords,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription: "This week's head-to-head matchups, scores, and who's on the hot seat.",
  },
  {
    id: "trades",
    label: "Trade Analyzer",
    route: "/trades",
    category: "weekly",
    icon: Repeat2,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    marketingDescription:
      "Model trades with league context — fairness, positional impact, and rival leverage before you send the offer.",
  },
  {
    id: "advisor",
    label: "GM Advisor",
    route: "/advisor",
    category: "weekly",
    icon: Bot,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    marketingDescription:
      "AI-powered GM counsel trained on your league history — ask what to do, not just what happened.",
  },
  {
    id: "draft-war-room",
    label: "Draft War Room",
    route: "/draft-war-room",
    category: "weekly",
    icon: Calendar,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    marketingDescription:
      "Live draft intelligence — pick board, rival threat windows, and a decision memo for every pick.",
  },
  {
    id: "rivalries",
    label: "Rivalries",
    route: "/rivalry-center",
    category: "knowRivals",
    icon: Swords,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription:
      "Your league's blood feuds — head-to-head records, playoff eliminations, and the matchups that define eras.",
  },
  {
    id: "owner-profiles",
    label: "My GM Profile",
    route: "/owner-profiles",
    category: "knowYourself",
    icon: Users,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription:
      "Who you are as a GM — draft tendencies, championship history, and the patterns your league already knows.",
  },
  {
    id: "championship-path",
    label: "Championship Path",
    route: "/championship-diagnosis",
    category: "knowYourself",
    icon: Route,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    marketingDescription:
      "Why you haven't won yet — and the prescription for what to change. Includes the full championship diagnosis and action plan.",
  },
  {
    id: "league-dna",
    label: "League DNA",
    route: "/league-dna",
    category: "league",
    icon: Dna,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription:
      "Your league's personality — draft culture, risk appetite, and the traits that separate champions from also-rans.",
  },
  {
    id: "the-cast",
    label: "The Cast",
    route: "/the-cast",
    category: "league",
    icon: Clapperboard,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription: "The characters in your league story — owners, archetypes, and the roles they play.",
  },
  {
    id: "power-rankings",
    label: "Power Rankings",
    route: "/dynasty-power-rankings",
    category: "league",
    icon: Gem,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription: "Dynasty power tiers — who runs the league now and who's building for tomorrow.",
  },
  {
    id: "acquisition-impact",
    label: "Acquisition Impact",
    route: "/acquisition-impact",
    category: "league",
    icon: ShoppingCart,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: true,
    showInDashboard: true,
    marketingDescription:
      "How much of each owner's success came after draft day — waivers, trades, and free-agent wins ranked.",
  },
  {
    id: "standings",
    label: "Standings",
    route: "/standings",
    category: "league",
    icon: Trophy,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription: "Current standings, points for, and the playoff picture as it stands today.",
  },
  {
    id: "commissioner-command-center",
    label: "Commissioner Command Center",
    route: "/commissioner-command-center",
    category: "league",
    icon: Crown,
    requiredPlan: "pro",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: true,
    showInDashboard: false,
    marketingDescription:
      "Commissioner tools — league health, owner identity, and admin intelligence for running the show.",
  },
  {
    id: "hall-of-fame",
    label: "Hall of Fame",
    route: "/hall-of-fame",
    category: "history",
    icon: Award,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription:
      "Legacy leaderboard — championships, win rates, and the dynasty hierarchy your league argues about.",
  },
  {
    id: "league-history",
    label: "League History",
    route: "/history",
    category: "history",
    icon: Building2,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: true,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription:
      "The full timeline — champions, era shifts, and the seasons that shaped your league.",
  },
  {
    id: "transactions",
    label: "Transactions",
    route: "/transactions",
    category: "history",
    icon: ArrowLeftRight,
    requiredPlan: "free",
    discoverable: true,
    showInOnboarding: false,
    showInPricing: false,
    showInDashboard: true,
    marketingDescription: "Every trade, waiver, and roster move — searchable league transaction history.",
  },
];

const registryByRoute = new Map(
  FEATURE_REGISTRY.map((f) => [normalizeRoute(f.route), f] as const),
);

const registryById = new Map(FEATURE_REGISTRY.map((f) => [f.id, f] as const));

function normalizeRoute(route: string): string {
  if (route.length > 1 && route.endsWith("/")) return route.slice(0, -1);
  return route;
}

export function getFeatureByRoute(route: string): FeatureEntry | undefined {
  return registryByRoute.get(normalizeRoute(route));
}

export function getFeatureById(id: string): FeatureEntry | undefined {
  return registryById.get(id);
}

export function getProFeatures(): FeatureEntry[] {
  return FEATURE_REGISTRY.filter((f) => f.requiredPlan === "pro");
}

export function buildNavGroups(getGroupTitle: (category: FeatureCategory) => string) {
  const itemsByCategory = new Map<FeatureCategory, FeatureEntry[]>();
  for (const category of NAV_CATEGORY_ORDER) {
    itemsByCategory.set(category, []);
  }
  for (const feature of FEATURE_REGISTRY) {
    itemsByCategory.get(feature.category)?.push(feature);
  }
  return NAV_CATEGORY_ORDER.map((category) => ({
    id: category,
    title: getGroupTitle(category),
    items: itemsByCategory.get(category) ?? [],
  })).filter((group) => group.items.length > 0);
}
