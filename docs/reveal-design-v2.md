# The Reveal — Final Design Document (v2)
**Atlantas Finest GM Tool · Conversion Funnel Sprint 1**
*Approved changes incorporated · Ready for implementation*

---

## What Changed From v1

- Headline: *"Christian Is Vulnerable Right Now."* — approved, keeping
- Removed "He's 0–2 to start 2026" — too literal, shifts tone to fantasy recap
- Implication line: changed from *"Strike before Week 4"* to *"You have a small window before Week 4"* — empowers the user rather than instructing them
- Suspense layer: shortened from 6s to 4.5–5.0s; skip available after line 2
- Self-insight card: added as a required element — grounds the reveal psychologically and builds trust

---

## Step 1 — Suspense Layer

**Duration:** 4.5–5.0 seconds. Four lines, ~1.2 seconds each.

**Skip behavior:** After line 2, a muted "Skip →" appears in the bottom-right corner. No animation, no flash. Present for users who want it; invisible to users who don't.

**Copy (exact sequence):**

```
Analyzing 9 seasons of league history…

Mapping rivalry patterns across 126 matchups…

Detecting trade behavior and panic signals…

Identifying your most exploitable opponent…
```

**Visual:** Dark background. Single centered column. Thin horizontal progress bar at bottom — no percentage, no numbers, just motion. Each line fades in and stays visible as the next appears.

---

## Step 2 — The Reveal Card

### Layout
Full viewport. Dark background. Single card, centered vertically and horizontally. Maximum width 680px. No sidebar, no nav, no competing elements.

### Exact Copy

**Category label** (small caps, muted, 11px tracking)
```
YOUR MOST EXPLOITABLE OPPONENT
```

**Headline** (large, bold, high contrast — ~48px desktop / ~32px mobile)
```
Christian Is Vulnerable Right Now.
```

**Evidence** (medium weight, slightly muted — ~18px)
```
Over the last 3 seasons, Christian's trade activity spikes 
after consecutive losses — and he consistently overpays 
in those windows.
```

**Implication** (smaller, italicized, ~15px)
```
You have a small window before Week 4. He'll be motivated to deal.
```

---

## Step 3 — Secondary Cards (Three Visible)

Appear with a staggered fade-in (~0.5s delay after the main card). Arranged in a row on desktop, stacked on mobile. Roughly half the height of the main card.

### Card A — Self-Insight (REQUIRED — builds trust)

**Label:** `YOUR BIGGEST DRAFT WEAKNESS`

**Copy:**
```
You consistently reach for aging RBs in rounds 3–5 
after strong playoff finishes. The league has started 
to anticipate this.
```

*Why this card is required:* Without self-insight, the reveal risks feeling like AI-generated league gossip. When the system calls out the user's own weakness — accurately — it creates the "wait, that's actually true" moment that makes everything else believable.

---

### Card B — Rivalry Insight

**Label:** `MOST LIKELY TO PANIC SELL`

**Copy:**
```
Snake has initiated 3 of his last 4 trades within 
48 hours of a primetime loss. He's your best 
trade partner right now.
```

---

### Card C — League-Wide Inefficiency

**Label:** `MARKET INEFFICIENCY`

**Copy:**
```
Future 2nd-round picks are consistently undervalued 
in your league after Week 5. 
This is your most repeatable edge.
```

---

## Step 4 — Blur Strategy

### What is shown clearly
The main Reveal card and the three secondary cards above — full visibility.

### What is blurred
Four additional "locked" insight cards appear below. Rendered at ~60% opacity with CSS blur (~4px). Category label is legible; content is not.

**Blurred card labels:**
```
FULL MANAGER PROFILES          →  14 managers analyzed
TRADE NEGOTIATION PATTERNS     →  Your optimal leverage windows
BEHAVIORAL TIMELINES           →  Season-by-season psychology
CHAMPIONSHIP WINDOW ANALYSIS   →  Your realistic title path
```

**Critical rule:** No lock icons. No price. No "Pro only." The blur signals depth. The CTA does the asking. Lock icons feel transactional. Blur feels like hidden intelligence.

---

## Step 5 — CTA

**Placement:** Centered below the blurred cards. 48px whitespace above.

**Primary button:**
```
Unlock Your Full League DNA
```

**Subtext below button (small, muted):**
```
See every manager's behavioral profile, trade patterns, 
and your full championship intelligence report.
```

**Visual:** Full-width on mobile, ~320px fixed on desktop. High contrast — white text on deep accent color. Subtle glow or shadow. Feels premium, not flat.

---

## Pacing Summary

| Moment | Timing | Emotional State |
|---|---|---|
| Suspense line 1 | 0–1.2s | Curiosity |
| Suspense line 2 | 1.2–2.5s | Interest (specific number) |
| Skip available | 2.5s | — |
| Suspense line 3 | 2.5–3.8s | Intrigue (psychology) |
| Suspense line 4 | 3.8–5.0s | Anticipation (personal) |
| Reveal card fades in | 5.0–5.8s | Surprise / recognition |
| Secondary cards fade in | 6.3s | Emotional resonance |
| Blurred cards appear | 6.8s | Curiosity about depth |
| CTA fades in | 7.3s | Motivated to act |

Total time from start to CTA visible: **~7–8 seconds.**

---

## Grounding Rules (Non-Negotiable)

Every insight must reference observable behavior from real ESPN data. The test: if a user showed this to another manager in their league, would that manager say *"yeah, that sounds right"*? If yes, the insight passes.

The sweet spot is *"surprisingly plausible"* — not generic, not extreme, not overconfident. If users think *"this sounds fabricated,"* trust collapses instantly and the entire conversion fails.

Numbers appear only as evidence in prose ("3 of his last 4 trades") — never as raw metrics to be analyzed.

---

## What This Is Not

No charts. No tables. No raw scores. No percentages on the reveal cards. No dashboards. No analytics overload.

The reveal is emotional storytelling grounded in real data. That distinction is everything.
