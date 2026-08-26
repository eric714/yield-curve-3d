import sys,os,math
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from econlib import *; from macro import build_macro
V,lab=build_macro()
ORDER=["Payroll","dUNEMP","dCPI","dPolicy","Gap2yr","SPret","dlnVIX"]
K=len(ORDER); T=len(V["dPolicy"]); P=6

def chol(A):
    n=len(A); L=[[0.0]*n for _ in range(n)]
    for i in range(n):
        for j in range(i+1):
            s=sum(L[i][k]*L[j][k] for k in range(j))
            if i==j:
                d=A[i][i]-s
                if d<=0: return None
                L[i][j]=math.sqrt(d)
            else: L[i][j]=(A[i][j]-s)/L[j][j]
    return L

def fit_var(V,order,p,rows=None):
    rows=rows or list(range(p,T))
    A=[];res=[]
    for tgt in order:
        X=[[1.0]+[V[m][t-i] for m in order for i in range(1,p+1)] for t in rows]
        Y=[V[tgt][t] for t in rows]
        m=ols(X,Y); A.append(m["beta"]); res.append(m["res"])
    n=len(rows)
    S=[[sum(res[a][i]*res[b][i] for i in range(n))/(n-1-K*p) for b in range(K)] for a in range(K)]
    return A,S

A,S=fit_var(V,ORDER,P)
Amat=[[[A[r][1+c*P+(l)] for c in range(K)] for r in range(K)] for l in range(P)]
L=chol(S)
H=25
Psi=[[[1.0 if a==b else 0.0 for b in range(K)] for a in range(K)]]
for h in range(1,H+1):
    M=[[0.0]*K for _ in range(K)]
    for l in range(1,min(h,P)+1):
        for a in range(K):
            for b in range(K):
                M[a][b]+=sum(Amat[l-1][a][c]*Psi[h-l][c][b] for c in range(K))
    Psi.append(M)
Theta=[[[sum(Psi[h][a][c]*L[c][b] for c in range(K)) for b in range(K)] for a in range(K)] for h in range(H+1)]

pi=ORDER.index("dPolicy"); gi=ORDER.index("Gap2yr")
print("="*78)
print("IMPULSE RESPONSE: effect on the POLICY RATE PATH of a one-standard-deviation")
print("shock to the 2yr-policy gap.  (Cholesky order puts the curve AFTER policy,")
print("so contemporaneous curve shocks cannot hit policy -- a conservative choice.)\n")
cum=0
print(f"  {'month':>6}{'response (pp)':>16}{'cumulative':>14}")
for h in range(0,19):
    r=Theta[h][pi][gi]; cum+=r
    if h<=12 or h%3==0: print(f"  {h:>6}{r:>16.4f}{cum:>14.4f}")
print("\n"+"="*78)
print("FORECAST ERROR VARIANCE DECOMPOSITION of the policy rate (% attributable to each shock)")
print(f"  {'horizon':>8}"+"".join(f"{o[:8]:>10}" for o in ORDER))
for h in (1,3,6,12,24):
    tot=0;parts=[]
    for b in range(K):
        s=sum(Theta[i][pi][b]**2 for i in range(h)); parts.append(s); tot+=s
    print(f"  {h:>8}"+"".join(f"{100*p/tot:>9.1f}%" for p in parts))

print("\n"+"="*78)
print("PARAMETER STABILITY: the same Granger test inside each Fed chair's tenure")
eras=[("Greenspan","1990-01","2006-01"),("Bernanke","2006-02","2014-01"),
      ("Yellen","2014-02","2018-01"),("Powell","2018-02","2026-12")]
def sub_g(a,b,p):
    rows=[t for t in range(p,T) if a<=lab[t]<=b]
    if len(rows)<p*K+20: return None,len(rows)
    def rss(excl):
        regs=[m for m in ORDER if m!=excl]
        X=[[1.0]+[V[m][t-i] for m in regs for i in range(1,p+1)] for t in rows]
        Y=[V["dPolicy"][t] for t in rows]
        m=ols(X,Y); return (m["rss"],m["k"]) if m else (None,None)
    ru,k=rss(None); rr,_=rss("Gap2yr")
    if ru is None: return None,len(rows)
    F=((rr-ru)/p)/(ru/(len(rows)-k))
    return (F,f_p(F,p,len(rows)-k)),len(rows)
for nm,a,b in eras:
    for p in (2,):
        r,n=sub_g(a,b,p)
        if r: print(f"  {nm:<10} {a}..{b}  n={n:>4}  F={r[0]:6.2f}  p={r[1]:.2e}")
        else: print(f"  {nm:<10} {a}..{b}  n={n:>4}  too few observations")

print("\n"+"="*78)
print("ASYMMETRY: does the curve predict CUTS better than HIKES?")
p=3
rows=list(range(p,T))
X=[[1.0]+[V[m][t-i] for m in ORDER for i in range(1,p+1)] for t in rows]
Y=[V["dPolicy"][t] for t in rows]
m=ols(X,Y)
pred=[sum(X[i][j]*m["beta"][j] for j in range(len(m["beta"]))) for i in range(len(rows))]
for nm,sel in [("months policy FELL",lambda i:Y[i]<-0.01),
               ("months policy ROSE",lambda i:Y[i]>0.01),
               ("months policy HELD",lambda i:abs(Y[i])<=0.01)]:
    idx=[i for i in range(len(rows)) if sel(i)]
    if not idx: continue
    sse=sum((Y[i]-pred[i])**2 for i in idx)
    mu=sum(Y[i] for i in idx)/len(idx)
    tss=sum((Y[i]-mu)**2 for i in idx)
    corr_sign=sum(1 for i in idx if (pred[i]<0)==(Y[i]<0))/len(idx)
    print(f"  {nm:<20} n={len(idx):>4}  RMSE={math.sqrt(sse/len(idx)):.4f}"
          f"  R2_within={1-sse/tss if tss>0 else float('nan'):+.3f}  direction right {100*corr_sign:.0f}%")
