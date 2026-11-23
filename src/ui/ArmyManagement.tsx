import { useState } from 'react';
import type { UiSnapshot, UiUnit } from '../engine/ui';
import { ARMY_COLORS, MAX_ARMY_UNITS, MAX_GROUP_ARMIES } from '../engine/military/armies';
import { engineClient } from './engineClient';
import { appStore } from './store';
import {FormationCommandCenter} from './FormationCommandCenter';
import {FormationAssignmentPanel} from './FormationAssignmentPanel';
import {CombatFrontageInspector} from './CombatFrontageInspector';
import type {FormationScope} from '../engine/military/formationOverview';

type Lang = 'ja' | 'en';
type Props = { snap: UiSnapshot; lang: Lang; selectedIds: number[]; pending: number; onSelect: (ids: number[]) => void; focus:FormationScope|null; onFocus:(focus:FormationScope|null)=>void };

import { summarizeDivisions } from '../engine/military/armySummary';
import { customTemplateStats } from '../engine/military/customTemplates';
import { calculateRefitResources, MAX_BATCH_REFIT } from '../engine/military/refit';

export function DivisionResources({unit:u,lang,context=false}: {unit:UiUnit;lang:Lang;context?:boolean}) {
  const ja = lang === 'ja';
  const format = (v:number) => v.toLocaleString(ja?'ja-JP':'en-US',{maximumFractionDigits:1});
  const rows = [
    [ja?'人員':'Manpower',u.manpower,u.maxManpower],
    [ja?'歩兵装備':'Infantry equipment',u.infEquipment,u.maxInfEquipment],
    [ja?'火砲':'Artillery',u.artEquipment,u.maxArtEquipment],
  ] as const;
  return <div className="division-resources" data-testid={(context?'context-unit-resources-':'unit-resources-')+u.id}>
    {rows.map(([label,actual,required]) => <div key={label}>
      <div className="kv"><span>{label}</span><span>{format(actual)} / {format(required)}</span></div>
      <progress aria-label={label} max={1} value={required>0 ? Math.min(1,Math.max(0,actual/required)):1}/>
      <small>{ja?'不足':'Deficit'}: {format(Math.max(0,required-actual))}</small>
    </div>)}
    <div data-testid={'issued-models-'+u.id} className="division-issued-models">
      <b>{ja?'師団保有の装備型番':'Identified equipment held by division'}</b>
      <small className="muted">{ja?'以下は装備保有数の内訳です。未分類の装備もあります。':'These are subsets of unit equipment, not extra items. Other equipment is unclassified.'}</small>
      {u.issuedModels.length?u.issuedModels.map(item=>
        <div className="kv" key={item.modelId} data-testid={'issued-model-'+u.id+'-'+item.modelId}>
          <span>{item.modelId}</span><span>{format(item.quantity)}</span>
        </div>):<small>{ja?'型番の記録なし':'No identified models'}</small>}
    </div>
    <div className="kv"><span>{ja?'組織率':'Organization'}</span><span>{format(u.org)} / {format(u.orgCap)}</span></div>
    <progress aria-label={ja?'組織率':'Organization'} max={u.orgCap} value={u.org}/>
    <div className="kv"><span>{ja?'戦闘幅':'Combat width'}</span><span>{format(u.combatWidth)}</span></div>
    <div className="kv"><span>{ja?'基礎攻撃 / 防御':'Base attack / defense'}</span><span>{format(u.baseAttack)} / {format(u.baseDefense)}</span></div>
    <div className="kv"><span>{ja?'補給需要 / 速度':'Supply demand / speed'}</span><span>{format(u.supplyDemand)} / ×{format(u.speedMultiplier)}</span></div>
    <div className="kv"><span>{ja?'実効補給効率':'Effective supply'}</span><span>{format(100*u.supply)}%</span></div>
    <progress aria-label={ja?'実効補給効率':'Effective supply'} max={1} value={u.supply}/>
    <small>{ja?'州の補給効率':'Province supply'} {format(100*u.supplyBase)}% × {ja?'容量係数':'Capacity factor'} {format(u.supplyCapacityFactor*100)}%</small>
  </div>;
}

export function ArmyManagement({snap,lang,selectedIds,pending,onSelect,focus,onFocus}:Props) {
  const ja = lang === 'ja';
  const [name,setName]=useState('');
  const [editing,setEditing]=useState(false);
  const [armyId,setArmyId]=useState('');
  const [groupId,setGroupId]=useState('');
  const [scope,setScope]=useState('selection');
  const [quickTemplate,setQuickTemplate]=useState('');
  const [exchangeTarget,setExchangeTarget]=useState('');
  const [exchangeSource,setExchangeSource]=useState('unclassified');
  const [exchangeAmount,setExchangeAmount]=useState('100');
  const country=snap.playerCountry;
  const armies=snap.armies.filter(a=>a.owner===country);
  const groups=snap.armyGroups.filter(g=>g.owner===country);
  const units=snap.units.filter(u=>u.owner===country);
  const selected=units.filter(u=>selectedIds.includes(u.id));
  const army=armies.find(a=>String(a.id)===armyId);
  const group=groups.find(g=>String(g.id)===groupId);
  const memberIds=(id:number)=>units.filter(u=>u.armyId===id).map(u=>u.id);
  const groupUnits=(id:number)=> {const ids=new Set(armies.filter(a=>a.groupId===id).map(a=>a.id)); return units.filter(u=>u.armyId!==null&&ids.has(u.armyId)).map(u=>u.id);};
  const summary=summarizeDivisions(scope==='all'?units:selected);
  const fmt=(n:number)=>n.toLocaleString(ja?'ja-JP':'en-US',{maximumFractionDigits:1});
  const canCommand=pending===0;
  const commanders=snap.commanders.filter(c=>c.country===country);
  const commanderName=(id:number|undefined)=>{const c=commanders.find(c=>c.id===id);return c?(ja?c.nameJa:c.nameEn)+' S'+c.skill:(ja?'未配置':'Unassigned');};
  const role=(id:number)=>{const a=armies.find(a=>a.commanderId===id),g=groups.find(g=>g.commanderId===id),c=commanders.find(c=>c.id===id);return a?a.name:g?g.name:c&&c.assignedUnit>=0?(ja?'師団 #':'Division #')+c.assignedUnit:(ja?'空き':'Available');};
  const label=(j:string,e:string)=>ja?j:e;
  const latestTemplates=snap.customTemplates.filter(t=>t.country===country)
    .sort((a,b)=>a.templateId-b.templateId||b.revision-a.revision)
    .filter((t,i,all)=>i===0||all[i-1].templateId!==t.templateId);
  const refitTarget=selected.length===1?selected[0]:null;
  const refitTemplate=latestTemplates.find(t=>String(t.templateId)+':'+t.revision===quickTemplate);
  const refitStats=refitTemplate?customTemplateStats(refitTemplate):null;
  const player=snap.countries[country];
  const refitAmounts=refitStats&&selected.length?calculateRefitResources(selected,refitStats):null;
  const stock=[player.manpowerPool,player.infEquipmentStock,player.artEquipmentStock];
  const isEligible=selected.length>0&&selected.length<=MAX_BATCH_REFIT&&selected.every(u=>
    !u.moving&&!u.inBattle&&!u.encircled&&snap.controller[u.loc]===country);
  const refitAllowed=!!refitTemplate&&!!refitAmounts&&canCommand&&isEligible&&
    refitAmounts.net.every((cost,index)=>stock[index]>=cost);
  const fmtResources=(nums: readonly number[])=>nums.map(fmt).join(' / ');
  const exchangeUnit=selected.length===1?selected[0]:null;
  const exchangeUnits=selected.length>0&&selected.length<=MAX_BATCH_REFIT?selected:[];
  const targetModel=snap.equipmentModels.find(model=>model.id===exchangeTarget);
  const availableTarget=player.modelStock.find(row=>row.modelId===exchangeTarget)?.quantity??0;
  const category=targetModel?.category;
  const identifiedFor=(u:UiUnit)=>category?u.issuedModels.filter(row=>
    snap.equipmentModels.some(model=>model.id===row.modelId&&model.category===category)):[];
  const unclassifiedFor=(u:UiUnit)=>{
    const held=category==='infantry'?u.infEquipment:category==='artillery'?u.artEquipment:0;
    return Math.max(0,held-identifiedFor(u).reduce((sum,row)=>sum+row.quantity,0));
  };
  const sourceFor=(u:UiUnit)=>exchangeSource==='unclassified'
    ? unclassifiedFor(u) : (identifiedFor(u).find(row=>row.modelId===exchangeSource)?.quantity??0);
  const sourceIds=[...new Set(exchangeUnits.flatMap(u=>identifiedFor(u).map(row=>row.modelId)))]
    .filter(id=>id!==exchangeTarget).sort();
  const unclassified=exchangeUnits.length?
    Math.min(...exchangeUnits.map(unclassifiedFor)):0;
  const availableSource=exchangeUnits.length?
    Math.min(...exchangeUnits.map(sourceFor)):0;
  const amount=Number(exchangeAmount);
  const requestedTotal=amount*exchangeUnits.length;
  const validExchange=!!targetModel&&isEligible&&canCommand&&
    Number.isSafeInteger(amount)&&amount>=1&&amount<=100000&&
    exchangeSource!==exchangeTarget&&availableSource+1e-7>=amount;
  const exchangeAllowed=!!exchangeUnit&&validExchange&&availableTarget>=amount;
  const batchExchangeAllowed=exchangeUnits.length>=2&&validExchange&&
    Number.isSafeInteger(requestedTotal)&&availableTarget>=requestedTotal;
  const refitReason = !refitTemplate ? label('改編先を選択してください','Select a saved template') :
    selected.length>MAX_BATCH_REFIT ? label('一度に100師団まで','Up to 100 divisions per order') :
    !isEligible ? label('移動中・戦闘中・包囲中・敵支配州にいる師団は改編不可','Moving, battling, encircled or occupied divisions cannot refit') :
    refitAmounts?.net.some((n,i)=>stock[i]<n) ? label('必要資源が不足','Insufficient resources') : '';
  const create=(kind:'createArmy'|'createArmyGroup')=>{
    const nextName=name.trim();
    if (!canCommand || !nextName) return;
    engineClient.command(kind,{name:nextName,color:ARMY_COLORS[(kind==='createArmy'?armies.length:groups.length)%ARMY_COLORS.length]});
    setName('');
  };
  return <section className="army-management" data-testid="army-management">
    <h4>{label('陸軍指揮・編成','Army command')}</h4>
    <div className="army-bar">
      {groups.map(g=><button key={g.id} data-testid={'group-select-'+g.id} style={{borderColor:g.color}} onClick={()=>{setGroupId(String(g.id));onFocus({kind:'group',id:g.id});onSelect(groupUnits(g.id));}}>{g.name} · {armies.filter(a=>a.groupId===g.id).length}/{MAX_GROUP_ARMIES}<small className="formation-leader" data-testid={'group-leader-'+g.id}>{commanderName(g.commanderId)}</small></button>)}
      {armies.map(a=><button key={a.id} data-testid={'army-select-'+a.id} style={{borderColor:a.color}} onClick={()=>{setArmyId(String(a.id));onFocus({kind:'army',id:a.id});onSelect(memberIds(a.id));}}>{a.name} · {memberIds(a.id).length}/{MAX_ARMY_UNITS}<small className="formation-leader" data-testid={'army-leader-'+a.id}>{commanderName(a.commanderId)}</small></button>)}
      <button data-testid="select-unassigned" onClick={()=>{onFocus(null);onSelect(units.filter(u=>u.armyId===null).map(u=>u.id));}}>{label('未編入','Unassigned')} · {units.filter(u=>u.armyId===null).length}</button>
    </div>
    <FormationCommandCenter snap={snap} lang={lang} focus={focus} pending={pending} selectedIds={selectedIds} onSelect={onSelect}/>
    <FormationAssignmentPanel snap={snap} lang={lang} focus={focus} pending={pending} selectedIds={selectedIds}/>
    <CombatFrontageInspector snap={snap} lang={lang} selected={selected}/>
    <div className="army-quick-action" data-testid="army-quick-action">
      <div className="kv"><b>{label('選択した師団','Selected divisions')}</b><strong>{selected.length}</strong></div>
      {refitTarget && <div className="muted">#{refitTarget.id} · {refitTarget.customTemplateId!==undefined?refitTarget.customTemplateId+' v'+refitTarget.customRevision:(refitTarget.templateId??'standard-v1')}</div>}
      <div className="move-controls">
        <select data-testid="army-quick-template" aria-label={label('改編先の自由編成','Refit to custom template')} value={quickTemplate} onChange={e=>setQuickTemplate(e.target.value)}>
          <option value="">{label('自由編成を選択','Select saved template')}</option>
          {latestTemplates.map(t=><option key={t.templateId} value={String(t.templateId)+':'+t.revision}>{t.name} · v{t.revision}</option>)}
        </select>
        <button data-testid="army-quick-refit" className="primary" disabled={selected.length!==1||!refitAllowed} onClick={()=>{if(refitTarget&&refitTemplate)engineClient.command('refitUnit',{unitId:refitTarget.id,templateId:refitTemplate.templateId,revision:refitTemplate.revision});}}>{label('1師団を改編','Refit one')}</button>
        <button data-testid="army-batch-refit" className="primary" disabled={selected.length<2||!refitAllowed} onClick={()=>{if(refitTemplate)engineClient.command('refitUnits',{unitIds:selected.map(u=>u.id),templateId:refitTemplate.templateId,revision:refitTemplate.revision});}}>{label('選択師団を一括改編','Batch refit')}</button>
      </div>
      {refitAmounts&&<div className="army-refit-preview" data-testid="army-batch-preview">
        <small>{label('追加必要量（人員 / 歩兵装備 / 火砲）','Total purchases (manpower / infantry / artillery)')}: {fmtResources(refitAmounts.purchase)}</small>
        <small>{label('返却量','Refund')}: {fmtResources(refitAmounts.refund)}</small>
        <small>{label('差引消費（負数＝返却）','Net spend (negative = return)')}: {fmtResources(refitAmounts.net)}</small>
      </div>}
      <fieldset className="army-model-exchange" data-testid="army-model-exchange">
        <legend>{label('師団の銃器・火砲を交換','Exchange division equipment')}</legend>
        <small className="muted">{label(
          '国家倉庫の指定型番と師団の同じ種類の装備を1対1で交換します。総装備数は変わりません。',
          'One-to-one exchange with a specific warehouse model. Total equipment counts do not change.')}</small>
        <div className="move-controls">
          <select data-testid="exchange-model-target" aria-label={label('交換後の装備型番','New equipment model')}
            value={exchangeTarget} onChange={e=>{setExchangeTarget(e.target.value);setExchangeSource('unclassified');}}>
            <option value="">{label('倉庫内の装備型番を選択','Select a stocked model')}</option>
            {player.modelStock.map(row=>{
              const model=snap.equipmentModels.find(m=>m.id===row.modelId);
              return <option key={row.modelId} value={row.modelId}>
                {model?(ja?model.nameJa:model.nameEn):row.modelId} · {fmt(row.quantity)}
              </option>;
            })}
          </select>
          <select data-testid="exchange-model-source" aria-label={label('交換前の装備型番','Old equipment model')}
            value={exchangeSource} onChange={e=>setExchangeSource(e.target.value)}
            disabled={!targetModel||exchangeUnits.length===0}>
            <option value="unclassified">{label('未分類の装備','Unclassified equipment')} · {fmt(unclassified)}</option>
            {sourceIds.map(id=>
              <option key={id} value={id}>{id} · {fmt(Math.min(
                ...exchangeUnits.map(u=>identifiedFor(u).find(row=>row.modelId===id)?.quantity??0)
              ))}</option>)}
          </select>
          <input data-testid="exchange-model-quantity" type="number" min="1" max="100000" step="1"
            aria-label={label('交換数量','Exchange quantity')} value={exchangeAmount}
            onChange={e=>setExchangeAmount(e.target.value)}/>
          <button data-testid="exchange-model-submit" disabled={!exchangeAllowed}
            onClick={()=>exchangeUnit&&engineClient.command('exchangeUnitEquipment',{
              unitId:exchangeUnit.id,fromModelId:exchangeSource,toModelId:exchangeTarget,quantity:amount,
            })}>{label('1師団の装備を交換','Exchange one')}</button>
          <button data-testid="exchange-model-batch-submit" disabled={!batchExchangeAllowed}
            onClick={()=>engineClient.command('exchangeUnitsEquipment',{
              unitIds:exchangeUnits.map(u=>u.id),
              fromModelId:exchangeSource,toModelId:exchangeTarget,quantity:amount,
            })}>{label('選択師団を一括交換','Exchange selected')}</button>
        </div>
        {exchangeUnits.length>0&&targetModel&&<small data-testid="exchange-model-availability">
          {label('選択師団数','Selected divisions')}: {exchangeUnits.length} ·
          {label('各師団の交換元最小残数','Minimum source per division')}: {fmt(availableSource)} ·
          {label('国家倉庫の交換先在庫','Target warehouse stock')}: {fmt(availableTarget)} ·
          {label('一括交換時の総必要数','Total required for batch')}: {Number.isFinite(requestedTotal)?fmt(requestedTotal):'—'}
          {!isEligible&&label('（移動中・戦闘中・包囲中・非支配州では交換不可）',
            ' (unavailable while moving, battling, encircled or outside controlled provinces)')}
        </small>}
      </fieldset>
      <small data-testid="army-batch-reason">{refitReason || label('命令の適用直前に再検証し、全件成功・全件拒否します。','Validated at command execution, all-or-nothing.')}</small>
    </div>
    <button data-testid="toggle-army-editor" aria-expanded={editing} onClick={()=>setEditing(!editing)}>{label(editing?'編成編集を閉じる':'編成を編集',editing?'Close editor':'Edit formations')}</button>
    {editing && <>
    <div className="move-controls">
      <input data-testid="army-name" aria-label={label('編成名','Formation name')} value={name} onChange={e=>setName(e.target.value)} placeholder={label('編成名','Formation name')} maxLength={64}/>
      <button data-testid="create-army" disabled={!canCommand||!name.trim()} onClick={()=>create('createArmy')}>{label('軍団作成','Create army')}</button>
      <button data-testid="create-army-group" disabled={!canCommand||!name.trim()} onClick={()=>create('createArmyGroup')}>{label('軍集団作成','Create group')}</button>
    </div>
    <div className="move-controls">
      <select data-testid="army-target" aria-label={label('所属軍団','Army')} value={army?.id??''} onChange={e=>setArmyId(e.target.value)}>
        <option value="">{label('軍団を選択','Select army')}</option>{armies.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <button data-testid="assign-army" disabled={!canCommand||!army||!selected.length||units.filter(u=>u.armyId===army.id&&!selectedIds.includes(u.id)).length+selected.length>MAX_ARMY_UNITS} onClick={()=>army&&engineClient.command('assignArmy',{unitIds:selected.map(u=>u.id),armyId:army.id})}>{label('選択師団を編入','Assign selected')}</button>
      <button data-testid="unassign-army" disabled={!canCommand||!selected.some(u=>u.armyId!==null)} onClick={()=>engineClient.command('assignArmy',{unitIds:selected.map(u=>u.id),armyId:null})}>{label('所属解除','Unassign')}</button>
      <button data-testid="delete-army" disabled={!canCommand||!army||memberIds(army.id).length>0} onClick={()=>army&&engineClient.command('deleteArmy',{id:army.id})}>{label('空軍団を削除','Delete empty army')}</button>
    </div>
    <div className="move-controls">
      <select data-testid="group-target" aria-label={label('所属軍集団','Army group')} value={group?.id??''} onChange={e=>setGroupId(e.target.value)}>
        <option value="">{label('軍集団を選択','Select group')}</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <button data-testid="assign-army-group" disabled={!canCommand||!army||!group||armies.filter(a=>a.groupId===group.id&&a.id!==army.id).length>=MAX_GROUP_ARMIES} onClick={()=>army&&group&&engineClient.command('assignArmyGroup',{armyIds:[army.id],groupId:group.id})}>{label('軍団を軍集団へ編入','Assign army to group')}</button>
      <button data-testid="unassign-army-group" disabled={!canCommand||!army||army.groupId===null} onClick={()=>army&&engineClient.command('assignArmyGroup',{armyIds:[army.id],groupId:null})}>{label('軍集団から解除','Remove from group')}</button>
      <button data-testid="delete-army-group" disabled={!canCommand||!group||armies.some(a=>a.groupId===group.id)} onClick={()=>group&&engineClient.command('deleteArmyGroup',{id:group.id})}>{label('空軍集団を削除','Delete empty group')}</button>
    </div>
    {army&&<label className="move-controls">{label('軍団の補充優先度（0〜9）','Army reinforcement priority (0-9)')}
      <select data-testid="army-reinforcement-priority" disabled={!canCommand} value={army.reinforcementPriority??5} onChange={e=>engineClient.command('setArmyReinforcementPriority',{armyId:army.id,priority:Number(e.target.value)})}>
        {Array.from({length:10},(_,n)=><option key={n} value={n}>{n}{n===5?' · '+label('標準','Normal'):''}</option>)}
      </select>
    </label>}
    <div className="formation-commanders">
      <small>{label('指揮官を選ぶと以前の役職から移籍します。上位指揮官は現在、管理専用で戦闘補正はありません。','Assigning transfers the commander from their previous role. Formation commanders are management-only for now.')}</small>
      {([{kind:'army',formation:army},{kind:'group',formation:group}] as const).map(({kind,formation:f})=>f&&<label key={kind} className="move-controls">
        {kind==='army'?label('軍団指揮官','Army commander'):label('軍集団司令官','Group commander')}
        <select data-testid={kind+'-commander-select'} disabled={!canCommand} value={f.commanderId??-1} onChange={e=>engineClient.command('assignFormationCommander',{kind,formationId:f.id,commanderId:Number(e.target.value)})}>
          <option value={-1}>{label('未配置','Unassigned')}</option>
          {commanders.map(c=><option key={c.id} value={c.id}>{commanderName(c.id)} · {role(c.id)}</option>)}
        </select>
      </label>)}
    </div>
    </>}
    <select data-testid="army-summary-scope" aria-label={label('集計対象','Summary scope')} value={scope} onChange={e=>setScope(e.target.value)}><option value="selection">{label('選択部隊の集計','Selected units')}</option><option value="all">{label('全自国師団の集計','All deployed divisions')}</option></select>
    <div data-testid="army-summary">
      <div className="kv"><span>{label('師団数','Divisions')}</span><span>{summary.count}</span></div>
      {([[label('人員','Manpower'),summary.manpower,summary.maxManpower],[label('歩兵装備','Infantry equipment'),summary.infantry,summary.maxInfantry],[label('火砲','Artillery'),summary.artillery,summary.maxArtillery]] as const).map(([name,n,max])=><div className="kv" key={name}><span>{name}</span><span>{fmt(n)} / {fmt(max)} · {label('不足','Missing')} {fmt(Math.max(0,max-n))}</span></div>)}
      <div className="kv"><span>{label('平均組織率','Average organization')}</span><span>{summary.org===null?'—':fmt(summary.org)}</span></div>
      <div className="kv"><span>{label('平均補給効率','Average supply')}</span><span>{summary.supply===null?'—':fmt(summary.supply*100)+'%'}</span></div>
      <div className="kv"><span>{label('補給50%未満','Supply below 50%')}</span><span>{summary.supplyLow}</span></div>
    </div>
    <button data-testid="army-supply-map" onClick={()=>appStore.set({mapMode:'supply'})}>{label('補給マップ','Supply map')}</button>
  </section>;
}
