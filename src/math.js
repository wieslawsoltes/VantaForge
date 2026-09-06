/** Column-major matrices, right-handed world, +Y up, WebGPU depth [0, 1]. */
export const EPS = 1e-8;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const rad = d => d * Math.PI / 180;
export const deg = r => r * 180 / Math.PI;
export const vadd = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const vsub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const vmul = (a,s) => [a[0]*s,a[1]*s,a[2]*s];
export const vdot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const vcross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const vlength = a => Math.hypot(...a);
export const vnorm = a => vmul(a,1/(vlength(a)||1));
export const vlerp = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
export const identity = () => new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
export function mmul(a,b) {
  const o = new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return o;
}
export function compose(t) {
  const [x,y,z]=t.rotation.map(rad),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z),s=t.scale;
  return new Float32Array([
    cz*cy*s[0],sz*cy*s[0],-sy*s[0],0,
    (cz*sy*sx-sz*cx)*s[1],(sz*sy*sx+cz*cx)*s[1],cy*sx*s[1],0,
    (cz*sy*cx+sz*sx)*s[2],(sz*sy*cx-cz*sx)*s[2],cy*cx*s[2],0,
    ...t.position,1]);
}
export function inverse(a) {
  const o=identity(),m=Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>c<4?a[c*4+r]:+(c-4===r)));
  for(let c=0;c<4;c++) {
    let p=c; for(let r=c+1;r<4;r++) if(Math.abs(m[r][c])>Math.abs(m[p][c]))p=r;
    if(Math.abs(m[p][c])<EPS)return null;
    [m[c],m[p]]=[m[p],m[c]];const k=m[c][c];for(let j=0;j<8;j++)m[c][j]/=k;
    for(let r=0;r<4;r++)if(r!==c){const f=m[r][c];for(let j=0;j<8;j++)m[r][j]-=f*m[c][j];}
  }
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=m[r][c+4];return o;
}
export function point(m,p) {const w=m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];return [0,1,2].map(i=>(m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12])/w);}
export const direction=(m,p)=>[0,1,2].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]);
export function perspective(fov,aspect,near=.1,far=500) {const f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,far/(near-far),-1,0,0,far*near/(near-far),0]);}
export function ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,1/(n-f),0,-(r+l)/(r-l),-(t+b)/(t-b),n/(n-f),1]);}
export function lookAt(eye,target,up=[0,1,0]) {let z=vnorm(vsub(eye,target));if(vlength(z)<1e-8)z=[0,0,1];if(Math.abs(vdot(z,vnorm(up)))>.9999)up=Math.abs(z[2])<.9?[0,0,1]:[1,0,0];const x=vnorm(vcross(up,z)),y=vcross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-vdot(x,eye),-vdot(y,eye),-vdot(z,eye),1]);}
export function boundsTransform(b,m){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<8;i++){const p=point(m,[b[i&1?1:0][0],b[i&2?1:0][1],b[i&4?1:0][2]]);for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}}return [min,max];}
export function frustumPlanes(m){const row=r=>[m[r],m[4+r],m[8+r],m[12+r]],a=row(3),r0=row(0),r1=row(1),r2=row(2);return [a.map((v,i)=>v+r0[i]),a.map((v,i)=>v-r0[i]),a.map((v,i)=>v+r1[i]),a.map((v,i)=>v-r1[i]),r2,a.map((v,i)=>v-r2[i])].map(p=>{const l=Math.hypot(p[0],p[1],p[2]);return p.map(v=>v/l);});}
export const inFrustum=(b,planes)=>planes.every(p=>p[0]*b[p[0]>=0?1:0][0]+p[1]*b[p[1]>=0?1:0][1]+p[2]*b[p[2]>=0?1:0][2]+p[3]>=0);
export function rayBox(o,d,b){let lo=0,hi=Infinity;for(let k=0;k<3;k++){if(Math.abs(d[k])<EPS){if(o[k]<b[0][k]||o[k]>b[1][k])return null;}else{let a=(b[0][k]-o[k])/d[k],z=(b[1][k]-o[k])/d[k];if(a>z)[a,z]=[z,a];lo=Math.max(lo,a);hi=Math.min(hi,z);if(lo>hi)return null;}}return lo;}
export function rayTriangle(o,d,a,b,c){const e1=vsub(b,a),e2=vsub(c,a),h=vcross(d,e2),det=vdot(e1,h);if(Math.abs(det)<EPS)return null;const f=1/det,s=vsub(o,a),u=f*vdot(s,h);if(u<0||u>1)return null;const q=vcross(s,e1),v=f*vdot(d,q);if(v<0||u+v>1)return null;const t=f*vdot(e2,q);return t>=0?t:null;}
export function cameraRay(x,y,w,h,vp){const inv=inverse(vp),p=point(inv,[x/w*2-1,1-y/h*2,0]),q=point(inv,[x/w*2-1,1-y/h*2,1]);return {origin:p,dir:vnorm(vsub(q,p))};}
export function screenPoint(p,vp,w,h){const q=point(vp,p);return [(q[0]+1)*.5*w,(1-q[1])*.5*h,q[2]];}
export const hexRGB=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
export const deepCopy=o=>structuredClone(o);
export function seeded(seed=1){let s=seed>>>0;return ()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
