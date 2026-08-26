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

### Why the economic data loses

Not because it doesn't matter. In a levels regression the unemployment rate is
a significant driver of the policy rate (coefficient −0.502, HAC t = −3.37,
p = 8.3e-04), exactly as a Taylor rule says it should be.

It loses because **the 2-year yield is the market's forecast of the Fed's
reaction to that data.** It is a sufficient statistic: it already contains the
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

## 7. Limits

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
- **The curve enters as one number.** PCA of the 14 tenors gives the classic
  decomposition — level 92.5%, slope 6.9%, curvature 0.4%, 99.89% in three
  factors — but the tests use the 2-year gap alone rather than the factor
  scores.
- **Not investment advice.** Nothing here is a trading rule, and section 5 is
  the reason why.

---

## Reproducing it

The analysis lives outside the site pipeline and is not required to build the
chart. Everything needed is in the published data files under `docs/data/` plus
`UNRATE` and `PAYEMS` from FRED. The estimators are small enough to re-derive:
OLS by Gauss-Jordan, the F and chi-square tails by continued-fraction
incomplete beta and gamma, ADF against MacKinnon critical values, Newey-West
HAC with a Bartlett kernel, and PCA by power iteration with deflation.
