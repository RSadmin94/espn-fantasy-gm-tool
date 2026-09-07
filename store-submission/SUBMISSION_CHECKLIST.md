# RFSN-058D founder submission checklist

Status key (no vague “needs manual work”):

- **READY** — file or paste text exists
- **FOUNDER CAPTURE REQUIRED** — exact capture brief below / in `assets/screenshots/README.md`
- **FOUNDER ACCOUNT ACTION REQUIRED** — founder does this in Google’s UI
- **BLOCKED** — cannot proceed until the named blocker clears
- **STOP** — must not be done in this ticket

| Item | Status |
|---|---|
| Current Google requirements verified (2026-09-03) | READY (`GOOGLE_REQUIREMENTS.md`) |
| Certified ZIP located | READY `package/Fantasy-Football-Rivals-ESPN-Connector-v1.14.4.zip` |
| ZIP SHA256 matches 3A55FFA9…A620BF | READY (`package/SHA256.txt`) |
| ZIP integrity (manifest at root, no secrets/node_modules) | READY |
| Store-facing name | READY Fantasy Football Rivals — ESPN Connector |
| Homepage HTTP 200 | READY https://www.fantasyfootballrivals.com |
| Privacy HTTP 200 | READY https://www.fantasyfootballrivals.com/privacy |
| Support HTTP 200 | READY https://www.fantasyfootballrivals.com/support |
| Listing copy | READY `STORE_LISTING.md` |
| Permission justifications | READY `PERMISSIONS.md` |
| Data-use / privacy questionnaire | READY `PRIVACY_DATA_USE.md` |
| Remote-code declaration | READY No remote code |
| Reviewer instructions | READY `REVIEWER_INSTRUCTIONS.md` |
| Icons 16 / 48 / 128 PNG exact pixels | READY `assets/icons/` |
| Small promo 440×280 opaque | READY `assets/promotional/small-440x280.png` |
| Marquee 1400×560 opaque | READY `assets/promotional/marquee-1400x560.png` |
| Screenshot 1 popup (signed out) 1280×800 | READY `assets/screenshots/01-connector-popup.png` |
| Screenshot 2 ESPN detected 1280×800 | READY `assets/screenshots/02-espn-detected.png` |
| Screenshot 3 league discovery | FOUNDER CAPTURE REQUIRED |
| Screenshot 4 league selection | FOUNDER CAPTURE REQUIRED |
| Screenshot 5 connected dashboard | FOUNDER CAPTURE REQUIRED |
| YouTube promo video | READY to skip unless live dashboard requires it |
| Developer registration + fee | FOUNDER ACCOUNT ACTION REQUIRED |
| 2-Step Verification | FOUNDER ACCOUNT ACTION REQUIRED |
| Trader / Non-Trader declaration | FOUNDER ACCOUNT ACTION REQUIRED |
| Add new item + upload ZIP | FOUNDER ACCOUNT ACTION REQUIRED (draft only) |
| Distribution / visibility / regions | FOUNDER ACCOUNT ACTION REQUIRED (draft: Public / all regions recommended) |
| Review test credentials | FOUNDER ACCOUNT ACTION REQUIRED only if Google demands shared accounts |
| Chrome Web Store listing URL | BLOCKED — does not exist; do not invent |
| Submit for Review | STOP |
| Publish / set `VITE_CONNECTOR_INSTALL_URL` / start 058E | STOP |
| Residual SW handlers (FP/hist/Live Draft) | READY to disclose — INTERNAL ONLY / NON-BLOCKING |
| Secrets in upload ZIP | READY — none |
| `package/.chrome-smoke-profile/` | Do not upload — leftover smoke profile |

## Screenshot 3 — FOUNDER CAPTURE REQUIRED

1. Chrome desktop. Size the window (or crop) so the saved PNG is **exactly 1280×800**. Square corners, no padding.
2. `chrome://extensions` → Developer mode → Load unpacked → `store-submission/package/Fantasy-Football-Rivals-ESPN-Connector-v1.14.4`
3. Open **https://www.fantasyfootballrivals.com** (never localhost, never sprint-8-preview).
4. Sign in to Rivals with a throwaway account.
5. Choose ESPN. Sign in to ESPN if asked. Return to `/connect/espn`.
6. Wait until Rivals shows discovered ESPN leagues (checklist “Searching your leagues” complete, or the chooser list).
7. **Must be visible:** Rivals branding, ESPN connect flow, at least one league row that is safe to publish.
8. **Must NOT be visible:** SWID, espn_s2, Clerk/API tokens, personal email, DevTools, localhost, Preview hostname, debug/admin controls, founder private leagues **457622 / ATLANTAS FINEST**, **480452315 Dynasty**, **158918 Teco’s**. Use a throwaway ESPN league.
9. Save as `store-submission/assets/screenshots/03-league-discovery.png`
10. Store caption: `Discover the ESPN Fantasy Football leagues you can connect`

## Screenshot 4 — FOUNDER CAPTURE REQUIRED

Same setup as screenshot 3.

1. On `/connect/espn`, reach **Which leagues are yours?** with 2+ leagues if possible. If the account has only one league, capture the connect confirmation on that step instead (still 1280×800).
2. Show selection checkboxes / Connect league control. No credentials.
3. Save as `store-submission/assets/screenshots/04-league-selection.png`
4. Store caption: `Choose which ESPN league to connect to Fantasy Football Rivals`

## Screenshot 5 — FOUNDER CAPTURE REQUIRED

1. Complete connect with the throwaway league.
2. Capture the Rivals dashboard after success (URL may include `espnConnected=1`). Show that the product opened — not an error.
3. Hide email/avatar menus if they show a personal address. No DevTools.
4. Save as `store-submission/assets/screenshots/05-connected.png`
5. Store caption: `League connected. Continue in Fantasy Football Rivals`

Google’s minimum is **one** screenshot, so a draft can be saved with 1–2. Capture 3–5 before requesting Submit for Review.
