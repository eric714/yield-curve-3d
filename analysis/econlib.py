"""Pure-Python econometrics: OLS with HAC errors, F/chi2 p-values, ADF, Ljung-Box, PCA."""
import math, json, struct

def inv(A):
    n=len(A); M=[A[i][:]+[1.0 if i==j else 0.0 for j in range(n)] for i in range(n)]
    for c in range(n):
        p=max(range(c,n),key=lambda r:abs(M[r][c]))
        if abs(M[p][c])<1e-13: return None
        M[c],M[p]=M[p],M[c]; pv=M[c][c]
        for j in range(2*n): M[c][j]/=pv
        for r in range(n):
            if r!=c and M[r][c]:
                f=M[r][c]
                for j in range(2*n): M[r][j]-=f*M[c][j]
    return [row[n:] for row in M]

def ols(X,y,hac=0):
    nobs=len(y); k=len(X[0])
    XtX=[[sum(X[i][a]*X[i][b] for i in range(nobs)) for b in range(k)] for a in range(k)]
    Xty=[sum(X[i][a]*y[i] for i in range(nobs)) for a in range(k)]
    XtXi=inv(XtX)
    if XtXi is None: return None
    beta=[sum(XtXi[a][b]*Xty[b] for b in range(k)) for a in range(k)]
    res=[y[i]-sum(X[i][j]*beta[j] for j in range(k)) for i in range(nobs)]
    rss=sum(r*r for r in res)
    if hac<=0:
        s2=rss/(nobs-k)
        V=[[s2*XtXi[a][b] for b in range(k)] for a in range(k)]
    else:  # Newey-West
        S=[[0.0]*k for _ in range(k)]
        for i in range(nobs):
            for a in range(k):
                for b in range(k): S[a][b]+=res[i]*res[i]*X[i][a]*X[i][b]
        for L in range(1,hac+1):
            w=1-L/(hac+1)
            for i in range(L,nobs):
                for a in range(k):
                    for b in range(k):
                        S[a][b]+=w*res[i]*res[i-L]*(X[i][a]*X[i-L][b]+X[i-L][a]*X[i][b])
        M1=[[sum(XtXi[a][c]*S[c][b] for c in range(k)) for b in range(k)] for a in range(k)]
        V=[[sum(M1[a][c]*XtXi[c][b] for c in range(k)) for b in range(k)] for a in range(k)]
    se=[math.sqrt(V[a][a]) if V[a][a]>0 else float('nan') for a in range(k)]
    m=sum(y)/nobs; tss=sum((v-m)**2 for v in y)
    return {"beta":beta,"se":se,"rss":rss,"n":nobs,"k":k,"r2":1-rss/tss,"res":res,"V":V}

def betacf(a,b,x):
    MAXIT,EPS,FPMIN=300,3e-14,1e-300
    qab,qap,qam=a+b,a+1,a-1; c=1.0; d=1-qab*x/qap
    d=FPMIN if abs(d)<FPMIN else d; d=1/d; h=d
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
    bt=math.exp(math.lgamma(a+b)-math.lgamma(a)-math.lgamma(b)+a*math.log(x)+b*math.log(1-x))
    return bt*betacf(a,b,x)/a if x<(a+1)/(a+b+2) else 1-bt*betacf(b,a,1-x)/b

def f_p(F,d1,d2):
    return 1.0 if F<=0 else betai(d2/2,d1/2,d2/(d2+d1*F))

def gammap(a,x):
    if x<0 or a<=0: return 0.0
    if x<a+1:
        ap=a; s=1.0/a; d=s
        for _ in range(500):
            ap+=1; d*=x/ap; s+=d
            if abs(d)<abs(s)*1e-14: break
        return s*math.exp(-x+a*math.log(x)-math.lgamma(a))
    FPMIN=1e-300; b=x+1-a; c=1/FPMIN; d=1/b; h=d
    for i in range(1,500):
        an=-i*(i-a); b+=2
        d=an*d+b; d=FPMIN if abs(d)<FPMIN else d
        c=b+an/c; c=FPMIN if abs(c)<FPMIN else c
        d=1/d; de=d*c; h*=de
        if abs(de-1)<1e-14: break
    return 1-math.exp(-x+a*math.log(x)-math.lgamma(a))*h

def chi2_p(x,df): return 1-gammap(df/2,x/2)

def adf(y,lags=4,trend=False):
    """Augmented Dickey-Fuller. Returns (tstat, verdict) vs MacKinnon 5% critical values."""
    dy=[y[t]-y[t-1] for t in range(1,len(y))]
    rows=range(lags,len(dy)); X=[];Y=[]
    for t in rows:
        r=[1.0]+([float(t)] if trend else [])+[y[t]]+[dy[t-i] for i in range(1,lags+1)]
        X.append(r); Y.append(dy[t])
    m=ols(X,Y)
    idx=2 if trend else 1
    tstat=m["beta"][idx]/m["se"][idx]
    crit=-3.45 if trend else -2.89          # MacKinnon 5%, large sample
    return tstat, ("stationary" if tstat<crit else "UNIT ROOT not rejected")

def ljungbox(res,lags=12):
    nobs=len(res); m=sum(res)/nobs
    d=sum((r-m)**2 for r in res); Q=0.0
    for L in range(1,lags+1):
        num=sum((res[t]-m)*(res[t-L]-m) for t in range(L,nobs))
        rho=num/d; Q+=rho*rho/(nobs-L)
    Q*=nobs*(nobs+2)
    return Q, chi2_p(Q,lags)

def pca(cols,ncomp=3):
    """Correlation-matrix PCA by power iteration with deflation. cols = list of series."""
    k=len(cols); nobs=len(cols[0])
    mu=[sum(c)/nobs for c in cols]
    sd=[math.sqrt(sum((v-mu[j])**2 for v in cols[j])/nobs) for j in range(k)]
    Z=[[(cols[j][i]-mu[j])/sd[j] for j in range(k)] for i in range(nobs)]
    C=[[sum(Z[i][a]*Z[i][b] for i in range(nobs))/nobs for b in range(k)] for a in range(k)]
    comps=[]
    for _ in range(ncomp):
        v=[1.0/math.sqrt(k)]*k
        for _ in range(800):
            w=[sum(C[a][b]*v[b] for b in range(k)) for a in range(k)]
            nrm=math.sqrt(sum(x*x for x in w))
            if nrm<1e-14: break
            w=[x/nrm for x in w]
            if sum(abs(w[j]-v[j]) for j in range(k))<1e-13: v=w;break
            v=w
        lam=sum(v[a]*sum(C[a][b]*v[b] for b in range(k)) for a in range(k))
        scores=[sum(Z[i][j]*v[j] for j in range(k)) for i in range(nobs)]
        comps.append({"loadings":v,"eigenvalue":lam,"scores":scores,"share":lam/k})
        C=[[C[a][b]-lam*v[a]*v[b] for b in range(k)] for a in range(k)]
    return comps
