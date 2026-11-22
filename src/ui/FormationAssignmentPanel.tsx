import {useState} from 'react';
import type {UiSnapshot} from '../engine/ui';
import type {FormationScope} from '../engine/military/formationOverview';
import {previewDivisionAssignment,previewArmyGroupAssignment,type AssignmentPreview} from '../engine/military/formationAssignment';
import {engineClient} from './engineClient';

type Props={
  snap:UiSnapshot;lang:'ja'|'en';selectedIds:number[];pending:number;
  focus:FormationScope|null;
};
export function FormationAssignmentPanel({snap,lang,selectedIds,pending,focus}:Props){
  const ja=lang==='ja',label=(jp:string,en:string)=>ja?jp:en;
  const [divisionTarget,setDivisionTarget]=useState('');
  const [groupTarget,setGroupTarget]=useState('');
  const [chosenArmyIds,setChosenArmyIds]=useState<number[]>([]);
  const country=snap.playerCountry;
  const armies=snap.armies.filter(a=>a.owner===country).sort((a,b)=>a.id-b.id);
  const groups=snap.armyGroups.filter(g=>g.owner===country).sort((a,b)=>a.id-b.id);
  const ownUnits=snap.units.filter(u=>u.owner===country);
  const selectedArmyIds=chosenArmyIds.filter(id=>armies.some(a=>a.id===id)).sort((a,b)=>a-b);
  const chosenGroup=groups.find(g=>String(g.id)===groupTarget);
  const chosenArmy=armies.find(a=>String(a.id)===divisionTarget);
  const divPlan=previewDivisionAssignment(snap.units,armies,country,selectedIds,chosenArmy?.id??null);
  const groupPlan=previewArmyGroupAssignment(armies,groups,country,selectedArmyIds,chosenGroup?.id??null);
  const divUnassign=previewDivisionAssignment(snap.units,armies,country,selectedIds,null);
  const groupUnassign=previewArmyGroupAssignment(armies,groups,country,selectedArmyIds,null);
  const selectedArmySet=new Set(selectedArmyIds);
  const reason=(p:AssignmentPreview)=>{
    switch(p.reason){
      case 'empty': return label('対象を選択してください','Select a formation first');
      case 'unchanged': return label('すでに指定先に所属しています','Already assigned to the selected destination');
      case 'limitExceeded': return label('定員超過のため一括編入できません','Capacity exceeded: assignment blocked');
      case 'noTarget': return label('所属先を選択してください','Choose a destination');
      case 'notOwned':case 'badSelection':return label('選択対象が無効です','Invalid selection');
      default: return label('全件を一括して変更します','All selected formations will be transferred together');
    }
  };
  const ready=pending===0;
  const selectArmy=(id:number,checked:boolean)=>setChosenArmyIds(old=>checked?
    [...new Set([...old,id])].sort((a,b)=>a-b):old.filter(x=>x!==id));
  const groupMembers=focus?.kind==='group'?armies.filter(a=>a.groupId===focus.id).map(a=>a.id):[];
  return <section className="formation-assignment-panel" data-testid="formation-assignment-panel">
    <header><strong>{label('所属・指揮系統の一括変更','Bulk formation assignment')}</strong>
      <small>{label('師団 → 軍、複数軍 → 軍集団をまとめて変更','Move divisions to an army or several armies into a group')}</small>
    </header>
    <div className="formation-assignment-grid">
      <fieldset data-testid="division-assignment-controls">
        <legend>{label('選択師団を軍に編入','Assign selected divisions to an army')}</legend>
        <div className="kv"><span>{label('選択中の師団','Selected divisions')}</span>
          <b data-testid="assignment-selected-divisions">{selectedIds.length}</b></div>
        <label>{label('所属先の軍','Destination army')}
          <select data-testid="assignment-division-target" value={divisionTarget}
            onChange={e=>setDivisionTarget(e.target.value)}>
            <option value="">{label('軍を選択','Choose an army')}</option>
            {armies.map(a=><option key={a.id} value={a.id}>{a.name} · {
              ownUnits.filter(u=>u.armyId===a.id).length}/24</option>)}
          </select>
        </label>
        {chosenArmy&&<small data-testid="assignment-division-capacity">{
          label('所属師団数','Division count')}: {divPlan.current} → {divPlan.projected}/{divPlan.capacity} · {
          label('移籍対象','Moving')}: {divPlan.moved}</small>}
        <div className="formation-assignment-actions">
          <button data-testid="assignment-assign-divisions" disabled={!ready||!chosenArmy||divPlan.reason!==null}
            onClick={()=>chosenArmy&&engineClient.command('assignArmy',{
              unitIds:selectedIds,armyId:chosenArmy.id,
            })}>{label('選択師団を一括編入','Assign selected divisions')}</button>
          <button data-testid="assignment-unassign-divisions" disabled={!ready||divUnassign.reason!==null}
            onClick={()=>engineClient.command('assignArmy',{unitIds:selectedIds,armyId:null})}>
            {label('選択師団の所属解除','Unassign divisions')}
          </button>
        </div>
        <small data-testid="assignment-division-reason" aria-live="polite">
          {chosenArmy?reason(divPlan):reason({...divPlan,reason:'noTarget'})}</small>
      </fieldset>
      <fieldset data-testid="group-assignment-controls">
        <legend>{label('複数の軍を軍集団に編入','Assign multiple armies to a group')}</legend>
        <div className="formation-army-picker">
          <div className="formation-assignment-actions">
            <button data-testid="assignment-select-unassigned-armies"
              disabled={!armies.some(a=>a.groupId===null)}
              onClick={()=>setChosenArmyIds(armies.filter(a=>a.groupId===null).map(a=>a.id))}>
              {label('未所属の軍を選択','Select independent armies')}
            </button>
            <button data-testid="assignment-select-focused-armies"
              disabled={!groupMembers.length}
              onClick={()=>setChosenArmyIds(groupMembers)}>{
              label('選択中の軍集団の軍','Select focused group armies')}</button>
            <button data-testid="assignment-clear-armies"
              disabled={!selectedArmyIds.length} onClick={()=>setChosenArmyIds([])}>
              {label('軍の選択解除','Clear armies')}
            </button>
          </div>
          {armies.map(a=><label key={a.id} className="formation-army-picker-item"
            data-testid={'assignment-army-choice-'+a.id}>
            <input type="checkbox" data-testid={'assignment-army-checkbox-'+a.id}
              checked={selectedArmySet.has(a.id)} onChange={e=>selectArmy(a.id,e.target.checked)}/>
            <span className="oob-color" style={{background:a.color}}/>
            <span>{a.name}</span>
            <small>{a.groupId===null?label('独立','Independent'):
              groups.find(g=>g.id===a.groupId)?.name??label('不明','Unknown')}</small>
          </label>)}
          {!armies.length&&<small className="muted">{label('先に軍を作成してください','Create an army first')}</small>}
        </div>
        <div className="kv"><span>{label('選択中の軍','Selected armies')}</span>
          <b data-testid="assignment-selected-armies">{selectedArmyIds.length}</b></div>
        <label>{label('所属先の軍集団','Destination army group')}
          <select data-testid="assignment-group-target" value={groupTarget}
            onChange={e=>setGroupTarget(e.target.value)}>
            <option value="">{label('軍集団を選択','Choose a group')}</option>
            {groups.map(g=><option key={g.id} value={g.id}>{g.name} · {
              armies.filter(a=>a.groupId===g.id).length}/5</option>)}
          </select>
        </label>
        {chosenGroup&&<small data-testid="assignment-group-capacity">{
          label('所属軍数','Armies in group')}: {groupPlan.current} → {
          groupPlan.projected}/{groupPlan.capacity} · {label('移籍対象','Moving')}: {
          groupPlan.moved}</small>}
        <div className="formation-assignment-actions">
          <button data-testid="assignment-assign-armies" disabled={!ready||!chosenGroup||groupPlan.reason!==null}
            onClick={()=>chosenGroup&&engineClient.command('assignArmyGroup',{
              armyIds:selectedArmyIds,groupId:chosenGroup.id,
            })}>{label('選択軍を一括編入','Assign selected armies')}</button>
          <button data-testid="assignment-unassign-armies" disabled={!ready||groupUnassign.reason!==null}
            onClick={()=>engineClient.command('assignArmyGroup',{
              armyIds:selectedArmyIds,groupId:null,
            })}>{label('選択軍の所属解除','Unassign armies')}</button>
        </div>
        <small data-testid="assignment-group-reason" aria-live="polite">
          {chosenGroup?reason(groupPlan):reason({...groupPlan,reason:'noTarget'})}</small>
      </fieldset>
    </div>
    <small className="muted">{label('定員は軍24師団、軍集団5軍。命令適用時にエンジンが再検証します。',
      'Capacity: 24 divisions per army, 5 armies per group. Engine revalidates every command.')}</small>
  </section>;
}
