# The Reveal — Design Document
**Atlantas Finest GM Tool · Conversion Funnel Sprint 1**
*Copy · Pacing · Hierarchy · Blur Strategy · CTA*

---

## Philosophy

The Reveal is not a dashboard. It is not a report. It is a moment.

The target emotional reaction is: *"How the hell does this already know my league?"*

Every decision below — word choice, timing, what to show, what to hide — serves that single reaction. If a design element doesn't serve it, it doesn't belong.

---

## Step 1 — Suspense Layer (The Analysis Screen)

**Duration:** 6 seconds total. Four steps, ~1.5 seconds each. No skip button.

**Visual treatment:** Dark background. Single centered column. Monospaced or slightly technical typeface for the status lines. A thin horizontal progress bar at the bottom — no percentage, no numbers, just motion.

**Copy (exact sequence):**

```
Analyzing 9 seasons of league history…

Mapping rivalry patterns across 126 matchups…

Detecting trade behavior and panic signals…

Identifying your most exploitable opponent…
```

**Why this works:** Each line escalates. The first is broad (history). The second is specific (126 matchups — a real number). The third introduces psychology (panic signals). The fourth is personal and slightly threatening. By line four, the user is leaning in.

**What to avoid:** Percentages, spinners, "Loading…", generic "Processing your data…" copy. These feel like software. The copy above feels like intelligence.

---

## Step 2 — The Reveal Card (Full-Screen, Cinematic)

### Layout

Full viewport. Dark background. Single card centered vertically and horizontally. Maximum width ~680px. No sidebar, no nav visible, no competing elements.

### Hierarchy (top to bottom)

**Line 1 — Category label** (small, muted, uppercase tracking)
```
YOUR MOST EXPLOITABLE OPPONENT
```

**Line 2 — The Headline** (large, bold, high contrast — this is the moment)
```
Christian Is Vulnerable Right Now.
```

**Line 3 — The Evidence** (medium weight, slightly muted — grounds the headline)
```
Over the last 3 seasons, Christian's trade activity spikes 
after consecutive losses — and he consistently overpays 
in those windows. He's 0–2 to start 2026.
```

**Line 4 — The Implication** (smaller, italicized or slightly dimmed — strategic)
```
Strike before Week 4. He'll be motivated to move.
```

**Visual separator** — thin horizontal rule or subtle divider

---

### Why "Vulnerable Right Now" instead of "Most Exploitable Opponent"

"Most Exploitable Opponent" is analytical. "Vulnerable Right Now" is emotional and time-pressured. It implies urgency. It implies the window is closing. That's the conversion psychology.

---

## Step 3 — Secondary Emotional Hits (Three Cards Below the Reveal)

These appear after a brief fade-in delay (~0.5s after the main card). They are smaller — roughly half the height of the main card — and arranged in a row on desktop, stacked on mobile.

### Card A — Self-Insight

**Label:** `YOUR BIGGEST DRAFT WEAKNESS`

**Copy:**
```
You consistently reach for aging RBs in rounds 3–5 
after strong playoff finishes. The league has noticed.
```

**Why it works:** It's slightly uncomfortable. It implies the user has a tell. That creates curiosity and a desire to see the full analysis.

---

### Card B — Rivalry Insight

**Label:** `MOST LIKELY TO PANIC SELL`

**Copy:**
```
Snake 🐍 has initiated 3 of his last 4 trades 
within 48 hours of a primetime loss. 
He's your best trade partner right now.
```

**Why it works:** It names a specific manager, a specific behavior, and a specific timing pattern. It feels like insider information, not a generic stat.

---

### Card C — League-Wide Inefficiency

**Label:** `MARKET INEFFICIENCY`

**Copy:**
```
Future 2nd-round picks are consistently undervalued 
in your league after Week 5. 
This is your most repeatable edge.
```

**Why it works:** It positions the user as strategically ahead of the league. That's the social currency that drives sharing.

---

## Step 4 — Blur Strategy

### What is shown clearly
- The main Reveal card (full visibility)
- The three secondary cards (full visibility)

### What is blurred
Four additional "locked" insight cards appear below the three visible ones. They are rendered at approximately 60% opacity with a CSS blur filter (~4px). The text is legible enough to read the category label but not the content.

**Blurred card labels (visible through the blur):**
```
FULL MANAGER PROFILES          →  14 managers analyzed
TRADE NEGOTIATION PATTERNS     →  Your optimal leverage windows
BEHAVIORAL TIMELINES           →  Season-by-season psychology
CHAMPIONSHIP WINDOW ANALYSIS   →  Your realistic title path
```

**The blur must feel like depth, not a paywall.** The user should think: *"There's clearly more here."* Not: *"I'm being blocked."*

**Implementation rule:** Do not show a lock icon on the blurred cards. Do not show a price. Do not show "Pro only." The blur itself is the signal. The CTA below does the asking.

---

## Step 5 — CTA

### Placement
Centered, below the blurred cards. Generous whitespace above it — at least 48px. The CTA should feel like a natural conclusion, not a desperate ask.

### Primary CTA Button

**Copy:**
```
Unlock Your Full League DNA
```

**Visual:** Full-width on mobile, fixed ~320px on desktop. High contrast — white text on a deep accent color (the brand's primary action color). Subtle glow or shadow to make it feel premium, not flat.

### Subtext below the button (small, muted)

```
See every manager's behavioral profile, trade patterns, 
and your full championship intelligence report.
```

**What to avoid:** "Upgrade to Pro", "Subscribe Now", "Get Premium", "Sign Up". These are transactional. "Unlock Your Full League DNA" is personal and strategic.

---

## Pacing Summary

| Moment | Duration | Emotional State |
|---|---|---|
| Analysis screen, line 1 | 0–1.5s | Curiosity |
| Analysis screen, line 2 | 1.5–3s | Interest (specific number) |
| Analysis screen, line 3 | 3–4.5s | Intrigue (psychology) |
| Analysis screen, line 4 | 4.5–6s | Anticipation (personal) |
| Reveal card fades in | 6–6.8s | Surprise / recognition |
| Secondary cards fade in | 7.3s | Emotional resonance |
| Blurred cards appear | 7.8s | Curiosity about depth |
| CTA fades in | 8.3s | Motivated to act |

Total time from analysis start to CTA visible: **~8–9 seconds.**

---

## Hierarchy Summary

| Layer | Copy Style | Purpose |
|---|---|---|
| Category label | Small caps, muted | Frames the insight |
| Headline | Large, bold, high contrast | The emotional punch |
| Evidence | Medium, slightly muted | Grounds the claim |
| Implication | Small, italicized | Creates urgency |
| Secondary cards | Compact, sharp | Reinforces depth |
| Blurred cards | Visible labels only | Implies hidden intelligence |
| CTA | Full-width button | Converts curiosity to action |

---

## Grounding Rules (Non-Negotiable)

Every insight shown must reference observable behavior from real ESPN data. No fabricated patterns. No generic AI summaries. If the data doesn't support a specific claim, the copy must be softened to reflect what the data actually shows.

The test: if a user showed this to another manager in their league, would that manager say *"yeah, that sounds right"*? If yes, the insight passes. If it sounds like generic AI output, it fails.

---

## What This Is Not

This is not a dashboard. There are no charts. There are no tables. There are no raw scores. There are no percentages on the reveal cards. The numbers that appear (9 seasons, 126 matchups, 3 of 4 trades) are used as evidence in prose, not as metrics to be analyzed.

The reveal is emotional storytelling grounded in real data. That distinction is everything.
