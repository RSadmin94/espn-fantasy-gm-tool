# Permission declarations — v1.14.4 Store ZIP

Inspected: `store-submission/package/Fantasy-Football-Rivals-ESPN-Connector-v1.14.4/manifest.json` and the packaged `background.js`, `popup.js`, `gmwarroom-bridge.js`.

Chrome Web Store will list **only permissions declared in the manifest**. Justify those. Do not justify `tabs`, `scripting`, or `storage` — they are **not** in this Store manifest.

Paste the short **STORE JUSTIFICATION** into the Privacy tab. The code path is for founder/reviewer evidence.

---

## Declared API permissions

### PERMISSION: `cookies`

**EXACT CODE PATH**

- `popup.js` → `getCookiePresence()` → `chrome.cookies.get({ url, name: "SWID" | "espn_s2" })` on `https://fantasy.espn.com/` and `https://www.espn.com/`
- `background.js` → `getEspnCookieValues()` (lines ~47–60) → same cookie names on `https://fantasy.espn.com/`, `https://www.espn.com/`, `https://lm-api-reads.fantasy.espn.com/`
- `background.js` → `getWarRoomCookieHeaderString()` (lines ~67–71) → `chrome.cookies.getAll` for the Production Rivals origin
- `background.js` → `GMWR_CONNECT_ESPN` handler (line ~3116) uses both helpers before league discovery and `espn.saveCredentials`

**USER-FACING REASON**

The connector needs to know whether you are signed in to ESPN, list the ESPN Fantasy Football leagues that session can access, and save the league you choose to the Rivals account you are already signed into in this browser.

**STORE JUSTIFICATION**

Reads ESPN `SWID` and `espn_s2` cookies already in the browser so the connector can confirm an ESPN Fantasy session and discover leagues the user may connect. Reads Fantasy Football Rivals session cookies so the save request is authorized as the signed-in Rivals user. Cookie values are not shown in the popup.

---

### PERMISSION: `declarativeNetRequest`

**EXACT CODE PATH**

- `background.js` → `applyEspnProfileDiscoverCookieRule()` (~313) / `removeEspnProfileDiscoverCookieRule()` (~333)
- `background.js` → `applySaveCredentialsCookieRule()` (~417) / `removeSaveCredentialsCookieRule()` (~437)
- `background.js` → `applyMeCookieRule()` (~447) (session Cookie header for `/api/trpc/auth.me`; residual admin probe, not Store-popup UI)
- Session rules are added for one request family, then removed in `finally`

**USER-FACING REASON**

Chrome service workers cannot set a `Cookie` header on `fetch`. The connector must send the ESPN session to ESPN’s league-discovery API and the Rivals session to the Rivals save API, or connection cannot complete.

**STORE JUSTIFICATION**

Attaches a Cookie header to the ESPN league-discovery request and the Rivals `espn.saveCredentials` request. Manifest V3 service workers cannot set Cookie on fetch directly. Rules are session-scoped and removed after the request.

---

### PERMISSION: `declarativeNetRequestWithHostAccess`

**EXACT CODE PATH**

Same DNR helpers as above. Required so `modifyHeaders` session rules can run on ESPN and Rivals hosts listed in `host_permissions`.

**USER-FACING REASON**

The Cookie-header rules above only work on the ESPN and Rivals sites this connector is built for.

**STORE JUSTIFICATION**

Required so the Cookie-header rules can apply on ESPN Fantasy hosts and fantasyfootballrivals.com during league discovery and league save. No other sites.

---

## Permissions NOT declared (do not justify in the dashboard)

| Permission | In Store manifest? | Notes |
|---|---|---|
| `tabs` | **NO** | Residual `background.js` still calls `chrome.tabs.*` for connect handoff (`openOrFocusPostConnectTab` ~2542) and unused internal handlers. Chrome allows tab access for URLs covered by host_permissions. Do not add `tabs` unless a Store review failure proves it is required. |
| `scripting` | **NO** | Residual historical / Live Draft injectors in the copied service worker. Not declared. Store popup does not expose them. |
| `storage` | **NO** | Internal 1.14.3 popup used storage. Store popup does not. |

---

## Declared host permissions

### HOST: `https://fantasy.espn.com/*`

**EXACT CODE PATH**

- Cookie reads (`getEspnCookieValues`, popup `getCookiePresence`)
- ESPN Fantasy page/API surface for the user’s existing ESPN session

**USER-FACING REASON**

ESPN stores the fantasy session on fantasy.espn.com. The connector cannot detect ESPN sign-in or talk to ESPN Fantasy without this host.

**STORE JUSTIFICATION**

Read ESPN Fantasy session cookies and use ESPN Fantasy Football APIs/pages required to discover leagues the signed-in ESPN user can connect.

---

### HOST: `https://lm-api-reads.fantasy.espn.com/*`

**EXACT CODE PATH**

- `ESPN_COOKIE_BASE_URLS` in `background.js` (~41–45) includes this host for `SWID` / `espn_s2` lookup

**USER-FACING REASON**

ESPN sometimes stores the same fantasy cookies on this API host. Missing it can false-report “signed out.”

**STORE JUSTIFICATION**

Read ESPN fantasy cookies when they are set on ESPN’s league-manager API host so session detection still works.

---

### HOST: `https://www.espn.com/*`

**EXACT CODE PATH**

- Cookie reads; popup “Sign in to ESPN” opens `https://www.espn.com/login`

**USER-FACING REASON**

Users sign in to ESPN on www.espn.com. Cookies needed for fantasy often live there as well.

**STORE JUSTIFICATION**

Read ESPN session cookies on www.espn.com and open ESPN’s normal sign-in page when the user is signed out.

---

### HOST: `https://*.espn.com/*`

**EXACT CODE PATH**

- `ESPN_FAN_API_BASE = "https://fan.api.espn.com/apis/v2/fans/"` (~30)
- DNR `urlFilter` `https://fan.api.espn.com/apis/v2/fans/*` in `applyEspnProfileDiscoverCookieRule`
- `discoverLeaguesWithEspnCookie()` (~347) fetches that API with the ESPN Cookie header

**USER-FACING REASON**

League discovery uses ESPN’s fan API on fan.api.espn.com, which is not fantasy.espn.com.

**STORE JUSTIFICATION**

Call ESPN’s fan API (`fan.api.espn.com`) to list ESPN Fantasy Football leagues for the signed-in SWID. Wildcard is limited to espn.com.

---

### HOST: `https://www.fantasyfootballrivals.com/*`

**EXACT CODE PATH**

- Content script `gmwarroom-bridge.js` (manifest `content_scripts.matches`)
- `WAR_ROOM_ORIGIN`, `TRPC_SAVE_URL` (`/api/trpc/espn.saveCredentials`), `POST_CONNECT_URL`
- `resolveWarRoomOrigin()` allows only Production www/apex HTTPS
- `postSaveCredentials()` POST with DNR Cookie rule
- Popup “Continue on Fantasy Football Rivals” → `/connect/espn`

**USER-FACING REASON**

The product lives on Rivals. The bridge tells the site the connector is installed; the save API attaches the chosen ESPN league to the signed-in Rivals account.

**STORE JUSTIFICATION**

Inject the connector bridge on Production Rivals, authorize the signed-in Rivals session, and POST the selected ESPN league to the existing `espn.saveCredentials` API over HTTPS.

---

### HOST: `https://fantasyfootballrivals.com/*`

**EXACT CODE PATH**

Same as www, for the apex hostname (`resolveWarRoomOrigin` host check).

**USER-FACING REASON**

Some users land on the apex domain instead of www.

**STORE JUSTIFICATION**

Same Production Rivals bridge and save behavior on the apex hostname.

---

## Hosts not declared (do not restore)

- localhost / 127.0.0.1
- gmwarroom.online
- `*.fantasyfootballrivals.com` Preview wildcard (including sprint-8-preview)
- draftwizard.fantasypros.com

## Residual service-worker code (disclose; do not change v1.14.4)

The packaged `background.js` is the certified protocol worker. It still contains unused FantasyPros / historical / Live Draft / admin message handlers. Those handlers are **not** in the Store popup or Store manifest. Classification: **INTERNAL ONLY / NON-BLOCKING**. If Google rejects residual code, recommended v1.14.5 scope is a Store-only worker that keeps `GMWR_CONNECT_ESPN` and drops unused handlers. Do not mutate 1.14.4 in this ticket.
