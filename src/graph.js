import {clamp} from './math.js';
/** Typed, bounded interpreter. No eval, generated JavaScript, or implicit graph cycles. */
export const NODE_TYPES={
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
export function graphNode(type,id,x=40,y=40){if(!NODE_TYPES[type])throw Error('Unknown node type');return {id,type,x,y,params:structuredClone(NODE_TYPES[type].params)};}
export function validateGraph(graph){const errors=[],nodes=new Map(),incoming=new Set();if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))return ['Graph nodes and edges must be arrays'];if(graph.nodes.length>500)return ['Graph exceeds 500 nodes'];for(const n of graph.nodes){if(nodes.has(n.id))errors.push('Duplicate node ID');nodes.set(n.id,n);if(!NODE_TYPES[n.type])errors.push(`Unknown node ${n.type}`);}for(const e of graph.edges){const a=nodes.get(e.from),b=nodes.get(e.to),at=NODE_TYPES[a?.type]?.outputs[e.out],bt=NODE_TYPES[b?.type]?.inputs[e.in];if(!at||!bt||at!==bt)errors.push(`Incompatible wire ${e.from}.${e.out} → ${e.to}.${e.in}`);const key=`${e.to}.${e.in}`;if(incoming.has(key))errors.push(`Multiple wires into ${key}`);incoming.add(key);}
  const visiting=new Set(),done=new Set();function visit(id){if(visiting.has(id)){errors.push('Cycles are not permitted; use a Tick event');return;}if(done.has(id))return;visiting.add(id);for(const e of graph.edges.filter(e=>e.from===id))visit(e.to);visiting.delete(id);done.add(id);}for(const n of graph.nodes)visit(n.id);return [...new Set(errors)];}
export class GraphProgram {
  constructor(graph){const errors=validateGraph(graph);if(errors.length)throw Error(errors.join('; '));this.nodes=new Map(graph.nodes.map(n=>[n.id,n]));this.inputs=new Map(graph.edges.map(e=>[`${e.to}.${e.in}`,e]));this.outputs=new Map();for(const e of graph.edges){const k=`${e.from}.${e.out}`;if(!this.outputs.has(k))this.outputs.set(k,[]);this.outputs.get(k).push(e);}this.events={};for(const n of graph.nodes)if(NODE_TYPES[n.type].category==='event')(this.events[n.type]??=[]).push(n.id);}
  run(event,actor,ctx){let budget=256;const memo=new Map();const read=(node,key)=>{const edge=this.inputs.get(`${node.id}.${key}`);return edge?value(edge.from,edge.out):node.params[key];};
    const value=(id,port)=>{const key=`${id}.${port}`;if(memo.has(key))return memo.get(key);if(--budget<0)throw Error('Graph evaluation budget exceeded');const n=this.nodes.get(id);let v=0;switch(n.type){case 'Number':v=n.params.value;break;case 'Key':v=ctx.keys.has(n.params.key);break;case 'Time':v=ctx.time;break;case 'Tick':v=ctx.dt;break;case 'Sine':v=Math.sin(Number(read(n,'value')));break;case 'Multiply':v=Number(read(n,'a'))*Number(read(n,'b'));break;case 'Greater':v=Number(read(n,'a'))>Number(read(n,'b'));break;}if(typeof v==='number'&&!Number.isFinite(v))v=0;memo.set(key,v);return v;};
    const emit=(id,port='exec')=>{for(const edge of this.outputs.get(`${id}.${port}`)||[])execute(edge.to);};
    const execute=id=>{if(--budget<0)throw Error('Graph execution budget exceeded');const n=this.nodes.get(id),axis=Math.max(0,'xyz'.indexOf(n.params.axis)),num=k=>clamp(Number(read(n,k))||0,-1e5,1e5);ctx.lastNodes?.add(id);switch(n.type){case 'Branch':emit(id,read(n,'condition')?'yes':'no');return;case 'Rotate':actor.transform.rotation[axis]+=num('speed')*ctx.dt;break;case 'Translate':actor.transform.position[axis]+=num('speed')*ctx.dt;break;case 'Impulse':if(actor.components.body?.type==='dynamic'){const body=actor.components.body;body.velocity??=[0,0,0];body.velocity[axis]+=num('force')/body.mass;}break;case 'Score':ctx.addScore(num('amount'));break;case 'Destroy':ctx.destroy(actor.id);break;case 'Message':ctx.message(String(n.params.text));break;case 'Respawn':ctx.respawn();break;}emit(id);};for(const id of this.events[event]||[]){ctx.lastNodes?.add(id);emit(id);}
  }
}
export function pickupGraph(){return {id:'pickup',name:'BP_EnergyShard',nodes:[graphNode('Overlap','overlap',45,70),{...graphNode('Score','score',300,70),params:{amount:1}},graphNode('Destroy','destroy',550,70),graphNode('Tick','tick',45,280),{...graphNode('Rotate','rotate',300,280),params:{axis:'y',speed:70}}],edges:[{from:'overlap',out:'exec',to:'score',in:'exec'},{from:'score',out:'exec',to:'destroy',in:'exec'},{from:'tick',out:'exec',to:'rotate',in:'exec'}]};}
