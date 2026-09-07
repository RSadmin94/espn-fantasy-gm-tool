# Store listing copy — ready to paste

Do **not** submit. Chrome Web Store listing URL does **not** exist. Do not invent one.

Verified 2026-09-03: homepage, privacy, and support all HTTP 200 (anonymous).

---

## STORE NAME

```
Fantasy Football Rivals — ESPN Connector
```

(42 characters; manifest name, use the same string in the listing.)

## SHORT DESCRIPTION

```
Securely connect your ESPN Fantasy Football league to Fantasy Football Rivals.
```

(78 characters; this is also the manifest `"description"`, max 132.)

## DETAILED DESCRIPTION

```
Fantasy Football Rivals — ESPN Connector has one purpose: connect the ESPN Fantasy Football league you already play to your Fantasy Football Rivals account.

How to use it:

1. Sign in to Fantasy Football Rivals.
2. Choose ESPN.
3. Install this connector if Rivals asks you to.
4. Sign in to ESPN in Chrome if you are signed out.
5. Return to Rivals. The connector detects your ESPN session and the leagues you can access.
6. If you have one league, Rivals connects it. If you have several, you choose which to connect.
7. Choose your team only when Rivals still needs that step.

Complete the connection on the Fantasy Football Rivals website. This extension is not a generic fantasy toolkit, not a draft overlay, and not a FantasyPros product. It does not connect Yahoo or CBS leagues.

Privacy: https://www.fantasyfootballrivals.com/privacy
Support: https://www.fantasyfootballrivals.com/support
```

## SINGLE-PURPOSE STATEMENT

```
Connect a user's ESPN Fantasy Football league to Fantasy Football Rivals.
```

## HOMEPAGE URL

```
https://www.fantasyfootballrivals.com
```

## PRIVACY POLICY URL

```
https://www.fantasyfootballrivals.com/privacy
```

## SUPPORT URL

```
https://www.fantasyfootballrivals.com/support
```

## OFFICIAL / VERIFIED PUBLISHER URL

Only if Search Console verification is already done for fantasyfootballrivals.com. Otherwise leave unset. Do not invent verification.

## CATEGORY

**Sports**  
If Sports is not offered for extensions in the live dashboard, use **Productivity**.

## PRIMARY LANGUAGE

**English (United States)**

## PERMISSION JUSTIFICATIONS

Paste from `PERMISSIONS.md` (short STORE JUSTIFICATION for each of: `cookies`, `declarativeNetRequest`, `declarativeNetRequestWithHostAccess`, plus each host).

## DATA-USE DISCLOSURE ANSWERS

Paste from `PRIVACY_DATA_USE.md`. Minimum spoken summary if a free-text box exists:

```
This extension reads ESPN authentication cookies (SWID and espn_s2) and league identifiers (league ID and, when available, league name) when you connect a league. It sends that information to Fantasy Football Rivals over HTTPS so the league can be linked to your signed-in Rivals account. It also reads Rivals session cookies to authorize that save. It does not sell this data. See https://www.fantasyfootballrivals.com/privacy
```

## REMOTE CODE DECLARATION

```
No, I am not using remote code.
```

## REVIEWER TEST INSTRUCTIONS

Paste `REVIEWER_INSTRUCTIONS.md`.

## CHROME WEB STORE LISTING URL

Does not exist. Do not invent. Do not set `VITE_CONNECTOR_INSTALL_URL`.

## Claims this listing must not make

- Automatic mobile ESPN connection
- Yahoo or CBS support via this extension
- Chrome Web Store installation already available
- Features not in this connector (FantasyPros, live draft overlay, admin tools)
