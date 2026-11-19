import type { WorldState } from './state';

export function commandIssuerKey(issuer: unknown, countryCount: number): number | null {
  if (issuer === 'player') return -2;
  if (issuer === 'frontai') return -1;
  if (typeof issuer !== 'string' || !/^ai:(0|[1-9][0-9]*)$/.test(issuer)) return null;
  const n = Number(issuer.slice(3));
  return Number.isSafeInteger(n) && n < countryCount ? n : null;
}
export function validSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
export function nextSequence(last: number): number {
  const next = last + 1;
  if (!validSequence(next)) throw new Error('command sequence exhausted');
  return next;
}
export function allocateAiSequence(w: WorldState, issuer: string): number {
  const key = commandIssuerKey(issuer, w.countries.count);
  if (key === null || key === -2) throw new Error('invalid AI issuer');
  const seq = nextSequence(Math.max(w.runtime.aiSeq[key] ?? 0, w.commandWatermarks[issuer] ?? 0));
  w.runtime.aiSeq[key] = seq;
  return seq;
}

/** Older versions omitted pending orders, so the issued AI counter is the safe lower bound. */
export function legacyWatermarks(w: WorldState): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of w.journal) {
    if (commandIssuerKey(entry.issuer, w.countries.count) !== null && validSequence(entry.seq)) {
      result[entry.issuer] = Math.max(result[entry.issuer] ?? 0, entry.seq);
    }
  }
  for (const [key, seq] of Object.entries(w.runtime.aiSeq)) {
    const issuer = key === '-1' ? 'frontai' : 'ai:' + key;
    if (commandIssuerKey(issuer, w.countries.count) !== null && validSequence(seq))
      result[issuer] = Math.max(result[issuer] ?? 0, seq);
  }
  return result;
}
