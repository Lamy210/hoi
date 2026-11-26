// メインゲーム画面 — 地図中心レイアウト（game-ui仕様: docs/11 §2）
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useApp } from './App';
import { appStore } from './store';
import { t } from './i18n';
import { engineClient, loadGeometry, loadDecoration } from './engineClient';
import { startPacer, stopPacer } from './pacer';
import { ArmyManagement, DivisionResources } from './ArmyManagement';
import {ArmyCommandDock} from './ArmyCommandDock';
import {PortDirectory} from './PortDirectory';
import { OrderOfBattleExplorer } from './OrderOfBattle';
import { divisionsInRectangle, mergeDivisionSelection, type ScreenRect, type SelectionMergeMode } from './mapSelection';
import { provincesInRectangle, updateFrontDraftProvinces, canCommitFrontDraft, canCommitFrontEdit, frontProvinceChangeSummary, provincesAlongStroke, nearestProjectedProvince } from './frontMapPlanning';
import { frontCreationCandidates, type FrontCreationSource } from './frontCreationSelection';
import type {FormationScope} from '../engine/military/formationOverview';
import { divisionTemplate } from '../engine/military/templates';
import type { UiUnit } from '../engine/ui';
import type { MapDataSource, MapRenderer } from './maprender/types';
import { frontView, type FrontVisibility } from './maprender/frontView';
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
  const [portsVisible,setPortsVisible]=useState(true);
  const [search, setSearch] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [attackMode, setAttackMode] = useState(false);
  const [destination, setDestination] = useState('');
  const [rosterOpen, setRosterOpen] = useState(true);
  const [rosterView, setRosterView] = useState<'tree'|'list'>('tree');
  const [focusedFormation,setFocusedFormation]=useState<FormationScope|null>(null);
  const [frontVisibility,setFrontVisibility]=useState<FrontVisibility>('all');
  const [rosterQuery, setRosterQuery] = useState('');
  const [rosterFilter, setRosterFilter] = useState('all');
  const [marqueeMode,setMarqueeMode]=useState(false);
  const [frontDraft,setFrontDraft]=useState<{enemy:number;provinces:number[];edit?:{id:number;revision:number;before:number[]}}|null>(null);
  const [frontDraftSource,setFrontDraftSource]=useState<FrontCreationSource>('none');
  const [frontTargetId,setFrontTargetId]=useState<number|null>(null);
  const [targetStroke,setTargetStroke]=useState<{x:number;y:number}[]>([]);
  const targetStrokeRef=useRef<{x:number;y:number}[]>([]);
  const suppressDraftClick=useRef(false);
  const [marquee,setMarquee]=useState<ScreenRect|null>(null);
  const marqueePointer=useRef<{id:number;origin:{x:number;y:number}}|null>(null);
  const rosterRangeAnchor=useRef<number|null>(null);
  const skipFocusId=useRef<number|null>(null);
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

  // Maritime markers are a read-only overlay. Their province coordinates are
  // projected by whichever renderer is active (Canvas2D or MapLibre).
  useEffect(()=>{
    const r=rendererRef.current,m=appStore.get().meta,snap=appStore.get().snap;
    if(!r||!mapReady||!m||!snap)return;
    const selected=snap.units.find(u=>u.id===appStore.get().selection.unitId)?.loc
      ??appStore.get().selection.prov;
    const ports=portsVisible?(m.maritime?.ports??[]).map(p=>{
      const zone=m.maritime?.seaZones.find(z=>z.id===p.zoneId);
      const c=snap.controller[p.province];
      const country=c>=0?snap.countries[c]:undefined;
      return {
        id:p.id,province:p.province,capacity:p.capacity,selected:selected===p.province,
        controlledByPlayer:c===snap.playerCountry,
        label:'⚓ '+(st.lang==='ja'?m.provNameJa[p.province]:m.provNameEn[p.province])+
          ' · '+(zone?(st.lang==='ja'?zone.nameJa:zone.nameEn):p.zoneId)+
          ' · '+(country?(st.lang==='ja'?country.nameJa:country.nameEn):'–'),
      };
    }):[];
    r.setPortOverlay(ports,prov=>{
      appStore.set({selection:{prov,unitId:null,country:null},trace:null});
      rendererRef.current?.focusProvince(prov);
    });
  },[mapReady,st.meta,st.snap,st.lang,st.selection.prov,st.selection.unitId,portsVisible]);

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

  useEffect(()=>{
    if(!mapReady||!snap)return;
    const layers=frontView(snap,selectedIds,frontVisibility)
      .filter(layer=>layer.id!==frontDraft?.edit?.id)
      .map(layer=>layer.id===frontTargetId?{...layer,highlighted:true}:layer);
    if(frontDraft)layers.push({id:-1,provinces:frontDraft.provinces.filter(p=>snap.controller[p]===snap.playerCountry),
      links:[],targets:[],arrows:[],stance:'draft',paused:false,highlighted:true});
    rendererRef.current?.setFrontOverlay(layers);
  },[mapReady,snap,st.selection,frontVisibility,frontDraft,frontTargetId]);

  // Selecting a deployed division from recruitment or the context panel also centers the map.
  useEffect(() => {
    if (!mapReady || st.selection.unitId === null) return;
    if(skipFocusId.current===st.selection.unitId){skipFocusId.current=null;return;}
    skipFocusId.current=null;
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
  const frontEnemyOptions=snap.countries.flatMap((country,index)=>
    country.alive&&index!==snap.playerCountry?[index]:[]);
  const activeFronts=snap.fronts.filter(f=>f.owner===snap.playerCountry&&snap.countries[f.enemy]?.alive);
  const targetFront=activeFronts.find(f=>f.id===frontTargetId);
  const draftReady=frontDraft!==null&&canCommitFrontDraft(frontDraft.provinces,frontDraft.enemy,
    snap.playerCountry,snap.controller,frontEnemyOptions,st.pendingCommands>0);
  const editCurrent=frontDraft?.edit?activeFronts.find(f=>f.id===frontDraft.edit?.id):undefined;
  const editDiff=frontDraft?.edit?frontProvinceChangeSummary(frontDraft.edit.before,frontDraft.provinces):null;
  const editReady=frontDraft?.edit!==undefined&&editCurrent!==undefined&&
    editCurrent.enemy===frontDraft.enemy&&
    canCommitFrontEdit(frontDraft.edit.before,frontDraft.provinces,
      frontDraft.edit.revision,editCurrent.revision,frontDraft.enemy,
      snap.playerCountry,snap.controller,frontEnemyOptions,st.pendingCommands>0);
  const selProv = st.selection.prov;
  const selUnit = st.selection.unitId !== null ? snap.units.find((u) => u.id === st.selection.unitId) : null;

  const gameMeta = meta;
  const gameSnap = snap;
  const ownUnits = snap.units.filter(u => u.owner === snap.playerCountry);
  const chosen = ownUnits.filter(u => selectedIds.includes(u.id));
  const frontCreation=frontCreationCandidates(snap,frontDraftSource,selectedIds);
  const draftHasInvalidBatch=frontDraftSource!=='none'&&
    (!frontCreation.ids.length||frontCreation.ids.length>256);
  const visibleUnits = ownUnits.filter(u => {
    const a = snap.armies.find(a => a.id === u.armyId);
    const text = [String(u.id), meta.provIds[u.loc], meta.provNameJa[u.loc], meta.provNameEn[u.loc], a?.name ?? ''].join(' ').toLowerCase();
    if (!text.includes(rosterQuery.trim().toLowerCase())) return false;
    if (rosterFilter === 'unassigned') return u.armyId === null;
    if (rosterFilter === 'lowSupply') return u.supply < 0.5;
    if (rosterFilter === 'deficit') return u.manpower < u.maxManpower || u.infEquipment < u.maxInfEquipment || u.artEquipment < u.maxArtEquipment;
    if (rosterFilter === 'selected') return selectedIds.includes(u.id);
    return true;
  });
  const canControl = chosen.length > 0 && chosen.length <= 256 && chosen.every(u => !u.encircled && !u.inBattle) && st.pendingCommands === 0;
  const canMove = canControl && chosen.every(u => !u.moving);
  const canRedirect = canControl && chosen.every(u=>!u.moving || u.segmentProgress===0 || (u.nextProvince>=0 && !player.atWar.includes(snap.controller[u.nextProvince])));
  const hasMoving = chosen.some(u=>u.moving);
  const attackTargets = chosen.length && canMove ? chosen[0].attackTargets.filter(p => chosen.every(u => u.attackTargets.includes(p))) : [];
  const nameOf = (p: number) => lang === 'ja' ? gameMeta.provNameJa[p] : gameMeta.provNameEn[p];
  function selectUnits(ids: number[], focus = true) {
    const valid = ownUnits.filter(u => ids.includes(u.id));
    if (valid.length > 256) { appStore.set({ statusMessage: t(lang, 'units.limit') }); return; }
    const first = valid[0];
    if(!focus)skipFocusId.current=first?.id??null;
    appStore.set({ selection: { prov: first?.loc ?? null, unitId: first?.id ?? null, unitIds: valid.map(u => u.id), country: null }, trace: null });
    if (focus && first) rendererRef.current?.focusProvince(first.loc);
  }
  function toggleMoveSelection() {
    setFrontDraft(null);setFrontTargetId(null);
    setMarqueeMode(false);
    setMarquee(null);
    marqueePointer.current=null;
    setAttackMode(false);
    setDestination('');
    setMoveMode(!moveMode);
  }
  function toggleAttackSelection() {
    setFrontDraft(null);setFrontTargetId(null);
    setMarqueeMode(false);
    setMarquee(null);
    marqueePointer.current=null;
    setMoveMode(false);
    setDestination('');
    setAttackMode(!attackMode);
  }
  function haltSelection() {
    if (!canControl) return;
    engineClient.command('haltUnits',{units:chosen.map(u=>u.id)});
    setMoveMode(false);
    setAttackMode(false);
    setDestination('');
  }
  function clearSelection() {
    setMoveMode(false);
    setAttackMode(false);
    setDestination('');
    selectUnits([],false);
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
    if (!canRedirect || !Number.isInteger(prov) || prov < 0 || prov >= gameMeta.provIds.length || chosen.every(u => !u.moving && u.loc === prov)) return;
    if (player.atWar.includes(gameSnap.controller[prov])) { appStore.set({ statusMessage: t(lang, 'reason.useAttack') }); return; }
    engineClient.command(hasMoving?'redirectUnits':'travelUnits', { units: chosen.map(u => u.id), target: prov });
    setMoveMode(false);
    setDestination('');
  }
  function provinceFromEvent(e: React.MouseEvent): { prov: number | null; marker: boolean } {
    const marker = (e.target as Element).closest<HTMLElement>('[data-unit-province]');
    return marker ? { prov: Number(marker.dataset.unitProvince), marker: true } :
      { prov: rendererRef.current?.pickAt(e.clientX, e.clientY) ?? null, marker: false };
  }
  function handleMapContext(e: React.MouseEvent) {
    if(frontDraft||frontTargetId!==null){e.preventDefault();return;}
    if (!chosen.length) return;
    e.preventDefault();
    const { prov } = provinceFromEvent(e);
    if (prov !== null) {
      if (attackMode || player.atWar.includes(gameSnap.controller[prov])) sendAttack(prov);
      else sendMove(prov);
    }
  }
  function updateOffensiveTargets(provinces:readonly number[],mode:SelectionMergeMode){
    const f=activeFronts.find(row=>row.id===frontTargetId);
    if(!f||st.pendingCommands>0)return;
    const controlled=gameSnap.controller.flatMap((c,p)=>c===f.enemy?[p]:[]);
    const targets=mergeDivisionSelection(f.targets,provinces,controlled,mode);
    if(targets===null){
      appStore.set({statusMessage:lang==='ja'?'目標は最大256州まで':'Maximum 256 objective provinces'});
      return;
    }
    if(targets.join(',')!==f.targets.slice().sort((a,b)=>a-b).join(',')){
      engineClient.command('setFrontStance',{frontId:f.id,stance:f.stance,targets});
    }
    setFrontTargetId(null);
    targetStrokeRef.current=[];
    setTargetStroke([]);
  }

  function handleMapClick(e: React.MouseEvent): void {
    const { prov, marker } = provinceFromEvent(e);
    if (prov === null) return;
    if(frontTargetId!==null){
      const front=activeFronts.find(row=>row.id===frontTargetId);
      if(!front)return;
      if(gameSnap.controller[prov]!==front.enemy){
        appStore.set({statusMessage:lang==='ja'?'指定戦線の敵支配州を選択してください':'Choose a province controlled by the front enemy'});
        return;
      }
      updateOffensiveTargets([prov],e.altKey?'remove':e.ctrlKey||e.metaKey||e.shiftKey?'add':'replace');
      return;
    }
    if (attackMode) { sendAttack(prov); return; }
    if (moveMode) { sendMove(prov); return; }
    if (marker) {
      const ids = ownUnits.filter(u => u.loc === prov).map(u => u.id);
      if (!ids.length) { appStore.set({ selection: { prov, unitId: null, country: null }, trace: null }); return; }
      const mode:SelectionMergeMode=e.altKey?'remove':e.ctrlKey||e.metaKey?'toggle':e.shiftKey?'add':'replace';
      const next=mergeDivisionSelection(selectedIds,ids,ownUnits.map(u=>u.id),mode);
      if(next===null)appStore.set({statusMessage:t(lang,'units.limit')});
      else selectUnits(next,false);
      return;
    }
    appStore.set({ selection: { prov, unitId: null, country: null }, trace: null });
  }

  function handleRosterUnitClick(e:ReactMouseEvent<HTMLButtonElement>,unit:UiUnit){
    const ids=visibleUnits.map(u=>u.id);
    const anchor=rosterRangeAnchor.current===null?-1:ids.indexOf(rosterRangeAnchor.current);
    const index=ids.indexOf(unit.id);
    let incoming=[unit.id];
    let mode:SelectionMergeMode='replace';
    if(e.shiftKey&&anchor>=0&&index>=0){
      incoming=ids.slice(Math.min(anchor,index),Math.max(anchor,index)+1);
      mode='add';
    }else if(e.ctrlKey||e.metaKey)mode='toggle';
    const next=mergeDivisionSelection(selectedIds,incoming,ownUnits.map(u=>u.id),mode);
    if(next===null)appStore.set({statusMessage:t(lang,'units.limit')});
    else selectUnits(next,mode==='replace');
    if(!e.shiftKey||anchor<0)rosterRangeAnchor.current=unit.id;
  }

  function pointInMarquee(e:ReactPointerEvent<HTMLDivElement>){
    const rect=e.currentTarget.getBoundingClientRect();
    return {x:Math.max(0,Math.min(rect.width,e.clientX-rect.left)),
      y:Math.max(0,Math.min(rect.height,e.clientY-rect.top))};
  }
  function beginMarquee(e:ReactPointerEvent<HTMLDivElement>){
    if(e.button!==0 || marqueePointer.current || !mapReady) return;
    e.preventDefault();
    const origin=pointInMarquee(e);
    marqueePointer.current={id:e.pointerId,origin};
    if(frontTargetId!==null){
      targetStrokeRef.current=[origin];
      setTargetStroke([origin]);
    }else{
      setMarquee({x1:origin.x,y1:origin.y,x2:origin.x,y2:origin.y});
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveMarquee(e:ReactPointerEvent<HTMLDivElement>){
    const current=marqueePointer.current;
    if(current?.id!==e.pointerId)return;
    const p=pointInMarquee(e);
    if(frontTargetId!==null){
      const previous=targetStrokeRef.current;
      if(previous.length===0||Math.hypot(p.x-previous[previous.length-1].x,p.y-previous[previous.length-1].y)>=3){
        targetStrokeRef.current=[...previous,p];
        setTargetStroke(targetStrokeRef.current);
      }
    }else setMarquee({x1:current.origin.x,y1:current.origin.y,x2:p.x,y2:p.y});
  }
  function endMarquee(e:ReactPointerEvent<HTMLDivElement>,cancel=false){
    const current=marqueePointer.current;
    if(current?.id!==e.pointerId)return;
    marqueePointer.current=null;
    setMarquee(null);
    const p=pointInMarquee(e);
    const stroke=[...targetStrokeRef.current,p];
    targetStrokeRef.current=[];
    setTargetStroke([]);
    if(cancel||Math.hypot(p.x-current.origin.x,p.y-current.origin.y)<5)return;
    const r=rendererRef.current;
    if(!r)return;
    if(frontTargetId!==null){
      suppressDraftClick.current=true;
      const front=activeFronts.find(row=>row.id===frontTargetId);
      if(!front)return;
      const targets=provincesAlongStroke(gameSnap.controller,front.enemy,province=>r.projectProvince(province),stroke);
      if(targets.length){
        updateOffensiveTargets(targets,e.altKey?'remove':e.ctrlKey||e.metaKey||e.shiftKey?'add':'replace');
      }else{
        appStore.set({statusMessage:lang==='ja'?'線上に敵国州がありません。もう一度描いてください。':'No enemy provinces on this stroke. Try again.'});
      }
      return;
    }
    const box={x1:current.origin.x,y1:current.origin.y,x2:p.x,y2:p.y};
    const mode:SelectionMergeMode=e.altKey?'remove':e.ctrlKey||e.metaKey||e.shiftKey?'add':'replace';
    if(frontDraft){
      suppressDraftClick.current=true;
      const incoming=provincesInRectangle(gameSnap.controller,gameSnap.playerCountry,
        province=>r.projectProvince(province),box);
      const next=updateFrontDraftProvinces(frontDraft.provinces,incoming,gameSnap.controller,gameSnap.playerCountry,mode);
      if(next===null)appStore.set({statusMessage:lang==='ja'?'戦線州は最大256件まで':'Maximum 256 front provinces'});
      else setFrontDraft({...frontDraft,provinces:next});
      return;
    }
    const incoming=divisionsInRectangle(ownUnits,province=>r.projectProvince(province),box);
    const next=mergeDivisionSelection(selectedIds,incoming,ownUnits.map(u=>u.id),mode);
    if(next===null)appStore.set({statusMessage:t(lang,'units.limit')});
    else selectUnits(next,false);
  }
  function toggleMarquee(){
    setFrontDraft(null);setFrontTargetId(null);
    marqueePointer.current=null;
    setMarquee(null);
    setMarqueeMode(!marqueeMode);
    setMoveMode(false);
    setAttackMode(false);
    setDestination('');
  }

  function startFrontDraft(){
    if(!mapReady||!frontEnemyOptions.length)return;
    setFrontDraft({enemy:player.atWar[0]??frontEnemyOptions[0],provinces:[]});
    setFrontDraftSource(selectedIds.length?'selected':'none');
    setFrontTargetId(null);
    setMarqueeMode(false);
    setMoveMode(false);setAttackMode(false);setDestination('');
    setFrontVisibility('all');
    setHoverProv(null);
  }
  function selectFrontForEdit(frontId:number){
    const existing=activeFronts.find(f=>f.id===frontId);
    if(!existing||!mapReady)return;
    setFrontDraft({enemy:existing.enemy,provinces:[...new Set(existing.provinces)].sort((a,b)=>a-b),
      edit:{id:existing.id,revision:existing.revision,before:[...existing.provinces]}});
    setFrontDraftSource('none');
    setFrontTargetId(null);
    setMarqueeMode(false);
    setMoveMode(false);setAttackMode(false);setDestination('');
    setFrontVisibility('all');
    setMarquee(null);
  }
  function startFrontEdit(){
    if(!mapReady||!activeFronts.length)return;
    selectFrontForEdit(activeFronts[0].id);
  }

  function startFrontTarget(){
    if(!mapReady||!activeFronts.length)return;
    setFrontTargetId(activeFronts[0].id);
    setFrontDraft(null);
    setMarqueeMode(false);
    setMoveMode(false);setAttackMode(false);setDestination('');
    setFrontVisibility('all');
  }
  function clickFrontDraft(e:ReactMouseEvent<HTMLDivElement>){
    e.stopPropagation();
    if(suppressDraftClick.current){suppressDraftClick.current=false;return;}
    const rect=mapRef.current?.getBoundingClientRect();
    const r=rendererRef.current;
    const requestedOwner=frontTargetId===null?gameSnap.playerCountry:
      activeFronts.find(row=>row.id===frontTargetId)?.enemy;
    const snapped=rect&&r&&requestedOwner!==undefined?nearestProjectedProvince(
      gameSnap.controller,requestedOwner,p=>r.projectProvince(p),
      {x:e.clientX-rect.left,y:e.clientY-rect.top}):null;
    const prov=snapped??r?.pickAt(e.clientX,e.clientY);
    if(prov===null||prov===undefined)return;
    if(frontTargetId!==null){
      const f=activeFronts.find(row=>row.id===frontTargetId);
      if(!f)return;
      if(gameSnap.controller[prov]!==f.enemy){
        appStore.set({statusMessage:lang==='ja'?'敵国支配州を指定してください':'Select an enemy-controlled province'});
        return;
      }
      updateOffensiveTargets([prov],e.altKey?'remove':e.ctrlKey||e.metaKey||e.shiftKey?'add':'replace');
      return;
    }
    if(!frontDraft)return;
    if(gameSnap.controller[prov]!==gameSnap.playerCountry){
      appStore.set({statusMessage:lang==='ja'?'自国支配州のみ戦線に指定できます':'Only controlled provinces may be drafted'});
      return;
    }
    const mode:SelectionMergeMode=e.altKey?'remove':e.ctrlKey||e.metaKey||e.shiftKey?'add':'toggle';
    const next=updateFrontDraftProvinces(frontDraft.provinces,[prov],gameSnap.controller,gameSnap.playerCountry,mode);
    if(next===null)appStore.set({statusMessage:lang==='ja'?'戦線州は最大256件まで':'Maximum 256 front provinces'});
    else setFrontDraft({...frontDraft,provinces:next});
  }
  function commitFrontDraft(){
    if(!frontDraft||!canCommitFrontDraft(frontDraft.provinces,frontDraft.enemy,gameSnap.playerCountry,
      gameSnap.controller,frontEnemyOptions,st.pendingCommands>0))return;
    if(frontDraft.edit){
      if(!editReady)return;
      engineClient.command('updateFrontProvinces',{frontId:frontDraft.edit.id,
        expectedRevision:frontDraft.edit.revision,provinces:frontDraft.provinces});
      setFrontDraft(null);
      return;
    }
    if(draftHasInvalidBatch)return;
    engineClient.command('createFront',{enemy:frontDraft.enemy,provinces:frontDraft.provinces,
      ...(frontDraftSource==='none'?{}:{units:frontCreation.ids})});
    setFrontDraft(null);
  }

  function handleMapMove(e: React.MouseEvent): void {
    if(marqueeMode||frontDraft||frontTargetId!==null)return;
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
      {st.panel !== 'fronts' && st.panel !== 'budget' && st.panel !== 'research' && st.panel !== 'diplomacy' && st.panel !== 'wars' && st.panel !== 'saveLoad' && st.panel !== 'recruit' && st.panel !== 'production' && <PendingOrders />}
      <div className="main-area">
        <div
          className="map-container"
          ref={mapRef}
          data-testid="map"
          onClick={handleMapClick}
          onContextMenu={handleMapContext}
          onMouseMove={handleMapMove}
          onMouseLeave={() => setHoverProv(null)}
        >
          {(marqueeMode||frontDraft||frontTargetId!==null)&&<div className="map-marquee-layer" data-testid="map-marquee-layer"
            aria-label={frontTargetId!==null?(lang==='ja'?'ドラッグで攻勢計画線を描く':'Drag to sketch offensive line'):frontDraft?(lang==='ja'?'戦線州をクリックまたは矩形ドラッグ':'Click or drag to draft a front'):(lang==='ja'?'ドラッグで師団を矩形選択':'Drag to box-select divisions')}
            onPointerDown={beginMarquee}
            onPointerMove={moveMarquee}
            onPointerUp={e=>endMarquee(e)}
            onPointerCancel={e=>endMarquee(e,true)}
            onLostPointerCapture={e=>endMarquee(e,true)}
            onClick={clickFrontDraft}
            onContextMenu={e=>{e.preventDefault();e.stopPropagation();}}>
            {targetStroke.length>1&&<svg className="front-stroke-preview" data-testid="map-offensive-stroke" aria-hidden="true">
              <polyline points={targetStroke.map(point=>point.x+','+point.y).join(' ')} />
            </svg>}
            {marquee&&<div className="map-marquee-rectangle" data-testid="map-marquee-rectangle" aria-hidden="true"
              style={{left:Math.min(marquee.x1,marquee.x2),top:Math.min(marquee.y1,marquee.y2),
                width:Math.abs(marquee.x2-marquee.x1),height:Math.abs(marquee.y2-marquee.y1)}}/>}
          </div>}
        </div>
        <div className="map-tools" aria-label={t(lang, 'map.controls')}>
          <button aria-label={t(lang, 'map.zoomIn')} data-testid="map-zoom-in" disabled={!mapReady} onClick={() => rendererRef.current?.zoomBy(1.25)}>＋</button>
          <button aria-label={t(lang, 'map.zoomOut')} data-testid="map-zoom-out" disabled={!mapReady} onClick={() => rendererRef.current?.zoomBy(0.8)}>－</button>
          <button type="button" data-testid="map-port-visibility" aria-pressed={portsVisible}
            disabled={!meta.maritime?.ports.length} onClick={()=>setPortsVisible(v=>!v)}>
            ⚓ {lang==='ja'?'港':'Ports'} ({meta.maritime?.ports.length??0})
          </button>
          <select data-testid="front-visibility" aria-label={lang==='ja'?'戦線表示':'Front visibility'} value={frontVisibility} onChange={e=>setFrontVisibility(e.target.value as FrontVisibility)}><option value="all">{lang==='ja'?'全戦線':'All fronts'}</option><option value="selected">{lang==='ja'?'選択部隊の戦線':'Selected fronts'}</option><option value="off">{lang==='ja'?'戦線非表示':'Hide fronts'}</option></select>
          <button data-testid="map-reset" disabled={!mapReady} onClick={() => rendererRef.current?.resetView()}>{t(lang, 'map.reset')}</button>
          <button type="button" data-testid="map-box-select" aria-pressed={marqueeMode} disabled={!mapReady}
            onClick={toggleMarquee}>{marqueeMode?(lang==='ja'?'範囲選択を終了':'Exit box select'):(lang==='ja'?'▱ 範囲選択':'▱ Box select')}</button>
          <button type="button" data-testid="map-front-draw" disabled={!mapReady||!frontEnemyOptions.length}
            aria-pressed={frontDraft!==null&&!frontDraft.edit} onClick={()=>frontDraft&&!frontDraft.edit?setFrontDraft(null):startFrontDraft()}>
            {frontDraft&&!frontDraft.edit?(lang==='ja'?'戦線指定終了':'Exit front draft'):(lang==='ja'?'✎ 戦線指定':'Draw front')}</button>
          <button type="button" data-testid="map-front-edit" disabled={!mapReady||!activeFronts.length}
            aria-pressed={frontDraft?.edit!==undefined}
            onClick={()=>frontDraft?.edit?setFrontDraft(null):startFrontEdit()}>
            {frontDraft?.edit?(lang==='ja'?'編集終了':'Exit edit'):(lang==='ja'?'✎ 戦線を修正':'Edit frontline')}</button>
          <button type="button" data-testid="map-front-target-mode" disabled={!mapReady||!activeFronts.length}
            aria-pressed={frontTargetId!==null} onClick={()=>frontTargetId!==null?setFrontTargetId(null):startFrontTarget()}>
            {frontTargetId!==null?(lang==='ja'?'目標指定終了':'Exit objective'):(lang==='ja'?'◇ 攻勢目標':'Set objective')}</button>
        </div>
        {frontDraft&&<div className="map-front-planner" data-testid="map-front-planner">
          <b>{frontDraft.edit?(lang==='ja'?'既存戦線の州範囲を修正':'Edit existing front provinces'):
            (lang==='ja'?'地図で戦線を指定':'Draft frontline on map')}</b>
          {frontDraft.edit&&<label>{lang==='ja'?'編集する戦線':'Front to edit'}
            <select data-testid="map-front-edit-select" value={frontDraft.edit.id}
              onChange={e=>selectFrontForEdit(Number(e.target.value))}>
              {activeFronts.map(f=><option key={f.id} value={f.id}>
                #{f.id} {lang==='ja'?snap.countries[f.enemy].nameJa:snap.countries[f.enemy].nameEn}
              </option>)}
            </select>
          </label>}
          {!frontDraft.edit&&<label>{lang==='ja'?'交戦相手':'Enemy'}
            <select data-testid="map-front-enemy" value={frontDraft.enemy} onChange={e=>
              setFrontDraft({enemy:Number(e.target.value),provinces:[]})}>
              {frontEnemyOptions.map(enemy=><option value={enemy} key={enemy}>
                {lang==='ja'?snap.countries[enemy].nameJa:snap.countries[enemy].nameEn}
              </option>)}
            </select>
          </label>}
          <span data-testid="map-front-draft-count">{lang==='ja'?'指定州':'Provinces'}: {frontDraft.provinces.length}</span>
          {frontDraft.edit&&<div data-testid="map-front-edit-preview">
            {lang==='ja'?'追加':'Added'}: {editDiff?.added??0} · {lang==='ja'?'削除':'Removed'}: {editDiff?.removed??0}
            {editCurrent?.revision!==frontDraft.edit.revision&&<div role="alert" className="muted">
              {lang==='ja'?'戦線の内容が更新されています。再選択して編集し直してください。':'Front changed. Reselect it to edit the latest version.'}
            </div>}
            <small className="muted">{lang==='ja'?'既存の編入師団・攻勢目標・攻撃スタンスを維持します。':'Assigned divisions, targets and stance are preserved.'}</small>
          </div>}
          {!frontDraft.edit&&<label>{lang==='ja'?'戦線に紐づける部隊':'Assign divisions on creation'}
            <select data-testid="map-front-assignment-source" value={frontDraftSource}
              onChange={e=>setFrontDraftSource(e.target.value as FrontCreationSource)}>
              <option value="none">{lang==='ja'?'戦線のみ作成（後で編入）':'Create front only'}</option>
              <option value="selected">{lang==='ja'?'地図・一覧で選択中の師団':'Selected divisions'}</option>
              <option value="unassigned">{lang==='ja'?'軍未所属の師団':'Divisions without an army'}</option>
              {snap.armyGroups.filter(g=>g.owner===snap.playerCountry).map(g=><option key={'g'+g.id} value={'group:'+g.id}>
                {lang==='ja'?'軍集団':'Group'}: {g.name}
              </option>)}
              {snap.armies.filter(a=>a.owner===snap.playerCountry).map(a=><option key={'a'+a.id} value={'army:'+a.id}>
                {lang==='ja'?'軍':'Army'}: {a.name}
              </option>)}
            </select>
          </label>}
          {!frontDraft.edit&&frontDraftSource!=='none'&&<div data-testid="map-front-assignment-preview">
            {lang==='ja'?'同時編入':'Atomic assignment'}: {frontCreation.ids.length}
            {frontCreation.alreadyAssigned>0&&<span> · {lang==='ja'?'既存戦線の所属を維持':'Already assigned'}: {frontCreation.alreadyAssigned}</span>}
            {frontCreation.manualHold>0&&<span> · {lang==='ja'?'手動固定を維持':'Manual hold preserved'}: {frontCreation.manualHold}</span>}
            {draftHasInvalidBatch&&<small className="muted">{lang==='ja'?'対象は1〜256師団を選んでください':'Select 1–256 unassigned divisions'}</small>}
          </div>}
          <div className="muted">{lang==='ja'?'クリック:追加・解除 / 矩形ドラッグ:置換 / Shift・Ctrl:追加 / Alt:除外':
            'Click: toggle / drag: replace / Shift or Ctrl: add / Alt: remove'}</div>
          <div className="row">
            <button data-testid={frontDraft.edit?'map-front-save':'map-front-create'} className="primary"
              disabled={frontDraft.edit?!editReady:!draftReady||draftHasInvalidBatch} onClick={commitFrontDraft}>
              {frontDraft.edit?(lang==='ja'?'戦線変更を保存':'Save frontline'):
                lang==='ja'?(frontDraftSource==='none'?'戦線を作成':'戦線作成と部隊編入'):(frontDraftSource==='none'?'Create front':'Create and assign')}</button>
            <button data-testid="map-front-clear" disabled={!frontDraft.provinces.length} onClick={()=>
              setFrontDraft({...frontDraft,provinces:[]})}>{lang==='ja'?'指定解除':'Clear'}</button>
            <button data-testid={frontDraft.edit?'map-front-edit-cancel':'map-front-cancel'} onClick={()=>setFrontDraft(null)}>{lang==='ja'?'キャンセル':'Cancel'}</button>
          </div>
          <small className="muted">{frontDraft.edit
            ?(lang==='ja'?'保存するまでは作戦に反映されません。0州の戦線は保存できません。':'Changes do not affect orders until saved. An empty front cannot be saved.')
            :(lang==='ja'?'作成と編入は一度に確定します。既存戦線から師団を奪わず手動固定も維持。平時の戦線は停止状態です。':
              'Creation and assignment are atomic. Existing assignments and manual holds remain intact. Pre-war fronts start paused.')}</small>
        </div>}
        {frontTargetId!==null&&<div className="map-front-planner" data-testid="map-front-target-planner">
          <b>{lang==='ja'?'地図で攻勢目標を指定':'Pick offensive objective'}</b>
          <label>{lang==='ja'?'対象戦線':'Front'}
            <select data-testid="map-target-front" value={targetFront?.id??''} onChange={e=>setFrontTargetId(Number(e.target.value))}>
              {activeFronts.map(f=><option value={f.id} key={f.id}>#{f.id} {lang==='ja'?snap.countries[f.enemy].nameJa:snap.countries[f.enemy].nameEn}</option>)}
            </select>
          </label>
          <div className="muted">{lang==='ja'?'敵国州をクリック、またはドラッグで攻勢線を描く。Shift/Ctrl:追加、Alt:除外。計画だけでは攻撃しません。':
            'Click an enemy province or drag an offensive line. Shift/Ctrl: add, Alt: remove. Planning never launches attacks.'}</div>
          <div className="row">
            <button data-testid="map-target-clear" disabled={!targetFront?.targets.length||st.pendingCommands>0}
              onClick={()=>{
                if(targetFront){engineClient.command('setFrontStance',{frontId:targetFront.id,stance:targetFront.stance,targets:[]});setFrontTargetId(null);}
              }}>{lang==='ja'?'目標を自動選択へ戻す':'Clear objectives'}</button>
            <button data-testid="map-target-cancel" onClick={()=>setFrontTargetId(null)}>{lang==='ja'?'キャンセル':'Cancel'}</button>
          </div>
        </div>}
        {marqueeMode&&<div className="map-marquee-hint" data-testid="map-marquee-hint" role="status">
          {lang==='ja'?'ドラッグで師団を囲む · Ctrl/⌘/Shift:追加 · Alt:除外 · 最大256師団':
            'Drag around divisions · Ctrl/⌘/Shift: add · Alt: remove · max 256'}
        </div>}
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
              {chosen.length>0&&<div className="quick-unit-actions" data-testid="quick-unit-actions"
                role="toolbar" aria-label={lang==='ja'?'選択師団の即時操作':'Selected divisions quick actions'}>
                <strong data-testid="quick-selected-count">{lang==='ja'?'選択':'Selected'} {chosen.length}</strong>
                <div className="quick-unit-buttons">
                  <button data-testid="quick-move-selected" disabled={!canRedirect} aria-pressed={moveMode}
                    onClick={toggleMoveSelection}>{moveMode?(lang==='ja'?'移動取消':'Cancel move'):hasMoving?(lang==='ja'?'移動先変更':'Redirect'):(lang==='ja'?'移動':'Move')}</button>
                  <button data-testid="quick-attack-selected" className="danger" disabled={!canMove||!attackTargets.length}
                    aria-pressed={attackMode} onClick={toggleAttackSelection}>{attackMode?(lang==='ja'?'攻撃取消':'Cancel attack'):(lang==='ja'?'攻撃':'Attack')}</button>
                  <button data-testid="quick-halt-selected" disabled={!canControl}
                    onClick={haltSelection}>{lang==='ja'?'停止':'Halt'}</button>
                  <button data-testid="quick-open-fronts" disabled={!chosen.length}
                    onClick={()=>appStore.set({panel:'fronts'})}>{lang==='ja'?'戦線':'Front'}</button>
                  <button data-testid="quick-focus-selected"
                    onClick={()=>rendererRef.current?.focusProvince(chosen[0].loc)}>{lang==='ja'?'位置':'Locate'}</button>
                  <button data-testid="quick-clear-selection" onClick={clearSelection}>{lang==='ja'?'選択解除':'Clear'}</button>
                </div>
                <small className="muted">{attackMode
                  ? t(lang,'units.attackHint')
                  : moveMode ? t(lang,'units.destinationHint') :
                    (lang==='ja'?'選択した師団にまとめて命令できます。':'Commands apply to all selected divisions.')}</small>
              </div>}
              <ArmyManagement key={snap.playerCountry + ':' + meta.packId} snap={snap} lang={lang} selectedIds={selectedIds} pending={st.pendingCommands} onSelect={ids => selectUnits(ids)} focus={focusedFormation} onFocus={setFocusedFormation} />
              {snap.fronts.filter(f=>f.owner===snap.playerCountry&&player.atWar.includes(f.enemy)).length>0&&<details className="front-overview" data-testid="front-overview"><summary>{lang==='ja'?'戦線一覧・地図表示':'Front overview'}</summary>
                {snap.fronts.filter(f=>f.owner===snap.playerCountry&&player.atWar.includes(f.enemy)).map(f=>{
                  const members=ownUnits.filter(u=>u.frontId===f.id);
                  const activeProvinces=f.provinces.filter(p=>snap.controller[p]===f.owner);
                  return <div key={f.id} className="move-controls"><span>#{f.id} {t(lang,'front.stance.'+f.stance)} · {f.paused?(lang==='ja'?'停止':'Paused'):''} {members.length}</span>
                    <button data-testid={'select-front-units-'+f.id} disabled={!members.length||members.length>256} onClick={()=>{selectUnits(members.map(u=>u.id),false);setFrontVisibility('selected');if(activeProvinces.length)rendererRef.current?.focusProvince(activeProvinces[0]);}}>{lang==='ja'?'割当師団を選択':'Select assigned'}</button>
                    <button data-testid={'focus-front-'+f.id} disabled={!activeProvinces.length} onClick={()=>{setFrontVisibility('all');rendererRef.current?.focusProvince(activeProvinces[0]);}}>{lang==='ja'?'戦線へ':'Locate front'}</button></div>;
                })}
                <small>{lang==='ja'?'丸印＝戦線州、短線＝陸上隣接、菱形＝目標州、矢印＝作戦目標の概略（実移動経路ではありません）。':'Circle: front province; bar: land adjacency; diamond: target; arrow: schematic objective, not a movement route.'}</small>
              </details>}
              <div className="roster-view-toggle" role="group" aria-label={lang==='ja'?'師団表示方式':'Division roster view'}>
                <button type="button" data-testid="roster-mode-tree" aria-pressed={rosterView==='tree'}
                  onClick={()=>setRosterView('tree')}>{lang==='ja'?'指揮系統':'Hierarchy'}</button>
                <button type="button" data-testid="roster-mode-list" aria-pressed={rosterView==='list'}
                  onClick={()=>setRosterView('list')}>{lang==='ja'?'詳細一覧':'Detailed list'}</button>
              </div>
              {rosterView==='tree'&&<OrderOfBattleExplorer snap={snap} meta={meta} lang={lang}
                selectedIds={selectedIds} onSelect={ids=>selectUnits(ids)} onFocus={setFocusedFormation} />}
              {rosterView==='list'&&<>
              <div className="muted">{t(lang, 'units.hint')}</div>
              <div className="move-controls">
                <input data-testid="roster-query" aria-label={lang==='ja'?'師団・州・軍団の検索':'Search divisions'} placeholder={lang==='ja'?'師団ID・州・軍団名':'ID, province, army'} value={rosterQuery} onChange={e=>setRosterQuery(e.target.value)}/>
                <select data-testid="roster-filter" aria-label={lang==='ja'?'師団の絞り込み':'Division filter'} value={rosterFilter} onChange={e=>setRosterFilter(e.target.value)}>
                  <option value="all">{lang==='ja'?'全師団':'All'}</option><option value="selected">{lang==='ja'?'選択中':'Selected'}</option><option value="unassigned">{lang==='ja'?'軍団未所属':'Unassigned'}</option><option value="lowSupply">{lang==='ja'?'補給50%未満':'Supply below 50%'}</option><option value="deficit">{lang==='ja'?'人員・装備不足':'Manpower/equipment deficit'}</option>
                </select>
                <span data-testid="roster-count">{visibleUnits.length} / {ownUnits.length}</span>
              </div>
              <div className="unit-roster-list">
                {visibleUnits.map(u => <div className="unit-roster-entry" key={u.id}>
                  <input type="checkbox" aria-label={t(lang, 'units.select') + ' #' + u.id} data-testid={'unit-check-' + u.id}
                    checked={selectedIds.includes(u.id)} disabled={!selectedIds.includes(u.id) && chosen.length >= 256}
                    onChange={e => {rosterRangeAnchor.current=u.id;selectUnits(e.target.checked ? [...selectedIds, u.id] : selectedIds.filter(id => id !== u.id), false);}} />
                  <button data-testid={'unit-roster-' + u.id} data-unit-id={u.id} data-location={meta.provIds[u.loc]} aria-pressed={selectedIds.includes(u.id)}
                    onClick={e => handleRosterUnitClick(e,u)}>
                    #{u.id} {u.customTemplateId!==undefined ? (snap.customTemplates.find(t=>t.country===u.owner&&t.templateId===u.customTemplateId&&t.revision===u.customRevision)?.name ?? (lang==='ja'?'独自師団':'Custom division')) : (lang === 'ja' ? divisionTemplate(u.templateId ?? 'standard-v1')?.nameJa : divisionTemplate(u.templateId ?? 'standard-v1')?.nameEn)}<br />
                    {u.armyId !== null && <span>{snap.armies.find(a=>a.id===u.armyId)?.name} · </span>}
                    {u.frontId>=0&&<span>{lang==='ja'?'戦線':'Front'} #{u.frontId} · </span>}{u.manualHold&&<span>{lang==='ja'?'手動優先':'Manual hold'} · </span>}
                    {nameOf(u.loc)} ({meta.provIds[u.loc]}) — {u.inBattle ? t(lang, 'panel.inBattle') : u.encircled ? t(lang, 'panel.encircled') : u.moving ? t(lang, 'misc.movingTo', { target: nameOf(u.target) }) : t(lang, 'units.idle')}
                  </button>
                  <details className="unit-resources-details"><summary>{lang === 'ja' ? '装備・補給' : 'Equipment & supply'}</summary><DivisionResources unit={u} lang={lang}/></details>
                </div>)}
                {!visibleUnits.length && <span className="muted">{ownUnits.length ? (lang==='ja'?'該当師団なし':'No matching divisions') : t(lang, 'units.none')}</span>}
              </div>
              </>}
              <div className="move-controls">
                <span data-testid="selected-unit-count">{t(lang, 'units.selected', { count: chosen.length })}</span>
                <button data-testid="move-selected" disabled={!canRedirect} aria-pressed={moveMode} onClick={toggleMoveSelection}>{moveMode?t(lang,'units.cancelMove'):hasMoving?(lang==='ja'?'移動先変更':'Redirect'):t(lang,'units.move')}</button>
                <button data-testid="halt-selected" disabled={!canControl} onClick={haltSelection}>{lang==='ja'?'停止・待機':'Halt / hold'}</button>
                <button data-testid="open-selected-fronts" disabled={!chosen.length} onClick={()=>appStore.set({panel:'fronts'})}>{lang==='ja'?'戦線へ割当':'Assign to front'}</button>
                <button data-testid="resume-selected-automation" disabled={st.pendingCommands>0||!chosen.some(u=>u.manualHold)} onClick={()=>engineClient.command('setManualHold',{units:chosen.map(u=>u.id),hold:false})}>{lang==='ja'?'自動配置に復帰':'Resume automation'}</button>
                <button data-testid="attack-selected" className="danger" disabled={!canMove || !attackTargets.length} aria-pressed={attackMode} onClick={toggleAttackSelection}>{t(lang, attackMode ? 'units.cancelAttack' : 'units.attack')}</button>
                {chosen.length > 0 && <button data-testid="focus-unit" onClick={() => rendererRef.current?.focusProvince(chosen[0].loc)}>{t(lang, 'units.focus')}</button>}
              </div>
              {attackMode && <div role="status" data-testid="attack-hint">{t(lang, 'units.attackHint')}</div>}
              {chosen.length > 0 && canMove && attackTargets.length === 0 && <div className="muted">{t(lang, 'units.attackInvalid')}</div>}
              {moveMode && <div role="status" data-testid="move-hint">{t(lang, 'units.destinationHint')}</div>}
              {chosen.length > 0 && !canControl && <div className="muted">{t(lang, 'units.busy')}</div>}
              {hasMoving && <div className="muted" data-testid="movement-edit-hint">{lang==='ja'?'停止・移動先変更は進行済み区間の到着後に反映されます。戦闘中の撤退命令とは異なります。':'Halt and redirect preserve a started segment. This is not retreat from battle.'}</div>}
              {chosen.length > 0 && <div className="move-controls">
                <select data-testid="move-destination" aria-label={t(lang, 'units.destination')} value={destination} onChange={e => setDestination(e.target.value)}>
                  <option value="">{t(lang, 'units.destination')}</option>
                  {meta.provIds.map((id, i) => (attackMode ? attackTargets.includes(i) : !player.atWar.includes(snap.controller[i])) && <option key={id} value={i}>{nameOf(i)} ({id})</option>)}
                </select>
                {attackMode ? <button className="danger" data-testid="confirm-attack" disabled={!canMove || destination === '' || !attackTargets.includes(Number(destination))} onClick={() => sendAttack(Number(destination))}>{t(lang, 'units.attack')}</button> : <button data-testid="confirm-move" disabled={!canRedirect || destination === '' || chosen.every(u => !u.moving && u.loc === Number(destination))} onClick={() => sendMove(Number(destination))}>{hasMoving?(lang==='ja'?'移動先変更':'Redirect'):t(lang,'units.move')}</button>}
              </div>}
            </>}
          </section>
          <ContextPanel />
          <PortDirectory meta={meta} snap={snap} lang={lang}
            selectedProvince={selProv} onSelect={chooseProvince}/>
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
      <ArmyCommandDock snap={snap} lang={lang} selectedIds={selectedIds}
        selectedProvince={selProv} provinceNames={lang==='ja'?meta.provNameJa:meta.provNameEn}
        portProvinces={meta.maritime?.ports.map(p=>p.province)??[]}
        pending={st.pendingCommands} focus={focusedFormation}
        onFocus={setFocusedFormation}
        onSelect={ids=>selectUnits(ids,false)}
        onDrawFront={startFrontDraft}
        onDrawObjective={frontId=>{startFrontTarget();setFrontTargetId(frontId);}}
      />
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
