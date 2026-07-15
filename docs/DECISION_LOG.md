# Decision Log

Product and architecture decisions with dates. Newest first.

---

## 2026-06-25 — V1 commercial simplification: Free + Rivals only

**Decision:** Version 1 ships with **two commercial tiers** — Free and Rivals. **The League** commissioner subscription is removed from billing, Stripe catalog setup, checkout, pricing UI, and commercial copy.

**Rationale:** Focus launch on competitive intelligence (Rivals). Commissioner engagement features may remain in the codebase for future development but must not appear as a purchasable tier.

**Pricing:**

- Rivals Monthly: $8.99/mo
- Rivals Annual: $79.99/yr

**Removed:**

- League Stripe products and price env vars
- League checkout and Rivals→League upgrade paths
- `billing.getUpgradeQuote`
- Third pricing column on landing page

**Still intentional in codebase:**

- `subscriptionPlan` DB enum may retain `league` for legacy rows
- Commissioner routes (e.g. Commissioner Command Center) — not subscription-gated as a separate tier in V1
- Nav category `"league"` in feature registry — ESPN league content grouping, not a billing tier

**Docs:** `docs/V1_COMMERCIAL_PRICING.md`, `PRODUCT_CONSTITUTION.md` §4b, `docs/FREEMIUM_GATING_SPEC.md` §12.

---

## Prior decisions

See `docs/FREEMIUM_GATING_SPEC.md`, `PRODUCT_CONSTITUTION.md`, and `docs/playerid-crosswalk-decision.md` for feature-specific history.
