// Snapshot-only defense coverage projection. This is an observation, not a route
// solver or a persistent order: it must never mutate the engine or infer reachability.
import type {UiUnit} from '../engine/ui';
import type {GarrisonOrder} from '../engine/military/garrisons';

export type CoverageStatus='guarded'|'incoming'|'uncovered'|'lost';
export type CoverageGapReason='paused'|'noUnits'|'noAvailableUnits'|'awaitingOrders';

export type CoverageUnit=Pick<UiUnit,
  'id'|'owner'|'loc'|'moving'|'target'|'manualHold'|'encircled'|'inBattle'>;

export interface GarrisonTargetCoverage{
  province:number;
  status:CoverageStatus;
  guardingUnitIds:number[];
  incomingUnitIds:number[];
  /** Reason is based only on observable state, never a guessed path failure. */
  gapReason?:CoverageGapReason;
}

/** Display-ready status, consistent with the garrison planner's destination rule. */
export function projectGarrisonCoverage(
  order:Pick<GarrisonOrder,'owner'|'provinces'|'unitIds'|'paused'>,
  snapshot:{controller:readonly number[];units:readonly CoverageUnit[]},
):GarrisonTargetCoverage[]{
  const assigned=new Set(order.unitIds);
  const units=snapshot.units.filter(u=>u.owner===order.owner&&assigned.has(u.id));
  const available=units.some(u=>!u.moving&&!u.manualHold&&!u.inBattle&&!u.encircled);
  const reason:CoverageGapReason=order.paused?'paused':
    !units.length?'noUnits':!available?'noAvailableUnits':'awaitingOrders';
  const guards=new Map<number,number[]>(),arrivals=new Map<number,number[]>();
  for(const u of units){
    const index=u.moving?arrivals:guards;
    const province=u.moving?u.target:u.loc;
    if(province<0)continue;
    const list=index.get(province)??[];
    list.push(u.id);
    index.set(province,list);
  }
  for(const index of [guards,arrivals])
    for(const list of index.values())list.sort((a,b)=>a-b);
  return [...new Set(order.provinces)].sort((a,b)=>a-b).map(province=>{
    const guardingUnitIds=guards.get(province)??[];
    const incomingUnitIds=arrivals.get(province)??[];
    const status:CoverageStatus=snapshot.controller[province]!==order.owner?'lost':
      guardingUnitIds.length?'guarded':incomingUnitIds.length?'incoming':'uncovered';
    return {province,status,guardingUnitIds,incomingUnitIds,
      ...(status==='uncovered'?{gapReason:reason}:{})};
  });
}
