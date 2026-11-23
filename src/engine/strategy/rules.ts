/** Pure, deterministic rules for integrated grand strategy.
 * The values are balancing hypotheses; old game engine rules are not reused.
 */
import {clamp,nonnegative,populationSize,atWar,type Pop,type PopKey,type Nation,type Factory,type Design,type Division,type Plan,type Quote,type Occupation,type Focus,type StrategyState} from './model';

export function transferPop(pop:Pop,from:PopKey,to:PopKey,count:number):Pop{
  populationSize(pop);
  if(!Number.isSafeInteger(count)||count<0||count>pop[from])throw new RangeError('pop transfer');
  if(from===to)return {...pop};
  return {...pop,[from]:pop[from]-count,[to]:pop[to]+count};
}
export function conscript(pop:Pop,count:number):Pop{
  if(!Number.isSafeInteger(count)||count<0)throw new RangeError('conscription');
  let next={...pop},remain=count;
  for(const group of ['unemployed','reserves','workers'] as const){
    const take=Math.min(remain,next[group]);
    next=transferPop(next,group,'soldiers',take);
    remain-=take;
  }
  if(remain)throw new RangeError('not enough eligible population');
  return next;
}
export function studySlots(industrialScore:number,literacy:number,infra:number,bonus=0):number{
  const score=0.45*Math.sqrt(clamp(industrialScore/80,0,1))+
    0.40*clamp(literacy,0,1)+0.15*clamp(infra,0,1);
  return Math.floor(clamp(1+[0.30,0.50,0.70,0.88].filter(x=>score>=x).length+bonus,1,6));
}
export function researchPerDay(n:Nation,infra:number):number{
  const researchers=nonnegative(n.population.researchers);
  return Math.max(0.05,researchers*0.003*clamp(n.literacy,0,1)*
    (0.3+0.7*clamp(n.education,0,1))*(0.5+0.5*clamp(infra,0,1)));
}
export function researchAhead(year:number,techYear:number):number{
  const d=Math.max(0,techYear-year);
  return Math.min(5,1+0.75*d+0.15*d*d);
}
export function allocatedResearch(totalRP:number,weights:readonly number[],slots:number):number[]{
  nonnegative(totalRP);
  if(!Number.isSafeInteger(slots)||slots<0)throw new RangeError('research slots');
  if(weights.some(x=>!Number.isFinite(x)||x<0))throw new RangeError('research priority');
  const eligible=weights.slice(0,slots),sum=eligible.reduce((a,b)=>a+b,0);
  return weights.map((_,i)=>i<slots&&sum>0?totalRP*eligible[i]/sum:0);
}
export function nextPrice(q:Quote,alpha=0.2):number{
  if(q.basePrice<=0||q.price<=0)throw new RangeError('price');
  const target=q.basePrice*clamp(Math.sqrt((nonnegative(q.demand)+0.01)/(nonnegative(q.supply)+0.01)),0.25,4);
  return clamp((1-alpha)*q.price+alpha*target,q.basePrice*0.25,q.basePrice*4);
}
export interface TradeResult {quantity:number;paid:number;buyerCash:number;sellerCash:number;buyerStock:number;sellerStock:number;}
export function settleTrade(qty:number,price:number,buyerCash:number,sellerCash:number,buyerStock:number,sellerStock:number):TradeResult{
  for(const v of [qty,price,buyerCash,sellerCash,buyerStock,sellerStock])nonnegative(v);
  if(price<=0)throw new RangeError('trade price');
  const quantity=Math.max(0,Math.min(Math.floor(qty),Math.floor(sellerStock),Math.floor(buyerCash/price+1e-9)));
  const paid=quantity*price;
  return {quantity,paid,buyerCash:buyerCash-paid,sellerCash:sellerCash+paid,buyerStock:buyerStock+quantity,sellerStock:sellerStock-quantity};
}
export interface ConstructionResult {progressIC:number;paid:number;materialsSpent:number;nextDamage?:number;}
export function construct(
  factory:Factory,remainingIC:number,budget:number,materials:number,workersAvailable:number,
  cashPerIC:number,materialPerIC:number,
):ConstructionResult{
  for(const v of [remainingIC,budget,materials,workersAvailable,cashPerIC,materialPerIC])nonnegative(v);
  const work= factory.baseIC*(1-factory.damage)*
    (factory.workerDemand>0?clamp(workersAvailable/factory.workerDemand,0,1):1);
  const p=Math.max(0,Math.min(remainingIC,work,
    cashPerIC>0?budget/cashPerIC:Infinity,
    materialPerIC>0?materials/materialPerIC:Infinity));
  return {progressIC:p,paid:p*cashPerIC,materialsSpent:p*materialPerIC};
}
export function availableIC(f:Factory,workforce:number,resourceFill:number,energyFill:number,efficiency:number):number{
  for(const x of [f.baseIC,workforce,resourceFill,energyFill,efficiency])nonnegative(x);
  const staff=f.workerDemand>0?clamp(workforce/f.workerDemand,0,1):1;
  return f.baseIC*(1-f.damage)*staff*Math.min(clamp(resourceFill,0,1),clamp(energyFill,0,1))*clamp(efficiency,0,1);
}
export function modelOutput(
  available:number,carry:number,design:Design,materialStock:Record<string,number>,
):{count:number;spent:Record<string,number>;carry:number}{
  nonnegative(available);nonnegative(carry);
  if(design.ic<=0||!Number.isFinite(design.ic))throw new RangeError('design IC');
  const potential=Math.floor((available+carry)/design.ic+1e-10);
  let count=potential;
  for(const [good,required] of Object.entries(design.materials)){
    nonnegative(required);
    if(required>0)count=Math.min(count,Math.floor((materialStock[good]??0)/required+1e-10));
  }
  count=Math.max(0,count);
  const spent:Record<string,number>={};
  for(const [good,amount] of Object.entries(design.materials))spent[good]=count*amount;
  // Do not bank missing-resource capacity for later: carry represents physical
  // manufacturing WIP only, and is capped strictly below one item cost.
  return {count,spent,carry:count===potential?Math.max(0,available+carry-count*design.ic):0};
}
export function wearExpected(quantity:number,reliability:number,exposure:number):number{
  nonnegative(quantity);nonnegative(exposure);
  return quantity*(1-clamp(reliability,0,1))*exposure*0.002;
}
export interface BattleStats {
  softAttack:number;hardAttack:number;hardness:number;
  defense:number;breakthrough:number;
  terrain:number;weather:number;supply:number;commander:number;doctrine:number;planning:number;
}
export function combatHits(attacker:BattleStats,defender:BattleStats,attacking=true):number{
  const raw=nonnegative(attacker.softAttack)*(1-clamp(defender.hardness,0,1))+
    nonnegative(attacker.hardAttack)*clamp(defender.hardness,0,1);
  const mod=[attacker.terrain,attacker.weather,attacker.supply,attacker.commander,attacker.doctrine,1+attacker.planning]
    .reduce((a,x)=>a*nonnegative(x),1);
  const power=raw*mod,block=nonnegative(attacking?defender.defense:defender.breakthrough);
  return 0.012*(0.15*Math.min(power,block)+0.55*Math.max(power-block,0));
}
export function canAutoAttack(w:Pick<StrategyState,'wars'>,plan:Plan,unit:Division):boolean{
  return plan.authorized&&!plan.paused&&plan.autonomy==='AUTO'&&
    plan.kind==='OFFENSIVE'&&atWar(w,plan.country,plan.enemy)&&
    unit.country===plan.country&&!unit.manualHold&&!unit.moving&&!unit.inBattle;
}
export function resistanceAfterDay(o:Occupation,atWarNow:boolean,grievance=0):{resistance:number;compliance:number}{
  const policy={lenient:{unrest:-8,compliance:1.5},military:{unrest:-12,compliance:0.65},
    exploit:{unrest:20,compliance:0.25}}[o.policy];
  const rTarget=clamp(15+0.25*(100-o.compliance)+(atWarNow?10:0)+grievance+
    policy.unrest-18*clamp(o.garrisonSupply,0,1),0,100);
  const resistance=clamp(o.resistance+0.04*(rTarget-o.resistance),0,100);
  const compliance=clamp(o.compliance+0.09*(1-o.compliance/100)*
    policy.compliance*clamp(o.garrisonSupply,0,1)*(1-resistance/125)-
    Math.max(0,resistance-60)*0.003,0,100);
  return {resistance,compliance};
}
export function occupationExtractableIC(physicalIC:number,records:readonly Occupation[]):Record<number,number>{
  nonnegative(physicalIC);
  let total=0;
  const out:Record<number,number>={};
  for(const o of [...records].sort((a,b)=>a.occupier-b.occupier)){
    if(o.share<0||o.share>1)throw new RangeError('occupation share');
    const policyFactor=o.policy==='lenient'?0.7:o.policy==='exploit'?1.25:1;
    const share=Math.min(o.share,Math.max(0,1-total));total+=share;
    out[o.occupier]=(out[o.occupier]??0)+Math.min(physicalIC*share,
      physicalIC*share*policyFactor*Math.max(0,1-o.resistance*0.004));
  }
  return out;
}
export function validFocusTree(foci:readonly Focus[]):string[]{
  const issues:string[]=[];
  const map=new Map(foci.map(f=>[f.id,f]));
  if(map.size!==foci.length)issues.push('duplicate focus id');
  const visiting=new Set<string>(),seen=new Set<string>();
  const visit=(id:string):void=>{
    if(visiting.has(id)){issues.push('focus cycle:'+id);return;}
    if(seen.has(id))return;
    visiting.add(id);
    for(const req of map.get(id)?.requires??[]){
      if(!map.has(req))issues.push('unknown focus:'+req);
      else visit(req);
    }
    visiting.delete(id);seen.add(id);
  };
  for(const f of foci)visit(f.id);
  return issues;
}
export function applyFocus(n:Nation,focus:Focus,all:readonly Focus[],spirits:readonly {id:string;country:number;stat:string;value:number}[]):{
  nation:Nation;spirits:{id:string;country:number;stat:string;value:number}[]
}{
  if(focus.country!==n.id||n.focusDone.includes(focus.id))throw new RangeError('focus already done or foreign');
  if(focus.requires.some(x=>!n.focusDone.includes(x)))throw new RangeError('focus prerequisite');
  if(all.some(x=>x.country===n.id&&x.id!==focus.id&&x.exclusive&&x.exclusive===focus.exclusive&&n.focusDone.includes(x.id)))
    throw new RangeError('exclusive focus');
  const effects=[...spirits];
  let bonus=n.researchSlotBonus;
  for(const e of focus.effects){
    if(e.kind==='researchSlot')bonus+=e.value;
    else if(e.kind==='spirit'&&e.stat){
      if(effects.some(s=>s.country===n.id&&s.id===e.id&&s.stat===e.stat))throw new RangeError('duplicate spirit');
      effects.push({id:e.id,country:n.id,stat:e.stat,value:e.value});
    }else throw new RangeError('focus effect');
  }
  return {nation:{...n,researchSlotBonus:bonus,focusDone:[...n.focusDone,focus.id]},spirits:effects};
}

/** Exclusive physical operation rights: the owner and occupiers must never
 * collectively operate more than 100% of a factory's intact IC.
 */
export function controlledFactoryFraction(regionOwner:number,operator:number,records:readonly Occupation[]):number{
  const occupied=records.reduce((sum,o)=>sum+clamp(o.share,0,1),0);
  if(occupied>1+1e-8)throw new RangeError('overallocated occupation');
  if(operator===regionOwner)return Math.max(0,1-occupied);
  return Math.min(1,records.filter(o=>o.occupier===operator).reduce((sum,o)=>{
    const raw=clamp(o.share,0,1),policy=o.policy==='lenient'?0.7:o.policy==='exploit'?1.25:1;
    return sum+Math.min(raw,raw*policy*(1-o.resistance*0.004));
  },0));
}
