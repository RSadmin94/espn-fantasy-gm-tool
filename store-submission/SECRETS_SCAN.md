# Secrets / privacy scan — RFSN-058D

Scanned: `store-submission/` listing markdown, packaged extension (not the smoke profile cookie DB), promo/screenshot binaries (filenames only).

**Do not print secret values.**

| Finding | Severity | Action |
|---|---|---|
| Packaged JS builds Cookie header as `SWID=${swid}; espn_s2=${espnS2}` | Expected code, not a live cookie | None |
| Residual `clerkToken` message fields in SW/bridge | Code path, no token value in package | Disclose as unused internal handler |
| `package/.chrome-smoke-profile/` leftover Chrome profile | Do not upload; may contain browser state | Ignore / do not commit |
| Listing markdown localhost / Preview mentions | Documentation “do not use” | Fine |
| Live SWID / espn_s2 / Clerk secret / API key / Railway token / DB URL in listing docs | **None found** | — |
| Personal emails / review passwords in package docs | **None found** | — |

**NO SUBMISSION-BLOCKING SECRETS** in the ZIP or founder copy-paste files.

Do not upload the smoke profile. Founder screenshots must not contain live cookie values or personal email.
