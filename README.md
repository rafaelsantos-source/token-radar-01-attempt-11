# Ensemble Radar

A token launch radar for make.fun's `token-radar-01` bounty: pre-token
protocols ranked by what a launch would be worth, with a farm plan for each
one — scored by a multi-signal ensemble, not a single formula.

## The model

Implied value is the geometric blend of three sub-models, all computed from
the snapshot's own figures at run time. No protocol name is special-cased:
one function scores every row.

```
M1 comps     = tvl_usd x categoryMedianMultiple
               The market's own multiple: median mcap/TVL of live-token
               protocols in the same category (global median 0.2138x when
               a category has fewer than 3 live comps).
M2 growth    = tvl_usd x globalMedianMultiple x growthAdj
               growthAdj rewards 7-day TVL growth in full, penalises
               decline at half rate, clamped to [-40%, +80%].
M3 composite = tvl_usd x globalMedianMultiple
                 x seasoning x reach x momentum x stability
               seasoning: a hump over age with no token (peaks near 900
               days, fades for the very old and the very young);
               reach: log chain breadth; momentum: tanh-scaled 7d change;
               stability: a penalty for extreme |7d change|.

implied = exp(0.45 ln M1 + 0.25 ln M2 + 0.30 ln M3)
confidence = agreement of the three sub-models in log space
```

The board covers all 40 watchlist protocols plus 138 rankable pre-token
protocols below the watchlist floor (178 rows), and sets the 24 largest
live-token protocols aside with their market caps shown. Early rows are held
to the watchlist's own exclusion rule: no exchange, no bridge or staking
wrapper, no versioned pool, no wrapped/staked name. Each row carries a
six-step farm plan with costs and times, tuned to the protocol's category,
chains, TVL, age and momentum. The dashboard's model lab lets a reader
re-weight the ensemble live and watch the board re-rank from the same
sub-model values.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot,
writes `board.json` and `data.js`, copies `dashboard/` and `screenshots/`
to the output, and writes `dossier.json` with the vendored make.fun
library. Open `out/dashboard/index.html` in a browser; the page renders
with no network.

## What it is not

Implied value is this entry's own claim, never a promise of a launch or a
price. The board says a protocol *records* no token, never that it *has*
none: a protocol on the list may still have a token its DefiLlama record
does not carry.
