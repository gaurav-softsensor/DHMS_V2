(function(){
"use strict";
const D = JSON.parse(document.getElementById('d').textContent);
const $ = s => document.querySelector(s);
/* display labels: ROs read "RO-Mumbai", PIUs read "PIU-Nashik" */
const roLabel  = n => { n=String(n||''); return /^RO[-\s]/i.test(n) ? n.replace(/^RO\s+/i,'RO-') : 'RO-'+n; };
const piuLabel = n => { n=String(n||''); return /^PIU[-\s]/i.test(n) ? n.replace(/^PIU\s+/i,'PIU-') : 'PIU-'+n; };

/* ---------- palette: 25 hues, stable per name ---------- */
const HUES=[188,12,262,42,150,330,72,208,352,108,28,238,168,318,55,282,132,2,222,95,308,178,38,252,120];
function idx(name,n){let h=0;for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))>>>0;return h%n;}
const assign=(names)=>{const m={},used=new Set();names.forEach(n=>{let i=idx(n,HUES.length),g=0;
  while(used.has(i)&&g<HUES.length){i=(i+7)%HUES.length;g++;}used.add(i);m[n]=HUES[i];});return m;};
const RO_H=assign(D.ros.map(r=>r.name).sort());
const ST_H=assign(D.states.map(s=>s.name).sort());
const PIU_H={}; D.ros.forEach(r=>{const b=RO_H[r.name]||200;
  r.pius.forEach((p,i)=>{PIU_H[p]=(b+((i%2?1:-1)*(9+Math.floor(i/2)*11))+360)%360;});});
const dark=()=>{const t=document.documentElement.getAttribute('data-theme');
  return t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches);};
const fill=h=>dark()?`hsl(${h} 42% 34%)`:`hsl(${h} 46% 76%)`;
const fillHi=h=>dark()?`hsl(${h} 55% 45%)`:`hsl(${h} 58% 66%)`;
const solid=h=>dark()?`hsl(${h} 60% 58%)`:`hsl(${h} 52% 44%)`;
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
  W=Math.round(w*DPR); H=Math.round(h*DPR);
  cv.width=W;cv.height=H;
  ctx.setTransform(DPR,0,0,DPR,0,0); fit(); draw();
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

function currentFeatures(){
  if(view.level==='india') return D.states.filter(s=>s.geom).map(s=>({kind:'state',name:s.name,geom:s.geom,d:s}));
  if(view.level==='state'){
    // an RO working in several states shows only the slice inside this state
    const sl=(D.ro_by_state&&D.ro_by_state[view.state])||{};
    return ST_ROS[view.state].map(n=>ROS[n]).filter(Boolean)
      .map(r=>({kind:'ro',name:r.name,geom:sl[r.name]||r.geom,d:r}))
      .filter(f=>f.geom);
  }
  if(view.level==='ro'){
    const sl=(D.piu_by_ro&&D.piu_by_ro[view.ro])||{};
    return RO_PIUS[view.ro].map(n=>PIUS[n]).filter(Boolean)
      .map(p=>({kind:'piu',name:p.name,geom:sl[p.name]||p.geom,d:p}))
      .filter(f=>f.geom);
  }
  if(view.level==='piu'||view.level==='project'){
    const sl=(D.piu_by_ro&&D.piu_by_ro[view.ro])||{};
    const p=PIUS[view.piu]; const g=p&&(sl[view.piu]||p.geom);
    return g?[{kind:'piu',name:p.name,geom:g,d:p}]:[];
  }
  return [];
}
function visibleProjects(){
  if(view.level==='india') return [];
  if(view.level==='state') return P_BY_STATE[view.state]||[];
  if(view.level==='ro'){
    const all=P_BY_RO[view.ro]||[];
    // reached via a state: show only that state's work, matching the clipped map
    if(view.state){const inSt=all.filter(p=>p.state_name===view.state); if(inSt.length) return inSt;}
    return all;
  }
  return P_BY_PIU[view.piu]||[];
}

/* ---------- camera ---------- */
function flyTo(g,ms=520){
  if(!g){scale=1;tx=ty=0;return;}
  const [a,b,c,d]=bbox(g), w=W/DPR,h=H/DPR,pad=64;
  const gw=(c-a)*fitS, gh=(MLAT(d)-MLAT(b))*fitS;
  const ns=Math.min((w-pad*2)/Math.max(gw,.001),(h-pad*2)/Math.max(gh,.001),14);
  const cx=fitX+((a+c)/2-LON0)*fitS*ns, cy=fitY+(my1-(MLAT(b)+MLAT(d))/2)*fitS*ns;
  anim(ns, w/2-cx, h/2-cy, ms);
}
function anim(ns,nx,ny,ms){
  const s0=scale,x0=tx,y0=ty,t0=performance.now();
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){scale=ns;tx=nx;ty=ny;draw();return;}
  cancelAnimationFrame(anim._r);
  (function step(t){const k=Math.min((t-t0)/ms,1),e=1-Math.pow(1-k,3);
    scale=s0+(ns-s0)*e; tx=x0+(nx-x0)*e; ty=y0+(ny-y0)*e; draw();
    if(k<1) anim._r=requestAnimationFrame(step);})(t0);
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

  feats.forEach(f=>{
    const adm=f.kind==='state'&&f.d&&f.d.admin_only;
    const hu=adm?hueOf('ro',f.d.admin_ro):hueOf(f.kind,f.name);
    const on=hover&&hover.name===f.name&&hover.kind===f.kind;
    path(f.geom);
    ctx.globalAlpha=adm?.42:1;
    ctx.fillStyle=on?fillHi(hu):fill(hu); ctx.fill('evenodd'); ctx.globalAlpha=1;
    ctx.strokeStyle=on?solid(hu):line; ctx.lineWidth=on?2:.7; ctx.stroke();
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
  if(feats.length<=60){
    ctx.font='600 11px "Public Sans",system-ui,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    // collect first, then drop labels that overflow their shape or collide
    const placed=[];
    feats.forEach(f=>{
      const c=centroid(f.geom); if(!c)return;
      const x=px(c[0]),y=py(c[1]);
      if(x<0||y<0||x>w||y>h)return;
      const [a,b,cc,dd]=bbox(f.geom);
      const bw=(cc-a)*fitS*scale;
      if(bw<34)return;
      let t=f.kind==='ro'?roLabel(f.name):f.kind==='piu'?piuLabel(f.name):f.name;
      let tw=ctx.measureText(t).width;
      // a label must fit inside its own territory, else abbreviate, else drop
      if(tw>bw-6){
        const shortMap={'Dadra and Nagar Haveli and Daman and Diu':'DNH & DD',
          'Andaman and Nicobar':'A & N Islands','Jammu and Kashmir':'J & K',
          'Arunachal Pradesh':'Arunachal','Himachal Pradesh':'Himachal'};
        const alt=shortMap[f.name];
        if(alt){ t=alt; tw=ctx.measureText(t).width; }
      }
      if(tw>bw-4) return;                      // still doesn't fit: no label
      const box={x1:x-tw/2-2,y1:y-7,x2:x+tw/2+2,y2:y+7};
      if(placed.some(q=>!(box.x2<q.x1||box.x1>q.x2||box.y2<q.y1||box.y1>q.y2))) return;
      placed.push(box);
      ctx.lineWidth=3.2; ctx.strokeStyle=dark()?'rgba(20,23,28,.85)':'rgba(255,255,255,.9)';
      ctx.strokeText(t,x,y); ctx.fillStyle=ink; ctx.fillText(t,x,y);
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
  if(f.kind==='ro'){ rows+=`<dt>PIUs</dt><dd>${RO_PIUS[f.name].length}</dd>`;
    foot=(d.zone_name||'')+(d.states.length>1?' · works in '+d.states.length+' states':''); }
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
  const f=pick(cx,cy);
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
  const f=pick(cx,cy); if(!f)return;
  if(f.kind==='state'){
    if(f.d&&f.d.admin_only&&f.d.admin_ro) go({level:'ro',state:f.name,ro:f.d.admin_ro});
    else go({level:'state',state:f.name});
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
  hover=null; hideTip(); render();
  const f=currentFeatures();
  if(view.level==='india') anim(1,0,0,480);
  else if(view.level==='project'){ const p=D.projects.find(x=>x.upc===view.project);
    if(p&&p.lat!=null){ const w=W/DPR,h=H/DPR,ns=Math.min(Math.max(scale,7),9);
      const cx=fitX+(p.lon-LON0)*fitS*ns, cy=fitY+(my1-MLAT(p.lat))*fitS*ns;
      anim(ns,w/2-cx,h/2-cy,520);} else if(f.length) flyTo(unionBox(f)); }
  else if(f.length) flyTo(unionBox(f));
  else draw();
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
      if(st&&st.admin_only&&st.admin_ro) go({level:'ro',state:n,ro:st.admin_ro});
      else go({level:'state',state:n});});
    legend('States',D.states.slice().sort((a,b)=>b.n-a.n).map(s=>({n:s.name,
      h:s.admin_only?hueOf('ro',s.admin_ro):ST_H[s.name],c:s.admin_only?'—':s.n,
      v:s.admin_only?{level:'ro',state:s.name,ro:s.admin_ro}:{level:'state',state:s.name}})));
    hint.innerHTML='Click a <b>state</b> to see its regional offices';
  }

  else if(view.level==='state'){
    const s=STATES[view.state]; let ros=ST_ROS[view.state].map(n=>ROS[n]);
    if(!ros.length&&s.admin_ro&&ROS[s.admin_ro]) ros=[ROS[s.admin_ro]];
    RH.innerHTML=`<div class="eyebrow"><span class="dot" style="background:${solid(ST_H[s.name])}"></span>State</div>
      <h2>${esc(s.name)}</h2><div class="meta">${ros.length} regional office${ros.length>1?'s':''} operating here</div>`;
    ST.innerHTML=statTiles([{v:num(s.n),l:'Projects'},{v:km(s.km).replace(' km',''),l:'Kilometres'},{v:cr(s.cost),l:'Awarded'}]);
    RB.innerHTML=`<div class="sec"><h3>Regional Offices <span class="n">${ros.length}</span></h3><div class="rows">`+
      ros.map(r=>{const n=(P_BY_STATE[view.state]||[]).filter(p=>p.region_name===r.name).length;
        return rowHTML('ro',r.name,roLabel(r.name),n+' proj');}).join('')+`</div></div>`;
    bindRows(RB,n=>go({level:'ro',state:view.state,ro:n}));
    legend('Regional Offices',ros.map(r=>({n:roLabel(r.name),h:RO_H[r.name],
      c:(P_BY_STATE[view.state]||[]).filter(p=>p.region_name===r.name).length,
      v:{level:'ro',state:view.state,ro:r.name}})));
    hint.innerHTML='Click a <b>regional office</b> to see its PIUs';
  }

  else if(view.level==='ro'){
    const r=ROS[view.ro], pius=RO_PIUS[view.ro].map(n=>PIUS[n]);
    RH.innerHTML=`<button class="back" data-up>← ${esc(view.state||'India')}</button>
      <div class="eyebrow"><span class="dot" style="background:${solid(RO_H[r.name])}"></span>Regional Office</div>
      <h2>${esc(roLabel(r.name))}</h2>
      <div class="meta">${esc(r.zone_name||'')}${r.email?' · '+esc(r.email):''}</div>`;
    const scoped=visibleProjects();
    const scopedKm=scoped.reduce((a,p)=>a+(+p.length_km||0),0);
    const partial=view.state&&scoped.length!==r.n;
    ST.innerHTML=statTiles([
      {v:num(partial?scoped.length:r.n),l:partial?'In '+view.state.split(' ')[0]:'Projects'},
      {v:(partial?scopedKm:r.km).toLocaleString('en-IN',{maximumFractionDigits:0}),l:'Kilometres'},
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
  el.onmouseenter=()=>{const n=el.dataset.n;
    const f=feats.find(x=>x.name===n); if(f){hover=f;draw();}};
  el.onmouseleave=()=>{hover=null;draw();};
});}
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
    el.onmouseenter=()=>{const f=feats.find(x=>x.name===items[i].v.piu||x.name===items[i].v.ro||x.name===items[i].v.state);
      if(f){hover=f;draw();}};
    el.onmouseleave=()=>{hover=null;draw();};
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
