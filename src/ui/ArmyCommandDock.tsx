import {useState} from 'react';
import type {UiSnapshot} from '../engine/ui';
import {ARMY_COLORS,MAX_ARMIES,MAX_GROUPS,MAX_ARMY_UNITS,MAX_GROUP_ARMIES} from '../engine/military/armies';
import {formationUnits,type FormationScope} from '../engine/military/formationOverview';
import type {FrontDeploymentMode} from '../engine/military/frontDeployment';
import {engineClient} from './engineClient';

type Props={
  snap:UiSnapshot;
  lang:'ja'|'en';
  selectedIds:readonly number[];
  pending:number;
  focus:FormationScope|null;
  onFocus:(value:FormationScope|null)=>void;
  onSelect:(ids:number[])=>void;
  onDrawFront:()=>void;
  onDrawObjective:(frontId:number)=>void;
};

/** Bottom command strip: orders, formation creation, selection and renaming.
 * Does not mutate state without a validated engine command.
 * Unit assignment and the new formation are atomic in the same command.
 */
export function ArmyCommandDock({
  snap,lang,selectedIds,pending,focus,onFocus,onSelect,onDrawFront,onDrawObjective,
}:Props){
  const ja=lang==='ja',label=(j:string,e:string)=>ja?j:e,country=snap.playerCountry;
  const armies=snap.armies.filter(a=>a.owner===country).sort((a,b)=>a.id-b.id);
  const groups=snap.armyGroups.filter(g=>g.owner===country).sort((a,b)=>a.id-b.id);
  const ownedUnits=snap.units.filter(u=>u.owner===country);
  const selected=ownedUnits.filter(u=>selectedIds.includes(u.id));
  const [edit,setEdit]=useState<FormationScope|null>(null);
  const [draftName,setDraftName]=useState('');
  const [deployFrontId,setDeployFrontId]=useState('');
  const [deployMode,setDeployMode]=useState<FrontDeploymentMode>('even');
  const fronts=snap.fronts.filter(f=>f.owner===country);
  const currentFront=fronts.find(f=>String(f.id)===deployFrontId)??fronts[0];
  const targetUnits=focus?formationUnits(snap,focus):selected;
  const deployable=targetUnits.length>0&&targetUnits.length<=256&&
    targetUnits.every(u=>!u.moving&&!u.inBattle&&!u.encircled&&!u.manualHold);
  const busy=pending!==0;
  const atWar=!!currentFront&&snap.countries[country].atWar.includes(currentFront.enemy);
  const heldUnits=targetUnits.filter(u=>u.manualHold);
  const activeName=edit?(edit.kind==='army'?armies:groups).find(f=>f.id===edit.id)?.name:null;
  const createArmy=()=>{
    if(busy||armies.length>=MAX_ARMIES)return;
    const ids=selected.length<=MAX_ARMY_UNITS?selected.map(u=>u.id):[];
    engineClient.command('createArmy',{
      color:ARMY_COLORS[armies.length%ARMY_COLORS.length],
      ...(ids.length?{unitIds:ids}:{}),
    });
  };
  const createGroup=()=>{
    if(busy||groups.length>=MAX_GROUPS)return;
    const army=focus?.kind==='army'?armies.find(a=>a.id===focus.id):null;
    engineClient.command('createArmyGroup',{
      color:ARMY_COLORS[groups.length%ARMY_COLORS.length],
      ...(army&&army.groupId===null?{armyIds:[army.id]}:{}),
    });
  };
  const beginRename=(scope:FormationScope,name:string)=>{
    setEdit(scope);setDraftName(name);
  };
  const rename=()=>{
    if(!edit||busy||!draftName.trim()||draftName.trim()===activeName)return;
    engineClient.command('renameFormation',{kind:edit.kind,id:edit.id,name:draftName.trim()});
    setEdit(null);setDraftName('');
  };
  const choose=(scope:FormationScope)=>{
    onFocus(scope);
    onSelect(formationUnits(snap,scope).map(u=>u.id));
  };
  return <section className="army-command-dock" data-testid="army-command-dock" aria-label={label('軍団・軍集団コマンド','Army and army group commands')}>
    <div className="army-dock-heading">
      <strong>{label('陸軍指揮','Army Command')}</strong>
      <span className="muted">{label('選択師団','Selected')}: {selected.length} · {label('軍団','Armies')}: {armies.length} · {label('軍集団','Groups')}: {groups.length}</span>
    </div>
    <div className="army-dock-roster">
      {groups.map(g=>{
        const scope={kind:'group' as const,id:g.id};
        const isCurrent=focus?.kind==='group'&&focus.id===g.id;
        return <div key={'g'+g.id} className={'army-dock-card'+(isCurrent?' active':'')} style={{borderColor:g.color}}>
          <button data-testid={'dock-group-'+g.id} aria-pressed={isCurrent} onClick={()=>choose(scope)}>
            <span className="army-dock-symbol">◆</span> {g.name}
            <small>{armies.filter(a=>a.groupId===g.id).length}/{MAX_GROUP_ARMIES} {label('軍団','armies')}</small>
          </button>
          <button className="army-dock-rename" data-testid={'dock-rename-group-'+g.id}
            aria-label={label('軍集団名を変更','Rename army group')+' '+g.name}
            disabled={busy} onClick={()=>beginRename(scope,g.name)}>✎</button>
        </div>;
      })}
      {armies.map(a=>{
        const scope={kind:'army' as const,id:a.id};
        const isCurrent=focus?.kind==='army'&&focus.id===a.id;
        return <div key={'a'+a.id} className={'army-dock-card'+(isCurrent?' active':'')} style={{borderColor:a.color}}>
          <button data-testid={'dock-army-'+a.id} aria-pressed={isCurrent} onClick={()=>choose(scope)}>
            <span className="army-dock-symbol">★</span> {a.name}
            <small>{ownedUnits.filter(u=>u.armyId===a.id).length}/{MAX_ARMY_UNITS} {label('師団','divisions')}</small>
          </button>
          <button className="army-dock-rename" data-testid={'dock-rename-army-'+a.id}
            aria-label={label('軍団名を変更','Rename army')+' '+a.name}
            disabled={busy} onClick={()=>beginRename(scope,a.name)}>✎</button>
        </div>;
      })}
      <button className="army-dock-create" data-testid="dock-create-army"
        disabled={busy||armies.length>=MAX_ARMIES}
        onClick={createArmy}>+ {label('軍団','Army')}<small>{selected.length>0&&selected.length<=MAX_ARMY_UNITS
          ?label('選択師団を同時編入','Assign selected'):label('空の軍団を作成','Empty army')}</small></button>
      <button className="army-dock-create" data-testid="dock-create-group"
        disabled={busy||groups.length>=MAX_GROUPS}
        onClick={createGroup}>+ {label('軍集団','Army group')}<small>{focus?.kind==='army'
          ?label('選択軍団を同時編入（未所属時）','Include focused army if ungrouped')
          :label('空の軍集団を作成','Empty group')}</small></button>
    </div>
    {edit&&<div className="army-dock-editor" data-testid="dock-rename-editor">
      <label>{label('新しい編成名','New formation name')}
        <input data-testid="dock-rename-input" autoFocus maxLength={64} value={draftName}
          onChange={e=>setDraftName(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')rename();if(e.key==='Escape')setEdit(null);}}/>
      </label>
      <button data-testid="dock-rename-save" disabled={busy||!draftName.trim()||draftName.trim()===activeName} onClick={rename}>{label('保存','Save')}</button>
      <button data-testid="dock-rename-cancel" onClick={()=>setEdit(null)}>{label('取消','Cancel')}</button>
    </div>}
    <div className="army-dock-orders">
      <button data-testid="dock-draw-front" disabled={busy} onClick={onDrawFront}>{label('地図で戦線指定','Draw frontline')}</button>
      <select data-testid="dock-front" aria-label={label('作戦戦線','Battle plan')}
        disabled={!fronts.length} value={currentFront?.id??''} onChange={e=>setDeployFrontId(e.target.value)}>
        {!fronts.length&&<option value="">{label('戦線なし','No front')}</option>}
        {fronts.map(f=><option key={f.id} value={f.id}>#{f.id} · {ja?snap.countries[f.enemy]?.nameJa:snap.countries[f.enemy]?.nameEn}</option>)}
      </select>
      <select data-testid="dock-deploy-mode" aria-label={label('自動配置方式','Deployment strategy')}
        value={deployMode} onChange={e=>setDeployMode(e.target.value as FrontDeploymentMode)}>
        <option value="even">{label('均等配置','Even')}</option>
        <option value="strategic">{label('戦略配置','Strategic')}</option>
        <option value="nearest">{label('最寄り配置','Nearest')}</option>
      </select>
      <button data-testid="dock-deploy-front" disabled={busy||!currentFront||!deployable}
        onClick={()=>currentFront&&engineClient.command('deployToFront',{
          frontId:currentFront.id,expectedRevision:currentFront.revision,
          units:targetUnits.map(u=>u.id),strategy:deployMode,
        })}>{label('自動で戦線へ配置','Auto-deploy')}</button>
      <button data-testid="dock-offensive-direction" disabled={busy||!currentFront}
        onClick={()=>currentFront&&onDrawObjective(currentFront.id)}>
        {label('地図で進軍方向指定','Draw offensive direction')}
      </button>
      <button data-testid="dock-start-offensive" disabled={busy||!currentFront||!atWar||currentFront.paused}
        onClick={()=>currentFront&&engineClient.command('setFrontStance',{
          frontId:currentFront.id,stance:'attack',cap:Math.max(1,currentFront.cap),
        })}>{label('攻勢開始','Start offensive')}</button>
      <button data-testid="dock-toggle-front-pause" disabled={busy||!currentFront||(currentFront.paused&&!atWar)}
        onClick={()=>currentFront&&engineClient.command('setFrontPaused',{
          frontId:currentFront.id,paused:!currentFront.paused,
        })}>{currentFront?.paused?label('戦線を再開','Resume front'):label('戦線を停止','Pause front')}</button>
      <button data-testid="dock-defend-front" disabled={busy||!currentFront}
        onClick={()=>currentFront&&engineClient.command('setFrontStance',{
          frontId:currentFront.id,stance:'hold',cap:0,
        })}>{label('戦線を防衛','Defend frontline')}</button>
      <button data-testid="dock-release-hold" disabled={busy||!heldUnits.length}
        onClick={()=>heldUnits.length&&engineClient.command('setManualHold',{
          units:heldUnits.map(u=>u.id),hold:false,
        })}>{label('選択師団の手動固定解除','Release manual holds')} ({heldUnits.length})</button>
      <small className="muted">{targetUnits.some(u=>u.manualHold)
        ?label('手動固定の師団は自動配置できません。手動固定解除後、改めて自動配置してください。','Release manual holds, then deploy again.')
        :currentFront?.paused
          ?label('停止中は攻勢を実行しません。開戦後に戦線を再開してください。','A paused front does not attack. Resume it after war starts.')
          :label('進軍方向を地図で指定してから攻勢開始。敵支配州に向けて戦線AIが毎週命令します。','Draw an offensive destination, then start the offensive. Front AI issues orders weekly.')}</small>
    </div>
  </section>;
}
