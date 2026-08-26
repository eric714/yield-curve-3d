"""Two checks the methods note owed the reader.

1. The 29% variance-decomposition figure came from ONE Cholesky ordering.
   Orthogonalized decompositions are ordering-sensitive, so this runs every
   defensible ordering and reports the spread.
2. The curve entered every test as a single number, the 2yr-policy gap. This
   substitutes the level/slope/curvature factors from a PCA of all 14 tenors.
"""
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from econlib import *
from macro import build_macro
from dat import load

V, lab = build_macro()
T = len(V["dPolicy"]); P = 6

def fit(order, p, extra=None):
    K = len(order)
    rows = list(range(p, T))
    A, res = [], []
    for tgt in order:
        X = [[1.0] + [V[m][t-i] for m in order for i in range(1, p+1)] for t in rows]
        Y = [V[tgt][t] for t in rows]
        m = ols(X, Y); A.append(m["beta"]); res.append(m["res"])
    n = len(rows)
    S = [[sum(res[a][i]*res[b][i] for i in range(n))/(n-1-K*p) for b in range(K)] for a in range(K)]
    return A, S, K

def fevd(order, p, horizon=(1, 6, 12, 24)):
    A, S, K = fit(order, p)
    Am = [[[A[r][1+c*p+l] for c in range(K)] for r in range(K)] for l in range(p)]
    L = chol(S)
    H = max(horizon)
    Psi = [[[1.0 if a == b else 0.0 for b in range(K)] for a in range(K)]]
    for h in range(1, H+1):
        M = [[0.0]*K for _ in range(K)]
        for l in range(1, min(h, p)+1):
            for a in range(K):
                for b in range(K):
                    M[a][b] += sum(Am[l-1][a][c]*Psi[h-l][c][b] for c in range(K))
        Psi.append(M)
    Th = [[[sum(Psi[h][a][c]*L[c][b] for c in range(K)) for b in range(K)] for a in range(K)]
          for h in range(H+1)]
    pi = order.index("dPolicy"); gi = order.index(CURVE)
    out = {}
    for h in horizon:
        parts = [sum(Th[i][pi][b]**2 for i in range(h)) for b in range(K)]
        tot = sum(parts)
        out[h] = 100*parts[gi]/tot
    return out

def chol(A):
    n = len(A); L = [[0.0]*n for _ in range(n)]
    for i in range(n):
        for j in range(i+1):
            s = sum(L[i][k]*L[j][k] for k in range(j))
            if i == j:
                d = A[i][i]-s
                if d <= 0: return None
                L[i][j] = math.sqrt(d)
            else: L[i][j] = (A[i][j]-s)/L[j][j]
    return L

CURVE = "Gap2yr"
BASE = ["Payroll", "dUNEMP", "dCPI", "dPolicy", "Gap2yr", "SPret", "dlnVIX"]
ORDERINGS = {
    "macro -> policy -> curve -> markets (used in the note)": BASE,
    "curve FIRST (most favorable to the curve)":
        ["Gap2yr", "Payroll", "dUNEMP", "dCPI", "dPolicy", "SPret", "dlnVIX"],
    "curve LAST (least favorable)":
        ["Payroll", "dUNEMP", "dCPI", "SPret", "dlnVIX", "dPolicy", "Gap2yr"],
    "markets first, then macro, then policy":
        ["SPret", "dlnVIX", "Gap2yr", "Payroll", "dUNEMP", "dCPI", "dPolicy"],
    "policy first (Fed moves, everything reacts)":
        ["dPolicy", "Gap2yr", "Payroll", "dUNEMP", "dCPI", "SPret", "dlnVIX"],
    "reverse of the note's ordering":
        list(reversed(BASE)),
}
print("=" * 78)
print("1. HOW MUCH DOES THE 29% DEPEND ON THE CHOLESKY ORDERING?")
print("   Share of the policy rate's forecast error variance attributed to the curve.\n")
print(f"   {'ordering':<52}{'6mo':>7}{'12mo':>7}{'24mo':>7}")
vals = {6: [], 12: [], 24: []}
for name, order in ORDERINGS.items():
    r = fevd(order, P)
    for h in (6, 12, 24): vals[h].append(r[h])
    print(f"   {name:<52}{r[6]:>6.1f}%{r[12]:>6.1f}%{r[24]:>6.1f}%")
print()
for h in (12,):
    lo, hi = min(vals[h]), max(vals[h])
    print(f"   At 12 months the figure ranges {lo:.1f}% to {hi:.1f}% across orderings.")
    print(f"   Spread: {hi-lo:.1f} points.  "
          f"{'ROBUST - the claim survives any ordering' if lo > 15 else 'FRAGILE - the note must report the range'}")


# ---------------------------------------------------------------------------
print()
print("=" * 78)
print("2. THE CURVE AS SHAPE, NOT ONE NUMBER")
print("   Substituting level/slope/curvature for the single 2yr-policy gap.\n")

man, LAB, rows = load()
UNs = set()
import csv as _csv
_un = {}
for r in list(_csv.reader(open(os.path.join(os.path.dirname(__file__), "fred", "UNRATE.csv"))))[1:]:
    if len(r) > 1 and r[1] not in ("", "."): _un[r[0][:7]] = float(r[1])
R = [x for x in rows if x["cpi"] is not None and x["month"] in _un]
seen = {}
for x in R: seen[x["month"]] = x
months = sorted(seen)
cols = [[seen[m]["tenors"][t] for m in months] for t in range(len(LAB))]
comps = pca(cols, 3)
names3 = ["Level", "Slope", "Curvature"]
print("   variance explained:", ", ".join(
    f"{names3[i]} {100*comps[i]['share']:.1f}%" for i in range(3)))

pol = [seen[m]["pol"] for m in months]
F = {names3[i]: comps[i]["scores"] for i in range(3)}
W = {}
W["dPolicy"] = [pol[t]-pol[t-1] for t in range(1, len(months))]
for i, nm in enumerate(names3):
    ser = F[nm]
    t_, verd = adf(ser)
    if "UNIT ROOT" in verd:
        W["d"+nm] = [ser[t]-ser[t-1] for t in range(1, len(ser))]
        print(f"   {nm:<10} ADF t={t_:6.2f} -> differenced")
    else:
        W[nm] = ser[1:]
        print(f"   {nm:<10} ADF t={t_:6.2f} -> used in levels")
# align the macro controls onto the same month list
mm = {m: i for i, m in enumerate(lab)}
keep = [i for i, m in enumerate(months[1:]) if m in mm]
for extra in ("dCPI", "dUNEMP", "Payroll", "SPret", "dlnVIX"):
    W[extra] = [V[extra][mm[months[1:][i]]] for i in keep]
for k in list(W):
    if len(W[k]) != len(keep): W[k] = [W[k][i] for i in keep]
NM = list(W); TT = len(W["dPolicy"])
print(f"   system: {', '.join(NM)}   ({TT} months)\n")

def wald_local(cause, effect, p):
    regs = list(NM); rws = list(range(p, TT))
    X = [[1.0]+[W[m][t-i] for m in regs for i in range(1, p+1)] for t in rws]
    Y = [W[effect][t] for t in rws]
    m = ols(X, Y, hac=p+4)
    idx = [1+regs.index(cause)*p+j for j in range(p)]
    b = [m["beta"][i] for i in idx]
    Vi = inv([[m["V"][a][bb] for bb in idx] for a in idx])
    if Vi is None: return None
    Wd = sum(b[a]*Vi[a][bb]*b[bb] for a in range(p) for bb in range(p))
    return Wd, chi2_p(Wd, p), len(Y), m["k"]

print(f"   {'factor -> policy':<24}{'chi2':>9}{'p':>12}{'k/n':>8}")
for p in (3, 6):
    print(f"   lag order p={p}:")
    for c in NM:
        if c == "dPolicy": continue
        r = wald_local(c, "dPolicy", p)
        if r:
            Wd, pv, n, k = r
            star = " **" if pv < 0.01/len(NM) else ""
            print(f"     {c:<22}{Wd:>9.1f}{pv:>12.2e}{k/n:>8.2f}{star}")
