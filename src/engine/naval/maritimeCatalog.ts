// Phase8A maritime data validation. The catalog is static scenario metadata:
// it grants no naval movement, battle ability or sea transport by itself.
import type {MaritimeCatalog,PackProvince} from '../scenario/types';

const stableId=(id:unknown):id is string=>
  typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id);
const label=(x:unknown):x is string=>
  typeof x==='string'&&x.trim().length>0&&x===x.trim()&&x.length<=120;
const slots=(n:unknown,allowZero:boolean):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>=(allowZero?0:1)&&n<=10000;
const unique=(xs:unknown):xs is string[]=>
  Array.isArray(xs)&&xs.every(stableId)&&new Set(xs).size===xs.length;

export function validateMaritimeCatalog(
  provinces:readonly PackProvince[],catalog:unknown,
):string[]{
  const errs:string[]=[];
  if(!catalog||typeof catalog!=='object'||Array.isArray(catalog))
    return ['invalid maritime catalog root'];
  const c=catalog as Partial<MaritimeCatalog>;
  if(!Array.isArray(c.seaZones)||!Array.isArray(c.ports)||
    !Array.isArray(c.navEdges)||!Array.isArray(c.gates))
    return ['invalid maritime catalog arrays'];
  if(!c.seaZones.length)errs.push('maritime catalog has no sea zones');
  const provMap=new Map(provinces.map(p=>[p.id,p]));
  const uniqueIndex=(items:readonly {id:string}[],kind:string):Map<string,unknown>=>{
    const result=new Map<string,unknown>();
    for(const item of items){
      if(!item||!stableId(item.id)||result.has(item.id)){
        errs.push(kind+' duplicate or invalid id: '+String(item?.id));continue;
      }
      result.set(item.id,item);
    }
    return result;
  };
  const zones=uniqueIndex(c.seaZones,'sea zone');
  const ports=uniqueIndex(c.ports,'port');
  const edges=uniqueIndex(c.navEdges,'sea edge');
  const gates=uniqueIndex(c.gates,'sea gate');
  void ports;
  const portProvinces=new Set<string>();
  for(const z of c.seaZones){
    if(!z||!stableId(z.id))continue;
    if(!label(z.nameJa)||!label(z.nameEn)||
      typeof z.polygonRef!=='string'||!/^[a-zA-Z0-9._-]{1,128}$/.test(z.polygonRef))
      errs.push('invalid sea zone label or geometry reference: '+z.id);
    if(!unique(z.neighbors)||z.neighbors.includes(z.id))
      errs.push('invalid sea zone neighbors: '+z.id);
    else for(const neighbor of z.neighbors){
      if(!zones.has(neighbor))errs.push('unknown sea zone neighbor: '+z.id+'/'+neighbor);
    }
  }
  for(const p of c.ports){
    if(!p||!stableId(p.id))continue;
    if(!provMap.get(p.provinceId)?.coastal||
      portProvinces.has(p.provinceId))errs.push('port must use one unique coastal province: '+p.id);
    else portProvinces.add(p.provinceId);
    if(!zones.has(p.zoneId))errs.push('port zone unknown: '+p.id);
    if(!slots(p.capacity,false)||!slots(p.repairSlots,true)||
      !slots(p.dockyardSlots,true))errs.push('invalid port capacity: '+p.id);
  }
  const pairs=new Set<string>(),actualPairs=new Set<string>();
  for(const edge of c.navEdges){
    if(!edge||!stableId(edge.id))continue;
    if(!zones.has(edge.a)||!zones.has(edge.b)||edge.a===edge.b)
      errs.push('invalid sea edge endpoints: '+edge.id);
    if(!Number.isFinite(edge.cost)||edge.cost<=0)
      errs.push('invalid sea edge cost: '+edge.id);
    const pair=[edge.a,edge.b].sort().join('|');
    if(pairs.has(pair))errs.push('duplicate sea edge pair: '+pair);
    pairs.add(pair);actualPairs.add(pair);
    if(edge.gateId!==undefined&&!gates.has(edge.gateId))
      errs.push('unknown sea gate: '+edge.id);
  }
  for(const z of c.seaZones){
    if(!z||!unique(z.neighbors))continue;
    for(const neighbor of z.neighbors){
      const adjacent=c.seaZones.find(x=>x?.id===neighbor);
      if(!adjacent?.neighbors?.includes(z.id))
        errs.push('asymmetric sea zone neighbors: '+z.id+'/'+neighbor);
      const pair=[z.id,neighbor].sort().join('|');
      if(!actualPairs.has(pair))errs.push('missing sea edge: '+pair);
    }
  }
  for(const e of c.navEdges){
    if(!e||!zones.has(e.a)||!zones.has(e.b))continue;
    const a=c.seaZones.find(z=>z.id===e.a),b=c.seaZones.find(z=>z.id===e.b);
    if(!a?.neighbors?.includes(e.b)||!b?.neighbors?.includes(e.a))
      errs.push('sea edge missing reciprocal neighbors: '+e.id);
  }
  for(const gate of c.gates){
    if(!gate||!stableId(gate.id))continue;
    if(!unique(gate.landProvinceIds)||!gate.landProvinceIds.length||
      gate.landProvinceIds.some(id=>!provMap.get(id)?.coastal))
      errs.push('invalid gate coastal provinces: '+gate.id);
    if(!unique(gate.seaEdgeIds)||!gate.seaEdgeIds.length||
      gate.seaEdgeIds.some(id=>!edges.has(id)))
      errs.push('invalid gate sea edges: '+gate.id);
    for(const edgeId of gate.seaEdgeIds??[]){
      if(c.navEdges.find(e=>e.id===edgeId)?.gateId!==gate.id)
        errs.push('gate edge binding mismatch: '+gate.id+'/'+edgeId);
    }
  }
  for(const edge of c.navEdges){
    if(edge?.gateId!==undefined&&!c.gates.some(g=>g.id===edge.gateId&&
      g.seaEdgeIds?.includes(edge.id)))
      errs.push('sea edge gate binding mismatch: '+edge.id);
  }
  return errs;
}
