// イベントシステム（phase2-events-basic）— パック定義の宣言的イベントを日次照合・適用する。
// 発火はジャーナルへ記録（issuer=event）。once指定は1回のみ。照合順は定義順で決定論。
import { allocateAiSequence } from '../core/sequence';
import { addAlert, atWar, type WorldState } from '../core/state';
import { registerSystem, getSystems } from '../core/scheduler';
import { daysFromCivil } from '../clock/date';
import type { EventDef, Pack } from '../scenario/types';

export type { EventDef, EventEffect, EventTrigger } from '../scenario/types';

function resolveCountry(w: WorldState, id: string | undefined): number {
  if (!id) return -1;
  return w.countries.id.indexOf(id);
}

function triggerMatches(w: WorldState, def: EventDef): boolean {
  const t = def.trigger;
  switch (t.type) {
    case 'date': {
      const day = w.epochDays + w.tick;
      const target = daysFromCivil(t.y ?? 1, t.m ?? 1, t.d ?? 1);
      return day === target;
    }
    case 'warStart': {
      for (const war of w.wars) {
        if (war.status === 'ended') continue;
        if (w.runtime.seenWars.has(war.id)) continue;
        w.runtime.seenWars.add(war.id);
        if (!t.countries || t.countries.length === 0) return true;
        const ag = w.countries.id[war.aggressor];
        const df = w.countries.id[war.defender];
        if (t.countries.includes(ag) || t.countries.includes(df)) return true;
      }
      return false;
    }
    case 'provinceOccupied': {
      // 直近1tickで占領アラートが出た州を照合
      const want = t.province ? w.prov.id.indexOf(t.province) : -1;
      for (const a of w.runtime.alerts) {
        if (a.tick === w.tick && a.kind === 'provinceOccupied' && (want < 0 || a.province === want)) return true;
      }
      return false;
    }
    case 'stockBelow': {
      const c = resolveCountry(w, t.country);
      if (c < 0 || !w.countries.alive[c]) return false;
      const amount = t.amount ?? 0;
      if (t.good === 'infEquipment') return w.countries.infEquipmentStock[c] < amount;
      if (t.good === 'artEquipment') return w.countries.artEquipmentStock[c] < amount;
      if (t.good === 'manpower') return w.countries.manpowerPool[c] < amount;
      return false;
    }
    case 'commandDone': {
      // phase3-tutorial: プレイヤーの直近ジャーナルに type一致 かつ ok がある
      // 直列化: after指定があれば先行ガイドが全て発火済みであること
      for (const after of t.after ?? []) {
        if (!w.firedEvents.includes(after)) return false;
      }
      const cmdType = t.command;
      if (!cmdType) return true;
      return w.journal.some((j) => j.issuer === 'player' && j.type === cmdType && j.ok);
    }
  }
}

function applyEffects(w: WorldState, def: EventDef): void {
  for (const e of def.effects) {
    switch (e.type) {
      case 'relation': {
        const a = resolveCountry(w, e.a);
        const b = resolveCountry(w, e.b);
        if (a >= 0 && b >= 0) {
          const existing = w.relations.find((r) => r.a === Math.min(a, b) && r.b === Math.max(a, b));
          if (existing) existing.v = Math.max(-100, Math.min(100, existing.v + (e.delta ?? 0)));
          else w.relations.push({ a: Math.min(a, b), b: Math.max(a, b), v: e.delta ?? 0 });
        }
        break;
      }
      case 'equipment': {
        const c = resolveCountry(w, e.country);
        if (c >= 0 && w.countries.alive[c]) {
          if (e.good === 'artEquipment') w.countries.artEquipmentStock[c] += e.amount ?? 0;
          else w.countries.infEquipmentStock[c] += e.amount ?? 0;
        }
        break;
      }
      case 'manpower': {
        const c = resolveCountry(w, e.country);
        if (c >= 0 && w.countries.alive[c]) w.countries.manpowerPool[c] += e.amount ?? 0;
        break;
      }
      case 'alert': {
        addAlert(w, {
          kind: 'battleEnded', // 情報系アラート（kindはUIでmsgKey優先表示）
          priority: e.priority ?? 3,
          msgKey: 'event.' + def.id,
          params: { ja: e.msgJa ?? '', en: e.msgEn ?? '' },
        });
        break;
      }
      case 'declareWarAI': {
        const ag = resolveCountry(w, e.aggressor);
        const df = resolveCountry(w, e.defender);
        if (ag >= 0 && df >= 0 && ag !== df && w.countries.alive[ag] && w.countries.alive[df]) {
          if (!atWar(w, ag, df)) {
            w.runtime.commandsSinceLastTick.push({
              issuer: 'ai:' + ag,
              seq: allocateAiSequence(w, 'ai:' + ag),
              type: 'declareWar',
              p: { defender: df },
            });
          }
        }
        break;
      }
    }
  }
}

export function registerEventsSystem(defs: EventDef[]): void {
  if (defs.length === 0) return;
  // グローバルレジストリの冪等性（同一プロセスで複数エンジン生成時は既存の登録を再利用）
  if (getSystems().some((s) => s.name === 'events')) return;
  registerSystem({
    name: 'events',
    cadence: 'daily',
    fn: (w) => {
      for (const def of defs) {
        if (def.once !== false && w.firedEvents.includes(def.id)) continue;
        if (triggerMatches(w, def)) {
          applyEffects(w, def);
          // 発火履歴は常に記録（once判定はonce:trueのみfiredEventsで阻止）
          w.firedEvents.push(def.id);
          w.journal.push({ issuer: 'event', seq: w.runtime.eventSeq++, type: 'fireEvent', ok: true, tick: w.tick });
          if (w.journal.length > 400) {
            w.journal.shift();
            w.journalStart++;
          }
        }
      }
    },
  });
}

export function extractPackEvents(pack: Pack): EventDef[] {
  return (pack.events ?? []) as EventDef[];
}
