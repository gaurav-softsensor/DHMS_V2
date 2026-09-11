
(function(){
"use strict";
const D = JSON.parse(document.getElementById('d').textContent);
const $ = s => document.querySelector(s);
/* display labels: ROs read "RO-Mumbai", PIUs read "PIU-Nashik" */
const roLabel  = n => { n=String(n||''); return /^RO[-\s]/i.test(n) ? n.replace(/^RO\s+/i,'RO-') : 'RO-'+n; };
const piuLabel = n => { n=String(n||''); return /^PIU[-\s]/i.test(n) ? n.replace(/^PIU\s+/i,'PIU-') : 'PIU-'+n; };

/* ---------- palette: 25 hues, stable per name ---------- */
/* ---------- palette ----------
   A hash alone kept giving neighbours near-identical pastels (West Bengal and
   Odisha were the giveaway). These 18 hues are spaced around the wheel, and
   adjacency-aware assignment then guarantees that two territories sharing a
   border never take the same one. */
const HUES=[210,14,150,275,42,190,330,96,255,26,170,300,60,230,0,130,315,78];
function idx(name,n){let h=0;for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))>>>0;return h%n;}
/* Greedy colouring: walk the list in a stable order and give each territory the
   first hue none of its neighbours already uses. `adj` maps a name to the names
   whose polygons touch it. */
function assignAdjacent(names,adj){
  const m={};
  names.forEach(n=>{
    const taken=new Set((adj[n]||[]).map(x=>m[x]).filter(v=>v!=null));
    let pick=null;
    for(let k=0;k<HUES.length;k++){                 // start from the hash so a
      const h=HUES[(idx(n,HUES.length)+k)%HUES.length];   // name keeps its
      if(!taken.has(h)){pick=h;break;}              // colour between builds
    }
    m[n]=pick!=null?pick:HUES[idx(n,HUES.length)];
  });
  return m;
}
const assign=(names)=>{const m={},used=new Set();names.forEach(n=>{let i=idx(n,HUES.length),g=0;
  while(used.has(i)&&g<HUES.length){i=(i+7)%HUES.length;g++;}used.add(i);m[n]=HUES[i];});return m;};

/* Neighbour lists from the drawn geometry: two states are adjacent if their
   bounding boxes overlap and their outlines come within ~0.35 degrees. */
function buildAdjacency(items){
  const bb=it=>{let a=1e9,b=1e9,c=-1e9,d=-1e9;
    eachRing(it.geom,r=>r.forEach(p=>{if(p[0]<a)a=p[0];if(p[1]<b)b=p[1];if(p[0]>c)c=p[0];if(p[1]>d)d=p[1];}));
    return [a,b,c,d];};
  const pts=it=>{const o=[];eachRing(it.geom,r=>{for(let i=0;i<r.length;i+=3)o.push(r[i]);});return o;};
  const meta=items.map(it=>({name:it.name,box:bb(it),pts:pts(it)}));
  const adj={};
  meta.forEach(m=>adj[m.name]=[]);
  const PAD=0.35, P2=PAD*PAD;
  for(let i=0;i<meta.length;i++) for(let j=i+1;j<meta.length;j++){
    const A=meta[i],B=meta[j];
    if(A.box[2]+PAD<B.box[0]||B.box[2]+PAD<A.box[0]
       ||A.box[3]+PAD<B.box[1]||B.box[3]+PAD<A.box[1]) continue;
    let touch=false;
    for(const p of A.pts){ for(const q of B.pts){
      const dx=p[0]-q[0], dy=p[1]-q[1];
      if(dx*dx+dy*dy<P2){touch=true;break;} } if(touch)break; }
    if(touch){adj[A.name].push(B.name);adj[B.name].push(A.name);}
  }
  return adj;
}
const ST_ADJ=buildAdjacency(D.states.filter(s=>s.geom));
const ST_H=assignAdjacent(D.states.map(s=>s.name).sort(),ST_ADJ);
const RO_H=assign(D.ros.map(r=>r.name).sort());
const PIU_H={}; D.ros.forEach(r=>{const b=RO_H[r.name]||200;
  r.pius.forEach((p,i)=>{PIU_H[p]=(b+((i%2?1:-1)*(9+Math.floor(i/2)*11))+360)%360;});});
const dark=()=>{const t=document.documentElement.getAttribute('data-theme');
  return t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches);};
const fill=h=>dark()?`hsl(${h} 42% 34%)`:`hsl(${h} 46% 76%)`;
const fillHi=h=>dark()?`hsl(${h} 55% 45%)`:`hsl(${h} 58% 66%)`;
const solid=h=>dark()?`hsl(${h} 60% 58%)`:`hsl(${h} 52% 44%)`;
/* Border in the territory's own hue, dark enough to separate neighbours. */
const edge=h=>dark()?`hsl(${h} 55% 62%)`:`hsl(${h} 62% 30%)`;
const hueOf=(kind,name)=>kind==='state'?ST_H[name]:kind==='ro'?RO_H[name]:PIU_H[name]!=null?PIU_H[name]:200;

/* ---------- indexes ---------- */
const ROS={},PIUS={},STATES={};
D.ros.forEach(r=>ROS[r.name]=r); D.pius.forEach(p=>PIUS[p.name]=p); D.states.forEach(s=>STATES[s.name]=s);
const P_BY_PIU={},P_BY_RO={},P_BY_STATE={};
D.projects.forEach(p=>{
  (P_BY_PIU[p.piu_name]=P_BY_PIU[p.piu_name]||[]).push(p);
  (P_BY_RO[p.region_name]=P_BY_RO[p.region_name]||[]).push(p);
  (P_BY_STATE[p.state_name]=P_BY_STATE[p.state_name]||[]).push(p);
});
// PIUs actually reachable from an RO (project evidence + master)
const RO_PIUS={};
D.ros.forEach(r=>{const s=new Set(r.pius);(P_BY_RO[r.name]||[]).forEach(p=>p.piu_name&&s.add(p.piu_name));
  RO_PIUS[r.name]=[...s].filter(n=>PIUS[n]).sort();});
const ST_ROS={};
D.states.forEach(s=>{const m=new Set(s.ros);(P_BY_STATE[s.name]||[]).forEach(p=>p.region_name&&m.add(p.region_name));
  ST_ROS[s.name]=[...m].filter(n=>ROS[n]).sort();});
/* A state groups the ROs based in it. An RO headquartered elsewhere that happens
   to run a corridor across the border is a visitor: listed, but its portfolio
   belongs to its own state's total, not this one's. */
const ST_HOME_ROS={}, ST_VISIT_ROS={};
D.states.forEach(s=>{
  const home=[], visit=[];
  ST_ROS[s.name].forEach(n=>{
    ((ROS[n]||{}).home_state===s.name?home:visit).push(n);
  });
  // 14 states have no RO of their own (Goa, Ladakh, the NE states, the UTs).
  // They keep an empty home list: inheriting RO-Mumbai's 45 Maharashtra
  // projects as "Goa" would be plainly wrong.
  ST_HOME_ROS[s.name]=home;
  ST_VISIT_ROS[s.name]=visit;
});

/* ---------- projection ---------- */
const cv=$('#map'),ctx=cv.getContext('2d');
let W=0,H=0,DPR=1,scale=1,tx=0,ty=0,fitS=1,fitX=0,fitY=0;
const LON0=68.1,LON1=97.5,LAT0=6.7,LAT1=37.2;
const MLAT=l=>Math.log(Math.tan(Math.PI/4+l*Math.PI/360))*180/Math.PI;
const my0=MLAT(LAT0),my1=MLAT(LAT1);
function fit(){
  const w=W/DPR,h=H/DPR,pad=26;
  const sx=(w-pad*2)/(LON1-LON0), sy=(h-pad*2)/(my1-my0);
  fitS=Math.min(sx,sy);
  fitX=(w-(LON1-LON0)*fitS)/2; fitY=(h-(my1-my0)*fitS)/2;
}
const px=lon=>fitX+(lon-LON0)*fitS*scale+tx;
const py=lat=>fitY+(my1-MLAT(lat))*fitS*scale+ty;

function resize(){
  DPR=Math.min(devicePixelRatio||1,2);
  const r=cv.parentElement.getBoundingClientRect();
  const w=Math.max(r.width||0,320), h=Math.max(r.height||0,320);
  const nW=Math.round(w*DPR), nH=Math.round(h*DPR);
  const changed=(nW!==W||nH!==H);
  W=nW; H=nH;
  cv.width=W;cv.height=H;
  ctx.setTransform(DPR,0,0,DPR,0,0); fit();
  // fit() rebuilds fitS/fitX/fitY, so a camera set for the old canvas now aims
  // somewhere else. Re-frame the level instead of drawing a stale view (this is
  // why an RO opened before fonts settled appeared far off-centre).
  if(changed && !resize._first) refit(0);
  resize._first=false;
  draw();
}
/* Frame whatever the current level should show. ms=0 snaps without animating. */
function refit(ms=520){
  const f=currentFeatures();
  if(view.level==='india'){ anim(1,0,0,ms); return; }
  if(view.level==='project'){
    const p=D.projects.find(x=>x.upc===view.project);
    if(p&&p.lat!=null){ const w=W/DPR,h=H/DPR,ns=Math.min(Math.max(scale,7),9);
      const cx=fitX+(p.lon-LON0)*fitS*ns, cy=fitY+(my1-MLAT(p.lat))*fitS*ns;
      anim(ns,w/2-cx,h/2-cy,ms); return; }
  }
  // The state view is scoped to the state, so frame the state outline itself —
  // framing the RO slices would drift when one barely clips the border.
  // Small states (Delhi, Goa, Puducherry) need a much higher ceiling than big
  // ones or they sit as a speck in the middle of their neighbours.
  if(view.level==='state'&&STATES[view.state]&&STATES[view.state].geom){
    // ...unless an office drawn for this state sits outside it. Goa's only RO is
    // RO-Mumbai, now highlighted over in Maharashtra; framing Goa alone would leave
    // the one thing the view is about off-screen. Widen to take both in.
    const away=f.filter(x=>x.away&&x.geom);
    const g=away.length?unionBox([{geom:STATES[view.state].geom},...away]):STATES[view.state].geom;
    const [a,b,c,d2]=bbox(g);
    const span=Math.max(c-a,d2-b);
    const cap=span<1.2?26:span<3?14:6;
    flyTo(g,ms,cap); return; }
  if(f.length) flyTo(unionBox(f),ms); else draw();
}

/* ---------- geometry helpers ---------- */
function eachRing(g,fn){ if(!g)return;
  const c=g.coordinates;
  if(g.type==='Polygon') c.forEach(fn);
  else if(g.type==='MultiPolygon') c.forEach(poly=>poly.forEach(fn));
}
function path(g){ ctx.beginPath();
  eachRing(g,ring=>{ for(let i=0;i<ring.length;i++){const x=px(ring[i][0]),y=py(ring[i][1]);
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.closePath(); });
}
function bbox(g){let a=1e9,b=1e9,c=-1e9,d=-1e9;
  eachRing(g,r=>r.forEach(p=>{if(p[0]<a)a=p[0];if(p[1]<b)b=p[1];if(p[0]>c)c=p[0];if(p[1]>d)d=p[1];}));
  return [a,b,c,d];}
function centroid(g){ // largest ring's area centroid
  let best=null,bA=-1;
  eachRing(g,r=>{let A=0,X=0,Y=0;
    for(let i=0,j=r.length-1;i<r.length;j=i++){const f=r[j][0]*r[i][1]-r[i][0]*r[j][1];
      A+=f;X+=(r[j][0]+r[i][0])*f;Y+=(r[j][1]+r[i][1])*f;}
    A*=.5; if(Math.abs(A)>bA){bA=Math.abs(A);best=A?[X/(6*A),Y/(6*A)]:r[0];}});
  return best;}
function inRing(r,x,y){let ins=false;
  for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) ins=!ins;}
  return ins;}
function hit(g,x,y){ if(!g)return false;
  const c=g.coordinates;
  const test=poly=>{ if(!inRing(poly[0],x,y))return false;
    for(let i=1;i<poly.length;i++) if(inRing(poly[i],x,y)) return false; return true;};
  if(g.type==='Polygon') return test(c);
  for(const poly of c) if(test(poly)) return true;
  return false;}

/* ---------- state ---------- */
let view={level:'india',state:null,ro:null,piu:null,project:null};
let hover=null, feats=[], zoomTarget=null;
let previewHome=null, previewTimer=null;   // row-hover camera preview
let labelHits=[];                          // on-screen label boxes, for clicks

function currentFeatures(){
  if(view.level==='india') return D.states.filter(s=>s.geom).map(s=>({kind:'state',name:s.name,geom:s.geom,d:s}));
  if(view.level==='state'){
    // Stay inside the state the user picked. Each RO is drawn as its slice of
    // THIS state only (D.ro_by_state), so opening Goa shows Goa's outline
    // labelled RO-Mumbai rather than the whole Mumbai territory, and Delhi
    // shows Delhi rather than RO-Delhi's reach across Haryana and UP.
    const slices=(D.ro_by_state&&D.ro_by_state[view.state])||{};
    let names=Object.keys(slices);
    if(!names.length){
      let list=(ST_HOME_ROS[view.state]||[]);
      if(!list.length) list=(ST_VISIT_ROS[view.state]||[]);
      if(!list.length){const a=STATES[view.state]; if(a&&a.admin_ro) list=[a.admin_ro];}
      return list.map(n=>ROS[n]).filter(r=>r&&r.geom)
        .map(r=>({kind:'ro',name:r.name,geom:r.geom,d:r}));
    }
    // biggest slice first so small ones stay clickable on top
    names.sort((a,b)=>((P_BY_STATE[view.state]||[]).filter(p=>p.region_name===b).length)
                     -((P_BY_STATE[view.state]||[]).filter(p=>p.region_name===a).length));
    // An office is shown where it SITS, not where its work happens.
    //
    // The slice above is the RO's footprint clipped to the state being viewed, which is
    // right for an RO based here: RO-Mumbai in Maharashtra should read as its Maharashtra
    // half, not as its whole reach. It is wrong for a visiting office. Goa has no RO of
    // its own -- RO-Mumbai administers its one project from Maharashtra -- and slicing
    // painted Goa's own outline and labelled it "RO-Mumbai", so the map claimed an office
    // in Goa that does not exist there. Opening Goa now leaves RO-Mumbai highlighted in
    // Maharashtra where it actually is, and Goa's project still plots in Goa.
    return names.filter(n=>ROS[n]).map(n=>{
      const away=(ROS[n].home_state&&ROS[n].home_state!==view.state);
      return {kind:'ro',name:n,geom:(away&&ROS[n].geom)?ROS[n].geom:slices[n],d:ROS[n],away};
    });
  }
  if(view.level==='ro'){
    return RO_PIUS[view.ro].map(n=>PIUS[n]).filter(p=>p&&p.geom)
      .map(p=>({kind:'piu',name:p.name,geom:p.geom,d:p}));
  }
  if(view.level==='piu'||view.level==='project'){
    const p=PIUS[view.piu];
    return p&&p.geom?[{kind:'piu',name:p.name,geom:p.geom,d:p}]:[];
  }
  return [];
}
function visibleProjects(){
  if(view.level==='india') return [];
  if(view.level==='state'){
    // Which projects belong to a state depends on whether an RO is based here.
    //
    //   Delhi  -- RO-Delhi is headquartered here, so the state stands for that
    //             office: show all 49 of its projects, including the ones that
    //             run into Haryana, UP and Rajasthan.
    //   Goa    -- no RO is based here; RO-Mumbai administers it from
    //             Maharashtra. Showing RO-Mumbai's whole portfolio would flood
    //             Goa with Maharashtra work, so show only Goa's own project.
    //
    // The boundary stays the state either way; only the project set differs.
    const home=ST_HOME_ROS[view.state]||[];
    if(!home.length) return P_BY_STATE[view.state]||[];
    const seen=new Set(), out=[];
    home.forEach(rn=>(P_BY_RO[rn]||[]).forEach(p=>{
      if(!seen.has(p.upc)){seen.add(p.upc);out.push(p);}
    }));
    // plus any visiting office's work that physically sits in this state
    (P_BY_STATE[view.state]||[]).forEach(p=>{
      if(!seen.has(p.upc)){seen.add(p.upc);out.push(p);}
    });
    return out;
  }
  if(view.level==='ro') return P_BY_RO[view.ro]||[];
  return P_BY_PIU[view.piu]||[];
}

/* ---------- camera ---------- */
function flyTo(g,ms=520,maxScale=14){
  if(!g){scale=1;tx=ty=0;return;}
  const [a,b,c,d]=bbox(g), w=W/DPR,h=H/DPR,pad=64;
  const gw=(c-a)*fitS, gh=(MLAT(d)-MLAT(b))*fitS;
  const ns=Math.min((w-pad*2)/Math.max(gw,.001),(h-pad*2)/Math.max(gh,.001),maxScale);
  const cx=fitX+((a+c)/2-LON0)*fitS*ns, cy=fitY+(my1-(MLAT(b)+MLAT(d))/2)*fitS*ns;
  anim(ns, w/2-cx, h/2-cy, ms);
}
function anim(ns,nx,ny,ms){
  if(!(ns>0)) return;                      // never tween to a bad scale
  anim.target={scale:ns,tx:nx,ty:ny};      // where this tween ends
  const s0=scale,x0=tx,y0=ty;
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){scale=ns;tx=nx;ty=ny;draw();return;}
  cancelAnimationFrame(anim._r);
  // Take t0 from the first rAF callback, not performance.now(): rAF timestamps
  // are document-relative, so mixing the two clocks makes k negative and the
  // eased value explode.
  let t0=null;
  anim._r=requestAnimationFrame(function step(t){
    if(t0===null) t0=t;
    const k=ms>0?Math.min(Math.max((t-t0)/ms,0),1):1;
    const e=1-Math.pow(1-k,3);
    scale=s0+(ns-s0)*e; tx=x0+(nx-x0)*e; ty=y0+(ny-y0)*e; draw();
    if(k<1) anim._r=requestAnimationFrame(step);
  });
}

/* ---------- draw ---------- */
function draw(){
  const w=W/DPR,h=H/DPR;
  const cs=getComputedStyle(document.documentElement);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle=cs.getPropertyValue('--sea').trim(); ctx.fillRect(0,0,w,h);

  // India landmass
  ctx.save(); path(D.outline);
  ctx.fillStyle=cs.getPropertyValue('--land').trim(); ctx.fill('evenodd');
  ctx.clip('evenodd');

  feats=currentFeatures();
  const line=cs.getPropertyValue('--line-2').trim();

  // Context: states we are not drilled into keep their normal colour, muted so
  // the active one reads as the subject rather than the only thing on the map.
  if(view.level!=='india'){
    // Each surrounding state keeps its own hue and gets a visible border, so
    // neighbours read as separate territories instead of one wash.
    D.states.forEach(st=>{
      if(!st.geom) return;
      const hu=ST_H[st.name], act=st.name===view.state;
      // At state level the RO slices ARE this state, drawn on top; painting the
      // state underneath leaves its edge peeking out where a slice falls a
      // fraction short of the border.
      //
      // ...but only when something is actually drawn over it. For a state whose
      // office sits elsewhere (Mizoram -> RO-Guwahati in Assam) the features are
      // over THERE, so skipping the wash left the state the user just clicked
      // unpainted while a fill appeared in another state entirely -- the map read
      // as if RO-Guwahati were drawn on Mizoram. Paint it here, and mark it active
      // so it still reads as the subject.
      const coveredHere=feats.some(f=>!f.away);
      if(act&&view.level==='state'&&coveredHere) return;
      path(st.geom);
      ctx.globalAlpha=.5;
      ctx.fillStyle=fill(hu); ctx.fill('evenodd');
      ctx.globalAlpha=act?1:.85;
      ctx.strokeStyle=edge(hu);
      ctx.lineWidth=act?1.6:1.1; ctx.stroke();
      ctx.globalAlpha=1;
    });
    // Below an RO, the rest of its own state would otherwise sit white where the
    // sibling RO's territory is; paint the parent's ROs so the gap reads as map.
    if(view.level!=='state'&&view.state){
      ctx.globalAlpha=.26;                       // quieter than the active PIUs
      (ST_HOME_ROS[view.state]||[]).forEach(rn=>{
        const r=ROS[rn]; if(!r||!r.geom||rn===view.ro) return;
        path(r.geom);
        ctx.fillStyle=fill(RO_H[rn]); ctx.fill('evenodd');
        ctx.strokeStyle=line; ctx.lineWidth=.7; ctx.stroke();
      });
      ctx.globalAlpha=1;
    }
  }

  feats.forEach(f=>{
    const adm=f.kind==='state'&&f.d&&f.d.admin_only;
    const hu=adm?hueOf('ro',f.d.admin_ro):hueOf(f.kind,f.name);
    const on=hover&&hover.name===f.name&&hover.kind===f.kind;
    path(f.geom);
    ctx.globalAlpha=adm?.42:1;
    ctx.fillStyle=on?fillHi(hu):fill(hu); ctx.fill('evenodd'); ctx.globalAlpha=1;
    ctx.strokeStyle=on?solid(hu):edge(hu); ctx.lineWidth=on?2.2:1.2; ctx.stroke();
  });
  ctx.restore();

  // outline on top
  ctx.save(); path(D.outline);
  ctx.strokeStyle=dark()?'rgba(236,238,241,.5)':'rgba(27,31,38,.45)';
  ctx.lineWidth=1.1; ctx.stroke(); ctx.restore();

  // project dots
  const ink=cs.getPropertyValue('--ink').trim();
  const pr=visibleProjects();
  if(pr.length){
    pr.forEach(p=>{
      if(p.lat==null)return;
      const x=px(p.lon),y=py(p.lat);
      if(x<-20||y<-20||x>w+20||y>h+20)return;
      const sel=view.project&&view.project===p.upc;
      const hu=hueOf(view.level==='state'?'ro':'piu', view.level==='state'?p.region_name:p.piu_name);
      if(p.elat!=null&&p.elon!=null&&scale>1.4){
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(px(p.elon),py(p.elat));
        ctx.strokeStyle=solid(hu);ctx.lineWidth=sel?2.6:1.4;ctx.globalAlpha=.75;ctx.stroke();ctx.globalAlpha=1;
      }
      const r=sel?6:(p.geo_src==='piu'?2.6:3.6);
      ctx.beginPath();ctx.arc(x,y,r,0,7);
      ctx.fillStyle=solid(hu); ctx.globalAlpha=p.geo_src==='piu'?.5:1; ctx.fill(); ctx.globalAlpha=1;
      ctx.lineWidth=sel?2:1; ctx.strokeStyle=sel?ink:(dark()?'rgba(0,0,0,.45)':'rgba(255,255,255,.85)');
      ctx.stroke();
    });
  }

  // labels
  labelHits=[];
  if(feats.length<=60){
    ctx.font='600 11px "Public Sans",system-ui,sans-serif';
    ctx.textBaseline='middle';

    // Union Territories are small enough that an inside label never fits well,
    // and abbreviating them ("DNH & DD") loses the name. They always get a
    // leader-line callout carrying the full name.
    const ALWAYS_CALLOUT=new Set(['Andaman and Nicobar','Chandigarh',
      'Dadra and Nagar Haveli and Daman and Diu','Lakshadweep','Puducherry']);
    // Long names that will not fit a small shape get a shorter *real* name
    // rather than an initialism, so the label still reads as the place.
    const TRIM={'Dadra and Nagar Haveli and Daman and Diu':'Daman & Diu',
      'Andaman and Nicobar':'Andaman & Nicobar'};

    /*
     * Coastal states are named out at sea, with the leader pointing back to
     * the shape -- an inline name on a narrow coastal strip reads as if it
     * belongs to the larger neighbour behind it ("Goa" sat against Karnataka,
     * "Andhra Pradesh" over its own border).
     *
     * This is an explicit list rather than a geometric test: `D.outline` is
     * India only, so probing outward cannot tell the Arabian Sea from
     * Pakistan, and every land-border state (Tripura, Sikkim, J&K) came back
     * looking coastal. The coastline does not change, so a list is both
     * accurate and cheap.
     *
     * Landlocked states keep their inline labels -- they have no sea to be
     * moved to, and a leader into the interior would cross other states.
     */
    const COASTAL=new Set(['Andhra Pradesh','Goa','Gujarat','Karnataka','Kerala',
      'Maharashtra','Odisha','Tamil Nadu','West Bengal']);

    // Pass 1: decide inline vs. callout, measuring the FULL name in both cases.
    const inline=[], callout=[];
    feats.forEach(f=>{
      const c=centroid(f.geom); if(!c) return;
      const x=px(c[0]), y=py(c[1]);
      if(x<-60||y<-60||x>w+60||y>h+60) return;
      const [a,b,cc,dd]=bbox(f.geom);
      const bw=(cc-a)*fitS*scale, bh=(MLAT(dd)-MLAT(b))*fitS*scale;
      let t=f.kind==='ro'?roLabel(f.name):f.kind==='piu'?piuLabel(f.name):f.name;
      const forced=f.kind==='state'&&(ALWAYS_CALLOUT.has(f.name)||COASTAL.has(f.name));
      if(forced && TRIM[f.name]) t=TRIM[f.name];
      const tw=ctx.measureText(t).width;
      if(!forced && tw<=bw-6 && bh>=13) inline.push({f,x,y,t,tw});
      else callout.push({f,x,y,t,tw,r:Math.max(bw,bh)/2});
    });

    // The legend, hint pill and zoom buttons float over the canvas; seed them
    // as occupied so a label is never placed underneath one.
    const placed=[];
    const stageBox=cv.getBoundingClientRect();
    ['#legend','#hint','.zoomer'].forEach(sel=>{
      const el=document.querySelector(sel);
      if(!el||el.hidden) return;
      const r=el.getBoundingClientRect();
      if(!r.width) return;
      placed.push({x1:r.left-stageBox.left-6,y1:r.top-stageBox.top-6,
                   x2:r.right-stageBox.left+6,y2:r.bottom-stageBox.top+6});
    });
    const clash=q=>placed.some(p=>!(q.x2<p.x1||q.x1>p.x2||q.y2<p.y1||q.y1>p.y2));

    /*
     * Leader lines are obstacles too.
     *
     * `placed` only ever held label boxes, so a later callout could route its
     * leader straight through an earlier label, and two leaders could cross --
     * the "Tamil Nadu --- Puducherry" line ran through its neighbours. Each
     * drawn leader is recorded here and tested against both the candidate box
     * and the candidate leader.
     */
    const leaders=[];
    // Segment/rectangle intersection: cheap reject on the segment's own bbox,
    // then a standard slab clip against the rectangle.
    const segBox=(x1,y1,x2,y2,b)=>{
      if(Math.max(x1,x2)<b.x1||Math.min(x1,x2)>b.x2||
         Math.max(y1,y2)<b.y1||Math.min(y1,y2)>b.y2) return false;
      const dx=x2-x1, dy=y2-y1;
      let t0=0,t1=1;
      for(const [p,q] of [[-dx,x1-b.x1],[dx,b.x2-x1],[-dy,y1-b.y1],[dy,b.y2-y1]]){
        if(p===0){ if(q<0) return false; continue; }
        const r=q/p;
        if(p<0){ if(r>t1) return false; if(r>t0) t0=r; }
        else   { if(r<t0) return false; if(r<t1) t1=r; }
      }
      return true;
    };
    const segSeg=(a,b,c,d,e,f,g,hh)=>{
      const d1=(g-e)*(b-f)-(hh-f)*(a-e), d2=(g-e)*(d-f)-(hh-f)*(c-e);
      const d3=(c-a)*(f-b)-(d-b)*(e-a),  d4=(c-a)*(hh-b)-(d-b)*(g-a);
      return ((d1>0)!==(d2>0))&&((d3>0)!==(d4>0));
    };
    // A candidate leader must not cross a placed label box or an existing leader.
    const leaderClash=(x1,y1,x2,y2)=>
      placed.some(p=>segBox(x1,y1,x2,y2,p))||
      leaders.some(L=>segSeg(x1,y1,x2,y2,L.x1,L.y1,L.x2,L.y2));
    // A candidate label box must not sit on top of an already-drawn leader.
    const boxOnLeader=q=>leaders.some(L=>segBox(L.x1,L.y1,L.x2,L.y2,q));
    const paint=(t,x,y)=>{
      ctx.lineWidth=3.2; ctx.strokeStyle=dark()?'rgba(20,23,28,.85)':'rgba(255,255,255,.9)';
      ctx.strokeText(t,x,y); ctx.fillStyle=ink; ctx.fillText(t,x,y);
    };
    // remember where each label landed so a click can target it
    const noteHit=(f,x1,y1,x2,y2)=>labelHits.push({f,x1,y1,x2,y2});

    // Pass 2: inline labels first -- they own the space they sit in.
    ctx.textAlign='center';
    inline.forEach(o=>{
      const box={x1:o.x-o.tw/2-2,y1:o.y-7,x2:o.x+o.tw/2+2,y2:o.y+7};
      if(clash(box)||boxOnLeader(box)){ callout.push({...o,r:o.r!=null?o.r:8}); return; }  // retry outside
      placed.push(box); paint(o.t,o.x,o.y);
      noteHit(o.f,box.x1,box.y1,box.x2,box.y2);
    });

    // Pass 3: callouts. Try 8 directions at growing distance; take the first
    // slot on-canvas that collides with nothing already drawn. Offshore
    // territories (Lakshadweep, A&N) need a long lead to clear the coastline.
    // horizontal first: a level leader reads cleanly and rarely crosses another
    const DIRS=[[1,0],[-1,0],[1,-1],[-1,-1],[1,1],[-1,1],[0,-1],[0,1]];
    // Small coastal/offshore territories must land in open space, not on top of
    // a big neighbour: DNH & DD sat inside Maharashtra, Lakshadweep on Kerala.
    // Preferred callout direction -- all four go out to sea, away from the
    // mainland labels they would otherwise sit on top of.
    const SEAWARD={'Lakshadweep':[-1,0],'Andaman and Nicobar':[1,0],
      'Puducherry':[1,0],'Dadra and Nagar Haveli and Daman and Diu':[-1,0]};
    const OVERLAND=new Set();

    /*
     * A called-out state is named OUTSIDE the landmass, with the leader
     * pointing back in.
     *
     * Only the four SEAWARD territories were ever required to clear the coast.
     * Every other callout took the first slot that missed other labels, which
     * for a small state meant landing on a neighbour -- "Goa" sat inside
     * Karnataka and "Andhra Pradesh" inside its own neighbour, so the name read
     * as a label for the wrong territory. Requiring open water for all of them
     * makes the leader do the work of pointing, which is what it is for.
     *
     * Land is sampled at the anchor and at both ends of the text, since a long
     * name can clear the coast at its anchor and still overhang the shore.
     */
    const onLand=(lx,ly,x1,x2)=>{
      for(const sx of [lx,x1,x2,(x1+x2)/2]){
        const g=toGeo(sx,ly);
        if(hit(D.outline,g[0],g[1])) return true;
      }
      return false;
    };
    const lineCol=dark()?'rgba(236,238,241,.6)':'rgba(27,31,38,.5)';
    callout.forEach(o=>{
      let best=null;
      const pref=SEAWARD[o.f.name];
      // An offshore label prefers its own latitude so the leader never cuts
      // across the mainland, but may drift vertically if that slot is taken
      // (the legend occupies the sea west of Lakshadweep).
      // Offshore labels stay on their own latitude (or drift slightly) so the
      // leader never cuts across the mainland. The legend sits top-left to
      // leave this water free.
      const dirs=pref?[pref,[pref[0],-1],[pref[0],1]]:DIRS;
      /* A state has to reach past the coastline, which can be far from its
         centroid, so its ladder runs much further out than a UT's. */
      const seaward=!pref&&o.f.kind==='state';
      const steps=pref?(OVERLAND.has(o.f.name)?[52,70,90,112,136]:[16,26,38,52])
                : seaward?[18,30,44,60,78,98,120,145,175,210,250,295]
                      :[8,13,19,26,35,46];
      for(const step of steps){
        for(const [dx,dy] of dirs){
          const lead=o.r+step;
          const lx=o.x+dx*lead, ly=o.y+dy*lead;
          const right=dx>=0;
          const tx0=lx+(right?5:-5);
          const x1=right?tx0:tx0-o.tw, x2=right?tx0+o.tw:tx0;
          if(x1<3||x2>w-3||ly<9||ly>h-9) continue;
          const padY=OVERLAND.has(o.f.name)?13:7;
          const box={x1:x1-2,y1:ly-padY,x2:x2+2,y2:ly+padY};
          if(clash(box)||boxOnLeader(box)) continue;
          // an offshore/coastal territory must not have its label dumped back
          // on the mainland: require open water at the label anchor
          if(pref&&!OVERLAND.has(o.f.name)){
            const g=toGeo(lx,ly);
            if(hit(D.outline,g[0],g[1])) continue;
          }
          // a called-out state is named outside India, never on a neighbour
          if(seaward&&onLand(lx,ly,x1,x2)) continue;
          // the leader must not cut through another label or another leader
          if(leaderClash(o.x,o.y,lx,ly)) continue;
          best={lx,ly,tx0,right,box}; break;
        }
        if(best) break;
      }
      if(!best&&seaward){
        /*
         * Nothing offshore was free. Relax in the order that costs the reader
         * least: first allow the leader to cross another leader (a crossing
         * line is still readable), and only then allow the name back over
         * land. Keeping the water requirement one step longer is what stops
         * "Goa" landing inside Karnataka.
         */
        for(const allowLand of [false,true]){
          for(const step of [18,30,44,60,78,98,120,145,175,210,250,295]){
            for(const [dx,dy] of DIRS){
              const lead=o.r+step;
              const lx=o.x+dx*lead, ly=o.y+dy*lead;
              const right=dx>=0;
              const tx0=lx+(right?5:-5);
              const x1=right?tx0:tx0-o.tw, x2=right?tx0+o.tw:tx0;
              if(x1<3||x2>w-3||ly<9||ly>h-9) continue;
              const box={x1:x1-2,y1:ly-7,x2:x2+2,y2:ly+7};
              if(clash(box)||boxOnLeader(box)) continue;
              if(!allowLand&&onLand(lx,ly,x1,x2)) continue;
              best={lx,ly,tx0,right,box}; break;
            }
            if(best) break;
          }
          if(best) break;
        }
      }
      if(!best){
        // No clean slot. Rather than leave the territory unnamed, take the
        // first on-canvas position to its right and accept the overlap.
        const rr=Number.isFinite(o.r)?o.r:8;
        const lx=o.x+rr+14, ly=o.y;
        if(lx+o.tw+8>w-3||ly<9||ly>h-9) return;
        best={lx,ly,tx0:lx+5,right:true,
              box:{x1:lx+3,y1:ly-7,x2:lx+5+o.tw+2,y2:ly+7}};
      }
      placed.push(best.box);
      leaders.push({x1:o.x,y1:o.y,x2:best.lx,y2:best.ly});
      // The leader starts at the territory's centre, so the line always points
      // at the shape it names rather than grazing its edge.
      ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(best.lx,best.ly);
      ctx.strokeStyle=lineCol; ctx.lineWidth=1; ctx.stroke();
      ctx.beginPath(); ctx.arc(o.x,o.y,2.1,0,7); ctx.fillStyle=lineCol; ctx.fill();
      ctx.textAlign=best.right?'left':'right';
      paint(o.t,best.tx0,best.ly);
      ctx.textAlign='center';
      noteHit(o.f,best.box.x1,best.box.y1,best.box.x2,best.box.y2);
    });
  }
}

/* ---------- interaction ---------- */
function toGeo(cx,cy){
  const lon=(cx-tx-fitX)/(fitS*scale)+LON0;
  const myv=my1-(cy-ty-fitY)/(fitS*scale);
  const lat=(Math.atan(Math.exp(myv*Math.PI/180))-Math.PI/4)*360/Math.PI;
  return [lon,lat];
}
function pick(cx,cy){
  const [lon,lat]=toGeo(cx,cy);
  for(let i=feats.length-1;i>=0;i--) if(hit(feats[i].geom,lon,lat)) return feats[i];
  return null;
}
function pickLabel(cx,cy){
  for(let i=labelHits.length-1;i>=0;i--){
    const b=labelHits[i];
    if(cx>=b.x1-3&&cx<=b.x2+3&&cy>=b.y1-3&&cy<=b.y2+3) return b.f;
  }
  return null;
}
function pickProject(cx,cy){
  const pr=visibleProjects(); let best=null,bd=13;
  pr.forEach(p=>{ if(p.lat==null)return;
    const d=Math.hypot(px(p.lon)-cx,py(p.lat)-cy); if(d<bd){bd=d;best=p;} });
  return best;
}

const tip=$('#tip');
function showTip(html,x,y){
  tip.innerHTML=html; tip.classList.add('on'); tip.setAttribute('aria-hidden','false');
  const r=tip.getBoundingClientRect();
  let l=x+16,t=y+16;
  if(l+r.width>innerWidth-10) l=x-r.width-16;
  if(t+r.height>innerHeight-10) t=y-r.height-16;
  tip.style.left=Math.max(8,l)+'px'; tip.style.top=Math.max(8,t)+'px';
}
const hideTip=()=>{tip.classList.remove('on');tip.setAttribute('aria-hidden','true');};
const num=n=>n==null?'—':n.toLocaleString('en-IN');
const km=n=>n==null?'—':n.toLocaleString('en-IN',{maximumFractionDigits:0})+' km';
const cr=n=>!n?'—':'₹'+(n>=1e5?(n/1e5).toFixed(2)+' L Cr':n.toLocaleString('en-IN',{maximumFractionDigits:0})+' Cr');

function tipFor(f){
  const d=f.d,hu=hueOf(f.kind,f.name);
  const kind=f.kind==='state'?'State':f.kind==='ro'?'Regional Office':'Project Implementation Unit';
  const disp=f.kind==='ro'?roLabel(f.name):f.kind==='piu'?piuLabel(f.name):f.name;
  let rows=`<dt>Projects</dt><dd>${num(d.n)}</dd><dt>Length</dt><dd>${km(d.km)}</dd><dt>Awarded</dt><dd>${cr(d.cost)}</dd>`;
  let foot='';
  if(f.kind==='state'){
    if(d.admin_only){ rows=`<dt>Projects</dt><dd>0</dd>`;
      foot='Administered by '+roLabel(d.admin_ro)+' — no projects on record'; }
    else { const n=ST_ROS[f.name].length;
      rows+=`<dt>Offices</dt><dd>${n}</dd>`; foot=ST_ROS[f.name].map(roLabel).join(' · '); } }
  if(f.kind==='ro'){
    if(view.level==='state'&&view.state){
      const based=(ST_HOME_ROS[view.state]||[]).indexOf(f.name)>=0;
      if(based){
        // The office is headquartered here, so the state stands for it: report
        // its whole portfolio, and name the spill if there is one.
        rows=`<dt>Projects</dt><dd>${num(d.n)}</dd><dt>Length</dt><dd>${km(d.km)}</dd>`+
             `<dt>Awarded</dt><dd>${cr(d.cost)}</dd><dt>PIUs</dt><dd>${RO_PIUS[f.name].length}</dd>`;
        const out=d.states.filter(x=>x.s!==view.state);
        foot=out.length
          ? 'Based here · also works in '+out.map(x=>x.s+' ('+x.n+')').join(', ')
          : (d.zone_name||'')+' · based here';
      } else {
        // Visiting office: only its work inside this state belongs to the view.
        const here=(P_BY_STATE[view.state]||[]).filter(p=>p.region_name===f.name);
        const hkm=here.reduce((a,p)=>a+(+p.length_km||0),0);
        const hcr=here.reduce((a,p)=>a+(+p.awarded_cost_cr||0),0);
        rows=`<dt>Projects here</dt><dd>${num(here.length)}</dd>`+
             `<dt>Length here</dt><dd>${km(hkm)}</dd>`+
             `<dt>Awarded here</dt><dd>${cr(hcr)}</dd>`;
        foot=roLabel(f.name)+' is based in '+(d.home_state||'another state')+
             ' · '+num(d.n)+' projects in total';
      }
    } else {
      rows+=`<dt>PIUs</dt><dd>${RO_PIUS[f.name].length}</dd>`;
      foot=(d.zone_name||'')+(d.states.length>1?' · works in '+d.states.length+' states':'');
    } }
  if(f.kind==='piu'){ rows+=`<dt>District</dt><dd>${d.district||'—'}</dd>`;
    foot=(d.ro?roLabel(d.ro):'')+(d.email?' · '+d.email:''); }
  return `<div class="t-h"><span class="dot" style="background:${solid(hu)}"></span>
    <span class="t-n">${esc(disp)}</span></div><div class="t-k">${kind}</div>
    <dl class="t-g">${rows}</dl>${foot?`<div class="t-f">${esc(foot)}</div>`:''}`;
}
function tipForProject(p){
  const hu=hueOf('piu',p.piu_name);
  const pp=p.physical_progress_pct!=null?(+p.physical_progress_pct):null;
  return `<div class="t-h"><span class="dot" style="background:${solid(hu)}"></span>
    <span class="t-n">${esc(p.upc)}</span></div><div class="t-k">${esc(p.nh_number||'Project')} · ${esc(p.mode||'')}</div>
    <div style="font-size:11.5px;color:var(--ink-2);line-height:1.4;margin-bottom:7px">${esc(trunc(p.project_name,120))}</div>
    <dl class="t-g"><dt>Length</dt><dd>${p.length_km?(+p.length_km).toFixed(1)+' km':'—'}</dd>
    <dt>Lanes</dt><dd>${p.number_of_lanes||p.lane_config||'—'}</dd>
    <dt>Awarded</dt><dd>${cr(p.awarded_cost_cr?+p.awarded_cost_cr:null)}</dd>
    <dt>Physical</dt><dd>${pp!=null?pp.toFixed(0)+'%':'—'}</dd></dl>
    <div class="t-f">${esc(piuLabel(p.piu_name))} · ${esc(roLabel(p.region_name))} · ${esc(p.state_name||'')}</div>`;
}
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const trunc=(s,n)=>{s=String(s||'');return s.length>n?s.slice(0,n-1)+'…':s;};

let drag=null;
cv.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,tx,ty,moved:0};
  cv.setPointerCapture(e.pointerId);cv.classList.add('drag');});
cv.addEventListener('pointermove',e=>{
  const r=cv.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top;
  if(drag){ const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    drag.moved=Math.max(drag.moved,Math.abs(dx)+Math.abs(dy));
    tx=drag.tx+dx; ty=drag.ty+dy; draw(); hideTip(); return; }
  const pj=pickProject(cx,cy);
  if(pj){ hover=null; draw(); showTip(tipForProject(pj),e.clientX,e.clientY); cv.style.cursor='pointer'; return; }
  const f=pickLabel(cx,cy)||pick(cx,cy);
  if(f){ if(!hover||hover.name!==f.name||hover.kind!==f.kind){hover=f;draw();}
    showTip(tipFor(f),e.clientX,e.clientY);
    cv.style.cursor=view.level==='piu'||view.level==='project'?'default':'pointer'; }
  else { if(hover){hover=null;draw();} hideTip(); cv.style.cursor='grab'; }
});
cv.addEventListener('pointerup',e=>{
  cv.classList.remove('drag');
  const moved=drag?drag.moved:99; drag=null;
  if(moved>4) return;
  const r=cv.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top;
  const pj=pickProject(cx,cy);
  if(pj){ go({level:'project',state:pj.state_name,ro:pj.region_name,piu:pj.piu_name,project:pj.upc}); return; }
  // a label is a target in its own right -- the only way to reach a territory
  // too small to click, and it works for the leader-line callouts too
  const f=pickLabel(cx,cy)||pick(cx,cy); if(!f)return;
  if(f.kind==='state'){
    // A state with no projects still opens as ITSELF. Jumping straight to the
    // administering RO used to blow the view open to that office's whole
    // territory -- clicking Tripura showed all of RO-Guwahati's North-East.
    go({level:'state',state:f.name});
  }
  else if(f.kind==='ro') go({level:'ro',state:view.state,ro:f.name});
  else if(f.kind==='piu'&&view.level==='ro') go({level:'piu',state:view.state,ro:view.ro,piu:f.name});
});
cv.addEventListener('pointerleave',()=>{hover=null;hideTip();draw();});
cv.addEventListener('wheel',e=>{
  e.preventDefault();
  const r=cv.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top;
  const k=Math.exp(-e.deltaY*.0016), ns=Math.min(Math.max(scale*k,.6),22);
  tx=cx-(cx-tx)*(ns/scale); ty=cy-(cy-ty)*(ns/scale); scale=ns; draw(); hideTip();
},{passive:false});
const zoomBy=k=>{const w=W/DPR/2,h=H/DPR/2,ns=Math.min(Math.max(scale*k,.6),22);
  tx=w-(w-tx)*(ns/scale);ty=h-(h-ty)*(ns/scale);scale=ns;draw();};
$('#zin').onclick=()=>zoomBy(1.45); $('#zout').onclick=()=>zoomBy(1/1.45);
$('#zfit').onclick=()=>{ const f=currentFeatures();
  if(view.level==='india'||!f.length) anim(1,0,0,420); else flyTo(unionBox(f)); };
function unionBox(fs){ let a=1e9,b=1e9,c=-1e9,d=-1e9;
  fs.forEach(f=>{const q=bbox(f.geom);a=Math.min(a,q[0]);b=Math.min(b,q[1]);c=Math.max(c,q[2]);d=Math.max(d,q[3]);});
  return {type:'Polygon',coordinates:[[[a,b],[c,b],[c,d],[a,d],[a,b]]]};}

/* ---------- navigation ---------- */
function go(v){
  view={level:v.level,state:v.state||null,ro:v.ro||null,piu:v.piu||null,project:v.project||null};
  hover=null; hideTip();
  if(previewTimer){clearTimeout(previewTimer);previewTimer=null;}
  previewHome=null;
  render();
  refit(480);
}
window.go=go;

/* ---------- chrome ---------- */
function renderCrumbs(){
  const c=[{lvl:'India',name:'All India',v:{level:'india'},hue:null}];
  if(view.state) c.push({lvl:'State',name:view.state,v:{level:'state',state:view.state},hue:ST_H[view.state]});
  if(view.ro) c.push({lvl:'RO',name:roLabel(view.ro),v:{level:'ro',state:view.state,ro:view.ro},hue:RO_H[view.ro]});
  if(view.piu) c.push({lvl:'PIU',name:piuLabel(view.piu),v:{level:'piu',state:view.state,ro:view.ro,piu:view.piu},hue:PIU_H[view.piu]});
  if(view.project) c.push({lvl:'Project',name:view.project,v:{level:'project',state:view.state,ro:view.ro,piu:view.piu,project:view.project},hue:null});
  $('#crumbs').innerHTML=c.map((b,i)=>{
    const cur=i===c.length-1;
    return (i?'<span class="sep">›</span>':'')+
      `<button class="crumb" ${cur?'aria-current="true"':''} data-i="${i}">
        ${b.hue!=null?`<span class="dot" style="background:${solid(b.hue)}"></span>`:''}
        <span class="lvl">${b.lvl}</span><span>${esc(b.name)}</span></button>`;}).join('');
  $('#crumbs').querySelectorAll('.crumb').forEach((el,i)=>el.onclick=()=>go(c[i].v));
}
function statTiles(items){ return items.map(s=>
  `<div class="stat"><div class="v">${s.v}</div><div class="l">${s.l}</div></div>`).join(''); }

function render(){
  renderCrumbs();
  const RH=$('#rail-h'),ST=$('#stats'),RB=$('#rail-body'),LG=$('#legend');
  const hint=$('#hint');

  if(view.level==='india'){
    const tot=D.projects.length, tkm=D.states.reduce((a,s)=>a+s.km,0);
    RH.innerHTML=`<div class="eyebrow">National Network</div>
      <h2>All India</h2><div class="meta">${D.states.length} states · ${D.ros.length} regional offices · ${D.pius.length} PIUs</div>`;
    ST.innerHTML=statTiles([{v:num(tot),l:'Projects'},{v:Math.round(tkm/1000)+'k',l:'Kilometres'},{v:D.ros.length,l:'Offices'}]);
    RB.innerHTML=`<div class="sec"><h3>States <span class="n">${D.states.length}</span></h3><div class="rows">`+
      D.states.slice().sort((a,b)=>b.n-a.n).map(s=>rowHTML('state',s.name,s.name,
        s.admin_only?roLabel(s.admin_ro):s.n+' proj')).join('')+`</div></div>`;
    bindRows(RB,n=>{const st=STATES[n];
      go({level:'state',state:n});});
    legend('States',D.states.slice().sort((a,b)=>b.n-a.n).map(s=>({n:s.name,
      h:s.admin_only?hueOf('ro',s.admin_ro):ST_H[s.name],c:s.admin_only?'—':s.n,
      v:{level:'state',state:s.name}})));
    hint.innerHTML='Click a <b>state</b> to see its regional offices';
  }

  else if(view.level==='state'){
    const s=STATES[view.state];
    const homeNames=ST_HOME_ROS[view.state]||[];
    const administered=!homeNames.length;         // no RO headquartered here
    let ros=homeNames.map(n=>ROS[n]).filter(Boolean);
    let visitors=(ST_VISIT_ROS[view.state]||[]).map(n=>ROS[n]).filter(Boolean);
    if(administered){ ros=visitors; visitors=[]; }
    // Figures follow the same rule as the map: an office based here brings its
    // whole portfolio; an office visiting from elsewhere contributes only the
    // work that physically sits in this state.
    const pool=visibleProjects();
    const inState=P_BY_STATE[view.state]||[];
    const isHome=rn=>homeNames.indexOf(rn)>=0;
    const countFor=rn=>isHome(rn)?(P_BY_RO[rn]||[]).length
                                 :inState.filter(p=>p.region_name===rn).length;
    const labelFor=rn=>isHome(rn)?countFor(rn)+' proj':countFor(rn)+' proj here';
    const hereCount=rn=>inState.filter(p=>p.region_name===rn).length;
    // every RO with work here, plus any based here even with none
    const workNames=[...new Set(inState.map(p=>p.region_name).filter(Boolean))];
    const allNames=[...new Set([...homeNames,...workNames,
      ...((STATES[view.state]&&STATES[view.state].admin_ro)?[STATES[view.state].admin_ro]:[])])]
      .filter(n=>ROS[n]).sort((a,b)=>countFor(b)-countFor(a));
    const based=allNames.filter(n=>homeNames.indexOf(n)>=0);
    const visiting=allNames.filter(n=>homeNames.indexOf(n)<0);
    RH.innerHTML=`<div class="eyebrow"><span class="dot" style="background:${solid(ST_H[s.name])}"></span>State</div>
      <h2>${esc(s.name)}</h2><div class="meta">${
        !pool.length ? 'No projects on record · administered by '+allNames.map(n=>roLabel(n)).join(', ')
        : administered ? 'Administered from '+allNames.map(n=>roLabel(n)).join(', ')
                     : allNames.length+' regional office'+(allNames.length>1?'s':'')+' working here'}</div>`;
    const poolKm=pool.reduce((a,p)=>a+(+p.length_km||0),0);
    const poolCr=pool.reduce((a,p)=>a+(+p.awarded_cost_cr||0),0);
    ST.innerHTML=statTiles([{v:num(pool.length),l:'Projects'},
      {v:poolKm.toLocaleString('en-IN',{maximumFractionDigits:0}),l:'Kilometres'},
      {v:cr(poolCr),l:'Awarded'}]);
    const roSec=(title,names,note)=>names.length?`<div class="sec"><h3>${title} <span class="n">${names.length}</span></h3><div class="rows">`+
      names.map(n=>rowHTML('ro',n,roLabel(n),labelFor(n))).join('')+
      `</div>`+(note?`<div style="font-size:11px;color:var(--ink-3);margin-top:7px;line-height:1.45">${note}</div>`:'')+
      `</div>`:'';
    const noWork=!pool.length;
    RB.innerHTML = (noWork
        ? `<div class="sec"><h3>Regional Offices <span class="n">${allNames.length}</span></h3><div class="rows">`+
          allNames.map(n=>rowHTML('ro',n,roLabel(n),'administers')).join('')+
          `</div><div style="font-size:11px;color:var(--ink-3);margin-top:7px;line-height:1.45">`+
          `No NHAI projects recorded in ${esc(s.name)}. Open the office to see its work elsewhere.`+
          `</div></div>`
        : administered
          ? roSec('Regional Offices',allNames,'Administered from another state — only work inside '+esc(s.name)+' is counted here.')
          : roSec('Based here',based,'Full portfolio, including work that runs into neighbouring states.')+
            roSec('Also working here',visiting,'Based elsewhere — only their projects inside '+esc(s.name)+' are counted.'));
    bindRows(RB,n=>go({level:'ro',state:view.state,ro:n}));
    legend('Regional Offices',allNames.map(n=>({n:roLabel(n),h:RO_H[n],
      c:countFor(n),
      v:{level:'ro',state:view.state,ro:n}})));
    hint.innerHTML=pool.length?'Click a <b>regional office</b> to see its PIUs'
      :'No projects here — click the <b>regional office</b> to see its network';
  }

  else if(view.level==='ro'){
    const r=ROS[view.ro], pius=RO_PIUS[view.ro].map(n=>PIUS[n]);
    RH.innerHTML=`<button class="back" data-up>← ${esc(view.state||'India')}</button>
      <div class="eyebrow"><span class="dot" style="background:${solid(RO_H[r.name])}"></span>Regional Office</div>
      <h2>${esc(roLabel(r.name))}</h2>
      <div class="meta">${esc(r.zone_name||'')}${r.email?' · '+esc(r.email):''}</div>`;
    ST.innerHTML=statTiles([{v:num(r.n),l:'Projects'},
      {v:r.km.toLocaleString('en-IN',{maximumFractionDigits:0}),l:'Kilometres'},
      {v:pius.length,l:'PIUs'}]);
    let h=`<div class="sec"><h3>PIUs <span class="n">${pius.length}</span></h3><div class="rows">`+
      pius.map(p=>rowHTML('piu',p.name,piuLabel(p.name),(P_BY_PIU[p.name]||[]).length+' proj')).join('')+`</div></div>`;
    if(r.admin_states&&r.admin_states.length) h+=`<div class="sec"><h3>Also administers <span class="n">${r.admin_states.length}</span></h3><div class="rows">`+
      r.admin_states.map(x=>`<div class="row"><span class="nm">${esc(x)}</span><span class="sm">no projects</span></div>`).join('')+`</div></div>`;
    if(r.states.length>1) h+=`<div class="sec"><h3>Works across states</h3><div class="rows">`+
      r.states.map(x=>`<div class="row"><span class="nm">${esc(x.s)}</span><span class="sm">${x.n}</span></div>`).join('')+`</div></div>`;
    RB.innerHTML=h;
    bindRows(RB,n=>{ if(PIUS[n]) go({level:'piu',state:view.state,ro:view.ro,piu:n}); });
    legend('PIUs',pius.map(p=>({n:piuLabel(p.name),h:PIU_H[p.name],c:(P_BY_PIU[p.name]||[]).length,
      v:{level:'piu',state:view.state,ro:view.ro,piu:p.name}})));
    hint.innerHTML='Click a <b>PIU</b> to list its projects';
  }

  else if(view.level==='piu'){
    const p=PIUS[view.piu], pr=(P_BY_PIU[view.piu]||[]).slice().sort((a,b)=>a.upc<b.upc?-1:1);
    RH.innerHTML=`<button class="back" data-up>← ${esc(roLabel(view.ro))}</button>
      <div class="eyebrow"><span class="dot" style="background:${solid(PIU_H[view.piu]||200)}"></span>PIU</div>
      <h2>${esc(piuLabel(p.name))}</h2>
      <div class="meta">${esc(p.district?p.district+' district':'')}${p.email?' · '+esc(p.email):''}</div>`;
    ST.innerHTML=statTiles([{v:num(p.n),l:'Projects'},{v:km(p.km).replace(' km',''),l:'Kilometres'},{v:cr(p.cost),l:'Awarded'}]);
    RB.innerHTML=`<div class="sec"><h3>Projects <span class="n">${pr.length}</span></h3>`+
      (pr.length?pr.map(projCard).join(''):'<div class="empty">No projects recorded</div>')+`</div>`;
    RB.querySelectorAll('.pcard').forEach(el=>el.onclick=()=>
      go({level:'project',state:view.state,ro:view.ro,piu:view.piu,project:el.dataset.upc}));
    legend(null,null);
    hint.innerHTML='Click a <b>project</b> marker or card for detail';
  }

  else if(view.level==='project'){
    const p=D.projects.find(x=>x.upc===view.project);
    RH.innerHTML=`<button class="back" data-up>← ${esc(piuLabel(view.piu))}</button>
      <div class="eyebrow">Project</div><h2 style="font-size:16px">${esc(p.upc)}</h2>
      <div class="meta">${esc(trunc(p.project_name,150))}</div>`;
    const pp=p.physical_progress_pct!=null?+p.physical_progress_pct:null;
    const fp=p.financial_progress_pct!=null?+p.financial_progress_pct:null;
    ST.innerHTML=statTiles([
      {v:p.length_km?(+p.length_km).toFixed(1):'—',l:'Length km'},
      {v:pp!=null?pp.toFixed(0)+'%':'—',l:'Physical'},
      {v:fp!=null?fp.toFixed(0)+'%':'—',l:'Financial'}]);
    const row=(k,v)=>v?`<dt>${k}</dt><dd>${esc(v)}</dd>`:'';
    RB.innerHTML=`<div class="sec"><h3>Contract</h3><dl class="dl">
      ${row('NH',p.nh_number)}${row('Corridor',p.corridor)}${row('Mode',p.mode)}
      ${row('Type',p.project_type)}${row('Stage',p.current_stage)}
      ${row('Lanes',p.number_of_lanes||p.lane_config)}
      ${row('Chainage',p.chainage_from_km!=null?p.chainage_from_km+' – '+p.chainage_to_km+' km':'')}
      ${row('Awarded',p.awarded_cost_cr?cr(+p.awarded_cost_cr):'')}
      ${row('Start',p.contract_start_date)}${row('End',p.contract_end_date)}
      ${row('Surface',p.surface_type)}${row('PCI',p.pci)}
      </dl></div>
      <div class="sec"><h3>Parties</h3><dl class="dl">
      ${row('Contractor',p.contractor)}${row('AE / IE',p.consultant)}</dl></div>
      <div class="sec"><h3>Jurisdiction</h3><dl class="dl">
      ${row('PIU',p.piu_name?piuLabel(p.piu_name):'')}${row('RO',p.region_name?roLabel(p.region_name):'')}${row('State',p.state_name)}
      ${row('Zone',p.zone_code)}${row('Survey',[p.phase,p.cycle].filter(Boolean).join(' · '))}</dl>
      <div style="margin-top:9px" class="srcbadge"><i></i>${
        p.geo_src==='db'?'Coordinates from project master':
        p.geo_src==='csv'?'Coordinates from NSV network overview':
        p.geo_src==='piu'?'Approximate — placed at PIU district':'No coordinates'}</div></div>`;
    legend(null,null);
    hint.innerHTML=`<b>${esc(p.upc)}</b>`;
  }

  const up=$('#rail-h [data-up]');
  if(up) up.onclick=()=>{
    if(view.level==='project') go({level:'piu',state:view.state,ro:view.ro,piu:view.piu});
    else if(view.level==='piu') go({level:'ro',state:view.state,ro:view.ro});
    else if(view.level==='ro') go({level:'state',state:view.state});
  };
  draw();
}
function rowHTML(kind,name,label,sub){
  return `<button class="row" data-n="${esc(name)}">
    <span class="dot" style="background:${solid(hueOf(kind,name))}"></span>
    <span class="nm">${esc(label)}</span><span class="sm">${esc(sub)}</span>
    <svg class="arw" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 5l7 7-7 7"/></svg>
  </button>`;
}
function bindRows(root,fn){ root.querySelectorAll('.row[data-n]').forEach(el=>{
  el.onclick=()=>fn(el.dataset.n);
  el.onmouseenter=()=>{const f=feats.find(x=>x.name===el.dataset.n); if(f) previewOn(f);};
  el.onmouseleave=()=>previewOff();
});}

/* Hovering a list row highlights its territory, and pans (never zooms) only
   when the target sits outside the current viewport. Zoom-to-fit was tried and
   rejected: RO-Gandhinagar's Rajasthan slice is 0.04% of the state, so fitting
   it filled the screen with flat colour and lost all context. */
function previewOn(f){
  hover=f;
  if(previewTimer) clearTimeout(previewTimer);
  const [a,b,c,d]=bbox(f.geom), w=W/DPR, h=H/DPR;
  const cx=px((a+c)/2), cy=py((b+d)/2);
  const off = cx<40||cy<40||cx>w-40||cy>h-40;
  if(off){
    if(!previewHome){
      const t=anim.target;
      previewHome=(t&&t.scale>0)?{scale:t.scale,tx:t.tx,ty:t.ty}:{scale,tx,ty};
    }
    previewTimer=setTimeout(()=>{                 // pan, same scale
      anim(scale, tx+(w/2-cx), ty+(h/2-cy), 300);
    },170);
  }
  draw();
}
function previewOff(){
  hover=null;
  if(previewTimer){clearTimeout(previewTimer);previewTimer=null;}
  if(previewHome&&previewHome.scale>0){const p=previewHome;previewHome=null;anim(p.scale,p.tx,p.ty,260);}
  else {previewHome=null;draw();}
}

function projCard(p){
  const pp=p.physical_progress_pct!=null?+p.physical_progress_pct:null;
  const col=pp==null?'var(--ink-3)':pp>=75?'var(--good)':pp>=35?'var(--warn)':'var(--crit)';
  return `<button class="pcard" data-upc="${esc(p.upc)}">
    <div class="p-top"><span class="upc">${esc(p.upc)}</span>
      ${p.nh_number?`<span class="nh">${esc(p.nh_number)}</span>`:''}</div>
    <div class="p-nm">${esc(p.project_name)}</div>
    <div class="p-bot"><span>${p.length_km?(+p.length_km).toFixed(1)+' km':'—'}</span>
      <span class="pbar"><i style="width:${pp!=null?Math.max(2,Math.min(100,pp)):0}%;background:${col}"></i></span>
      <span>${pp!=null?pp.toFixed(0)+'%':'—'}</span></div></button>`;
}
function legend(title,items){
  const LG=$('#legend');
  if(!items||!items.length){LG.hidden=true;return;}
  LG.hidden=false; $('#legend-h').textContent=title;
  $('#legend-items').innerHTML=items.map((it,i)=>
    `<button class="it" data-i="${i}"><span class="sw" style="background:${fill(it.h)};border-color:${solid(it.h)}"></span>
     <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.n)}</span>
     <span class="ct">${it.c}</span></button>`).join('');
  $('#legend-items').querySelectorAll('.it').forEach((el,i)=>{
    el.onclick=()=>go(items[i].v);
    el.onmouseenter=()=>{const v=items[i].v;
      const f=feats.find(x=>x.name===(v.piu||v.ro||v.state));
      if(f) previewOn(f);};
    el.onmouseleave=()=>previewOff();
  });
}

/* ---------- search ---------- */
$('#q').addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase();
  if(q.length<2){render();return;}
  const hits=[];
  D.states.forEach(s=>{if(s.name.toLowerCase().includes(q))hits.push({t:'State',n:s.name,v:{level:'state',state:s.name},h:ST_H[s.name]});});
  D.ros.forEach(r=>{if(r.name.toLowerCase().includes(q))hits.push({t:'RO',n:roLabel(r.name),
    v:{level:'ro',state:r.home_state,ro:r.name},h:RO_H[r.name]});});
  D.pius.forEach(p=>{if(p.name.toLowerCase().includes(q))hits.push({t:'PIU',n:piuLabel(p.name),
    v:{level:'piu',state:p.states[0],ro:p.ro,piu:p.name},h:PIU_H[p.name]});});
  D.projects.forEach(p=>{ if(hits.length>90)return;
    if(p.upc.toLowerCase().includes(q)||(p.project_name||'').toLowerCase().includes(q)||(p.nh_number||'').toLowerCase().includes(q))
      hits.push({t:'Project',n:p.upc,sub:trunc(p.project_name,60),
        v:{level:'project',state:p.state_name,ro:p.region_name,piu:p.piu_name,project:p.upc},h:hueOf('piu',p.piu_name)});});
  $('#rail-h').innerHTML=`<div class="eyebrow">Search</div><h2>${hits.length} result${hits.length===1?'':'s'}</h2>
    <div class="meta">for “${esc(e.target.value.trim())}”</div>`;
  $('#stats').innerHTML='';
  $('#rail-body').innerHTML=`<div class="sec"><div class="rows">`+
    (hits.length?hits.slice(0,90).map((x,i)=>`<button class="row" data-k="${i}">
      <span class="dot" style="background:${solid(x.h||200)}"></span>
      <span class="nm">${esc(x.n)}${x.sub?`<br><span style="font-weight:400;font-size:10.5px;color:var(--ink-3)">${esc(x.sub)}</span>`:''}</span>
      <span class="sm">${x.t}</span></button>`).join('')
     :'<div class="empty">Nothing matched</div>')+`</div></div>`;
  $('#rail-body').querySelectorAll('.row[data-k]').forEach((el,i)=>el.onclick=()=>{
    $('#q').value=''; go(hits[i].v);});
});

/* ---------- theme ---------- */
$('#theme').onclick=()=>{
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur? (cur==='dark'?'light':'dark') : (dark()?'light':'dark');
  document.documentElement.setAttribute('data-theme',next);
  try{localStorage.setItem('nhai-theme',next);}catch(_){}
  render();
};
try{const t=localStorage.getItem('nhai-theme'); if(t)document.documentElement.setAttribute('data-theme',t);}catch(_){}
matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{if(!document.documentElement.getAttribute('data-theme'))render();});

addEventListener('keydown',e=>{
  if(e.key==='Escape'){ if($('#q').value){$('#q').value='';render();return;}
    if(view.level==='project')go({level:'piu',state:view.state,ro:view.ro,piu:view.piu});
    else if(view.level==='piu')go({level:'ro',state:view.state,ro:view.ro});
    else if(view.level==='ro')go({level:'state',state:view.state});
    else if(view.level==='state')go({level:'india'});}
  if(e.key==='/'&&document.activeElement!==$('#q')){e.preventDefault();$('#q').focus();}
});
addEventListener('resize',resize);
if(window.ResizeObserver) new ResizeObserver(()=>resize()).observe(cv.parentElement);
resize(); render();
requestAnimationFrame(resize);
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>{resize();render();});
})();
