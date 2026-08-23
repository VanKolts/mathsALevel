import pypdf, re, json, glob, collections
G6=['A*','A','B','C','D','E']; G5=['A','B','C','D','E']
SPECS={'9MA0','8MA0','9FM0','8FM0'}
def tokens(p):
    r=pypdf.PdfReader(p); out=[]
    for pg in r.pages:
        t=pg.extract_text() or ""
        if re.search(r'9MA0|8MA0|9FM0|8FM0|Core Mathematics C',t):
            out += t.split()
    return out
INT=re.compile(r'^\d+$'); CODE=re.compile(r'^(0?\d|\d\d|[34][A-D]|2[A-K])$')

def parse(f):
    T=tokens(f); comps=[]; over=[]; leg=[]; i=0
    while i < len(T):
        w=T[i]
        # legacy unit rows: 6663 Core Mathematics C1 Raw 75 ...
        if re.match(r'^666[3-6]$',w) and i+4<len(T) and T[i+1]=='Core':
            unit=T[i+3]; j=i+4
            if T[j]=='Raw':
                j+=1; nums=[]
                while j<len(T) and INT.match(T[j]): nums.append(int(T[j])); j+=1
                leg.append((w,unit,nums)); i=j; continue
        if w in ('Raw','Subject'):
            # look back for spec + name
            back=T[max(0,i-8):i]
            spec=next((b for b in reversed(back) if b in SPECS), None)
            btxt=' '.join(back)
            if not spec:
                if 'Mathematics' not in btxt: i+=1; continue
                further='Further' in btxt
                aslev = re.search(r'\bAS\b', btxt) is not None
                spec=('8' if aslev else '9')+('FM0' if further else 'MA0')
            elif 'Mathematics' not in btxt:
                i+=1; continue
            j=i+1; nums=[]
            while j<len(T) and INT.match(T[j]): nums.append(int(T[j])); j+=1
            if not nums: i+=1; continue
            # trailing labels
            k=j
            while k<len(T) and re.match(r'^Papers?(\(s\))?$', T[k]): k+=1
            labs=[]
            while k<len(T) and CODE.match(T[k]): labs.append(T[k]); k+=1
            mx=nums[0]
            (over if mx in (300,160,240) else comps).append((spec, labs, nums))
            i=j; continue
        i+=1
    return comps,over,leg

def bounds(nums, keep):
    mx=nums[0]; body=nums[1:1+keep]
    while body and body[-1]==0: body=body[:-1]
    names=G6 if len(body)==6 else G5 if len(body)==5 else None
    return {'max':mx, **dict(zip(names,body))} if names else None

MOD={'alevel':('9MA0',{'1':['1','01'],'2':['2','02'],'3':['3','03']}),
     'as':('8MA0',{'1':['1','01'],'2':['2','02']}),
     'fmcp':('9FM0',{'1':['1','01'],'2':['2','02']}),
     'fp1':('9FM0',{'1':['3A']}),'fs1':('9FM0',{'1':['3B']}),
     'fm1':('9FM0',{'1':['3C']}),'d1':('9FM0',{'1':['3D']})}
LEGMOD={'6663':'oldc1','6664':'oldc2','6665':'oldc3','6666':'oldc4'}

C=collections.defaultdict(dict); O=collections.defaultdict(dict); LG=collections.defaultdict(dict)
for f in sorted(glob.glob("20*.pdf")):
    yr=f[:4]; comps,over,leg=parse(f)
    cm={}
    for s,labs,n in comps:
        if labs: cm[(s,labs[0])]=n
    for mod,(spec,papers) in MOD.items():
        for pn,cands in papers.items():
            for lab in cands:
                if (spec,lab) in cm:
                    b=bounds(cm[(spec,lab)],7)
                    if b: C[yr].setdefault(mod,{})[pn]=b
                    break
    for spec,labs,nums in over:
        b=bounds(nums, 7 if spec[0]=='9' else 6)
        if not b: continue
        if spec in ('9FM0','8FM0'):
            parts=[p for p in labs if p not in ('01','02','1','2')]
            if parts: O[yr].setdefault(spec,{})['+'.join(parts)]=b
        else: O[yr][spec]=b
    for code,unit,nums in leg:
        b=bounds(nums,7)
        if b: LG[yr][LEGMOD[code]]=b
out={'components':dict(C),'overall':dict(O),'legacy':dict(LG)}
json.dump(out,open("final.json","w"),indent=1)
for y in sorted(C): print("comp  ",y,sorted(C[y]))
print()
for y in sorted(O):
    print("over  ",y,{k:(len(v) if 'max' not in v else 'single') for k,v in O[y].items()})
print()
for y in sorted(LG): print("legacy",y,sorted(LG[y]))
