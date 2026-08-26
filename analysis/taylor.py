import sys,os,math,csv
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from econlib import *; from dat import load
SC=os.path.join(os.path.dirname(__file__),"fred")
def fm(sid):
    o={}
    for r in list(csv.reader(open(f"{SC}/{sid}.csv")))[1:]:
        if len(r)>1 and r[1] not in("","."): o[r[0][:7]]=float(r[1])
    return o
UN=fm("UNRATE")
man,LAB,rows=load()
R=[x for x in rows if x["cpi"] is not None and x["month"] in UN]
pol=[x["pol"] for x in R]; cpi=[x["cpi"] for x in R]
un=[UN[x["month"]] for x in R]; gap=[x["y2"]-x["pol"] for x in R]
lab=[x["month"] for x in R]
print(f"{len(R)} months, {lab[0]} to {lab[-1]}\n")
print("="*78)
print("A TAYLOR RULE IN LEVELS:  policy_t = a + b*inflation_t + c*unemployment_t")
X=[[1.0,cpi[i],un[i]] for i in range(len(R))]
m=ols(X,pol,hac=12)
nm=["const","inflation","unemployment"]
for j in range(3):
    t=m["beta"][j]/m["se"][j]
    print(f"  {nm[j]:<14} coef={m['beta'][j]:+7.3f}  HAC se={m['se'][j]:.3f}  t={t:+6.2f}  p={betai((m['n']-3)/2,0.5,(m['n']-3)/((m['n']-3)+t*t)):.2e}")
print(f"  R2 = {m['r2']:.3f}")
print("\n  Taylor's original rule implies b>1 (the 'Taylor principle') and c<0.")
print("  Signs here:", "inflation +" if m['beta'][1]>0 else "inflation -",
      "/", "unemployment -" if m['beta'][2]<0 else "unemployment +")
print("\n"+"="*78)
print("IS IT A REAL LONG-RUN RELATIONSHIP? Engle-Granger cointegration test")
t,_=adf(m["res"],lags=4)
crit=-3.74   # MacKinnon 5%, 2 regressors + constant
print(f"  ADF on the residuals: t = {t:.2f}   (5% critical value for cointegration = {crit})")
print("  ->", "COINTEGRATED: the level relationship is real, not spurious" if t<crit
      else "cannot reject no-cointegration; treat the level regression cautiously")
print("\n"+"="*78)
print("ERROR-CORRECTION MODEL: does the curve still matter once the Taylor rule is in?")
print("  dPolicy_t = a + g*(Taylor disequilibrium)_{t-1} + lags of dPolicy + lags of Gap\n")
ect=m["res"]
P=6
rws=range(P,len(R)-1)
def fit(withgap):
    X=[];Y=[]
    for t_ in rws:
        r=[1.0,ect[t_-1]]+[pol[t_-i]-pol[t_-i-1] for i in range(1,P+1)]
        if withgap: r+=[gap[t_-i] for i in range(1,P+1)]
        X.append(r); Y.append(pol[t_]-pol[t_-1])
    return ols(X,Y,hac=10),X,Y
m0,_,_=fit(False); m1,X1,Y1=fit(True)
tt=m1["beta"][1]/m1["se"][1]
print(f"  error-correction term: coef={m1['beta'][1]:+.4f}  t={tt:+.2f}"
      f"   ({'significant' if abs(tt)>2 else 'not significant'})")
print(f"    (negative = policy pulls back toward the Taylor level, as theory says)")
print(f"  R2 without curve = {m0['r2']:.3f}    with curve = {m1['r2']:.3f}    gain = {m1['r2']-m0['r2']:+.3f}")
idx=[2+P+j for j in range(P)]
b=[m1["beta"][i] for i in idx]
Vi=inv([[m1["V"][a][bb] for bb in idx] for a in idx])
W=sum(b[a]*Vi[a][bb]*b[bb] for a in range(P) for bb in range(P))
print(f"  Wald test, curve lags = 0:  chi2={W:.1f}  p={chi2_p(W,P):.3e}")
