# Rivalry tradeVerdictLosses delta — league 457622

**Date:** 2026-06-26
**Commit:** authority swap (`fix(rivalry): use completed trade authority for tradeVerdictLosses`)
**Focal owner:** Rod Sellers (`id:{6042EE3C-4B54-42BE-A2A7-52E939D2C706}`)
**Seasons scanned:** 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026
**Completed trades loaded:** 3

## Summary

- Rivalry pairs (heat list): **11**
- Rivals with trade-loss count change: **0**
- Max heat score delta: **0** pts
- New rival created solely by trade change: **0**
- Rival disappeared solely by trade change: **0** (trade losses do not gate rivalry inclusion)

## Full comparison

| Rival | Old tradeVerdictLosses | New tradeVerdictLosses | Heat Before | Heat After | Reason |
| ----- | ---------------------: | ---------------------: | ----------: | ---------: | ------ |
| Marlon Moore | 0 | 0 | 184 | 184 | No completed trade losses |
| LOZELL STYLES | 0 | 0 | 181 | 181 | No completed trade losses |
| Bruce Edwards | 0 | 0 | 168 | 168 | No completed trade losses |
| Demetri Clark | 0 | 0 | 142 | 142 | No completed trade losses |
| Mark Deroux | 0 | 0 | 135 | 135 | No completed trade losses |
| Jan Graham | 0 | 0 | 122 | 122 | No completed trade losses |
| Steffon Bizzell | 0 | 0 | 107 | 107 | No completed trade losses |
| Randy Broner Jr | 0 | 0 | 100 | 100 | No completed trade losses |
| Nate West | 0 | 0 | 95 | 95 | No completed trade losses |
| Christian Graham | 0 | 0 | 94 | 94 | No completed trade losses |
| Sheldon deRoux | 0 | 0 | 54 | 54 | No completed trade losses |

## Changed rows only

| Rival | Old | New | Δ Heat | Reason |
| ----- | --: | --: | -----: | ------ |

## Completed trades (focal context)

| Trade | Side A | Side B | Winner | Focal lost? |
| ----- | ------ | ------ | ------ | ----------- |
| `activity…` | Rod Sellers | Sheldon deRoux | Rod Sellers | no |
| `f273e8dd…` | Rod Sellers | Sheldon deRoux | Rod Sellers | no |
| `activity…` | Randy Broner Jr | Bruce Edwards | Bruce Edwards | n/a |

## Validation checks

- Every heat delta equals `(newTvl - oldTvl) × 10`: **pass**
- No unexplained heat spikes (>30 pts from trades alone): **pass**
- Player-count proxy removed from `rivalryService` Pass 2: **pass**

### Interpretation

- Focal completed trades: 2. Pick-only legs yield 0 on the legacy player-count proxy; authority assigns losses only when focal lost by value verdict.