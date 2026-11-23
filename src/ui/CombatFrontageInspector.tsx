import type {UiSnapshot,UiUnit} from '../engine/ui';

type Lang='ja'|'en';

interface Props {
  snap:UiSnapshot;
  selected:readonly UiUnit[];
  lang:Lang;
}

/** Current-state forecast for an existing engagement; otherwise a selected-units
 * planning estimate. Never advertises hypothetical units as deployed reserves.
 */
export function CombatFrontageInspector({snap,selected,lang}:Props) {
  if(!selected.length)return null;
  const ja=lang==='ja';
  const label=(j:string,e:string)=>ja?j:e;
  const byProvince=new Map<number,UiUnit[]>();
  for(const unit of selected){
    const group=byProvince.get(unit.loc)??[];
    group.push(unit);byProvince.set(unit.loc,group);
  }
  const provinces=[...byProvince].sort(([a],[b])=>a-b);
  const frontByProvince=new Map((snap.combatFronts??[]).map(f=>[f.province,f]));
  return <section className="panel-section" data-testid="combat-frontage-inspector" aria-live="polite">
    <h5>{label('戦闘幅・前線参加状況','Combat frontage & reserves')}</h5>
    <small className="muted">
      {label('実際の交戦がある州は現在の部隊配置から次回の戦闘参加を予測します。非交戦州は選択師団のみの見積りです。',
        'Active engagements show a forecast from the current deployment. Otherwise, only selected divisions are counted.')}
    </small>
    {provinces.map(([province,units])=>{
      const front=frontByProvince.get(province);
      const terrainCapacity=units[0].frontageCapacity;
      const selectionWidth=units.filter(u=>!u.moving).reduce((sum,u)=>sum+u.combatWidth,0);
      const defender=front&&snap.controller[province]===snap.playerCountry;
      const own=front?(defender?front.defenders:front.attackers):null;
      const active=new Set(own?.engagedIds??[]);
      const reserves=new Set(own?.reserveIds??[]);
      const penalties=new Map(own?.widthPenalties.map(x=>[x.unitId,x.factor])??[]);
      return <div className="panel-section" key={province} data-testid={'combat-frontage-province-'+province}>
        <div className="kv"><b>{label('州','Province')} #{province}</b><span>
          {front?label('交戦中の前線予測','Battle frontage forecast'):label('選択師団の事前見積り','Selected-only estimate')}
        </span></div>
        <div className="kv" data-testid={'combat-frontage-width-'+province}>
          <span>{label('戦闘幅','Combat width')}</span>
          <strong>{front?(own?.selectedWidth??0):selectionWidth}
            {' / '}{front?.capacity??terrainCapacity??label('不明','Unknown')}</strong>
        </div>
        {front&&own?<div className="kv" data-testid={'combat-frontage-summary-'+province}>
          <span>{label('前線 / 予備（選択部隊）','Frontline / reserve (selected)')}</span>
          <span>{units.filter(u=>active.has(u.id)).length} / {units.filter(u=>reserves.has(u.id)).length}</span>
        </div>:<small className="muted" data-testid={'combat-frontage-estimate-'+province}>
          {selectionWidth>(terrainCapacity??Infinity)
            ?label('選択師団の合計幅が地形上限を超過しています。実戦では予備が発生します。',
              'Selected width exceeds the terrain limit; some divisions may be held in reserve.')
            :label('非交戦中の見積りです。他部隊の幅は含まれません。',
              'Planning estimate only; other divisions are not included.')}
        </small>}
        {units.slice().sort((a,b)=>a.id-b.id).map(u=>{
          const state=u.moving?label('移動中','Moving'):
            !front?label('未交戦','Not engaged'):
            active.has(u.id)?label('前線','Engaged'):
            reserves.has(u.id)?label('予備','Reserve'):label('対象外','Not eligible');
          const factor=penalties.get(u.id);
          return <div className="kv" key={u.id} data-testid={'combat-frontage-unit-'+u.id}>
            <span>#{u.id} · {label('幅','Width')} {u.combatWidth}</span>
            <span>{state}{factor!==undefined&&factor<1?(' · ×'+factor.toFixed(2)):''}</span>
          </div>;
        })}
      </div>;
    })}
  </section>;
}
