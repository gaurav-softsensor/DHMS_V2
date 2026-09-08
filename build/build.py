#!/usr/bin/env python3
"""Turn data/raw.json + the NSV coordinate CSV into data/payload.json.

  python3 build/build.py

Inputs
  data/raw.json                        <- build/export_db.js (PostgreSQL)
  data/Network_Overview_UPC_Lat_Long.csv   coordinates for projects the DB lacks
  assets/boundaries/*.geojson          state / district / official-outline geometry

Output
  data/payload.json   states[] ros[] pius[] projects[] outline, all geometry
                      rounded to 3dp (~110 m) and Douglas-Peucker simplified.
"""
import collections, csv as _csv, json, os, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

DATA = ROOT / 'data'
B    = str(ROOT / 'assets' / 'boundaries') + '/'
CSV  = DATA / 'Network_Overview_UPC_Lat_Long.csv'

from alias import resolve
from shapely.geometry import shape, mapping, Point
from shapely.ops import unary_union

raw = json.load(open(DATA / 'raw.json'))

# ---------- boundaries ----------
dj=json.load(open(B+'india-districts.gb-adm2.geojson'))
DGEO={f['properties']['shapeName']:shape(f['geometry']).buffer(0) for f in dj['features']}
sj=json.load(open(B+'india-states.ne10m.geojson'))
SGEO={f['properties']['name']:shape(f['geometry']).buffer(0) for f in sj['features']}
outline=shape(json.load(open(B+'india-outline.official.geojson'))['features'][0]['geometry']).buffer(0)


# ---- the official outline claims territory Natural Earth omits (Gilgit-Baltistan,
# Aksai Chin). Give it to J&K / Ladakh so no part of India renders blank.
_union_states = unary_union(list(SGEO.values()))
_gap = outline.difference(_union_states)
if not _gap.is_empty:
    _pieces = list(_gap.geoms) if _gap.geom_type=='MultiPolygon' else [_gap]
    for _pc in _pieces:
        if _pc.area < 1e-4: continue
        _best=None;_bd=1e18
        for _sn in ('Jammu and Kashmir','Ladakh','Himachal Pradesh','Uttarakhand',
                    'Arunachal Pradesh','Sikkim','Manipur','Nagaland','Odisha','Gujarat','Tamil Nadu'):
            _g=SGEO.get(_sn)
            if _g is None: continue
            _d=_g.distance(_pc)
            if _d<_bd: _bd=_d;_best=_sn
        if _best: SGEO[_best]=unary_union([SGEO[_best],_pc])

# district -> state (by max overlap)
D2S={}
for dn,g in DGEO.items():
    c=g.representative_point()
    best=None
    for sn,sg in SGEO.items():
        if sg.contains(c): best=sn;break
    if not best:
        best=max(SGEO.items(),key=lambda kv:kv[1].intersection(g).area)[0]
    D2S[dn]=best

# ---------- coordinates: DB then CSV ----------
import csv as _csv
coord={}
with open(CSV) as fh:
    for r in _csv.DictReader(fh):
        try: sla,slo,ela,elo=float(r['Start Lat']),float(r['Start Long']),float(r['End Lat']),float(r['End Long'])
        except: continue
        for c in ('UPC','Survey_UPC'):
            u=(r.get(c) or '').strip()
            if u: coord.setdefault(u.replace('_','/'),(sla,slo,ela,elo,r.get('Phase'),r.get('Cycle')))
INB=lambda la,lo: 6.0<=la<=37.5 and 68.0<=lo<=97.5

pius={x['piu_name']:x for x in raw['pius'] if x['piu_name']}
ros={x['region_name']:x for x in raw['ros'] if x['region_name']}
piu_dist={p:resolve(p,DGEO) for p in pius}


# ---- state correction, narrowly scoped -------------------------------------
# 15 of 887 projects have a UPC state suffix that disagrees with state_id. Most
# are genuine cross-border corridors (the suffix names the originating state), so
# the DB stays authoritative. We override ONLY when the UPC suffix, the PIU name
# and the district the PIU sits in all three agree against it -- e.g.
# N/04002/25002/GA, PIU Goa, district North Goa, filed under Maharashtra, which
# left Goa showing 0 projects.
UPC_STATE_SUFFIX = {
 'AP':'Andhra Pradesh','AR':'Arunachal Pradesh','AS':'Assam','BR':'Bihar','CG':'Chhattisgarh',
 'CH':'Chandigarh','DL':'Delhi','GA':'Goa','GJ':'Gujarat','HP':'Himachal Pradesh','HR':'Haryana',
 'JH':'Jharkhand','JK':'Jammu and Kashmir','KA':'Karnataka','KL':'Kerala','LA':'Ladakh',
 'MH':'Maharashtra','ML':'Meghalaya','MN':'Manipur','MP':'Madhya Pradesh','MZ':'Mizoram',
 'NL':'Nagaland','OD':'Odisha','PB':'Punjab','PY':'Puducherry','RJ':'Rajasthan','SK':'Sikkim',
 'TN':'Tamil Nadu','TR':'Tripura','TS':'Telangana','UK':'Uttarakhand','UP':'Uttar Pradesh',
 'WB':'West Bengal','AN':'Andaman and Nicobar',
 'DN':'Dadra and Nagar Haveli and Daman and Diu',
}
def _district_state(dn):
    if not dn or dn not in DGEO: return None
    c = DGEO[dn].representative_point()
    for sn, sg in SGEO.items():
        if sg.contains(c): return sn
    return None

_fixed = []
for p in raw['projects']:
    suf = (p.get('upc') or '').split('/')[-1].strip().upper()
    want = UPC_STATE_SUFFIX.get(suf)
    if not want or want == p.get('state_name'): continue
    dn = piu_dist.get(p.get('piu_name'))
    if _district_state(dn) != want: continue          # district must confirm
    if want.lower() not in (p.get('piu_name') or '').lower(): continue  # PIU must too
    _fixed.append((p['upc'], p.get('state_name'), want))
    p['state_name'] = want
if _fixed:
    print('state corrected (UPC + PIU + district agree):')
    for u, was, now in _fixed: print(f'   {u}  {was} -> {now}')

projects=[]
srcstat=collections.Counter()
for p in raw['projects']:
    la=lo=ela=elo=None; src='none'; phase=cycle=None
    if p['start_lat'] and p['start_lng'] and INB(float(p['start_lat']),float(p['start_lng'])):
        la,lo=float(p['start_lat']),float(p['start_lng']); src='db'
        if p['end_lat'] and p['end_lng']: ela,elo=float(p['end_lat']),float(p['end_lng'])
    elif p['upc'] in coord:
        c=coord[p['upc']]
        if INB(c[0],c[1]): la,lo,ela,elo,phase,cycle=c[0],c[1],c[2],c[3],c[4],c[5]; src='csv'
    if la is None:
        d=piu_dist.get(p['piu_name'])
        if d: pt=DGEO[d].representative_point(); la,lo=pt.y,pt.x; src='piu'
    srcstat[src]+=1
    projects.append({**p,'lat':la,'lon':lo,'elat':ela,'elon':elo,'geo_src':src,'phase':phase,'cycle':cycle})
print('coord src:',dict(srcstat))

# ---------- PIU territory = its district ; RO territory = union of its PIU districts ----------
ro_pius=collections.defaultdict(set)
for pn,x in pius.items():
    if x['region_name']: ro_pius[x['region_name']].add(pn)
# also from projects (a project's PIU may sit under a different RO)
for p in projects:
    if p['piu_name'] and p['region_name']: ro_pius[p['region_name']].add(p['piu_name'])
# RO districts table adds territory
ro_extra=collections.defaultdict(set)
for d in raw['districts']:
    if d['region_name'] and d['district_name']:
        r=resolve(d['district_name'],DGEO)
        if r: ro_extra[d['region_name']].add(r)
print('ros with pius:',len(ro_pius))
print('districts->state done',len(D2S))

# ================= territories =================
def simp(g,tol=0.008):
    g=g.simplify(tol,preserve_topology=True).buffer(0)
    return g
def rnd(geom,n=3):
    def w(c):
        if isinstance(c[0],(int,float)): return [round(c[0],n),round(c[1],n)]
        return [w(k) for k in c]
    m=mapping(geom); m['coordinates']=w(m['coordinates']); return m

proj_by_piu=collections.defaultdict(list)
for i,p in enumerate(projects):
    if p['piu_name']: proj_by_piu[p['piu_name']].append(i)

# PIU polygon: its district, clipped to India
PIUGEO={}
for pn,d in piu_dist.items():
    if d and d in DGEO:
        g=DGEO[d].intersection(outline)
        if not g.is_empty: PIUGEO[pn]=g

# RO polygon = union of member PIU districts + ro_district table
ROGEO={}
for rn in ros:
    parts=[]
    for pn in ro_pius.get(rn,()):
        d=piu_dist.get(pn)
        if d and d in DGEO: parts.append(DGEO[d])
    for d in ro_extra.get(rn,()):
        if d in DGEO: parts.append(DGEO[d])
    if parts:
        g=unary_union(parts).intersection(outline)
        if not g.is_empty: ROGEO[rn]=g
print('RO polys',len(ROGEO),'PIU polys',len(PIUGEO))

# ---------- aggregate stats ----------
def agg(items):
    km=sum(float(p['length_km'] or 0) for p in items)
    cost=sum(float(p['awarded_cost_cr'] or 0) for p in items)
    ph=[float(p['physical_progress_pct']) for p in items if p['physical_progress_pct'] is not None]
    return {'n':len(items),'km':round(km,1),'cost':round(cost,1),
            'phys':round(sum(ph)/len(ph),1) if ph else None}

# state list: from projects
by_state=collections.defaultdict(list)
for p in projects:
    if p['state_name']: by_state[p['state_name']].append(p)

out={'states':[],'ros':[],'pius':[],'projects':[],
     'outline':rnd(simp(outline,0.01))}

for sn,items in sorted(by_state.items()):
    g=SGEO.get(sn)
    rs=sorted(set(p['region_name'] for p in items if p['region_name']))
    out['states'].append({'name':sn,'ros':rs,**agg(items),
        'geom':rnd(simp(g.intersection(outline),0.01)) if g is not None else None})

by_ro=collections.defaultdict(list)
for p in projects:
    if p['region_name']: by_ro[p['region_name']].append(p)
for rn,items in sorted(by_ro.items()):
    m=ros.get(rn,{})
    sts=collections.Counter(p['state_name'] for p in items if p['state_name'])
    out['ros'].append({'name':rn,'email':m.get('region_email'),'home_state':m.get('home_state'),
        'zone_code':m.get('zone_code'),'zone_name':m.get('zone_name'),
        'states':[{'s':k,'n':v} for k,v in sts.most_common()],
        'pius':sorted(set(p['piu_name'] for p in items if p['piu_name'])),
        **agg(items),
        'geom':rnd(simp(ROGEO[rn],0.01)) if rn in ROGEO else None})

by_piu=collections.defaultdict(list)
for p in projects:
    if p['piu_name']: by_piu[p['piu_name']].append(p)
for pn,items in sorted(by_piu.items()):
    m=pius.get(pn,{})
    out['pius'].append({'name':pn,'email':m.get('piu_email'),'ro':m.get('region_name') or items[0]['region_name'],
        'district':piu_dist.get(pn),
        'states':sorted(set(p['state_name'] for p in items if p['state_name'])),
        **agg(items),
        'geom':rnd(simp(PIUGEO[pn],0.006)) if pn in PIUGEO else None})


# ---- states with no projects: attribute to the RO that administers them ----
# NHAI jurisdiction: the NE states are run out of RO-Guwahati/Shillong,
# Ladakh out of RO-Jammu, and the small UTs by their neighbouring RO.
ADMIN_STATE_RO = {
 'Ladakh':'RO-Jammu',
 'Arunachal Pradesh':'RO-Guwahati','Nagaland':'RO-Guwahati','Manipur':'RO-Guwahati',
 'Mizoram':'RO-Guwahati','Tripura':'RO-Guwahati',
 'Sikkim':'RO-Kolkata',
 'Goa':'RO-Mumbai',
 'Dadra and Nagar Haveli and Daman and Diu':'RO-Mumbai',
 'Chandigarh':'RO-Chandigarh (PB)',
 'Andaman and Nicobar':'RO-Chennai',
 'Lakshadweep':'RO-Thiruvananthapuram',
}
covered = set(by_state)
for sn, rn in ADMIN_STATE_RO.items():
    g = SGEO.get(sn)
    if g is None or sn in covered or by_state.get(sn): continue
    gi = g.intersection(outline)
    if gi.is_empty: gi = g          # outline may not cover far islands
    if gi.is_empty: continue
    out['states'].append({'name':sn,'ros':[rn],'n':0,'km':0.0,'cost':0.0,'phys':None,
        'admin_only':True,'admin_ro':rn,
        'geom':rnd(simp(gi,0.01))})
    # extend that RO's territory to swallow the state
    if rn in ROGEO: ROGEO[rn] = unary_union([ROGEO[rn], gi])
    else: ROGEO[rn] = gi
out['states'].sort(key=lambda x:x['name'])
# rewrite RO geoms now that admin states were merged in
for r in out['ros']:
    if r['name'] in ROGEO:
        r['geom'] = rnd(simp(ROGEO[r['name']],0.01))
    # only states that genuinely have no projects; a corrected state drops out
    r['admin_states'] = [k for k,v in ADMIN_STATE_RO.items()
                         if v==r['name'] and not by_state.get(k)]

# ---- fill leftovers: any part of a state not claimed by a PIU district goes to
# the RO(s) that work there; a single RO in the state simply takes the remainder.
st_ros_map = collections.defaultdict(set)
for p in projects:
    if p['state_name'] and p['region_name']: st_ros_map[p['state_name']].add(p['region_name'])
for r in out['ros']:
    for k,v in ADMIN_STATE_RO.items():
        if v==r['name']: st_ros_map[k].add(r['name'])
for sn, rset in sorted(st_ros_map.items()):
    rset = sorted(rset)          # deterministic: set order varies between runs
    sg = SGEO.get(sn)
    if sg is None: continue
    sg = sg.intersection(outline)
    if sg.is_empty: continue
    claimed = [ROGEO[r] for r in rset if r in ROGEO]
    rest = sg.difference(unary_union(claimed)) if claimed else sg
    if rest.is_empty: continue
    if len(rset)==1:
        rn=rset[0]
        ROGEO[rn]=unary_union([ROGEO[rn],rest]) if rn in ROGEO else rest
    else:
        # split the remainder: each piece joins the RO whose territory it touches most
        pieces=list(rest.geoms) if rest.geom_type=='MultiPolygon' else [rest]
        for pc in pieces:
            # sorted rset + name tiebreak keeps the winner stable across runs
            best=max(rset,key=lambda r: (ROGEO[r].intersection(pc.buffer(0.12)).area if r in ROGEO else 0, r))
            ROGEO[best]=unary_union([ROGEO[best],pc]) if best in ROGEO else pc
for r in out['ros']:
    if r['name'] in ROGEO: r['geom']=rnd(simp(ROGEO[r['name']],0.01))

# ---- per-state slices: an RO that works in several states must render only the
# part inside the state being viewed, else selecting Rajasthan lights up the
# whole of RO-Gandhinagar's Gujarat territory.
out['ro_by_state'] = {}
for st in out['states']:
    sn = st['name']
    sg = SGEO.get(sn)
    if sg is None: continue
    sg = sg.intersection(outline).buffer(0)
    slices = {}
    for rn in set(st['ros']):
        rg = ROGEO.get(rn)
        if rg is None: continue
        try:
            piece = rg.buffer(0).intersection(sg)
        except Exception:                       # GEOS topology conflicts
            piece = rg.buffer(1e-9).intersection(sg.buffer(1e-9))
        if piece.is_empty or piece.area < 1e-6: continue
        slices[rn] = rnd(simp(piece, 0.008))
    out['ro_by_state'][sn] = slices

# and per-RO slices for PIUs, so an RO view clips its PIUs the same way
out['piu_by_ro'] = {}
for r in out['ros']:
    rg = ROGEO.get(r['name'])
    if rg is None: continue
    rgb = rg.buffer(0)
    sl = {}
    for pn in r['pius']:
        pg = PIUGEO.get(pn)
        if pg is None: continue
        try:
            piece = pg.buffer(0).intersection(rgb)
        except Exception:
            piece = pg.buffer(1e-9).intersection(rgb.buffer(1e-9))
        if piece.is_empty or piece.area < 1e-6: continue
        sl[pn] = rnd(simp(piece, 0.006))
    out['piu_by_ro'][r['name']] = sl

KEEP=['upc','project_name','nh_number','length_km','number_of_lanes','lane_config','chainage_from_km',
 'chainage_to_km','physical_progress_pct','financial_progress_pct','awarded_cost_cr','mode','corridor',
 'project_type','current_stage','surface_type','pci','state_name','region_name','piu_name','zone_code',
 'contractor','consultant','lat','lon','elat','elon','geo_src','contract_start_date','contract_end_date','phase','cycle']
for p in projects:
    r={k:p.get(k) for k in KEEP}
    for k in ('lat','lon','elat','elon'):
        if r[k] is not None: r[k]=round(float(r[k]),4)
    for k in ('contract_start_date','contract_end_date'):
        if r[k]: r[k]=str(r[k])[:10]
    out['projects'].append(r)

json.dump(out, open(DATA/'payload.json','w'), separators=(',',':'))
print('payload MB', round(os.path.getsize(DATA/'payload.json')/1e6,2))
print('states',len(out['states']),'ros',len(out['ros']),'pius',len(out['pius']),'projects',len(out['projects']))
print('ro geom missing',[r['name'] for r in out['ros'] if not r['geom']])
print('piu geom missing',sum(1 for p in out['pius'] if not p['geom']))
