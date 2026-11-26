// Deterministic, read-only strategic ordering for currently controlled garrison targets.
// Coastal terrain is NOT the maritime port catalog: only a coastal-exposure proxy.
import {atWar,type WorldState} from '../core/state';
import type {GarrisonOrder} from './garrisons';

export type GarrisonPriorityReason='hostileBorder'|'capital'|'coastal'|'infrastructure';
export interface GarrisonTargetPriority {
  province:number;
  hostileNeighbors:number;
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
  return [...new Set(targets)].map(province=>{
    let hostileNeighbors=0;
    for(let i=w.adj.offsets[province];i<w.adj.offsets[province+1];i++){
      const neighborOwner=w.prov.controller[w.adj.targets[i]];
      if(neighborOwner!==owner&&atWar(w,owner,neighborOwner))hostileNeighbors++;
    }
    const capital=w.countries.capital[owner]===province;
    const coastal=w.prov.coastal[province];
    const reason:GarrisonPriorityReason=hostileNeighbors>0?'hostileBorder':
      capital?'capital':coastal?'coastal':'infrastructure';
    return {province,hostileNeighbors,capital,coastal,
      infrastructure:w.prov.infra[province],
      population:w.prov.population[province],reason};
  }).sort((a,b)=>
    b.hostileNeighbors-a.hostileNeighbors||
    Number(b.capital)-Number(a.capital)||
    Number(b.coastal)-Number(a.coastal)||
    b.infrastructure-a.infrastructure||
    b.population-a.population||
    a.province-b.province
  );
}
