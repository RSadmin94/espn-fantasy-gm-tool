# Privacy / data-use declarations — v1.14.4

Base: packaged Store source + live Privacy Policy  
https://www.fantasyfootballrivals.com/privacy  
(HTTP 200, anonymous, Production certified RFSN-058C).

Do not invent retention days. Do not call service-provider processing a “sale.” Do not mark data uncollected merely because it is used only for connection.

Dashboard checkbox labels vary. Map the facts below onto whatever categories Google shows. If a category is not listed, do not check it.

---

## Single purpose (Privacy tab)

Connect a user's ESPN Fantasy Football league to Fantasy Football Rivals.

---

## Remote code

**Select:** No, I am not using remote code.

All JavaScript ships inside the ZIP (`popup.js`, `background.js`, `gmwarroom-bridge.js`). The extension fetches JSON from ESPN and Rivals over HTTPS. That is data, not executable remote JavaScript. Manifest V3 must not load remote scripts.

---

## What the connector actually does with data

### ESPN `SWID`

| | |
|---|---|
| ACCESSED | YES — `chrome.cookies.get` name `SWID` |
| TRANSMITTED | YES — included in `espn.saveCredentials` POST body; also used in ESPN fan-API URL path for discovery |
| STORED (extension) | NO — not written to `chrome.storage` |
| STORED (Rivals servers) | YES — privacy policy: connection credentials stored encrypted at rest with the league connection |
| PURPOSE | Identify the ESPN fantasy account; discover leagues; attach the chosen league to the Rivals user |
| DESTINATION | ESPN (`fan.api.espn.com` discovery) and Fantasy Football Rivals (`/api/trpc/espn.saveCredentials`) over HTTPS |
| USER BENEFIT | Connect the ESPN league they already play without typing cookie values |

### ESPN `espn_s2`

| | |
|---|---|
| ACCESSED | YES — `chrome.cookies.get` name `espn_s2` |
| TRANSMITTED | YES — save POST body; Cookie header on ESPN discovery via DNR |
| STORED (extension) | NO |
| STORED (Rivals servers) | YES — encrypted at rest while the league stays connected |
| PURPOSE | ESPN fantasy session credential required to list and later sync leagues |
| DESTINATION | ESPN (Cookie header on discovery) and Rivals (save API) over HTTPS |
| USER BENEFIT | Same as SWID — ESPN will not list private leagues without this session |

### `leagueId`

| | |
|---|---|
| ACCESSED | YES — ESPN fan API and/or user selection; optional union from an open ESPN Fantasy tab URL |
| TRANSMITTED | YES — save POST |
| STORED (extension) | NO |
| STORED (Rivals servers) | YES — connected-league record |
| PURPOSE | Identify which ESPN league to attach |
| DESTINATION | Rivals save API over HTTPS |
| USER BENEFIT | The correct league is linked |

### `leagueName` (optional)

| | |
|---|---|
| ACCESSED | YES — when ESPN returns a name |
| TRANSMITTED | YES — when present, included on save |
| STORED (extension) | NO |
| STORED (Rivals servers) | YES — display name on the connection |
| PURPOSE | Show a human-readable league name in Rivals |
| DESTINATION | Rivals save API over HTTPS |
| USER BENEFIT | Recognize the connected league in the product |

### Rivals authentication / session cookies

| | |
|---|---|
| ACCESSED | YES — `chrome.cookies.getAll` on Production Rivals origin |
| TRANSMITTED | YES — Cookie header on `espn.saveCredentials` (DNR); not pasted into Store UI |
| STORED (extension) | NO |
| STORED (Rivals servers) | Session already belongs to Rivals; Clerk/account records are website auth, not created by the extension |
| PURPOSE | Ensure the save is performed as the signed-in Rivals user |
| DESTINATION | `https://www.fantasyfootballrivals.com` / apex `/api/trpc/espn.saveCredentials` |
| USER BENEFIT | League is connected to the account they signed into, not a stranger’s |

### Website account email / Google login / payments

The **extension** does not read Gmail, Google account email, Stripe, or Clerk secrets from storage.

The **website** (separate product surface) uses Clerk (including Google sign-in) and may use Stripe for subscriptions. Disclose website account practices in the privacy policy; do not claim the extension collects email.

---

## Chrome Web Store data-use checkboxes (map)

Answer **YES collected** only for data this extension handles:

| Likely CWS category | Answer | Why |
|---|---|---|
| Personally identifiable information | **YES** | ESPN SWID is an account identifier. League name can identify a group/person. |
| Health | **NO** | |
| Financial and payment information | **NO** (extension). Website Stripe is not this item. |
| Authentication information | **YES** | ESPN `SWID` / `espn_s2`; Rivals session cookies |
| Personal communications | **NO** | |
| Location | **NO** | |
| Web history | **NO** as general browsing history. **Limited URL use:** connect may read the active ESPN Fantasy tab URL to include that `leagueId` if ESPN’s list omitted it. That is not a browsing-history product. If the dashboard only has a single “Web history” box and no narrower control, check it and justify: “Reads the active ESPN Fantasy Football tab URL only to discover a league the user is viewing.” Prefer not checking a generic web-history box if a more specific “Website content” / authentication box covers cookies + ESPN API. |
| User activity | **YES** if the form treats “used the connect action / which league was chosen” as activity. Purpose: complete the connection the user requested. |
| Website content | **YES** | ESPN league-discovery API JSON (league id/name). |

If Google’s form uses different labels, keep the same facts: authentication cookies, league identifiers, optional league name, Rivals session.

---

## Certifications (Limited Use)

Founder should certify, consistent with the live privacy policy:

- Data is used only to provide the single purpose (connect ESPN → Rivals) and operate the Rivals product features that connection enables.
- Data is not sold.
- Data is not used for advertising / retargeting via this connector.
- Service providers (hosting, Clerk, Stripe on the website, optional AI on the website) process data to run the product — that is **not** a sale.
- Transmissions use HTTPS.
- Humans do not read ESPN cookies for marketing. Support access, if any, is only with user involvement or as described in the policy (disconnect in Settings).

Do **not** claim the extension never accesses cookies. The privacy policy explicitly says it does.

---

## Sharing / sale

| | |
|---|---|
| Sold | **NO** — privacy policy: “We do not sell your ESPN session cookies.” |
| Shared with ESPN | ESPN already holds the session; the connector sends Cookie to ESPN APIs the user is already using |
| Shared with Rivals | YES — that is the product |
| Shared with 365globalsolutions.com / gmwarroom.online / Chrome Web Store | **NO** |
| Sold to advertisers | **NO** |

---

## Retention (do not invent numbers)

- ESPN cookies remain in the browser under ESPN’s control until they expire or the user signs out of ESPN.
- Rivals stores connection credentials encrypted while the league stays connected.
- Disconnect in Settings removes that connection from the account.
- The privacy policy does **not** publish a fixed calendar deletion period. Do not type a number into the Store form that the policy does not state.

---

## Privacy alignment check

| Claim | Privacy policy | Store declaration | Extension |
|---|---|---|---|
| Single purpose ESPN → Rivals | Yes | Yes | Store popup + manifest yes |
| Reads SWID + espn_s2 | Yes | Yes | Yes |
| Reads leagueId + optional leagueName | Yes | Yes | Yes |
| Reads Rivals session cookies | Yes | Yes | Yes |
| HTTPS to fantasyfootballrivals.com | Yes | Yes | Yes |
| Not a sale | Yes | Yes | n/a |
| Encrypted at rest on Rivals | Yes | Disclose as server storage, not extension storage | Extension does not persist |
| No fake Store URL / no 365globalsolutions | Yes | Yes | Hosts are Production Rivals only |

**PRIVACY ALIGNMENT: PASS** (facts match; no retention number invented).
