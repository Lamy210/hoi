// 外交システム（phase4-diplomacy-treaties）。週次: 条約期限切れ・関係値ドリフト。
import type { WorldState } from '../core/state';
import { registerSystem } from '../core/scheduler';
import { tickDiplomacyWeekly } from '../diplomacy/treaties';

export function registerDiplomacySystem(): void {
  registerSystem({
    name: 'diplomacy',
    cadence: 'weekly',
    fn: (w: WorldState) => {
      tickDiplomacyWeekly(w);
    },
  });
}
