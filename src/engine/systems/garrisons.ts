// Periodic autonomous defense. Every movement is queued through the same
// validated command pipeline as the rest of the game.
import type {WorldState} from '../core/state';
import {registerSystem,weeklyOffset} from '../core/scheduler';
import {aiCmd} from '../commands';
import {planGarrisonMoves} from '../military/garrisons';

export function runGarrison(w:WorldState,id:number):void {
  const order=w.garrisons.find(g=>g.id===id);
  if(!order||order.paused)return;
  for(const movement of planGarrisonMoves(w,order)){
    if(w.runtime.commandsSinceLastTick.some(c=>
      (c.type==='garrisonMove'&&c.p.unitId===movement.unitId)||
      (c.type==='frontMove'&&c.p.unitId===movement.unitId)))continue;
    aiCmd(w,order.owner===w.playerCountry?'frontai':'ai:'+order.owner,
      'garrisonMove',{
        orderId:order.id,revision:order.revision,
        unitId:movement.unitId,target:movement.target,
      });
  }
}

export function registerGarrisonSystem():void {
  registerSystem({
    name:'garrisons',
    cadence:'daily',
    fn:(w)=>{
      const offset=weeklyOffset('garrisons');
      for(const g of w.garrisons){
        if((w.tick+g.id)%7===offset)runGarrison(w,g.id);
      }
    },
  });
}
