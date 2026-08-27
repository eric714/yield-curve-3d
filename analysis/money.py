"""Does the money/inflation result survive dropping the 2020-22 episode?

A reviewer's objection: a single extraordinary cycle (M2 +26.8% in 2021, CPI
9.0% in 2022) may be carrying the whole table. Split the sample and see.

Also verifies what dCPI and dM2 actually are, since the note claims they are
first differences of year-over-year rates rather than of the raw index.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from econlib import *
from dat import load
import json

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ctx = json.load(open(os.path.join(root, "docs/data/context.json")))
cpi = ctx["series"]["CPIAUCSL"]["values"]
print("Sanity check on the transformation:")
vals = [v for v in cpi if v is not None]
print(f"  CPIAUCSL in context.json ranges {min(vals):.1f} to {max(vals):.1f}")
print("  -> that is a percentage rate, not a price index (index would be ~130-320).")
print("     So dCPI is the first difference of a year-over-year rate, as claimed.\n")

man, LAB, rows = load()
R = [x for x in rows if x["cpi"] is not None and x["m2"] is not None]
seen = {}
for x in R: seen[x["month"]] = x
months = sorted(seen)
V = {}
V["dCPI"] = [seen[months[t]]["cpi"]-seen[months[t-1]]["cpi"] for t in range(1, len(months))]
V["dM2"]  = [seen[months[t]]["m2"] -seen[months[t-1]]["m2"]  for t in range(1, len(months))]
V["dPolicy"] = [seen[months[t]]["pol"]-seen[months[t-1]]["pol"] for t in range(1, len(months))]
lab = months[1:]; NM = list(V); T = len(V["dCPI"])

def wald(cause, effect, p, mask=None):
    bw = p+4
    rws = [t for t in range(p, T) if (mask is None or mask[t])]
    X = [[1.0]+[V[m][t-i] for m in NM for i in range(1, p+1)] for t in rws]
    Y = [V[effect][t] for t in rws]
    m = ols(X, Y, hac=bw)
    idx = [1+NM.index(cause)*p+j for j in range(p)]
    b = [m["beta"][i] for i in idx]
    Vi = inv([[m["V"][a][bb] for bb in idx] for a in idx])
    if Vi is None: return None
    W = sum(b[a]*Vi[a][bb]*b[bb] for a in range(p) for bb in range(p))
    return W, chi2_p(W, p), len(Y), m["k"]

SPLITS = [("full sample 1990-2026", None),
          ("excluding 2020 onward", [lab[t] < "2020-01" for t in range(T)]),
          ("2020 onward only",      [lab[t] >= "2020-01" for t in range(T)])]
for tag, mk in SPLITS:
    print(f"{tag}")
    for p in (12,):
        for a, b in (("dM2", "dCPI"), ("dCPI", "dM2")):
            r = wald(a, b, p, mask=mk)
            if r is None: print(f"  {a} -> {b}: singular"); continue
            W, pv, n, k = r
            warn = "  <-- k/n too high to trust" if k/n > 0.25 else ""
            print(f"  {a} -> {b:<6} lag {p}   chi2={W:8.1f}  p={pv:10.2e}  n={n}  k/n={k/n:.2f}{warn}")
    print()
