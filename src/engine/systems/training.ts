import { addAlert, type WorldState, type Unit } from '../core/state';
import { registerSystem } from '../core/scheduler';
import { autoAssignCommander } from '../military/commanders';
import { divisionTemplate, type TrainingOrder } from '../military/templates';

export function refundTraining(w: WorldState, order: TrainingOrder): void {
  if (!w.countries.alive[order.country]) return;
  const t = divisionTemplate(order.templateId)!;
  w.countries.manpowerPool[order.country] += t.manpower;
  w.countries.infEquipmentStock[order.country] += t.infantry;
  w.countries.artEquipmentStock[order.country] += t.artillery;
}

export function tickTraining(w: WorldState): void {
  const remaining: TrainingOrder[] = [];
  for (const order of w.trainingQueue) {
    const c = order.country, p = order.province;
    if (!w.countries.alive[c] || w.prov.controller[p] !== c) {
      refundTraining(w, order);
      continue;
    }
    if (w.tick < order.readyTick) { remaining.push(order); continue; }
    const t = divisionTemplate(order.templateId)!;
    const unit: Unit = {
      id: order.id, owner: c, loc: p, templateId: t.id, path: [], segIdx: 0, segProgress: 0, segDays: 0,
      manpower: t.manpower, maxManpower: t.manpower,
      infEquipment: t.infantry, maxInfEquipment: t.infantry,
      artEquipment: t.artillery, maxArtEquipment: t.artillery,
      org: 50, exp: 0, frontId: -1, commanderId: -1, encircled: false, destroyed: false,
    };
    w.units.push(unit);
    autoAssignCommander(w, unit);
    addAlert(w, { kind: 'unitCreated', priority: 2, msgKey: 'alert.unitCreated',
      params: { where: w.prov.nameJa[p] || w.prov.nameEn[p] }, actor: c, province: p });
  }
  w.trainingQueue = remaining;
}

export function registerTrainingSystem() {
  registerSystem({ name: 'training', cadence: 'daily', fn: tickTraining });
}
