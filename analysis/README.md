# The analysis behind `notes/methods.md`

Self-contained, standard library only. No numpy, scipy or statsmodels. Every
estimator is implemented in `econlib.py` so a reader can check the arithmetic
rather than trust a library call.

## Running it

Nothing to install. Everything the scripts read is already in the repository:
the built data under `docs/data/`, and the two FRED series under `analysis/fred/`.

```bash
git clone https://github.com/eric714/yield-curve-3d
cd yield-curve-3d
python3 analysis/headline.py
```

Any script can be run the same way. They resolve the repository root from their
own location, so the working directory does not matter:

```bash
cd /tmp && python3 ~/yield-curve-3d/analysis/tautology.py   # also fine
```

`dat.load()` and `macro.build_macro()` both take an optional `root=` if you want
to point them at a different checkout.

## What each file does

| File | What it is |
|---|---|
| `econlib.py` | OLS with Newey-West HAC errors, F and chi-square tails via continued-fraction incomplete beta and gamma, ADF, Ljung-Box, Cholesky, PCA by power iteration |
| `dat.py` | Reads `docs/data/` into monthly observations |
| `macro.py` | Adds `UNRATE` and `PAYEMS` from `analysis/fred/` |
| `headline.py` | Regenerates every figure in section 1 of the methods note |
| `tautology.py` | The one-for-one test, overlapping and non-overlapping |
| `clarkwest.py` | Out-of-sample forecasting, nested-model test |
| `equities.py` | The stock market tests |
| `money.py` | Money and inflation, with the pre/post-2020 split |
| `robustness.py` | Cholesky ordering sensitivity and the curve's PCA factors |
| `taylor.py` | Taylor rule in levels, Engle-Granger cointegration, error-correction model |
| `system.py` | Impulse responses, variance decomposition, chair subsamples |
| `forecast.py` | Expanding-window out-of-sample forecasts and Diebold-Mariano |
| `granger.py` | **Superseded.** Plain-F bivariate tests, kept only to show the mistake. Nothing in the methods note comes from it |

## Checking the estimators

`econlib.py` reproduces textbook values: `chi2_p(3.84, 1) = 0.05`,
`f_p(4.0, 1, 100) = 0.048`, and ADF separates white noise from a random walk.

```bash
python3 -c "
import sys; sys.path.insert(0, 'analysis')
from econlib import chi2_p, f_p
print(round(chi2_p(3.84, 1), 4), round(f_p(4.0, 1, 100), 4))"
```

## Regenerating the FRED inputs

`analysis/fred/` is committed, so this is only needed to refresh it:

```bash
python3 -c "
import sys, os; sys.path.insert(0, 'pipeline')
import build_data as B
for sid in ('UNRATE', 'PAYEMS'):
    open(f'analysis/fred/{sid}.csv', 'wb').write(B.fetch(B.fred_url(sid)))"
```
