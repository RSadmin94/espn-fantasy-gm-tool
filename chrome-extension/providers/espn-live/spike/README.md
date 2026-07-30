# RFSN-031A spike — temporary

Auto-inject packaging for the **existing** Draft Board Monitor IIFE.

- `espn-reader.iife.js` — built from `standalone/draft-board-monitor` (do not edit adapters here)
- Rebuild: `node standalone/draft-board-monitor/scripts/build.mjs` then re-copy wrapper+IIFE into this folder
- Disable: `RFSN_031A_SPIKE_ENABLED = false` in `../content.js`

See `docs/validation/RFSN-031A_AUTO_INJECT_SPIKE.md`.
