/** Deterministic tank blueprint preview: no factory, warehouse or nation mutation. */
import {
  DESIGN_BALANCE_VERSION,TANK_CHASSIS,TANK_GUNS,TANK_TURRETS,TANK_ENGINES,TANK_ARMORS,
  TANK_SPECIALS,partById,requireUnblocked,materialBill,round2,between,
  type TankChassisId,type TankGunId,type TankTurretId,type TankEngineId,
  type TankArmorId,type TankSpecialId,
} from './catalog';

export interface TankBlueprint {
  readonly chassis:TankChassisId;
  readonly gun:TankGunId;
  readonly turret:TankTurretId;
  readonly engine:TankEngineId;
  readonly armor:TankArmorId;
  readonly specials:readonly TankSpecialId[];
}
export interface TankPreview {
  readonly catalogVersion:typeof DESIGN_BALANCE_VERSION;
  readonly massT:number;
  readonly ratedMassT:number;
  readonly powerKw:number;
  readonly powerWeight:number;
  readonly speedKmh:number;
  readonly fuelPer100Km:number;
  readonly operationalRangeKm:number;
  readonly armor:number;
  readonly piercing:number;
  readonly softAttack:number;
  readonly hardAttack:number;
  readonly breakthrough:number;
  readonly reliability:number;
  readonly ic:number;
  readonly complexity:number;
  readonly overflow:number;
  readonly materials:Readonly<Record<string,number>>;
}

/** Techs are a caller-owned snapshot. A future command handler must revalidate
 * the actor's actual techDone at commit time, not trust client-sent unlocks.
 */
export function previewTank(blueprint:TankBlueprint,unlockedTechs:readonly string[]):TankPreview {
  if(!blueprint||!Array.isArray(blueprint.specials)||!Array.isArray(unlockedTechs))
    throw new RangeError('invalid tank blueprint');
  const chassis=partById(TANK_CHASSIS,blueprint.chassis,'chassis');
  const gun=partById(TANK_GUNS,blueprint.gun,'gun');
  const turret=partById(TANK_TURRETS,blueprint.turret,'turret');
  const engine=partById(TANK_ENGINES,blueprint.engine,'engine');
  const armor=partById(TANK_ARMORS,blueprint.armor,'armor');
  if(blueprint.specials.length>chassis.specialSlots)throw new RangeError('tank special slots exceeded');
  if(new Set(blueprint.specials).size!==blueprint.specials.length)
    throw new RangeError('duplicate tank special module');
  const specials=blueprint.specials.map(id=>partById(TANK_SPECIALS,id,'tank special'));
  const parts=[chassis,gun,turret,engine,armor,...specials];
  const unlocks=new Set(unlockedTechs);
  for(const part of parts)requireUnblocked(part.tech,unlocks);
  const mass=parts.reduce((total,part)=>total+part.mass,0);
  if(mass>chassis.ratedMass*1.3)throw new RangeError('chassis load limit exceeded');
  const complexity=gun.complexity+turret.complexity+engine.complexity+
    armor.complexity+specials.reduce((sum,p)=>sum+p.complexity,0);
  const overflow=Math.max(0,complexity-chassis.budget);
  const armorExtra=specials.reduce((sum,p)=>sum+p.armor,0);
  const breakthroughExtra=specials.reduce((sum,p)=>sum+p.breakthrough,0);
  const rangeExtra=specials.reduce((sum,p)=>sum+p.rangeBonus,0);
  const armorValue=(chassis.armor+armor.armor+armorExtra)*armor.slope;
  const icRaw=parts.reduce((sum,part)=>sum+part.ic,0);
  const reliabilityRaw=chassis.reliability+
    [gun,turret,engine,armor,...specials].reduce((sum,part)=>sum+part.reliability,0)-
    .04*overflow-.10*Math.max(0,mass/chassis.ratedMass-1);
  const powerWeight=engine.power/mass;
  return {
    catalogVersion:DESIGN_BALANCE_VERSION,
    massT:round2(mass),ratedMassT:chassis.ratedMass,powerKw:engine.power,
    powerWeight:round2(powerWeight),
    speedKmh:round2(between(chassis.speed*Math.sqrt(powerWeight/12),5,80)),
    fuelPer100Km:round2((.06*mass+.0015*engine.power)*engine.fuelFactor),
    operationalRangeKm:round2(400*(1+rangeExtra)/engine.fuelFactor),
    armor:round2(between(armorValue,0,250)),
    piercing:round2(gun.piercing),
    softAttack:round2(gun.soft*turret.attackFactor),
    hardAttack:round2(gun.hard*turret.attackFactor),
    breakthrough:round2(chassis.bt+turret.breakthrough+breakthroughExtra+.10*armorValue),
    reliability:Math.round(between(reliabilityRaw,.35,.98)*10000)/10000,
    ic:round2(icRaw*(1+.03*overflow)),
    complexity,overflow,materials:materialBill(parts),
  };
}
