import pdfplumber, pypdf, re, json
UNIT={'6663':'oldc1','6664':'oldc2','6665':'oldc3','6666':'oldc4'}
GR=['A','B','C','D','E']

def pearson_modern(f):
    """Docs of the form '6663 Core Mathematics C1 Raw 75 a b c d e 0'."""
    out={}
    with pdfplumber.open(f) as pdf:
        for pg in pdf.pages:
            if not re.search(r'666[3-6]', pg.extract_text() or ''): continue
            rows={}
            for w in pg.extract_words(): rows.setdefault(round(w['top']/3),[]).append(w)
            for k in sorted(rows):
                line=re.sub(r'\s+',' '," ".join(w['text'] for w in sorted(rows[k],key=lambda w:w['x0']))).strip()
                m=re.match(r'^(666[3-6]) Core Mathematics C[1-4] Raw ((?:\d+ ?)+)$', line)
                if not m: continue
                n=[int(x) for x in m.group(2).split()]
                while n and n[-1]==0: n=n[:-1]
                if n and n[0]==75: n=n[1:]
                if len(n)>=5: out[UNIT[m.group(1)]]=n[-5:]      # last five = A..E, dropping a*
    return out

def pearson_2010(f):
    """'6663 Core Mathematics 1 75 [a*] A B C D E N 0' — note the extra N column."""
    out={}
    r=pypdf.PdfReader(f)
    for pg in r.pages:
        t=pg.extract_text() or ""
        for m in re.finditer(r'(666[3-6]) Core Mathematics [1-4] ((?:\d+ ?)+)', t):
            n=[int(x) for x in m.group(2).split()]
            if n and n[0]==75: n=n[1:]
            if n and n[-1]==0: n=n[:-1]
            n=n[:-1]                                            # drop N
            if len(n)>=5: out[UNIT[m.group(1)]]=n[-5:]
    return out

PEARSON={
 'June 2010':      pearson_2010("L1006.pdf"),
 'January 2013':   pearson_modern("L1301.pdf"),
 'June 2015':      pearson_modern("L1506.pdf"),
 'June 2016':      pearson_modern("L1606.pdf"),
 'June 2017':      pearson_modern("L1706.pdf"),
 'June 2018':      pearson_modern("2018s.pdf"),
}
arch=json.load(open("legacy_archive.json"))

need=json.load(open("needed.json"))          # {module: [series,...]}
out={}; prov={}; missing=[]
for mod, sers in need.items():
    for ser in sers:
        vals=None; src=None
        if ser in PEARSON and mod in PEARSON[ser]: vals, src = PEARSON[ser][mod], 'pearson'
        elif ser in arch.get(mod,{}):             vals, src = arch[mod][ser], 'archive'
        if not vals: missing.append((mod,ser)); continue
        if len(vals)!=5 or vals!=sorted(vals,reverse=True) or vals[0]>75:
            missing.append((mod,ser)); continue                # refuse anything malformed
        out.setdefault(ser,{})[mod]={'max':75, **dict(zip(GR,vals))}
        prov[src]=prov.get(src,0)+1
json.dump(out,open("legacy_final.json","w"),indent=1)
tot=sum(len(v) for v in out.values())
print("module-sittings covered: %d  (pearson %d, archive %d)"%(tot,prov.get('pearson',0),prov.get('archive',0)))
print("series covered:", len(out))
print("missing (%d):"%len(missing), missing)
