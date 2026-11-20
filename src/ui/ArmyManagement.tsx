import { useState } from 'react';
import type { UiSnapshot, UiUnit } from '../engine/ui';
import { ARMY_COLORS, MAX_ARMY_UNITS, MAX_GROUP_ARMIES } from '../engine/military/armies';
import { engineClient } from './engineClient';
import { appStore } from './store';

type Lang = 'ja' | 'en';
type Props = { snap: UiSnapshot; lang: Lang; selectedIds: number[]; pending: number; onSelect: (ids: number[]) => void };

import { summarizeDivisions } from '../engine/military/armySummary';

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
    <div className="kv"><span>{ja?'組織率':'Organization'}</span><span>{format(u.org)} / 100</span></div>
    <progress aria-label={ja?'組織率':'Organization'} max={100} value={u.org}/>
    <div className="kv"><span>{ja?'実効補給効率':'Effective supply'}</span><span>{format(100*u.supply)}%</span></div>
    <progress aria-label={ja?'実効補給効率':'Effective supply'} max={1} value={u.supply}/>
    <small>{ja?'州の補給効率':'Province supply'} {format(100*u.supplyBase)}% × {ja?'容量係数':'Capacity factor'} {format(u.supplyCapacityFactor*100)}%</small>
  </div>;
}

export function ArmyManagement({snap,lang,selectedIds,pending,onSelect}:Props) {
  const ja = lang === 'ja';
  const [name,setName]=useState('');
  const [editing,setEditing]=useState(false);
  const [armyId,setArmyId]=useState('');
  const [groupId,setGroupId]=useState('');
  const [scope,setScope]=useState('selection');
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
  const create=(kind:'createArmy'|'createArmyGroup')=>{
    const nextName=name.trim();
    if (!canCommand || !nextName) return;
    engineClient.command(kind,{name:nextName,color:ARMY_COLORS[(kind==='createArmy'?armies.length:groups.length)%ARMY_COLORS.length]});
    setName('');
  };
  return <section className="army-management" data-testid="army-management">
    <h4>{label('陸軍指揮・編成','Army command')}</h4>
    <div className="army-bar">
      {groups.map(g=><button key={g.id} data-testid={'group-select-'+g.id} style={{borderColor:g.color}} onClick={()=>{setGroupId(String(g.id));onSelect(groupUnits(g.id));}}>{g.name} · {armies.filter(a=>a.groupId===g.id).length}/{MAX_GROUP_ARMIES}<small className="formation-leader" data-testid={'group-leader-'+g.id}>{commanderName(g.commanderId)}</small></button>)}
      {armies.map(a=><button key={a.id} data-testid={'army-select-'+a.id} style={{borderColor:a.color}} onClick={()=>{setArmyId(String(a.id));onSelect(memberIds(a.id));}}>{a.name} · {memberIds(a.id).length}/{MAX_ARMY_UNITS}<small className="formation-leader" data-testid={'army-leader-'+a.id}>{commanderName(a.commanderId)}</small></button>)}
      <button data-testid="select-unassigned" onClick={()=>onSelect(units.filter(u=>u.armyId===null).map(u=>u.id))}>{label('未編入','Unassigned')} · {units.filter(u=>u.armyId===null).length}</button>
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
