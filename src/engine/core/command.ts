// コマンドパイプライン — 全ての状態変更はコマンド経由（INV-3）。
// 検証→適用→ジャーナル。uid（issuer,seq）による二重適用防止（INV-6）。

import type { Cmd, WorldState } from './state';
import { addAlert } from './state';
import { commandIssuerKey, validSequence } from './sequence';

export interface Handler {
  /** 現状態に対する妥当性検査。違反理由を返す（null=有効）。副作用を持たないこと。 */
  validate(w: WorldState, p: Record<string, unknown>, issuer: string): string | null;
  /** 状態変更。validate通過後のみ呼ばれる。 */
  apply(w: WorldState, p: Record<string, unknown>, issuer: string): void;
}

const registry = new Map<string, Handler>();

export function registerCommand(type: string, h: Handler): void {
  if (registry.has(type)) throw new Error('command already registered: ' + type);
  registry.set(type, h);
}

export interface ApplyResult {
  issuer: string;
  seq: number;
  type: string;
  ok: boolean;
  reason?: string;
}

const JOURNAL_CAP = 400;

function pushJournal(w: WorldState, e: import('./state').JournalEntry): void {
  w.journal.push(e);
  if (w.journal.length > JOURNAL_CAP) {
    w.journal.shift();
    w.journalStart++;
  }
}

/** コマンド列をFIFOで適用する。未知タイプ・二重uid・検証違反は適用せず却下を記録する。 */
export function applyCommands(w: WorldState, cmds: Cmd[]): ApplyResult[] {
  const results: ApplyResult[] = [];
  for (const cmd of cmds) {
    if (commandIssuerKey(cmd.issuer, w.countries.count) === null || !validSequence(cmd.seq)) {
      results.push({ issuer: cmd.issuer, seq: cmd.seq, type: cmd.type, ok: false, reason: 'badSequence' });
      continue;
    }
    if (cmd.seq <= (w.commandWatermarks[cmd.issuer] ?? 0)) {
      results.push({ issuer: cmd.issuer, seq: cmd.seq, type: cmd.type, ok: false, reason: 'duplicateCommand' });
      continue;
    }
    // Rejected commands also consume their sequence; a replay must not become valid later.
    w.commandWatermarks[cmd.issuer] = cmd.seq;
    const h = registry.get(cmd.type);
    if (!h) {
      pushJournal(w, { issuer: cmd.issuer, seq: cmd.seq, type: cmd.type, ok: false, reason: 'unknownCommand', tick: w.tick });
      results.push({ issuer: cmd.issuer, seq: cmd.seq, type: cmd.type, ok: false, reason: 'unknownCommand' });
      continue;
    }
    let reason: string | null = null;
    try {
      reason = h.validate(w, cmd.p, cmd.issuer);
    } catch (err) {
      reason = 'validateError:' + String(err);
    }
    if (reason !== null) {
      pushJournal(w, { issuer: cmd.issuer, seq: cmd.seq, type: cmd.type, ok: false, reason, tick: w.tick });
      if (cmd.issuer === 'player') {
        addAlert(w, { kind: 'commandRejected', priority: 3, msgKey: 'alert.commandRejected', params: { reason } });
      }
      results.push({ issuer: cmd.issuer, seq: cmd.seq, type: cmd.type, ok: false, reason });
      continue;
    }
    h.apply(w, cmd.p, cmd.issuer);
    pushJournal(w, { issuer: cmd.issuer, seq: cmd.seq, type: cmd.type, ok: true, tick: w.tick });
    results.push({ issuer: cmd.issuer, seq: cmd.seq, type: cmd.type, ok: true });
  }
  return results;
}

/** issuerが発行可能な国家を検証するヘルパ（'player' または 'ai:<id>'） */
export function issuerCountry(issuer: string): number | null {
  if (issuer === 'player') return 0; // プレイヤー国家は world.countries.player で別途照合
  if (issuer.startsWith('ai:')) {
    const n = Number(issuer.slice(3));
    return Number.isInteger(n) ? n : null;
  }
  return null;
}
