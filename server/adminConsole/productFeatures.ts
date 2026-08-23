/** Product features actually registered in the client feature registry. */
export type ProductFeatureCatalogEntry = {
  id: string;
  label: string;
  entryType: "route" | "capability";
  route: string | null;
  aiFeatureId: string | null;
};

export const PRODUCT_FEATURE_CATALOG: ProductFeatureCatalogEntry[] = [
  { id: "dashboard", label: "The Briefing", entryType: "route", route: "/dashboard", aiFeatureId: null },
  { id: "rfsn", label: "RFSN", entryType: "route", route: "/rfsn", aiFeatureId: "NEWSROOM" },
  { id: "rosters", label: "Rosters", entryType: "route", route: "/roster", aiFeatureId: null },
  { id: "keeper-advisor", label: "Keeper Advisor", entryType: "route", route: "/keeper-advisor", aiFeatureId: "DRAFT_ANALYSIS" },
  { id: "matchups", label: "Matchups", entryType: "route", route: "/matchups", aiFeatureId: null },
  { id: "trades", label: "Trades", entryType: "route", route: "/trades", aiFeatureId: "TRADE_ANALYSIS" },
  { id: "advisor", label: "Advisor", entryType: "route", route: "/advisor", aiFeatureId: "ADVISOR" },
  { id: "draft-war-room", label: "Draft War Room", entryType: "route", route: "/draft-war-room", aiFeatureId: "DRAFT_ANALYSIS" },
  { id: "draft-commentary", label: "Draft Commentary", entryType: "route", route: "/draft-commentary", aiFeatureId: "DRAFT_COMMENTARY" },
  { id: "post-draft-evaluation", label: "Post-Draft Evaluation", entryType: "route", route: "/post-draft-evaluation", aiFeatureId: null },
  { id: "rivalries", label: "Rivalry Center", entryType: "route", route: "/rivalry-center", aiFeatureId: "RIVALRY_HISTORY" },
  { id: "owner-profiles", label: "Owner Profiles", entryType: "route", route: "/owner-profiles", aiFeatureId: "OWNER_COMPARISON" },
  { id: "championship-path", label: "Championship Diagnosis", entryType: "route", route: "/championship-diagnosis", aiFeatureId: null },
  { id: "league-dna", label: "League DNA", entryType: "route", route: "/league-dna", aiFeatureId: "DNA" },
  { id: "the-cast", label: "The Cast", entryType: "route", route: "/the-cast", aiFeatureId: null },
  { id: "power-rankings", label: "Dynasty Power Rankings", entryType: "route", route: "/dynasty-power-rankings", aiFeatureId: null },
  { id: "acquisition-impact", label: "Acquisition Impact", entryType: "route", route: "/acquisition-impact", aiFeatureId: null },
  { id: "standings", label: "Standings", entryType: "route", route: "/standings", aiFeatureId: null },
  { id: "commissioner-command-center", label: "Commissioner Command Center", entryType: "route", route: "/commissioner-command-center", aiFeatureId: null },
  { id: "hall-of-fame", label: "Hall of Fame", entryType: "route", route: "/hall-of-fame", aiFeatureId: null },
  { id: "league-history", label: "League History", entryType: "route", route: "/history", aiFeatureId: "LEAGUE_HISTORY" },
  { id: "transactions", label: "Transactions", entryType: "route", route: "/transactions", aiFeatureId: null },
  { id: "why-havent-i-won", label: "Why Haven't I Won?", entryType: "capability", route: null, aiFeatureId: null },
  { id: "complete-rivalry-documentaries", label: "Complete Rivalry Documentaries", entryType: "capability", route: null, aiFeatureId: "RIVALRY_HISTORY" },
  { id: "historic-trade-intelligence", label: "Historic Trade Intelligence", entryType: "capability", route: null, aiFeatureId: "TRADE_ANALYSIS" },
  { id: "championship-reports", label: "Championship Reports", entryType: "capability", route: null, aiFeatureId: null },
  { id: "deep-league-records", label: "Deep League Records", entryType: "capability", route: null, aiFeatureId: null },
];

export function productFeatureById(id: string): ProductFeatureCatalogEntry | undefined {
  return PRODUCT_FEATURE_CATALOG.find((f) => f.id === id);
}

const AI_TO_PRODUCT = new Map(
  PRODUCT_FEATURE_CATALOG.filter((f) => f.aiFeatureId).map((f) => [f.aiFeatureId as string, f.id]),
);

export function productFeatureIdForAiFeature(aiFeatureId: string | null | undefined): string | null {
  if (!aiFeatureId) return null;
  return AI_TO_PRODUCT.get(aiFeatureId) ?? null;
}
