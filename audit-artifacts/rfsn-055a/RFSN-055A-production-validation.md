# RFSN-055A — Production validation (Historical Draft Grades + Draft Reality)

**Status:** Live Production. Closed.

**Host:** `https://www.fantasyfootballrivals.com`
**Release:** `release/promote-provider-expansion-dff6154`
**Git:** `635585f` (055A + same-season ADP authority; **Advisor `query_draft_intelligence` not wired**)
**Railway:** Git deploy `c21ab5ce` SUCCESS (not CLI)
**commitHash:** `635585f8d3dc6e42f2911edf1c2918b75a3ecaf9`
**buildTime:** `2026-08-17T19:04:31.361Z` (was `2026-08-10T07:39:05.771Z`)
**gitSha (stale):** `06b35ba` — ignore
**Founder league:** ESPN `457622`
**Live JS:** `assets/index-2swMppRe.js`

| Bundle string | Present |
| --- | --- |
| `historicalDraftEvaluation` | yes |
| `Draft Night` | yes |
| `Draft Results` | yes |
| `Best Pick` | no |
| `query_draft_intelligence` | **no** (055 Advisor stays Preview) |

## Promote

| Gate | Result |
| --- | --- |
| Production tree vs Preview `5b34a29` | Draft History / routers / composer only + ADP files Production lacked |
| 055 Advisor leak | **None** — planner/package/executor not promoted |
| Same-season ADP on Production | **Yes** — `espnOffenseAdpSameSeason` + `isUsableAdp` required for Night grades |
| Git push (no `railway up`) | `a51491b..635585f` |
| Railway | SUCCESS `c21ab5ce` / `commitHash=635585f` |
| Health `buildTime` advanced | **PASS** `19:04:31.361Z` |

## What shipped

`/draft/history` Team view:

- **Draft Night** = `computeOwnerDraftMetrics` + same-season ESPN ADP
- **Draft Results** = `computeDraftReality.draftGrade` (0–100)
- **Roster Management** = raw `rosterMgmtGrade`
- Board view unchanged

API: `espn.historicalDraftEvaluation`

## Founder coverage (same authority as Preview)

See `RFSN-055A-preview-validation.md` for Rod Sellers 2018/2022/2024/2025 numbers. Production uses the same composer. Honest holes unchanged: 2010–2017 Night —; 2018 Results unpublished; 2019 Night 0 usable ADP; 2025 Night sentinel ADP.

Open Production `/draft/history` → **Team** view to confirm grades at seated desktop.
