# Freemium Gating Spec - Fantasy Football Rivals

**Status:** DRAFT - product spec, not yet implemented
**Owner:** Roderick Sellers
**Last updated:** 2026-06-12
**Related:** `docs/ARCHITECTURE.md`, `server/leagueIntelRouter.ts`, `server/_core/trpc.ts` (`subscribedProcedure`)

---

## 1. Purpose

This document defines exactly what Fantasy Football Rivals shows **for free** vs **behind the paywall**, and the principles that decide where the line falls for every current and future feature. It is the authoritative reference for the app-gating build. If a new feature is added, run it through Section 5 to decide its split.

---

## 2. Core thesis

We are **not** selling analysis. We are selling **self-discovery and status**.

- **Free answers:** "Why should I care?"
- **Paid answers:** "What do I do with this?"

Restated as the one-line product thesis:

> **Free users discover WHO THEY ARE in their league. Paid users discover HOW TO CHANGE their future.**

- Free = **identity** (and status)
- Paid = **transformation**

### 2.1 Why this is also a distribution strategy (not just emotion)

Identity is shareable; transformation is not.

- **Who-you-are** -> gets screenshotted into the league group chat -> **distribution / virality**.
- **How-to-change-it** -> a personalized plan -> nothing useful to screenshot -> **no viral leakage** -> full willingness to pay.

The free tier is engineered to **travel**. The paid tier is engineered to **resist traveling**. That is what makes the model durable: every free element doubles as a marketing asset, and every paid element is leak-resistant by its nature. The free/paid line is simultaneously an **emotional** split and a **distribution** split.

---

## 3. The governing principle: Curiosity vs Resolution

The line is **NOT** "which features are free." The line is: **free shows the WOUND; paid shows the DIAGNOSIS and the CURE.**

| | FREE | PAID |
|---|---|---|
| Emotional job | Curiosity | Resolution |
| Target reaction | "Holy crap. Tell me more." | "Now I know what to do." |
| Failure mode | Full answer given -> no reason to pay | No answer given -> no reason to care |

Both failure modes are fatal. If free users get the full answer, they will not pay. If free users get no answer, they will not care. Every free surface walks this line deliberately.

---

## 4. The Free Formula: Proof / Pain / Promise

**Every free surface must contain all three:**

1. **PROOF** - show we know something real and *specific to this user*.
2. **PAIN** - show why it matters / what it cost them.
3. **PROMISE** - show the answer exists (locked), so there is something to buy.

**Weak** (fails Proof + Promise):
> "We found 5 reasons. Unlock to see them."

**Strong** (passes all three):
> "Your biggest championship blocker: you draft RBs 1.8 rounds earlier than league champions. We found 4 more factors. [Unlock Full Championship Report]"
>
> Proof = the RB tendency. Pain = it is costing you titles. Promise = 4 more, locked.

### 4.1 Two guardrails (the failure modes to engineer against)

Both failures share one root cause: **free content the user does not quite believe is about THEM.**

- **G1 - Proof must be UNDENIABLE, not dramatic.** Draw the free proof from the *most undeniable* pattern in the user's data (the thing they already half-knew about themselves), not the most dramatic. If the proof feels generic or wrong, the user distrusts the engine, leaves, and stops believing the *locked* items are real either. The engine's entire credibility rides on the free proof landing as "...yeah, I do that."
- **G2 - Hope must be EVIDENCED, not generic.** Any "here is your path" teaser must be anchored to a specific pattern from the user's own data, or it reads as marketing fluff. Ungrounded hope is the one thing that can make an otherwise-sharp free tier feel cheap.

### 4.2 The mechanical rule: "Name one, hide the rest"

For any multi-item insight: show **one** concrete, named item (the Proof) and hide the remaining **N** as a counted, locked Promise.

- Never show **zero** items -> no Proof -> no curiosity.
- Never show **all** items -> no Promise -> no reason to pay.

### 4.3 Marketing applies the same rule to itself

Proof/Pain/Promise governs our own marketing copy too. Do not claim capability we cannot yet show (e.g. "our predictions get more accurate every season" is an unproven forward claim). Prefer claims that are true the moment a user connects (e.g. "Rivals doesn't reset, it remembers").

---

## 5. Product Decision Test (use before adding ANY feature)

Before building or gating any feature, run it through these four questions. This is the standing framework - it exists so future developers and AI agents never have to re-debate monetization. Do not re-open the monetization model every month; apply the test.

1. **Does this reveal identity?** (who the user is in their league) -> if yes, candidate for **free**.
2. **Does this reveal transformation?** (how to change their future) -> if yes, candidate for **paid**.
3. **Can this be screenshotted and shared?** -> if yes, bias toward **free** (it is a distribution asset).
4. **Can this directly change future outcomes?** -> if yes, bias toward **paid** (it is leak-resistant value).

The pattern every feature should follow - **Free Identity -> Paid Transformation:**

| Feature | Free (Identity) | Paid (Transformation) |
|---|---|---|
| Rivalry | "We found your biggest rival." | "Here is how to finally beat him." |
| League DNA | "Risk Taker" | "Here is how that tendency costs you championships." |
| Why Haven't I Won | "You draft RBs earlier than league champions." | "Here is your 3-step title plan." |

Free states the truth about the user. Paid tells them what to do about it.

---

## 6. Per-feature gating matrix

Server returns the **teaser** shape by default; the **full** shape only for entitled (paid) users. See Section 11 for the security rule on how this MUST be enforced.

| Feature | FREE shows (Proof/Pain/Promise) | HIDDEN (paid only) |
|---|---|---|
| **Connect League** | Entire flow. Must be free. This is the top of the funnel. | - |
| **Dashboard Preview** | Biggest Rival, Biggest Threat, Hall of Fame Rank, Championship Count, Career Record | Everything below |
| **League DNA** | One trait, e.g. `Draft Personality: Risk Taker` | Full breakdown, evidence, tendencies, projections |
| **Rivalry** | "We found your biggest rival. 17 Games / 7 Years / 2 Playoff Eliminations." Stronger: "Andrew has eliminated you from the playoffs twice. Record 8-9. One matchup changed your league forever." | Full record, heartbreaks, timeline, score history |
| **Why Haven't I Won** | One named factor + count of the rest: "Your biggest championship blocker: you draft RBs 1.8 rounds earlier than champions. We found 4 more factors." | The remaining factors, evidence, full report |
| **Hall of Fame** | Rank, Titles, Win %, leaderboard (the shareable, brag-worthy layer) | Dynasty analysis, era breakdowns, championship paths, head-to-head legacy, "why he is ahead of you" |
| **Storyline** | Exactly one - the single most emotional, named, specific line (see Section 9) | Full storyline archive |
| **Title Path** | "You are 3 moves away from contention. Your path starts with the RB room you keep ignoring. Built from your 11 seasons." Locked. | The 3 moves / the full plan |

**Rivalry, strong free example (target quality bar):**
> Andrew has eliminated you from the playoffs **twice**.
> Record: **8-9**
> One matchup changed your league forever.
> `[ View Full Rivalry Report ]`

---

## 7. Free tier inventory (the complete free surface)

Goal reaction: **"Holy crap. Tell me more."** NOT "I got everything I needed."

- Hall of Fame rank
- Biggest rival (existence + headline stats, not the full record)
- Biggest threat
- One storyline (the most emotional, named)
- One DNA trait
- One "Why Haven't I Won?" factor (named)
- Career record
- Championship count
- Title Path teaser ("3 moves exist", locked)

---

## 8. Paid tier inventory (Founding Member)

This is where the value lives: **full resolution + transformation.**

- **Full Rivalry Center** - everything
- **Full Why Haven't I Won** - everything. *Probably the single strongest premium feature.*
- **Championship Path**
- **Acquisition Impact**
- **Full League DNA** - breakdown, evidence, tendencies, projections
- **Owner Profiles**
- **Draft War Room** - *should be one of the biggest conversion drivers*
- **Draft Reality Simulator**
- **Keeper Advisor**
- **Matchup Intelligence**
- **Historical Intelligence / Reports**
- **Full Storylines / Storyline Archive**

### 8.1 Two conversion pillars (different buyers, different seasons)

- **Why Haven't I Won** sells to the **wounded** buyer - emotional, off-season, "explain my pain." Peaks in the offseason.
- **Draft War Room** sells to the **competitive** buyer - tactical, August, "help me win now." Peaks pre-draft.

Keep them distinct. Together they give the product a conversion driver in two different parts of the calendar, which matters for a seasonal product.

---

## 9. The Storyline engine (the viral object)

The free storyline is the single most important marketing object in the product - it is what gets screenshotted into the league chat, and that screenshot is the distribution strategy. Treat it as a first-class engineered feature, not a random pick.

**Selection rule:** surface the **most emotional, named, specific** storyline available for that user. Generic does not travel; the line that names a real owner and a real year does.

**Target examples (dynamic, real names/years):**
- "You haven't beaten Andrew in the playoffs since 2018."
- "Mike has scored 1,142 more points than you over the last five seasons."
- "You traded away three future champions."

These create league-chat arguments. Arguments create signups.

**Build note:** needs a scoring function that ranks candidate storylines by emotional weight (rivalry stakes, magnitude of gap, playoff implications, recency) and returns the top one for free display. The full archive is paid.

---

## 10. The Title Path teaser (highest-converting locked object)

This may be the **highest-converting locked feature in the entire product**, because it sells **hope**, and hope converts better than pain alone. The free tier otherwise shows the user everything that is wrong with them (wounds); the Title Path is the one free element that proves **the cure exists**.

**Free (locked):**
> You are **3 moves** away from becoming a championship contender.
> Your path starts with the RB room you keep ignoring.
> We built a personalized title plan from your 11 seasons.
> `[ Unlock Your Title Path ]`

**Paid:** the actual 3 moves / full plan.

**Guardrail (G2 applies hard here):** the teaser must be anchored to a specific, evidenced pattern from the user's own data ("the RB room you keep ignoring"), not generic. Ungrounded hope reads as fluff and poisons trust in the rest of the free tier.

**Build note:** the teaser ("3 moves exist, anchored to pattern X") can ship **before** the full move-generation engine is built. Ship the hook first.

---

## 11. Implementation mapping (current -> target)

### 11.1 Current state (as of this spec)

- `server/leagueIntelRouter.ts` exposes `whyHaventIWon`, `careerReport`, `championshipPath`, `acquisitionImpact` as **`publicProcedure`** - no login, no gate, full payload. This is the biggest leak: the flagship deterministic features are given away anonymously, with no lead capture and no upsell.
- The AI features (`advisor.chat`, `tradeOfferGenerator` in `server/routers.ts`; the 5-agent debates in `server/agentRouter.ts`) already use **`subscribedProcedure`** (the real gate in `server/_core/trpc.ts`).
- Net: today the boundary is "conversational/agentic AI = paid; everything deterministic = free and public." This spec **redefines** the boundary to "teaser/curiosity = free; full resolution + transformation = paid."

### 11.2 Target state

1. **Free still requires login.** Move the LeagueDNA suite off `publicProcedure`. A logged-out visitor may see a thin anonymous teaser (for virality - see Section 12), but the personalized dashboard requires an account so we capture the lead and start the trial.
2. **Each gated feature returns a teaser shape OR a full shape**, decided server-side by entitlement. Recommended: a single endpoint that shapes its payload by `ctx` subscription status, rather than duplicate endpoints.
3. **New feature: Title Path** - teaser (free) + full plan (paid).
4. **New feature: Storyline engine** - top-1 selection for free; archive paid.
5. **Hall of Fame split** - rank/titles/win%/leaderboard free; deep history paid.

### 11.3 SECURITY RULE (NON-NEGOTIABLE)

**Different payloads. Not different rendering.** This is the single line that separates a real paywall from a cosmetic one.

The server must NEVER send locked content to an unentitled client - not even hidden, flagged, or collapsed. Within days of this mattering, someone inspects the network payload or reads `window.__TRPC_STATE` and finds it. If the full answer is in the bytes that reach the browser, it is not paywalled.

**NEVER send this to a free client:**
```json
{ "fullDiagnosis": "...", "locked": true }
```
The `locked: true` flag is theater - the answer is right there in `fullDiagnosis`.

**Correct - the FREE payload simply does not contain the answer:**
```json
{ "primaryFactor": "You draft RBs 1.8 rounds earlier than champions", "additionalFactors": 4 }
```

**Correct - the PAID payload (entitled users only):**
```json
{ "primaryFactor": "You draft RBs 1.8 rounds earlier than champions", "additionalFactors": [ ... ] }
```

Note the shape difference: `additionalFactors` is a **count (number)** for free, an **array** for paid. Same field name, structurally different payload. The redaction happens at the server boundary, before serialization. No locked content ever crosses the wire to a free client.

**Rule of thumb for reviewers:** open the network tab as a free user. If the paid answer is anywhere in the response - in any field, any flag, any comment - the gate is cosmetic and must be fixed before launch.

### 11.4 Gate primitive

`subscribedProcedure` already enforces active-subscription-or-valid-trial in `server/_core/trpc.ts`. For payload-shaping (one endpoint, two shapes) use a `protectedProcedure` endpoint that reads `ctx` subscription status and branches the response, applying the redaction in 11.3. Reserve `subscribedProcedure` for endpoints that are entirely paid (no free shape).

---

## 12. Open questions / decisions needed

1. **Anonymous teaser vs login-required.** Do we allow a thin, fully-anonymous teaser (one storyline + one card) on shareable links to preserve virality and SEO, with the personalized dashboard behind login? Recommendation: **yes** - a shareable link landing renders a cached teaser, login gates the personalized version. Ties directly to the landing-page lead-capture work.
2. **Tier model (V1).** Two commercial tiers only: **Free** and **Rivals** ($8.99/mo or $79.99/yr). The gate is binary (subscribed / not). Commissioner / "The League" subscription is deferred to a future release — see `docs/DECISION_LOG.md`.
3. **Title Path engine.** Deterministic rules or LLM-generated "3 moves"? For launch, the **teaser** can ship before the full engine. Decide the generation approach before building the paid side.
4. **Proof selection quality.** Implementing G1 (undeniable proof) requires a ranking function that picks the most undeniable pattern per user, not the most dramatic. This is the make-or-break of the whole model and deserves dedicated tuning.

---

*End of spec. This is a living document - update Section 6 whenever a feature is added or its split changes.*
