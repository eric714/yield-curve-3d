import sys,os,math
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from econlib import *; from macro import build_macro
from dat import load
V,lab=build_macro(); T=len(V["dPolicy"])
man,LAB,rows=load()
polm={r["month"]:r["pol"] for r in rows}
def t_p(t,df): return betai(df/2,0.5,df/(df+t*t))
def design(V,regs,tgt,p,rows_):
    return ([[1.0]+[V[m][t-i] for m in regs for i in range(1,p+1)] for t in rows_],
            [V[tgt][t] for t in rows_])
def run(P,only_free,tag):
    SETS={"AR only":["dPolicy"],"AR + curve":["dPolicy","Gap2yr"],
          "AR + macro":["dPolicy","dUNEMP","Payroll"],
          "AR + macro + curve":["dPolicy","dUNEMP","Payroll","Gap2yr"]}
    start=int(T*0.5); errs={k:[] for k in SETS}; act=[]
    for t in range(start,T):
        if only_free and polm.get(lab[t],0)<=0.30: continue
        rws=list(range(P,t)); pr={}; ok=True
        for nm,regs in SETS.items():
            X,Y=design(V,regs,"dPolicy",P,rws); m=ols(X,Y)
            if m is None: ok=False;break
            x=[1.0]+[V[r][t-i] for r in regs for i in range(1,P+1)]
            pr[nm]=sum(x[j]*m["beta"][j] for j in range(len(m["beta"])))
        if not ok: continue
        act.append(V["dPolicy"][t])
        for nm in SETS: errs[nm].append(V["dPolicy"][t]-pr[nm])
    n=len(act); mu=sum(act)/n; tss=sum((a-mu)**2 for a in act)
    print(f"\n{tag}  (p={P}, {n} forecasts)")
    print(f"  {'model':<20}{'RMSE':>9}{'OOS R2':>10}")
    for nm in SETS:
        sse=sum(e*e for e in errs[nm])
        print(f"  {nm:<20}{math.sqrt(sse/n):>9.4f}{1-sse/tss:>10.3f}")
    def dm(a,b,l):
        d=[a[i]**2-b[i]**2 for i in range(len(a))]; nn=len(d); db=sum(d)/nn
        L=int(nn**(1/3))+1; var=sum((x-db)**2 for x in d)/nn
        for k in range(1,L+1):
            g=sum((d[i]-db)*(d[i-k]-db) for i in range(k,nn))/nn
            var+=2*(1-k/(L+1))*g
        if var<=0: print(f"  {l}: degenerate"); return
        s=db/math.sqrt(var/nn)*math.sqrt((nn-1)/nn)
        print(f"  {l:<40} DM={s:+6.2f}  p={t_p(s,nn-1):.4f}")
    print("  Diebold-Mariano:")
    dm(errs["AR only"],errs["AR + curve"],"AR only vs AR+curve")
    dm(errs["AR + macro"],errs["AR + macro + curve"],"AR+macro vs AR+macro+curve")
run(6,False,"[A] full test window, p=6  (as before)")
run(3,False,"[B] full test window, p=3  (fewer parameters)")
run(3,True ,"[C] EXCLUDING zero-bound months, p=3")
run(6,True ,"[D] EXCLUDING zero-bound months, p=6")
