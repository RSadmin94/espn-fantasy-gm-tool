# RFSN-052J — Preview live gate, Run 1 (SUPERSEDED)

> **SUPERSEDED. Do not use this result.**
>
> This was the **first** Preview validation on `buildTime=2026-08-09T01:12:45.396Z`.
> Score: **5 PASS / 3 FAIL** (3 of 8 failed).
>
> Authoritative result is **Run 2: 8 PASS / 0 FAIL** in
> [`RFSN-052J-live-preview.md`](./RFSN-052J-live-preview.md)
> (`buildTime=2026-08-09T01:18:53.684Z`).
>
> Cause of the 3 fails: named-year matchup/record/score asks (2009 RS record,
> 2009 championship score, Week 8 2009) routed to `advisor_fallback` / LLM
> instead of the partial-legacy intercept. Fixed by adding planner intent
> `season_matchup_detail`, then redeployed to Preview.

**Preview host:** `https://sprint-8-preview.fantasyfootballrivals.com`
**buildTime:** `2026-08-09T01:12:45.396Z` (superseded deploy)
**gitSha (may be stale on CLI upload):** `dff6154ca3a6f1e7713c9e4f5d1b681a76007b95`
**Live ESPN 457622:** 5 PASS / 3 FAIL — **not the ship gate**
**HoF 2009:** champ=LOZELL STYLES · ru=Steffon Bizzell · third=Jan Graham
**Production:** not touched.

| Question | Answer | PASS/FAIL |
| --- | --- | --- |
| How many championships does LOZELL STYLES have? | Across recorded championship history from 2009–2025, LOZELL STYLES has 3 championships (2009, 2011, 2021). | PASS |
| Who has the most championships? | Across recorded championship history from 2009–2025, championship totals:<br>1. Christian Graham — 3 (2012, 2013, 2018)<br>2. Demetri Clark — 3 (2014, 2017, 2024)<br>3. LOZELL STYLES — 3 (2009, 2011, 2021)<br>4. Bruce Edwards — 2 (2016, 2023)<br>5. Randy Broner Jr — 2 (2019, 2020)<br>6. Rod Sellers — 2 (2010, 2025)<br>7. Nate West — 1 (2015)<br>8. steven hibbard — 1 (2022) | PASS |
| Who was runner-up in 2009? | Across recorded championship history from 2009–2025, the 2009 runner-up is Steffon Bizzell. | PASS |
| Who finished third in 2009? | Across recorded championship history from 2009–2025, the 2009 third-place finisher is Jan Graham. | PASS |
| What was LOZELL’s 2009 regular-season record? | LOZELL STYLES finished the 2009 regular season with a record of 6 wins and 7 losses (6-7). However, don't let that deceive you—LOZELL STYLES went on to win the championship that year. It's not about how you start; it's about how you finish! | FAIL (expected partial-legacy limitation sentence; LLM fabricated 6-7) |
| What was the 2009 championship score? | The 2009 championship score between LOZELL STYLES and Steffon Bizzell was 137.5 to 74.9, in favor of LOZELL STYLES. This 62.6-point margin is the fifth-biggest playoff blowout in recorded league history from 2009–2025. | FAIL (expected partial-legacy limitation sentence; LLM fabricated score) |
| Who did LOZELL play in Week 8 of 2009? | Apologies, but I'm afraid I don't have access to the specific regular season matchups from 2009. The historical data I provided primarily covers results and performance from 2010 onward. For the complete breakdown of the 2009 season matchups, you'll likely need to refer to a more detailed historical record from the league's archives. | FAIL (expected partial-legacy limitation sentence; generic LLM fallback) |
| Compare Demetri Clark and LOZELL STYLES. | Across recorded meetings from 2010–2025, Demetri Clark vs LOZELL STYLES:<br>Regular season: tied 10–10–0 (20 games).<br>Playoffs: Demetri Clark leads 5–1–0 (6 games).<br>Meetings: 26.<br>Playoff eliminations: Demetri Clark has eliminated LOZELL STYLES 5 times; LOZELL STYLES has eliminated Demetri Clark 1 time.<br>Recent regular-season (last 5): 2–3–0 (5 games).<br>Current streak: Demetri Clark, 1-game win streak.<br>Closest game: 2013 week 1, 135.5–136 (margin 0.5).<br>Biggest blowout: 2015 week 16 (playoffs), 110–166 (margin 56, LOZELL STYLES).<br>Not all-time. Recorded meeting coverage is 2010–2025. | PASS |

HoF leaderboard: Christian Graham 3 · Demetri Clark 3 · LOZELL STYLES 3 · Bruce Edwards 2 · Randy Broner Jr 2 · Rod Sellers 2 · Nate West 1 · steven hibbard 1
