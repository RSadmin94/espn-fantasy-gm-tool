# Split Verdict — Design Spec (Trade Analyzer)

**Status:** DESIGN ONLY — do not build until Tier 1 is approved.
**Scope:** GM War Room Trade Analyzer.
**Related:** threshold retune already shipped — `fix(trades): soften verdict thresholds for negotiation gaps` (29cb958).

## 1. Problem & Goal
Today the analyzer collapses everything into one word (AVOID/COUNTER/FAIR/RISKY/ACCEPT)
driven purely by value ratio. Experienced managers reason on three separate axes —
**value, roster fit, championship timeline** — then combine them. A contender knowingly
pays 10–15% on value for win-now points; a rebuilder rejects a "fair" deal that bleeds
future assets. One value-only word can't carry that.

Goal — present four explicit lines so the report reads like a GM, not a calculator:

```
Value Grade:          COUNTER
Roster Fit:           Excellent
Championship Context: Contender
Overall Verdict:      FAIR
```

**Non-goal:** a new scoring engine. This is a thin combiner over signals that ALREADY
exist. No changes to Market Value V2, player/pick valuation, Trade Fit Score, or the
Championship Window computation.

## 2. The Four Components (all exist today except the combiner)

| Component | Source (existing) | Output |
|---|---|---|
| **Value Grade** | `computeVerdict` (retuned) | ACCEPT / COUNTER / FAIR / RISKY / AVOID, per side |
| **Roster Fit** | Trade Fit Score | A+ … F, per side |
| **Championship Context** | Championship Window | Contender / Bubble / Retooling / Rebuilding, per team |
| **Overall Verdict** | **NEW** combiner `computeOverallVerdict()` | ACCEPT / FAIR / COUNTER / RISKY / AVOID, per side |

Only the **Overall Verdict combiner is new.** Everything it consumes is already computed
in the `tradeAnalyze` path. No new queries, no new scoring.

> **Label mapping (LOCKED).** The window already emits these 5 labels today
> (`tradeIntelligence.ts` → `ChampionshipWindow.classification`): `Contender`, `Playoff Team`,
> `Bubble Team`, `Retooling`, `Rebuilding`. "Bubble" already exists ("Bubble Team") — map only
> what exists, do **not** add a new classifier; treat anything unknown/preseason as Neutral:
>
> | Window label (today) | Context bucket |
> |---|---|
> | Contender | Contender |
> | Playoff Team | Contender |
> | Bubble Team | Bubble |
> | Retooling | Retooling |
> | Rebuilding | Rebuilding |
> | none / preseason unknown | Neutral |

## 3. Tier 1 — Context Weighting (BUILD THIS FIRST)

Tier 1 uses Championship Context as a **context weight only**. It does NOT analyze what the
specific trade does to a team's timeline (that's Tier 2). It answers: *given this side's
value outcome, its roster fit, and whether it's a contender or rebuilder, what's the smart
overall call?*

### 3.1 Recommendation ladder
Core ladder (recommendation strength), low → high:

```
AVOID(0) → COUNTER(1) → FAIR(2) → ACCEPT(3)
```

RISKY is an **overlay**, not a rung (§3.4).

### 3.2 Algorithm (computed per side, recommended default)
1. **Base rung from Value Grade:** AVOID→0, COUNTER→1, FAIR→2, RISKY→2 (set `caution=true`), ACCEPT→3.
2. **Championship context shift** — the ONLY ordinal mover, on this side's mapped Context bucket (§2):
   - **Contender** bucket (Contender / Playoff Team) **and** value-behind (base ≤ COUNTER) → **+1** (rational win-now overpay)
   - **Rebuilding and** value-behind (base ≤ COUNTER) → **−1** (don't pay up when you're not contending)
   - **Bubble / Retooling / Neutral**, or value not behind → **0**
   - Clamp the shift to [−1, +1] → "up to one bounded tier."
3. `rung = clamp(baseRung + shift, 0, 3)`.
4. **AVOID floor/cap:**
   - If Value Grade ≠ AVOID, floor `rung` at 1 — context can never *manufacture* an AVOID.
   - If Value Grade == AVOID, cap `rung` at 1 — a fleecing can rise to COUNTER at most, never FAIR/ACCEPT.
5. **Label:** 0→AVOID, 1→COUNTER, 2→FAIR, 3→ACCEPT.
6. **Fit overlay (RISKY):** if Roster Fit is poor (D/F) **and** label is FAIR or ACCEPT → render **RISKY**.
   Also render RISKY if `caution==true` (Value Grade was RISKY). Good fit adds no overlay.
   (COUNTER already signals "renegotiate," so poor fit doesn't overlay it.)

So: **Championship Context** is the ordinal mover, **Fit** is a caution overlay, and a true
value AVOID stays bounded in {AVOID, COUNTER}. Fit alone can never produce an AVOID.

### 3.3 What Tier 1 deliberately does NOT do
- It does **not** compute whether THIS trade improves or worsens the timeline (no before/after).
  Championship Context is a static weight on the value direction.
- Therefore it cannot fully express *"rebuilder rejects a fair-value deal because it ships a
  2027 first."* That needs the per-trade asset/timeline delta in **Tier 2**. Tier 1 captures
  only the contender-overpay and rebuilder-don't-overpay cases — the common, defensible ones.

### 3.4 Worked examples (value grade → context/fit → overall)

| Side situation | Value Grade | Context | Fit | Overall | Why |
|---|---|---|---|---|---|
| **Live trade, side A** (gave R1.07 254, got 201 → 0.79) | COUNTER | Retooling | D | **COUNTER** | shift 0; COUNTER label, no overlay |
| Contender slightly behind, win-now fit | COUNTER | Contender | A | **FAIR** | +1 lift; "behind but it fits and you're contending" |
| Rebuilder slightly behind | COUNTER | Rebuilding | C | **COUNTER** | −1 tried, floored at COUNTER (no lift vs. contender) |
| Clean value win, bad fit | ACCEPT | Bubble | F | **RISKY** | rung 3, poor-fit overlay |
| Fleecing, great fit, contender | AVOID | Contender | A | **COUNTER** | +1 then AVOID cap at COUNTER — can't reach FAIR |
| Balanced, good fit | FAIR | Bubble | B | **FAIR** | no shift, no overlay |

These reproduce the two reference cases you described: a 21% deficit with a good win-now fit
reads **FAIR/COUNTER** (not AVOID), and a clean value win with poor fit reads **RISKY**.

### 3.5 Output shape (Tier 1)
Per side, add to the `tradeAnalyze` response:
```
valueGrade:           "COUNTER"        // from computeVerdict (unchanged)
rosterFit:            "D"              // from Trade Fit Score (unchanged)
championshipContext:  "Retooling"      // from Championship Window (unchanged)
overallVerdict:       "COUNTER"        // NEW
overallConfidence:    "Moderate"       // reuse computeVerdict confidence (open item §7)
rationale:            ["Slightly behind on value", "Fit is weak", ...]  // short bullets
```
Headline = the side the user is evaluating (YOU GIVE = side A). The other side's Overall can
be shown for context (open item §7).

### 3.6 Implementation notes (Tier 1) — where the work lands
- **`server/tradeIntelligence.ts`** — add a pure function `computeOverallVerdict({ valueGrade,
  gainRatio, rosterFit, championshipContext })` right next to `computeVerdict`. Pure → fully
  unit-testable, no I/O.
- **`server/routers.ts` (`tradeAnalyze`)** — it already computes the Value Grade, the per-side
  Trade Fit, and has the Championship Window per team. Pass those into `computeOverallVerdict`
  and add the new fields to the response. **No new DB queries, no engine calls.**
- **Client (Trades page)** — render the four-line block. This is the one unavoidable UI change;
  if you want zero UI movement at first, Tier 1 can ship the server fields and wire the UI as a
  second step.
- **Untouched:** Market Value V2, player valuation, pick valuation, Trade Fit Score computation,
  Championship Window computation.

### 3.7 Test plan (Tier 1)
- Unit tests for `computeOverallVerdict` covering the §3.4 matrix.
- Assert the live trade (gain ratio 0.79, Fit D, Retooling) → Overall **COUNTER**.
- Assert AVOID cap (AVOID never rises above COUNTER) and poor-fit overlay (FAIR/ACCEPT → RISKY).
- `pnpm check`. No existing engine/value tests should change.

## 4. Tier 2 — Per-Trade Championship Impact (LATER, NOT NOW)

Tier 2 replaces the **static** Championship Context weight with a **true before/after delta for
THIS trade**: estimate each team's championship outlook with and without the swapped assets, and
feed the DELTA into the same combiner. This is what lets the tool say *"this fair-value trade
ships your 2027 first and drops you from bubble to rebuilding — pass,"* i.e. the rebuilder-rejects-
fair case Tier 1 can't see.

**Why deferred:** it needs a new computation (projected outlook with/without assets) — that's its
own scoring project, exactly what we're avoiding right now. Tier 1 delivers most of the "reads
smarter" value without it.

**Tier 2 build sketch (for later scoping, NOT now):**
1. Define a lightweight team-outlook score from existing signals (roster-value percentile + window state).
2. Compute `outlook(before)` and `outlook(after)` = roster with the traded assets swapped.
3. `delta = after − before`; bucket into {improves window / neutral / hurts window}.
4. Combiner uses the bucketed delta in place of the static context weight, same bounded-shift discipline.

Keep Tier 2 as its own spec/PR when prioritized. It does **not** block Tier 1.

## 5. Decisions

**LOCKED (2026-06-20):**
1. **Window label mapping** — use the existing labels mapped per §2; do not add a classifier; unknown/preseason → Neutral.
2. **Fit role** — overlay only. Fit can downgrade FAIR/ACCEPT → RISKY; it cannot upgrade value and cannot manufacture AVOID.
3. **AVOID guardrail** — kept. A true value AVOID lifts to COUNTER at most, never FAIR/ACCEPT.
4. **Tier 1 only** — existing-window context weighting; do NOT build the before/after championship delta (Tier 2) yet.
5. **Commit order** — threshold retune committed/pushed first (done — `29cb958`); this spec stays uncommitted until it reflects these locked decisions.

**Presentation polish — RESOLVED defaults (2026-06-20):**
- **Rebuilder-behind** → no extra overlay; stays COUNTER. Do **not** add the RISKY overlay yet.
- **Display** → the user's side is the headline; the other side renders as supporting context.
- **Confidence** → reuse `computeVerdict`'s confidence for the Overall verdict.

Design is now fully closed for Tier 1 — no open items block the build.

## 6. Guardrails (do not violate)
- **No new valuation/scoring engine.** The combiner is bounded *label* logic over existing outputs.
- No changes to Market Value V2, player valuation, pick valuation, Trade Fit Score, or Championship
  Window computation.
- **Bounded shift:** Championship Context moves the Overall by at most one tier.
- **AVOID guardrail:** a true value AVOID (<0.70) caps the Overall at COUNTER — never FAIR/ACCEPT.
- Build **Tier 1 only**, and only after approval. Tier 2 is a separate future effort.
