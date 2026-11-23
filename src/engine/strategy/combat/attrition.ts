/** A reproducible *expected* non-combat loss model; caller owns inventory journal.
 * This function never mutates state. Do not apply the same eventId twice.
 */
import {deriveStream} from '../../core/rng';
import {between} from '../designer/catalog';

export type Weather='clear'|'rain'|'snow'|'adverse'|'storm';
export type Terrain='normal'|'mud'|'mountains'|'desert';
export type Maintenance='peacetime'|'normal'|'supply-shortage'|'encircled';

export interface AttritionOperation {
  readonly kind:'tank'|'aircraft';
  readonly activeUnits:number;
  readonly reliability:number;
  readonly weather:Weather;
  readonly terrain:Terrain;
  readonly distanceKm:number;
  readonly missionRadiusKm?:number;
  readonly maintenance:Maintenance;
  readonly worldSeed:number;
  readonly tick:number;
  readonly subphase:number;
  readonly entityId:number;
}
export interface AttritionPreview {
  readonly eventId:string;
  readonly probability:number;
  readonly expectedLoss:number;
  readonly destroyed:number;
  readonly survivors:number;
}
const WEATHER:Record<Weather,number>={clear:1,rain:1.4,snow:1.7,adverse:1.8,storm:2.3};
const TERRAIN:Record<Terrain,number>={normal:1,mud:2,mountains:1.6,desert:1.5};
const MAINTENANCE:Record<Maintenance,number>={peacetime:.8,normal:1,'supply-shortage':1.5,encircled:2};

export function attritionChance(op:AttritionOperation):number {
  if(!op||!Number.isSafeInteger(op.activeUnits)||op.activeUnits<0||
    !Number.isFinite(op.reliability)||op.reliability<0||op.reliability>1||
    !Number.isFinite(op.distanceKm)||op.distanceKm<0)throw new RangeError('invalid attrition input');
  const weather=WEATHER[op.weather],terrain=TERRAIN[op.terrain],maintenance=MAINTENANCE[op.maintenance];
  if(weather===undefined||terrain===undefined||maintenance===undefined)
    throw new RangeError('unknown attrition environment');
  let distanceFactor:number;
  if(op.kind==='tank'){
    distanceFactor=Math.min(2,1+.4*Math.max(0,op.distanceKm/100-1));
  }else if(op.kind==='aircraft'){
    if(!Number.isFinite(op.missionRadiusKm)||!op.missionRadiusKm||op.missionRadiusKm<=0)
      throw new RangeError('invalid mission radius');
    if(op.distanceKm>op.missionRadiusKm)throw new RangeError('outside sortie radius');
    if(op.terrain!=='normal')throw new RangeError('aircraft cannot use ground terrain');
    distanceFactor=Math.min(1.2,1+.5*Math.max(0,op.distanceKm/op.missionRadiusKm-.6));
  }else throw new RangeError('unknown attrition kind');
  return between((op.kind==='tank'?.0004:.0006)*
    Math.pow((1-op.reliability)/.1,1.5)*weather*
    (op.kind==='tank'?terrain:1)*distanceFactor*maintenance,0,.05);
}
export function previewNonCombatAttrition(op:AttritionOperation):AttritionPreview {
  if(!Number.isSafeInteger(op.worldSeed)||!Number.isSafeInteger(op.tick)||op.tick<0||
    !Number.isSafeInteger(op.subphase)||op.subphase<0||op.subphase>3||
    !Number.isSafeInteger(op.entityId)||op.entityId<0)
    throw new RangeError('invalid attrition event coordinates');
  const probability=attritionChance(op);
  const expectedLoss=op.activeUnits*probability;
  if(!Number.isFinite(expectedLoss)||!Number.isSafeInteger(Math.floor(expectedLoss)))
    throw new RangeError('invalid expected loss');
  const eventId=['noncombat',op.kind,op.tick,op.subphase,op.entityId].join(':');
  const rng=deriveStream(op.worldSeed,'strategy-noncombat-attrition',eventId);
  const whole=Math.floor(expectedLoss),frac=expectedLoss-whole;
  const destroyed=Math.min(op.activeUnits,whole+(rng.nextFloat()<frac?1:0));
  return {eventId,probability,expectedLoss,destroyed,survivors:op.activeUnits-destroyed};
}
