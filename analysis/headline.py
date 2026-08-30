"""Regenerates every number under "The market forecasts the Fed. Very well."
in notes/methods.md.

Written after a reviewer pointed out, correctly, that the headline Wald
statistic appeared in the write-up but in no committed script. If a number is
quoted in that section and not printed here, treat that as a bug.

Newey-West bandwidth is stated on every table rather than left to the reader to
find in the source: it is lag order + 4 throughout this file.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from econlib import *
from macro import build_macro
from dat import load

V, lab = build_macro()
NAMES = list(V)
T = len(V["dPolicy"])
man, LAB, rows = load()
polm = {r["month"]: r["pol"] for r in rows}

def wald(names, cause, effect, p, mask=None, bw=None):
    """HAC-robust Wald test that all lags of `cause` drop out of `effect`."""
    bw = bw if bw is not None else p + 4
    regs = list(names)
    rws = [t for t in range(p, T) if (mask is None or mask[t])]
    X = [[1.0] + [V[m][t-i] for m in regs for i in range(1, p+1)] for t in rws]
    Y = [V[effect][t] for t in rws]
    m = ols(X, Y, hac=bw)
    idx = [1 + regs.index(cause)*p + j for j in range(p)]
    b = [m["beta"][i] for i in idx]
    Vi = inv([[m["V"][a][bb] for bb in idx] for a in idx])
    if Vi is None: return None
    W = sum(b[a]*Vi[a][bb]*b[bb] for a in range(p) for bb in range(p))
    return W, chi2_p(W, p), len(Y), m["k"]

def table(title, names, effect, causes, p, mask=None):
    print(f"\n{title}")
    print(f"  VAR({p}) on {len(names)} variables, Newey-West bandwidth {p+4}")
    print(f"  {'cause -> ' + effect:<26}{'chi2':>9}{'p':>13}{'n':>6}{'k/n':>7}")
    for c in causes:
        r = wald(names, c, effect, p, mask=mask)
        if r is None: print(f"  {c:<26}{'singular':>9}"); continue
        W, pv, n, k = r
        flag = " **" if pv < 0.01/len(causes) else ""
        warn = "  <-- k/n high" if k/n > 0.25 else ""
        print(f"  {c:<26}{W:>9.1f}{pv:>13.2e}{n:>6}{k/n:>7.2f}{flag}{warn}")

print("=" * 78)
print("SECTION 1 OF notes/methods.md, REGENERATED")
print(f"data: {len(V['dPolicy'])} monthly observations, {lab[0]} to {lab[-1]}")
print("=" * 78)

CAUSES = ["Gap2yr", "Payroll", "dUNEMP", "dCPI", "SPret", "dlnVIX"]
for p in (6, 9):
    table(f"[1] What predicts the change in the policy rate?  (lag order {p})",
          NAMES, "dPolicy", CAUSES, p)

zlb = [polm.get(lab[t], 0) <= 0.30 for t in range(T)]
free = [not z for z in zlb]
print(f"\n[2] Zero lower bound: {sum(zlb)} of {T} months at or below 0.30%")
for p in (9,):
    for tag, mk in (("full sample", None), ("zero-bound months excluded", free)):
        r = wald(NAMES, "Gap2yr", "dPolicy", p, mask=mk)
        print(f"  Gap2yr -> dPolicy, lag {p}, {tag:<28} chi2={r[0]:7.1f}  p={r[1]:.2e}  n={r[2]}")

print("\n[3] Stability across Fed chairs  (HAC, not the plain F used earlier)")
ERAS = [("Greenspan", "1990-01", "2006-01"), ("Bernanke", "2006-02", "2014-01"),
        ("Yellen", "2014-02", "2018-01"), ("Powell", "2018-02", "2026-12")]
for nm, a, b in ERAS:
    for p in (3,):
        mk = [a <= lab[t] <= b for t in range(T)]
        if sum(mk) < len(NAMES)*p + 25:
            print(f"  {nm:<11} too few observations"); continue
        r = wald(NAMES, "Gap2yr", "dPolicy", p, mask=mk)
        print(f"  {nm:<11} {a}..{b}  lag {p}  chi2={r[0]:7.1f}  p={r[1]:.2e}  n={r[2]}  k/n={r[3]/r[2]:.2f}")

print("\n[4] Adding the term premium and the 10-year breakeven (2003 onward)")
Ve, labe = build_macro(), None
try:
    from dat import build as _b
except ImportError:
    pass
import dat as _dat
_man, _LAB, _rows = _dat.load()
Vx, labx, _ = _dat.build(_rows, need=("be", "tp"))
NX = list(Vx)
def wald_x(cause, p):
    bw = p + 4
    rws = list(range(p, len(Vx["dPolicy"])))
    X = [[1.0] + [Vx[m][t-i] for m in NX for i in range(1, p+1)] for t in rws]
    Y = [Vx["dPolicy"][t] for t in rws]
    m = ols(X, Y, hac=bw)
    idx = [1 + NX.index(cause)*p + j for j in range(p)]
    b = [m["beta"][i] for i in idx]
    Vi = inv([[m["V"][a][bb] for bb in idx] for a in idx])
    W = sum(b[a]*Vi[a][bb]*b[bb] for a in range(p) for bb in range(p))
    return W, chi2_p(W, p), len(Y), m["k"]
print(f"  system: {', '.join(NX)}   ({len(Vx['dPolicy'])} months)")
print(f"  {'cause -> dPolicy':<22}{'chi2':>9}{'p':>13}{'k/n':>7}")
for c in ("Gap2yr", "dTP", "dBE", "dCPI", "SPret"):
    W, pv, n, k = wald_x(c, 3)
    print(f"  {c:<22}{W:>9.1f}{pv:>13.2e}{k/n:>7.2f}")
