# V1 Free Tier Audit

**Status:** Reference for QA and entitlement reviews.  
**Authority:** `docs/FREEMIUM_GATING_SPEC.md` (full rules) and `server/leagueIntelGating.ts` (implementation).

---

## Commercial model (V1)

| Tier | Access |
|------|--------|
| **Free** | Identity shell, one full rivalry preview, locked rivals/owners named only |
| **Rivals** | Full competitive intelligence — all rivalries, interpretation, recommendations, deep records |

There is **no third paid tier** in V1. Commissioner / "The League" subscription is deferred (`docs/DECISION_LOG.md`).

---

## What free users get

- My GM Profile (basic DNA shell)
- Career summary and league snapshot
- Standings, storylines, champions, League Pulse
- **One** full rivalry — other rivalries visible but locked/redacted server-side

## What requires Rivals

- Full rivalry dossiers and league-wide rivalry grid
- Weekly / trade / draft intelligence depth
- GM Advisor and opponent scouting depth
- Deep records, dynasty tools behind paywall

Redaction is **server-side** before JSON serialization — not CSS-hidden paid content.

---

## Verification

1. **Automated probe:** `pnpm tsx scripts/_commercial_free_qa_probe.mts` (requires `QA_COOKIE` / auth).
2. **Unit tests:** `server/leagueIntelGating.test.ts`.
3. **Manual:** Dev entitlement override in Settings — toggle Free vs Rivals Pro; compare network payloads.
4. **Regression checklist:** `docs/ENTITLEMENT_REGRESSION_CHECKLIST.md`.

---

## Pricing alignment

Free tier is $0. Rivals checkout charges $8.99/mo or $79.99/yr per `server/stripe/products.ts` and `client/src/lib/commercialCopy.ts`. See `docs/V1_COMMERCIAL_PRICING.md`.
