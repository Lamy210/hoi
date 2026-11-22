import {useEffect,useState} from 'react';
import type {UiSnapshot,UiCountry} from '../engine/ui';
import {engineClient} from './engineClient';

type Lang='ja'|'en';
type Model=UiSnapshot['equipmentModels'][number];
type Line=UiCountry['productionLines'][number];

function ProductionLineEditor({line,models,lang,pending,done}:{line:Line,models:Model[],lang:Lang,pending:number,done:string[]}) {
  const ja=lang==='ja';
  const [factories,setFactories]=useState(String(line.requestedFactories));
  const [priority,setPriority]=useState(String(line.priority));
  const [active,setActive]=useState(line.active);
  const [modelId,setModelId]=useState(line.modelId);
  useEffect(()=>{setFactories(String(line.requestedFactories));setPriority(String(line.priority));setActive(line.active);},[
    line.requestedFactories,line.priority,line.active]);
  useEffect(()=>setModelId(line.modelId),[line.modelId]);
  const f=Number(factories),p=Number(priority);
  const validFactories=factories.trim()!==''&&Number.isSafeInteger(f)&&f>=0&&f<=100000;
  const validPriority=Number.isInteger(p)&&p>=0&&p<=9;
  const dirty=f!==line.requestedFactories||p!==line.priority||active!==line.active;
  const selected=models.find(m=>m.id===modelId);
  const unlocked=selected&&(!selected.unlockTechId||done.includes(selected.unlockTechId));
  const modelName=(model:Model)=>ja?model.nameJa:model.nameEn;
  return <article className="production-plan-row" data-testid={'production-plan-'+line.id}>
    <header className="production-plan-header">
      <b>#{line.id} {ja?'生産ライン計画':'Production plan'}</b>
      <span>{ja?'現割当':'Allocated'} {line.allocatedFactories} / {ja?'要求':'Requested'} {line.requestedFactories}</span>
    </header>
    <div className="production-plan-form">
      <label>{ja?'工場要求数':'Requested factories'}
        <input data-testid={'plan-factories-'+line.id} type="number" min="0" max="100000" step="1"
          value={factories} onChange={e=>setFactories(e.target.value)} />
      </label>
      <label>{ja?'優先度（9が最高）':'Priority (9 highest)'}
        <select data-testid={'plan-priority-'+line.id} value={priority} onChange={e=>setPriority(e.target.value)}>
          {Array.from({length:10},(_,i)=><option key={i} value={i}>{i}</option>)}
        </select>
      </label>
      <label className="production-plan-toggle"><input type="checkbox"
        data-testid={'plan-active-'+line.id} checked={active} onChange={e=>setActive(e.target.checked)}/>
        {ja?'稼働計画':'Planned active'}
      </label>
    </div>
    <div className="production-plan-form">
      <label>{ja?'装備型番':'Equipment model'}
        <select data-testid={'plan-model-'+line.id} value={modelId} onChange={e=>setModelId(e.target.value)}>
          {models.map(m=><option key={m.id} value={m.id}
            disabled={!!m.unlockTechId&&!done.includes(m.unlockTechId)}>{modelName(m)} ({m.year}) {m.unlockTechId&&!done.includes(m.unlockTechId)?(ja?'🔒 未研究':'🔒 Locked'):''}</option>)}
        </select>
      </label>
      <small>{ja?'計画効率':'Planned efficiency'} {(line.efficiency*100).toFixed(1)}%</small>
    </div>
    <div className="production-plan-actions">
      <button data-testid={'plan-save-'+line.id} disabled={pending>0||!dirty||!validFactories||!validPriority}
        onClick={()=>engineClient.command('updateProductionLine',{lineId:line.id,factories:f,priority:p,active})}>
        {ja?'工場・優先度を保存':'Save allocation'}
      </button>
      <button data-testid={'plan-switch-'+line.id} disabled={pending>0||!unlocked||line.modelId===modelId}
        onClick={()=>engineClient.command('switchProductionModel',{lineId:line.id,modelId})}>
        {ja?'装備型番を切替':'Switch model'}
      </button>
      <button className="danger" data-testid={'plan-delete-'+line.id} disabled={pending>0}
        onClick={()=>engineClient.command('deleteProductionLine',{lineId:line.id})}>
        {ja?'削除':'Delete'}
      </button>
    </div>
  </article>;
}

/** Editor for future production plans. It must not imply per-model stock is already live. */
export function ProductionLinePlanner({snap,lang,pending}:{snap:UiSnapshot,lang:Lang,pending:number}){
  const ja=lang==='ja';
  const country=snap.countries[snap.playerCountry];
  const models=snap.equipmentModels;
  const done=country.research.done;
  const unlocked=models.filter(m=>!m.unlockTechId||done.includes(m.unlockTechId));
  const [modelId,setModelId]=useState('');
  const [factories,setFactories]=useState('1');
  const [priority,setPriority]=useState('5');
  const selectedModel=unlocked.some(m=>m.id===modelId)?modelId:unlocked[0]?.id??'';
  const f=Number(factories),p=Number(priority);
  const validFactory=factories.trim()!==''&&Number.isSafeInteger(f)&&f>=0&&f<=100000;
  const validPriority=Number.isInteger(p)&&p>=0&&p<=9;
  const total=country.productionLines.reduce((sum,line)=>sum+line.allocatedFactories,0);
  const capacity=country.alive?country.milFactories:0;
  return <section className="production-planner" data-testid="production-line-planner">
    <h4>{ja?'将来の装備モデル別生産計画':'Planned equipment production lines'}</h4>
    <p className="muted" data-testid="production-plan-warning">
      {ja
        ? 'この画面は生産計画の保存・検証用です。現時点の実際の歩兵装備・火砲の生産量と備蓄は、上記の従来配分率で決まり、ここでの編集では変化しません。'
        : 'Planning only: actual infantry and artillery output and stocks still use the legacy production ratio above. Editing these plans does not manufacture equipment.'}
    </p>
    <div className="kv"><span>{ja?'計画割当工場':'Allocated factories (plans)'}</span>
      <b data-testid="planning-allocation-total">{total} / {capacity}</b></div>
    <div className="production-plans">
      {country.productionLines.map(line=><ProductionLineEditor key={line.id} line={line} models={models}
        lang={lang} pending={pending} done={done}/>)}
      {!country.productionLines.length&&<p className="muted">{ja?'生産計画なし':'No planned lines'}</p>}
    </div>
    <h4>{ja?'計画ラインを追加':'Add a planned line'}</h4>
    <div className="production-plan-form">
      <label>{ja?'装備モデル':'Equipment model'}
        <select data-testid="new-plan-model" value={selectedModel} onChange={e=>setModelId(e.target.value)}>
          {unlocked.map(model=><option key={model.id} value={model.id}>{ja?model.nameJa:model.nameEn} ({model.year})</option>)}
        </select>
      </label>
      <label>{ja?'工場要求数':'Factories'}
        <input data-testid="new-plan-factories" type="number" min="0" max="100000"
          step="1" value={factories} onChange={e=>setFactories(e.target.value)}/>
      </label>
      <label>{ja?'優先度':'Priority'}
        <select data-testid="new-plan-priority" value={priority} onChange={e=>setPriority(e.target.value)}>
          {Array.from({length:10},(_,i)=><option key={i} value={i}>{i}</option>)}
        </select>
      </label>
    </div>
    <button data-testid="create-production-plan" disabled={pending>0||country.productionLines.length>=128||
      !selectedModel||!validFactory||!validPriority||!country.alive}
      onClick={()=>engineClient.command('createProductionLine',{modelId:selectedModel,factories:f,priority:p})}>
      {ja?'計画ラインを追加':'Create plan'}
    </button>
    <small className="muted">{ja?'新規ラインの初期効率は10%。研究済みモデルのみ作成できます。'
      :'New plans start at 10% efficiency. Only researched models can be selected.'}</small>
  </section>;
}
