import {useState} from 'react';
import type {UiSnapshot} from '../engine/ui';
import {ARMY_COLORS,MAX_ARMIES,MAX_GROUPS,MAX_ARMY_UNITS,MAX_GROUP_ARMIES} from '../engine/military/armies';
import {formationUnits,canDeployFormation,type FormationScope} from '../engine/military/formationOverview';
import type {FrontDeploymentMode} from '../engine/military/frontDeployment';
import {engineClient} from './engineClient';
import {MAX_GARRISON_TARGETS,MAX_GARRISON_UNITS} from '../engine/military/garrisons';
import {controlledPortTargets,appendGarrisonPortTargets} from './garrisonPortTargets';
import {projectGarrisonCoverage} from './garrisonCoverage';
import type {GarrisonRouteDiagnosis,GarrisonRouteTarget} from '../engine/military/garrisonRouteDiagnostics';

type Props={
  snap:UiSnapshot;
  lang:'ja'|'en';
  selectedIds:readonly number[];
  selectedProvince:number|null;
  provinceNames:readonly string[];
  portProvinces:readonly number[];
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
  snap,lang,selectedIds,selectedProvince,provinceNames,portProvinces,pending,focus,onFocus,onSelect,onDrawFront,onDrawObjective,
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
  const [garrisonTargets,setGarrisonTargets]=useState<number[]>([]);
  const [garrisonProvince,setGarrisonProvince]=useState('');
  const [routeDiagnosis,setRouteDiagnosis]=useState<GarrisonRouteDiagnosis|null>(null);
  const [diagnosingOrder,setDiagnosingOrder]=useState<number|null>(null);
  const [diagnosisError,setDiagnosisError]=useState<string|null>(null);
  const fronts=snap.fronts.filter(f=>f.owner===country);
  const currentFront=fronts.find(f=>String(f.id)===deployFrontId)??fronts[0];
  const targetUnits=focus?formationUnits(snap,focus):selected;
  const deployable=canDeployFormation(snap,targetUnits,currentFront?.id);
  const busy=pending!==0;
  const ownGarrisons=snap.garrisons.filter(g=>g.owner===country);
  const garrisonAssigned=new Set(ownGarrisons.flatMap(g=>g.unitIds));
  const candidateGuardUnits=targetUnits.filter(u=>u.frontId<0&&!garrisonAssigned.has(u.id));
  const ownPorts=controlledPortTargets(portProvinces,snap.controller,country);
  const mergedPortTargets=appendGarrisonPortTargets(garrisonTargets,ownPorts);
  const newPortTargets=ownPorts.filter(p=>!garrisonTargets.includes(p));
  const staleGarrisonTargets=garrisonTargets.some(p=>snap.controller[p]!==country);
  const canCreateGarrison=!busy&&!staleGarrisonTargets&&garrisonTargets.length>0&&garrisonTargets.length<=MAX_GARRISON_TARGETS&&
    targetUnits.length>0&&targetUnits.length<=MAX_GARRISON_UNITS&&candidateGuardUnits.length===targetUnits.length;
  const selectedTarget=selectedProvince!==null&&snap.controller[selectedProvince]===country?selectedProvince:null;
  const dropdownTarget=garrisonProvince!==''?Number(garrisonProvince):null;
  const possibleTarget=dropdownTarget??selectedTarget;
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
  const addGarrisonTarget=()=>{
    if(possibleTarget===null||snap.controller[possibleTarget]!==country||garrisonTargets.includes(possibleTarget)||garrisonTargets.length>=MAX_GARRISON_TARGETS)return;
    setGarrisonTargets([...garrisonTargets,possibleTarget].sort((a,b)=>a-b));
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
    <details className="army-dock-garrison" data-testid="dock-garrison-panel">
      <summary data-testid="dock-garrison-toggle">{label('指定地点を防衛','Area defense')} ({ownGarrisons.length})</summary>
      <div className="army-dock-garrison-controls">
        <label>{label('防衛地点を指定','Guarded province')}
          <select data-testid="dock-garrison-province" value={garrisonProvince}
            onChange={e=>setGarrisonProvince(e.target.value)}>
            <option value="">{label('州を選択','Choose province')}</option>
            {snap.controller.map((owner,index)=>owner===country?<option key={index} value={index}>{provinceNames[index]}</option>:null)}
          </select>
        </label>
        <button data-testid="dock-garrison-add-province" disabled={busy||possibleTarget===null||
          snap.controller[possibleTarget]!==country||garrisonTargets.includes(possibleTarget)}
          onClick={addGarrisonTarget}>{label('防衛地点に追加','Add target')}</button>
        <button data-testid="dock-garrison-add-ports" disabled={busy||!newPortTargets.length||mergedPortTargets===null}
          onClick={()=>{if(!busy&&mergedPortTargets!==null)setGarrisonTargets(mergedPortTargets);}}>
          {label('自国港を一括追加','Add controlled ports')} ({newPortTargets.length})
        </button>
        <span data-testid="dock-garrison-targets">{garrisonTargets.map(p=>provinceNames[p]).join(' · ')||label('地点未指定','No targets')}</span>
        {garrisonTargets.length>targetUnits.length&&<small data-testid="dock-garrison-insufficient-units">
          {label('防衛地点が師団数を上回っています。現在の駐屯AIでは全地点を同時に守れません。追加の師団が必要です。',
            'More targets than divisions: the current garrison AI cannot defend every location simultaneously. Add divisions for full coverage.')}
        </small>}
        {staleGarrisonTargets&&<small data-testid="dock-garrison-stale-targets">
          {label('防衛予定地の支配権が変化しました。地点をクリアして再指定してください。',
            'Some draft targets are no longer controlled. Clear the draft and select controlled provinces again.')}
        </small>}
        <small data-testid="dock-garrison-port-hint">{label('実際に登録された港湾のみを追加します（自国支配港 '+ownPorts.length+'件）。港がない場合や64地点上限を超える場合は追加できません。',
          'Only catalogued ports controlled by you are included ('+ownPorts.length+'). No coastal substitutes; a draft exceeding 64 targets is rejected.')}</small>
        <button data-testid="dock-garrison-clear-targets" disabled={busy||!garrisonTargets.length}
          onClick={()=>setGarrisonTargets([])}>{label('地点クリア','Clear')}</button>
        <button data-testid="dock-garrison-create" disabled={!canCreateGarrison}
          onClick={()=>{
            if(!canCreateGarrison)return;
            engineClient.command('createGarrison',{
              provinces:garrisonTargets,unitIds:targetUnits.map(u=>u.id),
            });
            setGarrisonTargets([]);
          }}>{label('選択部隊で駐屯作戦を作成','Create area defense')} ({targetUnits.length})</button>
        <small className="muted">{label('地図で選択した州を優先して追加します。軍団・軍集団にフォーカス中はその所属師団、そうでなければ選択師団が対象です。戦線と駐屯の二重割当はできません。',
          'Map-selected province takes precedence. Uses focused formation or selected divisions. A division cannot serve a frontline and garrison simultaneously.')}</small>
      </div>
      {ownGarrisons.map(g=>{
        const coverage=projectGarrisonCoverage(g,snap);
        const diagnosis=routeDiagnosis?.orderId===g.id&&routeDiagnosis.revision===g.revision&&
          routeDiagnosis.tick===snap.tick?routeDiagnosis:null;
        const guarded=coverage.filter(p=>p.status==='guarded').length;
        const incoming=coverage.filter(p=>p.status==='incoming').length;
        const lost=coverage.filter(p=>p.status==='lost').length;
        return <div key={g.id} className="army-dock-garrison-order"
          data-testid={'dock-garrison-order-'+g.id}>
          <span><strong>#{g.id}</strong> {g.provinces.map(p=>provinceNames[p]).join(' · ')}</span>
          <span>{g.unitIds.length} {label('師団','divisions')} · {g.paused?label('停止中','Paused'):label('自動防衛中','Active')}</span>
          <button data-testid={'dock-garrison-select-'+g.id}
            onClick={()=>onSelect(g.unitIds)}>{label('師団選択','Select units')}</button>
          <button data-testid={'dock-garrison-pause-'+g.id} disabled={busy}
            onClick={()=>engineClient.command('setGarrisonPaused',{
              orderId:g.id,expectedRevision:g.revision,paused:!g.paused,
            })}>{g.paused?label('再開','Resume'):label('停止','Pause')}</button>
          <button data-testid={'dock-garrison-delete-'+g.id} disabled={busy}
            onClick={()=>engineClient.command('deleteGarrison',{
              orderId:g.id,expectedRevision:g.revision,
            })}>{label('解除','Remove')}</button>
          <button data-testid={'dock-garrison-diagnose-'+g.id}
            disabled={busy||diagnosingOrder!==null}
            onClick={()=>{
              setDiagnosisError(null);
              setRouteDiagnosis(null);
              setDiagnosingOrder(g.id);
              void engineClient.diagnoseGarrison(g.id)
                .then(result=>setRouteDiagnosis(result))
                .catch(error=>setDiagnosisError(String(error)))
                .finally(()=>setDiagnosingOrder(null));
            }}>
            {diagnosingOrder===g.id?label('診断中','Checking'):label('陸路を診断','Check land routes')}
          </button>
          <div className="army-dock-garrison-coverage" data-testid={'dock-garrison-coverage-'+g.id}>
            <small>{label('防衛中','Guarded')}: {guarded}/{coverage.length} ·
              {label('移動中','Incoming')}: {incoming} · {label('支配喪失','Lost')}: {lost}</small>
            {coverage.map(p=>{
              const status=p.status==='guarded'?label('防衛中','Guarded'):
                p.status==='incoming'?label('移動中','Incoming'):
                p.status==='lost'?label('支配喪失','Lost'):label('未防衛','Uncovered');
              const reason=p.gapReason==='paused'?label('作戦停止中','Order paused'):
                p.gapReason==='noUnits'?label('配属師団なし','No assigned divisions'):
                p.gapReason==='noAvailableUnits'?label('移動可能な師団なし','No available divisions'):
                p.gapReason==='awaitingOrders'?label('作戦・経路確認待ち','Awaiting orders / path check'):'';
              return <small key={p.province} data-testid={'dock-garrison-target-'+g.id+'-'+p.province}>
                {provinceNames[p.province]??'#'+p.province}: {status}
                {p.status==='guarded'?' ('+p.guardingUnitIds.length+')':''}
                {p.status==='incoming'?' ('+p.incomingUnitIds.length+')':''}
                {reason?' · '+reason:''}
              </small>;
            })}
            {diagnosis&&<div className="army-dock-garrison-diagnostics"
              data-testid={'dock-garrison-diagnostics-'+g.id}>
              <strong>{label('陸路診断結果','Land route diagnosis')} ·
                {label('経路検査','Path checks')}: {diagnosis.pathChecks}</strong>
              {diagnosis.targets.map((p:GarrisonRouteTarget)=>{
                const status=p.status==='guarded'?label('防衛中','Guarded'):
                  p.status==='incoming'?label('移動中','Incoming'):
                  p.status==='lost'?label('支配喪失','Lost'):
                  p.status==='paused'?label('作戦停止中','Order paused'):
                  p.status==='noEligibleUnits'?label('移動可能な師団なし','No eligible division'):
                  p.status==='routeAvailable'?label('陸路あり（同時配置は未確約）','Route exists (not a deployment guarantee)'):
                  p.status==='noLandPath'?label('現在の条件では陸路なし','No land route under current conditions'):
                  label('検査上限のため未確認','Not checked: diagnostic limit');
                const priority=p.priorityReason==='hostileBorder'?label('敵と接する州','Hostile border'):
                  p.priorityReason==='capital'?label('首都','Capital'):
                  p.priorityReason==='coastal'?label('沿岸','Coastal'):
                  label('インフラ・人口','Infrastructure / population');
                return <small key={p.province}
                  data-testid={'dock-garrison-route-'+g.id+'-'+p.province}>
                  {provinceNames[p.province]??'#'+p.province}: {status}
                  {p.priorityRank!==undefined?
                    ' · '+label('防衛優先','Defense priority')+' #'+p.priorityRank+' ('+priority+')':''}
                  {p.status==='routeAvailable'&&p.candidateUnitId!==undefined?
                    ' · '+label('候補師団','Candidate division')+' #'+p.candidateUnitId:''}
                </small>;
              })}
              {diagnosis.truncated&&<small>{label('診断上限に達したため、一部地点は未確認です。',
                'Route check limit reached; some targets were not checked.')}</small>}
              <small>{label('防衛優先度は敵接触・首都・沿岸・インフラ・人口の順です。沿岸は港とは限りません。',
                'Priority uses hostile contact, capital, coast, infrastructure and population; coastal does not necessarily mean a port.')}</small>
              <small>{label('この診断は移動命令を出しません。実際の作戦時は経路・状態を再検証します。',
                'Read-only check. Route legality and state are revalidated when issuing orders.')}</small>
            </div>}
            {diagnosisError&&<small data-testid="dock-garrison-diagnosis-error">
              {label('診断失敗','Diagnosis failed')}: {diagnosisError}
            </small>}
            <small className="muted">{label('現時点の師団位置と命令から判定。到達不能かどうかは陸路診断で確認できます。',
              'Coverage is based on current positions and orders. Use the land-route check for reachability.')}</small>
          </div>
        </div>;
      })}
    </details>
  </section>;
}
