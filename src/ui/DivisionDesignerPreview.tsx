import { useEffect, useState } from 'react';
import { validTemplateName, type CustomTemplateRevision } from '../engine/military/customTemplates';
import { BUILTIN_BATTALIONS, MAX_BATTALIONS, type TemplatePreview } from '../engine/military/templateStats';
import { engineClient } from './engineClient';
import { t } from './i18n';

type Lang = 'ja' | 'en';
const initial = () => Array<string>(10).fill('infantry-v1');

export function DivisionDesignerPreview({ lang, templates, playerCountry, pending }: { lang: Lang; templates: CustomTemplateRevision[]; playerCountry: number; pending: number }) {
  const [open, setOpen] = useState(false);
  const [battalions, setBattalions] = useState<string[]>(initial);
  const [supports, setSupports] = useState<string[]>([]);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [failed, setFailed] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const latest = [...templates.filter(t => t.country === playerCountry)].sort((a,b) => a.templateId-b.templateId || b.revision-a.revision).filter((t, i, all) => i === 0 || t.templateId !== all[i-1].templateId);
  const editing = latest.find(t=>t.templateId === editId);
  const resetEditor = () => { setEditId(null); setTemplateName(''); update(initial()); setSupports([]); };
  const save = () => {
    if (pending || !preview?.ok || !validTemplateName(templateName)) return;
    const composition = { battalionIds: battalions.slice(), supportIds: supports.slice(), name: templateName };
    if(editing) engineClient.command('reviseTemplate', { ...composition, templateId: editing.templateId, expectedRevision: editing.revision });
    else engineClient.command('createTemplate', composition);
  };
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
      <div className="panel-section" data-testid="saved-templates">
        <label>{lang==='ja'?'保存済み編成':'Saved templates'} <select data-testid="saved-template-select" value={editing?.templateId ?? ''} onChange={e=>{
          const template=latest.find(t=>t.templateId===Number(e.target.value));
          if(!template){resetEditor();return;}
          setEditId(template.templateId);setTemplateName(template.name);setPreview(null);
          setBattalions(template.battalionIds.slice());setSupports(template.supportIds.slice());
        }}><option value="">{lang==='ja'?'新規編成':'New template'}</option>
          {latest.map(x=><option key={x.templateId} value={x.templateId}>{x.name} · #{x.templateId} v{x.revision}</option>)}
        </select></label>
        <label>{lang==='ja'?'編成名':'Template name'} <input data-testid="custom-template-name" value={templateName} maxLength={64} placeholder={lang==='ja'?'編成名':'Template name'} onChange={e=>setTemplateName(e.target.value)}/></label>
        <div className="row">
          <button type="button" data-testid="save-custom-template" disabled={pending>0||!preview?.ok||!validTemplateName(templateName)} onClick={save}>{editing?(lang==='ja'?'改訂を保存':'Save revision'):(lang==='ja'?'新規編成を保存':'Save new template')}</button>
          <button type="button" data-testid="new-custom-template" onClick={resetEditor}>{lang==='ja'?'新規に戻す':'Start new'}</button>
          {editing&&<button type="button" data-testid="delete-custom-template" disabled={pending>0} onClick={()=>{
            engineClient.command('deleteTemplate',{templateId:editing.templateId,expectedRevision:editing.revision});resetEditor();
          }}>{lang==='ja'?'編成を削除':'Delete template'}</button>}
        </div>
        <small>{lang==='ja'?'改訂すると過去の版は保持されます。現時点では独自編成の訓練・配備は未対応です。':'Revisions preserve history. Training and deployment of custom templates are not yet available.'}</small>
      </div>
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
