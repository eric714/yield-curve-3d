# What this chart can and cannot tell you

The site shows what US Treasury yields did. That part is just a record: every
trading day since 1990, checked against the Treasury's own files.

This note is about a different question, which people ask immediately and which
deserves a real answer rather than a shrug: **does any of it predict
anything?**

The short version:

- **It tells you what the bond market expects the Fed to do next, and the
  market is good at that.** This is the one genuine forecast in the chart.
- **It tells you nothing useful about the stock market.** Not a weak signal.
  No signal at all.
- **It shows you what lending actually earned after inflation**, which is a
  number most people never see and which changes how the last five years look.
- **It is a poor recession alarm**, and so is the other famous one.

Everything below is computed from the shipped data by the scripts in
[`analysis/`](../analysis/). Figures are current as of 27 August 2026: 9,169
trading days of yields, and 437 monthly observations where the statistics are
run.

---

## What you can actually use it for

### 1. Read what the market thinks the Fed will do

This is the most useful thing on the chart and it takes ten seconds.

Turn on **Fed funds target** and compare it to the front of the curve, or
switch **Height of the surface** to *Yield minus Fed funds*, which puts the
Fed's own rate at zero.

- **Surface below the plane** → the market is betting on cuts.
- **Surface above it** → the market is betting on hikes.

The market is not merely directionally right. Over 36 years, the gap between
the 2-year yield and the Fed's rate has predicted the average size of the Fed's
next two years of moves **almost exactly one-for-one**. Not approximately:
statistically indistinguishable from one-for-one.

Example on the chart: **10 September 2007**, the 2-year sat 1.38 points below
what the Fed was charging. Eight days later the Fed cut. Across 2007, 95% of
the whole published curve was below the policy rate, months before the first
cut arrived.

### 2. See whether lending was actually profitable

Turn on **Inflation (CPI) as sea level**. Anything under the sheet lost money
in real terms.

This reframes the recent past. For **501 straight trading days, 1 March 2021
to 28 February 2023, every single Treasury, out to thirty years, paid less
than inflation.** In all of 2022, on 249 trading days out of 249, there was not
one maturity that beat it. The worst day was 1 March 2022: the ten-year paid
1.72% against inflation of 8.6%, a real loss of **6.85% a year**, in the asset
everyone calls risk-free.

The readout shows *10yr after inflation* on every day, whatever else you have
switched on.

### 3. Understand a headline instead of taking it on faith

When someone says the curve inverted, you can see for yourself how deep, how
long, and what happened afterwards. The 2022–24 inversion ran **537 trading
days on the 2-year/10-year measure, the longest in the record, and no recession
followed.** On the 10-year/3-month measure it ran 534.

### 4. Stop acting on a signal that does not work

See the stock market section below. Knowing that an inversion tells you nothing
about equities is worth more than a signal that fails.

---

## What the numbers say

### The market forecasts the Fed. Very well.

Take the 2-year yield minus the Fed's rate. Ask whether it helps predict the
Fed's next moves, after already accounting for the Fed's own momentum,
unemployment, payrolls, inflation, stock returns and market volatility.

It does, overwhelmingly. In the same test, **none of the economic indicators
do**: payrolls (p = 0.10), inflation (0.14), stock returns (0.17), unemployment
(0.23), volatility (0.42).

It holds up under everything I tried:

| Check | Result |
|---|---|
| Excluding the years the Fed was pinned at zero | **Stronger**, not weaker |
| Greenspan, Bernanke and Powell separately | Holds in each |
| Adding the term premium and market inflation expectations | Holds; neither of those predicts policy |
| Using the whole curve's shape instead of one number | Holds; both its level and its slope carry information |
| Forecasting genuinely out of sample | Holds (p ≈ 0.0008) |

**The catch, and it is a big one.** A 2-year yield is roughly *the average
interest rate the market expects the Fed to set over the next two years*. So
subtracting today's rate leaves you with the market's forecast of how much the
Fed will move.

Which means the finding is close to circular: the market's forecast of the Fed
predicts the Fed. That is not a discovery about yield curves. It is what a
yield curve is.

I tested exactly that. If it were purely the definition, the relationship
should be one-for-one, and it is. The measured slope is **1.106**, and the
hypothesis that it equals exactly 1 cannot be rejected (p = 0.65). On
non-overlapping periods it is **0.984** (p = 0.968).

So the honest statement is **"the bond market anticipates the Fed and is well
calibrated,"** not "the curve beats economists." There was never a fair contest
with the economic data, because the 2-year yield already contains it.

### The stock market: nothing

The folklore says an inverted curve means sell.

- Correlation between the curve's slope and the S&P's next twelve months:
  **−0.097**. That explains **under 1%** of what stocks do.
- Average S&P return in the year after an inversion began: **+9.3%.**
  Average in *any* year: **+10.3%.**

Buying after an inversion did slightly worse than buying at random, and the
difference is noise either way. In the full test, nothing predicts stock
returns and stock returns predict nothing.

To be precise about the claim: this shows the curve's slope is not a usable
twelve-month timing signal. It is not proof that no relationship exists at any
horizon.

### Money and inflation

Milton Friedman said inflation is always a monetary phenomenon. Testable.

Money supply growth does lead inflation, at about a **twelve-month** lag
(p = 0.000004). At a one-month lag it shows nothing, which is why people who
test it carelessly get the wrong answer, the effect is slow.

It is not just the 2021–22 episode. Excluding everything from 2020 onward the
result is unchanged. What *does* disappear is the reverse direction: inflation
appearing to lead money is a COVID-era artifact.

### Two recession alarms, both of which failed

The site marks both. They fail in opposite ways.

| | Curve inversion | Sahm rule |
|---|---|---|
| Timing | **Early.** 13 to 23 months ahead | **Late.** fires 1 to 7 months *into* the recession |
| Reliability | Poor: **568 of 1,052 inverted days** had no recession within two years | Good: 9 of 11 triggers landed in a recession |
| Ever warned in advance? | Yes | **Never once** |
| This cycle | Longest inversion ever, no recession | Triggered July 2024, no recession |

The Sahm rule was built as a *detector*, not a forecast, designed to start
relief spending the moment a downturn was visible. People misuse it as a
prediction constantly.

Two of the four recessions here were preceded by a long inversion (227 inverted
days before 2001, 238 before 2008). The other two were not, in any useful
sense: 16 days before 1990, 3 days before 2020.

---

## What it cannot do

- **It will not help you trade.** The one forecast it contains is about Fed
  policy, and that forecast is the market's own, already in the price of
  everything before you see it.
- **It does not establish cause.** These tests show what comes *before* what.
  The curve and the Fed both react to the same incoming news.
- **It is one country, one era.** The United States since 1990, one central
  bank. Whether this is a fact about yield curves or a fact about the Fed
  cannot be answered from this data. Japan, after decades at zero, is the
  obvious test.
- **The open question.** Is there anything in the curve *beyond* the market's
  embedded expectations that predicts the Fed? Splitting the yield into
  "expected path" and "everything else" is the test, and it is not done here.
  The one related figure available (the ten-year term premium) does **not**
  predict policy (p = 0.12), which points toward "no."

---

## How much to trust this

**Reviewed by two people who had not seen it**, twice, once after the code was
public. They found real errors, including three I would not have found alone: a
result that was misdescribed, statistics quoted from code that was never
committed, and a significance test that does not apply to the comparison I was
making. All are fixed; the corrections are in the commit history rather than
retold here.

**Multiple testing.** Run enough tests and something looks significant by
accident. Correcting for that (Benjamini-Hochberg, q = 0.05), **14 of 26 tests
survive.** Every curve-to-policy test survives. So does the money-to-inflation
result and both out-of-sample tests.

**Specifications were chosen while looking at results.** lag lengths, sample
cuts, model size. That is a real risk no correction fixes. The protection is
that the main result survives every version tried, agrees with a large existing
literature, and holds out of sample, which is the one check that kind of
searching cannot flatter.

**None of this is new.** The finding that the 2-year yield anticipates Fed
policy is established macro-finance, closest to work by Piazzesi and by
Gürkaynak, Sack and Swanson. The slow money-to-inflation lag is Friedman's.
That the slope forecasts recessions rather than stocks is Estrella and Mishkin.
This is a replication on public data with the workings shown, not a discovery.
The fact that it lands where the literature already is is the strongest
reason to believe the arithmetic is right.

---

## The code

Everything is in [`analysis/`](../analysis/), standard library only, no
statistics packages, so the arithmetic can be read rather than trusted. Run
any of it from the repository root:

| Script | What it produces |
|---|---|
| `headline.py` | Every figure in "the market forecasts the Fed" |
| `tautology.py` | The one-for-one test |
| `clarkwest.py` | Out-of-sample forecasting |
| `money.py` | Money and inflation, with the COVID split |
| `equities.py` | The stock market tests |
| `robustness.py` | Sensitivity checks and the curve's shape |
| `taylor.py` | The economists' benchmark |
| `econlib.py` | The estimators themselves |

For anyone checking the technical choices: monthly data, all series tested for
stationarity, Newey-West standard errors throughout (bandwidth printed on every
table), lag length chosen by residual diagnostics rather than an information
criterion, Granger tests conditional on the full system, Clark-West for nested
out-of-sample comparisons. Known gaps: no bootstrap, no real-time data
vintages, no cointegration test on the rates system.
