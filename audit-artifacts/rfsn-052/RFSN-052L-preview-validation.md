# RFSN-052L — Preview validation

**Preview host:** `https://sprint-8-preview.fantasyfootballrivals.com`
**Git commit:** `68fa655`
**buildTime:** `2026-08-09T08:23:34.167Z`
**gitSha (may be stale):** `dff6154ca3a6f1e7713c9e4f5d1b681a76007b95`
**Live ESPN 457622:** 12 PASS / 0 FAIL
**Railway Preview:** SUCCESS `68fa655` · health must be Preview (`buildTime` ≥ `2026-08-09T08:23:34Z`).
**Production:** not deployed.

| Scenario | Step | Answer | PASS/FAIL |
| --- | --- | --- | --- |
| baseline | fresh biggest win — Who has the biggest win? | Largest single-game victory margins:<br><br>1. Rod Sellers – 129.5<br>2. Christian Graham – 129.0<br>3. Randy Broner Jr – 128.0<br>4. Mark Deroux – 124.0<br>5. Demetri Clark – 121.4<br><br>This was calculated from 1,399 recorded league regular-season matchups from 2010–2025. | PASS |
| primary | Q1 championships — Who has the most championships? | Across recorded championship history from 2009–2025, championship totals:<br>1. Christian Graham — 3 (2012, 2013, 2018)<br>2. Demetri Clark — 3 (2014, 2017, 2024)<br>3. LOZELL STYLES — 3 (2009, 2011, 2021)<br>4. Bruce Edwards — 2 (2016, 2023)<br>5. Randy Broner Jr — 2 (2019, 2020)<br>6. Rod Sellers — 2 (2010, 2025)<br>7. Nate West — 1 (2015)<br>8. steven hibbard — 1 (2022) | PASS |
| primary | Clear | 457622 | PASS |
| primary | Q2 biggest win after Clear — Who has the biggest win? | Largest single-game victory margins:<br><br>1. Rod Sellers – 129.5<br>2. Christian Graham – 129.0<br>3. Randy Broner Jr – 128.0<br>4. Mark Deroux – 124.0<br>5. Demetri Clark – 121.4<br><br>This was calculated from 1,399 recorded league regular-season matchups from 2010–2025. | PASS |
| compare-then-historical | Q1 compare — Compare Demetri Clark and LOZELL STYLES. | Across recorded meetings from 2010–2025, Demetri Clark vs LOZELL STYLES:<br>Regular season: tied 10–10–0 (20 games).<br>Playoffs: Demetri Clark leads 5–1–0 (6 games).<br>Meetings: 26.<br>Playoff eliminations: Demetri Clark has eliminated LOZELL STYLES 5 times; LOZELL STYLES has eliminated Demetri Clark 1 time.<br>Recent regular-season (last 5): 2–3–0 (5 games).<br>Current streak: Demetri Clark, 1-game win streak.<br>Closest game: 2013 week 1, 135.5–136 (margin 0.5).<br>Biggest blowout: 2015 week 16 (playoffs), 110–166 (margin 56, LOZELL STYLES).<br>Not all-time. Recorded meeting coverage is 2010–2025. | PASS |
| compare-then-historical | Q2 2009 record after Clear — What was LOZELL's 2009 regular-season record? | 2009 is preserved as a partial legacy season. The recorded data includes final podium placement, but detailed matchup history is unavailable. | PASS |
| metric-then-other | Q1 one-point losses — Who has the most one-point losses? | Mark Deroux has the most one-point losses: 4. This was calculated from 1,399 recorded league regular-season matchups from 2010–2025. Using a one-point range of 0.50–1.49 because this league uses decimal scoring. Next: Nate West 4, Jan Graham 2, LOZELL STYLES 2, Marlon Moore 2. | PASS |
| metric-then-other | Q2 blowouts after Clear — Who has the most 50-point blowout wins? | Christian Graham has the most wins by 50+ points: 32. This was calculated from 1,399 recorded league regular-season matchups from 2010–2025. Counting final-score win margins of at least 50 points (ties excluded). Next: Demetri Clark 28, Bruce Edwards 23, Jan Graham 23, Randy Broner Jr 23. | PASS |
| pronoun-then-named | Q1 LOZELL championships — How many championships does LOZELL STYLES have? | Across recorded championship history from 2009–2025, LOZELL STYLES has 3 championships (2009, 2011, 2021). | PASS |
| pronoun-then-named | Q2 Bruce after Clear — How many championships does Bruce Edwards have? | Across recorded championship history from 2009–2025, Bruce Edwards has 2 championships (2016, 2023). | PASS |
| ui-clear | Clear button resets chrome | {"scrollTop":0,"input":"","bubbleCount":0,"bubbleSample":[],"stillOnAdvisor":true,"userChip":"signed-in"} | PASS |
| ui-clear | UI biggest win after Clear — Who has the biggest win? | Who has the biggest win?Largest single-game victory margins:<br><br>1. Rod Sellers – 129.5<br>2. Christian Graham – 129.0<br>3. Randy Broner Jr – 128.0<br>4. Mark Deroux – 124.0<br>5. Demetri Clark – 121.4<br><br>This was calculated from 1,399 recorded league regular-season matchups from 2010–2025. | PASS |
