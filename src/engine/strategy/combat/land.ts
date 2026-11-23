/** Land combat building blocks. The phase runner owns reserves and event ledger. */
import {combatHits,type BattleStats} from '../rules';
import {between} from '../designer/catalog';

export type BattalionKind='infantry'|'artillery'|'tank';
const WIDTH:Record<BattalionKind,number>={infantry:2,artillery:3,tank:4};
export type LandTerrain='plains'|'forest'|'hills'|'mountains'|'urban';
const TERRAIN_WIDTH:Record<LandTerrain,number>={plains:80,forest:70,hills:70,mountains:50,urban:60};

export interface Battalion {
  readonly kind:BattalionKind;
  readonly count:number;
  readonly softAttack:number;
  readonly hardAttack:number;
  readonly defense:number;
  readonly breakthrough:number;
  readonly armor:number;
  readonly piercing:number;
  readonly hardness:number;
  readonly manpowerFill:number;
  readonly equipmentFill:number;
}
export interface CompositionPreview {
  readonly width:number;
  readonly hardness:number;
  readonly armor:number;
  readonly piercing:number;
  readonly softAttack:number;
  readonly hardAttack:number;
  readonly defense:number;
  readonly breakthrough:number;
}
export function computeComposition(battalions:readonly Battalion[]):CompositionPreview {
  if(!Array.isArray(battalions)||battalions.length===0)throw new RangeError('empty formation');
  let width=0,armor=0,hardness=0,weightedPiercing=0,maxPiercing=0;
  let softAttack=0,hardAttack=0,defense=0,breakthrough=0;
  for(const b of battalions){
    if(!b||!Object.prototype.hasOwnProperty.call(WIDTH,b.kind)||!Number.isSafeInteger(b.count)||b.count<=0)
      throw new RangeError('invalid battalion');
    for(const v of [b.softAttack,b.hardAttack,b.defense,b.breakthrough,b.armor,b.piercing,b.hardness,
      b.manpowerFill,b.equipmentFill]){
      if(!Number.isFinite(v)||v<0)throw new RangeError('invalid battalion statistic');
    }
    if(b.manpowerFill>1||b.equipmentFill>1||b.hardness>1)throw new RangeError('invalid fill/ratio');
    const bw=b.count*WIDTH[b.kind],equipment=b.equipmentFill,fill=b.manpowerFill*equipment;
    width+=bw;
    armor+=bw*b.armor*equipment;
    hardness+=bw*b.hardness*equipment;
    weightedPiercing+=bw*b.piercing*equipment;
    maxPiercing=Math.max(maxPiercing,b.piercing*equipment);
    softAttack+=b.count*b.softAttack*fill;
    hardAttack+=b.count*b.hardAttack*fill;
    defense+=b.count*b.defense*fill;
    breakthrough+=b.count*b.breakthrough*fill;
  }
  if(!Number.isSafeInteger(width)||width<=0)throw new RangeError('invalid division width');
  return {width,hardness:between(hardness/width,0,1),armor:armor/width,
    piercing:.7*maxPiercing+.3*weightedPiercing/width,
    softAttack,hardAttack,defense,breakthrough};
}

export interface FrontlineCandidate { readonly id:number;readonly priority:number;readonly width:number; }
export interface FrontlineAllocation {
  readonly engaged:readonly {id:number;widthPenalty:number}[];
  readonly reserveIds:readonly number[];
  readonly capacity:number;
}
/** Both sides independently allocate width, one 6-hour phase at a time. */
export function allocateFrontline(units:readonly FrontlineCandidate[],terrain:LandTerrain):FrontlineAllocation {
  const capacity=TERRAIN_WIDTH[terrain];
  if(capacity===undefined)throw new RangeError('unknown terrain');
  if(new Set(units.map(u=>u.id)).size!==units.length)throw new RangeError('duplicate frontage unit');
  const sorted=[...units].sort((a,b)=>b.priority-a.priority||a.id-b.id);
  let used=0;
  const engaged:{id:number;widthPenalty:number}[]=[],reserveIds:number[]=[];
  for(const u of sorted){
    if(!Number.isSafeInteger(u.id)||u.id<0||!Number.isFinite(u.priority)||
      !Number.isSafeInteger(u.width)||u.width<=0)throw new RangeError('invalid frontline candidate');
    if(used+u.width<=capacity){
      engaged.push({id:u.id,widthPenalty:1});used+=u.width;
    }else reserveIds.push(u.id);
  }
  if(engaged.length===0&&sorted.length){
    const u=sorted[0];
    engaged.push({id:u.id,widthPenalty:between(capacity/u.width,.60,1)});
    const index=reserveIds.indexOf(u.id);
    if(index!==-1)reserveIds.splice(index,1);
  }
  return {engaged,reserveIds,capacity};
}

export interface ArmoredCombatStats extends BattleStats {
  readonly armor:number;
  readonly piercing:number;
}
export interface LandExchange {
  readonly attackerArmored:boolean;
  readonly defenderArmored:boolean;
  readonly attackerOrgLoss:number;readonly attackerHpLoss:number;
  readonly defenderOrgLoss:number;readonly defenderHpLoss:number;
}
/** Snapshot-simultaneous losses; callers must apply only once to actual units. */
export function resolveLandExchange(attacker:ArmoredCombatStats,defender:ArmoredCombatStats):LandExchange {
  for(const n of [attacker.armor,attacker.piercing,defender.armor,defender.piercing]){
    if(!Number.isFinite(n)||n<0)throw new RangeError('invalid armor/piercing');
  }
  const defenderArmored=defender.armor>attacker.piercing;
  const attackerArmored=attacker.armor>defender.piercing;
  const toDef=combatHits(attacker,defender,true);
  const toAtt=combatHits(defender,attacker,false);
  return {
    attackerArmored,defenderArmored,
    defenderHpLoss:toDef*.25*(defenderArmored?.5:1),
    defenderOrgLoss:toDef*2*(defenderArmored?.5:1)*(attackerArmored?1.2:1),
    attackerHpLoss:toAtt*.25*(attackerArmored?.5:1),
    attackerOrgLoss:toAtt*2*(attackerArmored?.5:1)*(defenderArmored?1.2:1),
  };
}
