# RFSN-058B current-state audit (inspected source, not prior reports)

**RFSN-058D re-inspection (2026-09-03):** Store popup, Store manifest, and declared hosts remain single-purpose (ESPN → Rivals). Residual service-worker / bridge handlers remain **INTERNAL ONLY / NON-BLOCKING**. No v1.14.4 mutation. ZIP SHA unchanged.

---

Inspected: `chrome-extension/manifest.json` (internal 1.14.3), `chrome-extension/store/*` (Store overlay 1.14.4), `popup.html` / `popup.js` (internal vs store), `background.js`, `gmwarroom-bridge.js`, website legal routes, `client/public/logo.png`.

Internal 1.14.3 is preserved. Store submission uses overlay + copied certified `background.js` / `gmwarroom-bridge.js`.

## Phase 1 — matrix

| ITEM | CURRENT STATE (1.14.3 internal) | STORE RISK | ACTION REQUIRED |
|---|---|---|---|
| Version / package | 1.14.3; no Store icons; name GM War Room | High | Ship 1.14.4 Store overlay. Do not mutate 1.14.3 ZIP. |
| Manifest name | GM War Room — ESPN + FantasyPros | High (single purpose / branding) | Store name: Fantasy Football Rivals — ESPN Connector |
| Description | ESPN + FantasyPros toolkit | High | Connector-only description |
| Icons | None declared | Blocker | 16 / 48 / 128 PNGs |
| Popup | Discover/sync + FantasyPros + admin/historical tools, default league 457622 | High | Store popup: status + Continue on Rivals + ESPN sign-in |
| Background SW | Full connector + FP + Live Draft + hist | Residual code in Store ZIP | Copy unchanged for protocol; do not expose in popup/manifest |
| Content scripts | Rivals bridge + FantasyPros + espn-live | High if packaged | Store: Rivals bridge only |
| Permissions | cookies, tabs, scripting, storage, DNR, DNR host | Over-privileged for Store | Store: cookies + DNR + DNR host access |
| Host permissions | ESPN + FantasyPros + Rivals www/apex | FP hosts not needed for Store | Drop FantasyPros; keep ESPN + Rivals; do not restore localhost / gmwarroom.online / Preview wildcard |
| Website privacy | `/privacy` Production certified `fbd212c` | Store listing destination live | Founder 058D submit |
| Website support | `/support` Production certified; no support email in product | Same | In-product Sign in / Connect / Settings |
| Store listing URL | Does not exist | Cannot invent | Founder after Google issues item |
| Screenshots / promo | Missing | Blocker for complete listing | Promo generated; popup screenshot captured; remaining UI shots founder |

## Phase 2 — popup single-purpose

Internal popup features vs Store purpose (Connect ESPN → Rivals):

| Feature | Classification |
|---|---|
| ESPN session presence | KEEP (Store popup) |
| Continue on Rivals / Sign in to ESPN | KEEP |
| Privacy / Support links | KEEP |
| League discover/sync in popup | REMOVE FROM STORE BUILD (site owns this via GMWR_CONNECT_ESPN) |
| FantasyPros mock controls | MOVE TO INTERNAL/DEV BUILD (internal 1.14.3 popup) |
| Historical import / roster scrape / weekly stats | MOVE TO INTERNAL/DEV BUILD |
| Admin tools / GMWR_IS_ADMIN | MOVE TO INTERNAL/DEV BUILD |
| Hard-coded league 457622 | REMOVE FROM STORE BUILD (still in SW/bridge as residual; not in Store popup) |
| Manual league ID add | REMOVE FROM STORE BUILD |

Store verdict: popup + declared content scripts are single-purpose. Residual SW/bridge handlers remain for protocol identity. Reviewer-visible surfaces do not offer those tools.

## Phase 3 — permissions (Store 1.14.4)

| PERMISSION | WHY REQUIRED | CODE PATH | KEEP/REMOVE |
|---|---|---|---|
| cookies | Read ESPN SWID/espn_s2; read Rivals session for save | `getEspnCookieValues`, `getWarRoomCookieHeaderString`, Store `popup.js` | KEEP |
| declarativeNetRequest | Attach Cookie header on SW fetch (forbidden on fetch directly) | `applyEspnProfileDiscoverCookieRule`, `applySaveCredentialsCookieRule` | KEEP |
| declarativeNetRequestWithHostAccess | Same DNR rules on ESPN + Rivals hosts | DNR session rules | KEEP |
| tabs | FP/Live Draft/hist; CONNECT may read active ESPN tab URL via `chrome.tabs.query` | `getLeagueIdFromActiveEspnTab` (union into discovery) | REMOVE from Store manifest. Query still works with ESPN host_permissions. If smoke shows SW failure, restore. |
| scripting | Historical page scrape / Live Draft inject | hist handlers, espn-live | REMOVE from Store |
| storage | Internal popup league list | internal `popup.js` only | REMOVE from Store |

| HOST | WHY | KEEP/REMOVE |
|---|---|---|
| https://fantasy.espn.com/* | Cookies + ESPN APIs | KEEP |
| https://lm-api-reads.fantasy.espn.com/* | ESPN reads / cookie URLs | KEEP |
| https://www.espn.com/* | Cookies / login | KEEP |
| https://*.espn.com/* | fan.api.espn.com discovery | KEEP (used by `ESPN_FAN_API_BASE`) |
| https://www.fantasyfootballrivals.com/* | Bridge + saveCredentials | KEEP |
| https://fantasyfootballrivals.com/* | Apex origin | KEEP |
| https://draftwizard.fantasypros.com/* | FantasyPros | REMOVE from Store |
| localhost / 127.0.0.1 / gmwarroom.online / *.fantasyfootballrivals.com | Retired | DO NOT RESTORE |

## Branding

Protocol IDs unchanged: `GMWR_CONNECT_ESPN`, `dataset.gmwrExtension = "1"`. User-facing Store strings say Fantasy Football Rivals — ESPN Connector.
