# GM Briefing — V2 Front Page Design Spec

**Status:** Locked concept — refine presentation during implementation; do not reopen architecture.  
**Implementation:** Not started — design only.  
**Codename:** GM Briefing (never “Dashboard”)

---

## Philosophy (non-negotiable)

> **The front page is not a collection of features. It is the front page of your league's newspaper. Every login should feel like opening today's edition.**

Fantasy Football Rivals analyzes **people**, not player rankings. The home experience must communicate that immediately. Every section answers one of two questions:

1. **Who am I?**
2. **How do I beat my rivals?**

Nothing else belongs on the front page.

We are not ESPN's dashboard. We are not FantasyPros. We are not Yahoo. **Do not use the word “Dashboard”** in product copy, navigation, docs aimed at users, or new component names. Retire it everywhere over time.

---

## Product naming

| Context | Use | Never use |
|---------|-----|-----------|
| Nav label | **The Briefing** or **Today's Briefing** | Dashboard |
| Page title / masthead | **Today's League** · **GM Briefing** · **Front Page** | Dashboard |
| Internal engineering (legacy) | `Dashboard.tsx` may exist until migration — alias routes/copy only | Expose “Dashboard” to users |
| Morning framing | **Morning Briefing** (optional seasonal copy) | Home, Overview |

**Recommended default nav label:** **The Briefing**

---

## Information hierarchy (70 / 20 / 10)

| Tier | Weight | Sections |
|------|--------|----------|
| **Hero** | ~70% | The Biggest Story in Your League |
| **Secondary** | ~20% | League Headlines, Rival of the Week, Weekly advantage block |
| **Supporting** | ~10% | GM Identity, League Activity, Action Center, Coming Next |

---

## Page structure (top to bottom)

```
┌─────────────────────────────────────────────────────────────────┐
│ 0. PERSONALIZATION STRIP (small, above hero)                    │
├─────────────────────────────────────────────────────────────────┤
│ 1. HERO — The Biggest Story in Your League                      │
├─────────────────────────────────────────────────────────────────┤
│ 2. QUOTE OF THE WEEK (one sentence)                             │
├─────────────────────────────────────────────────────────────────┤
│ 3. LEAGUE HEADLINES (generate 6, show 3 best, color-coded)     │
├─────────────────────────────────────────────────────────────────┤
│ 4. GM IDENTITY  │  5. RIVAL OF THE WEEK (+ Why now?)            │
├─────────────────────────────────────────────────────────────────┤
│ 6. THIS WEEK'S ADVANTAGE (Rivals) — not "Game Plan"             │
├─────────────────────────────────────────────────────────────────┤
│ 7. LEAGUE ACTIVITY (unchanged — perfect as-is)                  │
├─────────────────────────────────────────────────────────────────┤
│ 8. ACTION CENTER (compact)                                      │
├─────────────────────────────────────────────────────────────────┤
│ 9. COMING NEXT… (Rivals teaser — always last)                   │
└─────────────────────────────────────────────────────────────────┘
```

**Masthead** (persistent chrome): date, league name, week, season select, sync — not counted in 70/20/10.

---

## §0 Personalization strip

**Purpose:** Instant “this is mine” before the hero.

**Visual:** Very small. One line + metadata chips. No card chrome.

**Example:**

```
GOOD MORNING, RODERICK
Atlanta's Finest · Week 8 · 9 Seasons · 287 Rivalries · Ready
```

**Data:** display name, league name, current week, tenure seasons, rivalry count (or league stories indexed), sync/ready state.

**Free / Rivals:** Identical.

---

## §1 Hero — The Biggest Story in Your League

**Purpose:** Journalism, not BI. One story. Emotional reaction: “Holy crap.” / “I forgot about that.”

**Critical rule:** The hero is **not always rivalry**. It is whatever story matters most **this week** (or this day).

| Week / phase | Example story type |
|--------------|-------------------|
| Week 4 | Dave has lost five straight games |
| Week 12 | Mike controls the playoff race |
| Week 8 | You haven't beaten Christian in three years |
| Week 1 | Five rookies changed the future of your league |
| Offseason | The draft begins in 12 days |
| Championship week | One game decides your legacy |

### Headline vs statistic

**Wrong (statistic as headline):**  
“You are 1–8 vs Mark after Week 10.”

**Right (headline + receipt underneath):**

**The Curse of November**  
You've beaten Mark only once after Week 10.

People remember headlines. The dek carries the proof.

### Presentation

- Cinematic panel (~70% above-fold visual weight)
- Large display headline (newspaper, not app title)
- 1–2 sentence dek with evidence
- **CTA:** `Read More →` (never “View Story”)

### Story selection

Rank candidates across **all** league narrative types: rivalry, streaks, playoff race, draft, championship, milestones, upsets, league-firsts. Rivalry is one candidate among many.

### Daily edition (not sync-driven)

**The front page should change every day**, not only when ESPN syncs. The same database can support different stories via:

- Daily story rotation / ranking seed (date-based)
- Alternate headline framing for the same fact
- “Tomorrow’s edition” tease in Coming Next

Examples from same data:

| Day | Hero headline |
|-----|----------------|
| Today | The Curse of November |
| Tomorrow | The League's Longest Rivalry |
| Next week | Nobody Drafts Like You |

**Goal:** People return to see **today’s edition**.

**Free:** Full hero.  
**Rivals:** Full hero; Read More → deepest story surface.

---

## §2 Quote of the Week

**Purpose:** Screenshot-worthy one-liner. Voice of the league.

**Format:** One sentence, attributed tone (“The league says…” or pull-quote styling). Auto-generated from patterns + history. Rotates weekly (or daily in high-engagement mode).

**Examples:**

- “Dave is still chasing the championship he promised in 2021.”
- “Mark hasn't recovered from last year's playoff collapse.”
- “Christian drafted another rookie. Nobody is surprised.”

**Placement:** Directly below hero (or between hero and headlines) — high visibility, low vertical space.

**Free / Rivals:** Full quote.

---

## §3 League Headlines

**Purpose:** ESPN ticker energy — league is alive.

**Pipeline:** Generate **6** candidates → rank (rules + optional LLM polish with evidence map) → **show top 3**.

Weak candidates never surface.

### Color coding (tiny thing, huge readability)

| Color | Category | Example |
|-------|----------|---------|
| Blue | League News | Three managers projected within five points |
| Green | Milestone | Nobody has repeated as champion since 2020 |
| Orange | Trade | Mike completed his first trade in 14 months |
| Purple | Rivalry | Christian owns the league's longest winning streak |
| Red | Upset Alert | Last-place team beat the #1 seed |

### Mobile

**Collapsed by default:**

```
League Headlines ▼
Mike completed first trade in 14 months
Christian won six straight
+4 more
```

Expand reveals full ranked set (up to 3–6).

**Free / Rivals:** All visible headlines; Rivals may deep-link.

---

## §4 GM Identity

**Purpose:** Who am I? **Human**, not spreadsheet.

**Avoid:** “GM Rating 78” as primary label.

**Prefer emotional identity copy:**

| Label | Example |
|-------|---------|
| **Your Reputation** | The Contender |
| **League says…** | Never quits. |
| **Known for** | Aggressive trades. |
| **Feared because** | Late-season comebacks. |

Also show (compact): career record, championships, current rank — supporting stats, not the lead.

**CTA:** `View Full GM Profile →`

**Free / Rivals:** Full identity card.

---

## §5 Rival of the Week

**Purpose:** Featured opponent — user must immediately understand **why this rival matters now**.

```
RIVAL OF THE WEEK
MARK DEROUX

Why now?
• You play him Sunday.
• He eliminated you in 2022.
• He has beaten you four straight times.

Heat: Inferno

[ Read More → ]

🔒 Full scouting report — Rivals
```

**Free:** Name, heat, Why now (factual bullets), one teaser line.  
**Rivals:** Trade behavior, draft tendencies, full H2H, scouting depth.

**Selection:** This week’s opponent when relevant; else hottest rivalry; else `#1` rival from identity.

---

## §6 This Week's Advantage (not “Game Plan”)

**Never call it Game Plan** — sounds like software.

**Use contextual titles:**

| Context | Section title |
|---------|----------------|
| vs Mark this week | **Beat Mark** |
| Generic week | **This Week's Advantage** |
| Action framing | **How You Win** |
| Pattern framing | **Winning Formula** |

**Examples (Rivals, full):**

- Watch for an early QB run.
- Dave historically trades after Week 3 losses.
- Mike starts veterans in rivalry games.

**Free:** Section visible; 2 bullets + lock on remainder.  
**Copy:** “Unlock Rivals for your weekly winning formula.”

---

## §7 League Activity

**No changes from prior spec.** Small feed: trades, waivers, milestones. Supporting intelligence only.

---

## §8 Action Center

Compact utility: upcoming matchup, trade window, waiver reminder, sync status. Never competes with hero.

---

## §9 Coming Next… (commercial + retention)

**Always last.** Tease the next discovery. Drives Rivals conversion without crippling free experience.

**Example:**

```
Coming Next…
Mike has accepted 81% of trades after losses.
Available in Rivals.
```

Rotate teasers from locked intelligence (patterns user hasn’t seen). Pairs with daily hero rotation.

---

## Free vs Rivals summary

| Section | Free | Rivals |
|---------|------|--------|
| Personalization strip | Full | Full |
| Hero story | Full | Full + deeper Read More |
| Quote of the Week | Full | Full |
| Headlines (top 3) | Full | Full + links |
| GM Identity | Full | Full |
| Rival of the Week | Why now + teaser | Full scouting |
| This Week's Advantage | Teaser | Full |
| League Activity | Full | Full |
| Action Center | Full | Full |
| Coming Next | Teaser always | Unlocks named |

---

## Copy vocabulary

**Use:** Story, headline, edition, briefing, front page, rival, legacy, pattern, prediction, scouting report, league news, history, reputation, why now, read more, coming next, upset, milestone  

**Avoid:** Dashboard, analytics, metrics, behavioral intelligence, derived data, game plan, view story, widget, insights (as product noun)

---

## Responsive layouts

### Desktop (≥1280px)

- Personalization strip full width
- Hero full width (~42vh)
- Quote single line, centered or left
- Headlines horizontal or 3-column with color dots
- Identity 35% | Rival 65%
- Advantage full width
- Activity 60% | Action 40%
- Coming Next full width footer band

### Tablet (768–1279px)

Single column; same order as mobile with more horizontal breathing room.

### Mobile (<768px)

- Collapsed headlines (see §3)
- Hero min ~32vh; `Read More →` pinned to hero footer
- Quote wraps to 2 lines max
- Coming Next sticky optional (design decision at impl)

---

## Weekly vs daily vs persistent

| Content | Daily rotation | Weekly rotation | Persistent |
|---------|----------------|-----------------|------------|
| Hero headline framing | ✓ | ✓ (phase) | — |
| Quote of the Week | optional | ✓ | — |
| Headlines | ✓ | ✓ | — |
| Rival of the Week | ✓ | ✓ | Core rival identity |
| This Week's Advantage | — | ✓ | — |
| GM Identity reputation | — | slow | Career, titles |
| Coming Next teaser | ✓ | ✓ | — |
| Personalization strip | ✓ | — | League name, user |

---

## Animation

- Hero: single fade-up on load; no loop
- Headlines: staggered reveal (50ms)
- `prefers-reduced-motion`: instant show
- No typewriter by default
- Heat “Inferno”: subtle one-time pulse only

---

## Reuse from V1 (engineering)

| Asset | V2 use |
|-------|--------|
| `welcomeBackCoachBriefing.ts` | Story/headline candidate ranking |
| `dashboardBriefingData.ts` | Headline + activity strings |
| `rivalryStoryAuthority.ts` | Hero + quote evidence |
| `useRivalryDossierScan` | Rival of the Week picker |
| `RivalrySummaryCard` | Rival body |
| `DashboardMatchupMarquee` | Action Center + hero visual language |
| `DashboardRecentLeagueEvents` | League Activity |
| `LeagueWireNewsFeed` | Headline candidates |
| `FreeGmProfileTeaser` | Identity field source |
| `CinematicPageHeader` | Evolve to masthead |
| `ProGate` / `commercialCopy` | Advantage + Coming Next locks |

## New surfaces required

| Surface | Notes |
|---------|-------|
| `GmBriefingPage` | Layout shell — not `WelcomeBackCoachHome` |
| `BriefingPersonalizationStrip` | §0 |
| `BriefingHeroStory` | Headline + dek + Read More |
| `QuoteOfTheWeek` | §2 |
| `LeagueHeadlinesTicker` | 6→3 ranked, color-coded |
| `GmIdentityCard` | Emotional identity copy |
| `RivalOfTheWeekCard` | Why now block |
| `WeekAdvantagePanel` | Renamed from Game Plan |
| `ComingNextTeaser` | §9 footer |
| `briefing.getToday` (API) | Hero, quote, headlines, rival, advantage teaser — one round-trip |

---

## Migration (unchanged strategy, renamed)

1. Feature flag `VITE_GM_BRIEFING_V2` — parallel shell
2. Ship personalization + hero + headlines first
3. Add quote, identity, rival, advantage
4. Demote V1: Intelligence Trio, standings table, timeline, explore grid off front page
5. Rename all user-facing “Dashboard” strings to **The Briefing**
6. Cutover; delete old home layout when QA passes

---

## Success criteria

User thinks: **“My league has news today.”**  
User does **not** think: **“I'm looking at widgets.”**

Screenshot test: Quote of the Week + hero headline shared in group chat.

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | Initial V2 hierarchy + wireframes |
| 2026-06-25 | Locked refinements: no “Dashboard”, biggest-story hero, headlines 6→3, Why now, emotional identity, Quote of the Week, personalization strip, Read More CTA, Coming Next, daily editions, color-coded headlines |

**Architecture locked.** Refine presentation during implementation only.
