import os
import json,struct,math
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(root=None):
    root = root or ROOT
    man=json.load(open(root+"/docs/data/manifest.json"))
    LAB=man["tenorLabels"];N=len(LAB);SC=man["scale"];OF=man["offset"];D=man["dates"];n=man["dayCount"]
    arr=struct.unpack_from("<%dH"%(n*(N+1)),open(root+"/docs/data/tenors.bin","rb").read())
    st=N+1
    val=lambda d,t:arr[d*st+t]/SC-OF
    ctx=json.load(open(root+"/docs/data/context.json"));S=ctx["series"]
    ff,fl=ctx["fedFundsUpper"],ctx["fedFundsLower"]
    mid=lambda i:(ff[i]+fl[i])/2 if ff[i] is not None and fl[i] is not None else None
    me={}
    for i in range(n): me[D[i][:7]]=i
    rows=[]
    for k in sorted(me):
        i=me[k];m=mid(i)
        if m is None: continue
        g=lambda s:S[s]["values"][i]
        rows.append(dict(month=k,idx=i,pol=m,y2=val(i,LAB.index("2 Yr")),
            y3m=val(i,LAB.index("3 Mo")),y10=val(i,LAB.index("10 Yr")),y30=val(i,LAB.index("30 Yr")),
            sp=g("SP500"),vix=g("VIXCLS"),cpi=g("CPIAUCSL"),m2=g("M2SL"),
            be=g("T10YIE"),tp=g("THREEFYTP10"),wal=g("WALCL"),
            tenors=[val(i,t) for t in range(N)]))
    return man,LAB,rows

def build(rows,need=()):
    r=[x for x in rows if all(x[k] is not None for k in need)]
    V={}
    V["dPolicy"]=[r[t]["pol"]-r[t-1]["pol"] for t in range(1,len(r))]
    V["Gap2yr"] =[r[t]["y2"]-r[t]["pol"] for t in range(1,len(r))]
    V["SPret"]  =[100*math.log(r[t]["sp"]/r[t-1]["sp"]) for t in range(1,len(r))]
    V["dlnVIX"] =[100*math.log(r[t]["vix"]/r[t-1]["vix"]) for t in range(1,len(r))]
    V["dCPI"]   =[r[t]["cpi"]-r[t-1]["cpi"] for t in range(1,len(r))]
    V["dM2"]    =[r[t]["m2"]-r[t-1]["m2"] for t in range(1,len(r))]
    if "be" in need: V["dBE"]=[r[t]["be"]-r[t-1]["be"] for t in range(1,len(r))]
    if "tp" in need: V["dTP"]=[r[t]["tp"]-r[t-1]["tp"] for t in range(1,len(r))]
    return V,[x["month"] for x in r][1:],r[1:]
