# Promotional images

Google (verified 2026-09-03): small **440×280 required** (no transparency); marquee **1400×560 optional**.
https://developer.chrome.com/docs/webstore/images

| File | Size | Status |
|---|---|---|
| `small-440x280.png` | 440×280 RGB (opaque) | READY |
| `marquee-1400x560.png` | 1400×560 RGB (opaque) | READY |

Visual: dark background, split-R mark, “Fantasy Football Rivals” / “ESPN Connector”. No extra product claims.

If founder/design rejects these, rebuild from `client/public/logo.png` + `chrome-extension/store/icons/` using:

| Asset | Dimensions | Filename | Background | Logo | Text | Safe area | Format |
|---|---|---|---|---|---|---|---|
| Small promo | 440×280 | `small-440x280.png` | `#0D0A10` full bleed | Split-R left, not touching edges | “Fantasy Football Rivals” / “ESPN Connector” | Keep type inside ~24px inset | PNG, **no alpha** |
| Marquee | 1400×560 | `marquee-1400x560.png` | same | larger mark left | same two lines | ~48px inset | PNG, **no alpha** |

Do not add Yahoo/CBS, mobile ESPN, or “available on the Chrome Web Store.”
