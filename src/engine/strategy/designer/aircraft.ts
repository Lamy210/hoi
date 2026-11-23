/** Aircraft equipment preview. Nominal range and round-trip mission radius differ. */
import {
  DESIGN_BALANCE_VERSION,AIR_FRAMES,AIR_ENGINES,AIR_WEAPONS,AIR_SPECIALS,
  partById,requireUnblocked,materialBill,round2,between,
  type AirFrameId,type AirEngineId,type AirWeaponId,type AirSpecialId,
} from './catalog';

export interface AircraftBlueprint {
  readonly frame:AirFrameId;
  readonly engine:AirEngineId;
  readonly engineCount:number;
  readonly weapons:readonly AirWeaponId[];
  readonly specials:readonly AirSpecialId[];
}
export interface AircraftPreview {
  readonly catalogVersion:typeof DESIGN_BALANCE_VERSION;
  readonly massT:number;
  readonly maxTakeoffMassT:number;
  readonly weaponMassT:number;
  readonly engineCount:number;
  readonly thrust:number;
  readonly thrustRatio:number;
  readonly drag:number;
  readonly speedKmh:number;
  readonly agility:number;
  readonly rangeKm:number;
  readonly missionRadiusKm:number;
  readonly airAttack:number;
  readonly airDefense:number;
  readonly groundAttack:number;
  readonly strategicBomb:number;
  readonly navalAttack:number;
  readonly detectionBonus:number;
  readonly reliability:number;
  readonly ic:number;
  readonly complexity:number;
  readonly overflow:number;
  readonly materials:Readonly<Record<string,number>>;
  readonly missions:readonly ('air-superiority'|'interception'|'close-air-support'|'strategic-bombing'|'naval-strike')[];
}

export function previewAircraft(blueprint:AircraftBlueprint,unlockedTechs:readonly string[]):AircraftPreview {
  if(!blueprint||!Array.isArray(blueprint.weapons)||!Array.isArray(blueprint.specials)||
    !Array.isArray(unlockedTechs))throw new RangeError('invalid aircraft blueprint');
  const frame=partById(AIR_FRAMES,blueprint.frame,'airframe');
  const engine=partById(AIR_ENGINES,blueprint.engine,'engine');
  if(!Number.isSafeInteger(blueprint.engineCount)||blueprint.engineCount<frame.minEngines||
    blueprint.engineCount>frame.maxEngines)throw new RangeError('invalid engine count');
  if(blueprint.weapons.length<1||blueprint.weapons.length>frame.weaponSlots)
    throw new RangeError('invalid weapon slot count');
  if(blueprint.specials.length>frame.specialSlots)
    throw new RangeError('aircraft special slots exceeded');
  if(new Set(blueprint.specials).size!==blueprint.specials.length)
    throw new RangeError('duplicate aircraft special');
  const weapons=blueprint.weapons.map(id=>partById(AIR_WEAPONS,id,'air weapon'));
  const specials=blueprint.specials.map(id=>partById(AIR_SPECIALS,id,'air special'));
  const engines=Array.from({length:blueprint.engineCount},()=>engine);
  const parts=[frame,...engines,...weapons,...specials];
  const techs=new Set(unlockedTechs);
  for(const part of parts)requireUnblocked(part.tech,techs);
  const mass=parts.reduce((sum,p)=>sum+p.mass,0);
  const payload=weapons.reduce((sum,p)=>sum+p.mass,0);
  if(mass>frame.maxMass)throw new RangeError('airframe takeoff mass exceeded');
  if(payload>frame.payload)throw new RangeError('weapon payload exceeded');
  const thrust=engine.thrust*blueprint.engineCount, ratio=thrust/(12*mass);
  if(ratio<1)throw new RangeError('insufficient takeoff thrust');
  const complexity=engine.complexity*blueprint.engineCount+
    weapons.reduce((sum,w)=>sum+w.complexity,0)+
    specials.reduce((sum,s)=>sum+s.complexity,0);
  const overflow=Math.max(0,complexity-frame.budget);
  const drag=1+weapons.reduce((sum,w)=>sum+w.drag,0)+specials.reduce((sum,s)=>sum+s.drag,0);
  const agilityDeltas=weapons.reduce((sum,w)=>sum+w.agility,0)+specials.reduce((sum,s)=>sum+s.agility,0);
  const rangeBonus=specials.reduce((sum,s)=>sum+s.rangeBonus,0);
  const speedFactor=specials.reduce((factor,s)=>factor*s.speedFactor,1);
  const ic=parts.reduce((sum,p)=>sum+p.ic,0)*(1+.03*overflow);
  const reliability=frame.reliability+engines.reduce((sum,p)=>sum+p.reliability,0)+
    weapons.reduce((sum,w)=>sum+w.reliability,0)+
    specials.reduce((sum,s)=>sum+s.reliability,0)-
    .035*overflow-.07*Math.max(0,1.10-ratio);
  const airAttack=weapons.reduce((sum,w)=>sum+w.airAttack,0);
  const groundAttack=weapons.reduce((sum,w)=>sum+w.ground,0);
  const strategicBomb=weapons.reduce((sum,w)=>sum+w.strategic,0);
  const navalAttack=weapons.reduce((sum,w)=>sum+w.naval,0);
  const rangeKm=between(frame.range*(1+rangeBonus)/(1+.1*(drag-1)),100,10000);
  const missions:AircraftPreview['missions']=[];
  if(airAttack>0)missions.push('air-superiority','interception');
  if(groundAttack>0)missions.push('close-air-support');
  if(strategicBomb>0)missions.push('strategic-bombing');
  if(navalAttack>0)missions.push('naval-strike');
  return {
    catalogVersion:DESIGN_BALANCE_VERSION,
    massT:round2(mass),maxTakeoffMassT:frame.maxMass,weaponMassT:round2(payload),
    engineCount:blueprint.engineCount,thrust,thrustRatio:round2(ratio),drag:round2(drag),
    speedKmh:round2(between(frame.speed*Math.sqrt(ratio/drag)*speedFactor,100,1200)),
    agility:round2(between((frame.agility+agilityDeltas)*Math.min(1.25,ratio)/
      (1+.1*payload/frame.payload),5,150)),
    rangeKm:round2(rangeKm),
    missionRadiusKm:round2(rangeKm*.45),
    airAttack,airDefense:frame.defense+specials.reduce((sum,s)=>sum+s.defense,0),
    groundAttack,strategicBomb,navalAttack,
    detectionBonus:round2(specials.reduce((sum,s)=>sum+s.detection,0)),
    reliability:Math.round(between(reliability,.35,.98)*10000)/10000,
    ic:round2(ic),complexity,overflow,materials:materialBill(parts),missions,
  };
}
