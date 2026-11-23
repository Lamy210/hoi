/** Frozen equipment revisions bridge designer previews and the canonical strategy Design.
 * The source blueprint is immutable by convention; State validation re-derives
 * the preview and combat/production stats before accepting a save or tick.
 */
import {previewTank,type TankBlueprint,type TankPreview} from './tank';
import {previewAircraft,type AircraftBlueprint,type AircraftPreview} from './aircraft';
import {DESIGN_BALANCE_VERSION} from './catalog';
import type {Design,StrategyState} from '../model';

interface RevisionBase {
  readonly modelId:string;
  readonly familyId:string;
  readonly revision:number;
  readonly country:number;
  readonly year:number;
  readonly createdTick:number;
  readonly catalogVersion:typeof DESIGN_BALANCE_VERSION;
  readonly techSnapshot:readonly string[];
}
export type EquipmentRevision =
  | (RevisionBase & {readonly kind:'tank';readonly blueprint:TankBlueprint;readonly frozenPreview:TankPreview})
  | (RevisionBase & {readonly kind:'aircraft';readonly blueprint:AircraftBlueprint;readonly frozenPreview:AircraftPreview});

export function modelIdFor(country:number,kind:EquipmentRevision['kind'],familyId:string,revision:number):string {
  if(!Number.isSafeInteger(country)||country<0||!Number.isSafeInteger(revision)||revision<1||
    !/^[a-z][a-z0-9-]{0,39}$/.test(familyId))throw new RangeError('invalid equipment family/id');
  return `custom.${country}.${kind}.${familyId}.r${revision}`;
}

/** Only the canonical production/combat fields are cached in Design. The full
 * aircraft/tank stats stay in the frozen revision for later operations.
 */
export function productionDesign(rev:EquipmentRevision):Design {
  const common={
    id:rev.modelId,
    category:rev.kind,
    year:rev.year,
    ownerCountry:rev.country,
  } as const;
  if(rev.kind==='tank'){
    const p=rev.frozenPreview;
    return {...common,softAttack:p.softAttack,hardAttack:p.hardAttack,
      defense:Math.round(p.breakthrough*.75*100)/100,breakthrough:p.breakthrough,
      armor:p.armor,piercing:p.piercing,reliability:p.reliability,
      ic:p.ic,materials:{...p.materials}};
  }
  const p=rev.frozenPreview;
  return {...common,softAttack:0,hardAttack:0,defense:p.airDefense,
    breakthrough:0,armor:0,piercing:0,reliability:p.reliability,
    ic:p.ic,materials:{...p.materials}};
}
function identical(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(typeof a!==typeof b||a===null||b===null||typeof a!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b)){
    if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
    return a.every((v,i)=>identical(v,b[i]));
  }
  const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>;
  const ka=Object.keys(aa).sort(),kb=Object.keys(bb).sort();
  return ka.length===kb.length&&ka.every((k,i)=>k===kb[i]&&identical(aa[k],bb[k]));
}
function validateRevision(rev:EquipmentRevision,design:Design,world:StrategyState):void {
  if(!rev||rev.modelId!==modelIdFor(rev.country,rev.kind,rev.familyId,rev.revision)||
    rev.catalogVersion!==DESIGN_BALANCE_VERSION||
    !Number.isSafeInteger(rev.createdTick)||rev.createdTick<0||rev.createdTick>world.tick||
    !Number.isSafeInteger(rev.year)||rev.year<1||rev.year>9999||
    !world.nations.some(n=>n.id===rev.country))throw new RangeError('invalid revision metadata');
  if(!Array.isArray(rev.techSnapshot)||new Set(rev.techSnapshot).size!==rev.techSnapshot.length||
    rev.techSnapshot.some(t=>typeof t!=='string'||!t))throw new RangeError('invalid revision tech snapshot');
  const nation=world.nations.find(n=>n.id===rev.country)!;
  if(rev.techSnapshot.some(t=>!nation.techDone.includes(t)))throw new RangeError('revoked design technology');
  const preview=rev.kind==='tank'
    ?previewTank(rev.blueprint,rev.techSnapshot)
    :rev.kind==='aircraft'
      ?previewAircraft(rev.blueprint,rev.techSnapshot)
      :null;
  if(!preview||!identical(preview,rev.frozenPreview))
    throw new RangeError('frozen design does not match parts');
  if(!identical(productionDesign(rev),design))
    throw new RangeError('production model does not match immutable revision');
}
export function validateRevisionRegistry(world:StrategyState):void {
  const revisions=world.designRevisions??[];
  if(!Array.isArray(revisions))throw new RangeError('invalid design revision registry');
  const models=new Map(world.designs.map(x=>[x.id,x]));
  const families=new Map<string,number[]>();
  for(const rev of revisions){
    const existing=models.get(rev.modelId);
    if(!existing)throw new RangeError('missing revision production model');
    validateRevision(rev,existing,world);
    const key=rev.country+'\x1f'+rev.kind+'\x1f'+rev.familyId;
    const versions=families.get(key)??[];
    versions.push(rev.revision);families.set(key,versions);
  }
  for(const versions of families.values()){
    versions.sort((a,b)=>a-b);
    if(versions.some((v,i)=>v!==i+1))throw new RangeError('noncontiguous revision chain');
  }
  const referenced=new Set(revisions.map(r=>r.modelId));
  if(referenced.size!==revisions.length)throw new RangeError('duplicate equipment model revision');
  for(const design of world.designs){
    if(design.ownerCountry!==undefined&&!referenced.has(design.id))
      throw new RangeError('owned design without frozen revision');
  }
}
