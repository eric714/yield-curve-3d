import sys,os,csv,math
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from econlib import *; from dat import *
SC=os.path.join(os.path.dirname(__file__),"fred")
def fred_monthly(sid):
    out={}
    for r in list(csv.reader(open(f"{SC}/{sid}.csv")))[1:]:
        if len(r)<2 or r[1] in ("",".") : continue
        out[r[0][:7]]=float(r[1])
    return out
UN,PA=fred_monthly("UNRATE"),fred_monthly("PAYEMS")

def build_macro(root="/Users/erichale/yield-curve-3d"):
    man,LAB,rows=load(root)
    r=[x for x in rows if all(x[k] is not None for k in ("sp","vix","cpi","m2"))
       and x["month"] in UN and x["month"] in PA]
    V={}
    V["dPolicy"]=[r[t]["pol"]-r[t-1]["pol"] for t in range(1,len(r))]
    V["Gap2yr"] =[r[t]["y2"]-r[t]["pol"] for t in range(1,len(r))]
    V["SPret"]  =[100*math.log(r[t]["sp"]/r[t-1]["sp"]) for t in range(1,len(r))]
    V["dlnVIX"] =[100*math.log(r[t]["vix"]/r[t-1]["vix"]) for t in range(1,len(r))]
    V["dCPI"]   =[r[t]["cpi"]-r[t-1]["cpi"] for t in range(1,len(r))]
    V["dUNEMP"] =[UN[r[t]["month"]]-UN[r[t-1]["month"]] for t in range(1,len(r))]
    V["Payroll"]=[100*math.log(PA[r[t]["month"]]/PA[r[t-1]["month"]]) for t in range(1,len(r))]
    return V,[x["month"] for x in r][1:]
