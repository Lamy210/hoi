// パネル群 — 警告フィード／コンテキストパネル／セーブ・ロード／設定／AI判断ログ／外交（phase4）
import { OCCUPATION_DAYS } from '../engine/systems/combat';
import { DivisionResources } from './ArmyManagement';
import { DivisionDesignerPreview } from './DivisionDesignerPreview';
import { DIVISION_TEMPLATES, divisionTemplate, MAX_TRAINING, type DivisionTemplateId } from '../engine/military/templates';
import { useEffect, useState } from 'react';
import { useApp } from './App';
import { appStore, fmtNumber } from './store';
import { t } from './i18n';
import { engineClient } from './engineClient';
import { saveSlot, loadSlot, listSlots, deleteSlot, MANUAL_SLOTS } from './idb';
import { exportSaveFile, importSaveFile } from './fileTransfer';
import { t as _t } from './i18n';

export function AlertFeed() {
  const st = useApp();
  const lang = st.lang;
  const items = [...st.alertLog].reverse().slice(0, 10);
  return (
    <div className="left-feed" data-testid="alert-feed">
      {items.length === 0 && <div className="muted">—</div>}
      {items.map((a) => (
        <div
          key={a.id}
          className={'alert-item p' + a.priority}
          style={{ cursor: a.province !== undefined ? 'pointer' : 'default' }}
          onClick={() => {
            if (a.province !== undefined) appStore.set({ selection: { prov: a.province, unitId: null, country: null }, mapMode: a.kind === 'supplyCut' ? 'supply' : st.mapMode });
          }}
        >
          {a.params && (a.params.ja || a.params.en)
            ? (lang === 'ja' ? a.params.ja : a.params.en) || t(lang, a.msgKey, a.params)
            : t(lang, a.msgKey, a.params)}
        </div>
      ))}
    </div>
  );
}

function TraceBox() {
  const st = useApp();
  if (!st.trace) return null;
  return (
    <div className="trace-box" data-testid="trace-box">
      <b>{st.trace.title}</b>
      {st.trace.contribs.map((c, i) => (
        <div key={i} className="trace-contrib">
          <span className="k">{c.label} <span className="muted">{c.formula}</span></span>
          <span>{typeof c.value === 'number' ? Math.round(c.value * 1000) / 1000 : c.value}</span>
        </div>
      ))}
      {st.trace.note && <div className="muted" style={{ marginTop: 4 }}>{st.trace.note}</div>}
    </div>
  );
}

export function ContextPanel() {
  const st = useApp();
  const lang = st.lang;
  const snap = st.snap!;
  const meta = st.meta!;
  const selUnit = st.selection.unitId !== null ? snap.units.find((u) => u.id === st.selection.unitId) : null;
  const selProv = selUnit?.loc ?? st.selection.prov;
  const player = snap.countries[snap.playerCountry];

  if (selProv === null && !selUnit) {
    // 国家概要
    return (
      <>
        <div className="panel-section" data-testid="overview">
          <h4>{t(lang, 'panel.overview')}</h4>
          <div className="kv"><span className="k">{t(lang, 'game.manpower')}</span><span>{fmtNumber(lang, Math.floor(player.manpowerPool))}</span></div>
          <div className="kv"><span className="k">{t(lang, 'prod.infStock')}</span><span>{fmtNumber(lang, Math.floor(player.infEquipmentStock))}</span></div>
          <div className="kv"><span className="k">{t(lang, 'prod.artStock')}</span><span>{fmtNumber(lang, Math.floor(player.artEquipmentStock))}</span></div>
          <div className="kv"><span className="k">{t(lang, 'game.divisions')}</span><span>{player.divisions}</span></div>
          <div className="kv"><span className="k">{t(lang, 'country.factories')}</span><span>{player.milFactories}</span></div>
          <div className="kv"><span className="k">{t(lang, 'prod.share')}</span>
            <span>
              <input
                data-testid="share-slider"
                type="range" min={0} max={0.5} step={0.05} value={player.productionShare}
                onChange={(e) => engineClient.command('setProductionShare', { share: Number(e.target.value) })}
              />
              {Math.round(player.productionShare * 100)}%
            </span>
          </div>
          {player.atWar.length > 0 && (
            <div className="kv"><span className="k">{t(lang, 'game.atWar')}</span><span>{player.atWar.map((c) => (lang === 'ja' ? snap.countries[c].nameJa : snap.countries[c].nameEn)).join(', ')}</span></div>
          )}
          <div className="row" style={{ marginTop: 6 }}>
            <button data-testid="btn-fronts" onClick={() => appStore.set({ panel: 'fronts' })}>{t(lang, 'panel.fronts')}（{snap.fronts.filter((f) => f.owner === snap.playerCountry).length}）</button>
          </div>
          <div className="row" style={{ marginTop: 6 }}><button onClick={() => appStore.set({ panel: 'production' })}>{t(lang, 'prod.title')}</button><button onClick={() => appStore.set({ panel: 'recruit' })}>{t(lang, 'mil.recruit')}</button></div>
          <div className="muted" style={{ marginTop: 6 }}>{t(lang, 'panel.selectUnit')}</div>
        </div>
        <TraceBox />
      </>
    );
  }

  const prov = selProv;
  const provSection = () => {
    if (prov === null) return null;
    const ownerC = snap.countries[snap.owner[prov]];
    const ctrlC = snap.countries[snap.controller[prov]];
    const occupied = snap.owner[prov] !== snap.controller[prov];
    const unitsHere = snap.units.filter((u) => u.loc === prov);
    const isPlayerControlled = snap.controller[prov] === snap.playerCountry;
    const foreignOwner = snap.owner[prov] !== snap.playerCountry;
    const war = foreignOwner ? snap.wars.find((w) => (w.aggressor === snap.playerCountry && w.defender === snap.owner[prov]) || (w.defender === snap.playerCountry && w.aggressor === snap.owner[prov])) : null;
    const hasCb = snap.claims.some((cl) => cl.country === snap.playerCountry && snap.owner[cl.province] === snap.owner[prov]);
    const supply = snap.supplyEff[prov];
    return (
      <div className="panel-section" data-testid="province-panel">
        <h4>{lang === 'ja' ? meta.provNameJa[prov] : meta.provNameEn[prov]}（{meta.provIds[prov]}）</h4>
        {snap.battles.includes(prov) && <div role="status" data-testid="province-battle">⚔ {t(lang, 'panel.inBattle')}</div>}
        {snap.occupation.filter(o => o.province === prov).map(o => <div className="kv" data-testid="occupation-progress" key={o.province}><span>{t(lang, 'units.occupation')}</span><span>{o.days} / {OCCUPATION_DAYS}</span></div>)}
        <div className="kv"><span className="k">{t(lang, 'panel.owner')}</span><span><span className="color-dot" style={{ background: ownerC.color }} />{lang === 'ja' ? ownerC.nameJa : ownerC.nameEn}</span></div>
        <div className="kv">
          <span className="k">{t(lang, 'panel.controller')}</span>
          <span data-testid="controller">{occupied ? <b style={{ color: '#e08b84' }}>{lang === 'ja' ? ctrlC.nameJa : ctrlC.nameEn}（{t(lang, 'panel.occupied')}）</b> : lang === 'ja' ? ctrlC.nameJa : ctrlC.nameEn}</span>
        </div>
        <div className="kv"><span className="k">{t(lang, 'panel.population')}</span><span>{fmtNumber(lang, meta.provPop[prov])}</span></div>
        <div className="kv"><span className="k">{t(lang, 'panel.terrain')}</span><span>{t(lang, 'terrain.' + meta.provTerrain[prov])}</span></div>
        <div className="kv"><span className="k">{t(lang, 'panel.infra')}</span><span>{meta.provInfra[prov]}</span></div>
        <div className="kv"><span className="k">{t(lang, 'panel.supplyEff')}</span><span data-testid="supply-eff">{Math.round(supply * 100)}%</span></div>
        <div className="kv"><span className="k">{t(lang, 'panel.terrain')}</span><span>{t(lang, 'terrain.' + meta.provTerrain[prov])} / {t(lang, 'weather.' + ['clear', 'rain', 'snow', 'storm'][snap.weather[prov]])}（{t(lang, 'season.' + snap.season)}）</span></div>
        {isPlayerControlled && (
          <div className="row" style={{ marginTop: 6 }}>
            <button data-testid="build-milfactory" onClick={() => engineClient.command('startConstruction', { province: prov, type: 'milFactory' })}>{t(lang, 'construction.milFactory')}</button>
            <button data-testid="build-infra" onClick={() => engineClient.command('startConstruction', { province: prov, type: 'infra' })}>{t(lang, 'construction.infra')}</button>
          </div>
        )}
        <button data-testid="btn-supply-trace" onClick={async () => {
          const r = await engineClient.trace({ kind: 'provinceSupply', id: prov });
          if (r) appStore.set({ trace: r });
        }}>{t(lang, 'panel.showTrace')}</button>
        {isPlayerControlled && (
          <div style={{ marginTop: 8 }}>
            <button
              className="primary"
              data-testid="btn-create-unit"
              onClick={() => appStore.set({ panel: 'recruit' })}
            >
              {t(lang, 'mil.recruit')}
            </button>
          </div>
        )}
        {foreignOwner && !war && (
          <div style={{ marginTop: 8 }}>
            <button className="danger" data-testid="btn-declare-war" onClick={() => engineClient.command('declareWar', { defender: snap.owner[prov] })}>
              {hasCb ? t(lang, 'panel.declareWar') : t(lang, 'panel.declareWarNoCb')}
            </button>
            {hasCb && <div className="muted">{t(lang, 'panel.hasCb')}</div>}
          </div>
        )}
        {war && (
          <div style={{ marginTop: 8 }}>
            <div className="kv"><span className="k">{t(lang, 'war.score')}</span><span>{war.scoreAggressor} / {war.scoreDefender}</span></div>
            <div className="kv"><span className="k">{t(lang, 'war.days')}</span><span>{war.days}</span></div>
            {war.status === 'peaceOffered' && (
              <div className="muted">{t(lang, 'war.peaceOfferedWaiting')}</div>
            )}
            <div className="row">
              <button onClick={() => engineClient.command('proposePeace', { warId: war.id })}>{t(lang, 'panel.proposePeace')}</button>
              <button data-testid="btn-demand-peace" onClick={() => engineClient.command('proposePeace', { warId: war.id, type: 'demand' })}>{t(lang, 'panel.demandPeace')}</button>
            </div>
          </div>
        )}
        {unitsHere.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <h4>{t(lang, 'panel.unitsHere')}</h4>
            {unitsHere.map((u) => (
              <div key={u.id} className={'unit-row' + (st.selection.unitId === u.id ? ' selected' : '')} onClick={() => appStore.set({ selection: { prov, unitId: u.id, country: null } })}>
                #{u.id} {t(lang, 'panel.org')} {Math.round(u.org)} / {t(lang, 'panel.strength')} {Math.round(u.strength * 100)}%
                {u.inBattle && ' ⚔'}{u.encircled && ' ⊗'}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const unitSection = () => {
    if (!selUnit) return null;
    const u = selUnit;
    const targetName = u.moving && u.target >= 0 ? (lang === 'ja' ? meta.provNameJa[u.target] : meta.provNameEn[u.target]) : null;
    return (
      <div className="panel-section" data-testid="unit-panel">
        <h4>{t(lang, 'panel.unit')} #{u.id} — {lang === 'ja' ? divisionTemplate(u.templateId ?? 'standard-v1')?.nameJa : divisionTemplate(u.templateId ?? 'standard-v1')?.nameEn}</h4>
        <DivisionResources unit={u} lang={lang} context/>
        <div className="kv"><span className="k">{t(lang, 'units.location')}</span><span data-testid="unit-location">{lang === 'ja' ? meta.provNameJa[u.loc] : meta.provNameEn[u.loc]} ({meta.provIds[u.loc]})</span></div>
        <div className="kv"><span className="k">{t(lang, 'panel.org')}</span><span data-testid="unit-org">{Math.round(u.org)} / 100</span></div>
        <div className="kv"><span className="k">{t(lang, 'panel.strength')}</span><span>{Math.round(u.strength * 100)}%</span></div>
        <div className="kv"><span className="k">{t(lang, 'game.equipment')}</span><span>{u.infEquipment}/{u.maxInfEquipment} + {u.artEquipment}/{u.maxArtEquipment}</span></div>
        <div className="kv"><span className="k">{t(lang, 'panel.supplyEff')}</span><span>{Math.round(u.supply * 100)}%</span></div>
        {u.inBattle && <div className="kv"><span className="k">state</span><span>{t(lang, 'panel.inBattle')}</span></div>}
        {u.encircled && <div className="kv"><span className="k">state</span><span style={{ color: '#e08b84' }}>{t(lang, 'panel.encircled')}</span></div>}
        {u.moving && snap.countries[u.owner].atWar.includes(snap.controller[u.target]) && <div data-testid="unit-attacking">⚔ {t(lang, 'units.attacking')}</div>}
        {u.moving && <div className="kv" data-testid="unit-moving"><span className="k">{t(lang, 'panel.moving')}</span><span>{t(lang, 'misc.movingTo', { target: targetName ?? '' })}</span></div>}
        <div className="kv"><span className="k">{t(lang, 'cmdr.assign')}</span>
          <select
            data-testid="cmdr-select"
            value={u.commanderId}
            onChange={(e) => engineClient.command('assignCommander', { unitId: u.id, commanderId: Number(e.target.value) })}
          >
            <option value={-1}>{t(lang, 'cmdr.unassigned')}</option>
            {snap.commanders.filter((c) => c.country === u.owner).map((c) => (
              <option key={c.id} value={c.id}>
                {(lang === 'ja' ? c.nameJa : c.nameEn)} S{c.skill} {t(lang, 'trait.' + ['attack', 'defense', 'logistics'][c.trait])}
                {c.assignedUnit >= 0 && c.assignedUnit !== u.id ? ' *' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <button data-testid="btn-combat-trace" onClick={async () => {
            const r = await engineClient.trace({ kind: 'unitCombat', id: u.id });
            if (r) appStore.set({ trace: r });
          }}>{t(lang, 'panel.trace')}: {t(lang, 'game.divisions')}</button>
          <button onClick={async () => {
            const r = await engineClient.trace({ kind: 'unitOrgRegen', id: u.id });
            if (r) appStore.set({ trace: r });
          }}>{t(lang, 'panel.trace')}: {t(lang, 'panel.org')}</button>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>{t(lang, 'panel.selectUnit')}</div>
      </div>
    );
  };

  return (
    <>
      {provSection()}
      {unitSection()}
      <TraceBox />
    </>
  );
}

export function SaveLoadModal() {
  const st = useApp();
  const lang = st.lang;
  const [slots, setSlots] = useState<import('./idb').SaveSlotMeta[]>([]);
  const [slot, setSlot] = useState('slot1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void listSlots().then(all => { if (active) setSlots(all); })
      .catch(err => { if (active) setError(String(err)); });
    return () => { active = false; };
  }, []);

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try { await action(); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }

  async function restore(buf: Uint8Array): Promise<void> {
    const result = await engineClient.load(buf);
    if (!result.ok) throw new Error(t(lang, 'save.loadFailed', { violations: result.violations?.join(', ') ?? '' }));
    appStore.set({ statusMessage: t(lang, 'save.imported'), panel: null });
  }
  const blocked = busy || st.pendingCommands > 0;

  return (
    <div className="modal-backdrop" onClick={() => { if (!busy) appStore.set({ panel: null }); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="save-modal">
        <h3>{t(lang, 'save.title')}</h3>
        <PendingOrders />
        {error && <div role="alert" data-testid="save-error">{error}</div>}
        {notice && <div role="status" data-testid="save-notice">{notice}</div>}
        <div className="row" style={{ marginBottom: 10 }}>
          <select aria-label={t(lang, 'save.title')} data-testid="save-slot-select" value={slot} disabled={busy} onChange={e => setSlot(e.target.value)}>
            {Array.from({ length: MANUAL_SLOTS }, (_, i) => 'slot' + (i + 1)).map(id =>
              <option key={id} value={id}>{id}{slots.some(s => s.slot === id) ? ' ●' : ''}</option>)}
          </select>
          <button className="primary" data-testid="btn-do-save" disabled={blocked} onClick={() => void run(async () => {
            const r = await engineClient.save();
            await saveSlot(slot, r.buf, { tick: r.tick, dateStr: r.dateStr, ts: Date.now(), auto: false });
            setSlots(await listSlots());
            setNotice(t(lang, 'save.savedAt', { date: r.dateStr, tick: r.tick }));
          })}>{t(lang, 'common.save')}（{slot}）</button>
          <button disabled={blocked} onClick={() => void run(async () => {
            const r = await engineClient.save();
            exportSaveFile(r.buf, r.dateStr);
          })}>{t(lang, 'common.export')}</button>
          <label style={{ cursor: blocked ? 'default' : 'pointer' }}>
            {t(lang, 'common.import')}
            <input type="file" data-testid="save-import" disabled={blocked} style={{ display: 'none' }} onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void run(async () => restore(await importSaveFile(file)));
            }} />
          </label>
        </div>
        {slots.map(s => (
          <div key={s.slot} className="kv" data-testid={'slot-' + s.slot}>
            <span>{s.auto ? t(lang, 'save.auto') : s.slot}</span>
            <span className="muted">{t(lang, 'save.savedAt', { date: s.dateStr, tick: s.tick })}</span>
            <span className="row">
              <button data-testid={'load-' + s.slot} disabled={blocked} onClick={() => void run(async () => {
                const value = await loadSlot(s.slot);
                if (!value) throw new Error('Save slot not found');
                await restore(value.buf);
              })}>{t(lang, 'common.load')}</button>
              <button disabled={busy} onClick={() => void run(async () => {
                await deleteSlot(s.slot);
                setSlots(await listSlots());
              })}>{t(lang, 'common.delete')}</button>
            </span>
          </div>
        ))}
        <div className="muted" style={{ marginTop: 8 }}>{t(lang, 'save.slot', { slot: MANUAL_SLOTS })}・{t(lang, 'save.auto')}</div>
        <div style={{ marginTop: 10 }}><button disabled={busy} onClick={() => appStore.set({ panel: null })}>{t(lang, 'common.close')}</button></div>
      </div>
    </div>
  );
}

export function BudgetPanel({ initialTab = 'budget' }: { initialTab?: 'budget' | 'research' }) {
  const st = useApp();
  const lang = st.lang;
  const snap = st.snap!;
  const player = snap.countries[snap.playerCountry];
  const [tab, setTab] = useState<'budget' | 'laws' | 'research' | 'construction' | 'score'>(initialTab);
  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'budget', label: t(lang, 'budget.tab') },
    { key: 'laws', label: t(lang, 'laws.title') },
    { key: 'research', label: t(lang, 'research.title') },
    { key: 'construction', label: t(lang, 'construction.title') },
    { key: 'score', label: t(lang, 'score.title') },
  ];
  return (
    <div className="modal-backdrop" onClick={() => appStore.set({ panel: null })}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="budget-modal">
        <h3>{t(lang, 'panel.budget')}</h3>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {tabs.map((x) => (
            <button key={x.key} className={tab === x.key ? 'primary' : ''} onClick={() => setTab(x.key)}>{x.label}</button>
          ))}
        </div>
        <PendingOrders />
        {tab === 'budget' && (
          <div data-testid="budget-tab">
            <div className="kv"><span className="k">{t(lang, 'budget.treasury')}</span><span data-testid="treasury">{fmtNumber(lang, player.treasury)}</span></div>
            <div className="kv"><span className="k">{t(lang, 'budget.gdp')}</span><span data-testid="gdp">{fmtNumber(lang, player.gdp)}</span></div>
            <div className="kv"><span className="k">{t(lang, 'budget.taxRate')}</span>
              <span>
                <input data-testid="tax-slider" type="range" min={0} max={0.5} step={0.05} value={player.taxRate}
                  onChange={(e) => engineClient.command('setTaxRate', { rate: Number(e.target.value) })} />
                {Math.round(player.taxRate * 100)}%
              </span>
            </div>
            <div className="kv"><span className="k">{t(lang, 'budget.edu')}</span>
              <span>
                <input data-testid="edu-slider" type="range" min={0} max={1} step={0.1} value={player.budgetEdu}
                  onChange={(e) => engineClient.command('setBudgetEdu', { rate: Number(e.target.value) })} />
                {Math.round(player.budgetEdu * 100)}%
              </span>
            </div>
            <div className="kv"><span className="k">{t(lang, 'budget.support')}</span><span data-testid="support">{Math.round(player.supportRate * 100)}%</span></div>
            <div className="kv"><span className="k">{t(lang, 'budget.stability')}</span><span>{Math.round(player.stability * 100)}%</span></div>
            <div className="kv"><span className="k">{t(lang, 'budget.living')}</span><span data-testid="living">{Math.round(player.livingStandard * 100)}%（{t(lang, 'budget.unemp')} {Math.round(player.unemployment * 100)}%）</span></div>
            <div className="kv"><span className="k">{t(lang, 'prod.infStock')}</span><span>{fmtNumber(lang, player.infEquipmentStock)}</span></div>
            <div className="muted" style={{ marginTop: 8 }}>{t(lang, 'budget.note')}</div>
          </div>
        )}
        {tab === 'laws' && (
          <div data-testid="laws-tab">
            <div className="kv"><span className="k">{t(lang, 'laws.pp')}</span><span data-testid="pp">{player.pp}</span></div>
            {player.lawPending && (
              <div className="muted">{t(lang, 'laws.pending')}: {t(lang, 'laws.slot.' + player.lawPending.slot)} → {player.lawPending.target}（{player.lawPending.enactDays - (snap.tick - player.lawPending.startTick)}日）</div>
            )}
            {(['conscription', 'economy'] as const).map((slot) => (
              <div key={slot} className="panel-section" style={{ marginBottom: 8 }}>
                <div className="kv"><span className="k">{t(lang, 'laws.slot.' + slot)}</span><span>{player.laws[slot]}</span></div>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  {[0, 1, 2].map((target) => (
                    <button
                      key={target}
                      className={player.laws[slot] === target ? 'primary' : ''}
                      data-testid={'law-' + slot + '-' + target}
                      onClick={() => engineClient.command('enactLaw', { slot, target })}
                    >
                      {t(lang, 'laws.' + slot + '.' + target)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'research' && (
          <div data-testid="research-tab">
            <div className="kv"><span className="k">{t(lang, 'research.done')}</span><span data-testid="research-done">{player.research.done.length} / {snap.techs.length}</span></div>
            {player.research.active.map((a) => (
              <div key={a.id} className="kv"><span className="k">{a.id}</span><span>{Math.round((a.progress / a.days) * 100)}%</span></div>
            ))}
            {snap.techs.map((tech) => {
              const isDone = player.research.done.includes(tech.id);
              const isActive = player.research.active.some((a) => a.id === tech.id);
              const prereqOk = tech.req.every((r) => player.research.done.includes(r));
              return (
                <div key={tech.id} className="kv">
                  <span className="k">{tech.id}（{tech.cat}）</span>
                  <span>
                    {isDone ? '✔' : isActive ? Math.round((player.research.active.find((a) => a.id === tech.id)!.progress / tech.days) * 100) + '%' : (
                      <button
                        data-testid={'research-' + tech.id}
                        disabled={!prereqOk || player.research.active.length >= 2}
                        onClick={() => engineClient.command('startResearch', { techId: tech.id })}
                      >
                        {t(lang, 'research.start')}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {tab === 'construction' && (
          <div data-testid="construction-tab">
            <div className="muted">{t(lang, 'construction.note')}</div>
            {player.construction.map((pr) => (
              <div key={pr.id} className="kv" data-testid={'construction-' + pr.id}>
                <span className="k">{t(lang, 'construction.' + pr.type)} @ {st.meta!.provNameJa[pr.prov] || st.meta!.provNameEn[pr.prov]}</span>
                <span>{pr.paused ? t(lang, 'construction.paused') : Math.round((pr.daysProgress / pr.daysTotal) * 100) + '%'}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'score' && (
          <div data-testid="score-tab">
            {(['military', 'economy', 'diplomacy', 'technology', 'living'] as const).map((axis) => (
              <div key={axis} className="kv">
                <span className="k">{t(lang, 'score.' + axis)}</span>
                <span data-testid={'score-' + axis}>{fmtNumber(lang, Math.round(player.scores[axis]))}</span>
              </div>
            ))}
            {player.scoreHistory.length > 1 && (
              <div className="muted" style={{ marginTop: 8 }}>
                {t(lang, 'score.history')}: {player.scoreHistory.length}{t(lang, 'score.months')}
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 10 }}><button onClick={() => appStore.set({ panel: null })}>{t(lang, 'common.close')}</button></div>
      </div>
    </div>
  );
}

export function FrontsPanel() {
  const st=useApp(), lang=st.lang, snap=st.snap!, meta=st.meta!;
  const ja=lang==='ja';
  const fronts=snap.fronts.filter(f=>f.owner===snap.playerCountry);
  const enemies=snap.countries[snap.playerCountry].atWar;
  const [enemy,setEnemy]=useState<number>(enemies[0]??-1);
  const selected=snap.units.filter(u=>u.owner===snap.playerCountry&&(st.selection.unitIds??(st.selection.unitId===null?[]:[st.selection.unitId])).includes(u.id));
  const ids=selected.map(u=>u.id);
  const busy=st.pendingCommands>0;
  const name=(p:number)=>ja?meta.provNameJa[p]:meta.provNameEn[p];
  return <div className="modal-backdrop" onClick={()=>appStore.set({panel:null})}>
    <div className="modal" onClick={e=>e.stopPropagation()} data-testid="fronts-modal">
      <h3>{t(lang,'panel.fronts')}</h3>
      <p data-testid="front-selection-count">{ja?'選択師団':'Selected divisions'}: {ids.length}</p>
      {enemies.length>0&&<div className="row">
        <select data-testid="front-enemy" value={enemy} onChange={e=>setEnemy(Number(e.target.value))}>
          {enemies.map(c=><option key={c} value={c}>{ja?snap.countries[c].nameJa:snap.countries[c].nameEn}</option>)}
        </select>
        <button className="primary" data-testid="btn-create-front" disabled={busy||!enemies.includes(enemy)} onClick={()=>engineClient.command('createFront',{enemy})}>{t(lang,'front.create')}</button>
      </div>}
      {!fronts.length&&<div className="muted">{t(lang,'front.none')}</div>}
      {fronts.map(f=><div key={f.id} className="panel-section" data-testid={'front-'+f.id}>
        <h4>#{f.id} {ja?snap.countries[f.enemy].nameJa:snap.countries[f.enemy].nameEn}</h4>
        <div className="kv"><span>{t(lang,'front.assigned')}: {f.assigned}</span><span>{ja?'手動優先':'Manual hold'}: {f.held}</span></div>
        <div className="kv"><span>{ja?'自動作戦':'Automation'}</span><strong data-testid={'front-state-'+f.id}>{!enemies.includes(f.enemy)?(ja?'交戦終了':'War ended'):f.paused?(ja?'一時停止':'Paused'):(ja?'実行可能':'Enabled')}</strong></div>
        <div className="row">
          {(['hold','attack','retreat'] as const).map(stance=><button key={stance} className={f.stance===stance?'primary':''} disabled={busy||!enemies.includes(f.enemy)} data-testid={'front-stance-'+stance} onClick={()=>engineClient.command('setFrontStance',{frontId:f.id,stance})}>{t(lang,'front.stance.'+stance)}</button>)}
          <button data-testid={'front-pause-'+f.id} disabled={busy||!enemies.includes(f.enemy)} onClick={()=>engineClient.command('setFrontPaused',{frontId:f.id,paused:!f.paused})}>{f.paused?(ja?'再開':'Resume'):(ja?'一時停止':'Pause')}</button>
        </div>
        <div className="kv"><span>{t(lang,'front.cap')}</span><select aria-label={t(lang,'front.cap')} data-testid={'front-cap-'+f.id} disabled={busy} value={f.cap} onChange={e=>engineClient.command('setFrontStance',{frontId:f.id,stance:f.stance,cap:Number(e.target.value)})}>{Array.from({length:9},(_,n)=><option key={n} value={n}>{n}</option>)}</select></div>
        <div className="muted">{ja?'戦線州':'Front provinces'}: {f.provinces.map(name).join(', ')||'—'}</div>
        <div className="kv"><span>{t(lang,'front.targets')}</span><span>{f.targets.map(name).join(', ')||(ja?'自動':'Automatic')}</span></div>
        <div className="row">
          <select aria-label={t(lang,'front.targets')} data-testid={'front-target-'+f.id} value={f.targets.length===1?f.targets[0]:-1} disabled={busy||!enemies.includes(f.enemy)} onChange={e=>engineClient.command('setFrontStance',{frontId:f.id,stance:f.stance,targets:Number(e.target.value)<0?[]:[Number(e.target.value)]})}>
            <option value={-1}>{ja?'自動選択':'Automatic'}</option>
            {meta.provIds.map((id,p)=>snap.controller[p]===f.enemy&&<option key={id} value={p}>{name(p)} ({id})</option>)}
          </select>
        </div>
        <div className="row">
          <button data-testid={'front-assign-'+f.id} disabled={busy||!ids.length||ids.length>256||!enemies.includes(f.enemy)} onClick={()=>engineClient.command('assignToFront',{units:ids,frontId:f.id})}>{t(lang,'front.assignSelected')} ({ids.length})</button>
          <button data-testid={'front-unassign-'+f.id} disabled={busy||!selected.some(u=>u.frontId===f.id)} onClick={()=>engineClient.command('unassignFromFront',{units:selected.filter(u=>u.frontId===f.id).map(u=>u.id)})}>{ja?'選択師団の割当解除':'Unassign selected'}</button>
          <button className="danger" disabled={busy} onClick={()=>engineClient.command('deleteFront',{frontId:f.id})}>{t(lang,'front.delete')}</button>
        </div>
      </div>)}
      <p className="muted">{ja?'作戦は週次で評価されます。一時停止は新規自動命令を止め、すでに移動中の師団は現在の経路を維持します。':'Plans are evaluated weekly. Pausing stops new automatic orders; deployed movement paths continue.'}</p>
      <PendingOrders/>
      <button data-testid="close-fronts" onClick={()=>appStore.set({panel:null})}>{t(lang,'common.close')}</button>
    </div>
  </div>;
}

export function SettingsModal() {
  const st = useApp();
  const lang = st.lang;
  return (
    <div className="modal-backdrop" onClick={() => appStore.set({ panel: null })}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="settings-modal">
        <h3>{t(lang, 'settings.title')}</h3>
        <div className="kv"><span className="k">{t(lang, 'settings.language')}</span>
          <select value={st.lang} onChange={(e) => appStore.set({ lang: e.target.value as 'ja' | 'en' })} data-testid="lang-select">
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="kv"><span className="k">{t(lang, 'settings.colorAssist')}</span>
          <button data-testid="toggle-colorassist" onClick={() => appStore.set({ colorAssist: !st.colorAssist })}>{st.colorAssist ? t(lang, 'settings.on') : t(lang, 'settings.off')}</button>
        </div>
        <div className="kv"><span className="k">{t(lang, 'settings.devMode')}</span>
          <button data-testid="toggle-devmode" onClick={() => appStore.set({ devMode: !st.devMode })}>{st.devMode ? t(lang, 'settings.on') : t(lang, 'settings.off')}</button>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>{t(lang, 'difficulty.note')}</div>
        <div style={{ marginTop: 10 }}><button onClick={() => appStore.set({ panel: null })}>{t(lang, 'common.close')}</button></div>
      </div>
    </div>
  );
}

export function AiInspectorModal() {
  const st = useApp();
  const lang = st.lang;
  const snap = st.snap!;
  const [logs, setLogs] = useState<{ tick: number; module: string; options: string[]; scores: number[]; chosen: string; reason: string }[] | null>(null);
  const country = st.aiLogCountry ?? snap.playerCountry;
  const countryName = lang === 'ja' ? snap.countries[country]?.nameJa : snap.countries[country]?.nameEn;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const result = await engineClient.requestAiLog(country);
      if (alive) setLogs(result);
    })();
    return () => {
      alive = false;
    };
  }, [country, snap.tick]);

  return (
    <div className="modal-backdrop" onClick={() => appStore.set({ panel: null })}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="ai-log-modal">
        <h3>{t(lang, 'ai.title', { country: countryName ?? '' })}</h3>
        <div className="row" style={{ marginBottom: 8 }}>
          {snap.countries.map((c, i) => (
            <button key={c.id} className={country === i ? 'primary' : ''} onClick={() => appStore.set({ aiLogCountry: i })}>
              <span className="color-dot" style={{ background: c.color }} />{lang === 'ja' ? c.nameJa : c.nameEn}
            </button>
          ))}
        </div>
        {!logs && <div className="muted">{t(lang, 'misc.loading')}</div>}
        {logs && logs.length === 0 && <div className="muted">{t(lang, 'ai.empty')}</div>}
        {logs?.slice().reverse().slice(0, 40).map((l, i) => (
          <div key={i} className="ai-log-entry">
            <b>tick {l.tick}</b> [{l.module}] → <b>{l.chosen}</b>
            <div className="muted">{t(lang, 'ai.options')}: {l.options.join(' | ')}</div>
            <div className="muted">{t(lang, 'ai.scores')}: {l.scores.join(', ')}</div>
            <div className="muted">{t(lang, 'ai.reason')}: {l.reason}</div>
          </div>
        ))}
        <div style={{ marginTop: 10 }}><button onClick={() => appStore.set({ panel: null })}>{t(lang, 'common.close')}</button></div>
      </div>
    </div>
  );
}

// ── 外交パネル（phase4-diplomacy-treaties / phase4-peace-conference）──

const TREATY_PROPOSALS = ['nonaggression', 'trade', 'alliance', 'access'] as const;

export function DiplomacyPanel({ initialTab = 'relations' }: { initialTab?: 'relations' | 'peace' }) {
  const st = useApp();
  const lang = st.lang;
  const snap = st.snap!;
  const meta = st.meta!;
  const player = snap.playerCountry;
  const [tab, setTab] = useState<'relations' | 'treaties' | 'peace'>(initialTab);
  const [demands, setDemands] = useState<Record<number, number[]>>({});
  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'relations', label: t(lang, 'dip.tab.relations') },
    { key: 'treaties', label: t(lang, 'dip.tab.treaties') },
    { key: 'peace', label: t(lang, 'dip.tab.peace') },
  ];
  const nameOf = (c: number) => (lang === 'ja' ? snap.countries[c]?.nameJa : snap.countries[c]?.nameEn) ?? '';
  const provName = (p: number) => (lang === 'ja' ? meta.provNameJa[p] : meta.provNameEn[p]);

  const myWars = snap.wars.filter((w) => w.aggressor === player || w.defender === player);
  const incomingTreaties = snap.treaties.filter((tr) => tr.status === 'proposed' && (tr.a === player || tr.b === player) && tr.proposer !== player);
  const activeTreaties = snap.treaties.filter((tr) => tr.status === 'active' && (tr.a === player || tr.b === player));

  const toggleDemand = (warId: number, prov: number) => {
    setDemands((prev) => {
      const cur = prev[warId] ?? [];
      const next = cur.includes(prov) ? cur.filter((x) => x !== prov) : [...cur, prov];
      return { ...prev, [warId]: next };
    });
  };

  return (
    <div className="modal-backdrop" onClick={() => appStore.set({ panel: null })}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="diplomacy-modal">
        <h3>{t(lang, 'panel.diplomacy')}</h3>
        <div className="row" style={{ gap: 6, marginBottom: 10 }}>
          {tabs.map((x) => (
            <button key={x.key} className={tab === x.key ? 'primary' : ''} data-testid={'dip-tab-' + x.key} onClick={() => setTab(x.key)}>{x.label}</button>
          ))}
        </div>

        <PendingOrders />
        {tab === 'relations' && (
          <div data-testid="dip-relations">
            {snap.countries.map((c, i) => {
              if (i === player || !c.alive) return null;
              const rel = relValueOf(snap, player, i);
              const allied = snap.treaties.some((tr) => tr.status === 'active' && tr.type === 'alliance' && ((tr.a === player && tr.b === i) || (tr.b === player && tr.a === i)));
              return (
                <div key={c.id} className="panel-section" style={{ marginBottom: 8 }} data-testid={'dip-country-' + c.id}>
                  <div className="kv">
                    <span className="k"><span className="color-dot" style={{ background: c.color }} />{nameOf(i)}</span>
                    <span data-testid={'dip-rel-' + c.id}>
                      {t(lang, 'dip.relation')}: <b>{rel}</b>{allied ? ' 🤝' : ''}
                    </span>
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                    <button data-testid={'dip-trace-' + c.id} onClick={async () => {
                      const r = await engineClient.trace({ kind: 'relationTrace', id: i });
                      if (r) appStore.set({ trace: r });
                    }}>{t(lang, 'panel.showTrace')}</button>
                    {TREATY_PROPOSALS.map((ty) => (
                      <button key={ty} data-testid={'dip-propose-' + ty + '-' + c.id}
                        onClick={() => engineClient.command('proposeTreaty', { target: i, type: ty })}>
                        {t(lang, 'dip.propose')}: {t(lang, 'dip.treaty.' + ty)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <TraceBox />
          </div>
        )}

        {tab === 'treaties' && (
          <div data-testid="dip-treaties">
            {incomingTreaties.length > 0 && (
              <div className="panel-section" style={{ marginBottom: 8 }}>
                <h4>{t(lang, 'dip.incoming')}</h4>
                {incomingTreaties.map((tr) => (
                  <div key={tr.id} className="kv" data-testid={'dip-incoming-' + tr.id}>
                    <span className="k">{nameOf(tr.proposer)}: {t(lang, 'dip.treaty.' + tr.type)}</span>
                    <span className="row">
                      <button className="primary" data-testid={'dip-accept-' + tr.id} onClick={() => engineClient.command('acceptTreaty', { treatyId: tr.id })}>{t(lang, 'dip.accept')}</button>
                      <button data-testid={'dip-decline-' + tr.id} onClick={() => engineClient.command('declineTreaty', { treatyId: tr.id })}>{t(lang, 'dip.decline')}</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <h4>{t(lang, 'dip.active')}</h4>
            {activeTreaties.length === 0 && <div className="muted">{t(lang, 'dip.none')}</div>}
            {activeTreaties.map((tr) => (
              <div key={tr.id} className="kv" data-testid={'dip-active-' + tr.id}>
                <span className="k">{nameOf(tr.a)} ↔ {nameOf(tr.b)}: {t(lang, 'dip.treaty.' + tr.type)}</span>
                <span className="row">
                  <span className="muted">{t(lang, 'dip.expiry')}: {tr.expiryTick < 0 ? t(lang, 'dip.noExpiry') : 'T+' + (tr.expiryTick - snap.tick)}</span>
                  {(tr.a === player || tr.b === player) && (
                    <button className="danger" data-testid={'dip-annul-' + tr.id} onClick={() => engineClient.command('annulTreaty', { treatyId: tr.id })}>{t(lang, 'dip.annul')}</button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'peace' && (
          <div data-testid="dip-peace">
            {myWars.length === 0 && <div className="muted">{t(lang, 'game.peace')}</div>}
            {myWars.map((war) => {
              const meIsAgg = war.aggressor === player;
              const enemy = meIsAgg ? war.defender : war.aggressor;
              const myScore = meIsAgg ? war.scoreAggressor : war.scoreDefender;
              const myContrib = meIsAgg ? war.contribAggressor : war.contribDefender;
              const theirContrib = meIsAgg ? war.contribDefender : war.contribAggressor;
              const demandable: number[] = [];
              for (let p = 0; p < snap.owner.length; p++) {
                // 割譲要求（自支配・相手領有）または返還要求（自領有・相手支配）
                if ((snap.controller[p] === player && snap.owner[p] === enemy) || (snap.owner[p] === player && snap.controller[p] === enemy)) {
                  demandable.push(p);
                }
              }
              const sel = demands[war.id] ?? [];
              return (
                <div key={war.id} className="panel-section" style={{ marginBottom: 8 }} data-testid={'peace-war-' + war.id}>
                  <div className="kv"><span className="k">{t(lang, 'war.days')}</span><span>{war.days} / {nameOf(enemy)}</span></div>
                  <div className="kv"><span className="k">{t(lang, 'peace.warScore')}</span><span data-testid={'peace-score-' + war.id}>{myScore}</span></div>
                  <div className="kv"><span className="k">{t(lang, 'peace.contribution')}</span><span data-testid={'peace-contrib-' + war.id}>{myContrib} / {theirContrib}</span></div>
                  {war.status === 'peaceOffered' && war.offerDemands.length > 0 && war.offeredBy !== undefined && (
                    <div className="muted" data-testid={'peace-incoming-' + war.id}>
                      {t(lang, 'peace.incomingOffer')} — {t(lang, 'peace.demandProvinces')}: {war.offerDemands.map((p) => provName(p)).join(', ')}
                    </div>
                  )}
                  {war.status === 'active' && demandable.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div className="muted">{t(lang, 'peace.occupied')}</div>
                      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                        {demandable.map((p) => (
                          <button key={p} className={sel.includes(p) ? 'primary' : ''} data-testid={'peace-demand-' + p}
                            onClick={() => toggleDemand(war.id, p)}>
                            {provName(p)}
                          </button>
                        ))}
                      </div>
                      <div className="muted" style={{ marginTop: 4 }}>{t(lang, 'peace.validityWarn')}</div>
                    </div>
                  )}
                  <div className="row" style={{ marginTop: 6, flexWrap: 'wrap', gap: 4 }}>
                    {war.status === 'active' ? (
                      <>
                        <button className="primary" data-testid={'peace-propose-' + war.id}
                          onClick={() => engineClient.command('proposePeace', { warId: war.id, demands: sel })}>
                          {sel.length > 0 ? t(lang, 'peace.proposeDemands') + `（${sel.length}）` : t(lang, 'peace.proposeWhite')}
                        </button>
                        <button data-testid={'peace-white-' + war.id}
                          onClick={() => engineClient.command('proposePeace', { warId: war.id })}>
                          {t(lang, 'peace.proposeWhite')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="primary" data-testid={'peace-accept-' + war.id} onClick={() => engineClient.command('acceptPeace', { warId: war.id })}>{t(lang, 'dip.accept')}</button>
                        <button data-testid={'peace-decline-' + war.id} onClick={() => engineClient.command('declinePeace', { warId: war.id })}>{t(lang, 'dip.decline')}</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 10 }}><button onClick={() => appStore.set({ panel: null })}>{t(lang, 'common.close')}</button></div>
      </div>
    </div>
  );
}

/** スナップショットのrelationsから関係値を引く */
function relValueOf(snap: import('../engine/ui').UiSnapshot, a: number, b: number): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const r = snap.relations.find((x) => x.a === lo && x.b === hi);
  return r ? String(r.v) : '0';
}

export function PendingOrders() {
  const st = useApp();
  if (!st.pendingCommands) return null;
  return <div className="row pending-orders" data-testid="pending-orders" role="status">
    <span>{t(st.lang, 'game.pendingOrders', { count: st.pendingCommands })}</span>
    {st.speed === 0 && <button data-testid="apply-pending" onClick={() => engineClient.step(1, appStore.get().lastAlertId)}>{t(st.lang, 'game.stepDay')}</button>}
  </div>;
}

export function RecruitmentPanel() {
  const st = useApp(), snap = st.snap!, meta = st.meta!, lang = st.lang;
  const player = snap.countries[snap.playerCountry];
  const [templateId, setTemplateId] = useState<DivisionTemplateId>('standard-v1');
  const [province, setProvince] = useState(st.selection.prov !== null && snap.controller[st.selection.prov] === snap.playerCountry ? st.selection.prov : player.capital);
  const template = divisionTemplate(templateId)!;
  const owned = meta.provIds.map((_, i) => i).filter(i => snap.controller[i] === snap.playerCountry);
  const valid = owned.includes(province);
  const nameOf = (p: number) => lang === 'ja' ? meta.provNameJa[p] : meta.provNameEn[p];
  const missing = player.manpowerPool < template.manpower ? 'reason.insufficientManpower' :
    player.infEquipmentStock < template.infantry ? 'reason.insufficientEquipment' :
    player.artEquipmentStock < template.artillery ? 'reason.insufficientArtillery' :
    player.training.length >= MAX_TRAINING ? 'reason.trainingFull' : null;
  return <div className="modal-backdrop" onClick={() => appStore.set({ panel: null })}>
    <div className="modal" data-testid="recruit-modal" onClick={e => e.stopPropagation()}>
      <h3>{t(lang, 'mil.recruit')}</h3>
      <PendingOrders />
      <div className="row"><label>{t(lang, 'mil.template')} <select data-testid="division-template" value={templateId} onChange={e => setTemplateId(e.target.value as DivisionTemplateId)}>
        {DIVISION_TEMPLATES.map(d => <option key={d.id} value={d.id}>{lang === 'ja' ? d.nameJa : d.nameEn}</option>)}
      </select></label><label>{t(lang, 'mil.deployProvince')} <select data-testid="deploy-province" value={province} onChange={e => setProvince(Number(e.target.value))}>
        {owned.map(p => <option key={p} value={p}>{nameOf(p)}</option>)}
      </select></label></div>
      <div className="panel-section" data-testid="template-cost">
        <div className="kv"><span>{t(lang, 'game.manpower')}</span><span>{fmtNumber(lang, template.manpower)} / {fmtNumber(lang, Math.floor(player.manpowerPool))}</span></div>
        <div className="kv"><span>{t(lang, 'prod.infStock')}</span><span>{fmtNumber(lang, template.infantry)} / {fmtNumber(lang, Math.floor(player.infEquipmentStock))}</span></div>
        <div className="kv"><span>{t(lang, 'prod.artStock')}</span><span>{fmtNumber(lang, template.artillery)} / {fmtNumber(lang, Math.floor(player.artEquipmentStock))}</span></div>
        <div className="kv"><span>{t(lang, 'mil.trainingDays')}</span><span>{template.days}</span></div>
      </div>
      <button className="primary" data-testid="start-training" disabled={!valid || !!missing || st.pendingCommands > 0} onClick={() => engineClient.command('startTraining', { templateId, province })}>{t(lang, 'mil.startTraining')}</button>
      {missing && <span className="muted"> {t(lang, missing)}</span>}
      <DivisionDesignerPreview lang={lang} />
      <h4>{t(lang, 'mil.queue')} ({player.training.length}/{MAX_TRAINING})</h4>
      {player.training.map(o => {
        const d = divisionTemplate(o.templateId)!;
        const remaining = Math.max(0, o.readyTick - snap.tick);
        return <div className="panel-section" key={o.id} data-testid={'training-' + o.id}>
          <div className="kv"><span>{lang === 'ja' ? d.nameJa : d.nameEn} #{o.id} — {nameOf(o.province)}</span><span>{remaining}/{d.days}</span></div>
          <progress max={d.days} value={d.days - remaining} style={{ width: '100%' }} />
          <button data-testid={'cancel-training-' + o.id} disabled={st.pendingCommands > 0} onClick={() => engineClient.command('cancelTraining', { id: o.id })}>{t(lang, 'mil.cancel')}</button>
        </div>;
      })}
      <h4>{t(lang, 'mil.deployed')} ({player.divisions})</h4>
      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        {snap.units.filter(u => u.owner === snap.playerCountry).map(u => <button key={u.id} onClick={() => appStore.set({ panel: null, selection: { prov: u.loc, unitId: u.id, country: null } })}>#{u.id} {nameOf(u.loc)}</button>)}
      </div>
      <button onClick={() => appStore.set({ panel: null })}>{t(lang, 'common.close')}</button>
    </div>
  </div>;
}

export function ProductionPanel() {
  const st = useApp(), lang = st.lang, p = st.snap!.countries[st.snap!.playerCountry];
  const [share, setShare] = useState(p.productionShare);
  useEffect(() => { setShare(p.productionShare); }, [p.productionShare]);
  return <div className="modal-backdrop" onClick={() => appStore.set({ panel: null })}>
    <div className="modal" data-testid="production-modal" onClick={e => e.stopPropagation()}>
      <h3>{t(lang, 'prod.title')}</h3>
      <PendingOrders />
      <div className="kv"><span>{t(lang, 'country.factories')}</span><b>{p.milFactories}</b></div>
      {([['prod.infStock', p.infEquipmentStock, p.dailyEquipment.infantry, 1 - p.productionShare], ['prod.artStock', p.artEquipmentStock, p.dailyEquipment.artillery, p.productionShare]] as const).map(([key, stock, output, ratio]) => <div key={key} className="panel-section" data-testid={'line-' + key}>
        <h4>{t(lang, key)}</h4><div className="kv"><span>{t(lang, 'prod.allocation')}</span><b>{(ratio * 100).toFixed(0)}%</b></div>
        <progress max={1} value={ratio} style={{ width: '100%' }} />
        <div className="kv"><span>{t(lang, 'prod.dailyOutput')}</span><b>{output.toFixed(2)}</b></div>
        <div className="kv"><span>{t(lang, 'prod.stockpile')}</span><b>{fmtNumber(lang, Math.floor(stock))}</b></div>
      </div>)}
      <label>{t(lang, 'prod.share')} {Math.round(share * 100)}% <input data-testid="production-art-share" type="range" min={0} max={0.5} step={0.05} value={share} onChange={e => setShare(Number(e.target.value))} /></label>
      <button data-testid="apply-production" disabled={st.pendingCommands > 0 || Math.abs(share - p.productionShare) < 0.0001} onClick={() => engineClient.command('setProductionShare', { share })}>{t(lang, 'prod.apply')}</button>
      <div className="row"><button onClick={() => appStore.set({ panel: 'recruit' })}>{t(lang, 'mil.recruit')}</button><button onClick={() => appStore.set({ panel: null })}>{t(lang, 'common.close')}</button></div>
    </div>
  </div>;
}
