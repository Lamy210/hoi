import { useState } from 'react';
import type { UiSnapshot, UiTechDef } from '../engine/ui';
import { engineClient } from './engineClient';

const CATEGORY_NAMES: Record<string, [string, string]> = {
  infantry: ['歩兵・銃器', 'Infantry & small arms'],
  artillery: ['火砲', 'Artillery'],
  drones: ['無人機・電子戦', 'Drones & EW'],
  doctrine: ['軍事ドクトリン', 'Doctrine'],
  industry: ['工業', 'Industry'],
  communication: ['通信・兵站', 'Communications'],
  medical: ['医療', 'Medicine'],
  agriculture: ['農業', 'Agriculture'],
};
const MOD_NAMES: Record<string, [string, string]> = {
  factoryOutput: ['工場生産', 'Factory output'],
  orgRegen: ['組織率回復', 'Organization recovery'],
  supplyRadius: ['補給範囲', 'Supply range'],
  researchRate: ['研究速度', 'Research rate'],
  living: ['生活水準', 'Living standards'],
  infantryAttack: ['陸軍攻撃', 'Land attack'],
  infantryDefense: ['陸軍防御', 'Land defense'],
  artilleryAttack: ['砲兵火力', 'Artillery attack'],
};
export function techDepth(tech: UiTechDef, techs: UiTechDef[], seen: Set<string> = new Set()): number {
  if (seen.has(tech.id)) return 0;
  const next = new Set(seen);
  next.add(tech.id);
  return tech.req.reduce((n, id) => {
    const prerequisite = techs.find(t => t.id === id);
    return Math.max(n, prerequisite ? 1 + techDepth(prerequisite, techs, next) : 0);
  }, 0);
}

export function ResearchTree({ snap, lang, pending }: { snap: UiSnapshot; lang: 'ja' | 'en'; pending: number }) {
  const ja = lang === 'ja';
  const player = snap.countries[snap.playerCountry];
  const [category, setCategory] = useState('all');
  const [filter, setFilter] = useState('');
  const currentYear = Number(snap.dateStr.slice(0, 4));
  const categories = [...new Set(snap.techs.map(t => t.cat))];
  const name = (tech: UiTechDef) => (ja ? tech.nameJa : tech.nameEn) || tech.id;
  const done = new Set(player.research.done);
  const progressOf = (id: string) => player.research.active.find(a => a.id === id);
  const penaltyOf = (t: UiTechDef) => t.year && t.year > currentYear ? Math.min(4, 1 + (t.year - currentYear) * 0.35) : 1;
  const visible = snap.techs.filter(t => (category === 'all' || t.cat === category) &&
    (name(t).toLowerCase().includes(filter.toLowerCase()) || t.id.includes(filter.toLowerCase()) || String(t.year || '').includes(filter)));
  const categoriesVisible = categories.filter(c => visible.some(t => t.cat === c));
  const canStart = (t: UiTechDef) => !done.has(t.id) && !progressOf(t.id) &&
    t.req.every(r => done.has(r)) && player.research.active.length < 2 && pending === 0;

  return <section className="research-screen" data-testid="research-tab">
    <div className="research-overview">
      <b>{ja ? '技術開発' : 'Technology development'} — {currentYear}</b>
      <span data-testid="research-done">{player.research.done.length} / {snap.techs.length} {ja ? '完了' : 'completed'}</span>
      <span>{ja ? '稼働中' : 'Active'}: {player.research.active.length} / 2</span>
    </div>
    <div className="research-active">
      {player.research.active.length === 0 && <span className="muted">{ja ? '稼働中の研究はありません' : 'No active research'}</span>}
      {player.research.active.map(a => {
        const t = snap.techs.find(x => x.id === a.id);
        return <div className="research-active-item" key={a.id}>
          <span>{t ? name(t) : a.id}</span><b>{Math.min(100, Math.round(a.progress / a.days * 100))}%</b>
          <progress max={a.days} value={a.progress} />
          {t && penaltyOf(t) > 1 && <small>{ja ? '年代先行' : 'Ahead of time'} ×{penaltyOf(t).toFixed(2)}</small>}
        </div>;
      })}
    </div>
    <div className="research-filters">
      <div role="group" aria-label={ja ? '研究分野' : 'Research category'} className="research-categories">
        <button data-testid="research-cat-all" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>{ja ? '全分野' : 'All'}</button>
        {categories.map(c => <button key={c} data-testid={'research-cat-' + c} aria-pressed={category === c} onClick={() => setCategory(c)}>{CATEGORY_NAMES[c]?.[ja ? 0 : 1] || c}</button>)}
      </div>
      <input aria-label={ja ? '技術検索' : 'Search technology'} placeholder={ja ? '技術名・ID・年' : 'Name, ID or year'} value={filter} onChange={e => setFilter(e.target.value)} data-testid="research-search" />
    </div>
    <p className="muted">{ja ? '左から右へ前提研究が進みます。早すぎる年代の技術は研究速度にペナルティを受け、予定年に近づくと軽減します。' : 'Prerequisites flow left to right. Future technology suffers a research-speed penalty that decreases over time.'}</p>
    {categoriesVisible.length === 0 && <p>{ja ? '該当する技術はありません' : 'No matching technologies'}</p>}
    {categoriesVisible.map(cat => {
      const subset = visible.filter(t => t.cat === cat);
      const maxDepth = Math.max(0, ...subset.map(t => techDepth(t, snap.techs)));
      return <div className="research-branch" key={cat} data-testid={'research-branch-' + cat}>
        <h4>{CATEGORY_NAMES[cat]?.[ja ? 0 : 1] || cat}</h4>
        <div className="research-timeline">
          {Array.from({ length: maxDepth + 1 }, (_, depth) =>
            <div className="research-tier" key={depth}>
              {subset.filter(t => techDepth(t, snap.techs) === depth).sort((a, b) => (a.year || 0) - (b.year || 0)).map(t => {
                const active = progressOf(t.id);
                const completed = done.has(t.id);
                const locked = t.req.some(r => !done.has(r));
                const penalty = penaltyOf(t);
                return <article key={t.id} className={'research-tech' + (completed ? ' complete' : active ? ' active' : locked ? ' locked' : '')} data-testid={'tech-' + t.id}>
                  <div className="research-tech-heading">
                    <b>{name(t)}</b><span>{t.year || '—'}</span>
                  </div>
                  <small className="research-prereqs">{t.req.length ? '↳ ' + t.req.map(r => name(snap.techs.find(x => x.id === r) || { id: r, cat: '', days: 1, req: [], mods: {} })).join(' / ') : (ja ? '基礎技術' : 'Root technology')}</small>
                  <div className="research-effects">
                    {Object.entries(t.mods).map(([k, v]) => <span key={k}>{MOD_NAMES[k]?.[ja ? 0 : 1] || k} {v >= 0 ? '+' : ''}{Math.round(v * 100)}%</span>)}
                  </div>
                  {penalty > 1 && <small className="research-penalty">{ja ? '年代先行' : 'Ahead of time'} ×{penalty.toFixed(2)}</small>}
                  {completed ? <strong className="research-complete">{ja ? '研究完了' : 'Completed'}</strong> :
                    active ? <progress max={t.days} value={active.progress} title={String(Math.round(active.progress / t.days * 100)) + '%'} /> :
                    <button data-testid={'research-' + t.id} disabled={!canStart(t)} onClick={() => engineClient.command('startResearch', { techId: t.id })}>{locked ? (ja ? '前提不足' : 'Locked') : player.research.active.length >= 2 ? (ja ? '研究枠満杯' : 'Slots full') : (ja ? '研究開始' : 'Research')}</button>}
                  <small>{ja ? '必要研究量' : 'Research cost'}: {t.days}{penalty > 1 ? ' (×' + penalty.toFixed(2) + ')' : ''}</small>
                </article>;
              })}
            </div>
          )}
        </div>
      </div>;
    })}
  </section>;
}
