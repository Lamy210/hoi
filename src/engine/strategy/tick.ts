/** Five-phase reference implementation; transactional clone + invariant check.
 * Produces advisory plans, never executes war/movement without authorization.
 */
import {assertStrategyState,atWar,populationSize,type StrategyState,type Factory,type Lot,type Division} from './model';
import {civilFromDays} from '../clock/date';
import {allocateFrontline,resolveLandExchange,type LandTerrain} from './combat/land';
import {issuedArmorPiercing} from './combat/equippedArmor';
import {availableIC,construct,modelOutput,nextPrice,researchPerDay,studySlots,
  allocatedResearch,researchAhead,canAutoAttack,resistanceAfterDay,controlledFactoryFraction,
  equippedCombatStats,combatReady,laborForProgress} from './rules';

export const STRATEGY_PHASES=[
  'economy-market','research-production','supply-movement-delegation',
  'combat-airstrike','occupation-politics',
] as const;
export interface StrategyOrder {planId:number;divisionId:number;targetProvince:number;type:'attack'|'defend';}
export interface Strike {factoryId:number;damage:number;}
export interface StrategyTickResult {
  next:StrategyState;phases:string[];orders:StrategyOrder[];
  production:{modelId:string;country:number;quantity:number}[];
  reports:{battleOrgLoss:number;factoryDamage:number;casualties:number;equipmentLoss:number;aiEvaluations:number};
}
const sumCash=(w:StrategyState)=>w.nations.reduce((s,c)=>s+c.cash+c.householdCash,0);
const sumPopulation=(w:StrategyState)=>w.nations.reduce((s,c)=>s+populationSize(c.population),0);
const lotTotal=(w:StrategyState)=>w.lots.reduce((s,l)=>s+l.quantity,0);
const addLot=(lots:Lot[],holder:Lot['holder'],holderId:number,modelId:string,qty:number)=>{
  if(qty===0)return;
  const l=lots.find(x=>x.holder===holder&&x.holderId===holderId&&x.modelId===modelId);
  if(l)l.quantity+=qty;else lots.push({holder,holderId,modelId,quantity:qty});
};
const sorted=<T>(items:readonly T[],key:(x:T)=>number):T[]=>[...items].sort((a,b)=>key(a)-key(b));

export function runStrategyTick(initial:StrategyState,strikes:readonly Strike[]=[]):StrategyTickResult {
  assertStrategyState(initial);
  const next:StrategyState=structuredClone(initial);
  const baseline:StrategyState=initial; // read-only throughout the tick; only next mutates
  const phases:string[]=[],orders:StrategyOrder[]=[],production:StrategyTickResult['production']=[];
  let battleOrgLoss=0,factoryDamage=0,casualties=0,equipmentLoss=0;
  // Actual allocation is only applied to next. All coefficients read baseline.
  // A shortage in one item must not double-discount output in a postprocess step.
  const workerRemaining=new Map(baseline.nations.map(n=>[n.id,n.population.workers]));
  const availableWorkers=(f:Factory):number=>Math.min(workerRemaining.get(f.country)??0,f.workerDemand);
  const consumeWorkers=(f:Factory,used:number):void=>{
    const available=workerRemaining.get(f.country)??0;
    if(used>available+1e-8)throw new RangeError('worker overcommit');
    workerRemaining.set(f.country,Math.max(0,available-used));
  };

  // 1. Market uses previous-day supply/demand, not this tick's output.
  for(const q of next.quotes) q.price=nextPrice(q);
  // Civil construction spends *both* IC and cash/material, never creates currency.
  for(const project of sorted(next.construction,x=>x.id)){
    const f=baseline.factories.find(x=>x.id===project.factoryId);
    const liveFactory=next.factories.find(x=>x.id===project.factoryId);
    const n=next.nations.find(x=>x.id===project.country);
    const region=next.regions.find(x=>x.id===f?.regionId);
    if(!f||!liveFactory||!n||!region||f.kind!=='civilian')throw new RangeError('invalid construction');
    const labor=availableWorkers(f),amount=region.resources[project.material]??0;
    const claims=baseline.occupations.filter(o=>o.regionId===region.id);
    const operated=controlledFactoryFraction(region.owner,f.country,claims);
    const progress=construct({...f,baseIC:f.baseIC*operated},project.remainingIC,
      n.cash,amount,labor,project.cashPerIC,project.materialPerIC);
    consumeWorkers(f,laborForProgress(f,progress.progressIC,operated));
    n.cash-=progress.paid;n.householdCash+=progress.paid;
    region.resources[project.material]=Math.max(0,amount-progress.materialsSpent);
    project.remainingIC=Math.max(0,project.remainingIC-progress.progressIC);
    // Repair is completed at end-of-day; no same-tick boost to production.
    if(project.remainingIC<=1e-8){
      if(project.kind==='build'&&project.newFactory){
        next.factories.push({...project.newFactory,country:project.country,damage:0});
      }
      if(project.kind==='repair'&&project.targetFactoryId!==undefined){
        const target=next.factories.find(x=>x.id===project.targetFactoryId);
        if(!target)throw new RangeError('repair target');
        target.damage=0;
      }
    }
  }
  next.construction=next.construction.filter(p=>p.remainingIC>1e-8);
  phases.push(STRATEGY_PHASES[0]);

  // 2. Researchers work from start-of-day population; additional parallel slots do
  // not multiply RP. Research and physical equipment lots are independent.
  for(const nation of next.nations){
    const original=baseline.nations.find(n=>n.id===nation.id)!;
    const owned=baseline.factories.filter(f=>f.country===nation.id);
    const workersRequired=owned.reduce((a,f)=>a+f.workerDemand,0);
    const laborFill=workersRequired>0?Math.min(1,original.population.workers/workersRequired):1;
    const industry=owned.reduce((a,f)=>{
      const region=baseline.regions.find(r=>r.id===f.regionId)!;
      const occupations=baseline.occupations.filter(o=>o.regionId===region.id);
      return a+f.baseIC*(1-f.damage)*controlledFactoryFraction(region.owner,f.country,occupations);
    },0)*laborFill;
    const infraProvinces=baseline.provinces.filter(p=>p.controller===nation.id);
    const infra=infraProvinces.length?
      Math.min(1,infraProvinces.reduce((a,p)=>a+p.infrastructure,0)/infraProvinces.length/10):0;
    const slots=studySlots(industry,original.literacy,infra,original.researchSlotBonus);
    const active=next.research.filter(r=>r.country===nation.id&&!original.techDone.includes(r.techId))
      .sort((a,b)=>b.priority-a.priority||a.techId.localeCompare(b.techId));
    const allocations=allocatedResearch(researchPerDay(original,infra),active.map(r=>r.priority),slots);
    for(let i=0;i<active.length;i++){
      const r=active[i];
      const year=civilFromDays(baseline.epochDays+baseline.tick).y;
      const bonus=1+Math.min(0.3,Math.max(0,r.instituteBonus+r.mioBonus));
      r.progress=Math.min(r.total,r.progress+allocations[i]*bonus/researchAhead(year,r.year));
      if(r.progress>=r.total&&!nation.techDone.includes(r.techId))nation.techDone.push(r.techId);
    }
  }
  for(const line of sorted(next.lines,x=>x.id)){
    if(!line.active)continue;
    const f=baseline.factories.find(x=>x.id===line.factoryId)!;
    const design=baseline.designs.find(x=>x.id===line.modelId)!;
    const n=baseline.nations.find(x=>x.id===line.country)!;
    if(design.unlockTech&&!n.techDone.includes(design.unlockTech))continue;
    const region=next.regions.find(x=>x.id===f.regionId)!;
    const workforce=availableWorkers(f);
    // Materials are the single resource constraint in this iteration.
    const occupied=baseline.occupations.filter(o=>o.regionId===region.id);
    const operated=controlledFactoryFraction(region.owner,f.country,occupied);
    const ic=availableIC({...f,baseIC:f.baseIC*operated},workforce,1,1,line.efficiency);
    const previousCarry=line.carryIC;
    const potential=Math.floor((ic+previousCarry)/design.ic+1e-10);
    const result=modelOutput(ic,previousCarry,design,region.resources);
    // If materials limited production, do not consume labor for idle production capacity.
    const consumedIC=result.count===potential?ic:Math.min(ic,Math.max(0,result.count*design.ic-previousCarry));
    const maximumIC=f.baseIC*(1-f.damage)*operated*line.efficiency;
    consumeWorkers(f,maximumIC>0?Math.min(workforce,workforce*consumedIC/Math.max(ic,1e-12)):0);
    line.carryIC=result.carry;
    for(const [good,qty] of Object.entries(result.spent))
      region.resources[good]=Math.max(0,(region.resources[good]??0)-qty);
    addLot(next.lots,'warehouse',line.country,design.id,result.count);
    if(result.count)production.push({modelId:design.id,country:line.country,quantity:result.count});
  }
  // The next day's market has access to today's finalized goods, not tomorrow's.
  // Material demand is the pre-resource-limited requirement for all active work.
  for(const q of next.quotes){
    q.supply=next.regions.reduce((sum,r)=>{
      const claims=baseline.occupations.filter(o=>o.regionId===r.id);
      return sum+(r.resources[q.good]??0)*controlledFactoryFraction(r.owner,q.country,claims);
    },0);
    let requested=0;
    for(const p of next.construction.filter(x=>x.country===q.country&&x.material===q.good)){
      const f=next.factories.find(x=>x.id===p.factoryId);
      if(f)requested+=Math.min(p.remainingIC,f.baseIC*(1-f.damage))*p.materialPerIC;
    }
    for(const line of next.lines.filter(x=>x.country===q.country&&x.active)){
      const design=next.designs.find(x=>x.id===line.modelId);
      const f=next.factories.find(x=>x.id===line.factoryId);
      if(design&&f)requested+=Math.floor((f.baseIC*(1-f.damage)*line.efficiency+line.carryIC)/design.ic)*
        (design.materials[q.good]??0);
    }
    q.demand=requested;
  }
  phases.push(STRATEGY_PHASES[1]);

  // 3. AI is a bounded proposal system. No unit movement is committed by this
  // routine; the future command dispatcher must revalidate every proposal.
  let evaluations=0;
  const plannedUnit=new Set<number>();
  const plans=sorted(next.plans,x=>x.id);
  const rotatingPlans=plans.length?
    [...plans.slice(baseline.tick%plans.length),...plans.slice(0,baseline.tick%plans.length)]:[];
  for(const p of rotatingPlans){
    const targets=[...new Set(p.targets)].sort((a,b)=>a-b);
    const unitIds=[...new Set(p.divisionIds)].sort((a,b)=>a-b);
    const offset=unitIds.length?(baseline.tick*16)%unitIds.length:0;
    const rotatedUnits=[...unitIds.slice(offset),...unitIds.slice(0,offset)];
    for(const uid of rotatedUnits){
      if(orders.length>=16||evaluations>=1000)break;
      evaluations++;
      const u=next.divisions.find(d=>d.id===uid);
      if(!u||plannedUnit.has(uid)||!combatReady(u)||u.planId!==p.id||u.manualHold||u.inBattle||p.paused)continue;
      if(p.kind==='OFFENSIVE'){
        if(!canAutoAttack(next,p,u))continue;
        const target=targets.find(t=>next.provinces.find(q=>q.id===u.province)?.adjacent.includes(t)&&
          next.provinces.find(q=>q.id===t)?.controller===p.enemy);
        if(target===undefined)continue;
        orders.push({planId:p.id,divisionId:uid,targetProvince:target,type:'attack'});
      }else if((p.kind==='FRONT'||p.kind==='DEFENSIVE')&&p.autonomy==='AUTO'){
        const target=[...p.provinces].sort((a,b)=>a-b).find(x=>
          x!==u.province&&next.provinces.find(q=>q.id===u.province)?.adjacent.includes(x)&&
          next.provinces.find(q=>q.id===x)?.controller===u.country);
        if(target===undefined)continue;
        orders.push({planId:p.id,divisionId:uid,targetProvince:target,type:'defend'});
      }
      if(orders.some(x=>x.divisionId===uid))plannedUnit.add(uid);
    }
  }
  phases.push(STRATEGY_PHASES[2]);

  // 4. Deterministic expected-value reference combat. Production has already
  // been finalized. Aircraft/strategic bombing damage becomes effective tomorrow.
  const attacking=sorted(next.divisions.filter(combatReady),d=>d.id);
  const engaged=new Set<number>();
  // Freeze the 6h frontage set at the beginning of the day's combat phase.
  // A large army cannot evade terrain width by matching every defender in turn.
  const inProvince=new Map<string,Division[]>();
  for(const u of attacking){
    const key=u.province+'\x1f'+u.country;
    const group=inProvince.get(key)??[];
    group.push(u);inProvince.set(key,group);
  }
  const frontage=new Map<number,number>();
  for(const group of inProvince.values()){
    const province=next.provinces.find(p=>p.id===group[0].province)!;
    const type:LandTerrain=
      province.terrain==='forest'||province.terrain==='hills'||
      province.terrain==='mountains'||province.terrain==='urban'
        ?province.terrain:'plains';
    const allocated=allocateFrontline(
      group.map(u=>({id:u.id,priority:0,width:u.combatWidth??20})),type);
    for(const item of allocated.engaged)frontage.set(item.id,item.widthPenalty);
  }
  const terrainAttackFactor:Record<string,number>={
    plains:1,hills:0.85,mountains:0.65,urban:0.75,forest:0.85,desert:0.95,
  };
  const battleStats=(unit:Division,targetTerrain:string,attacker:boolean,widthPenalty:number)=>{
    const modelStats=equippedCombatStats(next,unit);
    const protection=issuedArmorPiercing(next,unit);
    const associated=next.plans.find(p=>p.id===unit.planId&&p.country===unit.country);
    const planning=attacker&&associated?.authorized&&!associated.paused&&
      associated.kind==='OFFENSIVE'&&associated.targets.includes(unit.province)?
      associated.planning:0;
    return {...unit,...modelStats,
      softAttack:modelStats.softAttack*widthPenalty,
      hardAttack:modelStats.hardAttack*widthPenalty,
      defense:modelStats.defense*widthPenalty,
      breakthrough:modelStats.breakthrough*widthPenalty,
      armor:protection.armor,piercing:protection.piercing,
      terrain:attacker?(terrainAttackFactor[targetTerrain]??1):1,
      weather:1,commander:1,doctrine:1,planning};
  };
  const recordCasualties=(u:Division,hpLoss:number)=>{
    if(hpLoss<=0)return;
    const loss=Math.min(u.soldiers,Math.floor(u.soldiers*Math.min(1,hpLoss/100)*0.65+
      (u.casualtyCarry??0)+1e-9));
    u.casualtyCarry=Math.max(0,u.soldiers*Math.min(1,hpLoss/100)*0.65+
      (u.casualtyCarry??0)-loss);
    if(loss>0){
      const nation=next.nations.find(n=>n.id===u.country)!;
      const home=next.regions.filter(r=>r.owner===u.country).sort((x,y)=>x.id-y.id)
        .find(r=>r.population>=loss);
      if(!home||nation.population.soldiers<loss)throw new RangeError('casualty POP overdraw');
      u.soldiers-=loss;nation.population.soldiers-=loss;home.population-=loss;
      casualties+=loss;
    }
    // Equipment attrition removes actual issued lots, never cloned warehouse stock.
    for(const l of next.lots.filter(l=>l.holder==='division'&&l.holderId===u.id)){
      const lost=Math.min(l.quantity,Math.floor(l.quantity*Math.min(1,hpLoss/100)+1e-9));
      l.quantity-=lost;equipmentLoss+=lost;
    }
    if(u.hp===0){
      // Remaining soldiers rout into reserves; the formation stops fighting.
      const nation=next.nations.find(n=>n.id===u.country)!;
      nation.population.soldiers-=u.soldiers;
      nation.population.reserves+=u.soldiers;
      u.soldiers=0;u.destroyed=true;u.casualtyCarry=0;
      for(const l of next.lots.filter(l=>l.holder==='division'&&l.holderId===u.id)){
        equipmentLoss+=l.quantity;l.quantity=0;
      }
    }
  };
  for(const a of attacking){
    const attackerWidthFactor=frontage.get(a.id);
    if(attackerWidthFactor===undefined)continue; // reserved behind a filled front
    const province=next.provinces.find(p=>p.id===a.province);
    if(!province||a.country===province.controller||!atWar(next,a.country,province.controller))continue;
    const defender=attacking.find(x=>x.country===province.controller&&x.province===a.province&&
      frontage.has(x.id)&&!engaged.has(x.id)&&combatReady(x));
    if(!defender||engaged.has(a.id))continue;
    engaged.add(a.id);engaged.add(defender.id);
    const defenderWidthFactor=frontage.get(defender.id)!;
    // Four true 6h subphases: recompute with the remaining issued equipment.
    // Both sides fire from the same pre-damage snapshot inside each subphase.
    for(let subphase=0;subphase<4;subphase++){
      if(!combatReady(a)||!combatReady(defender))break;
      const attackerStats=battleStats(a,province.terrain,true,attackerWidthFactor);
      const defenderStats=battleStats(defender,province.terrain,false,defenderWidthFactor);
      const outcome=resolveLandExchange(attackerStats,defenderStats);
      const defenderHpLoss=Math.min(defender.hp,outcome.defenderHpLoss);
      const attackerHpLoss=Math.min(a.hp,outcome.attackerHpLoss);
      const defenderOrgLoss=Math.min(defender.organization,outcome.defenderOrgLoss);
      const attackerOrgLoss=Math.min(a.organization,outcome.attackerOrgLoss);
      defender.organization=Math.max(0,defender.organization-defenderOrgLoss);
      defender.hp=Math.max(0,defender.hp-defenderHpLoss);
      a.organization=Math.max(0,a.organization-attackerOrgLoss);
      a.hp=Math.max(0,a.hp-attackerHpLoss);
      recordCasualties(defender,defenderHpLoss);
      recordCasualties(a,attackerHpLoss);
      battleOrgLoss+=defenderOrgLoss+attackerOrgLoss;
    }
  }
  for(const s of [...strikes].sort((a,b)=>a.factoryId-b.factoryId)){
    if(!Number.isFinite(s.damage)||s.damage<0)throw new RangeError('airstrike');
    const f=next.factories.find(x=>x.id===s.factoryId);
    if(!f)throw new RangeError('airstrike target');
    const before=f.damage;
    f.damage=Math.min(1,before+s.damage);
    factoryDamage+=f.damage-before;
  }
  phases.push(STRATEGY_PHASES[3]);

  // 5. Occupation changes are applied after combat to prevent same-tick income.
  for(const o of next.occupations){
    const region=next.regions.find(r=>r.id===o.regionId)!;
    const war=atWar(next,region.owner,o.occupier);
    const after=resistanceAfterDay(o,war);
    o.resistance=after.resistance;o.compliance=after.compliance;
  }
  next.tick++;
  phases.push(STRATEGY_PHASES[4]);

  // Prevent partial commits; failures leave initial world untouched.
  assertStrategyState(next);
  if(Math.abs(sumCash(next)-sumCash(baseline))>1e-6)throw new RangeError('money conservation');
  if(sumPopulation(baseline)-sumPopulation(next)!==casualties)throw new RangeError('population casualty balance');
  const productionTotal=production.reduce((s,p)=>s+p.quantity,0);
  if(lotTotal(next)-lotTotal(baseline)!==productionTotal-equipmentLoss)throw new RangeError('equipment conservation');
  return {next,phases,orders,production,reports:{battleOrgLoss,factoryDamage,casualties,equipmentLoss,aiEvaluations:evaluations}};
}
