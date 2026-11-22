import {addAlert,type WorldState,type Unit} from '../core/state';
import {registerSystem} from '../core/scheduler';
import {autoAssignCommander} from '../military/commanders';
import {trainingSpec} from '../military/customTemplates';
import {adjustWarehouse} from './modelWarehouse';
import type {TrainingOrder} from '../military/templates';

/** Queued orders have not consumed resources; active/ready orders have full reservations. */
export function refundTraining(w:WorldState,order:TrainingOrder):void {
  if(!w.countries.alive[order.country]||order.status==='queued')return;
  const t=trainingSpec(w,order)!;
  w.countries.manpowerPool[order.country]+=t.manpower;
  adjustWarehouse(w,order.country,'infantry',t.infantry);
  adjustWarehouse(w,order.country,'artillery',t.artillery);
}

/** One-time deployment, called only after the order is ready and province is owned. */
export function deployTrainingOrder(w:WorldState,order:TrainingOrder):void {
  const c=order.country,p=order.province,t=trainingSpec(w,order)!;
  const unit:Unit={
    id:order.id,owner:c,loc:p,path:[],segIdx:0,segProgress:0,segDays:0,
    ...(t.templateId?{templateId:t.templateId}:{customTemplateId:t.customTemplateId,customRevision:t.customRevision}),
    manpower:t.manpower,maxManpower:t.manpower,
    infEquipment:t.infantry,maxInfEquipment:t.infantry,
    artEquipment:t.artillery,maxArtEquipment:t.artillery,
    org:50,exp:0,frontId:-1,commanderId:-1,encircled:false,destroyed:false,
  };
  w.units.push(unit);
  autoAssignCommander(w,unit);
  addAlert(w,{kind:'unitCreated',priority:2,msgKey:'alert.unitCreated',
    params:{where:w.prov.nameJa[p]||w.prov.nameEn[p]},actor:c,province:p});
}

export function tickTraining(w:WorldState):void {
  const remaining:TrainingOrder[]=[];
  const queued:TrainingOrder[]=[];
  for(const order of w.trainingQueue){
    const c=order.country,p=order.province;
    if(!w.countries.alive[c]){refundTraining(w,order);continue;}
    if(order.status==='queued'){queued.push(order);continue;}
    if(order.status===undefined){
      // Preserve old immediate-reservation/autodeploy behavior for pre-v13 orders.
      if(w.prov.controller[p]!==c){refundTraining(w,order);continue;}
      if(w.tick<order.readyTick){remaining.push(order);continue;}
      deployTrainingOrder(w,order);continue;
    }
    if(order.status==='training'&&w.tick>=order.readyTick)order.status='ready';
    if(order.status==='ready'&&order.autoDeploy&&w.prov.controller[p]===c){
      deployTrainingOrder(w,order);continue;
    }
    remaining.push(order);
  }
  // Fairness and determinism: higher priority first, then the reserved Unit ID.
  queued.sort((a,b)=>(b.priority??5)-(a.priority??5)||a.id-b.id);
  for(const order of queued){
    const c=order.country,t=trainingSpec(w,order)!;
    if(w.prov.controller[order.province]===c &&
       w.countries.manpowerPool[c]>=t.manpower &&
       w.countries.infEquipmentStock[c]>=t.infantry &&
       w.countries.artEquipmentStock[c]>=t.artillery){
      w.countries.manpowerPool[c]-=t.manpower;
      adjustWarehouse(w,c,'infantry',-t.infantry);
      adjustWarehouse(w,c,'artillery',-t.artillery);
      order.status='training';
      order.readyTick=w.tick+t.days;
    }
    remaining.push(order);
  }
  // Preserve insertion/ID order for state hash and UI despite priority scheduling.
  remaining.sort((a,b)=>a.id-b.id);
  w.trainingQueue=remaining;
}

export function registerTrainingSystem(){
  registerSystem({name:'training',cadence:'daily',fn:tickTraining});
}
