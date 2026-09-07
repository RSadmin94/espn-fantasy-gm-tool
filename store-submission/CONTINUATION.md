# After Google issues a real Chrome Web Store listing URL

Do **not** start this in RFSN-058D.

This is **RFSN-058E** only after:

- founder saved a Store draft
- founder explicitly approved Submit for Review
- Google issued a **real** listing/publication URL (not guessed)

Then:

1. Record the exact Store URL.
2. Set `VITE_CONNECTOR_INSTALL_URL` to that URL.
3. Preview deploy and certify new-user ESPN install E2E.
4. Founder approves Production promotion.

Until that URL exists: do not set the env var, do not invent an item ID, do not start 058E.
