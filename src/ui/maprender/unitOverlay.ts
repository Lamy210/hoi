import type { MapFrontOverlay, MapUnitMarker } from './types';

const SVG = 'http://www.w3.org/2000/svg';

/** CSS pixel coordinates; no dependency on canvas backing-store DPR. */
export function createUnitOverlay(container: HTMLElement, project: (province: number) => [number, number]) {
  const root = document.createElement('div');
  root.className = 'unit-overlay';
  const routes = document.createElementNS(SVG, 'svg');
  routes.classList.add('unit-routes');
  routes.setAttribute('aria-hidden', 'true');
  const plans = document.createElementNS(SVG, 'svg');
  plans.classList.add('front-plans');
  plans.setAttribute('aria-hidden','true');
  root.appendChild(plans);
  root.appendChild(routes);
  container.appendChild(root);
  const buttons = new Map<number, HTMLButtonElement>();
  let markers: MapUnitMarker[] = [], paths: number[][] = [];
  let fronts: MapFrontOverlay[] = [];
  function refreshFronts() {
    plans.replaceChildren();
    const point=(p:number)=>project(p);
    const valid=(p:number[])=>p.every(Number.isFinite);
    const el=(name:string,attrs:Record<string,string|number>)=>{
      const node=document.createElementNS(SVG,name);
      for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));
      return node;
    };
    for(const f of fronts){
      const group=el('g',{'data-testid':f.id<0?'map-front-draft':'map-front-'+f.id,'data-state':f.paused?'paused':'active','data-highlighted':String(f.highlighted),class:'front-plan '+(f.paused?'paused ': '')+(f.highlighted?'highlighted ':'')+(f.planned?'prewar ':'')+f.stance});
      for(const p of f.provinces){
        const xy=point(p);if(!valid(xy))continue;
        group.appendChild(el('circle',{cx:xy[0],cy:xy[1],r:15,class:'front-province'}));
      }
      // Short perpendicular marker at the midpoint of each adjacency; not a geographic boundary.
      for(const {from,to} of f.links){
        const a=point(from),b=point(to);if(!valid(a)||!valid(b))continue;
        const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy);if(d<1)continue;
        const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,n=Math.min(14,d*.25);
        group.appendChild(el('line',{x1:x-dy/d*n,y1:y+dx/d*n,x2:x+dy/d*n,y2:y-dx/d*n,class:'front-link'}));
      }
      for(const p of f.targets){
        const [x,y]=point(p);if(!valid([x,y]))continue;
        group.appendChild(el('path',{d:`M${x} ${y-12} L${x+12} ${y} L${x} ${y+12} L${x-12} ${y} Z`,class:'front-target','data-target':p}));
      }
      for(const {from,to} of f.arrows){
        const a=point(from),b=point(to);if(!valid(a)||!valid(b))continue;
        const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy);if(d<18)continue;
        const ux=dx/d,uy=dy/d,x=b[0]-ux*12,y=b[1]-uy*12;
        group.appendChild(el('line',{x1:a[0]+ux*12,y1:a[1]+uy*12,x2:x,y2:y,class:'front-arrow'}));
        group.appendChild(el('path',{d:`M${x} ${y} L${x-ux*10-uy*5} ${y-uy*10+ux*5} L${x-ux*10+uy*5} ${y-uy*10-ux*5} Z`,class:'front-arrowhead'}));
      }
      const first=f.provinces[0];if(first!==undefined){
        const [x,y]=point(first);
        if(valid([x,y])){const label=el('text',{x:x+18,y:y-18,class:'front-label'});label.textContent=f.id<0?'DRAFT':'#'+f.id+(f.paused?' II':'');group.appendChild(label);}
      }
      plans.appendChild(group);
    }
  }
  function refresh() {
    refreshFronts();
    for (const m of markers) {
      const btn = buttons.get(m.province)!;
      const [x, y] = project(m.province);
      btn.style.left = x + 'px';
      btn.style.top = y + 'px';
      btn.hidden = !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 ||
        x > container.clientWidth || y > container.clientHeight;
    }
    routes.replaceChildren();
    for (const path of paths) {
      if (path.length < 2) continue;
      const points = path.map(p => project(p));
      if (points.some(([x,y]) => !Number.isFinite(x) || !Number.isFinite(y))) continue;
      const line = document.createElementNS(SVG, 'polyline');
      line.setAttribute('points', points.map(p => p.join(',')).join(' '));
      line.setAttribute('class', 'unit-route');
      routes.appendChild(line);
      const [x,y] = points[points.length - 1];
      const end = document.createElementNS(SVG, 'circle');
      end.setAttribute('cx', String(x)); end.setAttribute('cy', String(y)); end.setAttribute('r', '5');
      end.setAttribute('class', 'unit-route-end');
      routes.appendChild(end);
    }
  }
  function set(next: MapUnitMarker[], nextPaths: number[][]) {
    markers = next; paths = nextPaths;
    const keep = new Set(next.map(m => m.province));
    for (const [p, button] of buttons) if (!keep.has(p)) { button.remove(); buttons.delete(p); }
    for (const m of next) {
      let button = buttons.get(m.province);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.unitProvince = String(m.province);
        button.dataset.testid = 'unit-marker-' + m.provinceId;
        root.appendChild(button);
        buttons.set(m.province, button);
      }
      button.className = 'unit-marker' + (m.selected ? ' selected' : '') + (m.hostileCount && !m.count ? ' hostile' : '') + (m.battle ? ' battling' : '');
      button.textContent = (m.battle ? '⚔ ' : m.moving ? '➜ ' : '▣ ') + (m.count ? String(m.count) : '') + (m.hostileCount ? (m.count ? ' / ' : '') + '敵/E' + m.hostileCount : '');
      button.dataset.hostileCount = String(m.hostileCount);
      button.dataset.battle = String(m.battle);
      button.title = m.label;
      button.setAttribute('aria-label', m.label);
      button.setAttribute('aria-pressed', String(m.selected));
    }
    refresh();
  }
  return { set, setFronts: (next:MapFrontOverlay[])=>{fronts=next;refreshFronts();}, refresh, dispose: () => root.remove() };
}
