# V1 Commercial Pricing

**Status:** Active for Version 1 launch.  
**Audience:** Engineering, QA, and product.

---

## Tiers

| Tier | Price | Stripe |
|------|-------|--------|
| **Free** | $0 | — |
| **Rivals Monthly** | $8.99/mo | `STRIPE_PRICE_ID_RIVALS_MONTHLY` |
| **Rivals Annual** | $79.99/yr | `STRIPE_PRICE_ID_RIVALS_ANNUAL` |

Legacy env aliases (still supported):

- `STRIPE_PRICE_ID_MONTHLY` → Rivals monthly
- `STRIPE_PRICE_ID_ANNUAL` → Rivals annual

## Not in V1

- **The League** commissioner subscription — deferred; no Stripe products, no checkout, no pricing UI.
- Rivals→League annual upgrade — removed with League tier.
- `STRIPE_PRICE_ID_LEAGUE_MONTHLY` / `STRIPE_PRICE_ID_LEAGUE_ANNUAL` — removed from env template.

## Setup

```powershell
$env:STRIPE_SECRET_KEY="sk_test_..."
pnpm stripe:setup-products
```

Copy printed `price_...` IDs into Railway / `.env`.

## Code sources

| Concern | File |
|---------|------|
| Amounts + labels | `server/stripe/products.ts` |
| User-facing copy | `client/src/lib/commercialCopy.ts` |
| Checkout | `server/billingRouter.ts` |
| Landing pricing | `client/src/pages/LandingPage.tsx` |
| Settings subscription | `client/src/pages/Settings.tsx` |

## Free tier

Server-side gating rules: `docs/FREEMIUM_GATING_SPEC.md` and `server/leagueIntelGating.ts`.  
QA probe: `scripts/_commercial_free_qa_probe.mts`.
