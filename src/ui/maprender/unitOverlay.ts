import type { MapUnitMarker } from './types';

const SVG = 'http://www.w3.org/2000/svg';

/** CSS pixel coordinates; no dependency on canvas backing-store DPR. */
export function createUnitOverlay(container: HTMLElement, project: (province: number) => [number, number]) {
  const root = document.createElement('div');
  root.className = 'unit-overlay';
  const routes = document.createElementNS(SVG, 'svg');
  routes.classList.add('unit-routes');
  routes.setAttribute('aria-hidden', 'true');
  root.appendChild(routes);
  container.appendChild(root);
  const buttons = new Map<number, HTMLButtonElement>();
  let markers: MapUnitMarker[] = [], paths: number[][] = [];
  function refresh() {
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
  return { set, refresh, dispose: () => root.remove() };
}
