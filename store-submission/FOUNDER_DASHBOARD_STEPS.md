# Founder Chrome Web Store dashboard steps

Do **not** press **Submit for Review**.  
Do **not** publish.  
Do **not** invent a Store item ID or listing URL.  
Do **not** set `VITE_CONNECTOR_INSTALL_URL`.

Goal of this pass: **COMPLETE STORE DRAFT**, then return the draft state for a final pre-submission comparison.

Official dashboard: https://chrome.google.com/webstore/devconsole  
Docs: `GOOGLE_REQUIREMENTS.md`

---

## A. Account (FOUNDER ACCOUNT ACTION REQUIRED)

1. Sign in with the Google account that will own this listing (check it often; developer email cannot be changed later).
2. Open the Developer Dashboard. If prompted, register as a Chrome Web Store developer.
3. Agree to the developer agreement / policies.
4. Pay the one-time registration fee if this account has not paid it.
5. On Account: set **Publisher name** (example: Fantasy Football Rivals).
6. Verify the contact email.
7. Turn on Google **2-Step Verification** (required before publish/update).
8. Complete **Trader / Non-Trader** declaration. If Trader, Google will ask for legal name, address, and SMS-verified phone — those become public on the listing. Classify honestly; this package does not choose for you.
9. Physical address: required in some cases when the item sells features/subscriptions. This **extension** is free. Rivals website subscriptions are separate. If the dashboard still asks, follow the live UI.

Stop if registration/payment/identity is blocked. That is **FOUNDER ACCOUNT ACTION REQUIRED**, not an engineering defect.

---

## B. Create the item (draft only)

1. Click **Add new item**.
2. Upload this exact file:

`store-submission/package/Fantasy-Football-Rivals-ESPN-Connector-v1.14.4.zip`

3. Confirm SHA256 before upload:

`3A55FFA939E0B3CF0CEF86019C467D9438D96D2351307F02E4271C3EB7A620BF`

4. Do not re-zip the unpacked folder unless you re-hash and get that same SHA.
5. Do not upload `store-submission/package/.chrome-smoke-profile/` or any other extra files.

---

## C. Store Listing tab

Copy/paste from `STORE_LISTING.md`:

- Name (should already match the manifest)
- Detailed description
- Category: Sports (or Productivity)
- Language: English (United States)
- Homepage: https://www.fantasyfootballrivals.com
- Support: https://www.fantasyfootballrivals.com/support

Graphic assets (`store-submission/assets/`):

| Upload | File |
|---|---|
| Store icon 128×128 | `assets/icons/icon128.png` |
| Screenshot 1 | `assets/screenshots/01-connector-popup.png` |
| Screenshot 2 | `assets/screenshots/02-espn-detected.png` |
| Screenshots 3–5 | **FOUNDER CAPTURE REQUIRED** — see `assets/screenshots/README.md`. You may save the draft with 1–2 screenshots (Google minimum is 1). Capture 3–5 before asking to Submit for Review. |
| Small promo 440×280 | `assets/promotional/small-440x280.png` |
| Marquee 1400×560 (optional) | `assets/promotional/marquee-1400x560.png` |
| YouTube | Skip unless the live UI requires it |

---

## D. Privacy tab

- Privacy policy URL: https://www.fantasyfootballrivals.com/privacy
- Single purpose: from `STORE_LISTING.md`
- Permission justifications: from `PERMISSIONS.md`
- Remote code: **No, I am not using remote code.**
- Data-use checkboxes + certifications: from `PRIVACY_DATA_USE.md`

---

## E. Test instructions tab

Paste `REVIEWER_INSTRUCTIONS.md`.  
Do not paste founder passwords. If Google requires shared test accounts, that is **FOUNDER ACTION REQUIRED — REVIEW TEST CREDENTIALS**.

---

## F. Distribution tab

Recommended for the intended public product (set in the draft; still do not submit):

- Visibility: **Public**
- Regions: **All regions** unless founder wants a restriction
- Pricing: **Free**

Do not enable a paid listing for this connector.

---

## G. Save draft — then STOP

1. Save.
2. Confirm the item remains a **draft**.
3. Do **not** click Submit for Review.
4. Do **not** enable publishing / deferred publish yet.
5. Return: screenshot or notes of the draft (item name, whether Google assigned an item ID, remaining red fields). If Google shows a listing URL on a draft, record the exact URL — do not guess it.

After that return, Cursor can do a pre-submission comparison. Only then may founder explicitly approve **Submit for Review**.

After Google issues a **real** listing/publication URL, RFSN-058E can set `VITE_CONNECTOR_INSTALL_URL`. Not before.
