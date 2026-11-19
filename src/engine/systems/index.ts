// システムの登録順（tick内実行順の単一の真実源・docs/06 §5）
import { registerLogisticsSystems } from './logistics';
import { registerCombatSystems } from './combat';
import { registerTrainingSystem } from './training';
import { registerProductionSystem } from './production';
import { registerAISystem } from '../ai/ai';
import { registerFrontSystem } from './fronts';
import { registerCommanderGrowthSystem } from '../military/commanders';
import { registerEconomySystems } from './economy';
import { registerPopulationSystem } from './population';
import { registerPoliticsSystem } from './politics';
import { registerResearchSystem } from './research';
import { registerConstructionSystem } from './construction';
import { registerDiplomacySystem } from './diplomacy';
import { registerScoreSystem } from './score';

let registered = false;

/** 週次/monthlyシステムを含む全システムを登録する（1回のみ） */
export function registerAllSystems(): void {
  if (registered) return;
  registered = true;
  // 日次: 補給（dirty/週次再計算）→ 戦闘（内訳: 移動→戦闘→占領→損耗→併合判定）→ 生産
  registerLogisticsSystems();
  registerCombatSystems();
  registerProductionSystem();
  registerTrainingSystem();
  // 日次+週内分散: 戦線AI（プレイヤー戦線とAI戦線に同一ロジック）
  registerFrontSystem();
  // phase3: 経済・人口・政治・研究・建設・スコア
  registerEconomySystems();
  registerPopulationSystem();
  registerPoliticsSystem();
  registerResearchSystem();
  registerConstructionSystem();
  // phase4-diplomacy-treaties: 週次の条約期限・関係値ドリフト（スコアより前に実行）
  registerDiplomacySystem();
  registerScoreSystem();
  // 週次: AI思考（国家分散）
  registerAISystem();
  // 月次: 指揮官スキル成長。アンカーはengine.tsが直接登録
  registerCommanderGrowthSystem();
}
