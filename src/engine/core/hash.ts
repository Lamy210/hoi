// 状態ハッシュ（アンカー・セーブ整合検証）— docs/08 §4。
// 全ストアを固定順で走査し、f64のビット列を決定論的に混合する。
// 派生キャッシュ（runtime）は対象外（INV-8: 復元後に再計算される）。

import { encode } from '@msgpack/msgpack';
import { mixBool, mixFloat, mixInt, mixStr } from './rng';
import type { Unit, WorldState } from './state';

function hashUnit(h: number, u: Unit): number {
  h = mixInt(h, u.id);
  h = mixInt(h, u.owner);
  h = mixInt(h, u.loc);
  for (const p of u.path) h = mixInt(h, p);
  h = mixInt(h, u.segIdx);
  h = mixFloat(h, u.segProgress);
  h = mixFloat(h, u.segDays);
  h = mixFloat(h, u.manpower);
  h = mixFloat(h, u.maxManpower);
  h = mixFloat(h, u.infEquipment);
  h = mixFloat(h, u.maxInfEquipment);
  h = mixFloat(h, u.artEquipment);
  h = mixFloat(h, u.maxArtEquipment);
  h = mixFloat(h, u.org);
  h = mixFloat(h, u.exp);
  h = mixInt(h, u.frontId);
  h = mixInt(h, u.commanderId);
  h = mixBool(h, u.encircled);
  h = mixBool(h, u.destroyed);
  if (u.templateId !== undefined) h = mixStr(h, u.templateId);
  return h;
}

export function hashWorld(w: WorldState, legacy = false, includeHierarchy = true, includeFrontControl = true, includeFormationCommanders = true): number {
  let h = 0x811c9dc5;
  h = mixInt(h, w.seed);
  h = mixInt(h, w.difficulty);
  h = mixInt(h, w.tick);
  h = mixInt(h, w.epochDays);
  h = mixInt(h, w.daysPerMonth);

  const p = w.prov;
  h = mixInt(h, p.count);
  for (let i = 0; i < p.count; i++) {
    h = mixStr(h, p.id[i]);
    h = mixInt(h, p.owner[i]);
    h = mixInt(h, p.controller[i]);
    h = mixInt(h, p.terrain[i]);
    h = mixInt(h, p.infra[i]);
    h = mixFloat(h, p.population[i]);
    h = mixInt(h, Math.round(w.occupancyTimer[i]));
    h = mixInt(h, w.occupierCandidate[i]);
  }

  h = mixInt(h, w.adj.offsets.length);
  for (let i = 0; i < w.adj.targets.length; i++) {
    h = mixInt(h, w.adj.targets[i]);
    h = mixFloat(h, w.adj.km[i]);
  }

  const c = w.countries;
  h = mixInt(h, c.count);
  for (let i = 0; i < c.count; i++) {
    h = mixInt(h, c.capital[i]);
    h = mixFloat(h, c.manpowerPool[i]);
    h = mixFloat(h, c.infEquipmentStock[i]);
    h = mixFloat(h, c.artEquipmentStock[i]);
    h = mixBool(h, c.alive[i]);
  }

  for (const cl of w.claims) {
    h = mixInt(h, cl.country);
    h = mixInt(h, cl.province);
  }
  for (const r of w.relations) {
    h = mixInt(h, r.a);
    h = mixInt(h, r.b);
    h = mixFloat(h, r.v);
  }
  // 条約（phase4-diplomacy-treaties）
  for (const t of w.treaties) {
    h = mixInt(h, t.id);
    h = mixStr(h, t.type);
    h = mixInt(h, t.a);
    h = mixInt(h, t.b);
    h = mixInt(h, t.startTick);
    h = mixInt(h, t.expiryTick);
    h = mixStr(h, t.status);
    h = mixInt(h, t.proposer);
  }
  for (const war of w.wars) {
    h = mixInt(h, war.id);
    h = mixInt(h, war.aggressor);
    h = mixInt(h, war.defender);
    h = mixInt(h, war.status === 'active' ? 0 : war.status === 'peaceOffered' ? 1 : 2);
    h = mixBool(h, war.cb);
    h = mixInt(h, war.offeredBy);
    h = mixStr(h, String(war.offerType));
    // 戦争貢献度（phase4-peace-conference）。数値キーは昇順で走査されるため決定論
    const contribKeys = Object.keys(war.contrib ?? {}).sort((x, y) => Number(x) - Number(y));
    for (const k of contribKeys) {
      h = mixInt(h, Number(k));
      h = mixFloat(h, war.contrib[Number(k)] ?? 0);
    }
  }
  for (const f of w.fronts) {
    h = mixInt(h, f.id);
    h = mixInt(h, f.owner);
    h = mixInt(h, f.enemy);
    h = mixStr(h, f.stance);
    for (const p of f.provinces) h = mixInt(h, p);
    for (const t of f.targets) h = mixInt(h, t);
    h = mixInt(h, f.cap);
  }
  for (const c of w.commanders) {
    h = mixInt(h, c.id);
    h = mixInt(h, c.country);
    h = mixStr(h, c.nameJa);
    h = mixInt(h, c.skill);
    h = mixInt(h, c.trait);
    h = mixInt(h, c.assignedUnit);
    h = mixFloat(h, c.exp);
  }
  for (const sh of w.productionShare) h = mixFloat(h, sh);
  for (const e of w.firedEvents) h = mixStr(h, e);
  for (const t of w.treasury) h = mixFloat(h, t);
  h = mixFloat(h, w.householdPool);
  for (const r of w.taxRate) h = mixFloat(h, r);
  for (const e of w.budgetEdu) h = mixFloat(h, e);
  for (const g of w.gdp) h = mixFloat(h, g);
  for (const l of w.livingStandard) h = mixFloat(h, l);
  for (const l of w.literacy) h = mixFloat(h, l);
  for (const l of w.unemployment) h = mixFloat(h, l);
  for (const l of w.supportRate) h = mixFloat(h, l);
  for (const l of w.stability) h = mixFloat(h, l);
  for (const p2 of w.pp) h = mixFloat(h, p2);
  for (const lw of w.laws) {
    h = mixInt(h, lw.conscription);
    h = mixInt(h, lw.economy);
  }
  for (const q of w.lawQueue) {
    if (q) {
      h = mixStr(h, q.slot);
      h = mixInt(h, q.target);
      h = mixInt(h, q.startTick);
    } else {
      h = mixInt(h, -1);
    }
  }
  for (const r of w.research) {
    for (const a of r.active) {
      h = mixStr(h, a.id);
      h = mixFloat(h, a.progress);
    }
    for (const d of r.done) h = mixStr(h, d);
  }
  for (const pr of w.constructionQueue) {
    h = mixInt(h, pr.id);
    h = mixInt(h, pr.prov);
    h = mixStr(h, pr.type);
    h = mixFloat(h, pr.costPaid);
    h = mixFloat(h, pr.daysProgress);
    h = mixBool(h, pr.paused);
  }
  for (const f of w.foodStock) h = mixFloat(h, f);
  for (const c of w.consumerStock) h = mixFloat(h, c);
  for (const row of w.prices) for (const v of row) h = mixFloat(h, v);
  for (let c = 0; c < w.countries.count; c++) h = mixFloat(h, w.countries.population[c]);
  for (let p3 = 0; p3 < w.prov.count; p3++) h = mixFloat(h, w.prov.population[p3]);
  h = mixInt(h, w.nextConstructionId);
  h = mixInt(h, w.nextTreatyId);
  for (const u of w.units) h = hashUnit(h, u);
  for (const o of w.trainingQueue) {
    h = mixInt(h, o.id); h = mixInt(h, o.country); h = mixInt(h, o.province);
    h = mixStr(h, o.templateId); h = mixInt(h, o.readyTick);
  }

  for (const a of w.anchors) {
    h = mixInt(h, a.tick);
    h = mixInt(h, a.hash);
  }
  for (const j of w.journal) {
    h = mixStr(h, j.issuer);
    h = mixInt(h, j.seq);
    h = mixStr(h, j.type);
    h = mixBool(h, j.ok);
    if (j.reason) h = mixStr(h, j.reason);
  }
  h = mixInt(h, w.nextUnitId);
  h = mixInt(h, w.nextWarId);
  h = mixInt(h, w.nextAlertId);
  h = mixInt(h, w.nextFrontId);
  h = mixInt(h, w.nextCommanderId);
  const rngKeys = Object.keys(w.rng).sort();
  for (const k of rngKeys) {
    const s = w.rng[k];
    h = mixStr(h, k);
    h = mixInt(h, s.sHi);
    h = mixInt(h, s.sLo);
    h = mixInt(h, s.iHi);
    h = mixInt(h, s.iLo);
  }
  if (!legacy) {
    h = mixStr(h, 'command-state-v6');
    for (const key of Object.keys(w.commandWatermarks).sort()) {
      h = mixStr(h, key); h = mixFloat(h, w.commandWatermarks[key]);
    }
    for (const key of Object.keys(w.runtime.aiSeq).sort()) {
      h = mixStr(h, key); h = mixFloat(h, w.runtime.aiSeq[Number(key)]);
    }
    h = mixFloat(h, w.runtime.eventSeq);
    for (const id of [...w.runtime.seenWars].sort((a,b) => a-b)) h = mixFloat(h, id);
    const pending = encode(w.runtime.commandsSinceLastTick);
    h = mixInt(h, pending.length);
    for (const byte of pending) h = mixInt(h, byte);
  }
  if (!legacy && includeHierarchy) {
    h = mixStr(h, 'hierarchy-v7');
    h = mixFloat(h, w.nextArmyId); h = mixFloat(h, w.nextArmyGroupId);
    for (const g of w.armyGroups) { h = mixFloat(h,g.id); h = mixInt(h,g.owner); h = mixStr(h,g.name); h = mixStr(h,g.color); }
    for (const a of w.armies) { h = mixFloat(h,a.id); h = mixInt(h,a.owner); h = mixStr(h,a.name); h = mixStr(h,a.color); h = mixFloat(h,a.groupId ?? 0); }
    for (const u of w.units) h = mixFloat(h,u.armyId ?? 0);
  }
  if (!legacy && includeHierarchy && includeFrontControl) {
    h = mixStr(h, 'front-control-v8');
    for (const f of w.fronts) { h = mixBool(h, f.paused ?? false); h = mixFloat(h, f.revision ?? 1); }
    for (const u of w.units) h = mixBool(h, u.manualHold ?? false);
  }
  if(!legacy&&includeHierarchy&&includeFrontControl&&includeFormationCommanders){
    h=mixStr(h,'formation-commanders-v9');
    for(const a of w.armies)h=mixFloat(h,a.commanderId??-1);
    for(const g of w.armyGroups)h=mixFloat(h,g.commanderId??-1);
  }
  return h >>> 0;
}
