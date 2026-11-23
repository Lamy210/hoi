import {mergeDivisionSelection,type ScreenPoint,type ScreenRect,type SelectionMergeMode} from './mapSelection';

/** Front-draft selection is a UI-only view. Only owner-controlled provinces may enter the draft. */
export function provincesInRectangle(
  controller:readonly number[],owner:number,
  project:(province:number)=>ScreenPoint|null,
  rect:ScreenRect,
):number[]{
  const minX=Math.min(rect.x1,rect.x2),maxX=Math.max(rect.x1,rect.x2);
  const minY=Math.min(rect.y1,rect.y2),maxY=Math.max(rect.y1,rect.y2);
  if(![minX,maxX,minY,maxY].every(Number.isFinite))return [];
  const result:number[]=[];
  for(let province=0;province<controller.length;province++){
    if(controller[province]!==owner)continue;
    const p=project(province);
    if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=minX&&p.x<=maxX&&p.y>=minY&&p.y<=maxY)
      result.push(province);
  }
  return result;
}

export function updateFrontDraftProvinces(
  current:readonly number[],next:readonly number[],
  controller:readonly number[],owner:number,mode:SelectionMergeMode,
  max=256,
):number[]|null {
  const owned=controller.flatMap((c,p)=>c===owner?[p]:[]);
  return mergeDivisionSelection(current,next,owned,mode,max);
}

/** Check at dispatch time; controller or diplomatic relations may change during editing. */
export function canCommitFrontDraft(
  provinces:readonly number[],enemy:number,owner:number,
  controller:readonly number[],enemies:readonly number[],busy:boolean,
):boolean{
  return !busy&&enemies.includes(enemy)&&provinces.length>0&&provinces.length<=256&&
    new Set(provinces).size===provinces.length&&provinces.every(p=>Number.isInteger(p)&&p>=0&&p<controller.length&&controller[p]===owner);
}
