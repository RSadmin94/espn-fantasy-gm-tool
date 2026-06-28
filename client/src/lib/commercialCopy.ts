/**
 * User-facing commercial copy — three tiers: Free, Rivals, The League.
 */
export const COMMERCIAL = {
  productName: "Rivals",
  productNameFull: "Fantasy Football Rivals",
  freePlanName: "Free",
  leaguePlanName: "The League",
  foundingOfferLabel: "Launch pricing",
  rivalsMonthlyPrice: "$5.99",
  rivalsAnnualPrice: "$59.99",
  leagueMonthlyPrice: "$9.99",
  leagueAnnualPrice: "$79.99",
  rivalsAnnualPriceLabel: "$59.99 / year",
  rivalsMonthlyPriceLabel: "$5.99 / month",
  leagueAnnualPriceLabel: "$79.99 / year",
  leagueMonthlyPriceLabel: "$9.99 / month",
  upgradeAnnualDelta: "+$20 / year",
  annualPriceAmount: "$59.99",
  annualPriceLabel: "$59.99 / year",
  annualPriceSuffix: "/ year",
  landingTagline: "Discover who you are in your league. Unlock competitive intelligence with Rivals.",
  freemiumForeverLine:
    "Fantasy Football Rivals is free forever — upgrade to Rivals for interpretation, recommendations, and the full rivalry ledger.",
  launchPricingLine: "Rivals from $5.99/month or $59.99/year",
  discoverCta: "Discover your league",
  seeWhoYouAreCta: "See who you really are",
  unlockStoryCta: "Unlock Rivals",
  upgradeCta: "Unlock Rivals",
  upgradeCtaUnderstandWhy: "Unlock your rivalries",
  upgradeCtaDiscoverWhatChanged: "See what changed",
  upgradeCtaPending: "Opening checkout...",
  subscriptionRequiredMessage:
    "Rivals is required for this feature. Continue with free previews, or unlock competitive intelligence.",
  undiscoveredSectionTitle: "What You Haven't Discovered Yet",
  exploreEverythingCta: "Explore Everything",
  settingsPlanFree: "Fantasy Football Rivals (Free)",
  settingsPlanRivals: "Rivals",
  settingsPlanLeague: "The League",
  settingsPlanActive: "Rivals",
  settingsLaunchPricing: "$59.99 / year (Rivals annual)",
  manageBillingCta: "Manage Billing",
  subscriptionRequired: "Requires Rivals",
  unlockWithPro: "Unlocks with Rivals",
  leagueComingSoon: "Coming in Sprint 4",
  freePlanHighlights: [
    "My GM Profile and basic DNA",
    "Career summary and league snapshot",
    "Standings, storylines, champions, League Pulse",
    "One full rivalry — every other rivalry visible but locked",
  ] as const,
  rivalsPlanHighlights: [
    "All rivalries unlocked",
    "Weekly, Trade, and Draft Intelligence",
    "Deep Records and dynasty rankings",
    "GM Advisor and opponent intelligence",
    "Behavioral and matchup intelligence",
  ] as const,
  leaguePlanHighlights: [
    "League Story and Weekly Briefings publishing",
    "League Headlines, Awards, Ring of Honor",
    "Championship announcements and storyline publishing",
    "Shareable league content and commissioner command center",
    "Does not unlock Rivals intelligence for the whole league",
  ] as const,
  productStorySteps: [
    { step: 1, title: "Connect your ESPN league", body: "Link your league in under a minute." },
    {
      step: 2,
      title: "Fantasy Football Rivals analyzes your league",
      body: "Years of history become identity — rivalries, profiles, and legacy.",
    },
    {
      step: 3,
      title: "Discover who you are — free",
      body: "Your GM profile, career summary, league pulse, and one full rivalry.",
    },
    {
      step: 4,
      title: "Upgrade to Rivals for competitive intelligence",
      body: "Interpretation, recommendations, full rivalries, and deep records — from $5.99/month.",
    },
  ] as const,
} as const;

/** @deprecated Legacy alias */
export const RIVALS_PRO = COMMERCIAL;
