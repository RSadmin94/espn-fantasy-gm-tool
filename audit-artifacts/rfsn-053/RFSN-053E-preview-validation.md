# RFSN-053E preview validation

- Host: https://sprint-8-preview.fantasyfootballrivals.com
- League: ESPN 457622
- buildTime: 2026-08-09T16:34:43.599Z
- Result: **22/22** (0 fail)

| Probe | Verdict | Notes |
| --- | --- | --- |
| collections catalog | PASS | no-mercy:22, heartbreak:4, championship:0, blood-rival:0, closest-calls:254, statement-wins:129, biggest-collapses:125, cashier:70 |
| count no-mercy | PASS | collection=22 query=22 empty=none |
| count heartbreak | PASS | collection=4 query=4 empty=none |
| count championship | PASS | collection=0 query=0 empty=insufficient_playoff_tier |
| count blood-rival | PASS | collection=0 query=19 empty=none |
| count closest-calls | PASS | collection=254 query=254 empty=none |
| count statement-wins | PASS | collection=129 query=129 empty=none |
| count biggest-collapses | PASS | collection=125 query=125 empty=none |
| count cashier | PASS | collection=70 query=70 empty=none |
| gallery home Story Collections | PASS | cards=8 |
| open no-mercy | PASS | /league/history/matchups/c/no-mercy?ownerName=Rod+Sellers&result=win&noMercy=1&marginMin=50&collection=no-mercy |
| open heartbreak | PASS | /league/history/matchups/c/heartbreak |
| open championship | PASS | /league/history/matchups/c/championship |
| open blood-rival | PASS | /league/history/matchups/c/blood-rival?ownerName=Rod%20Sellers&opponentName=Bruce%20Edwards |
| open closest-calls | PASS | /league/history/matchups/c/closest-calls |
| open statement-wins | PASS | /league/history/matchups/c/statement-wins |
| open cashier | PASS | /league/history/matchups/c/cashier |
| viewer collection badge | PASS | /league/history/matchups/4585?season=2025&week=17&collection=no-mercy |
| Advisor No Mercy | PASS | You have 22 No Mercy Rule victories (recorded regular-season and playoff matchups from 2010–2025). |
| Advisor Heartbreak | PASS | You have 4 one-point games (a final margin from 0.50 to 1.49 points; recorded regular-season and playoff matchups from 2012–2024). |
| Advisor Blood Rival | PASS | Rod Sellers vs Bruce Edwards: 19 recorded meetings from 2011–2025. |
| Advisor follow-up 2018 | PASS | You vs Bruce Edwards: 1 recorded meeting in 2018. |
