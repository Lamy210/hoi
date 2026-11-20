import { useEffect, useState } from 'react';
import { BUILTIN_BATTALIONS, MAX_BATTALIONS, type TemplatePreview } from '../engine/military/templateStats';
import { engineClient } from './engineClient';
import { t } from './i18n';

type Lang = 'ja' | 'en';
const initial = () => Array<string>(10).fill('infantry-v1');

export function DivisionDesignerPreview({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [battalions, setBattalions] = useState<string[]>(initial);
  const [supports, setSupports] = useState<string[]>([]);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setFailed(false);
    setPreview(null);
    void engineClient.previewTemplate({ battalionIds: battalions, supportIds: supports })
      .then(result => { if (active) setPreview(result); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [open, battalions, supports]);
  const update = (next: string[]) => {
    setPreview(null);
    setBattalions(next);
  };
  const toggle = (id: string) => {
    setPreview(null);
    setSupports(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  };
  const name = (d: typeof BUILTIN_BATTALIONS[number]) => lang === 'ja' ? d.nameJa : d.nameEn;
  const rows = preview?.ok ? [
    ['game.manpower', preview.stats.manpower],
    ['prod.infStock', preview.stats.infantry],
    ['prod.artStock', preview.stats.artillery],
    ['mil.trainingDays', preview.stats.days],
    ['designer.attack', preview.stats.attack],
    ['designer.defense', preview.stats.defense],
    ['designer.org', preview.stats.org],
    ['designer.width', preview.stats.width],
    ['designer.speed', preview.stats.speed],
    ['designer.supply', preview.stats.supply],
  ] as const : [];
  return <section className="panel-section">
    <button type="button" data-testid="open-division-designer" aria-expanded={open} onClick={() => { setPreview(null); setOpen(!open); }}>
      {t(lang, open ? 'designer.close' : 'designer.open')}
    </button>
    {open && <div data-testid="division-designer">
      <h4 style={{ marginTop: 10 }}>{t(lang, 'designer.title')}</h4>
      <p className="muted">{t(lang, 'designer.notice')}</p>
      <b>{t(lang, 'designer.battalions')} ({battalions.length}/{MAX_BATTALIONS})</b>
      {BUILTIN_BATTALIONS.filter(d => d.category === 'battalion').map(d => {
        const count = battalions.filter(id => id === d.id).length;
        return <div className="kv" key={d.id}>
          <span>{name(d)}: <b data-testid={'count-' + d.id}>{count}</b></span>
          <span className="row">
            <button type="button" data-testid={'remove-' + d.id} aria-label={t(lang, 'designer.remove') + ' ' + name(d)}
              disabled={count === 0 || battalions.length === 1} onClick={() => {
                const next = [...battalions]; next.splice(next.lastIndexOf(d.id), 1); update(next);
              }}>−</button>
            <button type="button" data-testid={'add-' + d.id} aria-label={t(lang, 'designer.add') + ' ' + name(d)}
              disabled={battalions.length >= MAX_BATTALIONS} onClick={() => update([...battalions, d.id])}>+</button>
          </span>
        </div>;
      })}
      <b>{t(lang, 'designer.support')}</b>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {BUILTIN_BATTALIONS.filter(d => d.category === 'support').map(d =>
          <label key={d.id}><input type="checkbox" data-testid={'support-' + d.id} checked={supports.includes(d.id)} onChange={() => toggle(d.id)} />{name(d)}</label>
        )}
      </div>
      <button type="button" data-testid="designer-reset" onClick={() => { update(initial()); setSupports([]); }}>{t(lang, 'designer.reset')}</button>
      <div aria-live="polite" data-testid="designer-result">
        {failed ? <p role="alert">{t(lang, 'designer.error')}</p> : preview === null ? <p>{t(lang, 'designer.wait')}</p> :
          !preview.ok ? <p role="alert">{t(lang, 'designer.invalid')}</p> :
            rows.map(([key, value]) => <div className="kv" key={key}>
              <span>{t(lang, key)}</span><b data-testid={'designer-stat-' + key}>{Number.isInteger(value) ? String(value) : value.toFixed(2)}</b>
            </div>)}
      </div>
    </div>}
  </section>;
}
