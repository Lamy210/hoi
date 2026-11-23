/** Five-phase reference implementation; transactional clone + invariant check.
 * Produces advisory plans, never executes war/movement without authorization.
 */
import {assertStrategyState,atWar,populationSize,type StrategyState,type Factory,type Lot} from './model';
import {availableIC,construct,modelOutput,nextPrice,researchPerDay,studySlots,
  allocatedResearch,researchAhead,canAutoAttack,resistanceAfterDay,combatHits} from './rules';

export const STRATEGY_PHASES=[
  'economy-market','research-production','supply-movement-delegation',
  'combat-airstrike','occupation-politics',
] as const;
export interface StrategyOrder {planId:number;divisionId:number;targetProvince:number;type:'attack'|'defend';}
export interface Strike {factoryId:number;damage:number;}
export interface StrategyTickResult {
  next:StrategyState;phases:string[];orders:StrategyOrder[];
  production:{modelId:string;country:number;quantity:number}[];
  reports:{battleOrgLoss:number;factoryDamage:number};
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
  const baseline:StrategyState=structuredClone(initial);
  const phases:string[]=[],orders:StrategyOrder[]=[],production:StrategyTickResult['production']=[];
  let battleOrgLoss=0,factoryDamage=0;
  // Actual allocation is only applied to next. All coefficients read baseline.
  // A shortage in one item must not double-discount output in a postprocess step.
  const workerRemaining=new Map(baseline.nations.map(n=>[n.id,n.population.workers]));
  const claimWorkers=(f:Factory):number=>{
    const available=workerRemaining.get(f.country)??0;
    const taken=Math.min(available,f.workerDemand);
    workerRemaining.set(f.country,available-taken);
    return taken;
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
    const labor=claimWorkers(f),amount=region.resources[project.material]??0;
    const progress=construct(f,project.remainingIC,n.cash,amount,labor,project.cashPerIC,project.materialPerIC);
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
    const industry=owned.reduce((a,f)=>a+f.baseIC*(1-f.damage),0);
    const infraProvinces=baseline.provinces.filter(p=>p.controller===nation.id);
    const infra=infraProvinces.length?
      Math.min(1,infraProvinces.reduce((a,p)=>a+p.infrastructure,0)/infraProvinces.length/10):0;
    const slots=studySlots(industry,original.literacy,infra,original.researchSlotBonus);
    const active=next.research.filter(r=>r.country===nation.id&&!original.techDone.includes(r.techId))
      .sort((a,b)=>b.priority-a.priority||a.techId.localeCompare(b.techId));
    const allocations=allocatedResearch(researchPerDay(original,infra),active.map(r=>r.priority),slots);
    for(let i=0;i<active.length;i++){
      const r=active[i];
      const year=new Date(Date.UTC(2026,0,1)+baseline.tick*86400000).getUTCFullYear();
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
    const workforce=claimWorkers(f);
    // Materials are the single resource constraint in this iteration.
    const ic=availableIC(f,workforce,1,1,line.efficiency);
    const result=modelOutput(ic,line.carryIC,design,region.resources);
    line.carryIC=result.carry;
    for(const [good,qty] of Object.entries(result.spent))
      region.resources[good]=Math.max(0,(region.resources[good]??0)-qty);
    addLot(next.lots,'warehouse',line.country,design.id,result.count);
    if(result.count)production.push({modelId:design.id,country:line.country,quantity:result.count});
  }
  phases.push(STRATEGY_PHASES[1]);

  // 3. AI is a bounded proposal system. No unit movement is committed by this
  // routine; the future command dispatcher must revalidate every proposal.
  let evaluations=0;
  const plannedUnit=new Set<number>();
  for(const p of sorted(next.plans,x=>x.id)){
    const targets=[...new Set(p.targets)].sort((a,b)=>a-b);
    for(const uid of [...new Set(p.divisionIds)].sort((a,b)=>a-b)){
      if(orders.length>=16||evaluations>=1000)break;
      evaluations++;
      const u=next.divisions.find(d=>d.id===uid);
      if(!u||plannedUnit.has(uid)||u.manualHold||u.moving||u.inBattle||p.paused)continue;
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
      plannedUnit.add(uid);
    }
  }
  phases.push(STRATEGY_PHASES[2]);

  // 4. Deterministic expected-value reference combat. Production has already
  // been finalized. Aircraft/strategic bombing damage becomes effective tomorrow.
  const attacking=sorted(next.divisions.filter(d=>!d.moving),d=>d.id);
  const engaged=new Set<number>();
  for(const a of attacking){
    const province=next.provinces.find(p=>p.id===a.province);
    if(!province||a.country===province.controller||!atWar(next,a.country,province.controller))continue;
    const defender=attacking.find(x=>x.country===province.controller&&x.province===a.province&&!engaged.has(x.id));
    if(!defender||engaged.has(a.id))continue;
    engaged.add(a.id);engaged.add(defender.id);
    const attackerStats={...a,terrain:1,weather:1,commander:1,doctrine:1,planning:0};
    const defenderStats={...defender,terrain:1,weather:1,commander:1,doctrine:1,planning:0};
    const toDef=combatHits(attackerStats,defenderStats,true)*4;
    const toAtt=combatHits(defenderStats,attackerStats,false)*4;
    defender.organization=Math.max(0,defender.organization-toDef*2);
    defender.hp=Math.max(0,defender.hp-toDef*0.25);
    a.organization=Math.max(0,a.organization-toAtt*2);
    a.hp=Math.max(0,a.hp-toAtt*0.25);
    battleOrgLoss+=toDef*2+toAtt*2;
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
  if(sumPopulation(next)!==sumPopulation(baseline))throw new RangeError('population conservation');
  const productionTotal=production.reduce((s,p)=>s+p.quantity,0);
  if(lotTotal(next)-lotTotal(baseline)!==productionTotal)throw new RangeError('equipment conservation');
  return {next,phases,orders,production,reports:{battleOrgLoss,factoryDamage}};
}
