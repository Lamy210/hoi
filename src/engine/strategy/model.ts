/** Canonical next-generation strategy ruleset; independent of legacy WorldState.
 * No persistence compatibility with old save v18 is promised.
 */
export type Good = string;
export interface Pop {
  dependents:number; unemployed:number; workers:number;
  researchers:number; reserves:number; soldiers:number;
}
export type PopKey=keyof Pop;
export interface Nation {
  id:number; population:Pop; cash:number; householdCash:number;
  literacy:number; education:number; stability:number;
  researchSlotBonus:number; focusDone:string[]; techDone:string[];
}
export interface Province {
  id:number; regionId:number; owner:number; controller:number;
  terrain:string; adjacent:number[]; infrastructure:number;
}
export interface Region {
  id:number; owner:number; provinces:number[]; population:number;
  resources:Record<Good,number>;
}
export interface Factory {
  id:number; regionId:number; country:number;
  kind:'civilian'|'military'; baseIC:number; damage:number; workerDemand:number;
}
export interface Construction {
  id:number; country:number; factoryId:number;
  kind:'build'|'repair'; targetFactoryId?:number;
  newFactory?:{id:number;regionId:number;kind:'civilian'|'military';baseIC:number;workerDemand:number};
  remainingIC:number; cashPerIC:number; material:Good; materialPerIC:number;
}
export interface Design {
  id:string; category:'infantry'|'artillery'|'tank'|'aircraft'|'support';
  year:number; unlockTech?:string;
  softAttack:number; hardAttack:number; defense:number; breakthrough:number;
  armor:number; piercing:number; reliability:number;
  ic:number; materials:Record<Good,number>;
}
export interface Line {
  id:number; country:number; factoryId:number; modelId:string;
  efficiency:number; carryIC:number; active:boolean;
}
export interface Lot {
  holder:'warehouse'|'division'|'garrison'; holderId:number;
  modelId:string; quantity:number;
}
export interface Division {
  id:number; country:number; province:number; planId:number|null;
  manualHold:boolean; moving:boolean; inBattle:boolean;
  soldiers:number; organization:number; hp:number; hardness:number;
  supply:number; softAttack:number; hardAttack:number;
  defense:number; breakthrough:number;
}
export interface Plan {
  id:number; country:number; enemy:number; divisionIds:number[];
  kind:'FRONT'|'OFFENSIVE'|'DEFENSIVE'|'GARRISON';
  autonomy:'MANUAL'|'ADVISORY'|'HYBRID'|'AUTO';
  authorized:boolean; paused:boolean; revision:number;
  provinces:number[]; targets:number[]; planning:number;
}
export interface Research {
  country:number; techId:string; year:number; progress:number;
  total:number; priority:number; instituteBonus:number; mioBonus:number;
}
export interface Spirit {
  id:string; country:number; stat:string; value:number;
}
export interface Focus {
  id:string; country:number; requires:string[]; exclusive?:string;
  effects:ReadonlyArray<{kind:'spirit'|'researchSlot';id:string;stat?:string;value:number}>;
}
export interface Occupation {
  regionId:number; occupier:number; share:number; resistance:number;
  compliance:number; policy:'lenient'|'military'|'exploit';
  garrisonSupply:number;
}
export interface Quote {
  country:number; good:Good; price:number; basePrice:number;
  supply:number; demand:number;
}
export interface StrategyState {
  ruleset:'strategy-v1'; seed:number; tick:number;
  nations:Nation[]; provinces:Province[]; regions:Region[];
  factories:Factory[]; construction:Construction[];
  designs:Design[]; lines:Line[]; lots:Lot[]; divisions:Division[];
  plans:Plan[]; research:Research[]; spirits:Spirit[];
  focuses:Focus[]; occupations:Occupation[]; quotes:Quote[];
  wars:{a:number;b:number}[];
}
export const clamp=(value:number,min:number,max:number):number=>{
  if(![value,min,max].every(Number.isFinite)||min>max)throw new RangeError('invalid numeric input');
  return Math.max(min,Math.min(max,value));
};
export const nonnegative=(n:number):number=>{
  if(!Number.isFinite(n)||n<0)throw new RangeError('negative / nonfinite');
  return n;
};
export function populationSize(p:Pop):number{
  const values=Object.values(p);
  if(values.some(v=>!Number.isSafeInteger(v)||v<0))throw new RangeError('population cohort');
  const sum=values.reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(sum))throw new RangeError('population total');
  return sum;
}
export function atWar(w:Pick<StrategyState,'wars'>,a:number,b:number):boolean{
  return w.wars.some(x=>(x.a===a&&x.b===b)||(x.a===b&&x.b===a));
}
export function assertStrategyState(w:StrategyState):void{
  if(w.ruleset!=='strategy-v1'||!Number.isSafeInteger(w.tick)||w.tick<0)throw new RangeError('version/tick');
  const ids=(xs:ReadonlyArray<{id:number|string}>,label:string)=>{
    if(new Set(xs.map(x=>x.id)).size!==xs.length)throw new RangeError('duplicate '+label);
  };
  ids(w.nations,'nation');ids(w.provinces,'province');ids(w.regions,'region');
  ids(w.factories,'factory');ids(w.construction,'construction');ids(w.designs,'design');
  ids(w.lines,'line');ids(w.divisions,'division');ids(w.plans,'plan');ids(w.focuses,'focus');
  const countries=new Set(w.nations.map(x=>x.id));
  const regions=new Set(w.regions.map(x=>x.id));
  const provinces=new Set(w.provinces.map(x=>x.id));
  const designs=new Set(w.designs.map(x=>x.id));
  const factories=new Map(w.factories.map(x=>[x.id,x]));
  const divisions=new Set(w.divisions.map(x=>x.id));
  for(const n of w.nations){
    populationSize(n.population);
    nonnegative(n.cash);nonnegative(n.householdCash);
    for(const r of [n.literacy,n.education,n.stability])if(r<0||r>1||!Number.isFinite(r))throw new RangeError('nation ratio');
  }
  for(const p of w.provinces){
    if(!countries.has(p.owner)||!countries.has(p.controller)||!regions.has(p.regionId)||
      p.adjacent.some(x=>!provinces.has(x)))throw new RangeError('province references');
    nonnegative(p.infrastructure);
  }
  const assignedProvinces=new Set<number>();
  for(const r of w.regions){
    if(!countries.has(r.owner)||r.provinces.some(x=>!provinces.has(x)))throw new RangeError('region references');
    for(const p of r.provinces){
      if(assignedProvinces.has(p)||w.provinces.find(x=>x.id===p)?.regionId!==r.id)
        throw new RangeError('province belongs to multiple regions');
      assignedProvinces.add(p);
    }
    nonnegative(r.population);
    for(const qty of Object.values(r.resources))nonnegative(qty);
  }
  if(assignedProvinces.size!==w.provinces.length)throw new RangeError('unassigned province');
  for(const f of w.factories){
    if(!regions.has(f.regionId)||!countries.has(f.country))throw new RangeError('factory references');
    nonnegative(f.baseIC);nonnegative(f.workerDemand);
    if(f.damage<0||f.damage>1||!Number.isFinite(f.damage))throw new RangeError('factory damage');
  }
  const usedFactories=new Set<number>();
  for(const line of w.lines){
    if(!countries.has(line.country)||!designs.has(line.modelId)||
      factories.get(line.factoryId)?.country!==line.country||
      factories.get(line.factoryId)?.kind!=='military')throw new RangeError('line reference');
    if(line.efficiency<0||line.efficiency>1||!Number.isFinite(line.efficiency))
      throw new RangeError('efficiency');
    nonnegative(line.carryIC);
    if(line.active){if(usedFactories.has(line.factoryId))throw new RangeError('factory double use');
      usedFactories.add(line.factoryId);}
  }
  for(const d of w.designs){
    if(d.reliability<0||d.reliability>1||!Number.isFinite(d.reliability)||d.ic<=0||!Number.isFinite(d.ic))
      throw new RangeError('design');
    for(const amount of Object.values(d.materials))nonnegative(amount);
  }
  for(const l of w.lots){
    if(!designs.has(l.modelId)||!Number.isSafeInteger(l.quantity)||l.quantity<0)
      throw new RangeError('lot');
    if((l.holder==='warehouse'&&!countries.has(l.holderId))||
      (l.holder==='division'&&!divisions.has(l.holderId))||
      (l.holder==='garrison'&&!regions.has(l.holderId)))throw new RangeError('lot holder');
  }
  for(const u of w.divisions){
    if(!countries.has(u.country)||!provinces.has(u.province))throw new RangeError('division reference');
    for(const v of [u.soldiers,u.organization,u.hp,u.supply,u.hardness,u.softAttack,u.hardAttack,u.defense,u.breakthrough])
      nonnegative(v);
    if(u.hardness>1||u.supply>1)throw new RangeError('division ratio');
  }
  // A deployed soldier must exist exactly once inside the nation's exclusive POP pool.
  for(const n of w.nations){
    const deployed=w.divisions.filter(d=>d.country===n.id).reduce((a,d)=>a+d.soldiers,0);
    if(deployed>n.population.soldiers)throw new RangeError('deployed soldiers exceed POP');
  }
  for(const p of w.plans){
    if(!countries.has(p.country)||!countries.has(p.enemy)||p.country===p.enemy||
      p.provinces.some(x=>!provinces.has(x))||p.targets.some(x=>!provinces.has(x))||
      p.divisionIds.some(id=>!divisions.has(id)||w.divisions.find(d=>d.id===id)?.country!==p.country)||!Number.isSafeInteger(p.revision)||p.revision<1)
      throw new RangeError('plan reference');
    if(p.planning<0||p.planning>0.25||!Number.isFinite(p.planning))throw new RangeError('planning');
  }
  for(const q of w.quotes){
    if(!countries.has(q.country)||q.price<=0||q.basePrice<=0)
      throw new RangeError('quote references');
    for(const v of [q.price,q.basePrice,q.supply,q.demand])nonnegative(v);
  }
  for(const o of w.occupations){
    if(!regions.has(o.regionId)||!countries.has(o.occupier))throw new RangeError('occupation references');
    if(o.share<0||o.share>1||o.resistance<0||o.resistance>100||
      o.compliance<0||o.compliance>100||o.garrisonSupply<0||o.garrisonSupply>1)
      throw new RangeError('occupation ratio');
  }
  for(const r of w.regions){
    const shares=w.occupations.filter(o=>o.regionId===r.id).reduce((a,b)=>a+b.share,0);
    if(shares>1+1e-8)throw new RangeError('occupation overcommit');
  }
  const buildIds=new Set<number>(),constructionSites=new Set<number>();
  for(const pr of w.construction){
    const source=factories.get(pr.factoryId);
    if(!source||source.country!==pr.country||source.kind!=='civilian'||!countries.has(pr.country)||
      pr.cashPerIC<0||pr.materialPerIC<0||!Number.isFinite(pr.cashPerIC)||!Number.isFinite(pr.materialPerIC))
      throw new RangeError('construction refs');
    if(constructionSites.has(pr.factoryId))throw new RangeError('double construction factory allocation');
    constructionSites.add(pr.factoryId);
    nonnegative(pr.remainingIC);
    if(pr.kind==='build'){
      const build=pr.newFactory;
      if(!build||buildIds.has(build.id)||factories.has(build.id)||
        !Number.isSafeInteger(build.id)||build.id<1||!regions.has(build.regionId)||
        w.regions.find(r=>r.id===build.regionId)?.owner!==pr.country)
        throw new RangeError('invalid new factory');
      nonnegative(build.baseIC);nonnegative(build.workerDemand);
      buildIds.add(build.id);
    }else if(pr.kind==='repair'){
      if(!pr.targetFactoryId||factories.get(pr.targetFactoryId)?.country!==pr.country)
        throw new RangeError('invalid repair target');
    }else throw new RangeError('construction kind');
  }
}
