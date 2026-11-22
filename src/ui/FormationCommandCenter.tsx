import {useState} from 'react';
import type {UiSnapshot} from '../engine/ui';
import type {FormationScope} from '../engine/military/formationOverview';
import {formationUnits,formationOperationalSummary} from '../engine/military/formationOverview';
import {engineClient} from './engineClient';

type Lang='ja'|'en';
type Props={snap:UiSnapshot;lang:Lang;focus:FormationScope|null;pending:number;
  onSelect:(ids:number[])=>void};
export function FormationCommandCenter({snap,lang,focus,pending,onSelect}:Props){
  const [chosenFront,setChosenFront]=useState('');
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
  const frontOptions=snap.fronts.filter(f=>f.owner===country&&player.atWar.includes(f.enemy));
  const front=frontOptions.find(f=>String(f.id)===chosenFront);
  const enabled=!!formation&&units.length>0&&units.length<=256&&pending===0;
  const ids=units.map(u=>u.id);
  const send=(type:string,p:Record<string,unknown>)=>{if(enabled)engineClient.command(type,p);};
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
        <div><small>{label('手動固定','Manual hold')}</small><b data-testid="formation-manual-hold">{summary.manualHold}</b></div>
      </div>
      <div className="formation-command-center-deficits" data-testid="formation-equipment-deficit">
        <small>{label('不足','Missing')} — {label('人員','Manpower')}: {fmt(Math.max(0,summary.maxManpower-summary.manpower))} ·
        {label('歩兵装備','Infantry')}: {fmt(Math.max(0,summary.maxInfantry-summary.infantry))} ·
        {label('火砲','Artillery')}: {fmt(Math.max(0,summary.maxArtillery-summary.artillery))}</small>
      </div>
      <div className="formation-command-center-actions">
        <button data-testid="formation-select-all" disabled={!units.length||units.length>256}
          onClick={()=>onSelect(ids)}>{label('全師団を選択・地図で確認','Select all and locate')}</button>
        <button data-testid="formation-manual-hold" disabled={!enabled||summary.manualHold===summary.count}
          onClick={()=>send('setManualHold',{units:ids,hold:true})}>{label('自動作戦を保留','Hold automated orders')}</button>
        <button data-testid="formation-resume" disabled={!enabled||summary.manualHold===0}
          onClick={()=>send('setManualHold',{units:ids,hold:false})}>{label('自動作戦を再開','Resume automated orders')}</button>
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
        <button data-testid="formation-assign-front" disabled={!enabled||!front}
          onClick={()=>front&&send('assignToFront',{units:ids,frontId:front.id})}>
          {label('全師団を戦線へ割当','Assign all to front')}
        </button>
        <button data-testid="formation-unassign-front" disabled={!enabled||summary.frontAssigned===0}
          onClick={()=>send('unassignFromFront',{units:ids})}>
          {label('戦線割当を解除','Remove from fronts')}
        </button>
      </div>
      {!frontOptions.length&&<small className="muted" data-testid="formation-no-fronts">
        {label('戦争中の戦線がありません。戦線画面で先に作成してください。','No active wartime fronts. Create one in the fronts panel.')}
      </small>}
      <small className="muted">{label(
        '作戦の実行・移動は師団の手動命令と競合しないよう既存の戦線AIに委ねます。実行時にも所有権・戦線状態を検証します。',
        'Movement stays with the existing front system and manual orders take precedence. All commands are revalidated on execution.'
      )}</small>
    </>}
  </section>;
}
