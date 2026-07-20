# Sleeper player identity lookup

Versioned compact artifact used by `shared/playerIdentity.ts`.

| File | Purpose |
|---|---|
| `sleeperPlayerLookup.compact.json` | Bundled lookup rows (deterministic; no timestamps) |
| `sleeperPlayerLookup.meta.json` | Build metadata (`builtAt`, SHA256, catalog fingerprint) |
| `.sleeperNflCatalog.cache.json` | Local full-catalog cache for deterministic regen (gitignored) |

Rebuild:

```bash
npx tsx scripts/generateSleeperPlayerLookup.mts
# deterministic double-run from cache:
npx tsx scripts/generateSleeperPlayerLookup.mts --use-cache
```

Do **not** fetch the Sleeper players endpoint from the bookmarklet or client runtime.

## Shared resolver vs presentation policy

Both Rivals and the ESPN draft-board mirror call the **same** identity resolver
(`resolvePlayerIdentity` / `resolvePlayerIdentityDefault`). That returns ids,
canonical name, match source, and a candidate headshot URL.

**Headshot display policy is intentional and different per surface:**

| Surface | Policy |
|---|---|
| ESPN board mirror (bookmarklet) | **Sleeper-first** — prefer Sleeper CDN when a sleeper id resolves; fall back to scraped ESPN URL |
| Rivals Player Database | **ESPN-first** — prefer ESPN CDN; fall back to Sleeper on image error; then initials |

Do not “unify” these presentation policies just because identity resolution is shared.
