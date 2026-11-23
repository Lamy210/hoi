/** Data-driven initial balance catalog. Values are original game hypotheses, not HOI4 formulas.
 * Keep catalog IDs stable: existing equipment revisions retain their frozen stats.
 */
export const DESIGN_BALANCE_VERSION = 'design-balance-v1' as const;

export interface MaterialBill { readonly [resource: string]: number; }
export interface ModuleCost {
  readonly mass: number;
  readonly ic: number;
  readonly complexity: number;
  readonly reliability: number;
  readonly tech: string;
  readonly materials: MaterialBill;
}

export const TANK_CHASSIS = {
  light: {mass:10,ratedMass:18,armor:15,speed:42,reliability:.94,ic:6,budget:6,bt:6,specialSlots:2,
    tech:'tank.chassis.light',materials:{steel:6}},
  medium: {mass:16,ratedMass:30,armor:25,speed:36,reliability:.93,ic:10,budget:9,bt:9,specialSlots:3,
    tech:'tank.chassis.medium',materials:{steel:10}},
  heavy: {mass:26,ratedMass:50,armor:45,speed:28,reliability:.92,ic:17,budget:12,bt:14,specialSlots:4,
    tech:'tank.chassis.heavy',materials:{steel:18}},
  superheavy: {mass:55,ratedMass:90,armor:80,speed:17,reliability:.89,ic:30,budget:14,bt:20,specialSlots:4,
    tech:'tank.chassis.superheavy',materials:{steel:35}},
} as const;
export type TankChassisId = keyof typeof TANK_CHASSIS;

export const TANK_GUNS = {
  antipersonnel:{mass:1.5,ic:3,complexity:2,reliability:-.010,soft:30,hard:6,piercing:15,
    tech:'tank.gun.antipersonnel',materials:{steel:1.5}},
  antitank:{mass:2,ic:4,complexity:3,reliability:-.025,soft:8,hard:28,piercing:75,
    tech:'tank.gun.antitank',materials:{steel:1.5,tungsten:.5}},
  multipurpose:{mass:2,ic:5,complexity:3,reliability:-.025,soft:20,hard:20,piercing:50,
    tech:'tank.gun.multipurpose',materials:{steel:2,tungsten:.5}},
} as const;
export type TankGunId = keyof typeof TANK_GUNS;

export const TANK_TURRETS = {
  one:{mass:1,ic:1.5,complexity:1,reliability:0,attackFactor:.85,breakthrough:0,
    tech:'tank.turret.one',materials:{steel:1}},
  two:{mass:1.8,ic:2.5,complexity:2,reliability:-.010,attackFactor:.95,breakthrough:3,
    tech:'tank.turret.two',materials:{steel:1.5}},
  three:{mass:2.5,ic:3.5,complexity:2,reliability:-.020,attackFactor:1,breakthrough:7,
    tech:'tank.turret.three',materials:{steel:2}},
} as const;
export type TankTurretId = keyof typeof TANK_TURRETS;

export const TANK_ENGINES = {
  gasoline:{mass:1.6,ic:2.8,complexity:1,reliability:-.015,power:280,fuelFactor:1.10,
    tech:'tank.engine.gasoline',materials:{steel:1,rubber:.5}},
  diesel:{mass:2,ic:3.2,complexity:1,reliability:0,power:250,fuelFactor:.85,
    tech:'tank.engine.diesel',materials:{steel:1.2,rubber:.4}},
  turbine:{mass:3,ic:6,complexity:3,reliability:-.075,power:440,fuelFactor:1.55,
    tech:'tank.engine.turbine',materials:{steel:2,rubber:.6}},
} as const;
export type TankEngineId = keyof typeof TANK_ENGINES;

export const TANK_ARMORS = {
  riveted:{mass:2,ic:2,complexity:1,reliability:-.010,armor:15,slope:1,
    tech:'tank.armor.riveted',materials:{steel:2}},
  welded:{mass:3,ic:4,complexity:2,reliability:.005,armor:25,slope:1,
    tech:'tank.armor.welded',materials:{steel:3}},
  sloped:{mass:4,ic:5.5,complexity:3,reliability:-.020,armor:30,slope:1.22,
    tech:'tank.armor.sloped',materials:{steel:4}},
} as const;
export type TankArmorId = keyof typeof TANK_ARMORS;

export const TANK_SPECIALS = {
  radio:{mass:.2,ic:1.4,complexity:1,reliability:-.005,armor:0,breakthrough:2,rangeBonus:0,
    tech:'tank.special.radio',materials:{steel:.2}},
  fuelTank:{mass:.5,ic:1.1,complexity:1,reliability:-.010,armor:0,breakthrough:0,rangeBonus:.20,
    tech:'tank.special.fuelTank',materials:{steel:.5,rubber:.2}},
  appliqueArmor:{mass:2,ic:2.6,complexity:1,reliability:-.025,armor:15,breakthrough:0,rangeBonus:0,
    tech:'tank.special.appliqueArmor',materials:{steel:2}},
} as const;
export type TankSpecialId = keyof typeof TANK_SPECIALS;

export const AIR_FRAMES = {
  small:{mass:2.5,maxMass:6,speed:470,range:650,agility:90,reliability:.92,ic:8,payload:1.5,
    minEngines:1,maxEngines:2,weaponSlots:2,specialSlots:2,budget:6,defense:5,
    tech:'air.frame.small',materials:{aluminium:3}},
  medium:{mass:6,maxMass:16,speed:410,range:1200,agility:55,reliability:.91,ic:16,payload:5,
    minEngines:2,maxEngines:4,weaponSlots:3,specialSlots:3,budget:10,defense:10,
    tech:'air.frame.medium',materials:{aluminium:8}},
  large:{mass:14,maxMass:35,speed:350,range:2100,agility:28,reliability:.90,ic:28,payload:12,
    minEngines:2,maxEngines:6,weaponSlots:4,specialSlots:4,budget:14,defense:18,
    tech:'air.frame.large',materials:{aluminium:18}},
} as const;
export type AirFrameId = keyof typeof AIR_FRAMES;

export const AIR_ENGINES = {
  piston:{mass:.8,ic:3.5,complexity:1,reliability:-.010,thrust:60,
    tech:'air.engine.piston',materials:{aluminium:1,rubber:.3}},
  jet:{mass:1.6,ic:7,complexity:3,reliability:-.055,thrust:110,
    tech:'air.engine.jet',materials:{aluminium:2,rubber:.5}},
} as const;
export type AirEngineId = keyof typeof AIR_ENGINES;

export const AIR_WEAPONS = {
  machineGun:{mass:.2,ic:1.8,complexity:1,reliability:-.005,airAttack:8,ground:0,strategic:0,naval:0,
    agility:0,drag:.03,tech:'air.weapon.machineGun',materials:{steel:.2}},
  cannon:{mass:.4,ic:3,complexity:2,reliability:-.015,airAttack:18,ground:0,strategic:0,naval:0,
    agility:-8,drag:.06,tech:'air.weapon.cannon',materials:{steel:.4}},
  bombBay:{mass:1.2,ic:4.5,complexity:2,reliability:-.025,airAttack:0,ground:14,strategic:18,naval:0,
    agility:0,drag:.15,tech:'air.weapon.bombBay',materials:{steel:.6}},
  torpedo:{mass:1,ic:4,complexity:2,reliability:-.015,airAttack:0,ground:0,strategic:0,naval:24,
    agility:0,drag:.12,tech:'air.weapon.torpedo',materials:{steel:.7}},
  rockets:{mass:.5,ic:3,complexity:2,reliability:-.020,airAttack:3,ground:16,strategic:0,naval:0,
    agility:0,drag:.08,tech:'air.weapon.rockets',materials:{steel:.4}},
} as const;
export type AirWeaponId = keyof typeof AIR_WEAPONS;

export const AIR_SPECIALS = {
  dropTank:{mass:.5,ic:1.5,complexity:1,reliability:-.010,rangeBonus:.40,agility:-6,defense:0,detection:0,drag:.08,speedFactor:1,
    tech:'air.special.dropTank',materials:{aluminium:.4}},
  selfSealingTank:{mass:.4,ic:2,complexity:1,reliability:.015,rangeBonus:0,agility:-3,defense:12,detection:0,drag:.02,speedFactor:1,
    tech:'air.special.selfSealingTank',materials:{rubber:.5}},
  radar:{mass:.2,ic:2,complexity:1,reliability:-.005,rangeBonus:0,agility:-3,defense:0,detection:.15,drag:.04,speedFactor:1,
    tech:'air.special.radar',materials:{aluminium:.3}},
  diveBrake:{mass:.2,ic:1.4,complexity:1,reliability:-.010,rangeBonus:0,agility:0,defense:0,detection:0,drag:.06,speedFactor:.95,
    tech:'air.special.diveBrake',materials:{steel:.2}},
} as const;
export type AirSpecialId = keyof typeof AIR_SPECIALS;

/** Runtime assertions are necessary: a saved/remote design can bypass TypeScript. */
export function partById<T>(table:Readonly<Record<string,T>>,key:string,slot:string):T {
  if(!Object.prototype.hasOwnProperty.call(table,key))throw new RangeError('unknown '+slot+': '+key);
  return table[key];
}
export function requireUnblocked(tech:string,unlocked:ReadonlySet<string>):void {
  if(!unlocked.has(tech))throw new RangeError('technology not researched: '+tech);
}
export function round2(v:number):number {
  if(!Number.isFinite(v))throw new RangeError('non-finite design statistic');
  return Math.round((v+Number.EPSILON)*100)/100;
}
export function between(v:number,lo:number,hi:number):number {
  if(!Number.isFinite(v)||!Number.isFinite(lo)||!Number.isFinite(hi)||lo>hi)throw new RangeError('invalid design number');
  return Math.min(hi,Math.max(lo,v));
}
export function materialBill(parts: readonly {readonly materials:MaterialBill}[]):Record<string,number> {
  const result:Record<string,number>={};
  for(const part of parts){
    for(const [k,v] of Object.entries(part.materials)){
      if(!Number.isFinite(v)||v<0)throw new RangeError('invalid material bill');
      result[k]=(result[k]??0)+v;
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,round2(v)]));
}
