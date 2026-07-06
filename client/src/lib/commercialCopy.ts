/**
 * User-facing commercial copy — V1 tiers: Free and Rivals.
 * Commissioner / "The League" subscription is deferred to a future release.
 */
export const COMMERCIAL = {
  productName: "Rivals",
  productNameFull: "Fantasy Football Rivals",
  freePlanName: "Free",
  foundingOfferLabel: "Launch pricing",
  rivalsMonthlyPrice: "$7.99",
  rivalsAnnualPrice: "$79.99",
  rivalsAnnualPriceLabel: "$79.99 / year",
  rivalsMonthlyPriceLabel: "$7.99 / month",
  annualPriceAmount: "$79.99",
  annualPriceLabel: "$79.99 / year",
  annualPriceSuffix: "/ year",
  landingTagline: "Discover who you are in your league. Unlock competitive intelligence with Rivals.",
  freemiumForeverLine:
    "Fantasy Football Rivals is free forever — upgrade to Rivals for interpretation, recommendations, and the full rivalry ledger.",
  launchPricingLine: "Rivals Monthly — $7.99 · Rivals Annual — $79.99",
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
  settingsPlanActive: "Rivals",
  settingsLaunchPricing: "Rivals Monthly — $7.99 · Rivals Annual — $79.99",
  manageBillingCta: "Manage Billing",
  subscriptionRequired: "Requires Rivals",
  unlockWithPro: "Unlocks with Rivals",
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
      body: "Interpretation, recommendations, full rivalries, and deep records — from $7.99/month.",
    },
  ] as const,
} as const;

/** @deprecated Legacy alias */
export const RIVALS_PRO = COMMERCIAL;
