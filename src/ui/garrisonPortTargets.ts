// Read-only UI helpers: catalog ports are the only eligible port targets.
// Port presence never changes the existing garrison command or save format.
import {MAX_GARRISON_TARGETS} from '../engine/military/garrisons';

const validProvince=(p:number):boolean=>Number.isSafeInteger(p)&&p>=0;

/** Only catalogued, currently controlled ports can be selected as guard targets. */
export function controlledPortTargets(
  portProvinces:readonly number[]|undefined,
  controllers:readonly number[],
  country:number,
):number[]{
  if(!Number.isSafeInteger(country)||country<0||!portProvinces)return [];
  return [...new Set(portProvinces.filter(p=>validProvince(p)&&p<controllers.length&&controllers[p]===country))]
    .sort((a,b)=>a-b);
}

/** Null rejects the whole edit: silently truncating a defensive draft is unsafe. */
export function appendGarrisonPortTargets(
  existing:readonly number[],ports:readonly number[],max=MAX_GARRISON_TARGETS,
):number[]|null{
  if(!Number.isSafeInteger(max)||max<1||[...existing,...ports].some(p=>!validProvince(p)))return null;
  const targets=[...new Set([...existing,...ports])].sort((a,b)=>a-b);
  return targets.length<=max?targets:null;
}
