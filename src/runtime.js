import {Scene,validateScene} from './scene.js';
import {Assets} from './assets.js';
import {PhysicsWorld} from './physics.js';
import {GraphProgram} from './graph.js';
import {Renderer} from './renderer.js';
import {perspective,rad,deg,vsub,vnorm,vmul,vadd,vlerp,clamp} from './math.js';
export class Camera {
  constructor(){this.target=[0,1.4,-1.2];this.yaw=.56;this.pitch=.34;this.distance=28;this.fov=52;this.orbit();}
  orbit(){this.eye=vadd(this.target,[Math.sin(this.yaw)*Math.cos(this.pitch)*this.distance,Math.sin(this.pitch)*this.distance,Math.cos(this.yaw)*Math.cos(this.pitch)*this.distance]);}
  projection(aspect){return perspective(rad(this.fov),aspect,.08,450);}
  focus(position,size=4){this.target=[...position];this.distance=Math.max(4,size*2.5);this.orbit();}
}
export class InputState {
  constructor(){this.keys=new Set();this.pressed=new Set();this.released=new Set();}
  down(code){if(!this.keys.has(code))this.pressed.add(code);this.keys.add(code);}
  up(code){this.keys.delete(code);this.released.add(code);}
  clear(){this.keys.clear();this.pressed.clear();this.released.clear();}
  endTick(){this.pressed.clear();this.released.clear();}
}
export class GameRuntime {
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
export async function launchStandalone(data){
  const canvas=document.querySelector('#game'),status=document.querySelector('#status'),renderer=new Renderer(canvas,m=>{console.warn(m);if(status)status.textContent=m;}),runtime=new GameRuntime(data,{onMessage:m=>{document.querySelector('#message').textContent=m;},onScore:(n,t)=>{document.querySelector('#score').textContent=`${n} / ${t}`;}});await renderer.init(new URLSearchParams(location.search).has('webgl'));document.querySelector('#backend').textContent=renderer.name;document.querySelector('#score').textContent=`0 / ${runtime.targetScore}`;if(status)status.textContent='WASD / arrows to move · Space to jump · R to respawn';
  addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='KeyR')runtime.respawn();runtime.input.down(e.code);});addEventListener('keyup',e=>runtime.input.up(e.code));addEventListener('blur',()=>runtime.input.clear());document.querySelector('#restart').onclick=()=>location.reload();
  for(const button of document.querySelectorAll('[data-key]')){button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);runtime.input.down(button.dataset.key);};button.onpointerup=()=>runtime.input.up(button.dataset.key);button.onpointercancel=()=>runtime.input.up(button.dataset.key);}
  let last=performance.now();function frame(now){const dt=Math.min((now-last)/1000,.1);last=now;runtime.update(dt);renderer.render(runtime.scene,runtime.assets,runtime.camera);document.querySelector('#timer').textContent=runtime.time.toFixed(1)+' s';requestAnimationFrame(frame);}requestAnimationFrame(frame);window.vantaGame={runtime,renderer};return {runtime,renderer};
}
