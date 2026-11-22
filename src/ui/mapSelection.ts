/** Screen-space division targeting. The map renderer remains read-only. */
export type SelectionMergeMode = 'replace'|'add'|'remove'|'toggle';
export type ScreenPoint = {x:number;y:number};
export type ScreenRect = {x1:number;y1:number;x2:number;y2:number};

/** All matching divisions in a province are selected together. */
export function divisionsInRectangle(
  units: readonly {id:number;loc:number}[],
  project: (province:number)=>ScreenPoint|null,
  rect:ScreenRect,
): number[] {
  const left=Math.min(rect.x1,rect.x2),right=Math.max(rect.x1,rect.x2);
  const top=Math.min(rect.y1,rect.y2),bottom=Math.max(rect.y1,rect.y2);
  if (![left,right,top,bottom].every(Number.isFinite)) return [];
  const cache=new Map<number,ScreenPoint|null>();
  const hits:number[]=[];
  for(const unit of units){
    if(!cache.has(unit.loc))cache.set(unit.loc,project(unit.loc));
    const p=cache.get(unit.loc);
    if(p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
      p.x>=left && p.x<=right && p.y>=top && p.y<=bottom) hits.push(unit.id);
  }
  return [...new Set(hits)].sort((a,b)=>a-b);
}

/** null means the operation exceeded the existing 256-division command cap. */
export function mergeDivisionSelection(
  current:readonly number[],incoming:readonly number[],
  owned:readonly number[],mode:SelectionMergeMode,limit=256,
):number[]|null{
  const allowed=new Set(owned);
  const existing=new Set(current.filter(id=>allowed.has(id)));
  const candidates=new Set(incoming.filter(id=>allowed.has(id)));
  let next:Set<number>;
  if(mode==='replace')next=candidates;
  else if(mode==='add')next=new Set([...existing,...candidates]);
  else if(mode==='remove')next=new Set([...existing].filter(id=>!candidates.has(id)));
  else {
    next=new Set(existing);
    for(const id of candidates){if(next.has(id))next.delete(id);else next.add(id);}
  }
  return next.size>limit?null:[...next].sort((a,b)=>a-b);
}
