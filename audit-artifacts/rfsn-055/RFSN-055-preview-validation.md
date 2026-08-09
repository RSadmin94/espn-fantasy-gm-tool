# RFSN-055 — Preview validation

**Host:** `https://sprint-8-preview.fantasyfootballrivals.com`
**buildTime:** `2026-08-09T10:06:02.242Z`
**gitSha (may be stale):** `dff6154ca3a6f1e7713c9e4f5d1b681a76007b95`
**Live ESPN 457622:** 4 PASS / 5 FAIL
**Founder:** Clerk `user_3E8K7ihI9tYXU06UJ5BfeCsg1bo`

| Question | Kind | Tool | Answer | PASS/FAIL |
| --- | --- | --- | --- | --- |
| Who reaches the most? | adp | query_draft_intelligence | Recorded draft history covers 2010–2026. ADP is not available for those seasons, so reach and steal rankings cannot be computed. | FAIL (no recognizable founder owner; reach/steal answer missing pick or ADP number; not a deterministic ADP draft-intelligence answer) |
| What was the biggest reach ever? | adp | query_draft_intelligence | Recorded draft history covers 2010–2026. ADP is not available for those seasons, so reach and steal rankings cannot be computed. | FAIL (no recognizable founder owner; reach/steal answer missing pick or ADP number; not a deterministic ADP draft-intelligence answer) |
| What was the biggest steal? | adp | query_draft_intelligence | Recorded draft history covers 2010–2026. ADP is not available for those seasons, so reach and steal rankings cannot be computed. | FAIL (no recognizable founder owner; reach/steal answer missing pick or ADP number; not a deterministic ADP draft-intelligence answer) |
| Who drafts QBs early? | board | query_draft_intelligence | Across recorded drafts from 2010–2026, earliest average QB selection:<br>1. Maurice Welch — round 2.0 (1 QB picks, earliest R2)<br>2. Steffon Bizzell — round 3.7 (6 QB picks, earliest R1)<br>3. Nate West — round 4.7 (10 QB picks, earliest R2)<br>4. LOZELL STYLES — round 5.3 (7 QB picks, earliest R1)<br>5. Randy Broner Jr — round 5.5 (8 QB picks, earliest R2)<br>Not all-time. Recorded draft coverage is 2010–2026. | PASS |
| Who waits on QB? | board | query_draft_intelligence | Across recorded drafts from 2010–2026, latest average QB selection:<br>1. Jan Graham — round 9.0 (2 QB picks, earliest R6)<br>2. Tony Dorsey — round 8.7 (3 QB picks, earliest R5)<br>3. teco Browning — round 8.3 (3 QB picks, earliest R8)<br>4. Sheldon deRoux — round 8.0 (10 QB picks, earliest R1)<br>5. Christian Graham — round 7.8 (9 QB picks, earliest R2)<br>Not all-time. Recorded draft coverage is 2010–2026. | PASS |
| Who loves RBs? | board | query_draft_intelligence | Across recorded drafts from 2010–2026, earliest average RB selection:<br>1. Tony Dorsey — round 3.0 (5 RB picks, earliest R1)<br>2. teco Browning — round 3.4 (7 RB picks, earliest R2)<br>3. Vince Sellers — round 3.8 (4 RB picks, earliest R2)<br>4. Steffon Bizzell — round 4.1 (8 RB picks, earliest R1)<br>5. steven hibbard — round 4.4 (14 RB picks, earliest R1)<br>Not all-time. Recorded draft coverage is 2010–2026. | PASS |
| Who drafts safest? | adp | query_draft_intelligence | Recorded draft history covers 2010–2026. ADP is not available for those seasons, so reach and steal rankings cannot be computed. | FAIL (no recognizable founder owner; reach/steal answer missing pick or ADP number; not a deterministic ADP draft-intelligence answer) |
| Who gambles the most? | adp | query_draft_intelligence | Recorded draft history covers 2010–2026. ADP is not available for those seasons, so reach and steal rankings cannot be computed. | FAIL (no recognizable founder owner; reach/steal answer missing pick or ADP number; not a deterministic ADP draft-intelligence answer) |
| Who reached the most in 2010? | thin-adp | query_draft_intelligence | Recorded draft history covers 2010. ADP is not available for those seasons, so reach and steal rankings cannot be computed. | PASS |
