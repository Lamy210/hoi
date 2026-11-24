import type {MapPortMarker} from './types';

/** Shared, projection-aware DOM markers for Canvas2D and MapLibre.
 * Anchored to the port's validated coastal province, not an invented sea
 * coordinate. Viewport pixels are CSS pixels, independent of backing DPR.
 */
export function createPortOverlay(
  container:HTMLElement,
  project:(province:number)=>[number,number],
){
  const root=document.createElement('div');
  root.className='port-overlay';
  root.dataset.testid='port-overlay';
  root.setAttribute('aria-label','Port markers');
  container.appendChild(root);
  const buttons=new Map<string,HTMLButtonElement>();
  let markers:MapPortMarker[]=[];
  let onSelect:(province:number)=>void=()=>{};

  function refresh(){
    for(const p of markers){
      const el=buttons.get(p.id);
      if(!el)continue;
      const [x,y]=project(p.province);
      el.style.left=x+'px';
      el.style.top=y+'px';
      el.hidden=!Number.isFinite(x)||!Number.isFinite(y)||
        x<0||y<0||x>container.clientWidth||y>container.clientHeight;
    }
  }
  function set(next:MapPortMarker[],select:(province:number)=>void){
    markers=next;
    onSelect=select;
    const keep=new Set(next.map(x=>x.id));
    for(const [id,el] of buttons)if(!keep.has(id)){
      el.remove();buttons.delete(id);
    }
    for(const p of next){
      let el=buttons.get(p.id);
      if(!el){
        el=document.createElement('button');
        el.type='button';
        el.dataset.portId=p.id;
        el.dataset.testid='port-marker-'+p.id;
        el.className='port-marker';
        // Keep the actual button stable across zoom, selection and controller updates.
        el.addEventListener('click',e=>{
          e.stopPropagation();
          const current=markers.find(m=>m.id===p.id);
          if(current)onSelect(current.province);
        });
        root.appendChild(el);
        buttons.set(p.id,el);
      }
      el.className='port-marker'+(p.selected?' selected':'')+
        (p.controlledByPlayer?' friendly':'');
      el.textContent='⚓';
      el.title=p.label+' · '+p.capacity;
      el.setAttribute('aria-label',p.label);
      el.setAttribute('aria-pressed',String(p.selected));
      el.dataset.capacity=String(p.capacity);
      el.dataset.province=String(p.province);
    }
    refresh();
  }
  return {set,refresh,dispose:()=>root.remove()};
}
