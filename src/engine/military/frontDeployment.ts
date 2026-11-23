// Deterministic, read-only front deployment planner.
// No teleporting and no implicit release of manual orders: command applies paths atomically.
import type {Unit, WorldState} from '../core/state';
import {findPath} from '../systems/movement';

export type FrontDeploymentMode = 'even' | 'strategic' | 'nearest';
export interface FrontDeploymentOrder {unitId:number;target:number;path:number[]}
export interface FrontDeploymentPlan {
  reason:string|null;
  orders:FrontDeploymentOrder[];
  provinces:number[];
}

const deploymentModes:readonly FrontDeploymentMode[]=['even','strategic','nearest'];

function frontImportance(w:WorldState, province:number, country:number, enemy:number):number {
  let hostileEdges=0;
  for(let i=w.adj.offsets[province];i<w.adj.offsets[province+1];i++) {
    if(!w.adj.strait[i]&&w.prov.controller[w.adj.targets[i]]===enemy)hostileEdges++;
  }
  const infra=Math.max(0,w.prov.infra[province]??0);
  const supply=Math.max(0,Math.min(1,w.runtime.supplyEff[province]??0));
  const mountains=w.prov.terrain[province]===2?1:0;
  void country;
  return 1+2*hostileEdges+infra/3+2*supply+mountains;
}

function projectedDistance(w:WorldState, unit:Unit, p:number):number {
  const latitudeScale=Math.cos(w.prov.cy[unit.loc]*Math.PI/180);
  const dx=(w.prov.cx[unit.loc]-w.prov.cx[p])*latitudeScale;
  const dy=w.prov.cy[unit.loc]-w.prov.cy[p];
  return dx*dx+dy*dy;
}

/** Plans all requested divisions or fails without modifying WorldState. */
export function planFrontDeployment(
  w:WorldState,country:number,frontId:unknown,expectedRevision:unknown,
  unitIds:unknown,mode:unknown,
):FrontDeploymentPlan {
  const failure=(reason:string):FrontDeploymentPlan=>({reason,orders:[],provinces:[]});
  const front=w.fronts.find(f=>f.id===frontId);
  if(!front)return failure('noFront');
  if(front.owner!==country||!w.countries.alive[country])return failure('notYourFront');
  if(expectedRevision!==(front.revision??1))return failure('staleFrontOrder');
  if(!deploymentModes.includes(mode as FrontDeploymentMode))return failure('badParams');
  if(!Array.isArray(unitIds)||!unitIds.length||unitIds.length>256||
    unitIds.some(id=>!Number.isSafeInteger(id)||id<1)||
    new Set(unitIds).size!==unitIds.length)return failure('badParams');
  const selected=new Set<number>(unitIds as number[]);
  const units:Unit[]=[];
  for(const id of [...selected].sort((a,b)=>a-b)){
    const unit=w.units.find(u=>u.id===id&&!u.destroyed);
    if(!unit||unit.owner!==country)return failure('notYourUnit');
    // A deployment must not overwrite an explicit manual path or hold.
    if(unit.manualHold||unit.path.length||unit.encircled||w.runtime.activeBattles.has(unit.loc))return failure('unitBusy');
    units.push(unit);
  }
  const provinces=[...new Set(front.provinces)]
    .filter(p=>Number.isSafeInteger(p)&&p>=0&&p<w.prov.count&&w.prov.controller[p]===country)
    .sort((a,b)=>a-b);
  if(!provinces.length)return failure('noFrontProvinces');
  const loads=new Map(provinces.map(p=>[p,0]));
  // Preserve other deployed divisions when estimating local concentration.
  for(const u of w.units){
    if(u.destroyed||u.owner!==country||u.frontId!==front.id||selected.has(u.id))continue;
    const p=u.path.length?u.path[u.path.length-1]:u.loc;
    if(loads.has(p))loads.set(p,loads.get(p)!+1);
  }
  const weights=new Map(provinces.map(p=>[p,frontImportance(w,p,country,front.enemy)]));
  const paths=new Map<string,number[]|null>();
  const orders:FrontDeploymentOrder[]=[];
  for(const unit of units){
    const ranked=provinces.map(p=>{
      const load=loads.get(p)!;
      const d=projectedDistance(w,unit,p);
      const weight=weights.get(p)!;
      const score=mode==='even'?load*1000+d:
        mode==='strategic'?(load+0.5)*1000/weight+d:
        d*1000+load;
      return {p,score};
    }).sort((a,b)=>a.score-b.score||a.p-b.p);
    let chosen:FrontDeploymentOrder|null=null;
    for(const {p} of ranked){
      const key=unit.loc+':'+p;
      if(!paths.has(key))paths.set(key,findPath(w,unit.loc,p,country,false));
      const route=paths.get(key);
      if(!route)continue;
      chosen={unitId:unit.id,target:p,path:route.length>1?[...route]:[]};
      break;
    }
    if(!chosen)return failure('noPath');
    orders.push(chosen);
    loads.set(chosen.target,loads.get(chosen.target)!+1);
  }
  return {reason:null,orders,provinces};
}
