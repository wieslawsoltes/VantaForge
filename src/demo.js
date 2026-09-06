import {entity,uid,SCENE_VERSION} from './scene.js';
import {createTerrain} from './assets.js';
import {pickupGraph} from './graph.js';
import {seeded} from './math.js';
export function createDemo(){
  const materials={
    stone:{name:'M_Basalt',color:'#637079',roughness:.79,metallic:.12,emission:0},
    dark:{name:'M_Carbon',color:'#26383f',roughness:.42,metallic:.65,emission:0},
    sand:{name:'M_Sandstone',color:'#817460',roughness:.97,metallic:0,emission:0},
    floor:{name:'M_GridFloor',color:'#49565f',roughness:.83,metallic:.08,emission:0,grid:true},
    mint:{name:'M_IonTeal',color:'#48d0a7',roughness:.23,metallic:.25,emission:1.8},
    gold:{name:'M_Amber',color:'#ffb85c',roughness:.28,metallic:.55,emission:.25},
    emissiveGold:{name:'M_Shard',color:'#ffc467',roughness:.17,metallic:.38,emission:1.0},
    white:{name:'M_Ceramic',color:'#d6e0dc',roughness:.35,metallic:.12,emission:0},
    red:{name:'M_Coral',color:'#d77460',roughness:.64,metallic:.05,emission:0},
    blue:{name:'M_BlueAlloy',color:'#6c97b3',roughness:.38,metallic:.62,emission:0}
  };
  const data={version:SCENE_VERSION,name:'Aether Relay',description:'Third-person collection sandbox',settings:{ambient:.38,fog:.006,exposure:1.05},assets:{materials,meshes:{},terrain:createTerrain(),graphs:{pickup:pickupGraph()},prefabs:{}},entities:[]};
  let count=0;const add=(name,mesh,pos,scale,material,body=false)=>{const e=entity(name,mesh,pos,scale,material);e.id='demo_'+String(++count).padStart(3,'0');if(body)e.components.body={type:'static',shape:'box',mass:1,friction:.7,restitution:.02};data.entities.push(e);return e;};
  const landscape=add('Landscape','terrain',[0,0,0],[1,1,1],'sand',true);landscape.locked=true;
  add('Relay platform','cube',[0,-.58,0],[24,1.1,22],'floor',true);
  add('Foundation trim','cube',[0,-.92,0],[24.45,.28,22.45],'dark');
  // Distinctive relay architecture, constructed from instanced reusable meshes.
  const portal=add('Aether Gate',null,[0,0,0],[1,1,1],'stone');portal.components.tag={value:'Landmark'};
  const child=(...args)=>{const e=add(...args);e.parent=portal.id;return e;};
  child('Gate · left pylon','cube',[-3.3,2.75,-5.5],[1.25,5.5,1.65],'stone',true);
  child('Gate · right pylon','cube',[3.3,2.75,-5.5],[1.25,5.5,1.65],'stone',true);
  child('Gate · lintel','cube',[0,5.55,-5.5],[7.9,.8,1.85],'stone',true);
  child('Gate · crown','cube',[0,6.05,-5.5],[6.8,.18,1.4],'dark');
  child('Gate · inner beam','cube',[0,5.05,-5.1],[5.9,.13,.2],'mint');
  for(const x of [-3.3,3.3]){child('Gate · illuminated inlay','cube',[x,2.75,-4.66],[.12,4.7,.05],'mint');child('Gate · footing','cube',[x,.25,-5.5],[1.85,.5,2.1],'dark',true);}
  const ring=child('Ion field · core ring','torus',[0,2.8,-5.65],[4.55,4.55,4.55],'mint');ring.components.animation={duration:8,loop:true,tracks:[{property:'rotation.z',keys:[{time:0,value:0},{time:8,value:360}]}]};
  const ring2=child('Ion field · inner ring','torus',[0,2.8,-5.7],[3.9,3.9,3.9],'dark');ring2.transform.rotation=[0,0,30];
  child('Relay steps · 01','cube',[0,.12,-3.8],[6.2,.24,2.2],'stone',true);child('Relay steps · 02','cube',[0,.3,-4.7],[5.7,.3,1.8],'stone',true);
  for(const x of [-10.9,10.9])for(let z=-8;z<=8;z+=4){add('Edge marker','cube',[x,.14,z],[.14,.08,1.3],'mint');}
  for(const x of [-5.5,5.5]){add('Runway light','cube',[x,.012,2],[.055,.035,10],'mint');}
  // Plinths and cover objects exercise static collision, hierarchy, and instancing.
  for(const [x,z,h] of [[-7,-3,1.1],[7,-2,1.8],[-7,4,.9],[6,5,.7],[-8,-7,2.2],[8,-7,2.5]]){add('Obelisk base','cube',[x,h/2,z],[1.7,h,1.7],'dark',true);add('Obelisk cap','cube',[x,h+.1,z],[1.85,.2,1.85],'stone',true);add('Obelisk pulse','cube',[x,h+.22,z],[.8,.04,.8],'mint');}
  const shardPositions=[[-3,1.1,5],[3,1.1,4],[-5,1.1,-.5],[5,1.1,-.5],[-1.8,1.3,-3],[1.8,1.3,-3]];
  for(let i=0;i<shardPositions.length;i++){const e=add(`Energy Shard ${String(i+1).padStart(2,'0')}`,'crystal',shardPositions[i],[.65,.8,.65],'emissiveGold');e.components.body={type:'static',shape:'sphere',radius:1,mass:1,trigger:true};e.components.graph={asset:'pickup'};e.components.collectible={value:1};e.components.animation={duration:2.8,loop:true,tracks:[{property:'position.y',keys:[{time:0,value:shardPositions[i][1]},{time:1.4,value:shardPositions[i][1]+.18},{time:2.8,value:shardPositions[i][1]}]}]};}
  for(const [x,y,z] of [[-6,.8,7],[-4,.8,7],[7,.8,3]]){const e=add('Physics crate','cube',[x,y,z],[1.25,1.25,1.25],'red');e.components.body={type:'dynamic',shape:'box',mass:2,friction:.65,restitution:.1,velocity:[0,0,0]};}
  const ball=add('Physics orb','sphere',[4,3,7],[1.2,1.2,1.2],'blue');ball.components.body={type:'dynamic',shape:'sphere',mass:1,radius:.5,friction:.5,restitution:.55,velocity:[0,0,0]};
  const player=add('Player · Rover','cylinder',[0,1.15,7],[.72,1.0,.72],'gold');player.components.body={type:'dynamic',shape:'box',halfExtents:[.5,.75,.5],mass:1,friction:0,restitution:0,velocity:[0,0,0]};player.components.controller={speed:6.5,jump:8.5};player.components.player={};
  const pc=(name,mesh,p,s,m)=>{const e=add(name,mesh,p,s,m);e.parent=player.id;return e;};pc('Rover · helmet','sphere',[0,.72,0],[1.2,.75,1.2],'white');pc('Rover · visor','sphere',[0,.76,-.26],[.96,.45,.7],'dark');pc('Rover · left boot','cube',[-.27,-.56,0],[.37,.38,.65],'dark');pc('Rover · right boot','cube',[.27,-.56,0],[.37,.38,.65],'dark');pc('Rover · backpack','cube',[0,.08,.4],[.7,.62,.35],'dark');
  const sun=add('Sun · late afternoon',null,[0,14,0],[1,1,1],'stone');sun.components.light={type:'directional',direction:[-.45,.85,.36],color:'#ffe5bf',intensity:3.2};
  const light=add('Relay point light',null,[0,2.5,-4],[1,1,1],'mint');light.components.light={type:'point',color:'#68ffc9',intensity:12,range:13};
  const fill=add('Warm landing light',null,[-7,2,6],[1,1,1],'gold');fill.components.light={type:'point',color:'#ffb85c',intensity:5,range:10};
  // Distant landmarks: no external assets or pre-rendered background.
  const random=seeded(1337);for(let i=0;i<24;i++){const a=i/24*Math.PI*2,r=25+random()*16,x=Math.cos(a)*r,z=Math.sin(a)*r,h=3+random()*10;const e=add('Distant ruin '+(i+1),'cube',[x,h/2-1,z],[1.5+random()*2,h,1.5+random()*2],'sand');e.transform.rotation[1]=random()*50;e.transform.rotation[2]=(random()-.5)*9;}
  const proto=data.entities.find(e=>e.components.collectible),prefab=structuredClone(proto);prefab.parent=null;prefab.name='Energy Shard';prefab.transform.position=[0,1.2,0];data.assets.prefabs.shard={name:'PF_EnergyShard',entities:[prefab]};
  return data;
}
