// メインゲーム画面 — 地図中心レイアウト（game-ui仕様: docs/11 §2）
import { useEffect, useRef, useState } from 'react';
import { useApp } from './App';
import { appStore } from './store';
import { t } from './i18n';
import { engineClient, loadGeometry, loadDecoration } from './engineClient';
import { startPacer, stopPacer } from './pacer';
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
    r.setSelected(st.selection.prov);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.snap?.tick, st.snap]);

  // モード切替 → 全再構築
  useEffect(() => {
    applyMode(st.mapMode, new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.mapMode]);

  // 選択ハイライト
  useEffect(() => {
    rendererRef.current?.setSelected(st.selection.prov);
  }, [st.selection.prov]);

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

  function handleMapClick(e: React.MouseEvent): void {
    const r = rendererRef.current;
    const snapNow = appStore.get().snap;
    if (!r || !snapNow) return;
    const prov = r.pickAt(e.clientX, e.clientY);
    if (prov === null) return;
    const unit = st.selection.unitId !== null ? snapNow.units.find((u) => u.id === st.selection.unitId) : null;
    if (unit && unit.owner === snapNow.playerCountry && unit.loc !== prov && !unit.moving && !unit.encircled) {
      // 選択中師団の移動命令（合法性はエンジンが検証・却下時は警告表示）
      engineClient.command('moveUnits', { units: [unit.id], target: prov });
      appStore.set({ selection: { prov, unitId: unit.id, country: null } });
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
    <div className="game">
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
