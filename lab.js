/* Maths Study Hub — design lab.
 *
 * A live editor for the design tokens, run on the real app rather than on a mock-up of it.
 * Written for the redesign's Foundations step (colour scheme, font, shape), where the plan had
 * been to redraw every page in Figma first just to try colours on it. Every colour, font and
 * corner in the app is already a CSS custom property, so the app itself is the better canvas.
 *
 * Loaded ONLY on request — `?lab` on the URL, the test panel's "Design lab" button, or
 * `mshLab()` from the console. The loader in index.html's <head> is the only thing that
 * references this file, and nothing loads it otherwise.
 *
 * What it can touch, and what it cannot:
 *   · It writes inline custom properties on <html> and the `data-theme` attribute. Nothing else.
 *   · It never calls applyTheme(): `msh-theme` is in SYNC_KEYS, so trying a base theme here
 *     would push it to every signed-in device. It sets the attribute directly and puts the
 *     app's own theme back on close.
 *   · Its state is `msh-lab-v1` in localStorage — not in SYNC_KEYS, so it stays on this device
 *     (and inside the `msh-test:` namespace when test mode is on).
 *   · Closing it removes every override. The app is then byte-for-byte what it was.
 *
 * Variants A/B/C each hold a full recipe. The export is a CSS block of only the tokens the lab
 * changed, with the recipe embedded as JSON so the block can be pasted back in.
 */
(function(){
'use strict';
if(window.__mshLabLoaded){ if(window.mshLabOpen) window.mshLabOpen(); return; }
window.__mshLabLoaded=true;

var KEY='msh-lab-v1';
var root=document.documentElement;

/* ------------------------------------------------------------------ vocabulary ---- */

var BASES={
  'rose-dark': {name:'Dark',       dark:true},
  'pure-white':{name:'Light',      dark:false},
  'rose-light':{name:'Light rose', dark:false}
};

/* What the panel lists, grouped as the app uses them. --accent-h, --tab-active and --glow are
   defined in the stylesheet but read by nothing (measured 2026-09-26), so they are left out: an
   editor for a colour nobody sees would be a lie. --severity is unread on purpose — it is the
   parked revert path for the severity slider's old ramp — and is left out for the same reason. */
var GROUPS={
  surfaces:[['--bg','Page'],['--surface','Card'],['--surface2','Raised'],['--surface3','Nested'],
            ['--border','Hairline'],['--border2','Border']],
  text:    [['--text','Text'],['--muted','Muted'],['--dim','Dim']],
  accent:  [['--accent','Accent'],['--accent2','Accent 2']],
  spectrum:[['--spec-1','Stop 1'],['--spec-2','Stop 2'],['--spec-3','Stop 3'],['--spec-4','Stop 4'],
            ['--spec-5','Stop 5'],['--on-spectrum','Text on it']],
  status:  [['--overdue','Overdue'],['--due','Due'],['--upcoming','Upcoming'],['--on-overdue','Text on overdue'],
            ['--y1','Year 1'],['--y2','Year 2'],['--fm','Further'],
            ['--d1','Standard'],['--d2','Challenging'],['--d3','Hard']]
};
var SURF=['--bg','--surface','--surface2','--surface3'];
// Every token used as text must clear 4.5:1 on all four surfaces (README, "Contrast is
// checked against every surface"). The spectrum is a graphic, so 3:1 (SC 1.4.11).
var TEXT_TOK=['--text','--muted','--dim','--accent','--accent2','--overdue','--due','--upcoming',
              '--y1','--y2','--fm','--d1','--d2','--d3'];
var GRAPHIC_TOK=['--spec-1','--spec-2','--spec-3','--spec-4','--spec-5'];

var FS={'--fs-3xs':11,'--fs-2xs':12,'--fs-xs':13,'--fs-sm':14,'--fs-md':15,'--fs-base':16,'--fs-lg':18,'--fs-xl':20,'--fs-2xl':24};
var RAD={'--r-xs':4,'--r-sm':8,'--r-md':12,'--r-lg':18};

var DERIVED=['--accent-rgb','--accent2-rgb','--overdue-rgb','--grad','--surface-glass','--nav-plate','--bg-top',
             '--y1-bg','--y1-bd','--y2-bg','--y2-bd','--fm-bg','--fm-bd','--font-body','--font-head','--font-mono','--r-pill'];
var ALL_TOK=[].concat(GROUPS.surfaces,GROUPS.text,GROUPS.accent,GROUPS.spectrum,GROUPS.status)
  .map(function(p){return p[0];}).concat(DERIVED,Object.keys(FS),Object.keys(RAD));

/* Weights checked against the Google Fonts API on 2026-09-26: asking css2 for a weight a
   family does not have fails the WHOLE request, so each family asks only for what it has. */
var ALL_W='300;400;500;600;700;800';
var FONTS=[
  ['Inter','sans',ALL_W],['Manrope','sans',ALL_W],['Space Grotesk','sans','300;400;500;600;700'],
  ['IBM Plex Sans','sans','300;400;500;600;700'],['Geist','sans',ALL_W],['DM Sans','sans',ALL_W],
  ['Archivo','sans',ALL_W],['Instrument Sans','sans','400;500;600;700'],['Schibsted Grotesk','sans','400;500;600;700;800'],
  ['Bricolage Grotesque','sans',ALL_W],['Familjen Grotesk','sans','400;500;600;700'],['Hanken Grotesk','sans',ALL_W],
  ['Public Sans','sans',ALL_W],['Work Sans','sans',ALL_W],['Figtree','sans',ALL_W],['Onest','sans',ALL_W],
  ['Sora','sans',ALL_W],['Red Hat Display','sans',ALL_W],['Chivo','sans',ALL_W],['Lexend','sans',ALL_W],
  ['Atkinson Hyperlegible Next','sans',ALL_W],
  ['Unbounded','display',ALL_W],['Syne','display','400;500;600;700;800'],
  ['Fraunces','serif',ALL_W],['Newsreader','serif',ALL_W],['Instrument Serif','serif','400'],
  ['JetBrains Mono','mono',ALL_W],['IBM Plex Mono','mono','300;400;500;600;700'],['Geist Mono','mono',ALL_W],
  ['Space Mono','mono','400;700'],['DM Mono','mono','300;400;500'],['Fragment Mono','mono','400'],
  ['Martian Mono','mono',ALL_W],['Red Hat Mono','mono','300;400;500;600;700'],['Chivo Mono','mono',ALL_W],
  ['Azeret Mono','mono',ALL_W],['Source Code Pro','mono',ALL_W]
];
var FONT_BY={}; FONTS.forEach(function(f){ FONT_BY[f[0]]=f; });
var FALLBACK={sans:'sans-serif',display:'sans-serif',serif:'serif',mono:'monospace'};
var KIND_LABEL={sans:'Sans',display:'Display',serif:'Serif',mono:'Mono'};
var FONT_ROLES=[['head','Headings','Manrope'],['body','Body','Inter'],['mono','Labels & numbers','JetBrains Mono']];

/* Spectrum presets. Hues are OKLCH degrees, weak → strong. Each gets a lightness that suits
   the base (light on dark, dark on light) so a preset starts near the contrast floor rather
   than miles under it; the Calm and Lightness sliders then move from there. */
var PRESETS=[
  ['current','As is'],['even','Even rainbow'],['soft','Soft'],['warm','Warm'],
  ['cool','Cool'],['aurora','Aurora'],['duo','Accent → accent 2'],['mono','One hue']
];
var PRESET_HUES={even:[25,55,85,155,255],soft:[25,55,85,155,255],warm:[18,38,58,78,98],
                 cool:[165,195,225,255,285],aurora:[140,172,210,255,305]};

/* ------------------------------------------------------------------ colour maths ---- */

var cvs=document.createElement('canvas'); cvs.width=cvs.height=1;
var cx=cvs.getContext('2d',{willReadFrequently:true});

// Any CSS colour string → {r,g,b,a}, or null. rgba() is read directly because a canvas
// round-trip destroys the channels of a 7%-alpha border.
function parse(str){
  if(str==null) return null; str=String(str).trim(); if(!str) return null;
  var m=str.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
  if(m){ var a=m[4]==null?1:(/%$/.test(m[4])?parseFloat(m[4])/100:+m[4]);
    return {r:+m[1],g:+m[2],b:+m[3],a:a}; }
  m=str.match(/^#([0-9a-f]{3,8})$/i);
  if(m){ var h=m[1];
    if(h.length===3||h.length===4) h=h.split('').map(function(c){return c+c;}).join('');
    if(h.length===6||h.length===8) return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),
      b:parseInt(h.slice(4,6),16),a:h.length===8?parseInt(h.slice(6,8),16)/255:1};
    return null; }
  if(/^var\(|gradient|^\d/.test(str)) return null;
  // Anything else (named colours, oklch(), hsl()) — let the canvas decide, and detect a
  // rejected value by painting a sentinel first.
  cx.fillStyle='#010203'; cx.fillStyle=str;
  if(cx.fillStyle==='#010203' && !/^#010203$/i.test(str)) return null;
  cx.clearRect(0,0,1,1); cx.fillRect(0,0,1,1);
  var d=cx.getImageData(0,0,1,1).data;
  return {r:d[0],g:d[1],b:d[2],a:d[3]/255};
}
function hex2(n){ n=Math.max(0,Math.min(255,Math.round(n))); return (n<16?'0':'')+n.toString(16); }
function toHex(c){ return '#'+hex2(c.r)+hex2(c.g)+hex2(c.b); }
function rgbStr(c,a){ return 'rgba('+Math.round(c.r)+','+Math.round(c.g)+','+Math.round(c.b)+','+(+a.toFixed(3))+')'; }
function triplet(c){ return Math.round(c.r)+','+Math.round(c.g)+','+Math.round(c.b); }
function over(fg,bg){ var a=fg.a==null?1:fg.a;   // composite fg over an opaque bg
  return {r:fg.r*a+bg.r*(1-a),g:fg.g*a+bg.g*(1-a),b:fg.b*a+bg.b*(1-a),a:1}; }

function lin(v){ v/=255; return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4); }
function unlin(v){ return 255*(v<=0.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-0.055); }
function lum(c){ return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b); }
function contrast(a,b){ var A=lum(a),B=lum(b); return (Math.max(A,B)+0.05)/(Math.min(A,B)+0.05); }

// OKLCH (Björn Ottosson's OKLab, polar). Used because equal steps in L look like equal steps,
// which is the whole point of generating surfaces and a spectrum from a few numbers.
function toOklch(c){
  var r=lin(c.r),g=lin(c.g),b=lin(c.b);
  var l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
  var m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
  var s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
  var L=0.2104542553*l+0.7936177850*m-0.0040720468*s;
  var A=1.9779984951*l-2.4285922050*m+0.4505937099*s;
  var B=0.0259040371*l+0.7827717662*m-0.8086757660*s;
  var H=Math.atan2(B,A)*180/Math.PI; if(H<0) H+=360;
  return {L:L,C:Math.sqrt(A*A+B*B),H:H};
}
function oklchLinear(L,C,H){
  var h=H*Math.PI/180, a=C*Math.cos(h), b=C*Math.sin(h);
  var l=Math.pow(L+0.3963377774*a+0.2158037573*b,3);
  var m=Math.pow(L-0.1055613458*a-0.0638541728*b,3);
  var s=Math.pow(L-0.0894841775*a-1.2914855480*b,3);
  return [ 4.0767416621*l-3.3077115913*m+0.2309699292*s,
          -1.2684380046*l+2.6097574011*m-0.3413193965*s,
          -0.0041960863*l-0.7034186147*m+1.7076147010*s];
}
function inGamut(v){ return v.every(function(x){ return x>=-0.0005&&x<=1.0005; }); }
// Out-of-gamut → keep L and H, reduce C until it fits. Clipping channels instead would shift
// the hue, which for a spectrum defeats the purpose.
function fromOklch(L,C,H){
  L=Math.max(0,Math.min(1,L)); C=Math.max(0,C);
  var v=oklchLinear(L,C,H);
  if(!inGamut(v)){ var lo=0,hi=C; for(var i=0;i<20;i++){ var mid=(lo+hi)/2; if(inGamut(oklchLinear(L,mid,H))) lo=mid; else hi=mid; } v=oklchLinear(L,lo,H); }
  return {r:unlin(Math.max(0,Math.min(1,v[0]))),g:unlin(Math.max(0,Math.min(1,v[1]))),b:unlin(Math.max(0,Math.min(1,v[2]))),a:1};
}
function oklchHex(L,C,H){ return toHex(fromOklch(L,C,H)); }
function minContrast(c,surfaces){ return Math.min.apply(null,surfaces.map(function(s){ return contrast(c,s); })); }

/* ------------------------------------------------------------------ state ---- */

function appTheme(){
  try{ if(typeof activeTheme==='string'&&BASES[activeTheme]) return activeTheme; }catch(e){}
  try{ var t=localStorage.getItem('msh-theme'); if(BASES[t]) return t; }catch(e){}
  return 'rose-dark';
}
function blank(base){
  return {base:base||appTheme(),gen:null,hue:0,spec:{preset:'current',calm:1,light:0},
          manual:{},fonts:{body:null,head:null,mono:null},type:1,radius:1,sharpPills:false};
}
function load(){
  var s=null; try{ s=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){}
  if(!s||s.v!==1||!s.variants) s={v:1,cur:'A',dock:true,collapsed:false,open:{surfaces:true},variants:{}};
  ['A','B','C'].forEach(function(k){ if(s.variants[k]) s.variants[k]=Object.assign(blank(),s.variants[k]); });
  if(!s.variants[s.cur]) s.variants[s.cur]=blank();
  return s;
}
var state=load();
var saveT=0;
function save(){ clearTimeout(saveT); saveT=setTimeout(function(){ try{ localStorage.setItem(KEY,JSON.stringify(state)); }catch(e){} },250); }
function V(){ return state.variants[state.cur]; }

/* ------------------------------------------------------------------ compute ---- */

var baseCache={};
var applied=[];          // inline properties we set, so clearing touches nothing else
var expectTheme=null;    // what data-theme should be while the lab is on
var comparing=false, active=false;

function setThemeAttr(key){
  expectTheme=key;
  if(key==='rose-dark') root.removeAttribute('data-theme'); else root.setAttribute('data-theme',key);
}
function clearInline(){ applied.forEach(function(k){ root.style.removeProperty(k); }); applied=[]; }
function readBase(base){
  if(baseCache[base]) return baseCache[base];
  var cs=getComputedStyle(root), m={};
  ALL_TOK.forEach(function(k){ m[k]=cs.getPropertyValue(k).trim(); });
  return (baseCache[base]=m);
}
function genFromBase(b){
  var bg=toOklch(parse(b['--bg'])), s3=toOklch(parse(b['--surface3']));
  var r=function(x,n){ return +x.toFixed(n); };
  return {h:Math.round(bg.C>0.004?bg.H:0),c:r(bg.C,3),l:r(bg.L,3),step:r(Math.max(0.005,Math.abs(s3.L-bg.L)/3),3)};
}
function fitText(L,C,H,surfaces,target,dir){
  var col=fromOklch(L,C,H);
  for(var i=0;i<80&&minContrast(col,surfaces)<target;i++){ L+=dir*0.005; if(L<0||L>1) break; col=fromOklch(L,C,H); }
  return toHex(col);
}
function genNeutrals(g,dark){
  var d=dark?1:-1, t={};
  // Calibrated against the shipped themes (2026-09-26): rose-dark's layers gain chroma as they
  // lift, 0.021 → 0.037 → 0.045 → 0.057, which is c·(1 + 0.6i) to within 0.003. With the
  // sliders at their starting values the generator lands within a shade of the real theme.
  var ss=[0,1,2,3].map(function(i){ return fromOklch(g.l+d*i*g.step,g.c*(1+i*0.6),g.h); });
  t['--bg']=toHex(ss[0]); t['--surface']=toHex(ss[1]); t['--surface2']=toHex(ss[2]); t['--surface3']=toHex(ss[3]);
  t['--text']=dark?oklchHex(0.968,Math.min(g.c*0.7,0.02),g.h):oklchHex(0.18,Math.min(g.c*1.5,0.04),g.h);
  // Muted and dim start where they look right and are walked away from the surfaces until
  // they clear the floor on the worst one — so the generator cannot produce failing text.
  t['--muted']=fitText(dark?0.66:0.52,Math.min(g.c*2.2,0.06),g.h,ss,4.6,d);
  t['--dim']  =fitText(dark?0.62:0.56,Math.min(g.c*1.8,0.05),g.h,ss,4.5,d);
  return t;
}
function specStops(v,b,dark,eff){
  var p=v.spec.preset, stops;
  if(p==='current'||!p){
    stops=GROUPS.spectrum.slice(0,5).map(function(x){ return toOklch(parse(b[x[0]])); });
  }else if(p==='mono'){
    var a=toOklch(parse(eff('--accent')));
    stops=[0,1,2,3,4].map(function(i){ return {L:dark?0.58+0.075*i:0.7-0.07*i,C:0.05+0.028*i,H:a.H}; });
  }else if(p==='duo'){
    var a1=toOklch(parse(eff('--accent'))), a2=toOklch(parse(eff('--accent2')));
    var dh=((a2.H-a1.H+540)%360)-180;
    stops=[0,1,2,3,4].map(function(i){ var f=i/4; return {L:dark?0.76:0.52,C:0.14,H:(a1.H+dh*f+360)%360}; });
  }else{
    stops=PRESET_HUES[p].map(function(h){ return {L:dark?0.78:0.52,C:p==='soft'?0.085:0.15,H:h}; });
  }
  return stops.map(function(s){ return oklchHex(s.L+(v.spec.light||0),s.C*(v.spec.calm==null?1:v.spec.calm),s.H); });
}
function rotate(str,dh){ var c=parse(str); if(!c) return null; var o=toOklch(c); return oklchHex(o.L,o.C,(o.H+dh+360)%360); }
function pickOn(bgList,cands){   // the candidate with the best worst-case contrast
  var best=null,bv=-1; cands.forEach(function(c){ var p=parse(c); if(!p) return;
    var v=minContrast(p,bgList); if(v>bv){ bv=v; best=c; } }); return best;
}

function compute(v,b){
  var dark=BASES[v.base].dark, t={};
  var eff=function(k){ return t[k]!=null?t[k]:b[k]; };
  if(v.gen) Object.assign(t,genNeutrals(v.gen,dark));
  if(v.hue){ ['--accent','--accent2'].forEach(function(k){ var r=rotate(b[k],v.hue); if(r) t[k]=r; }); }
  Object.keys(v.manual).forEach(function(k){ if(/^--(accent|accent2)$/.test(k)) t[k]=v.manual[k]; });
  var sp=v.spec||{};
  if((sp.preset&&sp.preset!=='current')||(sp.calm!=null&&sp.calm!==1)||sp.light){
    specStops(v,b,dark,eff).forEach(function(h,i){ t['--spec-'+(i+1)]=h; });
  }
  Object.keys(v.manual).forEach(function(k){ t[k]=v.manual[k]; });

  // Derived tokens follow their source — but only when the source moved, and never over a
  // value set by hand.
  var man=v.manual, setD=function(k,val){ if(man[k]==null&&val!=null) t[k]=val; };
  [['--accent','--accent-rgb'],['--accent2','--accent2-rgb'],['--overdue','--overdue-rgb']].forEach(function(p){
    if(t[p[0]]!=null){ var c=parse(t[p[0]]); if(c) setD(p[1],triplet(c)); } });
  if((t['--accent']!=null||t['--accent2']!=null)&&b['--grad'].indexOf('var(')<0)
    setD('--grad','linear-gradient(135deg,'+eff('--accent')+','+eff('--accent2')+')');
  ['--y1','--y2','--fm'].forEach(function(k){ if(t[k]!=null){ var c=parse(t[k]); if(c){
    setD(k+'-bg',rgbStr(c,dark?0.08:0.09)); setD(k+'-bd',rgbStr(c,dark?0.22:0.28)); } } });
  if(t['--surface']!=null||t['--bg']!=null){
    var sf=parse(eff('--surface')), bg=parse(eff('--bg'));
    if(sf&&bg){ var ga=dark?0.88:0.92;
      setD('--surface-glass',rgbStr(sf,ga)); setD('--nav-plate',toHex(over({r:sf.r,g:sf.g,b:sf.b,a:ga},bg)));
      if(dark){ var o=toOklch(bg); setD('--bg-top',oklchHex(Math.max(0,o.L-0.03),o.C,o.H)); } }
  }
  if(GRAPHIC_TOK.some(function(k){ return t[k]!=null; })||t['--bg']!=null||t['--text']!=null){
    var stops=GRAPHIC_TOK.map(function(k){ return parse(eff(k)); }).filter(Boolean);
    setD('--on-spectrum',pickOn(stops,[eff('--bg'),eff('--text'),'#ffffff']));
  }
  if(t['--overdue']!=null){ var od=parse(eff('--overdue')); if(od) setD('--on-overdue',pickOn([od],[eff('--bg'),'#ffffff'])); }

  if(v.type&&v.type!==1) Object.keys(FS).forEach(function(k){ t[k]=(Math.round(FS[k]*v.type*2)/2)+'px'; });
  if(v.radius!=null&&v.radius!==1) Object.keys(RAD).forEach(function(k){ t[k]=Math.round(RAD[k]*v.radius)+'px'; });
  if(v.sharpPills) t['--r-pill']=Math.round(8*(v.radius==null?1:v.radius))+'px';
  FONT_ROLES.forEach(function(r){ var f=v.fonts[r[0]]; if(f&&FONT_BY[f]) t['--font-'+r[0]]="'"+f+"',"+FALLBACK[FONT_BY[f][1]]; });
  return t;
}

/* ------------------------------------------------------------------ apply ---- */

var fontLinks={};
function loadFont(name){
  var f=FONT_BY[name]; if(!f||fontLinks[name]) return;
  var l=document.createElement('link'); l.rel='stylesheet';
  l.href='https://fonts.googleapis.com/css2?family='+name.replace(/ /g,'+')+':wght@'+f[2]+'&display=swap';
  l.setAttribute('data-msh-lab','');
  document.head.appendChild(l); fontLinks[name]=l;
}

var redrawT=0, current={};
function apply(){
  if(!active) return;
  var v=V();
  clearInline(); setThemeAttr(v.base);
  if(comparing){ setThemeAttr(appTheme()); current={}; paint(); return; }
  var b=readBase(v.base);
  current=compute(v,b);
  Object.keys(current).forEach(function(k){ root.style.setProperty(k,current[k]); applied.push(k); });
  FONT_ROLES.forEach(function(r){ if(v.fonts[r[0]]) loadFont(v.fonts[r[0]]); });
  save(); paint();
  // Canvas is pixels, not CSS: the Mistakes donut paints its hub from --surface at draw time.
  clearTimeout(redrawT);
  redrawT=setTimeout(function(){ try{ if(typeof renderPieChart==='function') renderPieChart('mistake'); }catch(e){} },200);
}
// Coalesce slider drags. A timer rather than requestAnimationFrame: rAF never fires in a
// background tab, which left the recipe and the page out of step until something else moved.
var schedT=0;
function schedule(){ if(schedT) return; schedT=setTimeout(function(){ schedT=0; apply(); },16); }

// The app re-applies its own theme on a cloud pull (and the test panel's "Next theme" does it
// on demand). While the lab is on, it owns the attribute; put it back.
var themeObs=new MutationObserver(function(){
  if(!active) return;
  var want=comparing?appTheme():expectTheme, have=root.getAttribute('data-theme')||'rose-dark';
  if(want&&have!==want) setThemeAttr(want);
});

/* ------------------------------------------------------------------ panel ---- */

var host=null, sh=null, $=function(s){ return sh.querySelector(s); }, $$=function(s){ return Array.prototype.slice.call(sh.querySelectorAll(s)); };

var CSS=[
':host{all:initial;}',
'*{box-sizing:border-box;}',
'.p{position:fixed;z-index:100001;right:12px;top:var(--top,12px);bottom:12px;width:344px;display:flex;flex-direction:column;',
'  background:#121316;color:#e7e8ea;border:1px solid #2b2d33;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.55);',
'  font:12px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden;}',
'.p.min{bottom:auto;}',
'.p.min .b{display:none;}',
'@media (max-width:700px){.p{left:0;right:0;top:auto;bottom:0;width:auto;height:58vh;border-radius:12px 12px 0 0;}.p.min{height:auto;bottom:0;}}',
'.h{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #2b2d33;background:#17181c;}',
'.h .t{font-weight:700;letter-spacing:.04em;margin-right:auto;}',
'button{font:inherit;color:inherit;background:#1d1f24;border:1px solid #33363d;border-radius:6px;padding:4px 8px;cursor:pointer;min-height:26px;}',
'button:hover{border-color:#6b8cff;}',
'button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #8aa6ff;outline-offset:1px;}',
'button.on{background:#e7e8ea;color:#121316;border-color:#e7e8ea;font-weight:700;}',
'button.ghost{background:none;border-color:transparent;}',
'.b{overflow:auto;flex:1;padding:4px 0 10px;overscroll-behavior:contain;}',
'details{border-bottom:1px solid #22242a;}',
'summary{cursor:pointer;padding:9px 12px;font-weight:700;list-style:none;display:flex;align-items:center;gap:8px;}',
'summary::-webkit-details-marker{display:none;}',
'summary::before{content:"\\25B8";color:#8b8e97;font-size:10px;width:10px;}',
'details[open]>summary::before{content:"\\25BE";}',
'summary .n{margin-left:auto;font-weight:400;color:#9b9ea6;font-size:11px;}',
'.sec{padding:2px 12px 12px;}',
'.row{display:flex;flex-wrap:wrap;gap:4px;align-items:center;}',
'.lbl{color:#9b9ea6;font-size:11px;margin:8px 0 4px;}',
'.hint{color:#9b9ea6;font-size:11px;margin:4px 0 8px;}',
'.sl{display:grid;grid-template-columns:78px 1fr 44px;gap:8px;align-items:center;margin:3px 0;}',
'.sl span:first-child{color:#c3c5cb;}',
'.sl output{font:11px ui-monospace,Menlo,monospace;color:#9b9ea6;text-align:right;}',
'input[type=range]{width:100%;accent-color:#8aa6ff;}',
'.tok{display:grid;grid-template-columns:26px 74px 1fr 40px 20px;gap:6px;align-items:center;padding:2px 0;}',
'.tok input[type=color]{width:26px;height:22px;padding:0;border:1px solid #33363d;border-radius:4px;background:none;cursor:pointer;}',
'.tok input[type=color]:disabled{cursor:default;}',
'.tok .nm{color:#c3c5cb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
'.tok.man .nm::after{content:" \\2022";color:#8aa6ff;}',
'.tok input[type=text]{width:100%;font:11px ui-monospace,Menlo,monospace;color:#e7e8ea;background:#0d0e10;border:1px solid #2b2d33;border-radius:4px;padding:3px 5px;}',
'.tok input.bad{border-color:#ff6b6b;}',
'.tok .cr{font:10.5px ui-monospace,Menlo,monospace;text-align:right;color:#9b9ea6;}',
'.tok .cr.fail{color:#ff8080;font-weight:700;}',
'.tok .rs{padding:0;min-height:20px;width:20px;border:none;background:none;color:#9b9ea6;visibility:hidden;}',
'.tok.man .rs{visibility:visible;}',
'.bar{height:14px;border-radius:4px;margin:6px 0 2px;border:1px solid #2b2d33;}',
'select{width:100%;font:inherit;color:#e7e8ea;background:#0d0e10;border:1px solid #33363d;border-radius:6px;padding:4px 6px;}',
'.fr{margin:6px 0 10px;}',
'.fs{font-size:19px;color:#e7e8ea;margin-top:5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
'.chk{display:flex;gap:6px;align-items:center;margin:6px 0;cursor:pointer;}',
'.ok{color:#7ee2a8;}.bad-t{color:#ff8080;}',
'ul{margin:4px 0 0;padding-left:16px;}li{margin:1px 0;}',
'textarea{width:100%;height:120px;font:10.5px/1.4 ui-monospace,Menlo,monospace;color:#e7e8ea;background:#0d0e10;border:1px solid #2b2d33;border-radius:6px;padding:6px;margin-top:6px;resize:vertical;}',
'.msg{min-height:16px;color:#9b9ea6;font-size:11px;margin-top:4px;}',
'.vs{display:flex;gap:3px;}',
'.vs button{min-width:26px;padding:4px 6px;}',
'.vs button.empty{color:#6c6f77;border-style:dashed;}'
].join('\n');

function slider(path,label,min,max,step){
  return '<label class="sl"><span>'+label+'</span><input type="range" data-k="'+path+'" min="'+min+'" max="'+max+'" step="'+step+'"><output data-o="'+path+'"></output></label>';
}
function tokRows(list){
  return list.map(function(p){
    return '<div class="tok" data-tok="'+p[0]+'"><input type="color" aria-label="'+p[1]+' colour">'
      +'<span class="nm" title="'+p[0]+'">'+p[1]+'</span><input type="text" spellcheck="false" aria-label="'+p[0]+' value">'
      +'<span class="cr"></span><button type="button" class="rs" title="Back to the recipe" aria-label="Reset '+p[1]+'">↺</button></div>';
  }).join('');
}
function sec(id,title,body){
  return '<details data-sec="'+id+'"'+(state.open[id]?' open':'')+'><summary>'+title+'<span class="n" data-n="'+id+'"></span></summary><div class="sec">'+body+'</div></details>';
}
function fontOptions(){
  var html='<option value="">(as is)</option>';
  ['sans','display','serif','mono'].forEach(function(k){
    html+='<optgroup label="'+KIND_LABEL[k]+'">'+FONTS.filter(function(f){ return f[1]===k; })
      .map(function(f){ return '<option>'+f[0]+'</option>'; }).join('')+'</optgroup>';
  });
  return html;
}

function build(){
  host=document.createElement('div'); host.id='msh-lab-host';
  sh=host.attachShadow({mode:'open'});
  var baseBtns=Object.keys(BASES).map(function(k){ return '<button type="button" data-base="'+k+'">'+BASES[k].name+'</button>'; }).join('');
  sh.innerHTML='<style>'+CSS+'</style>'
  +'<div class="p" role="region" aria-label="Design lab">'
  +'<div class="h"><span class="t">Design lab</span>'
  +  '<span class="vs" role="group" aria-label="Variants"><button type="button" data-var="A">A</button><button type="button" data-var="B">B</button><button type="button" data-var="C">C</button></span>'
  +  '<button type="button" id="cmp" title="Hold to see the app as it is (or hold \\ on the keyboard)">Original</button>'
  +  '<button type="button" class="ghost" id="min" aria-label="Collapse">–</button>'
  +  '<button type="button" class="ghost" id="x" aria-label="Close the lab">×</button></div>'
  +'<div class="b">'
  +sec('base','Base',
     '<div class="row">'+baseBtns+'</div>'
    +'<p class="hint">Everything below is layered on top of this theme. Choosing one here does not change your saved theme.</p>'
    +'<div class="row"><button type="button" id="dup">Copy this variant to…</button><select id="dupto" style="width:auto"><option>A</option><option>B</option><option>C</option></select></div>')
  +sec('surfaces','Surfaces & text',
     '<label class="chk"><input type="checkbox" id="gen"> Generate from one hue</label>'
    +'<div id="genbox">'+slider('gen.h','Hue',0,360,1)+slider('gen.c','Tint',0,0.08,0.001)+slider('gen.l','Page light',0.06,1,0.005)+slider('gen.step','Layer step',0.004,0.07,0.001)
    +'<p class="hint">Muted and dim are walked away from the surfaces until they clear 4.5:1 on all four, so the generator cannot make failing text.</p></div>'
    +'<div class="lbl">Tokens — edit any; a dot marks a hand-set one</div>'+tokRows(GROUPS.surfaces)+tokRows(GROUPS.text))
  +sec('accent','Accent',
     slider('hue','Hue shift',-180,180,1)+tokRows(GROUPS.accent))
  +sec('spectrum','Memory spectrum',
     '<div class="bar" id="specbar"></div><div class="hint">weak memory → strong memory</div>'
    +'<div class="row" id="presets">'+PRESETS.map(function(p){ return '<button type="button" data-preset="'+p[0]+'">'+p[1]+'</button>'; }).join('')+'</div>'
    +slider('spec.calm','Calm',0.2,1.4,0.02)+slider('spec.light','Lightness',-0.2,0.2,0.005)
    +tokRows(GROUPS.spectrum))
  +sec('status','Status, years, difficulty',tokRows(GROUPS.status))
  +sec('type','Type',
     FONT_ROLES.map(function(r){ return '<div class="fr"><div class="lbl">'+r[1]+'</div><select data-font="'+r[0]+'" aria-label="'+r[1]+' font">'+fontOptions()+'</select><div class="fs" data-fs="'+r[0]+'">Checklist · 12.8 Integration · 94%</div></div>'; }).join('')
    +slider('type','Size',0.85,1.25,0.025))
  +sec('shape','Shape',
     slider('radius','Roundness',0,1.6,0.05)
    +'<label class="chk"><input type="checkbox" id="pills"> Pills become corners</label>')
  +sec('contrast','Contrast','<div id="cr"></div>')
  +sec('export','Export',
     '<div class="row"><button type="button" id="copy">Copy CSS</button><button type="button" id="imp">Import</button><button type="button" id="reset">Reset variant</button></div>'
    +'<textarea id="out" spellcheck="false" aria-label="Exported CSS, or paste here to import"></textarea><div class="msg" id="msg"></div>')
  +'</div></div>';
  document.body.appendChild(host);
  wire();
}

function setPath(o,path,val){ var ks=path.split('.'); while(ks.length>1){ var k=ks.shift(); if(o[k]==null) o[k]={}; o=o[k]; } o[ks[0]]=val; }
function getPath(o,path){ return path.split('.').reduce(function(a,k){ return a==null?a:a[k]; },o); }
function msg(t){ var m=$('#msg'); if(m){ m.textContent=t; clearTimeout(msg._t); msg._t=setTimeout(function(){ m.textContent=''; },4000); } }

function wire(){
  var p=$('.p');
  $$('[data-var]').forEach(function(b){ b.onclick=function(){
    var k=b.getAttribute('data-var'); if(!state.variants[k]) state.variants[k]=blank(V().base);
    state.cur=k; apply(); }; });
  $$('[data-base]').forEach(function(b){ b.onclick=function(){
    var v=V(), k=b.getAttribute('data-base'); if(v.base===k) return;
    v.base=k;
    // A generated palette belongs to one polarity; restart it from the new base.
    if(v.gen){ clearInline(); setThemeAttr(k); v.gen=genFromBase(readBase(k)); }
    apply(); }; });
  $('#dup').onclick=function(){ var to=$('#dupto').value; if(to===state.cur) return;
    state.variants[to]=JSON.parse(JSON.stringify(V())); state.cur=to; apply(); msg('Copied to '+to+'.'); };
  $('#gen').onchange=function(){ var v=V();
    if(this.checked){ clearInline(); setThemeAttr(v.base); v.gen=genFromBase(readBase(v.base)); } else v.gen=null;
    apply(); };
  $$('input[type=range][data-k]').forEach(function(r){ r.oninput=function(){
    var path=r.getAttribute('data-k'); if(path.indexOf('gen.')===0&&!V().gen) return;
    setPath(V(),path,parseFloat(r.value)); schedule(); }; });
  $$('[data-preset]').forEach(function(b){ b.onclick=function(){ V().spec.preset=b.getAttribute('data-preset'); apply(); }; });
  $$('select[data-font]').forEach(function(s){ s.onchange=function(){
    var r=s.getAttribute('data-font'); V().fonts[r]=s.value||null; if(s.value) loadFont(s.value); apply(); }; });
  $('#pills').onchange=function(){ V().sharpPills=this.checked; apply(); };
  $$('.tok').forEach(function(row){
    var tok=row.getAttribute('data-tok'), col=row.querySelector('input[type=color]'), txt=row.querySelector('input[type=text]');
    col.oninput=function(){ V().manual[tok]=col.value; schedule(); };
    txt.oninput=function(){ var ok=!!parse(txt.value); txt.classList.toggle('bad',!ok); if(ok){ V().manual[tok]=txt.value.trim(); schedule(); } };
    row.querySelector('.rs').onclick=function(){ delete V().manual[tok]; apply(); };
  });
  $$('details[data-sec]').forEach(function(d){ d.addEventListener('toggle',function(){ state.open[d.getAttribute('data-sec')]=d.open; save(); }); });
  $('#min').onclick=function(){ state.collapsed=!state.collapsed; layout(); save(); };
  $('#x').onclick=close;
  var cmp=$('#cmp');
  var on=function(e){ if(e) e.preventDefault(); if(!comparing){ comparing=true; apply(); } };
  var off=function(){ if(comparing){ comparing=false; apply(); } };
  cmp.addEventListener('pointerdown',on); ['pointerup','pointerleave','pointercancel'].forEach(function(ev){ cmp.addEventListener(ev,off); });
  $('#copy').onclick=function(){ var t=$('#out'); t.value=exportCSS();
    (navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).then(function(){ msg('Copied. Paste it to Claude to make it a real theme.'); },
      function(){ t.select(); msg('Selected — copy it with ⌘C.'); }); };
  $('#imp').onclick=function(){ var r=importText($('#out').value); msg(r); };
  $('#reset').onclick=function(){ state.variants[state.cur]=blank(V().base); apply(); msg('Variant '+state.cur+' reset to the plain '+BASES[V().base].name+' theme.'); };
}

function layout(){
  if(!host) return;
  var p=$('.p'); p.classList.toggle('min',!!state.collapsed);
  p.style.setProperty('--top',(root.getAttribute('data-test')==='1'?38:12)+'px');
  var dock=!state.collapsed&&state.dock!==false&&window.innerWidth>=1100;
  root.classList.toggle('msh-lab-dock',dock);
  var tp=document.getElementById('msh-test'); if(tp&&!state.collapsed) tp.classList.add('min');
}

/* ------------------------------------------------------------------ paint ---- */

function fmt(n){ if(n==null) return ''; var s=(+n).toFixed(Math.abs(n)<1?3:0);
  return s.indexOf('.')>=0?s.replace(/0+$/,'').replace(/\.$/,''):s; }
function worst(tok,cs,surf){
  var c=parse(cs.getPropertyValue(tok)); if(!c) return null;
  var bgc=surf[0]; var col=c.a<1?over(c,bgc):c;
  var w=Infinity,wi=0; surf.forEach(function(s,i){ var r=contrast(col,s); if(r<w){ w=r; wi=i; } });
  return {r:w,on:SURF[wi]};
}
function paint(){
  if(!sh) return;
  var v=V(), cs=getComputedStyle(root), focus=sh.activeElement;
  $$('[data-var]').forEach(function(b){ var k=b.getAttribute('data-var');
    b.classList.toggle('on',k===state.cur); b.classList.toggle('empty',!state.variants[k]); });
  $$('[data-base]').forEach(function(b){ b.classList.toggle('on',b.getAttribute('data-base')===v.base); });
  $('#cmp').classList.toggle('on',comparing);
  $('#gen').checked=!!v.gen; $('#genbox').style.display=v.gen?'':'none';
  $('#pills').checked=!!v.sharpPills;
  $$('input[type=range][data-k]').forEach(function(r){
    var path=r.getAttribute('data-k'), val=getPath(v,path);
    if(val==null) val=path==='hue'?0:path==='type'||path==='radius'||path==='spec.calm'?1:0;
    if(r!==focus) r.value=val;
    var o=sh.querySelector('[data-o="'+path+'"]');
    if(o) o.textContent=path==='hue'||path==='gen.h'?Math.round(val)+'°':path==='type'||path==='radius'||path==='spec.calm'?'×'+(+val).toFixed(2):fmt(val);
  });
  $$('[data-preset]').forEach(function(b){ b.classList.toggle('on',b.getAttribute('data-preset')===(v.spec.preset||'current')); });
  $$('select[data-font]').forEach(function(s){ var r=s.getAttribute('data-font'); if(s!==focus) s.value=v.fonts[r]||'';
    var fam=cs.getPropertyValue('--font-'+r).trim(); var prev=sh.querySelector('[data-fs="'+r+'"]'); if(prev) prev.style.fontFamily=fam; });
  $('#specbar').style.background='linear-gradient(90deg,'+GRAPHIC_TOK.map(function(k){ return cs.getPropertyValue(k).trim(); }).join(',')+')';

  var surf=SURF.map(function(k){ return parse(cs.getPropertyValue(k)); });
  var surfOK=surf.every(Boolean);
  $$('.tok').forEach(function(row){
    var tok=row.getAttribute('data-tok'), val=cs.getPropertyValue(tok).trim(), c=parse(val);
    var col=row.querySelector('input[type=color]'), txt=row.querySelector('input[type=text]'), cr=row.querySelector('.cr');
    row.classList.toggle('man',v.manual[tok]!=null);
    if(txt!==focus){ txt.value=val; txt.classList.remove('bad'); }
    // A translucent token (the hairlines) shows what it looks like on a card, and is edited as
    // text: the picker only speaks opaque #rrggbb.
    var tr=!!c&&c.a<1;
    col.disabled=!c||tr; col.style.opacity=c?'':'.3';
    col.title=tr?'Translucent — edit the value to the right':'';
    if(c&&col!==focus) col.value=toHex(tr&&surf[1]?over(c,surf[1]):c);
    var need=TEXT_TOK.indexOf(tok)>=0?4.5:GRAPHIC_TOK.indexOf(tok)>=0?3:0;
    if(need&&surfOK){ var w=worst(tok,cs,surf); cr.textContent=w?w.r.toFixed(1):''; cr.classList.toggle('fail',!!w&&w.r<need);
      cr.title=w?('worst '+w.r.toFixed(2)+':1 on '+w.on+' — needs '+need+':1'):''; }
    else { cr.textContent=''; cr.classList.remove('fail'); cr.title=''; }
  });
  paintContrast(cs,surf,surfOK);
  var nm={surfaces:v.gen?'generated':'',accent:v.hue?(v.hue>0?'+':'')+v.hue+'°':'',
    spectrum:(v.spec.preset&&v.spec.preset!=='current')?PRESETS.filter(function(p){return p[0]===v.spec.preset;})[0][1]:'',
    type:FONT_ROLES.filter(function(r){ return v.fonts[r[0]]; }).map(function(r){ return v.fonts[r[0]]; }).join(', '),
    base:BASES[v.base].name+(Object.keys(current).length?' + '+Object.keys(current).length+' changed':'')};
  Object.keys(nm).forEach(function(k){ var e=sh.querySelector('[data-n="'+k+'"]'); if(e) e.textContent=nm[k]; });
}
function paintContrast(cs,surf,surfOK){
  var box=$('#cr'); if(!surfOK){ box.innerHTML='<p class="hint">A surface is not a solid colour, so contrast cannot be measured.</p>'; return; }
  var fails=[], n=0;
  TEXT_TOK.concat(GRAPHIC_TOK).forEach(function(tok){ n++;
    var need=TEXT_TOK.indexOf(tok)>=0?4.5:3, w=worst(tok,cs,surf);
    if(w&&w.r<need) fails.push(tok+' — '+w.r.toFixed(2)+':1 on '+w.on+' (needs '+need+')'); });
  var pair=function(fg,bgs,label){ n++; var f=parse(cs.getPropertyValue(fg)); if(!f) return;
    var w=Math.min.apply(null,bgs.map(function(b){ var c=parse(cs.getPropertyValue(b)); return c?contrast(f,c):99; }));
    if(w<4.5) fails.push(label+' — '+w.toFixed(2)+':1 (needs 4.5)'); };
  pair('--on-spectrum',GRAPHIC_TOK,'--on-spectrum on the spectrum');
  pair('--on-overdue',['--overdue'],'--on-overdue on --overdue');
  box.innerHTML=fails.length
    ?'<div class="bad-t"><b>'+fails.length+' of '+n+' checks fail</b></div><ul>'+fails.map(function(f){ return '<li>'+f+'</li>'; }).join('')+'</ul>'
    :'<div class="ok"><b>All '+n+' checks pass</b></div><p class="hint">Text tokens clear 4.5:1 on all four surfaces; spectrum stops clear 3:1.</p>';
  var e=sh.querySelector('[data-n="contrast"]'); if(e){ e.textContent=fails.length?fails.length+' failing':'all pass'; e.style.color=fails.length?'#ff8080':''; }
}

/* ------------------------------------------------------------------ export ---- */

function exportCSS(){
  var v=V(), d=new Date(), date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  var sel=v.base==='rose-dark'?':root':'[data-theme="'+v.base+'"]';
  var keys=Object.keys(current);
  var out='/* Design lab · variant '+state.cur+' · '+date+'\n   On top of: '+BASES[v.base].name+' ('+v.base+'). Only the '+keys.length+' tokens the lab changed are listed. */\n'
    +sel+'{\n'+keys.map(function(k){ return '  '+k+':'+current[k]+';'; }).join('\n')+'\n}\n';
  var fams=FONT_ROLES.map(function(r){ return v.fonts[r[0]]; }).filter(Boolean);
  if(fams.length) out+='/* Google Fonts: '+fams.filter(function(f,i){ return fams.indexOf(f)===i; })
    .map(function(f){ return 'family='+f.replace(/ /g,'+')+':wght@'+FONT_BY[f][2]; }).join('&')+' */\n';
  out+='/* lab:'+JSON.stringify(v)+' */\n';
  return out;
}
function importText(s){
  s=(s||'').trim(); if(!s) return 'Paste an export (or its JSON) into the box first.';
  var m=s.match(/\/\*\s*lab:([\s\S]*?)\s*\*\//), json=m?m[1]:s, v;
  try{ v=JSON.parse(json); }catch(e){ return 'That is not a lab export — no recipe found in it.'; }
  if(!v||!BASES[v.base]) return 'The recipe names no base theme the app has.';
  state.variants[state.cur]=Object.assign(blank(v.base),v); apply();
  return 'Imported into variant '+state.cur+'.';
}

/* ------------------------------------------------------------------ lifecycle ---- */

var pageCSS=null;
function keyGuard(e){
  // The app's shortcut handler listens on document in the capture phase and reads
  // document.activeElement — which, inside a shadow root, is the host div, not the input.
  // So typing a hex value in the lab would fire app shortcuts. Window capture runs before
  // document capture: stop the lab's own key events there. Default actions (typing, Tab
  // moving focus, Space on a button) are unaffected; no lab control listens for keys.
  if(host&&e.composedPath&&e.composedPath().indexOf(host)>=0){ e.stopPropagation(); return; }
  if(e.key==='\\'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    var tag=(document.activeElement||{}).tagName||'';
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
    e.stopPropagation(); e.preventDefault();
    var want=e.type==='keydown';
    if(want!==comparing){ comparing=want; apply(); }
  }
}
function open(){
  if(active){ if(state.collapsed){ state.collapsed=false; layout(); } return; }
  active=true;
  try{ sessionStorage.setItem('msh-lab','1'); }catch(e){}
  if(!pageCSS){ pageCSS=document.createElement('style'); pageCSS.id='msh-lab-page';
    pageCSS.textContent='html.msh-lab-dock body{padding-right:368px!important;}html.msh-lab-dock #msh-test{right:370px!important;}'; }
  document.head.appendChild(pageCSS);
  themeObs.observe(root,{attributes:true,attributeFilter:['data-theme']});
  ['keydown','keyup','keypress'].forEach(function(t){ window.addEventListener(t,keyGuard,true); });
  window.addEventListener('resize',layout);
  apply();
  var mount=function(){ if(!host) build(); layout(); apply(); };
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded',mount);
}
function close(){
  active=false; comparing=false;
  try{ sessionStorage.removeItem('msh-lab'); }catch(e){}
  clearTimeout(saveT); try{ localStorage.setItem(KEY,JSON.stringify(state)); }catch(e){}
  themeObs.disconnect();
  ['keydown','keyup','keypress'].forEach(function(t){ window.removeEventListener(t,keyGuard,true); });
  window.removeEventListener('resize',layout);
  clearInline(); setThemeAttr(appTheme()); expectTheme=null;
  root.classList.remove('msh-lab-dock'); if(pageCSS&&pageCSS.parentNode) pageCSS.parentNode.removeChild(pageCSS);
  if(host&&host.parentNode) host.parentNode.removeChild(host); host=null; sh=null;
  try{ if(typeof renderPieChart==='function') renderPieChart('mistake'); }catch(e){}
}

window.mshLabOpen=open;
window.mshLabClose=close;
/* For scripts and tests: the recipe → token map, without touching the page. */
window.mshLabCompute=function(v){
  var x=Object.assign(blank(),v||V());
  clearInline(); setThemeAttr(x.base); var t=compute(x,readBase(x.base));   // base must be read clean
  if(active) apply(); else setThemeAttr(appTheme());
  return t;
};
open();
})();
