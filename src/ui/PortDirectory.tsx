import type {UiMeta,UiSnapshot} from '../engine/ui';

interface Props {
  meta:UiMeta;
  snap:UiSnapshot;
  lang:'ja'|'en';
  selectedProvince:number|null;
  onSelect:(province:number)=>void;
}

/** Read-only metadata view: port capacity is catalog capacity, not the
 * currently available shipping or supply throughput. */
export function PortDirectory({meta,snap,lang,selectedProvince,onSelect}:Props){
  const maritime=meta.maritime;
  if(!maritime)return null;
  const ja=lang==='ja';
  const label=(j:string,e:string)=>ja?j:e;
  const zones=new Map(maritime.seaZones.map(z=>[z.id,z]));
  return <details className="port-directory panel-section" data-testid="port-directory">
    <summary>{label('港湾・海域','Ports and sea zones')} ({maritime.ports.length})</summary>
    <p className="muted">{label('港湾容量はシナリオ設定値です。船団・海上補給・強襲上陸は未実装です。',
      'Capacity is scenario metadata. Convoys, naval supply and invasions are not implemented.')}</p>
    {maritime.ports.length===0&&<div className="muted">{label('このシナリオに港の登録はありません','No ports in this scenario')}</div>}
    <div className="port-directory-entries">
      {maritime.ports.map(p=>{
        const zone=zones.get(p.zoneId);
        const ctrl=snap.controller[p.province];
        const country=ctrl>=0?snap.countries[ctrl]:undefined;
        const selected=selectedProvince===p.province;
        return <button type="button" key={p.id} data-testid={'port-directory-'+p.id}
          aria-pressed={selected} className={'port-directory-entry'+(selected?' selected':'')}
          onClick={()=>onSelect(p.province)}>
          <strong>⚓ {ja?meta.provNameJa[p.province]:meta.provNameEn[p.province]}</strong>
          <span>{label('管理','Controller')}: {country?(ja?country.nameJa:country.nameEn):label('無所属','Uncontrolled')}</span>
          <span>{label('海域','Sea zone')}: {zone?(ja?zone.nameJa:zone.nameEn):p.zoneId}</span>
          <span>{label('容量','Capacity')}: {p.capacity} · {label('修理','Repair')}: {p.repairSlots} · {label('造船','Dockyard')}: {p.dockyardSlots}</span>
        </button>;
      })}
    </div>
    {meta.navalModels&&<details data-testid="naval-model-directory" className="naval-model-directory">
      <summary>{label('艦種モデル（建造未実装）','Naval models (construction unavailable)')} ({meta.navalModels.length})</summary>
      <p className="muted">{label('以下はゲーム内の抽象的な仮パラメータです。造船・艦隊編成・航行・上陸はまだ操作できません。',
        'These are abstract game parameters. Construction, fleet formation, navigation and landings are not yet available.')}</p>
      {meta.navalModels.map(model=><div key={model.id} data-testid={'naval-model-'+model.id}
        className="naval-model-entry">
        <b>{ja?model.nameJa:model.nameEn}</b>
        <span>{label('役割','Role')}: {model.role} · {label('輸送枠','Cargo slots')}: {model.transportCapacity}</span>
        <span>{label('護衛','Escort')}: {model.escortPower} · {label('戦闘','Combat')}: {model.navalPower}</span>
        <span>{label('産業コスト','Industry cost')}: {model.industryCost} · {label('乗員','Crew')}: {model.crew} · {label('建造日数','Build days')}: {model.buildDays}</span>
      </div>)}
    </details>}
  </details>;
}
