/** Client-only first-run onboarding persistence (per user + league). */

export const ONBOARDING_STORAGE_VERSION = 1 as const;

export type ProductOnboardingRecord = {
  version: typeof ONBOARDING_STORAGE_VERSION;
  /** First ESPN sync succeeded for this league. */
  firstSyncAt: string | null;
  /** User dismissed welcome or chose an explore action. */
  welcomeDismissed: boolean;
  /** Tour skipped or finished. */
  completed: boolean;
  completedAt: string | null;
};

export type ProductTourStepId = "gm-intelligence" | "rivalry-documentary" | "league-archives" | "trade-intelligence";

export type ProductTourStep = {
  id: ProductTourStepId;
  title: string;
  lead: string;
  highlights: string[];
  href: string;
};

export const PRODUCT_TOUR_STEPS: ProductTourStep[] = [
  {
    id: "gm-intelligence",
    title: "My GM Profile",
    lead: "This is your complete scouting report.",
    highlights: ["Executive Summary", "DNA", "Trading Profile", "Matchup Intelligence"],
    href: "/owner-profiles",
  },
  {
    id: "rivalry-documentary",
    title: "Rivalries",
    lead: "Every rivalry has a history.",
    highlights: ["Cold Open", "Trade Chapter", "Evidence", "Timeline"],
    href: "/rivalry-center",
  },
  {
    id: "league-archives",
    title: "League History",
    lead: "Explore the history of your league.",
    highlights: ["Hall of Fame", "Championship History", "Notorious Trades", "Records"],
    href: "/hall-of-fame",
  },
  {
    id: "trade-intelligence",
    title: "Trade Analyzer",
    lead: "Every trade is backed by deterministic valuation.",
    highlights: ["Trade Analyzer", "Trade History", "Completed Trades"],
    href: "/trades",
  },
];

export const FLAGSHIP_DISCOVERY = [
  {
    id: "gm-intelligence" as const,
    title: "My GM Profile",
    description: "Understand how every owner builds, drafts, trades, and wins.",
    href: "/owner-profiles",
  },
  {
    id: "rivalry-documentary" as const,
    title: "Rivalries",
    description: "Relive your biggest feuds with receipts, timelines, and trade chapters.",
    href: "/rivalry-center",
  },
  {
    id: "league-archives" as const,
    title: "League History",
    description: "Browse championships, records, notorious trades, and league legacy.",
    href: "/hall-of-fame",
  },
  {
    id: "trade-intelligence" as const,
    title: "Trade Analyzer",
    description: "Analyze proposed trades and review completed deals with fair-value authority.",
    href: "/trades",
  },
];

export const PRODUCT_HELP_ITEMS = [
  {
    title: "What is My GM Profile?",
    body: "Your complete scouting report—how every owner builds, drafts, trades, and wins.",
  },
  {
    title: "What are Rivalries?",
    body: "A receipt-backed story for each rivalry—cold opens, trade chapters, and evidence.",
  },
  {
    title: "What is League History?",
    body: "The permanent record of your league—titles, records, notorious trades, and milestones.",
  },
  {
    title: "What is the ESPN Connector?",
    body: "A Chrome extension that passes your ESPN session to Fantasy Football Rivals — required for private league sync. It does not replace the app.",
  },
];

function storageKey(userId: string, leagueId: string) {
  return `gmwr_product_onboarding_v${ONBOARDING_STORAGE_VERSION}:${userId}:${leagueId}`;
}

function defaultRecord(): ProductOnboardingRecord {
  return {
    version: ONBOARDING_STORAGE_VERSION,
    firstSyncAt: null,
    welcomeDismissed: false,
    completed: false,
    completedAt: null,
  };
}

export function readOnboardingRecord(userId: string | undefined, leagueId: string | undefined): ProductOnboardingRecord {
  if (!userId || !leagueId) return defaultRecord();
  try {
    const raw = localStorage.getItem(storageKey(userId, leagueId));
    if (!raw) return defaultRecord();
    const parsed = JSON.parse(raw) as Partial<ProductOnboardingRecord>;
    if (parsed.version !== ONBOARDING_STORAGE_VERSION) return defaultRecord();
    return { ...defaultRecord(), ...parsed };
  } catch {
    return defaultRecord();
  }
}

export function writeOnboardingRecord(
  userId: string,
  leagueId: string,
  patch: Partial<ProductOnboardingRecord>,
): ProductOnboardingRecord {
  const next = { ...readOnboardingRecord(userId, leagueId), ...patch };
  localStorage.setItem(storageKey(userId, leagueId), JSON.stringify(next));
  return next;
}

export function isOnboardingComplete(userId: string | undefined, leagueId: string | undefined): boolean {
  return readOnboardingRecord(userId, leagueId).completed;
}

export function shouldShowWelcome(userId: string | undefined, leagueId: string | undefined): boolean {
  const rec = readOnboardingRecord(userId, leagueId);
  return Boolean(rec.firstSyncAt && !rec.welcomeDismissed && !rec.completed);
}

export function markFirstSyncSuccess(userId: string, leagueId: string): ProductOnboardingRecord {
  const rec = readOnboardingRecord(userId, leagueId);
  if (rec.firstSyncAt) return rec;
  return writeOnboardingRecord(userId, leagueId, { firstSyncAt: new Date().toISOString() });
}

export function dismissWelcome(userId: string, leagueId: string): ProductOnboardingRecord {
  return writeOnboardingRecord(userId, leagueId, { welcomeDismissed: true });
}

export function completeOnboarding(userId: string, leagueId: string): ProductOnboardingRecord {
  return writeOnboardingRecord(userId, leagueId, {
    welcomeDismissed: true,
    completed: true,
    completedAt: new Date().toISOString(),
  });
}

export function tourStepIndex(id: ProductTourStepId): number {
  return PRODUCT_TOUR_STEPS.findIndex((s) => s.id === id);
}
