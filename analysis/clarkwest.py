"""Clark-West test for NESTED model comparison.

Diebold-Mariano assumes non-nested models. AR versus AR+curve is nested: under
the null the extra coefficients are zero, so the larger model still pays an
estimation-noise penalty and DM is undersized -- it under-rejects. Clark-West
adjusts for that penalty.

    f_t = (y - yhat_small)^2 - [ (y - yhat_big)^2 - (yhat_small - yhat_big)^2 ]

and tests mean(f) > 0, one-sided, HAC standard error.
"""
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from econlib import *
from macro import build_macro
from dat import load

V, lab = build_macro(); T = len(V["dPolicy"])
man, LAB, rows = load()
polm = {r["month"]: r["pol"] for r in rows}

def design(regs, p, rws):
    return ([[1.0]+[V[m][t-i] for m in regs for i in range(1, p+1)] for t in rws],
            [V["dPolicy"][t] for t in rws])

def t_p_one(t, df):
    two = betai(df/2, 0.5, df/(df+t*t))
    return two/2 if t > 0 else 1-two/2

def run(P, only_free, tag):
    SMALL = ["dPolicy"]; BIG = ["dPolicy", "Gap2yr"]
    SMALL2 = ["dPolicy", "dUNEMP", "Payroll"]; BIG2 = SMALL2+["Gap2yr"]
    start = int(T*0.5)
    acc = {k: [] for k in ("y", "s1", "b1", "s2", "b2")}
    for t in range(start, T):
        if only_free and polm.get(lab[t], 0) <= 0.30: continue
        rws = list(range(P, t)); ok = True; pred = {}
        for nm, regs in (("s1", SMALL), ("b1", BIG), ("s2", SMALL2), ("b2", BIG2)):
            X, Y = design(regs, P, rws); m = ols(X, Y)
            if m is None: ok = False; break
            x = [1.0]+[V[r][t-i] for r in regs for i in range(1, P+1)]
            pred[nm] = sum(x[j]*m["beta"][j] for j in range(len(m["beta"])))
        if not ok: continue
        acc["y"].append(V["dPolicy"][t])
        for k in ("s1", "b1", "s2", "b2"): acc[k].append(pred[k])
    n = len(acc["y"])
    def cw(small, big, label):
        f = [ (acc["y"][i]-acc[small][i])**2
              - ((acc["y"][i]-acc[big][i])**2 - (acc[small][i]-acc[big][i])**2)
              for i in range(n) ]
        fb = sum(f)/n
        L = int(n**(1/3))+1
        var = sum((x-fb)**2 for x in f)/n
        for l in range(1, L+1):
            g = sum((f[i]-fb)*(f[i-l]-fb) for i in range(l, n))/n
            var += 2*(1-l/(L+1))*g
        if var <= 0: print(f"    {label}: degenerate"); return
        stat = fb/math.sqrt(var/n)
        # DM on the same pair, for comparison
        d = [(acc["y"][i]-acc[small][i])**2-(acc["y"][i]-acc[big][i])**2 for i in range(n)]
        db = sum(d)/n; dv = sum((x-db)**2 for x in d)/n
        for l in range(1, L+1):
            g = sum((d[i]-db)*(d[i-l]-db) for i in range(l, n))/n
            dv += 2*(1-l/(L+1))*g
        dm = db/math.sqrt(dv/n)*math.sqrt((n-1)/n) if dv > 0 else float("nan")
        print(f"    {label:<28} CW={stat:+5.2f}  p={t_p_one(stat,n-1):.4f}"
              f"   (DM was {dm:+5.2f}, p={betai((n-1)/2,0.5,(n-1)/((n-1)+dm*dm)):.4f})")
    print(f"\n  {tag}   n={n} forecasts, p={P}")
    print("    one-sided Clark-West; positive favors the larger model")
    cw("s1", "b1", "AR  vs  AR+curve")
    cw("s2", "b2", "AR+macro  vs  +curve")

print("="*78)
print("CLARK-WEST: the nested-model test that should have been used")
run(6, True,  "[A] zero-bound months excluded")
run(3, True,  "[B] zero-bound months excluded, fewer lags")
run(6, False, "[C] full test window")
