// Geographic order-of-battle explorer: no mutation of simulation state.
import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { Army, ArmyGroup } from '../engine/military/armies';
import type { UiSnapshot, UiMeta, UiUnit } from '../engine/ui';
import { divisionTemplate } from '../engine/military/templates';
import type {FormationScope} from '../engine/military/formationOverview';

export interface ArmyBranch { army: Army; units: UiUnit[] }
export interface GroupBranch { group: ArmyGroup; armies: ArmyBranch[] }
export interface OrderOfBattle { groups: GroupBranch[]; independent: ArmyBranch[]; unassigned: UiUnit[] }

/** Each owned unit appears exactly once, ordered by stable IDs even after a save/load. */
export function buildOrderOfBattle(
  units: readonly UiUnit[], armies: readonly Army[], groups: readonly ArmyGroup[], country: number,
): OrderOfBattle {
  const ownedUnits = units.filter(u => u.owner === country).slice().sort((a,b)=>a.id-b.id);
  const ownArmies = armies.filter(a => a.owner === country).slice().sort((a,b)=>a.id-b.id);
  const ownGroups = groups.filter(g => g.owner === country).slice().sort((a,b)=>a.id-b.id);
  const byArmy = new Map<number,UiUnit[]>();
  const known = new Set(ownArmies.map(a=>a.id));
  const unassigned: UiUnit[]=[];
  for (const u of ownedUnits) {
    if (u.armyId === null || !known.has(u.armyId)) { unassigned.push(u); continue; }
    const current=byArmy.get(u.armyId)??[];
    current.push(u); byArmy.set(u.armyId,current);
  }
  const toBranch=(a:Army)=>({army:a,units:byArmy.get(a.id)??[]});
  const groupIds=new Set(ownGroups.map(g=>g.id));
  return {
    groups:ownGroups.map(group=>({group,armies:ownArmies.filter(a=>a.groupId===group.id).map(toBranch)})),
    independent:ownArmies.filter(a=>a.groupId===null || !groupIds.has(a.groupId)).map(toBranch),
    unassigned,
  };
}

export function unitRequiresAttention(u:UiUnit):boolean {
  return u.encircled || u.inBattle || u.supply<0.5 ||
    u.manpower<u.maxManpower || u.infEquipment<u.maxInfEquipment ||
    u.artEquipment<u.maxArtEquipment;
}

export function OrderOfBattleExplorer({snap,meta,lang,selectedIds,onSelect,onFocus}:{
  snap:UiSnapshot;meta:UiMeta;lang:'ja'|'en';selectedIds:number[];onSelect:(ids:number[])=>void;
  onFocus?:(focus:FormationScope|null)=>void;
}) {
  const ja=lang==='ja';
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState<'all'|'attention'|'moving'|'selected'>('all');
  const [rangeAnchor,setRangeAnchor]=useState<number|null>(null);
  const ownUnits=snap.units.filter(u=>u.owner===snap.playerCountry);
  const ownArmies=snap.armies.filter(a=>a.owner===snap.playerCountry);
  const ownGroups=snap.armyGroups.filter(g=>g.owner===snap.playerCountry);
  const filter=query.trim().toLocaleLowerCase();
  const selectedSet=new Set(selectedIds);
  const armyById=new Map(ownArmies.map(a=>[a.id,a]));
  const groupById=new Map(ownGroups.map(g=>[g.id,g]));
  const matches=(u:UiUnit)=>{
    if(status==='attention'&&!unitRequiresAttention(u))return false;
    if(status==='moving'&&!u.moving)return false;
    if(status==='selected'&&!selectedSet.has(u.id))return false;
    if(!filter)return true;
    const army=armyById.get(u.armyId??-1);
    const group=groupById.get(army?.groupId??-1);
    const text=[u.id,meta.provIds[u.loc],meta.provNameJa[u.loc],meta.provNameEn[u.loc],
      army?.name,group?.name].filter(v=>v!==undefined).join(' ').toLocaleLowerCase();
    return text.includes(filter);
  };
  const visible=ownUnits.filter(matches);
  const tree=buildOrderOfBattle(visible,ownArmies,ownGroups,snap.playerCountry);
  const showEmpty=!filter&&status==='all';
  const selectIds=(units:readonly UiUnit[])=>{if(units.length>0 && units.length<=256){onSelect(units.map(u=>u.id));setRangeAnchor(null);}};
  const statusFor=(units:readonly UiUnit[])=>units.filter(unitRequiresAttention).length;
  const location=(u:UiUnit)=>ja?meta.provNameJa[u.loc]:meta.provNameEn[u.loc];
  const template=(u:UiUnit)=>{
    if(u.customTemplateId!==undefined){
      return snap.customTemplates.find(t=>t.country===u.owner&&t.templateId===u.customTemplateId&&t.revision===u.customRevision)?.name??(ja?'自由編成':'Custom');
    }
    const t=divisionTemplate(u.templateId??'standard-v1');
    return ja?t?.nameJa??'師団':t?.nameEn??'Division';
  };
  const choose=(u:UiUnit,e:MouseEvent)=>{
    const additive=e.metaKey||e.ctrlKey;
    const anchorIndex=rangeAnchor===null?-1:visible.findIndex(v=>v.id===rangeAnchor);
    const currentIndex=visible.findIndex(v=>v.id===u.id);
    let next:number[];
    if(e.shiftKey&&anchorIndex>=0&&currentIndex>=0){
      const ids=visible.slice(Math.min(anchorIndex,currentIndex),Math.max(anchorIndex,currentIndex)+1).map(v=>v.id);
      next=[...new Set([...selectedIds,...ids])];
    }else if(additive){
      next=selectedSet.has(u.id)?selectedIds.filter(id=>id!==u.id):[...selectedIds,u.id];
    }else next=[u.id];
    if(next.length<=256){
      onSelect(next);onFocus?.(u.armyId!==null?{kind:'army',id:u.armyId}:null);
      if(!e.shiftKey||anchorIndex<0)setRangeAnchor(u.id);
    }
  };
  const renderUnits=(units:readonly UiUnit[])=><div className="oob-unit-list">
    {units.map(u=><button key={u.id} type="button" data-testid={'oob-unit-'+u.id}
      className={'oob-unit'+(unitRequiresAttention(u)?' alert':'')} aria-pressed={selectedSet.has(u.id)}
      onClick={e=>choose(u,e)}
      title={ja?'クリックで単一選択、Ctrlで追加・解除、Shiftで範囲選択':'Click: one, Ctrl: toggle, Shift: select range'}>
      <span className="oob-unit-heading"><b>#{u.id} · {template(u)}</b>
        {u.inBattle&&<span>{ja?'交戦':'Battle'}</span>}
        {u.encircled&&<span>{ja?'包囲':'Encircled'}</span>}
        {u.moving&&<span>{ja?'移動':'Moving'}</span>}
      </span>
      <span className="oob-unit-location">{location(u)} · {meta.provIds[u.loc]}</span>
      <span className="oob-unit-bars">
        <span title={ja?'補給':'Supply'}><i style={{width:Math.max(0,Math.min(100,u.supply*100))+'%'}}/></span>
        <span title={ja?'組織率':'Organization'}><i style={{width:Math.max(0,Math.min(100,(u.orgCap>0?u.org/u.orgCap:0)*100))+'%'}}/></span>
      </span>
    </button>)}
    {!units.length&&<span className="muted">{ja?'該当師団なし':'No matching divisions'}</span>}
  </div>;
  const renderArmy=(branch:ArmyBranch)=><details key={branch.army.id} className="oob-army" data-testid={'oob-army-'+branch.army.id}
    open={selectedIds.some(id=>branch.units.some(u=>u.id===id))||undefined}>
    <summary><span className="oob-color" style={{background:branch.army.color}}/>
      <b>{branch.army.name}</b><small>{branch.units.length} {ja?'師団':'divisions'}</small>
      {statusFor(branch.units)>0&&<small className="oob-warning">!{statusFor(branch.units)}</small>}
    </summary>
    <div className="oob-subtree">
      <button type="button" className="oob-select" data-testid={'oob-select-army-'+branch.army.id}
        disabled={!branch.units.length||branch.units.length>256} onClick={()=>{selectIds(branch.units);onFocus?.({kind:'army',id:branch.army.id});}}>
        {ja?'軍団全体を選択':'Select army'} ({branch.units.length})
      </button>
      {renderUnits(branch.units)}
    </div>
  </details>;
  return <section className="oob-explorer" data-testid="order-of-battle">
    <header className="oob-header"><strong>{ja?'指揮系統':'Order of Battle'}</strong>
      <span data-testid="oob-visible-count">{visible.length} / {ownUnits.length}</span>
    </header>
    <div className="oob-filters">
      <input data-testid="oob-search" aria-label={ja?'指揮系統を検索':'Search order of battle'}
        value={query} onChange={e=>setQuery(e.target.value)}
        placeholder={ja?'師団・州・軍団名':'Division, province, army'}/>
      <select data-testid="oob-status" aria-label={ja?'指揮系統フィルター':'Order of battle filter'}
        value={status} onChange={e=>setStatus(e.target.value as typeof status)}>
        <option value="all">{ja?'すべて':'All'}</option>
        <option value="attention">{ja?'補給・装備不足・戦闘中':'Attention needed'}</option>
        <option value="moving">{ja?'移動中':'Moving'}</option>
        <option value="selected">{ja?'選択中':'Selected'}</option>
      </select>
    </div>
    <div className="oob-selection-actions" data-testid="oob-selection-actions">
      <button type="button" data-testid="oob-select-visible" disabled={!visible.length||visible.length>256}
        onClick={()=>{selectIds(visible);onFocus?.(null);}}>{
        ja?'表示中の師団をすべて選択':'Select all visible'} ({visible.length})</button>
      <button type="button" data-testid="oob-add-visible"
        disabled={!visible.length||new Set([...selectedIds,...visible.map(u=>u.id)]).size>256}
        onClick={()=>{const ids=[...new Set([...selectedIds,...visible.map(u=>u.id)])];onSelect(ids);setRangeAnchor(null);}}>{
        ja?'表示中を選択に追加':'Add visible to selection'}</button>
      <button type="button" data-testid="oob-clear-selection" disabled={!selectedIds.length}
        onClick={()=>{onSelect([]);setRangeAnchor(null);onFocus?.(null);}}>{
        ja?'選択解除':'Clear selection'}</button>
      <small data-testid="oob-selected-count">{ja?'選択中':'Selected'}: {selectedIds.length}/256</small>
    </div>
    <small className="muted">{ja?'軍集団 → 軍 → 師団。Ctrlで追加・解除、Shiftで表示中の範囲を追加選択。選択した師団へ地図が移動します。':'Army group → army → division. Ctrl toggles, Shift selects a visible range. Selection focuses the map.'}</small>
    <div className="oob-tree">
      {tree.groups.filter(b=>showEmpty||b.armies.some(a=>a.units.length)).map(({group,armies})=>{
        const units=armies.flatMap(a=>a.units);
        return <details key={group.id} className="oob-group" data-testid={'oob-group-'+group.id}
          open={selectedIds.some(id=>units.some(u=>u.id===id))||undefined}>
          <summary><span className="oob-color" style={{background:group.color}}/><b>{group.name}</b>
            <small>{armies.length} {ja?'軍団':'armies'} · {units.length} {ja?'師団':'units'}</small>
          </summary>
          <div className="oob-subtree">
            <button type="button" className="oob-select" data-testid={'oob-select-group-'+group.id}
              disabled={!units.length||units.length>256} onClick={()=>{selectIds(units);onFocus?.({kind:'group',id:group.id});}}>
              {ja?'軍集団全体を選択':'Select group'} ({units.length})
            </button>
            {armies.filter(a=>showEmpty||a.units.length).map(renderArmy)}
          </div>
        </details>;
      })}
      {tree.independent.filter(a=>showEmpty||a.units.length).map(renderArmy)}
      {(tree.unassigned.length>0||showEmpty)&&<details className="oob-group" data-testid="oob-unassigned"
        open={selectedIds.some(id=>tree.unassigned.some(u=>u.id===id))||(!ownArmies.length?true:undefined)}>
        <summary><span className="oob-color"/><b>{ja?'未編入の師団':'Unassigned divisions'}</b>
          <small>{tree.unassigned.length} {ja?'師団':'divisions'}</small>
        </summary>
        <div className="oob-subtree">
          <button type="button" className="oob-select" data-testid="oob-select-unassigned"
            disabled={!tree.unassigned.length||tree.unassigned.length>256} onClick={()=>{selectIds(tree.unassigned);onFocus?.(null);}}>
            {ja?'未編入師団を選択':'Select unassigned'} ({tree.unassigned.length})
          </button>
          {renderUnits(tree.unassigned)}
        </div>
      </details>}
      {!visible.length&&!showEmpty&&<p className="muted">{ja?'条件に一致する師団がありません':'No divisions match the filter'}</p>}
    </div>
  </section>;
}
