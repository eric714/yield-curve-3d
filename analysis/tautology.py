"""How much of Claim 1 is an accounting identity?

Under the pure expectations hypothesis the 2-year yield is the average expected
policy rate over the next 24 months plus a term premium. So

    gap_t = y2_t - i_t  ~=  mean_j E[i_{t+j}] - i_t  +  TP_t
                        ~=  the market's forecast of the AVERAGE policy change

If that is all the gap is, then regressing the REALIZED average policy change
over the following 24 months on the gap should give a slope of 1: the market's
forecast maps one-for-one into what happens.

    beta = 1  -> the relationship is the identity. Nothing to explain.
    beta < 1  -> the market systematically overshoots; the gap exaggerates.
    beta > 1  -> the market undershoots.

Either departure from 1 is information the identity does not supply.
"""
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from econlib import *
from dat import load

man, LAB, rows = load()
R = [x for x in rows if x["pol"] is not None]
seen = {}
for x in R: seen[x["month"]] = x
months = sorted(seen)
pol = [seen[m]["pol"] for m in months]
y2  = [seen[m]["y2"]  for m in months]
gap = [y2[t]-pol[t] for t in range(len(months))]

H = 24
X, Y, keep = [], [], []
for t in range(len(months)-H):
    avg = sum(pol[t+j]-pol[t] for j in range(1, H+1))/H
    X.append([1.0, gap[t]]); Y.append(avg); keep.append(months[t])
m = ols(X, Y, hac=H)
b, se = m["beta"][1], m["se"][1]
print("="*74)
print("TESTING THE EXPECTATIONS-HYPOTHESIS RESTRICTION")
print(f"  realized average policy change over the next {H} months, on the gap")
print(f"  n = {m['n']} months, {keep[0]} to {keep[-1]}, HAC({H}) errors\n")
print(f"  slope          = {b:+.3f}   (HAC se {se:.3f})")
print(f"  intercept      = {m['beta'][0]:+.3f}")
print(f"  R2             = {m['r2']:.3f}")
t1 = (b-1.0)/se
p1 = betai((m["n"]-2)/2, 0.5, (m["n"]-2)/((m["n"]-2)+t1*t1))
t0 = b/se
print(f"\n  H0: slope = 1 (pure identity)   t = {t1:+.2f}   p = {p1:.4f}"
      f"   -> {'CANNOT reject the identity' if p1 > 0.05 else 'REJECTED'}")
print(f"  H0: slope = 0 (no relation)     t = {t0:+.2f}")
print()
if p1 <= 0.05:
    direction = "overshoots" if b < 1 else "undershoots"
    print(f"  The market {direction}: a 1-point gap is followed by only "
          f"{b:.2f} points of\n  average policy change. The gap is not a "
          f"one-for-one forecast, so it is not\n  purely the identity -- but "
          f"the departure is a bias, not extra information.")
print()
print("  For scale: how much of the gap's variation is realized?")
print(f"    gap standard deviation                     {statdev(gap):.2f} pp")
print(f"    realized average policy change std dev     {statdev(Y):.2f} pp")


# ---------------------------------------------------------------------------
# A reviewer objected, correctly, that the regression above uses OVERLAPPING
# 24-month averages: consecutive observations share 23 of 24 months, so the
# HAC(24) p-value is not to be read as precise. Repeat on non-overlapping
# blocks, where each observation is independent by construction.
print()
print("=" * 74)
print("SAME TEST ON NON-OVERLAPPING 24-MONTH BLOCKS")
Xn, Yn, tags = [], [], []
t = 0
while t + H < len(months):
    avg = sum(pol[t+j]-pol[t] for j in range(1, H+1))/H
    Xn.append([1.0, gap[t]]); Yn.append(avg); tags.append(months[t])
    t += H
mn = ols(Xn, Yn)
bn, sen = mn["beta"][1], mn["se"][1]
t1n = (bn-1.0)/sen
p1n = betai((mn["n"]-2)/2, 0.5, (mn["n"]-2)/((mn["n"]-2)+t1n*t1n))
print(f"  n = {mn['n']} independent blocks, {tags[0]} to {tags[-1]}")
print(f"  slope = {bn:+.3f}  (se {sen:.3f})   R2 = {mn['r2']:.3f}")
print(f"  H0: slope = 1   t = {t1n:+.2f}   p = {p1n:.4f}"
      f"   -> {'cannot reject the identity' if p1n > 0.05 else 'REJECTED'}")
print(f"  H0: slope = 0   t = {bn/sen:+.2f}")
print(f"\n  With only {mn['n']} blocks this has little power; it is a check that the")
print("  overlapping result is not an artifact of the overlap, not a sharper test.")
