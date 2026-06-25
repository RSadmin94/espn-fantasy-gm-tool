# GM War Room — Narrative Style Guide

**Version:** v1.1
**Status:** Active — governs the language of every storytelling surface in GM War Room.
**Audience:** Engineers, agents, and designers writing or generating any product-facing sentence.
**Relationship to other governing documents:** This is the **third governing document**, alongside `PRODUCT_CONSTITUTION.md` (what we build) and `.cursor/rules/rivalry-center-constitution.mdc` (Rivalry implementation guardrail). This guide defines *how the product speaks*. Where a feature implementation and this guide disagree on language, this guide wins.

*How the product speaks. One voice across every rivalry, every owner profile, every championship path, and every storytelling feature built from this day forward.*

---

## THE ONE-LINE LAW

**The product names patterns the data has earned. It never invents them.**

Every other rule below is a consequence of that sentence.

---

## I. VOICE — WHERE WE SIT

If ESPN writes like lawyers — careful, hedged, terrified of being wrong — and Netflix writes like journalists — confident, narrative, willing to let a fact carry weight — then **GM War Room sits exactly between them, and slightly toward Netflix.**

We are the **broadcast analyst at the moment of the replay.** Not the play-by-play voice screaming over the action, and not the lawyer reading a disclaimer. The analyst who watches the slow-motion, points at the screen, and says the one true thing everyone just saw but couldn't articulate: *"He's lost every playoff meeting since 2019. That's not a slump. That's the rivalry."*

Three properties define the voice:

- **Declarative, not deliberative.** We do not reason aloud. We deliver the conclusion the data already reached.
- **Plain, not academic.** A league member reads it, not a statistician. "He owns the postseason," never "he holds a statistically significant postseason advantage."
- **Restrained, not breathless.** The facts are dramatic. The language doesn't need to be. We trust the number to hit; we don't shove it.

The voice is the same whether the rivalry is legendary or quiet, whether the owner won the title or finished last. Tone may cool or warm with the facts. **The voice never changes.**

---

## II. THRESHOLD LANGUAGE

*Words are deterministic data, not decoration. This section sits immediately after Voice because the most important thing a contributor can learn early is that a loaded word is a measurement — it is permitted only when its condition is met.*

A loaded word may only appear when its deterministic condition is met. These thresholds are law. If the condition fails, the word is forbidden — no exceptions, no "close enough."

| Word | May be used only when |
|---|---|
| **Deadlocked / Even** | Record is within 1 game, after ≥8 meetings |
| **Owns** | ≥.700 win rate over ≥10 meetings, **or** a perfect record over ≥4 |
| **Dominated** | ≥.750 win rate over ≥10 meetings **and** an active or recent multi-game streak |
| **Swept** | Won every meeting in a defined set (season, or playoffs) with ≥2 games |
| **Heartbreak** | A loss by ≤3 points, **or** any playoff elimination loss |
| **Legendary** (Tier 1) | Playoff history **and** a proven lead-flip **and** (title implication or ≥12 meetings) |
| **Playoff Nightmare / Executioner** | ≥3 playoff wins over the opponent, **or** ≥3 eliminations |
| **Gatekeeper** | Eliminated the opponent from the playoffs in ≥2 separate seasons |
| **Dynasty** | ≥2 titles by one owner within a defined window (Championship Authority) |
| **Spoiler** | Beat a playoff-bound opponent while eliminated from contention |
| **Revenge / Upset** | Revenge: a win immediately following a loss to the same owner. Upset: lower seed or lower season-PF beats higher |
| **Collapsed / Collapse** | Surrendered a lead of a defined size, **or** lost after posting a top-decile score for that season |
| **Heavyweight** | Both owners have ≥1 title **or** ≥1 championship-game appearance |
| **Streak** | ≥3 consecutive results in one direction |

When in doubt between two words, choose the **weaker** one. We would rather under-claim a legend than over-claim a footnote. Under-claiming costs a little drama. Over-claiming costs the brand.

---

## III. WHEN SILENCE WINS

Not every moment deserves a sentence. **Silence is a valid output** — and often the most trustworthy one.

The product may withhold narrative when:

- **No threshold is met.** If a loaded word's condition fails, the word does not appear. If no weaker alternative is truthful, say nothing in loaded language.
- **The sample is thin.** Fewer meetings than a label requires → show the count, withhold the verdict. "Too early to call" is honest; invented drama is not.
- **The pattern is noise.** A single odd result does not earn a storyline. Repetition across meetings or seasons earns language.
- **The user would not retell it.** If a league member would not bring this up unprompted, the product should not force it into a headline.

Silence is not emptiness. It is **restraint with integrity**. A bare record ("4–3") without a false feud label is better than a sentence that over-claims. Padding silence with generic hype, filler transitions, or sympathy copy violates the One-Line Law.

When silence wins, the UI may still show **measurable facts** (record, margin, season, score). It must not fabricate **meaning** the data has not earned.

---

## IV. NARRATIVE CONSTRUCTION

The product does not generate arbitrary prose. Every sentence originates from a controlled deterministic narrative template whose eligibility is defined by measurable thresholds. Templates are implementations of this guide—not alternatives to it. The implementation may evolve. The principles in this guide do not.

---

## V. TRAINING EXAMPLES

Each pair shows a forbidden draft and the approved rewrite. The pattern is always the same: cut the hedge, lead with the conclusion, let the number prove it, stop.

**Dominance & ownership**

1. ❌ "Marlon probably dominated this rivalry." → ✅ "Marlon owns this rivalry. He's won 8 of 11."
2. ❌ "Rod seems to control the regular season." → ✅ "Rod controls the regular season. He leads it 6–3."
3. ❌ "It appears Marlon owns the playoffs." → ✅ "Marlon owns the playoffs. He's won four of five."
4. ❌ "Lozell has arguably been dominant lately." → ✅ "Lozell has won five straight against Bruce."
5. ❌ "Demetri likely has the upper hand." → ✅ "Demetri leads the series 9–4."

**Even rivalries**
6. ❌ "These two seem pretty evenly matched." → ✅ "Dead even. Tied 6–6 across nine years."
7. ❌ "It's basically a coin flip between them." → ✅ "They've split their last ten meetings, 5–5."
8. ❌ "Neither really pulls ahead." → ✅ "The series has never been more than one game apart."
9. ❌ "A very close rivalry overall." → ✅ "Twelve meetings. Separated by a single win."
10. ❌ "They're honestly neck-and-neck." → ✅ "Tied on the field. Tied in titles. One each."

**Playoffs & stakes**
11. ❌ "Marlon has been a bit of a playoff nightmare." → ✅ "Marlon is Rod's executioner. Three eliminations."
12. ❌ "He's probably ended Rod's season a few times." → ✅ "Marlon has ended Rod's season three times."
13. ❌ "Rod hasn't done well in the playoffs against him." → ✅ "Rod hasn't beaten Marlon in the playoffs since 2019."
14. ❌ "Marlon seems to be a gatekeeper here." → ✅ "Marlon is the gatekeeper. He's eliminated Rod in three separate seasons."
15. ❌ "This rivalry is kind of defined by the postseason." → ✅ "Dead even in the regular season. Marlon 4–1 when it counts."

**Heartbreak & close losses**
16. ❌ "That playoff loss was probably heartbreaking." → ✅ "Rod lost that playoff game by 1.6 points."
17. ❌ "A tough, narrow defeat." → ✅ "He fell by a single point in the semifinal."
18. ❌ "Rod nearly had him." → ✅ "Rod led until the final game of the week. He lost by 0.8."
19. ❌ "It was a brutal way to go out." → ✅ "His season ended on a 1.6-point loss."
20. ❌ "So close, so painful." → ✅ "Three of his five losses came by under four points."

**Collapse**
21. ❌ "Rod kind of collapsed down the stretch." → ✅ "Rod scored his season high — 166 — and lost."
22. ❌ "A shocking collapse, honestly." → ✅ "He surrendered a 30-point lead in Week 14."
23. ❌ "He fell apart when it mattered." → ✅ "After a 5–2 start, Rod lost five of the next six."
24. ❌ "An epic meltdown." → ✅ "He posted a top-three score for the season and still lost."
25. ❌ "Things unraveled for him." → ✅ "He led the rivalry 5–2. He now trails the era 1–5."

**Revenge & upsets**
26. ❌ "Rod probably got his revenge." → ✅ "Rod answered the next week. He won by 40."
27. ❌ "A satisfying bounce-back." → ✅ "One week after losing by 10, Rod won by 40."
28. ❌ "Kind of an upset, maybe." → ✅ "The lower seed won. Bruce upset the 2-seed."
29. ❌ "He got payback eventually." → ✅ "Rod's revenge came in Week 14: a 166-point, 40-point win."
30. ❌ "An unexpected result." → ✅ "Demetri scored 40 fewer points on the season — and won the game."

**Turning points & eras**
31. ❌ "The rivalry seems to have shifted." → ✅ "Through 2022, Rod led 5–2. Since 2023, Marlon has gone 4–1."
32. ❌ "Things changed around 2023." → ✅ "2023 is the turn. The lead flipped and never flipped back."
33. ❌ "Marlon got better over time, probably." → ✅ "Marlon has won five of the last six meetings."
34. ❌ "There was a clear momentum change." → ✅ "Rod hasn't led this rivalry since Week 13 of 2022."
35. ❌ "A new era began." → ✅ "Two eras: Rod 5–2 through 2022, Marlon 4–1 since."

**Streaks & current state**
36. ❌ "Marlon's been hot lately." → ✅ "Marlon has won three straight."
37. ❌ "Rod is probably on the back foot now." → ✅ "Rod has lost four of the last five."
38. ❌ "Momentum seems to favor Marlon." → ✅ "If they play this week, Marlon brings a three-game streak."
39. ❌ "He's struggled recently." → ✅ "Rod is 1–4 in his last five against Marlon."
40. ❌ "The recent trend is clear." → ✅ "Last ten meetings: Marlon 6, Rod 4."

**Records vs. legacy**
41. ❌ "Rod's been good but unlucky." → ✅ "Rod has outscored Marlon by 48 points — and trails the series."
42. ❌ "He deserves better than his record." → ✅ "Even points. Even record. Marlon has the titles."
43. ❌ "A statistically significant scoring edge." → ✅ "Rod has outscored him across their last ten meetings."
44. ❌ "He took the rings, basically." → ✅ "Marlon took the rings. Rod took the points."
45. ❌ "Their legacies diverge somewhat." → ✅ "Dead even on the field. Different banners on the wall."

**Dynasty, heavyweight, spoiler**
46. ❌ "Marlon's kind of building a dynasty." → ✅ "Marlon has won two titles in four years."
47. ❌ "These are two heavyweights, probably." → ✅ "Two champions. Two title-game runs. One rivalry."
48. ❌ "Bruce played spoiler, sort of." → ✅ "Eliminated from contention, Bruce beat the playoff-bound 2-seed."
49. ❌ "Marlon has been a dominant force for years." → ✅ "Marlon has reached the championship in three of the last five seasons."
50. ❌ "This might be the league's best rivalry." → ✅ "Seventeen meetings. Five playoff games. Tied 6–6. The longest, closest rivalry in the league."

---

## NORTH STAR

The highest compliment this product can receive is, *"I forgot that happened until I saw it."* Every sentence should strive to earn that reaction.

