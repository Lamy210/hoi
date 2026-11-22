// エンジンファサード — UI/Worker/Nodeテストから共通で使う操作面。
// 決定論: stepTickの内部順序は固定（コマンド適用→tick進行→日次→週次→月次）。
import { applyCommands } from './core/command';
import { registerAllCommands } from './commands';
import { hashWorld } from './core/hash';
import { daysFromCivil, civilFromDays } from './clock/date';
import { monthlyOffset, registerSystem, runDailySystems, runMonthlySystems, runWeeklySystems } from './core/scheduler';
import { registerAllSystems } from './systems';
import { buildWorld, WorldBuildError } from './scenario/build';
import { serializeWorld, deserializeWorld } from './save/serialize';
import { buildUiMeta, buildUiSnapshot, type UiMeta, type UiSnapshot } from './ui';
import { ORG_REGEN_BASE, unitCombatTrace, type PowerContrib } from './systems/combat';
import { SUPPLY_RADIUS_KM, dijkstraFrom } from './systems/logistics';
import { registerEventsSystem } from './systems/events';
import { setTechDefs } from './systems/research';
import { setEquipmentModels } from './military/equipmentCatalog';
import { relationContributors } from './diplomacy/treaties';
import { getRelation } from './core/state';
import type { Pack } from './scenario/types';
import type { WorldState } from './core/state';

let systemsReady = false;

function ensureSystemsRegistered(): void {
  if (systemsReady) return;
  systemsReady = true;
  registerAllSystems();
  registerAllCommands();
  registerSystem({
    name: 'anchors',
    cadence: 'monthly',
    fn: (w: WorldState) => {
      w.anchors.push({ tick: w.tick, hash: hashWorld(w) });
    },
  });
  // 月次offsetがハッシュ派生でもdaysPerMonth未満に収まるよう名前を短く固定
  void monthlyOffset('anchors', 30);
}

export interface TraceRequest {
  kind: 'unitCombat' | 'unitOrgRegen' | 'provinceSupply' | 'relationTrace';
  id: number;
}

export interface TraceResult {
  title: string;
  contribs: PowerContrib[];
  note?: string;
}

export interface Engine {
  readonly pack: Pack;
  readonly world: WorldState;
  stepTick(): void;
  queuePlayerCommand(seq: number, cmdType: string, p: Record<string, unknown>): void;
  getUiSnapshot(sinceAlertId: number): UiSnapshot;
  getUiMeta(): UiMeta;
  trace(req: TraceRequest): TraceResult | null;
  serialize(): Uint8Array;
  loadFrom(buf: Uint8Array): { ok: boolean; violations: string[] };
}

export interface CreateEngineOptions {
  seed: number;
  playerCountryId: string;
  difficulty: 0 | 1 | 2;
}

export function createEngine(pack: Pack, opts: CreateEngineOptions): Engine {
  ensureSystemsRegistered();
  // パック同梱のイベントと技術（冪等登録）
  registerEventsSystem(pack.events ?? []);
  setTechDefs(pack.techs ?? []);
  setEquipmentModels(pack.equipmentModels ?? []);
  const world = buildWorld(pack, opts);
  world.epochDays = daysFromCivil(pack.manifest.epoch[0], pack.manifest.epoch[1], pack.manifest.epoch[2]);

  const engine: Engine = {
    pack,
    world,
    stepTick() {
      // 1) コマンド適用（tick境界・FIFO・INV-6）
      applyCommands(world, world.runtime.commandsSinceLastTick);
      world.runtime.commandsSinceLastTick = [];
      // 2) 時間進行
      world.tick++;
      // 3) 日次・週次・月次システム（各システムが自分のoffset判定を行う）
      runDailySystems(world);
      runWeeklySystems(world);
      runMonthlySystems(world);
    },
    queuePlayerCommand(seq, cmdType, p) {
      world.runtime.commandsSinceLastTick.push({ issuer: 'player', seq, type: cmdType, p });
    },
    getUiSnapshot(sinceAlertId) {
      return buildUiSnapshot(world, sinceAlertId);
    },
    getUiMeta() {
      return buildUiMeta(world, pack);
    },
    trace(req) {
      const w = world;
      if (req.kind === 'unitCombat') {
        const r = unitCombatTrace(w, req.id);
        if (!r) return null;
        const u = w.units.find((x) => x.id === req.id);
        if (!u) return null;
        return { title: '師団戦闘力', contribs: r.contribs, note: '乱数: ' + r.roll };
      }
      if (req.kind === 'unitOrgRegen') {
        const u = w.units.find((x) => x.id === req.id && !x.destroyed);
        if (!u) return null;
        const eff = w.runtime.supplyEff[u.loc];
        return {
          title: '組織率回復/日',
          contribs: [
            { label: 'base', value: ORG_REGEN_BASE, formula: 'base=3' },
            { label: 'supply', value: Math.round((0.2 + 0.8 * eff) * 1000) / 1000, formula: '0.2+0.8×supplyEff' },
          ],
          note: '戦闘中・包囲中は回復しない',
        };
      }
      if (req.kind === 'provinceSupply') {
        const p = req.id;
        const ctrl = w.prov.controller[p];
        if (ctrl < 0 || !w.countries.alive[ctrl]) return null;
        const cap = w.countries.capital[ctrl];
        const dist = dijkstraFrom(w, ctrl, cap);
        const d = dist[p];
        const eff = w.runtime.supplyEff[p];
        const lostCapital = w.prov.controller[cap] !== ctrl;
        return {
          title: '補給効率: ' + (w.prov.nameJa[p] || w.prov.nameEn[p]),
          contribs: [
            { label: '首都までの距離', value: Math.round(d), formula: 'Dijkstra(km)=' + Math.round(d) },
            { label: '補給半径', value: SUPPLY_RADIUS_KM, formula: 'radius=' + SUPPLY_RADIUS_KM + 'km' },
            { label: 'eff', value: eff, formula: 'max(0, 1−dist/radius)' },
          ],
          note: lostCapital ? '首都が占領されているため減衰0.3を適用' : '距離減衰 × ハブ容量（capacityFactor）',
        };
      }
      if (req.kind === 'relationTrace') {
        // 多要素関係値のトレース（phase4-diplomacy-treaties）。id=相手国インデックス
        const other = req.id;
        const me = w.playerCountry;
        if (other < 0 || other >= w.countries.count || other === me) return null;
        const { contribs, target } = relationContributors(w, me, other);
        return {
          title: '関係値: ' + (w.countries.nameJa[other] || w.countries.nameEn[other]),
          contribs: [
            { label: '現在値', value: getRelation(w, me, other), formula: '週次ドリフトで目標へ漸近' },
            { label: 'イデオロギー距離', value: contribs.ideologyDist, formula: '−|経済法diff|×10−|徴兵法diff|×5' },
            { label: '脅威認知', value: -contribs.threat, formula: '−軍事力比×国境近接×40' },
            { label: '経済相互依存', value: contribs.interdependence, formula: '貿易協定+15' },
            { label: '共通脅威', value: contribs.commonThreat, formula: '共通の敵+10' },
            { label: '領土紛争', value: -contribs.claimsConflict, formula: '−領有主張×10（上限30）' },
            { label: '条約ボーナス', value: contribs.treatyBonus, formula: '不可侵+15 同盟+25 貿易+10 通行+12' },
            { label: '戦争ペナルティ', value: -contribs.warPenalty, formula: '−80' },
            { label: '目標値', value: target, formula: 'clamp(Σcontributors, −100, 100)' },
          ],
          note: '週±2で目標値へドリフト（D-041）',
        };
      }
      return null;
    },
    serialize() {
      return serializeWorld(world, pack);
    },
    loadFrom(buf) {
      const r = deserializeWorld(buf, pack);
      if (!r.world) return { ok: false, violations: r.violations };
      // worldを差し替え（Engineはworld参照を持つためプロパティ复制で置換）
      Object.assign(world, r.world);
      // runtimeは新worldのもの（Object.assignで上書き済み）
      return { ok: true, violations: [] };
    },
  };
  return engine;
}

export { WorldBuildError };
export { civilFromDays };
