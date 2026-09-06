(function(){
"use strict";

// ===== src/math.js =====
/** Column-major matrices, right-handed world, +Y up, WebGPU depth [0, 1]. */
const EPS = 1e-8;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
const vadd = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const vsub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const vmul = (a,s) => [a[0]*s,a[1]*s,a[2]*s];
const vdot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const vcross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vlength = a => Math.hypot(...a);
const vnorm = a => vmul(a,1/(vlength(a)||1));
const vlerp = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
const identity = () => new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function mmul(a,b) {
  const o = new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return o;
}
function compose(t) {
  const [x,y,z]=t.rotation.map(rad),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z),s=t.scale;
  return new Float32Array([
    cz*cy*s[0],sz*cy*s[0],-sy*s[0],0,
    (cz*sy*sx-sz*cx)*s[1],(sz*sy*sx+cz*cx)*s[1],cy*sx*s[1],0,
    (cz*sy*cx+sz*sx)*s[2],(sz*sy*cx-cz*sx)*s[2],cy*cx*s[2],0,
    ...t.position,1]);
}
function inverse(a) {
  const o=identity(),m=Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>c<4?a[c*4+r]:+(c-4===r)));
  for(let c=0;c<4;c++) {
    let p=c; for(let r=c+1;r<4;r++) if(Math.abs(m[r][c])>Math.abs(m[p][c]))p=r;
    if(Math.abs(m[p][c])<EPS)return null;
    [m[c],m[p]]=[m[p],m[c]];const k=m[c][c];for(let j=0;j<8;j++)m[c][j]/=k;
    for(let r=0;r<4;r++)if(r!==c){const f=m[r][c];for(let j=0;j<8;j++)m[r][j]-=f*m[c][j];}
  }
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=m[r][c+4];return o;
}
function point(m,p) {const w=m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];return [0,1,2].map(i=>(m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12])/w);}
const direction=(m,p)=>[0,1,2].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]);
function perspective(fov,aspect,near=.1,far=500) {const f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,far/(near-far),-1,0,0,far*near/(near-far),0]);}
function ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,1/(n-f),0,-(r+l)/(r-l),-(t+b)/(t-b),n/(n-f),1]);}
function lookAt(eye,target,up=[0,1,0]) {let z=vnorm(vsub(eye,target));if(vlength(z)<1e-8)z=[0,0,1];if(Math.abs(vdot(z,vnorm(up)))>.9999)up=Math.abs(z[2])<.9?[0,0,1]:[1,0,0];const x=vnorm(vcross(up,z)),y=vcross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-vdot(x,eye),-vdot(y,eye),-vdot(z,eye),1]);}
function boundsTransform(b,m){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<8;i++){const p=point(m,[b[i&1?1:0][0],b[i&2?1:0][1],b[i&4?1:0][2]]);for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}}return [min,max];}
function frustumPlanes(m){const row=r=>[m[r],m[4+r],m[8+r],m[12+r]],a=row(3),r0=row(0),r1=row(1),r2=row(2);return [a.map((v,i)=>v+r0[i]),a.map((v,i)=>v-r0[i]),a.map((v,i)=>v+r1[i]),a.map((v,i)=>v-r1[i]),r2,a.map((v,i)=>v-r2[i])].map(p=>{const l=Math.hypot(p[0],p[1],p[2]);return p.map(v=>v/l);});}
const inFrustum=(b,planes)=>planes.every(p=>p[0]*b[p[0]>=0?1:0][0]+p[1]*b[p[1]>=0?1:0][1]+p[2]*b[p[2]>=0?1:0][2]+p[3]>=0);
function rayBox(o,d,b){let lo=0,hi=Infinity;for(let k=0;k<3;k++){if(Math.abs(d[k])<EPS){if(o[k]<b[0][k]||o[k]>b[1][k])return null;}else{let a=(b[0][k]-o[k])/d[k],z=(b[1][k]-o[k])/d[k];if(a>z)[a,z]=[z,a];lo=Math.max(lo,a);hi=Math.min(hi,z);if(lo>hi)return null;}}return lo;}
function rayTriangle(o,d,a,b,c){const e1=vsub(b,a),e2=vsub(c,a),h=vcross(d,e2),det=vdot(e1,h);if(Math.abs(det)<EPS)return null;const f=1/det,s=vsub(o,a),u=f*vdot(s,h);if(u<0||u>1)return null;const q=vcross(s,e1),v=f*vdot(d,q);if(v<0||u+v>1)return null;const t=f*vdot(e2,q);return t>=0?t:null;}
function cameraRay(x,y,w,h,vp){const inv=inverse(vp),p=point(inv,[x/w*2-1,1-y/h*2,0]),q=point(inv,[x/w*2-1,1-y/h*2,1]);return {origin:p,dir:vnorm(vsub(q,p))};}
function screenPoint(p,vp,w,h){const q=point(vp,p);return [(q[0]+1)*.5*w,(1-q[1])*.5*h,q[2]];}
const hexRGB=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const deepCopy=o=>structuredClone(o);
function seeded(seed=1){let s=seed>>>0;return ()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}


// ===== src/scene.js =====


const SCENE_VERSION=1;
let nextID=1;
const uid=(prefix='e')=>`${prefix}_${Date.now().toString(36)}_${(nextID++).toString(36)}`;
function entity(name,mesh='cube',position=[0,0,0],scale=[1,1,1],material='stone') {
  return {id:uid(),name,parent:null,visible:true,locked:false,transform:{position:[...position],rotation:[0,0,0],scale:[...scale]},components:mesh?{mesh:{asset:mesh,material,castShadow:true}}:{}};
}
/** Offset a local transform and all absolute position keys together. */
function translateEntity(e,delta){
  if(!Array.isArray(delta)||delta.length!==3||!delta.every(Number.isFinite))throw Error('Translation must be three finite coordinates');
  e.transform.position=e.transform.position.map((v,i)=>v+delta[i]);
  for(const track of e.components.animation?.tracks||[]){const match=/^position\.([xyz])$/.exec(track.property);if(match)for(const key of track.keys)key.value+=delta['xyz'.indexOf(match[1])];}
  return e;
}
class Scene {
  constructor(data){this.data=deepCopy(data);this.reindex();}
  reindex(){this.byId=new Map(this.data.entities.map(e=>[e.id,e]));this.matrices=new Map();this._computing=new Set();}
  get(id){return this.byId.get(id);}
  world(id){if(this.matrices.has(id))return this.matrices.get(id);const e=this.get(id);if(!e)return identity();if(this._computing.has(id))throw Error('Cyclic transform hierarchy');this._computing.add(id);const m=e.parent?mmul(this.world(e.parent),compose(e.transform)):compose(e.transform);this._computing.delete(id);this.matrices.set(id,m);return m;}
  invalidate(){this.matrices.clear();this._computing.clear();}
  add(e){this.data.entities.push(e);this.byId.set(e.id,e);this.invalidate();return e;}
  remove(id){const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const e of this.data.entities)if(ids.has(e.parent)&&!ids.has(e.id)){ids.add(e.id);changed=true;}}this.data.entities=this.data.entities.filter(e=>!ids.has(e.id));this.reindex();}
  subtree(id){const result=[];const visit=x=>{const e=this.get(x);if(e){result.push(deepCopy(e));for(const c of this.data.entities.filter(c=>c.parent===x))visit(c.id);}};visit(id);return result;}
  duplicate(id){const list=this.subtree(id),map=new Map(list.map(e=>[e.id,uid()]));for(const e of list){e.id=map.get(e.id);e.parent=map.get(e.parent)||e.parent;this.add(e);}if(list[0]){list[0].name+=' copy';translateEntity(list[0],[1.5,0,0]);}return list[0];}
  serialize(){return deepCopy(this.data);}
}
class History {
  constructor(limit=60){this.limit=limit;this.past=[];this.future=[];}
  record(before,after,label='Edit'){if(JSON.stringify(before)===JSON.stringify(after))return false;this.past.push({before:deepCopy(before),after:deepCopy(after),label});if(this.past.length>this.limit)this.past.shift();this.future=[];return true;}
  undo(){const c=this.past.pop();if(!c)return null;this.future.push(c);return deepCopy(c.before);}
  redo(){const c=this.future.pop();if(!c)return null;this.past.push(c);return deepCopy(c.after);}
  clear(){this.past=[];this.future=[];}
}
function validateScene(input){
  if(!input||input.version!==SCENE_VERSION||!Array.isArray(input.entities)||!input.assets)throw Error('Not a Vanta Forge v1 project');
  if(input.entities.length>10000)throw Error('Project exceeds the 10,000 entity import limit');
  const data=deepCopy(input),ids=new Set();
  for(const e of data.entities){
    if(typeof e.id!=='string'||!e.id||ids.has(e.id))throw Error('Entity IDs must be unique strings');ids.add(e.id);
    if(typeof e.name!=='string'||!e.components)throw Error('Invalid entity record');
    for(const key of ['position','rotation','scale'])if(!Array.isArray(e.transform?.[key])||e.transform[key].length!==3||!e.transform[key].every(Number.isFinite))throw Error(`Invalid ${key} on ${e.name}`);
    if(e.transform.scale.some(s=>s<.01||s>10000))throw Error('Scale must be positive and between 0.01 and 10000');
    if(e.components.body?.type==='dynamic'&&e.parent)throw Error(`Dynamic body ${e.name} must be a root entity`);
    if(e.components.body?.type==='dynamic'&&!(e.components.body.mass>0))throw Error('Dynamic mass must be positive');
    if(e.components.mesh&&!Object.hasOwn(data.assets.materials||{},e.components.mesh.material))throw Error(`Missing material: ${e.components.mesh.material}`);
    if(e.components.mesh&&!['cube','sphere','cylinder','torus','crystal','terrain'].includes(e.components.mesh.asset)&&!Object.hasOwn(data.assets.meshes||{},e.components.mesh.asset))throw Error('Missing mesh asset');
    if(e.components.mesh?.asset==='terrain'&&(e.parent||e.transform.position.some(v=>v!==0)||e.transform.rotation.some(v=>v!==0)||e.transform.scale.some(v=>v!==1)||e.components.body?.type==='dynamic'))throw Error('Terrain must be an unparented, static identity-transform heightfield');
    const b=e.components.body;if(b){if(!['static','dynamic'].includes(b.type)||!['box','sphere'].includes(b.shape))throw Error('Unsupported rigid-body type or collider shape');if(b.velocity&&(!Array.isArray(b.velocity)||b.velocity.length!==3||!b.velocity.every(Number.isFinite)))throw Error('Invalid body velocity');for(const key of ['friction','restitution','radius','damping'])if(b[key]!=null&&(!Number.isFinite(b[key])||b[key]<0))throw Error('Invalid body parameter');}
    const anim=e.components.animation;if(anim){if(!Number.isFinite(anim.duration)||anim.duration<=0||!Array.isArray(anim.tracks)||anim.tracks.length>64)throw Error('Invalid animation');for(const t of anim.tracks){if(!/^(position|rotation|scale)\.[xyz]$/.test(t.property)||!Array.isArray(t.keys)||t.keys.length>2048)throw Error('Invalid animation track');let time=-Infinity;for(const k of t.keys){if(!Number.isFinite(k.time)||!Number.isFinite(k.value)||k.time<0||k.time<time)throw Error('Invalid or unsorted animation key');time=k.time;}}}
    const l=e.components.light;if(l&&(!['point','directional'].includes(l.type)||!/^#[a-f0-9]{6}$/i.test(l.color)||!Number.isFinite(l.intensity)||l.intensity<0))throw Error('Invalid light');
  }
  const lookup=new Map(data.entities.map(e=>[e.id,e]));for(const e of data.entities){const seen=new Set([e.id]);let p=e.parent;while(p){if(!ids.has(p))throw Error('Missing parent entity');if(seen.has(p))throw Error('Cyclic hierarchy');seen.add(p);p=lookup.get(p).parent;}}
  for(const m of Object.values(data.assets.materials||{})){
    if(!/^#[a-f0-9]{6}$/i.test(m.color)||![m.roughness,m.metallic,m.emission].every(Number.isFinite))throw Error('Invalid material');
    if(m.texture&&!/^data:image\/(png|jpeg|webp);base64,/.test(m.texture))throw Error('Texture must be an embedded PNG, JPEG, or WebP');
  }
  for(const mesh of Object.values(data.assets.meshes||{})){
    if(!Array.isArray(mesh.vertices)||!Array.isArray(mesh.indices)||mesh.vertices.length<24||mesh.indices.length<3||mesh.vertices.length%8||mesh.indices.length%3||mesh.vertices.length>8e6||!mesh.vertices.every(Number.isFinite)||!mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.vertices.length/8))throw Error('Invalid mesh asset');
  }
  if(data.assets.terrain){const t=data.assets.terrain;if(!Number.isInteger(t.resolution)||t.resolution<2||t.resolution>256||!(t.size>0)||!Array.isArray(t.heights)||t.heights.length!==(t.resolution+1)**2||!t.heights.every(Number.isFinite))throw Error('Invalid terrain asset');}
  data.assets.prefabs??={};data.assets.graphs??={};data.assets.meshes??={};
  for(const g of Object.values(data.assets.graphs)){const errors=validateGraph(g);if(errors.length)throw Error('Invalid graph: '+errors[0]);for(const n of g.nodes){if(!n.params||typeof n.params!=='object'||!Number.isFinite(n.x)||!Number.isFinite(n.y))throw Error('Invalid graph node');for(const [key,def] of Object.entries(NODE_TYPES[n.type].params)){const v=n.params[key];if(typeof v!==typeof def||(typeof v==='number'&&!Number.isFinite(v))||(typeof v==='string'&&v.length>4096))throw Error('Invalid node parameter');}}}
  for(const e of data.entities)if(e.components.graph&&!Object.hasOwn(data.assets.graphs,e.components.graph.asset))throw Error('Missing gameplay graph');
  if(!data.settings||!['ambient','exposure','fog'].every(k=>Number.isFinite(data.settings[k])&&data.settings[k]>=0))throw Error('Invalid environment settings');
  if(data.entities.filter(e=>e.components.mesh?.asset==='terrain').length>1)throw Error('Only one project heightfield is supported');
  return data;
}
class ProjectStore {
  static async db(){return new Promise((resolve,reject)=>{const req=indexedDB.open('vanta-forge',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  static async save(data){const db=await this.db();try{await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(deepCopy(data),'autosave');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
  static async load(){const db=await this.db();try{return await new Promise((resolve,reject)=>{const req=db.transaction('projects').objectStore('projects').get('autosave');req.onsuccess=()=>resolve(req.result?validateScene(req.result):null);req.onerror=()=>reject(req.error);});}finally{db.close();}}
}


// ===== src/assets.js =====

/** Asset payloads contain only JSON data. Typed arrays/BVH/GPU handles are derived caches. */
function makeMesh(vertices,indices){
  const v=new Float32Array(vertices),i=new Uint32Array(indices),bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
  for(let n=0;n<v.length;n+=8)for(let k=0;k<3;k++){bounds[0][k]=Math.min(bounds[0][k],v[n+k]);bounds[1][k]=Math.max(bounds[1][k],v[n+k]);}
  return {vertices:v,indices:i,bounds,version:1};
}
function cubeMesh(){const v=[],i=[];const face=(a,b,c,d,n)=>{const base=v.length/8;for(const [p,uv] of [[a,[0,0]],[b,[1,0]],[c,[1,1]],[d,[0,1]]])v.push(...p,...n,...uv);i.push(base,base+1,base+2,base,base+2,base+3);};
  face([-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[0,0,1]);
  face([.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[0,0,-1]);
  face([.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[1,0,0]);
  face([-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-1,0,0]);
  face([-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5],[0,1,0]);
  face([-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[0,-1,0]);return makeMesh(v,i);
}
function sphereMesh(rings=18,sectors=28){const v=[],i=[];for(let y=0;y<=rings;y++)for(let x=0;x<=sectors;x++){const a=y/rings*Math.PI,b=x/sectors*Math.PI*2,n=[Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];v.push(...n.map(x=>x*.5),...n,x/sectors,y/rings);}for(let y=0;y<rings;y++)for(let x=0;x<sectors;x++){const a=y*(sectors+1)+x,b=a+sectors+1;i.push(a,a+1,b,b,a+1,b+1);}return makeMesh(v,i);}
function cylinderMesh(sectors=32){const v=[],i=[];for(let y=0;y<2;y++)for(let x=0;x<=sectors;x++){const a=x/sectors*Math.PI*2,n=[Math.cos(a),0,Math.sin(a)];v.push(n[0]*.5,y-.5,n[2]*.5,...n,x/sectors,y);}for(let x=0;x<sectors;x++){const a=x,b=x+sectors+1;i.push(a,b,a+1,a+1,b,b+1);}for(let y=0;y<2;y++){const b=v.length/8;v.push(0,y-.5,0,0,y?1:-1,0,.5,.5);for(let x=0;x<=sectors;x++){const a=x/sectors*Math.PI*2;v.push(Math.cos(a)*.5,y-.5,Math.sin(a)*.5,0,y?1:-1,0,Math.cos(a)*.5+.5,Math.sin(a)*.5+.5);}for(let x=0;x<sectors;x++)y?i.push(b,b+x+2,b+x+1):i.push(b,b+x+1,b+x+2);}return makeMesh(v,i);}
function torusMesh(){const v=[],i=[],u=64,w=10;for(let a=0;a<=u;a++)for(let b=0;b<=w;b++){const p=a/u*Math.PI*2,q=b/w*Math.PI*2,c=Math.cos(p),s=Math.sin(p),cq=Math.cos(q),sq=Math.sin(q);v.push((.5+.055*cq)*c,(.5+.055*cq)*s,.055*sq,cq*c,cq*s,sq,a/u,b/w);}for(let a=0;a<u;a++)for(let b=0;b<w;b++){const k=a*(w+1)+b,j=k+w+1;i.push(k,j,k+1,k+1,j,j+1);}return makeMesh(v,i);}
function crystalMesh(){const v=[],i=[];const corners=[[.5,0,0],[0,0,.5],[-.5,0,0],[0,0,-.5]];for(let k=0;k<4;k++)for(let top=0;top<2;top++){const a=[0,top?.7:-.7,0],b=corners[k],c=corners[(k+1)%4],ps=top?[a,c,b]:[a,b,c],n=vnorm(vcross(vsub(ps[1],ps[0]),vsub(ps[2],ps[0]))),base=v.length/8;ps.forEach((p,j)=>v.push(...p,...n,j===1?1:0,j===0?1:0));i.push(base,base+1,base+2);}return makeMesh(v,i);}
function createTerrain(seed=9,resolution=80,size=130){const random=seeded(seed),phases=Array.from({length:5},()=>random()*9),heights=[];for(let z=0;z<=resolution;z++)for(let x=0;x<=resolution;x++){const wx=x/resolution*size-size/2,wz=z/resolution*size-size/2,d=Math.hypot(wx,wz),edge=clamp((d-18)/22,0,1);let h=Math.sin(wx*.09+phases[0])*3+Math.cos(wz*.1+phases[1])*4+Math.sin((wx+wz)*.21+phases[2])*1.5+Math.cos(wx*.32-wz*.13);h=(Math.abs(h)+1)*edge*1.65-.65;heights.push(h);}return {seed,resolution,size,heights,version:1};}
function terrainHeight(t,x,z){const n=t.resolution,s=t.size,fx=(x/s+.5)*n,fz=(z/s+.5)*n;if(fx<0||fz<0||fx>n||fz>n)return -100;const ix=Math.min(n-1,Math.floor(fx)),iz=Math.min(n-1,Math.floor(fz)),u=fx-ix,v=fz-iz,h=(a,b)=>t.heights[b*(n+1)+a];return v+u<=1?h(ix,iz)+(h(ix+1,iz)-h(ix,iz))*u+(h(ix,iz+1)-h(ix,iz))*v:h(ix+1,iz+1)+(h(ix,iz+1)-h(ix+1,iz+1))*(1-u)+(h(ix+1,iz)-h(ix+1,iz+1))*(1-v);}
function terrainMesh(t){const v=[],i=[],n=t.resolution,s=t.size,h=(x,z)=>t.heights[clamp(z,0,n)*(n+1)+clamp(x,0,n)];for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){const normal=vnorm([h(x-1,z)-h(x+1,z),2*s/n,h(x,z-1)-h(x,z+1)]);v.push(x/n*s-s/2,h(x,z),z/n*s-s/2,...normal,x/8,z/8);}for(let z=0;z<n;z++)for(let x=0;x<n;x++){const a=z*(n+1)+x,b=a+n+1;i.push(a,b,a+1,a+1,b,b+1);}const m=makeMesh(v,i);m.version=t.version||1;return m;}
function sculptTerrain(t,x,z,radius,strength){const n=t.resolution;for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const dx=i/n*t.size-t.size/2-x,dz=j/n*t.size-t.size/2-z,d=Math.hypot(dx,dz)/radius;if(d<1)t.heights[j*(n+1)+i]+=strength*(1-d*d)**2;}t.version=(t.version||1)+1;}
/** Median-split immutable triangle BVH, rebuilt only when a mesh changes. */
function buildBVH(mesh){const {vertices:v,indices:idx}=mesh,triangles=Array.from({length:idx.length/3},(_,i)=>i);const pos=i=>[v[i*8],v[i*8+1],v[i*8+2]];function build(tris){const b=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];for(const t of tris)for(let j=0;j<3;j++){const p=pos(idx[t*3+j]);for(let k=0;k<3;k++){b[0][k]=Math.min(b[0][k],p[k]);b[1][k]=Math.max(b[1][k],p[k]);}}if(tris.length<=12)return {b,tris};let axis=0;for(let k=1;k<3;k++)if(b[1][k]-b[0][k]>b[1][axis]-b[0][axis])axis=k;tris.sort((a,b)=>{let sa=0,sb=0;for(let j=0;j<3;j++){sa+=v[idx[a*3+j]*8+axis];sb+=v[idx[b*3+j]*8+axis];}return sa-sb;});const m=tris.length>>1;return {b,left:build(tris.slice(0,m)),right:build(tris.slice(m))};}return build(triangles);}
function intersectMesh(mesh,o,d){mesh.bvh??=buildBVH(mesh);const v=mesh.vertices,idx=mesh.indices;let best=Infinity;const pos=i=>[v[i*8],v[i*8+1],v[i*8+2]];function visit(n){const t=rayBox(o,d,n.b);if(t===null||t>best)return;if(n.tris){for(const tri of n.tris){const hit=rayTriangle(o,d,pos(idx[tri*3]),pos(idx[tri*3+1]),pos(idx[tri*3+2]));if(hit!==null&&hit<best)best=hit;}}else{visit(n.left);visit(n.right);}}visit(mesh.bvh);return best<Infinity?best:null;}
class Assets {
  constructor(data){this.data=data;this.cache=new Map();}
  mesh(id){const source=id==='terrain'?this.data.terrain:this.data.meshes?.[id],version=source?.version||1,prev=this.cache.get(id);if(prev&&prev.version===version)return prev;
    const factories={cube:cubeMesh,sphere:sphereMesh,cylinder:cylinderMesh,torus:torusMesh,crystal:crystalMesh,terrain:()=>terrainMesh(this.data.terrain)};
    const mesh=factories[id]?factories[id]():source?makeMesh(source.vertices,source.indices):cubeMesh();mesh.version=version;this.cache.set(id,mesh);return mesh;
  }
}
/** Self-contained worker function: OBJ fan triangulation and smooth-normal reconstruction. */
function objProcessor(text){
  const positions=[],normals=[],uvs=[],vertices=[],indices=[],map=new Map(),missing=[];
  const idx=(s,l)=>{const i=Number(s);if(!Number.isInteger(i)||i===0)throw Error('Invalid OBJ index');return i>0?i-1:l+i;};
  for(const raw of text.split(/\r?\n/)){const parts=raw.trim().split(/\s+/),tag=parts.shift();if(tag==='v'){const p=parts.slice(0,3).map(Number);if(p.length!==3||!p.every(Number.isFinite))throw Error('Invalid OBJ position');positions.push(p);}else if(tag==='vn')normals.push(parts.slice(0,3).map(Number));else if(tag==='vt')uvs.push(parts.slice(0,2).map(Number));else if(tag==='f'){
    const face=parts.filter(s=>s&&!s.startsWith('#')).map(token=>{if(map.has(token))return map.get(token);const [p,u,n]=token.split('/'),pi=idx(p,positions.length),uv=u?uvs[idx(u,uvs.length)]:[0,0],normal=n?normals[idx(n,normals.length)]:[0,0,0];if(!positions[pi]||!uv||!normal)throw Error('OBJ index out of range');const key=vertices.length/8;vertices.push(...positions[pi],...normal,...uv);missing[key]=!n;map.set(token,key);return key;});for(let i=1;i+1<face.length;i++)indices.push(face[0],face[i],face[i+1]);
  }}
  if(!indices.length)throw Error('OBJ has no triangle faces');if(vertices.length>8e6)throw Error('OBJ exceeds one million vertices');
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3).map(i=>i*8),ux=vertices[b]-vertices[a],uy=vertices[b+1]-vertices[a+1],uz=vertices[b+2]-vertices[a+2],vx=vertices[c]-vertices[a],vy=vertices[c+1]-vertices[a+1],vz=vertices[c+2]-vertices[a+2],n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];for(const base of [a,b,c])if(missing[base/8])for(let k=0;k<3;k++)vertices[base+3+k]+=n[k];}
  for(let i=0;i<vertices.length;i+=8){const l=Math.hypot(vertices[i+3],vertices[i+4],vertices[i+5])||1;for(let k=3;k<6;k++)vertices[i+k]/=l;}
  if(!vertices.every(Number.isFinite))throw Error('Non-finite OBJ values');return {vertices,indices,version:1};
}
async function importOBJ(text){if(text.length>50e6)throw Error('OBJ exceeds 50 MB');const source=`self.onmessage=e=>{try{self.postMessage({ok:true,mesh:(${objProcessor.toString()})(e.data)})}catch(e){self.postMessage({ok:false,error:e.message})}}`,url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));return new Promise((resolve,reject)=>{const worker=new Worker(url),finish=()=>{worker.terminate();URL.revokeObjectURL(url);};worker.onmessage=e=>{finish();e.data.ok?resolve(e.data.mesh):reject(Error(e.data.error));};worker.onerror=e=>{finish();reject(Error(e.message));};worker.postMessage(text);});}


// ===== src/graph.js =====

/** Typed, bounded interpreter. No eval, generated JavaScript, or implicit graph cycles. */
const NODE_TYPES={
  Start:{title:'On Begin Play',category:'event',inputs:{},outputs:{exec:'exec'},params:{}},
  Tick:{title:'On Fixed Tick',category:'event',inputs:{},outputs:{exec:'exec',delta:'number'},params:{}},
  Overlap:{title:'On Player Overlap',category:'event',inputs:{},outputs:{exec:'exec'},params:{}},
  Number:{title:'Number',category:'value',inputs:{},outputs:{value:'number'},params:{value:1}},
  Key:{title:'Key Is Down',category:'input',inputs:{},outputs:{value:'boolean'},params:{key:'KeyE'}},
  Time:{title:'Simulation Time',category:'value',inputs:{},outputs:{value:'number'},params:{}},
  Sine:{title:'Sine',category:'math',inputs:{value:'number'},outputs:{value:'number'},params:{value:0}},
  Multiply:{title:'Multiply',category:'math',inputs:{a:'number',b:'number'},outputs:{value:'number'},params:{a:1,b:2}},
  Greater:{title:'Greater Than',category:'math',inputs:{a:'number',b:'number'},outputs:{value:'boolean'},params:{a:1,b:0}},
  Branch:{title:'Branch',category:'flow',inputs:{exec:'exec',condition:'boolean'},outputs:{yes:'exec',no:'exec'},params:{condition:true}},
  Rotate:{title:'Rotate Actor',category:'action',inputs:{exec:'exec',speed:'number'},outputs:{exec:'exec'},params:{axis:'y',speed:60}},
  Translate:{title:'Translate Actor',category:'action',inputs:{exec:'exec',speed:'number'},outputs:{exec:'exec'},params:{axis:'y',speed:1}},
  Impulse:{title:'Apply Impulse',category:'action',inputs:{exec:'exec',force:'number'},outputs:{exec:'exec'},params:{axis:'y',force:7}},
  Score:{title:'Add Score',category:'action',inputs:{exec:'exec',amount:'number'},outputs:{exec:'exec'},params:{amount:1}},
  Destroy:{title:'Destroy Actor',category:'action',inputs:{exec:'exec'},outputs:{exec:'exec'},params:{}},
  Message:{title:'Show Message',category:'action',inputs:{exec:'exec'},outputs:{exec:'exec'},params:{text:'Hello from your gameplay graph'}},
  Respawn:{title:'Respawn Player',category:'action',inputs:{exec:'exec'},outputs:{exec:'exec'},params:{}}
};
function graphNode(type,id,x=40,y=40){if(!NODE_TYPES[type])throw Error('Unknown node type');return {id,type,x,y,params:structuredClone(NODE_TYPES[type].params)};}
function validateGraph(graph){const errors=[],nodes=new Map(),incoming=new Set();if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))return ['Graph nodes and edges must be arrays'];if(graph.nodes.length>500)return ['Graph exceeds 500 nodes'];for(const n of graph.nodes){if(nodes.has(n.id))errors.push('Duplicate node ID');nodes.set(n.id,n);if(!NODE_TYPES[n.type])errors.push(`Unknown node ${n.type}`);}for(const e of graph.edges){const a=nodes.get(e.from),b=nodes.get(e.to),at=NODE_TYPES[a?.type]?.outputs[e.out],bt=NODE_TYPES[b?.type]?.inputs[e.in];if(!at||!bt||at!==bt)errors.push(`Incompatible wire ${e.from}.${e.out} → ${e.to}.${e.in}`);const key=`${e.to}.${e.in}`;if(incoming.has(key))errors.push(`Multiple wires into ${key}`);incoming.add(key);}
  const visiting=new Set(),done=new Set();function visit(id){if(visiting.has(id)){errors.push('Cycles are not permitted; use a Tick event');return;}if(done.has(id))return;visiting.add(id);for(const e of graph.edges.filter(e=>e.from===id))visit(e.to);visiting.delete(id);done.add(id);}for(const n of graph.nodes)visit(n.id);return [...new Set(errors)];}
class GraphProgram {
  constructor(graph){const errors=validateGraph(graph);if(errors.length)throw Error(errors.join('; '));this.nodes=new Map(graph.nodes.map(n=>[n.id,n]));this.inputs=new Map(graph.edges.map(e=>[`${e.to}.${e.in}`,e]));this.outputs=new Map();for(const e of graph.edges){const k=`${e.from}.${e.out}`;if(!this.outputs.has(k))this.outputs.set(k,[]);this.outputs.get(k).push(e);}this.events={};for(const n of graph.nodes)if(NODE_TYPES[n.type].category==='event')(this.events[n.type]??=[]).push(n.id);}
  run(event,actor,ctx){let budget=256;const memo=new Map();const read=(node,key)=>{const edge=this.inputs.get(`${node.id}.${key}`);return edge?value(edge.from,edge.out):node.params[key];};
    const value=(id,port)=>{const key=`${id}.${port}`;if(memo.has(key))return memo.get(key);if(--budget<0)throw Error('Graph evaluation budget exceeded');const n=this.nodes.get(id);let v=0;switch(n.type){case 'Number':v=n.params.value;break;case 'Key':v=ctx.keys.has(n.params.key);break;case 'Time':v=ctx.time;break;case 'Tick':v=ctx.dt;break;case 'Sine':v=Math.sin(Number(read(n,'value')));break;case 'Multiply':v=Number(read(n,'a'))*Number(read(n,'b'));break;case 'Greater':v=Number(read(n,'a'))>Number(read(n,'b'));break;}if(typeof v==='number'&&!Number.isFinite(v))v=0;memo.set(key,v);return v;};
    const emit=(id,port='exec')=>{for(const edge of this.outputs.get(`${id}.${port}`)||[])execute(edge.to);};
    const execute=id=>{if(--budget<0)throw Error('Graph execution budget exceeded');const n=this.nodes.get(id),axis=Math.max(0,'xyz'.indexOf(n.params.axis)),num=k=>clamp(Number(read(n,k))||0,-1e5,1e5);ctx.lastNodes?.add(id);switch(n.type){case 'Branch':emit(id,read(n,'condition')?'yes':'no');return;case 'Rotate':actor.transform.rotation[axis]+=num('speed')*ctx.dt;break;case 'Translate':actor.transform.position[axis]+=num('speed')*ctx.dt;break;case 'Impulse':if(actor.components.body?.type==='dynamic'){const body=actor.components.body;body.velocity??=[0,0,0];body.velocity[axis]+=num('force')/body.mass;}break;case 'Score':ctx.addScore(num('amount'));break;case 'Destroy':ctx.destroy(actor.id);break;case 'Message':ctx.message(String(n.params.text));break;case 'Respawn':ctx.respawn();break;}emit(id);};for(const id of this.events[event]||[]){ctx.lastNodes?.add(id);emit(id);}
  }
}
function pickupGraph(){return {id:'pickup',name:'BP_EnergyShard',nodes:[graphNode('Overlap','overlap',45,70),{...graphNode('Score','score',300,70),params:{amount:1}},graphNode('Destroy','destroy',550,70),graphNode('Tick','tick',45,280),{...graphNode('Rotate','rotate',300,280),params:{axis:'y',speed:70}}],edges:[{from:'overlap',out:'exec',to:'score',in:'exec'},{from:'score',out:'exec',to:'destroy',in:'exec'},{from:'tick',out:'exec',to:'rotate',in:'exec'}]};}


// ===== src/physics.js =====


/** Uniform-grid broadphase; stable ID-sorted pair processing and translational impulses. */
class SpatialHash {
  constructor(size=4){this.size=size;this.cells=new Map();this.global=[];}
  insert(item,bounds){const lo=bounds[0].map(x=>Math.floor(x/this.size)),hi=bounds[1].map(x=>Math.floor(x/this.size));if((hi[0]-lo[0]+1)*(hi[1]-lo[1]+1)*(hi[2]-lo[2]+1)>512){this.global.push(item);return;}for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){const k=`${x},${y},${z}`;if(!this.cells.has(k))this.cells.set(k,[]);this.cells.get(k).push(item);}}
  pairs(items){const pairs=new Map(),put=(a,b)=>{if(a.id===b.id||(!a.dynamic&&!b.dynamic))return;const [x,y]=a.id<b.id?[a,b]:[b,a];pairs.set(`${x.id}|${y.id}`,[x,y]);};for(const bucket of this.cells.values())for(let i=0;i<bucket.length;i++)for(let j=i+1;j<bucket.length;j++)put(bucket[i],bucket[j]);for(const a of this.global)for(const b of items)put(a,b);return [...pairs.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(x=>x[1]);}
}
function collisionContact(a,b){
  if(a.shape==='sphere'&&b.shape==='sphere'){const d=vsub(a.center,b.center),l=Math.hypot(...d),p=a.radius+b.radius-l;return p>0?{normal:l>1e-8?vmul(d,1/l):[0,1,0],depth:p}:null;}
  if(a.shape==='sphere'||b.shape==='sphere'){const s=a.shape==='sphere'?a:b,box=s===a?b:a,p=s.center.map((v,k)=>clamp(v,box.bounds[0][k],box.bounds[1][k])),d=vsub(s.center,p),l=Math.hypot(...d);let n,depth;if(l>1e-8){depth=s.radius-l;if(depth<=0)return null;n=vmul(d,1/l);}else{let min=Infinity,axis=0,sign=1;for(let k=0;k<3;k++)for(const side of [0,1]){const dist=Math.abs(s.center[k]-box.bounds[side][k]);if(dist<min){min=dist;axis=k;sign=side?1:-1;}}n=[0,0,0];n[axis]=sign;depth=s.radius+min;}return {normal:s===a?n:vmul(n,-1),depth};}
  let depth=Infinity,axis=0;for(let k=0;k<3;k++){const p=Math.min(a.bounds[1][k],b.bounds[1][k])-Math.max(a.bounds[0][k],b.bounds[0][k]);if(p<=0)return null;if(p<depth){depth=p;axis=k;}}const normal=[0,0,0];normal[axis]=a.center[axis]>=b.center[axis]?1:-1;return {normal,depth};
}
class PhysicsWorld {
  constructor(scene,assets){this.scene=scene;this.assets=assets;this.grounded=new Set();this.overlaps=new Set();this.stats={pairs:0,contacts:0};}
  colliders(){return this.scene.data.entities.filter(e=>e.components.body&&e.visible!==false&&e.components.mesh?.asset!=='terrain').sort((a,b)=>a.id.localeCompare(b.id)).map(e=>{const body=e.components.body,m=this.scene.world(e.id),local=body.halfExtents?[body.halfExtents.map(x=>-x),body.halfExtents]:this.assets.mesh(e.components.mesh?.asset||'cube').bounds,bounds=boundsTransform(local,m),center=bounds[0].map((v,k)=>(v+bounds[1][k])*.5),radius=(body.radius??.5)*Math.max(...e.transform.scale),shape=body.shape||'box';if(shape==='sphere'){bounds[0]=center.map(x=>x-radius);bounds[1]=center.map(x=>x+radius);}return {id:e.id,e,body,bounds,center,radius,shape,dynamic:body.type==='dynamic',trigger:!!body.trigger};});}
  step(dt){const scene=this.scene;this.grounded.clear();for(const e of scene.data.entities){const b=e.components.body;if(b?.type==='dynamic'){b.velocity??=[0,0,0];b.velocity[1]+=(b.gravity===false?0:-22)*dt;const damping=Math.exp(-(b.damping??.08)*dt);for(let k=0;k<3;k++){b.velocity[k]=clamp(b.velocity[k]*damping,-80,80);e.transform.position[k]+=b.velocity[k]*dt;}}}scene.invalidate();
    let colliders=this.colliders(),hash=new SpatialHash();for(const c of colliders)hash.insert(c,c.bounds);const pairs=hash.pairs(colliders),now=new Set(),events=[];this.stats={pairs:pairs.length,contacts:0};
    for(let pass=0;pass<4;pass++)for(const [a,b] of pairs){const c=collisionContact(a,b);if(!c)continue;if(pass===0){this.stats.contacts++;if(a.trigger||b.trigger){const key=`${a.id}|${b.id}`;now.add(key);if(!this.overlaps.has(key))events.push([a.e,b.e]);}}if(a.trigger||b.trigger)continue;const ia=a.dynamic?1/a.body.mass:0,ib=b.dynamic?1/b.body.mass:0,sum=ia+ib;if(!sum)continue;const n=c.normal,amount=Math.max(c.depth-.001,0)*.85/sum;const move=(o,s)=>{if(!o.dynamic)return;for(let k=0;k<3;k++){const d=n[k]*amount*s;o.e.transform.position[k]+=d;o.center[k]+=d;o.bounds[0][k]+=d;o.bounds[1][k]+=d;}};move(a,ia);move(b,-ib);
      if(a.dynamic&&n[1]>.5)this.grounded.add(a.id);if(b.dynamic&&n[1]<-.5)this.grounded.add(b.id);
      const va=a.body.velocity||[0,0,0],vb=b.body.velocity||[0,0,0],rel=vsub(va,vb),vn=vdot(rel,n);if(vn<0){const bounce=Math.min(a.body.restitution??.05,b.body.restitution??.05),j=-(1+(vn<-.5?bounce:0))*vn/sum;for(let k=0;k<3;k++){if(a.dynamic)va[k]+=n[k]*j*ia;if(b.dynamic)vb[k]-=n[k]*j*ib;}const tangent=vsub(rel,vmul(n,vn)),len=Math.hypot(...tangent);if(len>1e-6){const friction=Math.sqrt((a.body.friction??.6)*(b.body.friction??.6)),jt=Math.min(len/sum,j*friction),t=vmul(tangent,1/len);for(let k=0;k<3;k++){if(a.dynamic)va[k]-=t[k]*jt*ia;if(b.dynamic)vb[k]+=t[k]*jt*ib;}}}
    }
    const terrainEntity=scene.data.entities.find(e=>e.components.mesh?.asset==='terrain'&&e.visible!==false&&e.components.body);if(terrainEntity){const terrain=scene.data.assets.terrain;for(const c of colliders){if(!c.dynamic||c.trigger)continue;const floor=terrainHeight(terrain,c.center[0],c.center[2]),bottom=c.bounds[0][1];if(bottom<floor){c.e.transform.position[1]+=floor-bottom;const v=c.body.velocity;v[1]=Math.max(0,-v[1]*(c.body.restitution??0));v[0]*=Math.exp(-2*dt);v[2]*=Math.exp(-2*dt);this.grounded.add(c.id);}}}
    this.overlaps=now;scene.invalidate();return events;
  }
}


// ===== src/renderer.js =====

const VERTEX_STRIDE=32,INSTANCE_STRIDE=144;
const FORGE_WGSL=`
struct Frame { vp:mat4x4f, lightVP:mat4x4f, eye:vec4f, sun:vec4f, sunColor:vec4f, env:vec4f, points:array<vec4f,16> };
@group(0) @binding(0) var<uniform> frame:Frame;
@group(0) @binding(1) var shadowMap:texture_depth_2d;
@group(0) @binding(2) var shadowSampler:sampler_comparison;
@group(1) @binding(0) var colorMap:texture_2d<f32>;
@group(1) @binding(1) var colorSampler:sampler;
struct Vin { @location(0) p:vec3f, @location(1) n:vec3f, @location(2) uv:vec2f,
@location(3) m0:vec4f,@location(4) m1:vec4f,@location(5) m2:vec4f,@location(6) m3:vec4f,
@location(7) n0:vec4f,@location(8) n1:vec4f,@location(9) n2:vec4f,@location(10) color:vec4f,@location(11) material:vec4f };
struct Vout { @builtin(position) clip:vec4f,@location(0) world:vec3f,@location(1) normal:vec3f,@location(2) uv:vec2f,@location(3) @interpolate(flat) color:vec4f,@location(4) @interpolate(flat) material:vec4f };
@vertex fn vs(v:Vin)->Vout {var o:Vout;let model=mat4x4f(v.m0,v.m1,v.m2,v.m3);let w=model*vec4f(v.p,1);o.clip=frame.vp*w;o.world=w.xyz;o.normal=mat3x3f(v.n0.xyz,v.n1.xyz,v.n2.xyz)*v.n;o.uv=v.uv;o.color=v.color;o.material=v.material;return o;}
@vertex fn shadowVS(v:Vin)->@builtin(position) vec4f {return frame.lightVP*mat4x4f(v.m0,v.m1,v.m2,v.m3)*vec4f(v.p,1);}
fn fresnel(c:f32,f0:vec3f)->vec3f{return f0+(vec3f(1)-f0)*pow(clamp(1-c,0,1),5);}
fn brdf(n:vec3f,v:vec3f,l:vec3f,base:vec3f,rough:f32,metal:f32)->vec3f{
let h=normalize(v+l);let nl=max(dot(n,l),0.0);let nv=max(dot(n,v),0.001);let nh=max(dot(n,h),0.0);let vh=max(dot(v,h),0.0);let a=rough*rough;let a2=a*a;let d=a2/(3.14159265*pow(nh*nh*(a2-1)+1,2)+0.00001);let k=pow(rough+1,2)/8;let g=(nl/(nl*(1-k)+k))*(nv/(nv*(1-k)+k));let f=fresnel(vh,mix(vec3f(.04),base,metal));return ((vec3f(1)-f)*(1-metal)*base/3.14159265+d*g*f/(4*nl*nv+.0001))*nl;
}
fn visibility(p:vec3f,n:vec3f)->f32{let q=frame.lightVP*vec4f(p,1);let ndc=q.xyz/q.w;let uv=ndc.xy*vec2f(.5,-.5)+.5;if(any(uv<vec2f(0))||any(uv>vec2f(1))||ndc.z<0||ndc.z>1){return 1;}let bias=max(.00035*(1-dot(n,frame.sun.xyz)),.00012);var s=0.0;for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){s+=textureSampleCompareLevel(shadowMap,shadowSampler,uv+vec2f(f32(x),f32(y))/2048.0,ndc.z-bias);}}return s/9;}
fn aces(x:vec3f)->vec3f{return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3f(0),vec3f(1));}
@fragment fn fs(i:Vout)->@location(0) vec4f{
let n=normalize(i.normal);let v=normalize(frame.eye.xyz-i.world);let tex=textureSample(colorMap,colorSampler,i.uv).rgb;var base=pow(i.color.rgb,vec3f(2.2))*tex;let rough=clamp(i.material.x,.045,1);let metal=clamp(i.material.y,0,1);let gridWidth=max(fwidth(i.world.xz*.5),vec2f(.001));
if((u32(round(i.material.w))&2u)!=0u){let q=abs(fract(i.world.xz*.5-.5)-.5)/gridWidth;let line=1-min(min(q.x,q.y),1);base=mix(base,base*1.65,line*.2);}
var color=base*frame.env.x*mix(.58,1.25,n.y*.5+.5)*(1-metal*.65);color+=brdf(n,v,frame.sun.xyz,base,rough,metal)*frame.sunColor.rgb*frame.sunColor.w*visibility(i.world,n);
for(var j=0;j<8;j++){if(f32(j)>=frame.env.w){break;}let p=frame.points[j*2];let c=frame.points[j*2+1];let d=p.xyz-i.world;let dist=length(d);let fall=pow(clamp(1-dist/p.w,0,1),2);color+=brdf(n,v,normalize(d),base,rough,metal)*c.rgb*c.w*fall/(1+dist*dist*.1);}
color+=base*i.material.z;if((u32(round(i.material.w))&1u)!=0u){color+=vec3f(.15,.65,.7)*pow(1-max(dot(n,v),0),3)*1.5;}
let distance=length(frame.eye.xyz-i.world);let fog=1-exp(-distance*frame.env.y);color=mix(color,vec3f(.22,.31,.38),clamp(fog,0,.8));return vec4f(pow(aces(color*frame.env.z),vec3f(1.0/2.2)),1);
}
struct SkyOut{@builtin(position) p:vec4f,@location(0) uv:vec2f};
@vertex fn skyVS(@builtin(vertex_index) id:u32)->SkyOut{var o:SkyOut;let p=vec2f(f32((id<<1u)&2u),f32(id&2u));o.uv=p;o.p=vec4f(p*2-1,.99999,1);return o;}
@fragment fn skyFS(i:SkyOut)->@location(0) vec4f{let y=clamp(i.uv.y,0,1);let col=mix(vec3f(.56,.62,.65),vec3f(.11,.20,.27),pow(y,.65));let glow=exp(-length((i.uv-vec2f(.73,.68))*vec2f(1,1.4))*5);return vec4f(col+vec3f(.15,.1,.035)*glow,1);}
`;
const GL_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNormal;layout(location=2) in vec2 aUV;
layout(location=3) in vec4 m0;layout(location=4) in vec4 m1;layout(location=5) in vec4 m2;layout(location=6) in vec4 m3;
layout(location=7) in vec4 n0;layout(location=8) in vec4 n1;layout(location=9) in vec4 n2;layout(location=10) in vec4 aColor;layout(location=11) in vec4 aMaterial;
uniform mat4 uVP;out vec3 world;out vec3 normal;out vec2 uv;flat out vec4 color;flat out vec4 material;
void main(){vec4 w=mat4(m0,m1,m2,m3)*vec4(aPos,1);gl_Position=uVP*w;gl_Position.z=gl_Position.z*2.-gl_Position.w;world=w.xyz;normal=mat3(n0.xyz,n1.xyz,n2.xyz)*aNormal;uv=aUV;color=aColor;material=aMaterial;}`;
const GL_FRAGMENT=`#version 300 es
precision highp float;
in vec3 world;in vec3 normal;in vec2 uv;flat in vec4 color;flat in vec4 material;out vec4 frag;
uniform vec4 uEye,uSun,uSunColor,uEnv,uPoints[16];uniform mat4 uLightVP;uniform sampler2D uShadow,uTexture;
vec3 fresnel(float c,vec3 f0){return f0+(1.-f0)*pow(clamp(1.-c,0.,1.),5.);}
vec3 brdf(vec3 n,vec3 v,vec3 l,vec3 base,float rough,float metal){vec3 h=normalize(v+l);float nl=max(dot(n,l),0.),nv=max(dot(n,v),.001),nh=max(dot(n,h),0.),vh=max(dot(v,h),0.),a=rough*rough,a2=a*a,d=a2/(3.14159265*pow(nh*nh*(a2-1.)+1.,2.)+.00001),k=pow(rough+1.,2.)/8.,g=(nl/(nl*(1.-k)+k))*(nv/(nv*(1.-k)+k));vec3 f=fresnel(vh,mix(vec3(.04),base,metal));return ((1.-f)*(1.-metal)*base/3.14159265+d*g*f/(4.*nl*nv+.0001))*nl;}
float visibility(vec3 p,vec3 n){vec4 q=uLightVP*vec4(p,1);vec3 ndc=q.xyz/q.w;vec2 uv=ndc.xy*.5+.5;if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1)))||ndc.z<0.||ndc.z>1.)return 1.;float bias=max(.00035*(1.-dot(n,uSun.xyz)),.00012),s=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)s+=ndc.z-bias<=texture(uShadow,uv+vec2(x,y)/2048.).r?1.:0.;return s/9.;}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec3 n=normalize(normal),v=normalize(uEye.xyz-world),base=pow(color.rgb,vec3(2.2))*pow(texture(uTexture,uv).rgb,vec3(2.2));float rough=clamp(material.x,.045,1.),metal=clamp(material.y,0.,1.);if((int(round(material.w))&2)!=0){vec2 q=abs(fract(world.xz*.5-.5)-.5)/max(fwidth(world.xz*.5),vec2(.001));float line=1.-min(min(q.x,q.y),1.);base=mix(base,base*1.65,line*.2);}vec3 c=base*uEnv.x*mix(.58,1.25,n.y*.5+.5)*(1.-metal*.65)+brdf(n,v,uSun.xyz,base,rough,metal)*uSunColor.rgb*uSunColor.w*visibility(world,n);for(int j=0;j<8;j++){if(float(j)>=uEnv.w)break;vec4 p=uPoints[j*2],pc=uPoints[j*2+1];vec3 d=p.xyz-world;float dist=length(d),fall=pow(clamp(1.-dist/p.w,0.,1.),2.);c+=brdf(n,v,normalize(d),base,rough,metal)*pc.rgb*pc.w*fall/(1.+dist*dist*.1);}c+=base*material.z;if((int(round(material.w))&1)!=0)c+=vec3(.15,.65,.7)*pow(1.-max(dot(n,v),0.),3.)*1.5;float fog=1.-exp(-length(uEye.xyz-world)*uEnv.y);c=mix(c,vec3(.22,.31,.38),clamp(fog,0.,.8));frag=vec4(pow(aces(c*uEnv.z),vec3(1./2.2)),1);}`;
const GL_SKY_V=`#version 300 es
precision highp float;out vec2 uv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,.99999,1);}`;
const GL_SKY_F=`#version 300 es
precision highp float;in vec2 uv;out vec4 frag;void main(){float y=clamp(uv.y,0.,1.);vec3 c=mix(vec3(.56,.62,.65),vec3(.11,.20,.27),pow(y,.65));float glow=exp(-length((uv-vec2(.73,.68))*vec2(1,1.4))*5.);frag=vec4(c+vec3(.15,.1,.035)*glow,1);}`;
class GPUBackend {
  async init(canvas,onError){
    if(!navigator.gpu)throw Error('WebGPU is not exposed by this browser');const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('No WebGPU adapter');this.device=await adapter.requestDevice();const d=this.device;this.onError=onError;d.addEventListener('uncapturederror',e=>onError(e.error.message));d.lost.then(info=>onError(`GPU device lost: ${info.message}. Reload to restore the device.`));this.canvas=canvas;this.context=canvas.getContext('webgpu');this.format=navigator.gpu.getPreferredCanvasFormat();this.context.configure({device:d,format:this.format,alphaMode:'opaque'});
    const module=d.createShaderModule({label:'Vanta PBR / shadow / sky',code:FORGE_WGSL});const messages=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');if(messages.length)throw Error(messages.map(m=>`${m.lineNum}: ${m.message}`).join('\n'));
    this.frameBuffer=d.createBuffer({size:448,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.frameLayout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'depth'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'comparison'}}]});
    this.textureLayout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},{binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}}]});
    this.shadowLayout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'uniform'}}]});
    this.shadow=d.createTexture({label:'2048 PCF shadow map',size:[2048,2048],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});this.shadowView=this.shadow.createView();
    this.shadowSampler=d.createSampler({compare:'less-equal',magFilter:'linear',minFilter:'linear'});this.textureSampler=d.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'repeat',addressModeV:'repeat'});
    this.frameGroup=d.createBindGroup({layout:this.frameLayout,entries:[{binding:0,resource:{buffer:this.frameBuffer}},{binding:1,resource:this.shadowView},{binding:2,resource:this.shadowSampler}]});this.shadowGroup=d.createBindGroup({layout:this.shadowLayout,entries:[{binding:0,resource:{buffer:this.frameBuffer}}]});
    const buffers=[{arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32x2'}]},{arrayStride:144,stepMode:'instance',attributes:Array.from({length:9},(_,i)=>({shaderLocation:i+3,offset:i*16,format:'float32x4'}))}];
    const layout=d.createPipelineLayout({bindGroupLayouts:[this.frameLayout,this.textureLayout]});
    this.main=await d.createRenderPipelineAsync({label:'GGX metallic/roughness instanced',layout,vertex:{module,entryPoint:'vs',buffers},fragment:{module,entryPoint:'fs',targets:[{format:this.format}]},primitive:{topology:'triangle-list',cullMode:'back'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'},multisample:{count:4}});
    this.shadowPipeline=await d.createRenderPipelineAsync({label:'Directional shadow depth',layout:d.createPipelineLayout({bindGroupLayouts:[this.shadowLayout]}),vertex:{module,entryPoint:'shadowVS',buffers},primitive:{topology:'triangle-list',cullMode:'back'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less',depthBias:2,depthBiasSlopeScale:2}});
    this.sky=await d.createRenderPipelineAsync({layout:d.createPipelineLayout({bindGroupLayouts:[]}),vertex:{module,entryPoint:'skyVS'},fragment:{module,entryPoint:'skyFS',targets:[{format:this.format}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth24plus',depthWriteEnabled:false,depthCompare:'always'},multisample:{count:4}});
    this.meshes=new Map();this.instances=new Map();this.textures=new Map();this.white=this.makeTexture(new Uint8Array([255,255,255,255]),1,1);return 'WebGPU';
  }
  makeTexture(data,w,h){const d=this.device,t=d.createTexture({size:[w,h],format:'rgba8unorm-srgb',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});if(data instanceof Uint8Array)d.queue.writeTexture({texture:t},data,{bytesPerRow:w*4},[w,h]);else d.queue.copyExternalImageToTexture({source:data},{texture:t},[w,h]);return {texture:t,group:d.createBindGroup({layout:this.textureLayout,entries:[{binding:0,resource:t.createView()},{binding:1,resource:this.textureSampler}]})};}
  texture(material){const key=material.texture;if(!key)return this.white.group;const old=this.textures.get(key);if(old)return old.group||this.white.group;this.textures.set(key,{pending:true});fetch(key).then(r=>r.blob()).then(b=>createImageBitmap(b)).then(image=>{this.textures.set(key,this.makeTexture(image,image.width,image.height));image.close();}).catch(e=>{this.onError(`Texture: ${e.message}`);this.textures.set(key,this.white);});return this.white.group;}
  mesh(mesh){let old=this.meshes.get(mesh);if(old)return old;const d=this.device,v=d.createBuffer({size:mesh.vertices.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),i=d.createBuffer({size:mesh.indices.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});d.queue.writeBuffer(v,0,mesh.vertices);d.queue.writeBuffer(i,0,mesh.indices);old={v,i,count:mesh.indices.length,last:this.frame};this.meshes.set(mesh,old);return old;}
  resize(w,h){if(this.width===w&&this.height===h)return;this.width=w;this.height=h;this.canvas.width=w;this.canvas.height=h;this.depth?.destroy();this.color?.destroy();this.depth=this.device.createTexture({size:[w,h],sampleCount:4,format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT});this.color=this.device.createTexture({size:[w,h],sampleCount:4,format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT});}
  draw(frame,main,shadow,w,h){this.frame=(this.frame||0)+1;this.resize(w,h);const d=this.device;d.queue.writeBuffer(this.frameBuffer,0,frame);const prepare=(groups,prefix)=>groups.map(g=>{const key=prefix+g.key;let b=this.instances.get(key);if(!b||b.capacity<g.data.byteLength){b?.buffer.destroy();const capacity=2**Math.ceil(Math.log2(Math.max(144,g.data.byteLength)));b={buffer:d.createBuffer({size:capacity,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),capacity};this.instances.set(key,b);}b.last=this.frame;d.queue.writeBuffer(b.buffer,0,g.data);const mesh=this.mesh(g.mesh);mesh.last=this.frame;return {...g,buffer:b.buffer,gpu:mesh,texture:this.texture(g.material)};});const sm=prepare(shadow,'S'),mn=prepare(main,'M');
    const encoder=d.createCommandEncoder();let pass=encoder.beginRenderPass({label:'Shadow pass',colorAttachments:[],depthStencilAttachment:{view:this.shadowView,depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});pass.setPipeline(this.shadowPipeline);pass.setBindGroup(0,this.shadowGroup);for(const g of sm){pass.setVertexBuffer(0,g.gpu.v);pass.setVertexBuffer(1,g.buffer);pass.setIndexBuffer(g.gpu.i,'uint32');pass.drawIndexed(g.gpu.count,g.count);}pass.end();
    pass=encoder.beginRenderPass({label:'Forward PBR + sky',colorAttachments:[{view:this.color.createView(),resolveTarget:this.context.getCurrentTexture().createView(),clearValue:{r:.12,g:.2,b:.26,a:1},loadOp:'clear',storeOp:'discard'}],depthStencilAttachment:{view:this.depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'discard'}});pass.setPipeline(this.sky);pass.draw(3);pass.setPipeline(this.main);pass.setBindGroup(0,this.frameGroup);for(const g of mn){pass.setBindGroup(1,g.texture);pass.setVertexBuffer(0,g.gpu.v);pass.setVertexBuffer(1,g.buffer);pass.setIndexBuffer(g.gpu.i,'uint32');pass.drawIndexed(g.gpu.count,g.count);}pass.end();d.queue.submit([encoder.finish()]);
    if(this.frame%240===0){for(const [k,b] of this.instances)if(this.frame-b.last>240){b.buffer.destroy();this.instances.delete(k);}for(const [k,b] of this.meshes)if(this.frame-b.last>240){b.v.destroy();b.i.destroy();this.meshes.delete(k);}}
  }
  dispose(){this.device?.destroy();}
}
class GLBackend {
  async init(canvas,onError){this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});if(!this.gl)throw Error('Neither WebGPU nor WebGL2 is available');this.onError=onError;const gl=this.gl;this.main=this.program(GL_VERTEX,GL_FRAGMENT);this.shadowProgram=this.program(GL_VERTEX,'#version 300 es\nprecision highp float;void main(){}');this.sky=this.program(GL_SKY_V,GL_SKY_F);this.frame=0;this.meshes=new Map();this.instances=new Map();this.textures=new Map();this.white=this.makeTexture(new Uint8Array([255,255,255,255]),1,1);
    this.shadow=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.shadow);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,2048,2048,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);this.shadowFBO=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFBO);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadow,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Shadow framebuffer incomplete');gl.bindFramebuffer(gl.FRAMEBUFFER,null);return 'WebGL2 fallback';
  }
  program(vs,fs){const gl=this.gl,p=gl.createProgram();for(const [type,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);gl.deleteShader(s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return {p,u:new Map()};}
  uniform(p,name){if(!p.u.has(name))p.u.set(name,this.gl.getUniformLocation(p.p,name));return p.u.get(name);}
  makeTexture(data,w,h){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);if(data instanceof Uint8Array)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);return t;}
  texture(m){if(!m.texture)return this.white;if(this.textures.has(m.texture))return this.textures.get(m.texture)||this.white;this.textures.set(m.texture,null);const image=new Image();image.onload=()=>this.textures.set(m.texture,this.makeTexture(image));image.onerror=()=>this.onError('Texture decoding failed');image.src=m.texture;return this.white;}
  mesh(mesh){if(this.meshes.has(mesh)){const result=this.meshes.get(mesh);result.last=this.frame;return result;}const gl=this.gl,v=gl.createBuffer(),i=gl.createBuffer(),vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,v);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);for(const [loc,size,offset] of [[0,3,0],[1,3,12],[2,2,24]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,32,offset);}gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,i);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);const result={v,i,vao,count:mesh.indices.length,last:this.frame};this.meshes.set(mesh,result);return result;}
  draw(frame,main,shadow,w,h){this.frame++;const gl=this.gl;if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}const drawGroups=(groups,program,prefix)=>{gl.useProgram(program.p);for(const g of groups){const mesh=this.mesh(g.mesh),key=prefix+g.key;let instance=this.instances.get(key);if(!instance){instance={buffer:gl.createBuffer(),last:this.frame};this.instances.set(key,instance);}instance.last=this.frame;gl.bindVertexArray(mesh.vao);gl.bindBuffer(gl.ARRAY_BUFFER,instance.buffer);gl.bufferData(gl.ARRAY_BUFFER,g.data,gl.DYNAMIC_DRAW);for(let i=0;i<9;i++){gl.enableVertexAttribArray(i+3);gl.vertexAttribPointer(i+3,4,gl.FLOAT,false,144,i*16);gl.vertexAttribDivisor(i+3,1);}if(program===this.main){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.texture(g.material));}gl.drawElementsInstanced(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0,g.count);}};
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFBO);gl.viewport(0,0,2048,2048);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(this.shadowProgram.p);gl.uniformMatrix4fv(this.uniform(this.shadowProgram,'uVP'),false,frame.subarray(16,32));gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(2,2);drawGroups(shadow,this.shadowProgram,'S');gl.disable(gl.POLYGON_OFFSET_FILL);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.clearColor(.12,.2,.26,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.bindVertexArray(null);gl.useProgram(this.sky.p);gl.drawArrays(gl.TRIANGLES,0,3);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);
    const p=this.main;gl.useProgram(p.p);gl.uniformMatrix4fv(this.uniform(p,'uVP'),false,frame.subarray(0,16));gl.uniformMatrix4fv(this.uniform(p,'uLightVP'),false,frame.subarray(16,32));for(const [name,offset] of [['uEye',32],['uSun',36],['uSunColor',40],['uEnv',44]])gl.uniform4fv(this.uniform(p,name),frame.subarray(offset,offset+4));gl.uniform4fv(this.uniform(p,'uPoints[0]'),frame.subarray(48,112));gl.uniform1i(this.uniform(p,'uShadow'),0);gl.uniform1i(this.uniform(p,'uTexture'),1);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shadow);drawGroups(main,p,'M');gl.bindVertexArray(null);if(this.frame%240===0){for(const [key,m] of this.meshes)if(this.frame-m.last>240){gl.deleteBuffer(m.v);gl.deleteBuffer(m.i);gl.deleteVertexArray(m.vao);this.meshes.delete(key);}for(const [key,i] of this.instances)if(this.frame-i.last>240){gl.deleteBuffer(i.buffer);this.instances.delete(key);}}
  }
  dispose(){this.gl?.getExtension('WEBGL_lose_context')?.loseContext();}
}
class Renderer {
  constructor(canvas,onError=console.error){this.canvas=canvas;this.onError=onError;this.stats={draws:0,triangles:0,visible:0,total:0};}
  async init(forceGL=false){if(!forceGL){try{this.backend=new GPUBackend();this.name=await this.backend.init(this.canvas,this.onError);return;}catch(e){this.onError(`WebGPU: ${e.message}`);this.backend?.dispose();if(this.canvas.getContext('webgpu')){const old=this.canvas,replacement=old.cloneNode();old.replaceWith(replacement);this.canvas=replacement;}}}this.backend=new GLBackend();this.name=await this.backend.init(this.canvas,this.onError);}
  render(scene,assets,camera,selection=null){const rect=this.canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.floor(rect.width*ratio)),h=Math.max(1,Math.floor(rect.height*ratio));if(!rect.width||!rect.height)return;
    const vp=mmul(camera.projection(rect.width/rect.height),lookAt(camera.eye,camera.target)),planes=frustumPlanes(vp),settings=scene.data.settings||{},sunEntity=scene.data.entities.find(e=>e.components.light?.type==='directional'&&e.visible!==false),sun=sunEntity?.components.light||{direction:[-.5,.85,.3],color:'#ffebcc',intensity:4},sunDir=vnorm(sun.direction||[-.5,.85,.3]),lightTarget=[camera.target[0],0,camera.target[2]],lightVP=mmul(ortho(-36,36,-36,36,.1,140),lookAt(vadd(lightTarget,vmul(sunDir,65)),lightTarget)),lightPlanes=frustumPlanes(lightVP),frame=new Float32Array(112);frame.set(vp);frame.set(lightVP,16);frame.set([...camera.eye,1],32);frame.set([...sunDir,0],36);frame.set([...hexRGB(sun.color),sun.intensity],40);
    const pointLights=scene.data.entities.filter(e=>e.components.light?.type==='point'&&e.visible!==false).slice(0,8);frame.set([settings.ambient??.45,settings.fog??.008,settings.exposure??1.15,pointLights.length],44);pointLights.forEach((e,i)=>{const l=e.components.light;frame.set([...point(scene.world(e.id),[0,0,0]),l.range||12],48+i*8);frame.set([...hexRGB(l.color),l.intensity],52+i*8);});
    const main=new Map(),shadow=new Map();let visible=0,total=0,triangles=0;const add=(map,e,mesh,matrix,material)=>{const key=e.components.mesh.asset+'|'+e.components.mesh.material;let group=map.get(key);if(!group){group={key,mesh,material,records:[]};map.set(key,group);}const inv=inverse(matrix),record=new Float32Array(36);record.set(matrix);if(inv)for(let c=0;c<3;c++)record.set([inv[c],inv[c+4],inv[c+8],0],16+c*4);record.set([...hexRGB(material.color),1],28);record.set([material.roughness,material.metallic,material.emission,(e.id===selection?1:0)+(material.grid?2:0)],32);group.records.push(record);};
    for(const e of scene.data.entities){const component=e.components.mesh;if(!component||e.visible===false)continue;let parent=e.parent,hidden=false;while(parent){const p=scene.get(parent);if(!p)break;if(p.visible===false){hidden=true;break;}parent=p.parent;}if(hidden)continue;total++;const mesh=assets.mesh(component.asset),matrix=scene.world(e.id),bounds=boundsTransform(mesh.bounds,matrix),material=scene.data.assets.materials[component.material]||scene.data.assets.materials.stone;if(inFrustum(bounds,planes)){add(main,e,mesh,matrix,material);visible++;triangles+=mesh.indices.length/3;}if(component.castShadow!==false&&inFrustum(bounds,lightPlanes))add(shadow,e,mesh,matrix,material);}
    const pack=map=>[...map.values()].map(g=>{const data=new Float32Array(g.records.length*36);g.records.forEach((r,i)=>data.set(r,i*36));return {key:g.key,mesh:g.mesh,material:g.material,data,count:g.records.length};});const mg=pack(main),sg=pack(shadow);this.backend.draw(frame,mg,sg,w,h);this.vp=vp;this.stats={draws:mg.length+sg.length+1,mainDraws:mg.length,triangles,visible,total,instances:visible};return vp;
  }
}


// ===== src/runtime.js =====






class Camera {
  constructor(){this.target=[0,1.4,-1.2];this.yaw=.56;this.pitch=.34;this.distance=28;this.fov=52;this.orbit();}
  orbit(){this.eye=vadd(this.target,[Math.sin(this.yaw)*Math.cos(this.pitch)*this.distance,Math.sin(this.pitch)*this.distance,Math.cos(this.yaw)*Math.cos(this.pitch)*this.distance]);}
  projection(aspect){return perspective(rad(this.fov),aspect,.08,450);}
  focus(position,size=4){this.target=[...position];this.distance=Math.max(4,size*2.5);this.orbit();}
}
class InputState {
  constructor(){this.keys=new Set();this.pressed=new Set();this.released=new Set();}
  down(code){if(!this.keys.has(code))this.pressed.add(code);this.keys.add(code);}
  up(code){this.keys.delete(code);this.released.add(code);}
  clear(){this.keys.clear();this.pressed.clear();this.released.clear();}
  endTick(){this.pressed.clear();this.released.clear();}
}
class GameRuntime {
  constructor(data,{onMessage=()=>{},onScore=()=>{},onError=console.error}={}){
    this.scene=new Scene(validateScene(data));this.assets=new Assets(this.scene.data.assets);this.physics=new PhysicsWorld(this.scene,this.assets);this.input=new InputState();this.camera=new Camera();this.time=0;this.tick=0;this.accumulator=0;this.fixedDt=1/120;this.maxSteps=12;this.score=0;this.targetScore=this.scene.data.entities.filter(e=>e.components.collectible).reduce((n,e)=>n+(e.components.collectible.value||1),0);this.onMessage=onMessage;this.onScore=onScore;this.onError=onError;this.programs=new Map();this.destroyQueue=new Set();this.lastNodes=new Set();this.paused=false;this.droppedTime=0;this.disabledGraphs=new Set();
    this.player=this.scene.data.entities.find(e=>e.components.player&&e.components.controller);this.spawn=this.player?[...this.player.transform.position]:[0,2,6];
    for(const [id,g] of Object.entries(this.scene.data.assets.graphs))try{this.programs.set(id,new GraphProgram(g));}catch(e){onError(`${g.name}: ${e.message}`);}
    for(const e of this.ordered())this.event('Start',e);this.flush();if(this.player)this.follow(1);
  }
  ordered(){return [...this.scene.data.entities].sort((a,b)=>a.id.localeCompare(b.id));}
  event(type,e){const id=e.components.graph?.asset,program=this.programs.get(id);if(!program||this.disabledGraphs.has(e.id))return;try{program.run(type,e,{time:this.time,dt:this.fixedDt,keys:this.input.keys,lastNodes:this.lastNodes,addScore:n=>{this.score+=n;this.onScore(this.score,this.targetScore);if(this.targetScore>0&&this.score>=this.targetScore)this.onMessage('RELAY RESTORED · All energy shards collected');},destroy:id=>this.destroyQueue.add(id),message:this.onMessage,respawn:()=>this.respawn()});}catch(error){this.onError(`Graph on ${e.name}: ${error.message}`);this.disabledGraphs.add(e.id);}}
  flush(){for(const id of this.destroyQueue)this.scene.remove(id);this.destroyQueue.clear();}
  controller(dt){const p=this.player;if(!p||!this.scene.get(p.id))return;const body=p.components.body;if(!body||body.type!=='dynamic')return;body.velocity??=[0,0,0];const keys=this.input.keys,front=vnorm([this.camera.target[0]-this.camera.eye[0],0,this.camera.target[2]-this.camera.eye[2]]),right=[-front[2],0,front[0]],x=+(keys.has('KeyD')||keys.has('ArrowRight'))-+(keys.has('KeyA')||keys.has('ArrowLeft')),z=+(keys.has('KeyW')||keys.has('ArrowUp'))-+(keys.has('KeyS')||keys.has('ArrowDown')),move=vnorm(vadd(vmul(front,z),vmul(right,x))),speed=p.components.controller.speed||6.5,factor=1-Math.exp(-18*dt);body.velocity[0]+=(move[0]*speed-body.velocity[0])*factor;body.velocity[2]+=(move[2]*speed-body.velocity[2])*factor;if(x||z)p.transform.rotation[1]=deg(Math.atan2(-move[0],-move[2]));if(this.input.pressed.has('Space')&&this.physics.grounded.has(p.id))body.velocity[1]=p.components.controller.jump||8.5;if(p.transform.position[1]<-20)this.respawn();}
  animate(dt){for(const e of this.ordered()){const a=e.components.animation;if(!a||a.enabled===false||a.duration<=0)continue;const t=a.loop?this.time%a.duration:Math.min(this.time,a.duration);for(const track of a.tracks||[]){const keys=track.keys;if(!keys?.length)continue;let value=keys[0].value;if(t>=keys.at(-1).time)value=keys.at(-1).value;else for(let i=0;i<keys.length-1;i++){const l=keys[i],r=keys[i+1];if(t>=l.time&&t<=r.time){const k=(t-l.time)/Math.max(1e-8,r.time-l.time);value=l.value+(r.value-l.value)*k;break;}}const [property,axis]=track.property.split('.'),index='xyz'.indexOf(axis);if(['position','rotation','scale'].includes(property)&&index>=0&&Number.isFinite(value))e.transform[property][index]=property==='scale'?Math.max(.01,value):value;}}}
  step(){const dt=this.fixedDt;this.lastNodes.clear();this.controller(dt);for(const e of this.ordered())this.event('Tick',e);this.animate(dt);this.scene.invalidate();const collisions=this.physics.step(dt);for(const [a,b] of collisions){if(a.components.player&&!this.destroyQueue.has(b.id))this.event('Overlap',b);if(b.components.player&&!this.destroyQueue.has(a.id))this.event('Overlap',a);}this.flush();this.input.endTick();this.tick++;this.time=this.tick*dt;}
  update(realDt){if(!this.paused){this.accumulator+=Math.min(realDt,.25);let n=0;while(this.accumulator>=this.fixedDt&&n<this.maxSteps){this.step();this.accumulator-=this.fixedDt;n++;}if(this.accumulator>=this.fixedDt){const dropped=this.accumulator-this.accumulator%this.fixedDt;this.droppedTime+=dropped;this.accumulator%=this.fixedDt;}}this.follow(realDt);}
  follow(dt){if(!this.player)return;const p=this.player.transform.position,target=vadd(p,[0,.4,0]),eye=vadd(p,[7,7,10]),alpha=dt>=1?1:1-Math.exp(-7*dt);this.camera.target=vlerp(this.camera.target,target,alpha);this.camera.eye=vlerp(this.camera.eye,eye,alpha);}
  respawn(){if(!this.player)return;this.player.transform.position=[...this.spawn];this.player.components.body.velocity=[0,0,0];this.scene.invalidate();this.onMessage('Rover respawned at Player Start');}
}
async function launchStandalone(data){
  const canvas=document.querySelector('#game'),status=document.querySelector('#status'),renderer=new Renderer(canvas,m=>{console.warn(m);if(status)status.textContent=m;}),runtime=new GameRuntime(data,{onMessage:m=>{document.querySelector('#message').textContent=m;},onScore:(n,t)=>{document.querySelector('#score').textContent=`${n} / ${t}`;}});await renderer.init(new URLSearchParams(location.search).has('webgl'));document.querySelector('#backend').textContent=renderer.name;document.querySelector('#score').textContent=`0 / ${runtime.targetScore}`;if(status)status.textContent='WASD / arrows to move · Space to jump · R to respawn';
  addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='KeyR')runtime.respawn();runtime.input.down(e.code);});addEventListener('keyup',e=>runtime.input.up(e.code));addEventListener('blur',()=>runtime.input.clear());document.querySelector('#restart').onclick=()=>location.reload();
  for(const button of document.querySelectorAll('[data-key]')){button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);runtime.input.down(button.dataset.key);};button.onpointerup=()=>runtime.input.up(button.dataset.key);button.onpointercancel=()=>runtime.input.up(button.dataset.key);}
  let last=performance.now();function frame(now){const dt=Math.min((now-last)/1000,.1);last=now;runtime.update(dt);renderer.render(runtime.scene,runtime.assets,runtime.camera);document.querySelector('#timer').textContent=runtime.time.toFixed(1)+' s';requestAnimationFrame(frame);}requestAnimationFrame(frame);window.vantaGame={runtime,renderer};return {runtime,renderer};
}

window.VantaRuntime={launchStandalone,GameRuntime,Scene,Assets,Camera,InputState,Renderer};
})();
