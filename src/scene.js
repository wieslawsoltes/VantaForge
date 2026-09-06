import {compose,mmul,deepCopy,identity} from './math.js';
import {validateGraph,NODE_TYPES} from './graph.js';
export const SCENE_VERSION=1;
let nextID=1;
export const uid=(prefix='e')=>`${prefix}_${Date.now().toString(36)}_${(nextID++).toString(36)}`;
export function entity(name,mesh='cube',position=[0,0,0],scale=[1,1,1],material='stone') {
  return {id:uid(),name,parent:null,visible:true,locked:false,transform:{position:[...position],rotation:[0,0,0],scale:[...scale]},components:mesh?{mesh:{asset:mesh,material,castShadow:true}}:{}};
}
/** Offset a local transform and all absolute position keys together. */
export function translateEntity(e,delta){
  if(!Array.isArray(delta)||delta.length!==3||!delta.every(Number.isFinite))throw Error('Translation must be three finite coordinates');
  e.transform.position=e.transform.position.map((v,i)=>v+delta[i]);
  for(const track of e.components.animation?.tracks||[]){const match=/^position\.([xyz])$/.exec(track.property);if(match)for(const key of track.keys)key.value+=delta['xyz'.indexOf(match[1])];}
  return e;
}
export class Scene {
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
export class History {
  constructor(limit=60){this.limit=limit;this.past=[];this.future=[];}
  record(before,after,label='Edit'){if(JSON.stringify(before)===JSON.stringify(after))return false;this.past.push({before:deepCopy(before),after:deepCopy(after),label});if(this.past.length>this.limit)this.past.shift();this.future=[];return true;}
  undo(){const c=this.past.pop();if(!c)return null;this.future.push(c);return deepCopy(c.before);}
  redo(){const c=this.future.pop();if(!c)return null;this.past.push(c);return deepCopy(c.after);}
  clear(){this.past=[];this.future=[];}
}
export function validateScene(input){
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
export class ProjectStore {
  static async db(){return new Promise((resolve,reject)=>{const req=indexedDB.open('vanta-forge',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  static async save(data){const db=await this.db();try{await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(deepCopy(data),'autosave');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
  static async load(){const db=await this.db();try{return await new Promise((resolve,reject)=>{const req=db.transaction('projects').objectStore('projects').get('autosave');req.onsuccess=()=>resolve(req.result?validateScene(req.result):null);req.onerror=()=>reject(req.error);});}finally{db.close();}}
}
