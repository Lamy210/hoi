// メインゲーム画面 — 地図中心レイアウト（game-ui仕様: docs/11 §2）
import { useEffect, useRef, useState } from 'react';
import { useApp } from './App';
import { appStore } from './store';
import { t } from './i18n';
import { engineClient, loadGeometry, loadDecoration } from './engineClient';
import { startPacer, stopPacer } from './pacer';
import { divisionTemplate } from '../engine/military/templates';
import type { UiUnit } from '../engine/ui';
import type { MapDataSource, MapRenderer } from './maprender/types';
import { colorsForMode, diffIndices } from './maprender/types';
import { createCanvasRenderer } from './maprender/canvasAdapter';
import { TERRAIN_COLORS, terrainOf } from './maprender/terrainColors';
import { createMaplibreRenderer } from './maprender/maplibreAdapter';
import { AlertFeed, ContextPanel, SaveLoadModal, SettingsModal, AiInspectorModal, FrontsPanel, BudgetPanel, DiplomacyPanel, PendingOrders, RecruitmentPanel, ProductionPanel } from './panels';

const TERRAIN_NAMES = ['plains', 'hills', 'mountains', 'urban', 'forest', 'desert'];

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function GameScreen() {
  const st = useApp();
  const mapRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<(MapRenderer & { setMode?: (m: 'political' | 'terrain' | 'supply', colors: string[]) => void }) | null>(null);
  const dsRef = useRef<MapDataSource | null>(null);
  const terrainArrRef = useRef<number[]>([]);
  const prevArrRef = useRef<{ owner: number[]; controller: number[] } | null>(null);
  const [hoverProv, setHoverProv] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [attackMode, setAttackMode] = useState(false);
  const [destination, setDestination] = useState('');
  const [rosterOpen, setRosterOpen] = useState(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || target?.closest('input, textarea, select, [contenteditable]') || appStore.get().panel) return;
      if (e.key.toLowerCase() === 'f') { e.preventDefault(); setSearch(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const lang = st.lang;
  const meta = st.meta;
  const snap = st.snap;

  // レンダラ初期化（metaが到着した後に1回。スナップショットは到着待ち）
  useEffect(() => {
    if (!st.meta) return;
    setMapReady(false);
    setMapError(null);
    let disposed = false;
    let renderer: MapRenderer & { setMode?: (m: 'political' | 'terrain' | 'supply', colors: string[]) => void } | null = null;
    (async () => {
      let s = appStore.get().snap;
      for (let i = 0; !s && i < 200 && !disposed; i++) {
        await new Promise((res) => setTimeout(res, 50));
        s = appStore.get().snap;
      }
      const m = st.meta;
      if (disposed || !m || !s || !mapRef.current) return;
      terrainArrRef.current = m.provTerrain.map((x) => Math.max(0, TERRAIN_NAMES.indexOf(x)));
      const ds: MapDataSource = {
        loadGeometry: (lod) => loadGeometry(lod),
        loadDecoration: () => loadDecoration(),
        provIds: m.provIds,
        owner: s.owner,
        controller: s.controller,
        countryColors: s.countries.map((c) => c.color),
        viewBbox: m.viewBbox,
        provLabelX: m.provLabelX,
        provLabelY: m.provLabelY,
        provNameJa: m.provNameJa,
        provNameEn: m.provNameEn,
        supplyEff: s.supplyEff,
      };
      dsRef.current = ds;
      prevArrRef.current = { owner: s.owner, controller: s.controller };
      // D-015: 既定はCanvas2D（決定論的表示・全環境で視覚検証可能）。
      // MapLibre GL JSは ?renderer=maplibre 指定時のオプション実装（WebGL環境）。
      const forceMaplibre = new URLSearchParams(location.search).get('renderer') === 'maplibre';
      if (forceMaplibre && hasWebGL()) {
        try {
          renderer = createMaplibreRenderer(mapRef.current, ds);
          await renderer.whenReady();
        } catch (err) {
          renderer?.dispose();
          renderer = createCanvasRenderer(mapRef.current, ds, terrainArrRef.current);
        }
      } else {
        renderer = createCanvasRenderer(mapRef.current, ds, terrainArrRef.current);
      }
      rendererRef.current = renderer;
      await renderer.whenReady();
      if (disposed) {
        renderer.dispose();
        return;
      }
      applyMode(appStore.get().mapMode, new Set());
      setMapReady(true);
    })().catch((err: unknown) => { if (!disposed) setMapError(String(err)); });
    return () => {
      disposed = true;
      renderer?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.meta]);

  // ペーサー起動
  useEffect(() => {
    startPacer();
    return () => stopPacer();
  }, []);

  function applyMode(mode: 'political' | 'terrain' | 'supply', dirty: Set<number>): void {
    const ds = dsRef.current;
    const r = rendererRef.current;
    if (!ds || !r) return;
    const colors = mode === 'terrain' ? terrainArrRef.current.map(i => TERRAIN_COLORS[terrainOf(i)]) : colorsForMode(mode, ds).colors;
    if (r.setMode) {
      r.setMode(mode, colors);
    } else if (dirty.size === 0 || mode === 'terrain') {
      r.rebuildAll(colors);
    } else {
      r.setColors(colors, dirty);
    }
  }

  // スナップショット差分 → 差分再描画（world-map仕様）
  useEffect(() => {
    const r = rendererRef.current;
    const s = appStore.get().snap;
    const ds = dsRef.current;
    if (!r || !s || !ds) return;
    ds.owner = s.owner;
    ds.controller = s.controller;
    ds.supplyEff = s.supplyEff;
    const prev = prevArrRef.current;
    if (prev) {
      const dirty = new Set<number>([...diffIndices(prev.owner, s.owner), ...diffIndices(prev.controller, s.controller)]);
      if (st.mapMode !== 'terrain') applyMode(st.mapMode, dirty);
    }
    prevArrRef.current = { owner: s.owner, controller: s.controller };
    (r as any).setFronts?.(s.fronts.map((f) => ({ provinces: f.provinces, owner: f.owner, stance: f.stance })));
    r.setSelected(s.units.find(u => u.id === st.selection.unitId)?.loc ?? st.selection.prov);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.snap?.tick, st.snap]);

  // モード切替 → 全再構築
  useEffect(() => {
    applyMode(st.mapMode, new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.mapMode]);

  // 選択ハイライト
  useEffect(() => {
    rendererRef.current?.setSelected(appStore.get().snap?.units.find(u => u.id === st.selection.unitId)?.loc ?? st.selection.prov);
  }, [st.selection.prov, st.selection.unitId]);

  // 重要アラートで自動一時停止（設定で無効化はMVPでは未対応・常時有効）
  const lastAlertLenRef = useRef(0);
  useEffect(() => {
    const log = st.alertLog;
    if (log.length > lastAlertLenRef.current) {
      const newest = log[log.length - 1];
      if (newest && newest.priority >= 8) {
        appStore.set({ speed: 0 });
      }
    }
    lastAlertLenRef.current = log.length;
  }, [st.alertLog]);

  // The same selection drives the roster, counters, route and context panel.
  const selectedIds = st.selection.unitIds ?? (st.selection.unitId === null ? [] : [st.selection.unitId]);
  useEffect(() => {
    setMoveMode(false);
    setAttackMode(false);
    setDestination('');
  }, [st.selection, st.panel, st.meta]);
  useEffect(() => {
    if (!mapReady || !snap || !meta) return;
    const selected = new Set(selectedIds);
    const byProvince = new Map<number, UiUnit[]>();
    for (const u of snap.units) {
      if (u.owner !== snap.playerCountry && !snap.countries[snap.playerCountry].atWar.includes(u.owner)) continue;
      const list = byProvince.get(u.loc) ?? [];
      list.push(u);
      byProvince.set(u.loc, list);
    }
    rendererRef.current?.setUnitOverlay([...byProvince].map(([province, list]) => ({
      province, provinceId: meta.provIds[province], count: list.filter(u => u.owner === snap.playerCountry).length,
      hostileCount: list.filter(u => u.owner !== snap.playerCountry).length,
      battle: snap.battles.includes(province),
      label: (lang === 'ja' ? meta.provNameJa[province] : meta.provNameEn[province]) + ' — ' + t(lang, 'units.friendly') + ' ' + list.filter(u => u.owner === snap.playerCountry).length + ' / ' + t(lang, 'units.hostile') + ' ' + list.filter(u => u.owner !== snap.playerCountry).length,
      selected: list.some(u => selected.has(u.id)), moving: list.some(u => u.moving),
    })), snap.units.filter(u => u.owner === snap.playerCountry && selected.has(u.id) && u.moving).map(u => u.route));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, snap, meta, st.selection, lang]);

  // Selecting a deployed division from recruitment or the context panel also centers the map.
  useEffect(() => {
    if (!mapReady || st.selection.unitId === null) return;
    const u = appStore.get().snap?.units.find(x => x.id === st.selection.unitId);
    if (u) rendererRef.current?.focusProvince(u.loc);
  }, [mapReady, st.selection.unitId]);

  if (!meta || !snap) {
    return <div className="screen"><div className="muted">{t(lang, 'misc.loading')}</div></div>;
  }

  const searchResults = search === null ? [] : meta.provIds.map((id, i) => ({ id, i }))
    .filter(({ id, i }) => (meta.provNameJa[i] + meta.provNameEn[i] + id).toLowerCase().includes(search.trim().toLowerCase())).slice(0, 20);
  function chooseProvince(prov: number) {
    appStore.set({ selection: { prov, unitId: null, country: null }, trace: null });
    rendererRef.current?.focusProvince(prov);
    setSearch(null);
  }
  const player = snap.countries[snap.playerCountry];
  const selProv = st.selection.prov;
  const selUnit = st.selection.unitId !== null ? snap.units.find((u) => u.id === st.selection.unitId) : null;

  const gameMeta = meta;
  const gameSnap = snap;
  const ownUnits = snap.units.filter(u => u.owner === snap.playerCountry);
  const chosen = ownUnits.filter(u => selectedIds.includes(u.id));
  const canMove = chosen.length > 0 && chosen.length <= 256 && chosen.every(u => !u.moving && !u.encircled && !u.inBattle) && st.pendingCommands === 0;
  const attackTargets = chosen.length && canMove ? chosen[0].attackTargets.filter(p => chosen.every(u => u.attackTargets.includes(p))) : [];
  const nameOf = (p: number) => lang === 'ja' ? gameMeta.provNameJa[p] : gameMeta.provNameEn[p];
  function selectUnits(ids: number[], focus = true) {
    const valid = ownUnits.filter(u => ids.includes(u.id));
    if (valid.length > 256) { appStore.set({ statusMessage: t(lang, 'units.limit') }); return; }
    const first = valid[0];
    appStore.set({ selection: { prov: first?.loc ?? null, unitId: first?.id ?? null, unitIds: valid.map(u => u.id), country: null }, trace: null });
    if (focus && first) rendererRef.current?.focusProvince(first.loc);
  }
  function sendAttack(prov: number) {
    if (!canMove || !attackTargets.includes(prov)) {
      appStore.set({ statusMessage: t(lang, 'units.attackInvalid') });
      return;
    }
    engineClient.command('attackUnits', { units: chosen.map(u => u.id), target: prov });
    setAttackMode(false); setMoveMode(false); setDestination('');
  }
  function sendMove(prov: number) {
    if (!canMove || !Number.isInteger(prov) || prov < 0 || prov >= gameMeta.provIds.length || chosen.every(u => u.loc === prov)) return;
    if (player.atWar.includes(gameSnap.controller[prov])) { appStore.set({ statusMessage: t(lang, 'reason.useAttack') }); return; }
    engineClient.command('travelUnits', { units: chosen.map(u => u.id), target: prov });
    setMoveMode(false);
    setDestination('');
  }
  function provinceFromEvent(e: React.MouseEvent): { prov: number | null; marker: boolean } {
    const marker = (e.target as Element).closest<HTMLElement>('[data-unit-province]');
    return marker ? { prov: Number(marker.dataset.unitProvince), marker: true } :
      { prov: rendererRef.current?.pickAt(e.clientX, e.clientY) ?? null, marker: false };
  }
  function handleMapContext(e: React.MouseEvent) {
    if (!chosen.length) return;
    e.preventDefault();
    const { prov } = provinceFromEvent(e);
    if (prov !== null) {
      if (attackMode || player.atWar.includes(gameSnap.controller[prov])) sendAttack(prov);
      else sendMove(prov);
    }
  }
  function handleMapClick(e: React.MouseEvent): void {
    const { prov, marker } = provinceFromEvent(e);
    if (prov === null) return;
    if (attackMode) { sendAttack(prov); return; }
    if (moveMode) { sendMove(prov); return; }
    if (marker) {
      const ids = ownUnits.filter(u => u.loc === prov).map(u => u.id);
      if (!ids.length) { appStore.set({ selection: { prov, unitId: null, country: null }, trace: null }); return; }
      selectUnits(e.shiftKey || e.ctrlKey || e.metaKey ? [...new Set([...selectedIds, ...ids])] : ids, false);
      return;
    }
    appStore.set({ selection: { prov, unitId: null, country: null }, trace: null });
  }

  function handleMapMove(e: React.MouseEvent): void {
    const r = rendererRef.current;
    if (!r) return;
    setHoverPos({ x: e.clientX, y: e.clientY });
    const prov = r.pickAt(e.clientX, e.clientY);
    setHoverProv(prov);
  }

  function setSpeed(v: number): void {
    appStore.set({ speed: v });
  }

  const speedButtons: { label: string; v: number }[] = [
    { label: '⏸', v: 0 },
    { label: '×1', v: 1 },
    { label: '×2', v: 2 },
    { label: '×4', v: 4 },
    { label: '×8', v: 8 },
  ];

  const atWarNow = player.atWar.length > 0;

  return (
    <div className={"game" + (moveMode || attackMode ? " move-mode" : "")}>
      <div className="topbar">
        <span className="color-dot" style={{ background: player.color }} />
        <span className="stat"><b>{lang === 'ja' ? player.nameJa : player.nameEn}</b></span>
        <span className="date" data-testid="date">{snap.dateStr}</span>
        {speedButtons.map((b) => (
          <button
            key={b.v}
            className={'speed-btn' + (st.speed === b.v ? ' active' : '')}
            data-testid={'speed-' + b.v}
            onClick={() => setSpeed(b.v)}
          >
            {b.label}
          </button>
        ))}
        {st.perfWarn && <span className="muted">{t(lang, 'misc.tickPerfWarn')}</span>}
        <button data-testid="btn-step-day" onClick={() => engineClient.step(1, appStore.get().lastAlertId)} disabled={st.speed !== 0}>{t(lang, 'game.stepDay')}</button>
        <span style={{ flex: 1 }} />
        <span className="stat">{t(lang, 'game.manpower')}: <b data-testid="manpower">{Math.floor(player.manpowerPool).toLocaleString()}</b></span>
        <span className="stat">{t(lang, 'game.equipment')}: <b data-testid="equipment">{Math.floor(player.infEquipmentStock).toLocaleString()}</b></span>
        <span className="stat">{t(lang, 'game.divisions')}: <b>{player.divisions}</b></span>
        <span className="stat" style={{ color: atWarNow ? '#e08b84' : undefined }}>
          {atWarNow ? t(lang, 'game.atWar') : t(lang, 'game.peace')}
        </span>
        <button data-testid="btn-wars" onClick={() => appStore.set({ panel: st.panel === 'wars' ? null : 'wars' })}>{t(lang, 'panel.wars')}</button>
        <button data-testid="btn-diplomacy" onClick={() => appStore.set({ panel: st.panel === 'diplomacy' ? null : 'diplomacy' })}>{t(lang, 'panel.diplomacy')}</button>
        <button data-testid="btn-fronts-top" onClick={() => appStore.set({ panel: 'fronts' })}>{t(lang, 'panel.fronts')}</button>
        <button data-testid="btn-production" onClick={() => appStore.set({ panel: 'production' })}>{t(lang, 'prod.title')}</button>
        <button data-testid="btn-recruit" onClick={() => appStore.set({ panel: 'recruit' })}>{t(lang, 'mil.recruit')}</button>
        <button data-testid="btn-research" onClick={() => appStore.set({ panel: 'research' })}>{t(lang, 'research.title')}</button>
        <button data-testid="btn-budget" onClick={() => appStore.set({ panel: st.panel === 'budget' ? null : 'budget' })}>{t(lang, 'panel.budget')}</button>
        <button data-testid="btn-save" onClick={() => appStore.set({ panel: 'saveLoad' })}>{t(lang, 'common.save')}/{t(lang, 'common.load')}</button>
        {st.devMode && <button data-testid="btn-ai" onClick={() => appStore.set({ panel: 'aiLog', aiLogCountry: (snap.playerCountry + 1) % snap.countries.length })}>{t(lang, 'panel.aiLog')}</button>}
        <button onClick={() => appStore.set({ panel: 'settings' })}>⚙</button>
      </div>
      {st.panel !== 'budget' && st.panel !== 'research' && st.panel !== 'diplomacy' && st.panel !== 'wars' && st.panel !== 'saveLoad' && st.panel !== 'recruit' && st.panel !== 'production' && <PendingOrders />}
      <div className="main-area">
        <div
          className="map-container"
          ref={mapRef}
          data-testid="map"
          onClick={handleMapClick}
          onContextMenu={handleMapContext}
          onMouseMove={handleMapMove}
          onMouseLeave={() => setHoverProv(null)}
        />
        <div className="map-tools" aria-label={t(lang, 'map.controls')}>
          <button aria-label={t(lang, 'map.zoomIn')} data-testid="map-zoom-in" disabled={!mapReady} onClick={() => rendererRef.current?.zoomBy(1.25)}>＋</button>
          <button aria-label={t(lang, 'map.zoomOut')} data-testid="map-zoom-out" disabled={!mapReady} onClick={() => rendererRef.current?.zoomBy(0.8)}>－</button>
          <button data-testid="map-reset" disabled={!mapReady} onClick={() => rendererRef.current?.resetView()}>{t(lang, 'map.reset')}</button>
        </div>
        {mapError && <div className="status-toast" role="alert">{mapError}</div>}
        {hoverProv !== null && hoverPos && (
          <div
            style={{
              position: 'fixed', left: hoverPos.x + 12, top: hoverPos.y + 12,
              background: 'rgba(16,18,26,0.92)', border: '1px solid #454d61',
              borderRadius: 4, padding: '4px 8px', fontSize: 12, pointerEvents: 'none', zIndex: 30,
            }}
          >
            <b>{(lang === 'ja' ? meta.provNameJa[hoverProv] : meta.provNameEn[hoverProv])}</b>
            {' — '}
            {lang === 'ja' ? snap.countries[snap.controller[hoverProv]]?.nameJa : snap.countries[snap.controller[hoverProv]]?.nameEn}
          </div>
        )}
        <AlertFeed />
        <div className="right-panel">
          <section className="panel-section unit-roster" data-testid="unit-roster">
            <button data-testid="toggle-unit-roster" aria-expanded={rosterOpen} onClick={() => setRosterOpen(!rosterOpen)}>{t(lang, 'units.roster')} ({ownUnits.length}) {rosterOpen ? '▴' : '▾'}</button>
            {rosterOpen && <>
              <div className="muted">{t(lang, 'units.hint')}</div>
              <div className="unit-roster-list">
                {ownUnits.map(u => <div className="unit-roster-entry" key={u.id}>
                  <input type="checkbox" aria-label={t(lang, 'units.select') + ' #' + u.id} data-testid={'unit-check-' + u.id}
                    checked={selectedIds.includes(u.id)} disabled={!selectedIds.includes(u.id) && chosen.length >= 256}
                    onChange={e => selectUnits(e.target.checked ? [...selectedIds, u.id] : selectedIds.filter(id => id !== u.id), false)} />
                  <button data-testid={'unit-roster-' + u.id} data-unit-id={u.id} data-location={meta.provIds[u.loc]} aria-pressed={selectedIds.includes(u.id)}
                    onClick={() => selectUnits([u.id])}>
                    #{u.id} {lang === 'ja' ? divisionTemplate(u.templateId ?? 'standard-v1')?.nameJa : divisionTemplate(u.templateId ?? 'standard-v1')?.nameEn}<br />
                    {nameOf(u.loc)} ({meta.provIds[u.loc]}) — {u.inBattle ? t(lang, 'panel.inBattle') : u.encircled ? t(lang, 'panel.encircled') : u.moving ? t(lang, 'misc.movingTo', { target: nameOf(u.target) }) : t(lang, 'units.idle')}
                  </button>
                </div>)}
                {!ownUnits.length && <span className="muted">{t(lang, 'units.none')}</span>}
              </div>
              <div className="move-controls">
                <span data-testid="selected-unit-count">{t(lang, 'units.selected', { count: chosen.length })}</span>
                <button data-testid="move-selected" disabled={!canMove} aria-pressed={moveMode} onClick={() => { setAttackMode(false); setDestination(''); setMoveMode(!moveMode); }}>{t(lang, moveMode ? 'units.cancelMove' : 'units.move')}</button>
                <button data-testid="attack-selected" className="danger" disabled={!canMove || !attackTargets.length} aria-pressed={attackMode} onClick={() => { setMoveMode(false); setDestination(''); setAttackMode(!attackMode); }}>{t(lang, attackMode ? 'units.cancelAttack' : 'units.attack')}</button>
                {chosen.length > 0 && <button data-testid="focus-unit" onClick={() => rendererRef.current?.focusProvince(chosen[0].loc)}>{t(lang, 'units.focus')}</button>}
              </div>
              {attackMode && <div role="status" data-testid="attack-hint">{t(lang, 'units.attackHint')}</div>}
              {chosen.length > 0 && canMove && attackTargets.length === 0 && <div className="muted">{t(lang, 'units.attackInvalid')}</div>}
              {moveMode && <div role="status" data-testid="move-hint">{t(lang, 'units.destinationHint')}</div>}
              {chosen.length > 0 && !canMove && <div className="muted">{t(lang, 'units.busy')}</div>}
              {chosen.length > 0 && <div className="move-controls">
                <select data-testid="move-destination" aria-label={t(lang, 'units.destination')} value={destination} onChange={e => setDestination(e.target.value)}>
                  <option value="">{t(lang, 'units.destination')}</option>
                  {meta.provIds.map((id, i) => (attackMode ? attackTargets.includes(i) : !player.atWar.includes(snap.controller[i])) && <option key={id} value={i}>{nameOf(i)} ({id})</option>)}
                </select>
                {attackMode ? <button className="danger" data-testid="confirm-attack" disabled={!canMove || destination === '' || !attackTargets.includes(Number(destination))} onClick={() => sendAttack(Number(destination))}>{t(lang, 'units.attack')}</button> : <button data-testid="confirm-move" disabled={!canMove || destination === '' || chosen.every(u => u.loc === Number(destination))} onClick={() => sendMove(Number(destination))}>{t(lang, 'units.move')}</button>}
              </div>}
            </>}
          </section>
          <ContextPanel />
        </div>
        {search !== null && (
          <div className="search-results">
            {searchResults.map(({ id, i }) => (
              <button key={id} type="button" data-testid={'search-result-' + id} className="search-item" onClick={() => chooseProvince(i)}>
                {lang === 'ja' ? meta.provNameJa[i] : meta.provNameEn[i]}（{id}）
              </button>
            ))}
            {searchResults.length === 0 && <div className="muted search-item">{t(lang, 'map.noResults')}</div>}
          </div>
        )}
        {st.statusMessage && (
          <div className="status-toast" onClick={() => appStore.set({ statusMessage: null })}>{st.statusMessage}</div>
        )}
      </div>
      <div className="bottombar">
        {(['political', 'terrain', 'supply'] as const).map((m) => (
          <button key={m} className={'mode-btn' + (st.mapMode === m ? ' active' : '')} data-testid={'mode-' + m} onClick={() => appStore.set({ mapMode: m })}>
            {t(lang, 'map.mode.' + m)}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {st.mapMode === 'supply' && <span className="muted">{t(lang, 'map.supplyLegend')}</span>}
        <button data-testid="btn-province-search" aria-expanded={search !== null} onClick={() => setSearch(search === null ? '' : null)}>🔍 {t(lang, 'misc.provSearch')}</button>
        {search !== null && (
          <input autoFocus data-testid="province-search" aria-label={t(lang, 'misc.provSearch')} value={search}
            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter' && searchResults[0]) { e.preventDefault(); chooseProvince(searchResults[0].i); }
              if (e.key === 'Escape') { e.stopPropagation(); setSearch(null); }
            }} placeholder="Tokyo / 東京" />
        )}
      </div>
      {st.panel === 'saveLoad' && <SaveLoadModal />}
      {st.panel === 'recruit' && <RecruitmentPanel />}
      {st.panel === 'production' && <ProductionPanel />}
      {st.panel === 'settings' && <SettingsModal />}
      {st.panel === 'aiLog' && <AiInspectorModal />}
      {st.panel === 'fronts' && <FrontsPanel />}
      {(st.panel === 'budget' || st.panel === 'research') && <BudgetPanel key={st.panel} initialTab={st.panel} />}
      {(st.panel === 'diplomacy' || st.panel === 'wars') && <DiplomacyPanel key={st.panel} initialTab={st.panel === 'wars' ? 'peace' : 'relations'} />}
      {selProv === null && selUnit === null && null}
    </div>
  );
}
