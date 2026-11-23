import {useState} from 'react';
import type {UiSnapshot} from '../engine/ui';
import type {FormationScope,FormationTargetScope} from '../engine/military/formationOverview';
import {formationUnits,formationOperationalSummary,scopedFormationUnits,formationOperationPreview} from '../engine/military/formationOverview';
import {engineClient} from './engineClient';

type Lang='ja'|'en';
type Props={snap:UiSnapshot;lang:Lang;focus:FormationScope|null;pending:number;
  selectedIds:number[];onSelect:(ids:number[])=>void};

export function FormationCommandCenter({snap,lang,focus,pending,selectedIds,onSelect}:Props){
  const [chosenFront,setChosenFront]=useState('');
  const [targetScope,setTargetScope]=useState<FormationTargetScope>('all');
  const [acknowledgedSignature,setAcknowledgedSignature]=useState<string|null>(null);
  const ja=lang==='ja';
  const label=(j:string,e:string)=>ja?j:e;
  const fmt=(n:number)=>n.toLocaleString(ja?'ja-JP':'en-US',{maximumFractionDigits:1});
  const country=snap.playerCountry,player=snap.countries[country];
  const formation=focus?(focus.kind==='group'
    ?snap.armyGroups.find(g=>g.id===focus.id&&g.owner===country)
    :snap.armies.find(a=>a.id===focus.id&&a.owner===country)):undefined;
  const units=formation&&focus?formationUnits(snap,focus):[];
  const summary=formationOperationalSummary(units);
  const commander=formation?.commanderId===undefined?undefined:
    snap.commanders.find(c=>c.id===formation.commanderId&&c.country===country);
  const frontOptions=snap.fronts.filter(f=>f.owner===country&&snap.countries[f.enemy]?.alive);
  const front=frontOptions.find(f=>String(f.id)===chosenFront);
  const scoped=scopedFormationUnits(units,targetScope,selectedIds);
  const ids=scoped.map(u=>u.id);
  const enabled=!!formation&&scoped.length>0&&scoped.length<=256&&pending===0;
  const hold=formationOperationPreview(scoped,'hold');
  const resume=formationOperationPreview(scoped,'resume');
  const assign=formationOperationPreview(scoped,'assignFront',front?.id);
  const unassign=formationOperationPreview(scoped,'unassignFront');
  const releasingIds=front&&player.atWar.includes(front.enemy)?scoped.filter(u=>u.manualHold&&assign.ids.includes(u.id)).map(u=>u.id):[];
  const targetSignature=focus?.kind+':'+focus?.id+':'+chosenFront+':'+targetScope+
    ':'+assign.ids.join(',')+':'+releasingIds.join(',');
  // The acknowledgement is scoped to the exact division IDs and their hold state.
  const confirmedRelease=acknowledgedSignature===targetSignature;
  const send=(type:string,p:Record<string,unknown>,targetIds:readonly number[])=>{
    if(enabled&&targetIds.length>0&&targetIds.length<=256)engineClient.command(type,p);
  };
  return <section className="formation-command-center" data-testid="formation-command-center">
    <header className="formation-command-center-header">
      <b>{label('軍・軍集団の作戦指揮','Formation operations')}</b>
      <small>{label('指揮系統から軍または軍集団を選択','Select an army or group above')}</small>
    </header>
    {formation&&focus&&<>
      <div className="formation-command-center-title" data-testid="formation-focused-name">
        <span className="oob-color" style={{background:formation.color}}/>
        <strong>{formation.name}</strong>
        <small>{focus.kind==='group'?label('軍集団','Army group'):label('軍','Army')}</small>
      </div>
      <div className="formation-command-center-leader" data-testid="formation-focused-commander">
        {label('指揮官','Commander')}: {commander?(ja?commander.nameJa:commander.nameEn)+' · '+label('技能','Skill')+' '+commander.skill:label('未配置','Unassigned')}
        <small>{label('現段階では軍・軍集団指揮官の戦闘補正は未実装','Formation commander combat bonuses are not active yet')}</small>
      </div>
      <div className="formation-command-center-metrics" data-testid="formation-operational-summary">
        <div><small>{label('師団','Divisions')}</small><b data-testid="formation-count">{summary.count}</b></div>
        <div><small>{label('要注意','Attention')}</small><b data-testid="formation-attention">{summary.needsAttention}</b></div>
        <div><small>{label('平均補給','Average supply')}</small><b>{summary.supply===null?'—':fmt(summary.supply*100)+'%'}</b></div>
        <div><small>{label('平均組織率','Average organization')}</small><b>{summary.org===null?'—':fmt(summary.org)}</b></div>
        <div><small>{label('戦闘中','Battling')}</small><b>{summary.combat}</b></div>
        <div><small>{label('移動中','Moving')}</small><b>{summary.moving}</b></div>
        <div><small>{label('戦線配属','Assigned to front')}</small><b data-testid="formation-front-assigned">{summary.frontAssigned}</b></div>
        <div><small>{label('手動固定','Manual hold')}</small><b data-testid="formation-manual-hold-count">{summary.manualHold}</b></div>
      </div>
      <div className="formation-command-center-deficits" data-testid="formation-equipment-deficit">
        <small>{label('不足','Missing')} — {label('人員','Manpower')}: {fmt(Math.max(0,summary.maxManpower-summary.manpower))} ·
        {label('歩兵装備','Infantry')}: {fmt(Math.max(0,summary.maxInfantry-summary.infantry))} ·
        {label('火砲','Artillery')}: {fmt(Math.max(0,summary.maxArtillery-summary.artillery))}</small>
      </div>
      <div className="formation-command-target">
        <label htmlFor="formation-target-scope">{label('命令の対象','Order targets')}</label>
        <select id="formation-target-scope" data-testid="formation-target-scope"
          value={targetScope} onChange={e=>setTargetScope(e.target.value as FormationTargetScope)}>
          <option value="all">{label('所属する全師団','All divisions')}</option>
          <option value="attention">{label('要注意の師団のみ','Attention needed')}</option>
          <option value="withoutFront">{label('戦線未配属のみ','Without a front')}</option>
          <option value="selected">{label('地図・一覧で選択中のみ','Selected on map / roster')}</option>
        </select>
        <small data-testid="formation-target-count" aria-live="polite">
          {label('対象','Targeted')}: {scoped.length} / {units.length}
          {targetScope==='selected'&&label('（所属外の選択は除外）',' (outside formation excluded)')}
          {scoped.length>256&&label(' — 最大256師団',' — limit 256')}
        </small>
      </div>
      <div className="formation-command-center-actions">
        <button data-testid="formation-select-all" disabled={!scoped.length||scoped.length>256}
          onClick={()=>onSelect(ids)}>{label('対象を地図で選択','Select targets on map')} ({ids.length})</button>
        <button data-testid="formation-manual-hold" disabled={!enabled||!hold.ids.length}
          onClick={()=>send('setManualHold',{units:hold.ids,hold:true},hold.ids)}>{label('自動作戦を保留','Hold automated orders')} ({hold.ids.length})</button>
        <button data-testid="formation-resume" disabled={!enabled||!resume.ids.length}
          onClick={()=>send('setManualHold',{units:resume.ids,hold:false},resume.ids)}>{label('自動作戦を再開','Resume automated orders')} ({resume.ids.length})</button>
      </div>
      <div className="formation-command-center-actions">
        <select data-testid="formation-front-select" aria-label={label('割当先の戦線','Target front')}
          value={front?.id??''} onChange={e=>setChosenFront(e.target.value)}>
          <option value="">{label('戦線を選択','Choose a front')}</option>
          {frontOptions.map(f=><option key={f.id} value={f.id}>
            #{f.id} {ja?snap.countries[f.enemy].nameJa:snap.countries[f.enemy].nameEn} ·
            {f.stance==='attack'?label('攻勢','Attack'):f.stance==='retreat'?label('後退','Retreat'):label('防衛','Hold')}
          </option>)}
        </select>
        <button data-testid="formation-assign-front"
          disabled={!enabled||!front||!assign.ids.length||(releasingIds.length>0&&!confirmedRelease)}
          onClick={()=>front&&send('assignToFront',{units:assign.ids,frontId:front.id},assign.ids)}>
          {label('戦線へ割当・変更','Assign / change front')} ({assign.ids.length})
        </button>
        <button data-testid="formation-unassign-front" disabled={!enabled||!unassign.ids.length}
          onClick={()=>send('unassignFromFront',{units:unassign.ids},unassign.ids)}>
          {label('戦線割当を解除','Remove from fronts')} ({unassign.ids.length})
        </button>
      </div>
      <small className="formation-command-preview" data-testid="formation-command-preview" aria-live="polite">
        {label('実際に変更する師団','Divisions to change')} — {label('保留','Hold')}: {hold.ids.length} ·
        {label('再開','Resume')}: {resume.ids.length} ·
        {label('戦線割当','Assign front')}: {assign.ids.length} ·
        {label('戦線解除','Unassign front')}: {unassign.ids.length}
      </small>
      {front&&releasingIds.length>0&&<label className="formation-command-warning" data-testid="formation-release-warning">
        <input type="checkbox" data-testid="formation-confirm-release"
          checked={confirmedRelease} onChange={e=>setAcknowledgedSignature(e.target.checked?targetSignature:null)}/>
        {label(
          'この戦線割当で'+releasingIds.length+'師団の手動固定が解除され、自動作戦が再開します。確認して実行',
          'Assigning this front clears manual hold for '+assign.releasesManualHold+' divisions and resumes automated orders. Confirm to proceed'
        )}
      </label>}
      {!frontOptions.length&&<small className="muted" data-testid="formation-no-fronts">
        {label('戦争中の戦線がありません。戦線画面で先に作成してください。','No active wartime fronts. Create one in the fronts panel.')}
      </small>}
      <small className="muted">{label(
        '命令は変更が必要な師団だけに送信します。作戦の移動は既存の戦線AIに委ね、実行時にも所有権・戦線状態を検証します。',
        'Only changed divisions receive commands. The existing front AI handles movement, and ownership and war state are revalidated.'
      )}</small>
    </>}
  </section>;
}
