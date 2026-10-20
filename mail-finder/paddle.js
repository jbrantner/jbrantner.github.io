// Sharper reader: PaddleOCR (Apache 2.0) models run on the phone with ONNX Runtime Web.
// Two steps: find the text lines (det.onnx), then read each line (rec.onnx).
"use strict";
(function(){
const ORT_VER="1.18.0";
const ORT_BASE=`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
const MODEL_CACHE="mailfinder-models-v1";
let det=null, rec=null, chars=null, loading=null;

function loadScript(src){
  return new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=()=>rej(new Error("script "+src)); document.head.appendChild(s); });
}
// keep the model files on the phone after the first download
async function fetchKept(url){
  let c=null; try{ c=await caches.open(MODEL_CACHE); const hit=await c.match(url); if(hit) return hit; }catch(e){}
  const r=await fetch(url); if(!r.ok) throw new Error("download "+url);
  if(c){ try{ await c.put(url,r.clone()); }catch(e){} }
  return r;
}
async function load(base){
  if(det) return;
  if(loading) return loading;
  loading=(async()=>{
    if(!window.ort){ await loadScript(ORT_BASE+"ort.min.js"); ort.env.wasm.wasmPaths=ORT_BASE; }
    ort.env.wasm.numThreads=1;
    const [d,r,t]=await Promise.all([
      fetchKept(base+"det.onnx").then(x=>x.arrayBuffer()),
      fetchKept(base+"rec.onnx").then(x=>x.arrayBuffer()),
      fetchKept(base+"dict.txt").then(x=>x.text())]);
    const opt={executionProviders:["wasm"],graphOptimizationLevel:"all"};
    det=await ort.InferenceSession.create(new Uint8Array(d),opt);
    rec=await ort.InferenceSession.create(new Uint8Array(r),opt);
    // class 0 is the CTC blank, then the dictionary, then a space
    chars=[""].concat(t.split(/\r?\n/).filter((x,i,a)=>!(i===a.length-1&&x==="")),[" "]);
  })();
  try{ await loading; }catch(e){ det=rec=null; throw e; } finally{ loading=null; }
}

function canvasOf(w,h){ const c=document.createElement("canvas"); c.width=w; c.height=h; return c; }

// image -> tensor in the BGR order and normalization the models were trained with
function toTensor(px,w,h,mean,std){
  const n=w*h, f=new Float32Array(3*n);
  for(let i=0;i<n;i++){
    const r=px[i*4]/255, g=px[i*4+1]/255, b=px[i*4+2]/255;
    f[i]=(b-mean[0])/std[0]; f[n+i]=(g-mean[1])/std[1]; f[2*n+i]=(r-mean[2])/std[2];
  }
  return f;
}

// step 1: probability map of "text here", grouped into line boxes
async function findLines(src){
  const lim=960, sc=Math.min(1,lim/Math.max(src.width,src.height));
  const w=Math.max(32,Math.round(src.width*sc/32)*32), h=Math.max(32,Math.round(src.height*sc/32)*32);
  const c=canvasOf(w,h), cx=c.getContext("2d",{willReadFrequently:true}); cx.drawImage(src,0,0,w,h);
  const data=toTensor(cx.getImageData(0,0,w,h).data,w,h,[.485,.456,.406],[.229,.224,.225]);
  const out=await det.run({[det.inputNames[0]]:new ort.Tensor("float32",data,[1,3,h,w])});
  const prob=out[det.outputNames[0]].data;
  const on=new Uint8Array(w*h); for(let i=0;i<w*h;i++) on[i]=prob[i]>.3?1:0;
  const seen=new Uint8Array(w*h), boxes=[], stack=new Int32Array(w*h), pix=new Int32Array(w*h);
  const r=(src.width/w+src.height/h)/2;
  for(let s0=0;s0<w*h;s0++){
    if(!on[s0]||seen[s0]) continue;
    let top=0, n=0, sum=0, mx=0, my=0; stack[top++]=s0; seen[s0]=1;
    while(top){
      const p=stack[--top], x=p%w, y=(p-x)/w; pix[n++]=p; sum+=prob[p]; mx+=x; my+=y;
      if(x>0&&on[p-1]&&!seen[p-1]){seen[p-1]=1;stack[top++]=p-1;}
      if(x<w-1&&on[p+1]&&!seen[p+1]){seen[p+1]=1;stack[top++]=p+1;}
      if(y>0&&on[p-w]&&!seen[p-w]){seen[p-w]=1;stack[top++]=p-w;}
      if(y<h-1&&on[p+w]&&!seen[p+w]){seen[p+w]=1;stack[top++]=p+w;}
    }
    if(n<10||sum/n<.6) continue;
    // tilted lines: find the line's direction, then a rotated box around it
    mx/=n; my/=n; let cxx=0,cyy=0,cxy=0;
    for(let i=0;i<n;i++){ const x=pix[i]%w-mx, y=(pix[i]-pix[i]%w)/w-my; cxx+=x*x; cyy+=y*y; cxy+=x*y; }
    let th=.5*Math.atan2(2*cxy,cxx-cyy); if(th>Math.PI/4) th-=Math.PI/2; else if(th<-Math.PI/4) th+=Math.PI/2;
    const co=Math.cos(th), si=Math.sin(th); let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9;
    for(let i=0;i<n;i++){ const x=pix[i]%w-mx, y=(pix[i]-pix[i]%w)/w-my, u=x*co+y*si, v=-x*si+y*co;
      if(u<u0)u0=u; if(u>u1)u1=u; if(v<v0)v0=v; if(v>v1)v1=v; }
    let L=u1-u0+1, T=v1-v0+1; if(Math.min(L,T)<3) continue;
    const d=L*T*1.5/(2*(L+T)); // grow the box like PaddleOCR's "unclip"
    L+=T*.25; // a little extra at both ends so the last letters are not clipped
    const uc=(u0+u1)/2, vc=(v0+v1)/2;
    boxes.push({cx:(mx+uc*co-vc*si+.5)*r, cy:(my+uc*si+vc*co+.5)*r, L:(L+2*d)*r, T:(T+2*d)*r, th});
  }
  // biggest text first (names and addresses), at most 24 lines, then put them back in reading order
  const keep=boxes.sort((a,b)=>b.L*b.T-a.L*a.T).slice(0,24);
  keep.sort((a,b)=>Math.abs(a.cy-b.cy)<Math.min(a.T,b.T)/2?a.cx-b.cx:a.cy-b.cy);
  return keep;
}

// step 2: read one line
async function readLine(src,b){
  const H=48, W=Math.max(16,Math.min(1600,Math.round(H*b.L/b.T)));
  const c=canvasOf(W,H), cx=c.getContext("2d",{willReadFrequently:true});
  cx.fillStyle="#fff"; cx.fillRect(0,0,W,H);
  cx.translate(W/2,H/2); cx.scale(W/b.L,H/b.T); cx.rotate(-b.th); cx.translate(-b.cx,-b.cy); cx.drawImage(src,0,0);
  const data=toTensor(cx.getImageData(0,0,W,H).data,W,H,[.5,.5,.5],[.5,.5,.5]);
  const out=await rec.run({[rec.inputNames[0]]:new ort.Tensor("float32",data,[1,3,H,W])});
  const t=out[rec.outputNames[0]], [,T,C]=t.dims, p=t.data;
  let s="", last=0, conf=0, n=0;
  for(let i=0;i<T;i++){
    let best=0, bv=-1; for(let k=0;k<C;k++){ const v=p[i*C+k]; if(v>bv){bv=v;best=k;} }
    if(best!==0&&best!==last){ s+=chars[best]||""; conf+=bv; n++; }
    last=best;
  }
  return {text:s.trim(), conf:n?conf/n:0};
}

async function read(src){
  const lines=await findLines(src), out=[];
  for(const b of lines){ const r=await readLine(src,b); if(r.text&&r.conf>=.5) out.push(r.text); }
  return out.join("\n");
}
window.PaddleReader={load,read,ready:()=>!!det};
})();
