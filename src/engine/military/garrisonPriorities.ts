// Deterministic, read-only strategic ordering for currently controlled garrison targets.
// Coastal terrain is NOT the maritime port catalog: only a coastal-exposure proxy.
import {atWar,type WorldState} from '../core/state';
import type {GarrisonOrder} from './garrisons';

export type GarrisonPriorityReason='hostileForces'|'hostileBorder'|'capital'|'coastal'|'infrastructure';
export interface GarrisonTargetPriority {
  province:number;
  hostileNeighbors:number;
  /** Living hostile divisions physically in directly adjacent hostile-controlled provinces. */
  hostileDivisions:number;
  capital:boolean;
  coastal:boolean;
  infrastructure:number;
  population:number;
  reason:GarrisonPriorityReason;
}

/** Recompute from present world state; never persist derived priorities in saves. */
export function rankGarrisonTargets(
  w:WorldState,
  g:Pick<GarrisonOrder,'owner'|'provinces'>,
):GarrisonTargetPriority[] {
  const owner=g.owner;
  if(owner<0||owner>=w.countries.count)return [];
  const targets=g.provinces
    .filter(p=>Number.isSafeInteger(p)&&p>=0&&p<w.prov.count&&w.prov.controller[p]===owner);
  // Build a per-province pressure index once per evaluation, not once per
  // target. Only currently hostile countries count; a neutral stack is not
  // evidence of an imminent hostile attack.
  const enemies=new Set<number>();
  for(let country=0;country<w.countries.count;country++)
    if(country!==owner&&atWar(w,owner,country))enemies.add(country);
  const hostileStack=new Map<number,number>();
  for(const unit of w.units){
    if(unit.destroyed||!enemies.has(unit.owner)||unit.loc<0||unit.loc>=w.prov.count)continue;
    hostileStack.set(unit.loc,(hostileStack.get(unit.loc)??0)+1);
  }
  return [...new Set(targets)].map(province=>{
    let hostileNeighbors=0,hostileDivisions=0;
    for(let i=w.adj.offsets[province];i<w.adj.offsets[province+1];i++){
      const adjacent=w.adj.targets[i];
      const neighborOwner=w.prov.controller[adjacent];
      if(!enemies.has(neighborOwner))continue;
      hostileNeighbors++;
      hostileDivisions+=hostileStack.get(adjacent)??0;
    }
    const capital=w.countries.capital[owner]===province;
    const coastal=w.prov.coastal[province];
    const reason:GarrisonPriorityReason=hostileNeighbors>0?
      (hostileDivisions>0?'hostileForces':'hostileBorder'):
      capital?'capital':coastal?'coastal':'infrastructure';
    return {province,hostileNeighbors,hostileDivisions,capital,coastal,
      infrastructure:w.prov.infra[province],
      population:w.prov.population[province],reason};
  }).sort((a,b)=>
    Number(b.hostileNeighbors>0)-Number(a.hostileNeighbors>0)||
    b.hostileDivisions-a.hostileDivisions||
    b.hostileNeighbors-a.hostileNeighbors||
    Number(b.capital)-Number(a.capital)||
    Number(b.coastal)-Number(a.coastal)||
    b.infrastructure-a.infrastructure||
    b.population-a.population||
    a.province-b.province
  );
}
