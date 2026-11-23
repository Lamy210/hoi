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

/** Check at dispatch time; province controller and enemy viability may change during editing. */
export function canCommitFrontDraft(
  provinces:readonly number[],enemy:number,owner:number,
  controller:readonly number[],enemies:readonly number[],busy:boolean,
):boolean{
  return !busy&&enemies.includes(enemy)&&provinces.length>0&&provinces.length<=256&&
    new Set(provinces).size===provinces.length&&provinces.every(p=>Number.isInteger(p)&&p>=0&&p<controller.length&&controller[p]===owner);
}

/** Pick enemy-controlled province anchors near a mouse/touch drawn stroke.
 * A stroke is an intent line, not a geographic border or troop movement path.
 */
export function provincesAlongStroke(
  controller:readonly number[], enemy:number,
  project:(province:number)=>ScreenPoint|null,
  points:readonly ScreenPoint[],radius=22,
):number[]{
  if(points.length<2||!Number.isFinite(radius)||radius<0)return [];
  const segments:[ScreenPoint,ScreenPoint][]=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if([a.x,a.y,b.x,b.y].every(Number.isFinite))segments.push([a,b]);
  }
  if(!segments.length)return [];
  const threshold=radius*radius,result:number[]=[];
  for(let p=0;p<controller.length;p++){
    if(controller[p]!==enemy)continue;
    const anchor=project(p);if(!anchor||![anchor.x,anchor.y].every(Number.isFinite))continue;
    if(segments.some(([a,b])=>{
      const dx=b.x-a.x,dy=b.y-a.y,lenSq=dx*dx+dy*dy;
      const t=lenSq===0?0:Math.max(0,Math.min(1,((anchor.x-a.x)*dx+(anchor.y-a.y)*dy)/lenSq));
      const x=a.x+t*dx,y=a.y+t*dy;
      return (anchor.x-x)**2+(anchor.y-y)**2<=threshold;
    }))result.push(p);
  }
  return result;
}

/** Read-only comparison. Existing AI, targets and assigned divisions remain unchanged. */
export function frontProvinceChangeSummary(before:readonly number[],after:readonly number[]){
  const original=new Set(before),next=new Set(after);
  return {added:after.filter(p=>!original.has(p)).length,
    removed:before.filter(p=>!next.has(p)).length,
    changed:before.length!==after.length||before.some(p=>!next.has(p))};
}

/** Edit is submitted only if the exact existing front generation is still current. */
export function canCommitFrontEdit(
  before:readonly number[],after:readonly number[],expectedRevision:number,
  currentRevision:number|undefined,enemy:number,owner:number,
  controller:readonly number[],enemies:readonly number[],busy:boolean,
):boolean{
  return Number.isSafeInteger(expectedRevision)&&expectedRevision>=1&&
    expectedRevision===currentRevision&&frontProvinceChangeSummary(before,after).changed&&
    canCommitFrontDraft(after,enemy,owner,controller,enemies,busy);
}
