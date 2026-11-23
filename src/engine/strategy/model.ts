/** Canonical next-generation strategy ruleset; independent of legacy WorldState.
 * No persistence compatibility with old save v18 is promised.
 */
import type {EquipmentRevision} from './designer/frozen';
import {validateRevisionRegistry} from './designer/frozen';
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
  year:number; unlockTech?:string; ownerCountry?:number;
  softAttack:number; hardAttack:number; defense:number; breakthrough:number;
  armor:number; piercing:number; reliability:number;
  ic:number; materials:Record<Good,number>;
}
export interface Line {
  id:number; country:number; factoryId:number; modelId:string;
  efficiency:number; carryIC:number; carryByModel?:Record<string,number>; active:boolean;
}
export interface AirBase {
  id:number; province:number; country:number;
  capacity:number; damage:number;
}
export interface AirWing {
  id:number; country:number; baseId:number; modelId:string;
  pilots:number; mission:'grounded';
}
export interface Lot {
  holder:'warehouse'|'division'|'garrison'|'airwing'|'repairing'; holderId:number;
  modelId:string; quantity:number;
  /** Expected unrounded battle losses; follows the equipment when transferred. */
  combatLossCarry?:number;
}
export interface Division {
  id:number; country:number; province:number; planId:number|null;
  manualHold:boolean; moving:boolean; inBattle:boolean; destroyed?:boolean;
  casualtyCarry?:number; requiredEquipment?:Record<string,number>;
  combatWidth?:number;
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
  ruleset:'strategy-v1'; seed:number; tick:number; epochDays:number;
  equipmentCommandRevision?:number;
  nations:Nation[]; provinces:Province[]; regions:Region[];
  factories:Factory[]; construction:Construction[];
  designs:Design[]; designRevisions?:EquipmentRevision[]; lines:Line[]; lots:Lot[]; divisions:Division[];
  airBases?:AirBase[]; airWings?:AirWing[];
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
  if(w.ruleset!=='strategy-v1'||!Number.isSafeInteger(w.tick)||w.tick<0||!Number.isSafeInteger(w.epochDays))throw new RangeError('version/tick/epoch');
  if(w.equipmentCommandRevision!==undefined&&
    (!Number.isSafeInteger(w.equipmentCommandRevision)||w.equipmentCommandRevision<0))
    throw new RangeError('invalid equipment command revision');
  const ids=(xs:ReadonlyArray<{id:number|string}>,label:string)=>{
    if(new Set(xs.map(x=>x.id)).size!==xs.length)throw new RangeError('duplicate '+label);
  };
  ids(w.nations,'nation');ids(w.provinces,'province');ids(w.regions,'region');
  ids(w.factories,'factory');ids(w.construction,'construction');ids(w.designs,'design');
  ids(w.lines,'line');ids(w.divisions,'division');ids(w.plans,'plan');
  if((w.airBases!==undefined&&!Array.isArray(w.airBases))||
     (w.airWings!==undefined&&!Array.isArray(w.airWings)))
    throw new RangeError('invalid airbase/wing arrays');
  const airBases=w.airBases??[],airWings=w.airWings??[];
  ids(airBases,'airbase');ids(airWings,'airwing');
  // Focus definitions are reusable in every country; only (country,id) is unique.
  const focusKeys=w.focuses.map(f=>f.country+'\x1f'+f.id);
  if(new Set(focusKeys).size!==focusKeys.length)throw new RangeError('duplicate country focus');
  if(w.focuses.some(f=>!Number.isSafeInteger(f.country)||!w.nations.some(n=>n.id===f.country)||!f.id))
    throw new RangeError('invalid focus reference');
  const countries=new Set(w.nations.map(x=>x.id));
  const regions=new Set(w.regions.map(x=>x.id));
  const provinces=new Set(w.provinces.map(x=>x.id));
  const designs=new Set(w.designs.map(x=>x.id));
  const factories=new Map(w.factories.map(x=>[x.id,x]));
  const divisions=new Set(w.divisions.map(x=>x.id));
  const wingById=new Map(airWings.map(x=>[x.id,x]));
  const baseById=new Map(airBases.map(x=>[x.id,x]));
  const designById=new Map(w.designs.map(x=>[x.id,x]));
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
    const home=w.regions.find(r=>r.id===f.regionId)!;
    if(home.owner!==f.country&&!w.occupations.some(o=>
      o.regionId===home.id&&o.occupier===f.country&&o.share>=0.5))
      throw new RangeError('factory operated without occupied-area authorization');
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
    const currentDesign=w.designs.find(d=>d.id===line.modelId)!;
    if(line.carryIC>=currentDesign.ic+1e-8)throw new RangeError('model WIP exceeds unit IC');
    if(currentDesign.ownerCountry!==undefined&&currentDesign.ownerCountry!==line.country)
      throw new RangeError('production model belongs to another country');
    if(line.carryByModel){
      for(const [id,ic] of Object.entries(line.carryByModel)){
        const old=w.designs.find(d=>d.id===id);
        if(!old||id===line.modelId||!Number.isFinite(ic)||ic<0||ic>=old.ic+1e-8)
          throw new RangeError('invalid model WIP');
        if(old.ownerCountry!==undefined&&old.ownerCountry!==line.country)
          throw new RangeError('foreign model WIP');
      }
    }
    if(line.active){if(usedFactories.has(line.factoryId))throw new RangeError('factory double use');
      usedFactories.add(line.factoryId);}
  }
  for(const d of w.designs){
    if(d.reliability<0||d.reliability>1||!Number.isFinite(d.reliability)||d.ic<=0||!Number.isFinite(d.ic))
      throw new RangeError('design');
    if(d.ownerCountry!==undefined&&!countries.has(d.ownerCountry))
      throw new RangeError('invalid equipment designer country');
    for(const amount of Object.values(d.materials))nonnegative(amount);
  }
  const usedAirProvinces=new Set<number>();
  for(const base of airBases){
    const province=w.provinces.find(p=>p.id===base.province);
    if(!Number.isSafeInteger(base.id)||base.id<1||
      !province||!countries.has(base.country)||province.controller!==base.country||
      !Number.isSafeInteger(base.capacity)||base.capacity<0||
      !Number.isFinite(base.damage)||base.damage<0||base.damage>1||
      usedAirProvinces.has(base.province))
      throw new RangeError('invalid airbase capacity/ownership');
    usedAirProvinces.add(base.province);
  }
  for(const wing of airWings){
    const base=baseById.get(wing.baseId),design=designById.get(wing.modelId);
    if(!Number.isSafeInteger(wing.id)||wing.id<1||
      !countries.has(wing.country)||!base||base.country!==wing.country||
      !design||design.category!=='aircraft'||
      (design.ownerCountry!==undefined&&design.ownerCountry!==wing.country)||
      !Number.isSafeInteger(wing.pilots)||wing.pilots<0||wing.mission!=='grounded')
      throw new RangeError('invalid airwing');
  }
  const lotKeys=new Set<string>();
  for(const l of w.lots){
    const key=l.holder+'\x1f'+l.holderId+'\x1f'+l.modelId;
    if(lotKeys.has(key))throw new RangeError('duplicate equipment lot');
    lotKeys.add(key);
    if(!designs.has(l.modelId)||!Number.isSafeInteger(l.quantity)||l.quantity<0)
      throw new RangeError('lot');
    if(l.combatLossCarry!==undefined&&(!Number.isFinite(l.combatLossCarry)||
      l.combatLossCarry<0||l.combatLossCarry>l.quantity+1e-8))
      throw new RangeError('lot combat loss carry');
    const model=designById.get(l.modelId)!;
    const division=w.divisions.find(d=>d.id===l.holderId);
    const wing=wingById.get(l.holderId);
    if((l.holder==='warehouse'&&(!countries.has(l.holderId)||
          (model.ownerCountry!==undefined&&model.ownerCountry!==l.holderId)))||
      (l.holder==='division'&&(!divisions.has(l.holderId)||!division||
          model.category==='aircraft'||
          (model.ownerCountry!==undefined&&model.ownerCountry!==division.country)))||
      (l.holder==='garrison'&&!regions.has(l.holderId))||
      ((l.holder==='airwing'||l.holder==='repairing')&&
        (!wing||wing.modelId!==l.modelId||model.category!=='aircraft'))||
      !['warehouse','division','garrison','airwing','repairing'].includes(l.holder))
      throw new RangeError('lot holder/owner/type');
  }
  for(const u of w.divisions){
    if(!countries.has(u.country)||!provinces.has(u.province))throw new RangeError('division reference');
    if(u.casualtyCarry!==undefined&&(u.casualtyCarry<0||u.casualtyCarry>=1||!Number.isFinite(u.casualtyCarry)))throw new RangeError('invalid casualty carry');
    if(u.requiredEquipment && Object.entries(u.requiredEquipment).some(([key,v])=>
      !['infantry','artillery','tank','support'].includes(key)||!Number.isSafeInteger(v)||v<0))
      throw new RangeError('equipment requirements');
    if(u.combatWidth!==undefined&&
      (!Number.isSafeInteger(u.combatWidth)||u.combatWidth<1||u.combatWidth>120))
      throw new RangeError('invalid division combat width');
    for(const v of [u.soldiers,u.organization,u.hp,u.supply,u.hardness,u.softAttack,u.hardAttack,u.defense,u.breakthrough])
      nonnegative(v);
    if(u.hardness>1||u.supply>1)throw new RangeError('division ratio');
  }
  // Airbase hangars count both ready aircraft and aircraft in the repair queue.
  // Damage limits future operational sorties, NOT the existing parking footprint.
  const parking=new Map<number,number>();
  for(const lot of w.lots){
    if(lot.holder!=='airwing'&&lot.holder!=='repairing')continue;
    const baseId=wingById.get(lot.holderId)!.baseId;
    parking.set(baseId,(parking.get(baseId)??0)+lot.quantity);
  }
  for(const base of airBases){
    if((parking.get(base.id)??0)>base.capacity)
      throw new RangeError('airbase hangar capacity exceeded');
  }
  // A deployed soldier must exist exactly once inside the nation's exclusive POP pool.
  for(const n of w.nations){
    const deployed=w.divisions.filter(d=>d.country===n.id).reduce((a,d)=>a+d.soldiers,0)+
      airWings.filter(wing=>wing.country===n.id).reduce((a,wing)=>a+wing.pilots,0);
    if(deployed>n.population.soldiers)throw new RangeError('deployed soldiers exceed POP');
  }
  const unitAssignments=new Set<number>();
  for(const p of w.plans){
    if(!countries.has(p.country)||!countries.has(p.enemy)||p.country===p.enemy||
      p.provinces.some(x=>!provinces.has(x))||p.targets.some(x=>!provinces.has(x))||
      p.divisionIds.some(id=>!divisions.has(id)||w.divisions.find(d=>d.id===id)?.country!==p.country)||!Number.isSafeInteger(p.revision)||p.revision<1)
      throw new RangeError('plan reference');
    if(p.planning<0||p.planning>0.25||!Number.isFinite(p.planning))throw new RangeError('planning');
    if(new Set(p.divisionIds).size!==p.divisionIds.length)throw new RangeError('duplicate plan member');
    for(const id of p.divisionIds){
      if(unitAssignments.has(id))throw new RangeError('division assigned to multiple plans');
      unitAssignments.add(id);
      if(w.divisions.find(d=>d.id===id)?.planId!==p.id)throw new RangeError('division plan id mismatch');
    }
  }
  for(const u of w.divisions){
    if(u.planId!==null&&!unitAssignments.has(u.id))throw new RangeError('dangling division plan');
  }
  const quoteKeys=new Set<string>();
  for(const q of w.quotes){
    const key=q.country+'\x1f'+q.good;
    if(quoteKeys.has(key))throw new RangeError('duplicate quote');
    quoteKeys.add(key);
    if(!countries.has(q.country)||q.price<=0||q.basePrice<=0)
      throw new RangeError('quote references');
    for(const v of [q.price,q.basePrice,q.supply,q.demand])nonnegative(v);
  }
  const occupationKeys=new Set<string>();
  for(const o of w.occupations){
    const key=o.regionId+'\x1f'+o.occupier;
    if(occupationKeys.has(key))throw new RangeError('duplicate occupation');
    occupationKeys.add(key);
    if(!regions.has(o.regionId)||!countries.has(o.occupier))throw new RangeError('occupation references');
    if(o.share<0||o.share>1||o.resistance<0||o.resistance>100||
      o.compliance<0||o.compliance>100||o.garrisonSupply<0||o.garrisonSupply>1)
      throw new RangeError('occupation ratio');
  }
  for(const n of w.nations){
    const pop=w.regions.filter(r=>r.owner===n.id).reduce((a,r)=>a+r.population,0);
    if(pop!==populationSize(n.population))throw new RangeError('regional population mismatch');
  }
  validateRevisionRegistry(w);
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
        (w.regions.find(r=>r.id===build.regionId)?.owner!==pr.country &&
          !w.occupations.some(o=>o.regionId===build.regionId&&o.occupier===pr.country&&o.share>=0.5)))
        throw new RangeError('invalid new factory');
      nonnegative(build.baseIC);nonnegative(build.workerDemand);
      buildIds.add(build.id);
    }else if(pr.kind==='repair'){
      if(!pr.targetFactoryId||factories.get(pr.targetFactoryId)?.country!==pr.country)
        throw new RangeError('invalid repair target');
    }else throw new RangeError('construction kind');
  }
}
