import {vsub,vcross,vnorm,rayBox,rayTriangle,seeded,clamp} from './math.js';
/** Asset payloads contain only JSON data. Typed arrays/BVH/GPU handles are derived caches. */
export function makeMesh(vertices,indices){
  const v=new Float32Array(vertices),i=new Uint32Array(indices),bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
  for(let n=0;n<v.length;n+=8)for(let k=0;k<3;k++){bounds[0][k]=Math.min(bounds[0][k],v[n+k]);bounds[1][k]=Math.max(bounds[1][k],v[n+k]);}
  return {vertices:v,indices:i,bounds,version:1};
}
export function cubeMesh(){const v=[],i=[];const face=(a,b,c,d,n)=>{const base=v.length/8;for(const [p,uv] of [[a,[0,0]],[b,[1,0]],[c,[1,1]],[d,[0,1]]])v.push(...p,...n,...uv);i.push(base,base+1,base+2,base,base+2,base+3);};
  face([-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[0,0,1]);
  face([.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[0,0,-1]);
  face([.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[1,0,0]);
  face([-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-1,0,0]);
  face([-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5],[0,1,0]);
  face([-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[0,-1,0]);return makeMesh(v,i);
}
export function sphereMesh(rings=18,sectors=28){const v=[],i=[];for(let y=0;y<=rings;y++)for(let x=0;x<=sectors;x++){const a=y/rings*Math.PI,b=x/sectors*Math.PI*2,n=[Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];v.push(...n.map(x=>x*.5),...n,x/sectors,y/rings);}for(let y=0;y<rings;y++)for(let x=0;x<sectors;x++){const a=y*(sectors+1)+x,b=a+sectors+1;i.push(a,a+1,b,b,a+1,b+1);}return makeMesh(v,i);}
export function cylinderMesh(sectors=32){const v=[],i=[];for(let y=0;y<2;y++)for(let x=0;x<=sectors;x++){const a=x/sectors*Math.PI*2,n=[Math.cos(a),0,Math.sin(a)];v.push(n[0]*.5,y-.5,n[2]*.5,...n,x/sectors,y);}for(let x=0;x<sectors;x++){const a=x,b=x+sectors+1;i.push(a,b,a+1,a+1,b,b+1);}for(let y=0;y<2;y++){const b=v.length/8;v.push(0,y-.5,0,0,y?1:-1,0,.5,.5);for(let x=0;x<=sectors;x++){const a=x/sectors*Math.PI*2;v.push(Math.cos(a)*.5,y-.5,Math.sin(a)*.5,0,y?1:-1,0,Math.cos(a)*.5+.5,Math.sin(a)*.5+.5);}for(let x=0;x<sectors;x++)y?i.push(b,b+x+2,b+x+1):i.push(b,b+x+1,b+x+2);}return makeMesh(v,i);}
export function torusMesh(){const v=[],i=[],u=64,w=10;for(let a=0;a<=u;a++)for(let b=0;b<=w;b++){const p=a/u*Math.PI*2,q=b/w*Math.PI*2,c=Math.cos(p),s=Math.sin(p),cq=Math.cos(q),sq=Math.sin(q);v.push((.5+.055*cq)*c,(.5+.055*cq)*s,.055*sq,cq*c,cq*s,sq,a/u,b/w);}for(let a=0;a<u;a++)for(let b=0;b<w;b++){const k=a*(w+1)+b,j=k+w+1;i.push(k,j,k+1,k+1,j,j+1);}return makeMesh(v,i);}
export function crystalMesh(){const v=[],i=[];const corners=[[.5,0,0],[0,0,.5],[-.5,0,0],[0,0,-.5]];for(let k=0;k<4;k++)for(let top=0;top<2;top++){const a=[0,top?.7:-.7,0],b=corners[k],c=corners[(k+1)%4],ps=top?[a,c,b]:[a,b,c],n=vnorm(vcross(vsub(ps[1],ps[0]),vsub(ps[2],ps[0]))),base=v.length/8;ps.forEach((p,j)=>v.push(...p,...n,j===1?1:0,j===0?1:0));i.push(base,base+1,base+2);}return makeMesh(v,i);}
export function createTerrain(seed=9,resolution=80,size=130){const random=seeded(seed),phases=Array.from({length:5},()=>random()*9),heights=[];for(let z=0;z<=resolution;z++)for(let x=0;x<=resolution;x++){const wx=x/resolution*size-size/2,wz=z/resolution*size-size/2,d=Math.hypot(wx,wz),edge=clamp((d-18)/22,0,1);let h=Math.sin(wx*.09+phases[0])*3+Math.cos(wz*.1+phases[1])*4+Math.sin((wx+wz)*.21+phases[2])*1.5+Math.cos(wx*.32-wz*.13);h=(Math.abs(h)+1)*edge*1.65-.65;heights.push(h);}return {seed,resolution,size,heights,version:1};}
export function terrainHeight(t,x,z){const n=t.resolution,s=t.size,fx=(x/s+.5)*n,fz=(z/s+.5)*n;if(fx<0||fz<0||fx>n||fz>n)return -100;const ix=Math.min(n-1,Math.floor(fx)),iz=Math.min(n-1,Math.floor(fz)),u=fx-ix,v=fz-iz,h=(a,b)=>t.heights[b*(n+1)+a];return v+u<=1?h(ix,iz)+(h(ix+1,iz)-h(ix,iz))*u+(h(ix,iz+1)-h(ix,iz))*v:h(ix+1,iz+1)+(h(ix,iz+1)-h(ix+1,iz+1))*(1-u)+(h(ix+1,iz)-h(ix+1,iz+1))*(1-v);}
export function terrainMesh(t){const v=[],i=[],n=t.resolution,s=t.size,h=(x,z)=>t.heights[clamp(z,0,n)*(n+1)+clamp(x,0,n)];for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){const normal=vnorm([h(x-1,z)-h(x+1,z),2*s/n,h(x,z-1)-h(x,z+1)]);v.push(x/n*s-s/2,h(x,z),z/n*s-s/2,...normal,x/8,z/8);}for(let z=0;z<n;z++)for(let x=0;x<n;x++){const a=z*(n+1)+x,b=a+n+1;i.push(a,b,a+1,a+1,b,b+1);}const m=makeMesh(v,i);m.version=t.version||1;return m;}
export function sculptTerrain(t,x,z,radius,strength){const n=t.resolution;for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const dx=i/n*t.size-t.size/2-x,dz=j/n*t.size-t.size/2-z,d=Math.hypot(dx,dz)/radius;if(d<1)t.heights[j*(n+1)+i]+=strength*(1-d*d)**2;}t.version=(t.version||1)+1;}
/** Median-split immutable triangle BVH, rebuilt only when a mesh changes. */
export function buildBVH(mesh){const {vertices:v,indices:idx}=mesh,triangles=Array.from({length:idx.length/3},(_,i)=>i);const pos=i=>[v[i*8],v[i*8+1],v[i*8+2]];function build(tris){const b=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];for(const t of tris)for(let j=0;j<3;j++){const p=pos(idx[t*3+j]);for(let k=0;k<3;k++){b[0][k]=Math.min(b[0][k],p[k]);b[1][k]=Math.max(b[1][k],p[k]);}}if(tris.length<=12)return {b,tris};let axis=0;for(let k=1;k<3;k++)if(b[1][k]-b[0][k]>b[1][axis]-b[0][axis])axis=k;tris.sort((a,b)=>{let sa=0,sb=0;for(let j=0;j<3;j++){sa+=v[idx[a*3+j]*8+axis];sb+=v[idx[b*3+j]*8+axis];}return sa-sb;});const m=tris.length>>1;return {b,left:build(tris.slice(0,m)),right:build(tris.slice(m))};}return build(triangles);}
export function intersectMesh(mesh,o,d){mesh.bvh??=buildBVH(mesh);const v=mesh.vertices,idx=mesh.indices;let best=Infinity;const pos=i=>[v[i*8],v[i*8+1],v[i*8+2]];function visit(n){const t=rayBox(o,d,n.b);if(t===null||t>best)return;if(n.tris){for(const tri of n.tris){const hit=rayTriangle(o,d,pos(idx[tri*3]),pos(idx[tri*3+1]),pos(idx[tri*3+2]));if(hit!==null&&hit<best)best=hit;}}else{visit(n.left);visit(n.right);}}visit(mesh.bvh);return best<Infinity?best:null;}
export class Assets {
  constructor(data){this.data=data;this.cache=new Map();}
  mesh(id){const source=id==='terrain'?this.data.terrain:this.data.meshes?.[id],version=source?.version||1,prev=this.cache.get(id);if(prev&&prev.version===version)return prev;
    const factories={cube:cubeMesh,sphere:sphereMesh,cylinder:cylinderMesh,torus:torusMesh,crystal:crystalMesh,terrain:()=>terrainMesh(this.data.terrain)};
    const mesh=factories[id]?factories[id]():source?makeMesh(source.vertices,source.indices):cubeMesh();mesh.version=version;this.cache.set(id,mesh);return mesh;
  }
}
/** Self-contained worker function: OBJ fan triangulation and smooth-normal reconstruction. */
export function objProcessor(text){
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
export async function importOBJ(text){if(text.length>50e6)throw Error('OBJ exceeds 50 MB');const source=`self.onmessage=e=>{try{self.postMessage({ok:true,mesh:(${objProcessor.toString()})(e.data)})}catch(e){self.postMessage({ok:false,error:e.message})}}`,url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));return new Promise((resolve,reject)=>{const worker=new Worker(url),finish=()=>{worker.terminate();URL.revokeObjectURL(url);};worker.onmessage=e=>{finish();e.data.ok?resolve(e.data.mesh):reject(Error(e.data.error));};worker.onerror=e=>{finish();reject(Error(e.message));};worker.postMessage(text);});}
