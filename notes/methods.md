# Methods: what the data supports, and what it does not

Everything on the site is descriptive — it shows what the curve did. This note
covers a separate question that kept coming up: **does the curve actually
predict anything?**

Short version: it predicts Fed policy, robustly. It does not predict the stock
market at all. Money growth leads inflation at roughly a one-year horizon. And
the honest limit is that a statistically certain relationship still has only
marginal out-of-sample forecasting value.

Computed 26 August 2026 against the shipped data (9,169 trading days,
1990-01-02 to 2026-08-26). All tests are pure Python; there is no numpy or
statsmodels in this repo, so OLS, the F and chi-square distributions, ADF,
Ljung-Box, Newey-West and PCA are implemented directly.

---

## 1. The headline result

**The slope of the curve Granger-causes Fed policy, and nothing else does.**

The signal is the 2-year yield minus the policy rate. The test asks whether
its lags improve a forecast of the change in the policy rate beyond what
policy's own momentum already tells you.

Conditional Granger test, monthly, HAC-robust, controlling for equity returns,
VIX, CPI, M2, the unemployment rate and payroll growth:

| Predictor → policy | chi2 | p |
|---|---|---|
| **2yr − policy gap** | **92.0** | **6.7e-16** |
| Payroll growth | 14.8 | 0.097 |
| CPI | 13.5 | 0.14 |
| S&P returns | 12.9 | 0.17 |
| Unemployment | 11.7 | 0.23 |
| VIX | 9.2 | 0.42 |

Forecast error variance decomposition of the policy rate:

| Horizon | Policy's own momentum | **Curve** | All macro | Equities + VIX |
|---|---|---|---|---|
| 1 month | 97.3% | 0.0% | 2.8% | 0.0% |
| 6 months | 65.3% | **26.4%** | 4.3% | 3.9% |
| 12 months | 60.8% | **29.3%** | 5.3% | 4.5% |
| 24 months | 59.6% | **29.4%** | 6.1% | 4.8% |

**The curve accounts for about 29% of where policy goes. Every economic
indicator combined accounts for about 5%.** A one-standard-deviation shock to
the gap moves the policy rate 0.42pp cumulatively over eighteen months, peaking
in month two.

Orthogonalized decompositions depend on the Cholesky ordering, so that figure
was re-run under six defensible orderings, including one that puts the curve
last and is maximally unfavorable to it. **At twelve months it ranges 27.4% to
29.4%** — a spread of two points. The claim does not rest on the ordering.

### It survives everything I threw at it

- **Conditioning.** Six-variable and eight-variable systems; adding the term
  premium and the 10-year breakeven (2003+) changes nothing, and neither of
  those predicts policy themselves (p = 0.12 and 0.83).
- **The zero lower bound.** Excluding the 108 months when policy was pinned,
  the relationship gets *stronger*: chi2 96.0 versus 81.4.
- **Every Fed chair.** Greenspan p=1.5e-06, Bernanke p=8.7e-05, Yellen
  p=3.7e-03, Powell p=1.4e-06. Four regimes, forward guidance, QE and ZIRP.
- **A Taylor rule.** In an error-correction model that gives the Taylor terms
  their best shot, the curve still adds R² +0.170 (p = 5.5e-09) while the
  error-correction term itself is insignificant.

### It is the whole shape, not just the slope

Every test above enters the curve as one number, the 2-year gap. Replacing it
with the level, slope and curvature factors from a PCA of all fourteen tenors —
92.5%, 6.9% and 0.4% of curve variation, 99.89% between them — sharpens the
result rather than diluting it:

| Factor → policy | chi2 (p=6) | p |
|---|---|---|
| **Level** | 83.0 | 8.9e-16 |
| **Slope** | 62.0 | 1.7e-11 |
| Curvature | 11.5 | 0.075 |
| Every macro variable | 4.3 – 11.0 | 0.09 – 0.63 |

So it is not only the slope people talk about: **the level of the curve carries
more information about the Fed's next move than the slope does**, which makes
sense once you remember the level already embeds the expected path. Curvature
adds nothing. And the macro variables explain nothing even when the curve is
split into three factors instead of compressed into one.

### Why the economic data loses

Not because it doesn't matter. In a levels regression the unemployment rate is
a significant driver of the policy rate (coefficient −0.502, HAC t = −3.37,
p = 8.3e-04), exactly as a Taylor rule says it should be.

That regression explains only 25.7% of the policy rate, though, and
Engle-Granger finds no cointegration (ADF on the residuals −2.98 against a
−3.74 critical value), so the level relationship is weaker than a canonical
Taylor rule — unsurprising given this uses CPI rather than core PCE, no output
gap and no time-varying neutral rate. In an error-correction model built on it,
the error-correction term is insignificant (t = −1.09) while the curve still
adds R² +0.170 (p = 5.5e-09).

The curve loses nothing to the economics. It loses because **the 2-year yield
is the market's forecast of the Fed's reaction to that data.** It is a sufficient statistic: it already contains the
macro inputs, plus the market's forecast of them, plus everything else priced
in. That is what an efficient market should produce, and it is a better finding
than "the economy doesn't matter."

---

## 2. Equities: nothing

| | |
|---|---|
| Correlation, 2s10s slope vs S&P forward 12m return | **r = −0.097** |
| Share of variation explained | **0.9%** |
| S&P 12m return after inversion onset (mean of 6) | **+9.3%** |
| Unconditional 12m baseline | **+10.3%** |

Buying after an inversion did *worse* than average at twelve months. In the
conditioned system nothing predicts equity returns and equity returns predict
nothing — every cell in that row and column sits above p = 0.06.

The un-inversion looks sharper (2 of 3 preceded severe declines) but n = 3, and
the third went the other way hard. Not a finding.

---

## 3. Money and inflation

Testing Friedman's claim. In a parsimonious system with HAC errors:

| Lags | dM2 → dCPI | dCPI → dM2 |
|---|---|---|
| 6 months | 2.4e-03 | 1.1e-02 |
| **12 months** | **3.8e-06** | 3.6e-02 |

At a twelve-month horizon money growth leads inflation about four orders of
magnitude more strongly than the reverse. At a one-month horizon it shows
nothing at all — the first test I ran was simply at the wrong horizon, which
is the single easiest way to get this question wrong.

Results at 18 and 24 lags are discarded: chi2 climbing 20 → 47 → 179 → 263 as
restrictions multiply is the Kiefer-Vogelsang over-rejection signature of HAC
Wald tests, not a strengthening signal.

---

## 4. Two recession indicators, both of which broke

The site marks both. They fail in opposite ways.

| | Curve inversion | Sahm rule |
|---|---|---|
| Timing | **Leads** by 13–23 months | **Coincident** — fires 1–7 months *into* recession |
| False positives | Frequent | Rare |
| Record | 568 of 1,052 inverted days had no recession within 2 years | 9 of 11 triggers landed inside a recession |
| This cycle | Inverted 543 days, the longest ever — no recession | Triggered July 2024 — no recession |

Two of the four recessions in this record were preceded by a long inversion:
227 inverted days before 2001, 238 before 2008. The other two were not, in any
useful sense — 16 days before 1990 (the record opens in January 1990 and misses
most of the 1989 inversion) and 3 days before 2020.

The Sahm rule has **never once led** a recession. It was designed as a
real-time trigger for automatic stimulus, not a forecast, and it is routinely
misused as one.

---

## 5. Where it stops working

This is the part that matters most.

**Out-of-sample, the curve's forecast advantage is not statistically
significant.** Expanding-window, one-step-ahead, zero-bound months excluded:

| Model | RMSE | OOS R² |
|---|---|---|
| AR only | 0.1960 | 0.197 |
| **AR + curve** | **0.1775** | **0.341** |
| AR + macro | 0.1950 | 0.205 |
| AR + macro + curve | 0.1747 | 0.362 |

A 73% improvement in R². But Diebold-Mariano gives **p = 0.080** against the AR
benchmark and **p = 0.057** against AR+macro. Across five specifications the
DM p-value ranged 0.057 to 0.14 and never crossed 0.05. With 111 forecasts of
a lumpy, discretized target, the test cannot certify it.

**Direction yes, magnitude no.** The model gets the sign of a policy move right
92% of the time on cuts and 98% on hikes, but within-episode R² is negative
both ways. There is no meaningful cut-versus-hike asymmetry: that gap is 4
misses against 1 on n ≈ 50.

**Multiple testing.** Benjamini-Hochberg at q = 0.05 across the 24 headline
tests: **12 survive.** Every curve → policy test survives. Both Diebold-Mariano
tests do not. That is the boundary of the whole exercise.

---

## 6. Corrections made along the way

Recorded because the process is part of the evidence.

1. **Overlapping windows.** The first version regressed daily observations on
   12-month forward outcomes and reported n = 4,500 as a strength. Consecutive
   observations shared almost all their outcome period; effective independent
   observations were about 18. Redone at month-end: 439 non-overlapping.
2. **Naive F tests.** Ljung-Box showed heavily autocorrelated residuals at the
   BIC-selected lag order, invalidating the F statistics. Redone with
   Newey-West and a lag order the residual test accepts (p = 9–12, where
   Ljung-Box p rises to 0.997). The naive tests overstated significance by
   about nine orders of magnitude. **BIC chose p = 1; the residual diagnostic
   overruled it.**
3. **Bidirectionality.** A bivariate test suggested policy causes the curve
   more strongly than the reverse. Conditioning on the rest of the system
   removed it entirely (p = 0.53); the bivariate result was part mechanical —
   the gap is *defined* as 2yr minus policy — and part common macro factors.
4. **Wrong horizon.** The money → inflation null at one month was not evidence
   against Friedman. At twelve months the relationship is strong.
5. **Numerical breakdown.** Long-lag tests in the full system put 145
   regressors on 415 observations. Those results were discarded, not reported.

---

## 7. A caveat that no correction fixes

The specifications here were chosen **adaptively, while looking at results**.
Lag orders came from residual diagnostics, samples were cut at the zero bound,
systems were made parsimonious when they overfit. Each of those choices is
defensible on its own and each was made after seeing an earlier answer.

Benjamini-Hochberg corrects for the number of tests reported. It does not
correct for a search over specifications, and nothing computed after the fact
can. The honest protections are that the main result survives every
specification tried rather than one, that it agrees with a large existing
literature, and that the out-of-sample test — the one check specification
search cannot flatter — came back **positive but not significant**. Read that
marginal out-of-sample result as the price of the search, and treat it as the
more informative number of the two.

## 8. Limits

- **Granger causality is predictive precedence, not causation.** Both the curve
  and the Fed respond to incoming information. Neither causes the other in any
  structural sense.
- **Revised data, not real-time vintages.** Every macro series here is the
  current vintage. Yields are prices and are never revised; unemployment,
  payrolls and CPI are. So the macro variables were given information no
  forecaster actually had, and still lost. This biases *against* the
  conclusion, which makes it safer, but it should be said. The same caveat
  applies to the Sahm trigger dates the site displays.
- **Linear, monthly, single-frequency.** No regime-switching, no threshold
  effects, no daily or intra-meeting identification. An FOMC-date event study
  would identify this far more cleanly.
- **Linearity.** Every relationship here is modeled linearly. Threshold or
  regime-switching behavior would not be detected.
- **Not investment advice.** Nothing here is a trading rule, and section 5 is
  the reason why.

---

## Reproducing it

**The code is in [`analysis/`](../analysis/).** Standard library only — no
numpy, scipy or statsmodels — so every estimator can be read rather than
trusted: OLS by Gauss-Jordan, the F and chi-square tails by continued-fraction
incomplete beta and gamma, ADF against MacKinnon critical values, Newey-West
HAC with a Bartlett kernel, Cholesky for the decompositions, and PCA by power
iteration with deflation. `econlib.py` reproduces textbook values on the
distributions it implements.

Run any of them from the repository root, e.g. `python3 analysis/system.py`.
The analysis is not part of the site build and the chart does not depend on it.

### Still undone

- **A bootstrap** for the HAC Wald tests, which would settle the long-lag
  results that were discarded as over-rejection rather than reported.
- **Real-time vintages.** Every macro series here is the current one. ALFRED
  has vintages; assembling 36 years of them across several series is a project
  rather than a check, and until it is done any forecasting claim is softer
  than it looks.
- **Other countries.** Everything is the United States after 1990: one central
  bank, one regime family. Whether this is a fact about yield curves or a fact
  about the Fed is not answerable from this dataset. Japan, with decades at the
  zero bound, is the obvious test.
