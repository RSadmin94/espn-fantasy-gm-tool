# Chrome Web Store requirements — verified 2026-09-03

Access date: **2026-09-03**. Official Chrome Developers documentation only. Do not treat older `store-submission/` notes as current if they conflict with these sources.

This file records what Google currently requires. It does **not** change the certified v1.14.4 ZIP.

## Sources

| Topic | URL | Page last updated (as published) |
|---|---|---|
| Developer registration | https://developer.chrome.com/docs/webstore/register | 2024-02-13 |
| Account setup | https://developer.chrome.com/docs/webstore/set-up-account | 2023-10-16 |
| Prepare / ZIP / manifest metadata | https://developer.chrome.com/docs/webstore/prepare | 2023-10-16 |
| Store listing tab | https://developer.chrome.com/docs/webstore/cws-dashboard-listing | 2020-12-07 |
| Images (icon, screenshots, promo) | https://developer.chrome.com/docs/webstore/images | 2018-06-11 |
| Privacy / permissions / remote code / data-use | https://developer.chrome.com/docs/webstore/cws-dashboard-privacy | 2020-06-12 |
| User Data policy FAQ | https://developer.chrome.com/docs/webstore/user_data | (policy FAQ) |
| Distribution / visibility / regions | https://developer.chrome.com/docs/webstore/cws-dashboard-distribution | 2020-12-07 |
| Publish / review / deferred publishing | https://developer.chrome.com/docs/webstore/publish | 2014-02-28 (content still current for deferred publishing) |
| Single purpose | https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines | 2024-07-10 |
| Program policies (2-Step Verification, privacy accuracy) | https://developer.chrome.com/docs/webstore/program-policies/policies | current |
| Trader / Non-Trader (DSA) | https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure | current |
| Trader FAQ | https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq | current |
| Developer Dashboard | https://chrome.google.com/webstore/devconsole | live UI |

Dashboard field labels can differ slightly from docs. If the live UI blocks Save, follow the live UI and record the difference — do not invent values.

## Requirements used for this package

### Developer account

- Register as a Chrome Web Store developer and pay the one-time registration fee before publishing.
- Use an email the founder checks; the developer email cannot be changed later without a new account + item transfer.
- Verify the contact email.
- Enable Google **2-Step Verification** before publishing or updating (program policy).
- Declare Trader or Non-Trader status. If Trader, Google collects legal name / address / phone (public on the listing). Founder must self-classify; this package does not decide that.
- Publisher name is required on the Account page.

### Extension ZIP

- Manifest at the **ZIP root**, not inside a folder.
- `"name"` appears in the Store and in Chrome (manifest name ≤ **75** characters).
- `"description"` ≤ **132** characters.
- `"version"` must increase for each new upload. Certified candidate is **1.14.4**.
- `"icons"` required in the package. Store listing also asks for a **128×128** store icon.
- Max package size 2 GB (this ZIP is ~55 KB).
- After upload, manifest metadata is not edited in the dashboard; a typo requires a new version ZIP.

### Icons

- Package must include a **128×128 PNG**.
- Also ship 16×16 and 48×48 (referenced by this manifest).
- Docs recommend ~96×96 artwork inside 128×128 with transparent padding for square marks. Our certified icons are full-bleed split-R on black; they are recognizable and already in the certified ZIP. Do not regenerate the ZIP to add padding.

### Screenshots

- At least **1**, preferably up to **5**.
- **1280×800** (preferred) or **640×400**.
- Square corners, no padding, full bleed.
- This package uses **1280×800 PNG**.

### Promotional images

- **440×280** small promo tile: **required** (PNG/JPEG, no transparency).
- **1400×560** marquee: **optional** (needed if Google might feature the item).
- Listing-tab copy also lists a YouTube URL among graphic assets; `images.md` says only icon + small promo + one screenshot are mandatory. Treat YouTube as **optional** unless the live dashboard blocks Save without it. Do not invent a video.

### Store listing copy

- Detailed description on the Store Listing tab (start with what the item does; no keyword spam).
- Category.
- Primary language.
- Homepage URL (optional but we supply Production).
- Support URL (optional but we supply Production).
- Privacy policy URL (required because the item handles user data).

### Privacy / permissions / remote code / data-use

- Single-purpose statement.
- Justification for **each declared permission**.
- Remote-code declaration. Manifest V3 must not load remote executable JS.
- Data-use checkboxes + Limited Use certification. Must match the privacy policy and actual behavior.
- HTTPS for user-data transmission.

### Distribution

- Visibility: Public / Unlisted / Private. Intended product: **Public** (founder sets this in the draft; do not Submit).
- Regions: default all regions, or specific countries.
- Paid vs free: this connector is **free**.

### Review / publishing

- Review starts only after **Submit for Review**. This ticket does **not** do that.
- Deferred publishing exists: uncheck auto-publish in the confirmation dialog, or defer later. Founder still must **not** submit in this ticket.
- Staged items expire ~30 days after review if not published.

## This candidate vs those limits

| Field | Value | Limit | Fit |
|---|---|---|---|
| Manifest name | Fantasy Football Rivals — ESPN Connector | 75 | 42 characters |
| Manifest / short description | Securely connect your ESPN Fantasy Football league to Fantasy Football Rivals. | 132 | 78 characters |
| Version | 1.14.4 | — | locked |
| Screenshots ready | 2 × 1280×800 | min 1 / max 5 | Google minimum met; preferred 3–5 still founder capture |
| Small promo | 440×280 opaque PNG | required | READY |
| Marquee | 1400×560 opaque PNG | optional | READY |
| Store icon | 128×128 PNG | required | READY (same file as package icon) |
