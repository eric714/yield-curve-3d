"""SUPERSEDED -- kept only to show the mistake.

This script uses a plain F test on VAR residuals, which is invalid here.
Ljung-Box rejects white-noise residuals at the short lag orders an information
criterion picks, so the F statistic is badly oversized. It overstated
significance by roughly nine orders of magnitude.

Use analysis/headline.py, which does the same tests with Newey-West errors.
Nothing in the methods note is sourced from this file.
"""
"""Bivariate Granger causality, pure Python: OLS by Gauss-Jordan, F-test, incomplete-beta p."""
import json,struct,math

# ---------- linear algebra ----------
def solve(A,b):
    n=len(A); M=[row[:]+[b[i]] for i,row in enumerate(A)]
    for c in range(n):
        p=max(range(c,n),key=lambda r:abs(M[r][c]))
        if abs(M[p][c])<1e-12: return None
        M[c],M[p]=M[p],M[c]
        pv=M[c][c]
        for j in range(c,n+1): M[c][j]/=pv
        for r in range(n):
            if r!=c and M[r][c]!=0:
                f=M[r][c]
                for j in range(c,n+1): M[r][j]-=f*M[c][j]
    return [M[i][n] for i in range(n)]

def ols_rss(X,y):
    k=len(X[0]); n=len(y)
    A=[[sum(X[i][a]*X[i][b] for i in range(n)) for b in range(k)] for a in range(k)]
    v=[sum(X[i][a]*y[i] for i in range(n)) for a in range(k)]
    beta=solve(A,v)
    if beta is None: return None,None
    rss=sum((y[i]-sum(X[i][j]*beta[j] for j in range(k)))**2 for i in range(n))
    return rss,beta

# ---------- F distribution p-value ----------
def betacf(a,b,x):
    MAXIT,EPS,FPMIN=200,3e-14,1e-300
    qab,qap,qam=a+b,a+1,a-1
    c=1.0; d=1-qab*x/qap
    if abs(d)<FPMIN: d=FPMIN
    d=1/d; h=d
    for m in range(1,MAXIT+1):
        m2=2*m
        aa=m*(b-m)*x/((qam+m2)*(a+m2))
        d=1+aa*d; d=FPMIN if abs(d)<FPMIN else d
        c=1+aa/c; c=FPMIN if abs(c)<FPMIN else c
        d=1/d; h*=d*c
        aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2))
        d=1+aa*d; d=FPMIN if abs(d)<FPMIN else d
        c=1+aa/c; c=FPMIN if abs(c)<FPMIN else c
        d=1/d; de=d*c; h*=de
        if abs(de-1)<EPS: break
    return h

def betai(a,b,x):
    if x<=0: return 0.0
    if x>=1: return 1.0
    lb=(math.lgamma(a+b)-math.lgamma(a)-math.lgamma(b)+a*math.log(x)+b*math.log(1-x))
    bt=math.exp(lb)
    if x<(a+1)/(a+b+2): return bt*betacf(a,b,x)/a
    return 1-bt*betacf(b,a,1-x)/b

def f_pvalue(F,d1,d2):
    if F<=0: return 1.0
    return betai(d2/2,d1/2,d2/(d2+d1*F))

# ---------- data ----------
man=json.load(open("docs/data/manifest.json"))
LAB=man["tenorLabels"];N=len(LAB);SC=man["scale"];OF=man["offset"];D=man["dates"];n=man["dayCount"]
arr=struct.unpack_from("<%dH"%(n*(N+1)),open("docs/data/tenors.bin","rb").read())
st=N+1;val=lambda d,t:arr[d*st+t]/SC-OF
ctx=json.load(open("docs/data/context.json"))
ff,fl=ctx["fedFundsUpper"],ctx["fedFundsLower"]
i2=LAB.index("2 Yr")
mid=lambda i:(ff[i]+fl[i])/2 if ff[i] is not None and fl[i] is not None else None

# month-end sampling -> non-overlapping observations
month_end={}
for i in range(n): month_end[D[i][:7]]=i
keys=sorted(month_end)
pol=[];gap=[];lab=[]
for k in keys:
    i=month_end[k]; m=mid(i)
    if m is None: continue
    pol.append(m); gap.append(val(i,i2)-m); lab.append(k)
dpol=[pol[t]-pol[t-1] for t in range(1,len(pol))]
g=gap[:-1]          # gap at t-1 aligns with dpol at t
print(f"monthly observations: {len(dpol)}  ({lab[1]} to {lab[-1]})\n")

def granger(y,x,p):
    """Does x Granger-cause y at lag order p?"""
    T=len(y); rows=range(p,T)
    Xr=[[1.0]+[y[t-i] for i in range(1,p+1)] for t in rows]
    Xu=[[1.0]+[y[t-i] for i in range(1,p+1)]+[x[t-i] for i in range(1,p+1)] for t in rows]
    Y=[y[t] for t in rows]
    rss_r,_=ols_rss(Xr,Y); rss_u,_=ols_rss(Xu,Y)
    if rss_r is None or rss_u is None or rss_u<=0: return None
    nobs=len(Y); k=len(Xu[0])
    F=((rss_r-rss_u)/p)/(rss_u/(nobs-k))
    return F,f_pvalue(F,p,nobs-k),nobs,1-rss_u/sum((v-sum(Y)/nobs)**2 for v in Y)

print("H0: the 2yr-minus-policy gap does NOT Granger-cause changes in the policy rate")
print(f"{'lags':>5}{'F':>9}{'p':>12}{'n':>7}{'R2(unrestricted)':>19}")
best=None
for p in (1,2,3,6,12):
    r=granger(dpol,g,p)
    if r:
        F,pv,nobs,r2=r
        print(f"{p:>5}{F:>9.2f}{pv:>12.2e}{nobs:>7}{r2:>19.3f}")
print()
print("Reverse direction. H0: policy changes do NOT Granger-cause the gap")
print(f"{'lags':>5}{'F':>9}{'p':>12}{'n':>7}")
for p in (1,2,3,6,12):
    r=granger(g,dpol,p)
    if r:
        F,pv,nobs,_=r
        print(f"{p:>5}{F:>9.2f}{pv:>12.2e}{nobs:>7}")
