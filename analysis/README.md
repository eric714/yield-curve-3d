# The analysis behind `notes/methods.md`

Self-contained, standard library only — no numpy, scipy or statsmodels. Every
estimator is implemented in `econlib.py` so a reader can check the arithmetic
rather than trust a library call.

| File | What it is |
|---|---|
| `econlib.py` | OLS with Newey-West HAC errors, F and chi-square tails via continued-fraction incomplete beta/gamma, ADF, Ljung-Box, Cholesky, PCA by power iteration |
| `dat.py` | Reads `docs/data/` into monthly observations |
| `macro.py` | Adds `UNRATE` and `PAYEMS` (fetch these to `analysis/fred/` first) |
| `granger.py` | Bivariate Granger tests |
| `taylor.py` | Taylor rule in levels, Engle-Granger cointegration, error-correction model |
| `system.py` | The VAR: conditional Granger, impulse responses, variance decomposition, ordering sensitivity, PCA factors |
| `forecast.py` | Expanding-window out-of-sample forecasts and Diebold-Mariano |

Run from the repository root, e.g. `python3 analysis/system.py`.

`econlib.py` is validated against textbook values on import of the test block:
`chi2_p(3.84, 1) = 0.05`, `f_p(4.0, 1, 100) = 0.048`, and ADF correctly
separates white noise from a random walk.
