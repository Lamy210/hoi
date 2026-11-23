/** Atomic commands for the independent strategy reference State.
 * UI/AI must not trust client-side previews: country techs and ownership
 * are rechecked against the authoritative state at command application.
 */
import {civilFromDays} from '../../clock/date';
import {assertStrategyState,type StrategyState} from '../model';
import {previewTank,type TankBlueprint} from './tank';
import {previewAircraft,type AircraftBlueprint} from './aircraft';
import {DESIGN_BALANCE_VERSION} from './catalog';
import {modelIdFor,productionDesign,type EquipmentRevision} from './frozen';

export type CreateEquipmentDesign =
  | {readonly actorCountry:number;readonly familyId:string;readonly kind:'tank';readonly blueprint:TankBlueprint}
  | {readonly actorCountry:number;readonly familyId:string;readonly kind:'aircraft';readonly blueprint:AircraftBlueprint};

function canonicalBlueprint(cmd:CreateEquipmentDesign):EquipmentRevision['blueprint']{
  // Clone before sorting so client edits cannot alter an already committed model.
  if(cmd.kind==='tank'){
    const b=structuredClone(cmd.blueprint);
    if(!b||!Array.isArray(b.specials))throw new RangeError('invalid tank blueprint');
    return {...b,specials:[...b.specials].sort()};
  }
  const b=structuredClone(cmd.blueprint);
  if(!b||!Array.isArray(b.weapons)||!Array.isArray(b.specials))
    throw new RangeError('invalid aircraft blueprint');
  return {...b,weapons:[...b.weapons].sort(),specials:[...b.specials].sort()};
}

export function createEquipmentDesign(
  initial:StrategyState,command:CreateEquipmentDesign,
):{next:StrategyState;modelId:string;revision:number}{
  assertStrategyState(initial);
  const nation=initial.nations.find(n=>n.id===command.actorCountry);
  if(!nation)throw new RangeError('design country does not exist');
  // modelIdFor validates family syntax and excludes ambiguous separators.
  modelIdFor(command.actorCountry,command.kind,command.familyId,1);
  const previous=(initial.designRevisions??[]).filter(r=>
    r.country===nation.id&&r.kind===command.kind&&r.familyId===command.familyId);
  const revision=previous.length+1;
  const modelId=modelIdFor(nation.id,command.kind,command.familyId,revision);
  if(initial.designs.some(d=>d.id===modelId))throw new RangeError('equipment model id already taken');
  const blueprint=canonicalBlueprint(command);
  const techSnapshot=[...new Set(nation.techDone)].sort();
  const year=civilFromDays(initial.epochDays+initial.tick).y;
  const shared={modelId,familyId:command.familyId,revision,country:nation.id,
    year,createdTick:initial.tick,catalogVersion:DESIGN_BALANCE_VERSION,techSnapshot} as const;
  let record:EquipmentRevision;
  if(command.kind==='tank'){
    record={...shared,kind:'tank',blueprint:blueprint as TankBlueprint,
      frozenPreview:previewTank(blueprint as TankBlueprint,techSnapshot)};
  }else{
    record={...shared,kind:'aircraft',blueprint:blueprint as AircraftBlueprint,
      frozenPreview:previewAircraft(blueprint as AircraftBlueprint,techSnapshot)};
  }
  const next:StrategyState=structuredClone(initial);
  next.designRevisions??=[];
  next.designRevisions.push(record);
  next.designs.push(productionDesign(record));
  assertStrategyState(next);
  return {next,modelId,revision};
}

export function switchEquipmentProduction(
  initial:StrategyState,actorCountry:number,lineId:number,modelId:string,
):StrategyState{
  assertStrategyState(initial);
  const line=initial.lines.find(l=>l.id===lineId);
  const factory=initial.factories.find(f=>f.id===line?.factoryId);
  const design=initial.designs.find(d=>d.id===modelId);
  const nation=initial.nations.find(n=>n.id===actorCountry);
  if(!Number.isSafeInteger(lineId)||!line||!factory||!nation||
    line.country!==actorCountry||factory.country!==actorCountry||factory.kind!=='military')
    throw new RangeError('unauthorized military line');
  if(!design||design.ownerCountry!==undefined&&design.ownerCountry!==actorCountry||
    design.unlockTech&&!nation.techDone.includes(design.unlockTech))
    throw new RangeError('unavailable equipment design');
  if(line.modelId===modelId)return structuredClone(initial);
  const next=structuredClone(initial);
  const target=next.lines.find(l=>l.id===lineId)!;
  const previous=next.designs.find(d=>d.id===target.modelId)!;
  const backlog={...(target.carryByModel??{})};
  if(target.carryIC>0)backlog[target.modelId]=target.carryIC;
  target.carryIC=backlog[modelId]??0;
  delete backlog[modelId];
  target.carryByModel=Object.keys(backlog).length?backlog:undefined;
  // No free production bonus on changing equipment family.
  target.efficiency=previous.category===design.category
    ?Math.max(.1,Math.min(.5,target.efficiency*.5))
    :.1;
  target.modelId=modelId;
  assertStrategyState(next);
  return next;
}
